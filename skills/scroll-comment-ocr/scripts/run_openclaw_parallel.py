#!/usr/bin/env python3
import argparse, json, subprocess, time
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, check=True, text=True, capture_output=True)


def split_video(pybin, script_dir, video, outdir, parts):
    run([pybin, str(script_dir/'split_video.py'), str(video), str(outdir), '--parts', str(parts)])


def process_part(pybin, script_dir, part, workdir, preset, fps, threshold):
    base = part.stem
    frames = workdir / f'{base}_frames'
    filtered = workdir / f'{base}_filtered'
    crops = workdir / f'{base}_crops'
    raw = workdir / 'raw' / f'{base}.txt'
    run([pybin, str(script_dir/'extract_frames.py'), str(part), str(frames), '--fps', str(fps)])
    run([pybin, str(script_dir/'filter_similar_frames.py'), str(frames), str(filtered), '--threshold', str(threshold)])
    run([pybin, str(script_dir/'crop_comment_band.py'), str(filtered), str(crops), '--preset', preset])
    run([pybin, str(script_dir/'ocr_frames.py'), str(crops), str(raw), '--format', 'txt'])
    return raw


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
    workdir.mkdir(parents=True, exist_ok=True)
    chunks.mkdir(exist_ok=True)
    rawdir.mkdir(exist_ok=True)

    split_video(args.pybin, script_dir, video, chunks, args.parts)
    parts = sorted(chunks.glob('part_*.mp4'))

    procs = []
    logs = []
    for part in parts:
        base = part.stem
        log = workdir / f'{base}.log'
        cmd = [args.pybin, '-c', (
            'from pathlib import Path; '
            'from run_openclaw_parallel import process_part; '
            f'process_part({args.pybin!r}, Path({str(script_dir)!r}), Path({str(part)!r}), Path({str(workdir)!r}), {args.preset!r}, {args.fps!r}, {args.threshold!r})'
        )]
        with log.open('w', encoding='utf-8') as lf:
            p = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT, cwd=str(script_dir))
        procs.append((part, p))
        logs.append(log)

    while procs:
        alive = []
        for part, p in procs:
            rc = p.poll()
            if rc is None:
                alive.append((part, p))
            elif rc != 0:
                raise SystemExit(f'part failed: {part.name}')
        procs = alive
        time.sleep(0.5)

    raws = [str(p) for p in sorted(rawdir.glob('part_*.txt'))]
    run([args.pybin, str(script_dir/'merge_raw_dump.py'), str(workdir/'final_raw_dump.txt'), *raws])
    print(json.dumps({'final': str(workdir/'final_raw_dump.txt'), 'parts': len(parts), 'raws': raws}, ensure_ascii=False))

if __name__ == '__main__':
    main()
