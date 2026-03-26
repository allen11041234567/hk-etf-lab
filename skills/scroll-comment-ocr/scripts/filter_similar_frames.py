#!/usr/bin/env python3
import argparse, json, hashlib
from pathlib import Path
from PIL import Image


def dhash(img: Image.Image, size: int = 8) -> str:
    gray = img.convert('L').resize((size + 1, size))
    px = list(gray.getchannel(0).tobytes())
    rows = [px[i*(size+1):(i+1)*(size+1)] for i in range(size)]
    bits = []
    for row in rows:
        for i in range(size):
            bits.append('1' if row[i] > row[i+1] else '0')
    return f'{int("".join(bits), 2):0{size*size//4}x}'


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count('1')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('outdir')
    ap.add_argument('--threshold', type=int, default=8, help='keep frame when dhash distance from last kept frame is >= threshold')
    ap.add_argument('--manifest', default='manifest.json')
    args = ap.parse_args()

    indir = Path(args.indir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = []
    last_hash = None
    kept = 0
    total = 0

    for src in sorted(indir.glob('*.jpg')):
        total += 1
        img = Image.open(src)
        h = dhash(img)
        keep = last_hash is None or hamming(h, last_hash) >= args.threshold
        if keep:
            dst = outdir / src.name
            img.save(dst, quality=85)
            last_hash = h
            kept += 1
            manifest.append({'src': src.name, 'kept': True, 'hash': h})
            print(dst)
        else:
            manifest.append({'src': src.name, 'kept': False, 'hash': h})

    stats = {'total': total, 'kept': kept, 'dropped': total-kept, 'threshold': args.threshold}
    (outdir / args.manifest).write_text(json.dumps({'stats': stats, 'frames': manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(stats, ensure_ascii=False))

if __name__ == '__main__':
    main()
