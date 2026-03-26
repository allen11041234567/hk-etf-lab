#!/usr/bin/env python3
import argparse
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('outfile')
    ap.add_argument('inputs', nargs='+')
    args = ap.parse_args()

    out = Path(args.outfile)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', encoding='utf-8') as wf:
        for p in args.inputs:
            data = Path(p).read_text(encoding='utf-8', errors='ignore').strip()
            if not data:
                continue
            wf.write(data)
            wf.write('\n\n')

if __name__ == '__main__':
    main()
