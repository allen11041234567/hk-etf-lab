from rapidocr_onnxruntime import RapidOCR
from pathlib import Path
from PIL import Image
import re, json, hashlib
base = Path('/root/.openclaw/workspace/video_8467_fast')
ocr = RapidOCR()
frames = sorted(base.glob('frame_*.jpg'))[::8]
out=[]; seen=set()
for p in frames:
    img=Image.open(p)
    w,h=img.size
    crop=img.crop((0, int(h*0.16), w, int(h*0.90)))
    tmp=base/'_tmp_quick.jpg'
    crop.save(tmp, quality=82)
    res,_=ocr(str(tmp))
    lines=[]
    for item in res or []:
        t=re.sub(r'\s+',' ',item[1]).strip()
        if not t or len(t)<=1: continue
        if any(x in t for x in ['活跃牛友','全部评论','评论区','作者','写评论','查看更多回复']): continue
        if t in {'图表','评论','资讯分析','基金','最新','精选','晒单','回复','关闭'}: continue
        if re.fullmatch(r'\d+|\d+[分小天]前|[\d\.万]+', t): continue
        lines.append(t)
    for t in lines:
        k=re.sub(r'\W+','',t)
        if len(k)<2 or k in seen: continue
        seen.add(k); out.append(t)
with open(base/'comments_replies_quick.txt','w',encoding='utf-8') as f:
    f.write('\n'.join(out))
print('quick_lines',len(out))
