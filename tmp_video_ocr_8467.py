from rapidocr_onnxruntime import RapidOCR
from pathlib import Path
from PIL import Image
import re, json, hashlib

base = Path('/root/.openclaw/workspace/video_8467_fast')
ocr = RapidOCR()
frames = sorted(base.glob('frame_*.jpg'))
outdir = base / 'crops'
outdir.mkdir(exist_ok=True)

ui_exact = {'图表','评论','资讯分析','基金','最新','精选','晒单','刚刚','关闭','回复','查看更多回复','写评论','点赞','分享'}
ui_contains = ['活跃牛友','全部评论','条评论','评论区','作者','置顶','发表于','删除','发送','表情','转发']
noise_contains = ['VPN','ETF','HK','07709','关注','加自选','查看']
records = []
seen_hashes = set()
for i, p in enumerate(frames, 1):
    img = Image.open(p)
    w, h = img.size
    # keep main comment area, skip top nav and bottom tab bar
    crop = img.crop((0, int(h*0.14), w, int(h*0.90)))
    cp = outdir / p.name
    crop.save(cp, quality=85)
    try:
        res, _ = ocr(str(cp))
    except Exception:
        continue
    lines = []
    for item in res or []:
        txt = item[1].strip()
        if not txt:
            continue
        txt = re.sub(r'\s+', ' ', txt)
        if txt in ui_exact:
            continue
        if any(x in txt for x in ui_contains):
            continue
        if any(x == txt for x in noise_contains):
            continue
        if re.fullmatch(r'\d+', txt):
            continue
        if re.fullmatch(r'\d+[分小天]前', txt):
            continue
        if re.fullmatch(r'[\d\.万]+', txt):
            continue
        if len(txt) <= 1:
            continue
        lines.append(txt)
    # lightweight per-frame dedupe
    norm = '\n'.join(lines)
    key = hashlib.md5(norm.encode('utf-8')).hexdigest()
    if lines and key not in seen_hashes:
        seen_hashes.add(key)
        records.append({'file': p.name, 'lines': lines})
    if i % 40 == 0:
        print(f'done {i}/{len(frames)}', flush=True)

with open(base / 'ocr_raw.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

# flatten + global rough dedupe for delivery
all_lines = []
seen = set()
for rec in records:
    for txt in rec['lines']:
        t = txt.strip(' -—|')
        t = re.sub(r'[，。！？、,.!?:：]+$', '', t)
        if len(t) < 2:
            continue
        k = re.sub(r'\W+', '', t)
        if len(k) < 2:
            continue
        if k in seen:
            continue
        seen.add(k)
        all_lines.append(t)

with open(base / 'comments_replies_rough.txt', 'w', encoding='utf-8') as f:
    for line in all_lines:
        f.write(line + '\n')

print('saved_records', len(records), 'saved_lines', len(all_lines), flush=True)
