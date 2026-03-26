from rapidocr_onnxruntime import RapidOCR
from pathlib import Path
from PIL import Image
import re
base = Path('/root/.openclaw/workspace/video_8467_fast')
frames = sorted(base.glob('frame_*.jpg'))
idxs = [0, max(0,len(frames)//5), max(0,2*len(frames)//5), max(0,3*len(frames)//5), max(0,4*len(frames)//5), max(0,len(frames)-1)]
sel = [frames[i] for i in idxs if i < len(frames)]
ocr = RapidOCR()
out=[]; seen=set()
for p in sel:
    img=Image.open(p)
    w,h=img.size
    crop=img.crop((0, int(h*0.16), w, int(h*0.90)))
    tmp=base/'_tmp_one.jpg'
    crop.save(tmp, quality=82)
    res,_=ocr(str(tmp))
    out.append(f'## {p.name}')
    for item in res or []:
        t=re.sub(r'\s+',' ',item[1]).strip()
        if not t or len(t)<=1: continue
        if any(x in t for x in ['活跃牛友','全部评论','评论区','作者','写评论','查看更多回复']): continue
        if t in {'图表','评论','资讯分析','基金','最新','精选','晒单','回复','关闭'}: continue
        if re.fullmatch(r'\d+|\d+[分小天]前|[\d\.万]+', t): continue
        k=re.sub(r'\W+','',t)
        if len(k)<2 or k in seen: continue
        seen.add(k); out.append(t)
with open(base/'comments_replies_6frames.txt','w',encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done', len(out))
