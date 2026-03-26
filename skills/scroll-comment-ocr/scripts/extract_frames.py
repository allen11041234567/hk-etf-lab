#!/usr/bin/env python3
import argparse, subprocess
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('outdir')
    ap.add_argument('--fps', type=float, default=2.0)
    args = ap.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        'ffmpeg','-y','-i', args.video, '-vf', f'fps={args.fps}',
        str(outdir / 'frame_%04d.jpg')
    ], check=True)

if __name__ == '__main__':
    main()
