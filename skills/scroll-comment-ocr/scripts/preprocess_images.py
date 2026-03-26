#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter


def process(img: Image.Image, grayscale: bool, upscale: float, contrast: float, sharpen: bool, threshold: int | None) -> Image.Image:
    out = img
    if grayscale:
        out = ImageOps.grayscale(out)
    if upscale and upscale != 1.0:
        w, h = out.size
        out = out.resize((max(1, int(w * upscale)), max(1, int(h * upscale))), Image.Resampling.LANCZOS)
    if contrast and contrast != 1.0:
        out = ImageEnhance.Contrast(out).enhance(contrast)
    if sharpen:
        out = out.filter(ImageFilter.SHARPEN)
    if threshold is not None:
        if out.mode != 'L':
            out = ImageOps.grayscale(out)
        out = out.point(lambda p: 255 if p >= threshold else 0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('outdir')
    ap.add_argument('--grayscale', action='store_true')
    ap.add_argument('--upscale', type=float, default=1.0)
    ap.add_argument('--contrast', type=float, default=1.0)
    ap.add_argument('--sharpen', action='store_true')
    ap.add_argument('--threshold', type=int, default=None)
    args = ap.parse_args()

    indir = Path(args.indir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    for src in sorted(indir.glob('*.jpg')):
        img = Image.open(src)
        out = process(img, args.grayscale, args.upscale, args.contrast, args.sharpen, args.threshold)
        out.save(outdir / src.name, quality=90)
        print(outdir / src.name)

if __name__ == '__main__':
    main()
