#!/usr/bin/env python3
import argparse, json, subprocess, time
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, check=True, text=True, capture_output=True)


def probe_duration(video: Path) -> float:
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(video)
    ], text=True)
    data = json.loads(out)
    return float(data['format']['duration'])


def split_video(pybin, script_dir, video, outdir, parts):
    run([pybin, str(script_dir / 'split_video.py'), str(video), str(outdir), '--parts', str(parts)])


def process_part(pybin, script_dir, part, workdir, preset, fps, threshold):
    base = part.stem
    frames = workdir / f'{base}_frames'
    filtered = workdir / f'{base}_filtered'
    crops = workdir / f'{base}_crops'
    raw = workdir / 'raw' / f'{base}.txt'
    run([pybin, str(script_dir / 'extract_frames.py'), str(part), str(frames), '--fps', str(fps)])
    run([pybin, str(script_dir / 'filter_similar_frames.py'), str(frames), str(filtered), '--threshold', str(threshold)])
    run([pybin, str(script_dir / 'crop_comment_band.py'), str(filtered), str(crops), '--preset', preset])
    run([pybin, str(script_dir / 'ocr_frames.py'), str(crops), str(raw), '--format', 'txt'])
    return raw


def fmt_secs(v: float) -> str:
    return f'{v:.1f}s'


def write_status(path: Path, payload: dict):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def make_bar(percent: int, width: int = 20) -> str:
    filled = max(0, min(width, round(width * percent / 100)))
    return '[' + '█' * filled + '░' * (width - filled) + ']'


