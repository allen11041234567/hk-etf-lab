#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image

# normalized crop boxes: left, top, right, bottom
PRESETS = {
    'generic': (0.00, 0.16, 1.00, 0.90),
    # tighter default for Futu: reduce top tabs, bottom bar, and right-side button area
    'futu':    (0.03, 0.19, 0.92, 0.86),
    'xhs':     (0.00, 0.18, 1.00, 0.92),
    'douyin':  (0.00, 0.20, 1.00, 0.88),
}


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('outdir')
    ap.add_argument('--preset', default='generic', choices=sorted(PRESETS))
    ap.add_argument('--left', type=float, default=None, help='override left crop ratio (0-1)')
    ap.add_argument('--top', type=float, default=None, help='override top crop ratio (0-1)')
    ap.add_argument('--right', type=float, default=None, help='override right crop ratio (0-1)')
    ap.add_argument('--bottom', type=float, default=None, help='override bottom crop ratio (0-1)')
    args = ap.parse_args()

    l, t, r, b = PRESETS[args.preset]
    if args.left is not None:
        l = clamp01(args.left)
    if args.top is not None:
        t = clamp01(args.top)
    if args.right is not None:
        r = clamp01(args.right)
    if args.bottom is not None:
        b = clamp01(args.bottom)
    if not (l < r and t < b):
        raise SystemExit('invalid crop box: require left < right and top < bottom')

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
