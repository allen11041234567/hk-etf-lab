#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image

PRESETS = {
    'generic': (0.00, 0.16, 1.00, 0.90),
    'futu':    (0.00, 0.16, 1.00, 0.90),
    'xhs':     (0.00, 0.18, 1.00, 0.92),
    'douyin':  (0.00, 0.20, 1.00, 0.88),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('outdir')
    ap.add_argument('--preset', default='generic', choices=sorted(PRESETS))
    args = ap.parse_args()

    l, t, r, b = PRESETS[args.preset]
    indir = Path(args.indir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    for src in sorted(indir.glob('*.jpg')):
        img = Image.open(src)
        w, h = img.size
        crop = img.crop((int(w*l), int(h*t), int(w*r), int(h*b)))
        crop.save(outdir / src.name, quality=85)
        print(outdir / src.name)

if __name__ == '__main__':
    main()