def merge_existing_raws(rawdir: Path, outfile: Path):
    raws = sorted(rawdir.glob('part_*.txt'))
    outfile.parent.mkdir(parents=True, exist_ok=True)
    with outfile.open('w', encoding='utf-8') as wf:
        for p in raws:
            data = p.read_text(encoding='utf-8', errors='ignore').strip()
            if not data:
                continue
            wf.write(data)
            wf.write('\n\n')
    return [str(p) for p in raws]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('workdir')
    ap.add_argument('--preset', default='generic')
    ap.add_argument('--parts', type=int, default=4)
    ap.add_argument('--fps', type=float, default=2.0)
    ap.add_argument('--threshold', type=int, default=8)
    ap.add_argument('--pybin', default='/root/.openclaw/workspace/.venv-ocr/bin/python')
    args = ap.parse_args()

    script_dir = Path(__file__).resolve().parent
    video = Path(args.video)
    workdir = Path(args.workdir)
    chunks = workdir / 'chunks'
    rawdir = workdir / 'raw'
    status_file = workdir / 'status.json'
    partial_file = workdir / 'partial_raw_dump.txt'
    final_file = workdir / 'final_raw_dump.txt'
    workdir.mkdir(parents=True, exist_ok=True)
    chunks.mkdir(exist_ok=True)
    rawdir.mkdir(exist_ok=True)

    total_duration = probe_duration(video)
    split_video(args.pybin, script_dir, video, chunks, args.parts)
    parts = sorted(chunks.glob('part_*.mp4'))

    meta = []
    seg = total_duration / max(1, len(parts))
    for idx, part in enumerate(parts):
        start = idx * seg
        end = total_duration if idx == len(parts) - 1 else min(total_duration, (idx + 1) * seg)
        meta.append({
            'name': part.stem,
            'path': str(part),
            'startSec': start,
            'endSec': end,
            'durationSec': max(0.0, end - start),
            'status': 'queued'
        })

    started_at = time.time()
    write_status(status_file, {
        'video': str(video),
        'totalDurationSec': total_duration,
        'doneDurationSec': 0.0,
        'progressPercent': 0,
        'progressBar': make_bar(0),
        'elapsedSec': 0.0,
        'etaSec': None,
        'currentPart': None,
        'partial': str(partial_file),
        'final': str(final_file),
        'parts': meta,
    })

    procs = []
    for item in meta:
        part = Path(item['path'])
        log = workdir / f"{part.stem}.log"
        cmd = [args.pybin, '-c', (
            'from pathlib import Path; '
            'from run_openclaw_parallel import process_part; '
            f'process_part({args.pybin!r}, Path({str(script_dir)!r}), Path({str(part)!r}), Path({str(workdir)!r}), {args.preset!r}, {args.fps!r}, {args.threshold!r})'
        )]
        with log.open('w', encoding='utf-8') as lf:
            p = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT, cwd=str(script_dir))
        item['status'] = 'running'
        item['log'] = str(log)
        procs.append((item, p))

    last_done = set()
    while procs:
        alive = []
        done_duration = 0.0
        running_names = []
        for item, p in procs:
            rc = p.poll()
            if rc is None:
                running_names.append(item['name'])
                alive.append((item, p))
            elif rc != 0:
                item['status'] = 'failed'
                write_status(status_file, {
                    'video': str(video),
                    'totalDurationSec': total_duration,
                    'doneDurationSec': done_duration,
                    'progressPercent': int(done_duration / total_duration * 100) if total_duration else 0,
                    'progressBar': make_bar(int(done_duration / total_duration * 100) if total_duration else 0),
                    'elapsedSec': time.time() - started_at,
                    'etaSec': None,
                    'currentPart': item['name'],
                    'partial': str(partial_file),
                    'final': str(final_file),
                    'parts': meta,
                })
                raise SystemExit(f'part failed: {item["name"]}')
            else:
                item['status'] = 'done'

        for item in meta:
            if item['status'] == 'done':
                done_duration += item['durationSec']

        done_names = {item['name'] for item in meta if item['status'] == 'done'}
        if done_names != last_done:
            raws = merge_existing_raws(rawdir, partial_file)
            print(json.dumps({'partialUpdated': True, 'doneParts': sorted(done_names), 'partial': str(partial_file), 'raws': raws}, ensure_ascii=False), flush=True)
            last_done = done_names

        elapsed = time.time() - started_at
        progress = int((done_duration / total_duration) * 100) if total_duration else 0
        speed = (done_duration / elapsed) if elapsed > 0 else 0.0
        eta = ((total_duration - done_duration) / speed) if speed > 0 else None
        current = ','.join(running_names[:2]) if running_names else None
        status = {
            'video': str(video),
            'totalDurationSec': total_duration,
            'doneDurationSec': done_duration,
            'doneDurationText': fmt_secs(done_duration),
            'totalDurationText': fmt_secs(total_duration),
            'progressPercent': progress,
            'progressBar': make_bar(progress),
            'elapsedSec': elapsed,
            'elapsedText': fmt_secs(elapsed),
            'etaSec': eta,
            'etaText': fmt_secs(eta) if eta is not None else None,
            'speedVideoSecondsPerWallSecond': speed,
            'currentPart': current,
            'partial': str(partial_file),
            'final': str(final_file),
            'parts': meta,
        }
        write_status(status_file, status)
        print(json.dumps({
            'progressPercent': progress,
            'doneDurationSec': round(done_duration, 2),
            'totalDurationSec': round(total_duration, 2),
            'currentPart': current,
            'etaSec': round(eta, 2) if eta is not None else None,
        }, ensure_ascii=False), flush=True)
        procs = alive
        time.sleep(0.5)

    raws = merge_existing_raws(rawdir, partial_file)
    run([args.pybin, str(script_dir / 'merge_raw_dump.py'), str(final_file), *raws])
    final_status = json.loads(status_file.read_text(encoding='utf-8'))
    final_status.update({
        'doneDurationSec': total_duration,
        'doneDurationText': fmt_secs(total_duration),
        'progressPercent': 100,
        'progressBar': make_bar(100),
        'etaSec': 0.0,
        'etaText': '0.0s',
        'currentPart': None,
        'partial': str(partial_file),
        'final': str(final_file),
        'raws': raws,
    })
    write_status(status_file, final_status)
    print(json.dumps({'final': str(final_file), 'partial': str(partial_file), 'status': str(status_file), 'parts': len(parts), 'raws': raws}, ensure_ascii=False))

if __name__ == '__main__':
    main()
