#!/usr/bin/env python3
import argparse, json, subprocess, time
from pathlib import Path


def count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for _ in path.open('r', encoding='utf-8', errors='ignore'))


def count_jpgs(path: Path) -> int:
    return len(list(path.glob('*.jpg'))) if path.exists() else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('workdir')
    ap.add_argument('--preset', default='generic')
    ap.add_argument('--parts', type=int, default=4)
    ap.add_argument('--fps', type=float, default=2.0)
    ap.add_argument('--threshold', type=int, default=8)
    ap.add_argument('--preprocess', choices=['none','basic','aggressive'], default='basic')
    ap.add_argument('--ocr-backend', choices=['rapidocr','tesseract'], default='rapidocr')
    ap.add_argument('--pybin', default='/root/.openclaw/workspace/.venv-ocr/bin/python')
    args = ap.parse_args()

    video = Path(args.video)
    workdir = Path(args.workdir)
    script = Path(__file__).resolve().parent / 'run_openclaw_parallel.py'

    started = time.time()
    subprocess.run([
        args.pybin, str(script), str(video), str(workdir),
        '--preset', args.preset,
        '--parts', str(args.parts),
        '--fps', str(args.fps),
        '--threshold', str(args.threshold),
        '--preprocess', args.preprocess,
        '--ocr-backend', args.ocr_backend,
        '--pybin', args.pybin,
    ], check=True)
    elapsed = time.time() - started

    status = json.loads((workdir / 'status.json').read_text(encoding='utf-8'))
    metrics = {
        'video': str(video),
        'elapsedSec': elapsed,
        'progressPercent': status.get('progressPercent'),
        'totalDurationSec': status.get('totalDurationSec'),
        'parts': args.parts,
        'fps': args.fps,
        'threshold': args.threshold,
        'preset': args.preset,
        'preprocess': args.preprocess,
        'ocrBackend': args.ocr_backend,
        'framesTotal': 0,
        'framesFiltered': 0,
        'rawLineCount': count_lines(workdir / 'final_raw_dump.txt'),
    }

    for i in range(1, args.parts + 1):
        metrics['framesTotal'] += count_jpgs(workdir / f'part_{i:02d}_frames')
        metrics['framesFiltered'] += count_jpgs(workdir / f'part_{i:02d}_filtered')

    out = workdir / 'benchmark.json'
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metrics, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
