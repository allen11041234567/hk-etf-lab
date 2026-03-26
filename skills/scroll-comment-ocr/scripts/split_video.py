#!/usr/bin/env python3
import argparse, math, subprocess, json
from pathlib import Path


def probe_duration(video: Path) -> float:
    out = subprocess.check_output([
        'ffprobe','-v','error','-show_entries','format=duration',
        '-of','json', str(video)
    ], text=True)
    data = json.loads(out)
    return float(data['format']['duration'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('outdir')
    ap.add_argument('--parts', type=int, default=6)
    args = ap.parse_args()

    video = Path(args.video)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    duration = probe_duration(video)
    seg = duration / args.parts
    for i in range(args.parts):
        start = i * seg
        length = duration - start if i == args.parts - 1 else seg
        dst = outdir / f'part_{i+1:02d}.mp4'
        subprocess.run([
            'ffmpeg','-y','-ss', f'{start:.3f}','-i', str(video), '-t', f'{length:.3f}',
            '-c','copy', str(dst)
        ], check=True)
        print(dst)

if __name__ == '__main__':
    main()
