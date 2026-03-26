#!/usr/bin/env python3
import argparse, json, re, subprocess, shutil
from pathlib import Path

SKIP_EXACT = {'图表','评论','资讯分析','基金','最新','精选','晒单','回复','关闭','写评论'}
SKIP_SUBSTR = ['活跃牛友','全部评论','评论区','查看更多回复','发送','删除','作者']


def clean(text: str) -> str:
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return ''
    if text in SKIP_EXACT:
        return ''
    if any(x in text for x in SKIP_SUBSTR):
        return ''
    if re.fullmatch(r'\d+|\d+[分小天]前|[\d\.万]+', text):
        return ''
    return text


def ocr_rapidocr(src: Path):
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    res, _ = ocr(str(src))
    out = []
    for item in res or []:
        t = clean(item[1])
        if t:
            out.append(t)
    return out


def ocr_tesseract(src: Path, lang: str = 'chi_sim+eng'):
    if not shutil.which('tesseract'):
        raise RuntimeError('tesseract not found on PATH')
    proc = subprocess.run([
        'tesseract', str(src), 'stdout', '-l', lang, '--psm', '6'
    ], capture_output=True, text=True, check=True)
    out = []
    for raw in proc.stdout.splitlines():
        t = clean(raw)
        if t:
            out.append(t)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('indir')
    ap.add_argument('outfile')
    ap.add_argument('--format', choices=['txt','jsonl'], default='txt')
    ap.add_argument('--backend', choices=['rapidocr','tesseract'], default='rapidocr')
    ap.add_argument('--tesseract-lang', default='chi_sim+eng')
    args = ap.parse_args()

    indir = Path(args.indir)
    rows = []
    for src in sorted(indir.glob('*.jpg')):
        if args.backend == 'tesseract':
            lines = ocr_tesseract(src, args.tesseract_lang)
        else:
            lines = ocr_rapidocr(src)
        rows.append({'frame': src.name, 'lines': lines})

    out = Path(args.outfile)
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.format == 'jsonl':
        with out.open('w', encoding='utf-8') as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
    else:
        with out.open('w', encoding='utf-8') as f:
            for row in rows:
                f.write(f"## {row['frame']}\n")
                for line in row['lines']:
                    f.write(line + '\n')
                f.write('\n')

if __name__ == '__main__':
    main()
