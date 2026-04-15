#!/usr/bin/env python3
import argparse
import json
import math
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/root/.openclaw/workspace')
SITE_BASE = ROOT / 'site/logbias'
LOOKBACK_DAYS = 7
MAX_TOPICS = 100
REPLIES_PAGE_SIZE = 50
MAX_REPLIES_PER_TOPIC = 300

BULL_WORDS = [
    '加仓', '补仓', '抄底', '企稳', '反弹', '修复', '低吸', '看多', '乐观', '机会', '上车', '买入', '右侧', '持有',
    'bull', 'rebound', 'buy', 'bought', 'adding', 'added', 'optimistic', 'opportunity', 'recover', 'hold', 'holding'
]
BEAR_WORDS = [
    '没底', '没有底', '还要跌', '继续跌', '崩', '崩溃', '割肉', '受不了', '看空', '悲观', '套牢', '垃圾', '跌透', '清仓',
    'no bottom', 'falling', 'crash', 'panic', 'sell', 'sold', 'bear', 'hopeless', 'loss', 'losing', 'bottomless'
]
MID_WORDS = ['震荡', '观望', '中性', '复盘', '总结', '轮动', '不追高', 'wait', 'neutral', 'summary', 'rotation']
GENERIC_TOPIC_WORDS = [
    '加仓', '补仓', '抄底', '反弹', '修复', '没底', '没有底', '套牢', '追高', '轮动', '观望', '企稳',
    'panic', 'rebound', 'buy', 'sell', 'bottom', 'rotation', 'wait', 'hold', 'holding'
]


def run_json(cmd: str):
    out = subprocess.check_output(cmd, shell=True, text=True)
    return json.loads(out)


def safe_json(cmd: str, default):
    try:
        return run_json(cmd)
    except Exception:
        return default


def fetch_all_replies(topic_id, expected_count=0):
    total_needed = max(int(expected_count or 0), 0)
    if total_needed <= 0:
        total_needed = REPLIES_PAGE_SIZE
    total_needed = min(total_needed, MAX_REPLIES_PER_TOPIC)
    pages = max(1, math.ceil(total_needed / REPLIES_PAGE_SIZE))
    out = []
    for page in range(1, pages + 1):
        chunk = safe_json(
            f'longbridge topic replies {topic_id} --page {page} --size {REPLIES_PAGE_SIZE} --format json',
            []
        )
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < REPLIES_PAGE_SIZE:
            break
        if len(out) >= MAX_REPLIES_PER_TOPIC:
            break
    return out[:MAX_REPLIES_PER_TOPIC]


def score_text(text: str):
    t = (text or '').lower()
    bull = sum(t.count(w.lower()) for w in BULL_WORDS)
    bear = sum(t.count(w.lower()) for w in BEAR_WORDS)
    mid = sum(t.count(w.lower()) for w in MID_WORDS)
    if bear > bull and bear >= 1:
        label = 'bear'
    elif bull > bear and bull >= 1:
        label = 'bull'
    else:
        label = 'neutral'
    return label, bull, bear, mid


def pct(x, total):
    return round((x / total * 100), 1) if total else 0


def human_num(num):
    n = float(num)
    if abs(n) >= 1e8:
        return f'{n/1e8:.2f}亿'
    if abs(n) >= 1e4:
        return f'{n/1e4:.1f}万'
    return f'{n:.0f}'


def dtfmt(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')


def trim(s, n=88):
    s = re.sub(r'\s+', ' ', (s or '')).strip()
    return s if len(s) <= n else s[:n].rstrip() + '…'


def svg_donut(bull, neutral, bear):
    total = max(bull + neutral + bear, 1)
    vals = [('bull', bull, '#23c483'), ('neutral', neutral, '#60a5fa'), ('bear', bear, '#ff6b7c')]
    start = -90
    circumference = 2 * math.pi * 62
    parts = []
    for _, v, color in vals:
        ang = 360 * v / total
        dash = circumference * ang / 360
        parts.append(
            f'<circle cx="90" cy="90" r="62" fill="none" stroke="{color}" stroke-width="18" '
            f'stroke-linecap="round" stroke-dasharray="{dash:.2f} {circumference:.2f}" '
            f'transform="rotate({start} 90 90)" />'
        )
        start += ang
    dominant = max(pct(bull, total), pct(neutral, total), pct(bear, total))
    return (
        '<svg viewBox="0 0 180 180" class="donut">'
        '<circle cx="90" cy="90" r="62" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="18" />'
        f'{"".join(parts)}'
        '<circle cx="90" cy="90" r="42" fill="#0d1730" />'
        f'<text x="90" y="84" text-anchor="middle" fill="#eef4ff" font-size="30" font-weight="800">{dominant:.0f}%</text>'
        '<text x="90" y="106" text-anchor="middle" fill="#97abcf" font-size="12">主导占比</text>'
        '</svg>'
    )


def svg_bars(counts):
    total = max(sum(counts.values()), 1)
    labels = [('偏多', counts.get('bull', 0), '#23c483'), ('中性', counts.get('neutral', 0), '#60a5fa'), ('偏空', counts.get('bear', 0), '#ff6b7c')]
    y = 12
    parts = []
    for name, val, color in labels:
        ratio = val / total
        width = 320 * ratio if total else 0
        parts.append(
            f'<text x="0" y="{y+13}" fill="#cfe0ff" font-size="13">{name}</text>'
            f'<rect x="70" y="{y}" width="320" height="16" rx="8" fill="rgba(255,255,255,.06)" />'
            f'<rect x="70" y="{y}" width="{width:.1f}" height="16" rx="8" fill="{color}" />'
            f'<text x="402" y="{y+13}" fill="#97abcf" font-size="13" text-anchor="end">{pct(val,total)}%</text>'
        )
        y += 34
    return f'<svg viewBox="0 0 410 120" class="bars">{"".join(parts)}</svg>'


def relevance(detail, symbol_code, aliases):
    text = ' '.join([
        detail.get('title', ''), detail.get('description', ''), detail.get('body', ''),
        ' '.join(detail.get('tickers', []))
    ]).lower()
    score = 0
    for kw, weight in aliases.items():
        if kw.lower() in text:
            score += weight
    if symbol_code.lower() in text:
        score += 4
    score += min(detail.get('comments_count', 0), 5)
    return score


def detect_topics(strong, extra_terms):
    words = Counter()
    for x in strong:
        txt = (x['text'] or '').lower()
        for w in GENERIC_TOPIC_WORDS + extra_terms:
            if w.lower() in txt:
                words[w] += txt.count(w.lower())
    return [w for w, _ in words.most_common(8)]


def build_page(symbol, name, quote, enriched, strong, title, top_words, sentiment_score, extremity_rsi, heat_score, window_start, window_end, gen, out_path):
    counts = Counter(x['label'] for x in strong)
    total = len(strong)
    bull_n, bear_n, neutral_n = counts.get('bull', 0), counts.get('bear', 0), counts.get('neutral', 0)
    change = (float(quote['last']) / float(quote['prev_close']) - 1) * 100
    change_str = f'{change:+.2f}%'
    turnover = human_num(quote['turnover'])
    volume = human_num(quote['volume'])

    best_bear = next((x for x in strong if x['label'] == 'bear'), strong[0] if strong else None)
    best_bull = next((x for x in strong if x['label'] == 'bull'), strong[0] if strong else None)
    best_mid = next((x for x in strong if x['label'] == 'neutral'), strong[0] if strong else None)

    total_reply_count = sum(int(x.get('reply_count', 0) or 0) for x in strong)

    html = f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{symbol} 散户情绪监控器</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root{{--bg:#07111f;--bg2:#091524;--panel:rgba(10,22,43,.88);--line:rgba(255,255,255,.08);--text:#eef4ff;--muted:#97abcf;--blue:#7aa2ff;--green:#23c483;--red:#ff6b7c;--amber:#ffb84d;--shadow:0 24px 60px rgba(0,0,0,.28)}}
    *{{box-sizing:border-box}} body{{margin:0;background:radial-gradient(circle at top left, rgba(74,120,255,.22), transparent 28%),radial-gradient(circle at top right, rgba(80,215,195,.12), transparent 24%),linear-gradient(180deg,var(--bg) 0%,var(--bg2) 42%,var(--bg) 100%);color:var(--text);font-family:"Noto Sans SC",sans-serif}}
    .wrap{{max-width:1280px;margin:0 auto;padding:28px 20px 44px}} .hero,.panel{{background:linear-gradient(180deg,rgba(10,20,39,.94) 0%,rgba(10,22,43,.9) 100%);border:1px solid var(--line);border-radius:28px;box-shadow:var(--shadow);margin-bottom:18px}} .hero{{padding:30px;position:relative;overflow:hidden}} .hero:after{{content:"";position:absolute;right:-100px;top:-90px;width:320px;height:320px;background:radial-gradient(circle, rgba(122,162,255,.24), transparent 62%)}}
    .eyebrow{{display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(122,162,255,.12);color:#cfe0ff;border:1px solid rgba(122,162,255,.24);font-size:13px;font-weight:700}} h1{{margin:14px 0 10px;font-size:42px;line-height:1.12}} .sub{{font-size:17px;line-height:1.9;color:#bfd0eb;max-width:980px}}
    .pill{{display:inline-block;padding:10px 14px;border-radius:999px;background:rgba(255,184,77,.12);border:1px solid rgba(255,184,77,.22);color:#ffd694;font-size:13px;font-weight:700}} .meta{{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}} .chip{{display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:13px;color:#dbe7ff}}
    .panel{{padding:20px}} .section-title{{font-size:24px;font-weight:800;margin:4px 4px 16px}} .grid4{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}} .grid2{{display:grid;grid-template-columns:1.04fr .96fr;gap:14px}} .card{{background:linear-gradient(180deg,rgba(17,31,56,.96) 0%,rgba(13,25,47,.94) 100%);border:1px solid var(--line);border-radius:24px;padding:22px 22px 18px;box-shadow:0 10px 30px rgba(0,0,0,.18)}}
    .k{{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}} .v{{margin-top:8px;font-size:34px;font-weight:800;line-height:1.25}} .d{{margin-top:10px;font-size:15px;line-height:1.85;color:#cfdbf4}} .hint{{margin-top:10px;font-size:13px;color:#98acd1;line-height:1.75}}
    .donut-wrap{{display:grid;place-items:center;padding-top:6px}} .donut{{width:220px;max-width:100%}} .bars{{width:100%;height:auto;display:block}} .legend{{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}} .legend span{{font-size:13px;color:#cfe0ff}} .dot{{display:inline-block;width:10px;height:10px;border-radius:99px;margin-right:6px}}
    .tags{{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}} .tag{{display:inline-block;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:14px;color:#dce7fc}}
    .quotes{{display:grid;gap:12px}} .quote{{padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.03)}} .quote p{{margin:0;font-size:15px;line-height:1.9;color:#eef4ff}} .quote .meta2{{margin-top:8px;font-size:13px;color:#9cb0d3;line-height:1.75}} .qlabel{{display:inline-block;padding:7px 11px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#d6e3fb;white-space:nowrap;margin-bottom:10px}}
    table{{width:100%;border-collapse:collapse}} th,td{{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:14px;vertical-align:top}} th{{color:#9db1d4;font-weight:700}} td{{color:#e7efff}} a{{color:#a6c0ff;text-decoration:none}} .foot{{padding:4px 6px 0;color:#90a4c7;font-size:13px;line-height:1.8;text-align:center}}
    @media (max-width:980px){{.grid4{{grid-template-columns:repeat(2,minmax(0,1fr))}}.grid2{{grid-template-columns:1fr}}h1{{font-size:34px}}}} @media (max-width:640px){{.wrap{{padding:18px 14px 32px}}.hero{{padding:22px 18px 20px}}.panel{{padding:16px}}.grid4{{grid-template-columns:1fr 1fr;gap:10px}}.card{{padding:16px 16px 14px;border-radius:18px}}.v{{font-size:24px}}.d{{font-size:14px;line-height:1.72}}}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <span class="eyebrow">Weekly Sentiment Signal</span>
    <h1>{symbol} 市场情绪监控</h1>
    <div class="sub">标的：{name}。页面聚焦近一周市场讨论中的情绪方向、分歧强弱与热度状态，帮助快速判断当前处在修复、分歧、观望还是过热阶段。</div>
    <div class="meta">
      <span class="pill">当前判断：{title}</span>
      <span class="chip">最新价 {quote['last']}</span>
      <span class="chip">涨跌幅 {change_str}</span>
      <span class="chip">成交额 {turnover}</span>
      <span class="chip">成交量 {volume}</span>
      <span class="chip">统计窗口 近7天</span>
      <span class="chip">更新于 {gen}</span>
    </div>
  </div>

  <div class="panel">
    <div class="section-title">核心指标</div>
    <div class="grid4">
      <div class="card"><div class="k">Sentiment Score</div><div class="v">{sentiment_score}</div><div class="d">综合多空倾向与中性分布得到的情绪温度值。50 以下偏冷，50 以上偏修复。</div><div class="hint">适合观察近一周情绪方向变化</div></div>
      <div class="card"><div class="k">Extremity RSI</div><div class="v">{extremity_rsi}</div><div class="d">衡量情绪是否正在逼近极端区间。越低越接近恐慌，越高越接近过热。</div><div class="hint">用于识别情绪拐点风险</div></div>
      <div class="card"><div class="k">Heat Score</div><div class="v">{heat_score}</div><div class="d">反映近一周讨论热度与关注集中度。越高代表市场关注越聚焦。</div><div class="hint">用于判断题材是否正在升温</div></div>
      <div class="card"><div class="k">Focus Ratio</div><div class="v">{pct(total, len(enriched))}%</div><div class="d">反映讨论是否高度聚焦在该标的本身，比例越高，情绪信号越集中。</div><div class="hint">用于区分泛讨论与强聚焦讨论</div></div>
    </div>
  </div>

  <div class="panel">
    <div class="section-title">量化可视化</div>
    <div class="grid2">
      <div class="card"><div class="k">情绪分布环图</div><div class="donut-wrap">{svg_donut(bull_n, neutral_n, bear_n)}</div><div class="legend"><span><i class="dot" style="background:#23c483"></i>偏多 {pct(bull_n,total)}%</span><span><i class="dot" style="background:#60a5fa"></i>中性 {pct(neutral_n,total)}%</span><span><i class="dot" style="background:#ff6b7c"></i>偏空 {pct(bear_n,total)}%</span></div></div>
      <div class="card"><div class="k">多空中性柱状图</div>{svg_bars(counts)}<div class="hint">用于观察市场讨论当前更偏修复、观望还是分歧扩大。</div></div>
    </div>
  </div>

  <div class="panel"><div class="section-title">关键词主题</div><div class="tags">{''.join(f'<span class="tag">{w}</span>' for w in top_words)}</div></div>

  <div class="panel">
    <div class="section-title">代表性原话</div>
    <div class="quotes">
      <div class="quote"><span class="qlabel">偏空 / 受挫</span><p>{trim(best_bear['description'] if best_bear else '')}</p><div class="meta2">相关性 {best_bear['relevance'] if best_bear else '-'} · 互动 {best_bear['engagement'] if best_bear else '-'} · <a href="{best_bear['url'] if best_bear else '#'}">原帖链接</a></div></div>
      <div class="quote"><span class="qlabel">偏多 / 持有/补仓</span><p>{trim(best_bull['description'] if best_bull else '')}</p><div class="meta2">相关性 {best_bull['relevance'] if best_bull else '-'} · 互动 {best_bull['engagement'] if best_bull else '-'} · <a href="{best_bull['url'] if best_bull else '#'}">原帖链接</a></div></div>
      <div class="quote"><span class="qlabel">中性 / 观察</span><p>{trim(best_mid['description'] if best_mid else '')}</p><div class="meta2">相关性 {best_mid['relevance'] if best_mid else '-'} · 互动 {best_mid['engagement'] if best_mid else '-'} · <a href="{best_mid['url'] if best_mid else '#'}">原帖链接</a></div></div>
    </div>
  </div>

  <div class="panel">
    <div class="section-title">样本明细</div>
    <table>
      <thead><tr><th>情绪</th><th>标题/摘要</th><th>相关性</th><th>互动</th><th>链接</th></tr></thead>
      <tbody>
        {''.join(f'<tr><td>{"偏多" if x["label"] == "bull" else "偏空" if x["label"] == "bear" else "中性"}</td><td>{trim(x["title"] if x["title"] != "(无标题)" else x["description"], 72)}<div style="margin-top:6px;color:#90a4c7;font-size:12px">{dtfmt(x["published_at"])}</div></td><td>{x["relevance"]}</td><td>{x["engagement"]}</td><td><a href="{x["url"]}">查看</a></td></tr>' for x in strong[:10])}
      </tbody>
    </table>
  </div>

  <div class="foot">HK ETF Lab · {symbol} Market Sentiment Monitor · Weekly View</div>
</div>
</body>
</html>'''
    out_path.write_text(html, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--name', default='')
    args = parser.parse_args()

    symbol = args.symbol.upper()
    code = symbol.split('.')[0]
    name = args.name or symbol

    aliases = {code: 4, symbol: 5}
    extra_terms = [code]
    if code == '03033':
        aliases.update({'恒生科技': 3, '恒科': 3, 'hang seng tech': 3, 'hstech': 3, '科技指数': 2, '3088': 1, '3032': 1, '7552': 1, '7226': 1})
        extra_terms += ['恒生科技', '恒科', 'tech', 'rebound', 'panic', 'rotation']
    elif code == '07709':
        aliases.update({'7709': 4, '7747': 1, 'amazon': 1, 'amzn': 1})
        extra_terms += ['7709', '持有', '回本', '翻红', 'hold', 'holding', 'green']

    quote = run_json(f'longbridge quote {symbol} --format json')[0]
    topics = run_json(f'longbridge topic {symbol} --count {MAX_TOPICS} --format json')

    now_ts = datetime.now(timezone.utc).timestamp()
    cutoff_ts = now_ts - LOOKBACK_DAYS * 86400
    topics = [t for t in topics if t.get('published_at', 0) >= cutoff_ts]

    enriched = []
    for t in topics:
        tid = t['id']
        detail = safe_json(f'longbridge topic detail {tid} --format json', {})
        expected_replies = detail.get('comments_count', t.get('comments_count', 0))
        replies = fetch_all_replies(tid, expected_replies)
        text = ' '.join([detail.get('title', ''), detail.get('description', ''), detail.get('body', '')])
        label, bull, bear, mid = score_text(text)
        rel = relevance(detail, code, aliases)
        reply_text = ' '.join(r.get('body', '') for r in replies)
        _, rb, rbe, rm = score_text(reply_text)
        enriched.append({
            'id': tid,
            'url': detail.get('detail_url') or t.get('url'),
            'title': detail.get('title') or '(无标题)',
            'description': detail.get('description', ''),
            'published_at': t.get('published_at', 0),
            'label': label,
            'bull': bull + rb,
            'bear': bear + rbe,
            'mid': mid + rm,
            'relevance': rel,
            'engagement': detail.get('comments_count', 0) + detail.get('likes_count', 0) * 2 + len(replies),
            'text': text,
            'reply_count': len(replies),
        })

    enriched.sort(key=lambda x: (x['relevance'], x['engagement'], x['published_at']), reverse=True)
    strong = [x for x in enriched if x['relevance'] >= 4]
    if len(strong) < 6:
        strong = enriched[:]

    counts = Counter(x['label'] for x in strong)
    total = len(strong)
    bull_n, bear_n = counts.get('bull', 0), counts.get('bear', 0)

    sentiment_score = round((50 + (counts.get('bull', 0) - counts.get('bear', 0)) / max(total, 1) * 50), 1)
    extremity_rsi = round(100 * bull_n / max(bull_n + bear_n, 1), 1)
    heat_raw = sum(min(x['engagement'], 10) + min(x['relevance'], 8) for x in strong)
    heat_score = round(min(100, heat_raw / max(total, 1) * 7), 1)
    top_words = detect_topics(strong, extra_terms) or [code, 'hold', 'rebound', 'buy']

    title = '偏悲观，且带补仓韧性'
    if sentiment_score > 58:
        title = '偏乐观，修复情绪占优'
    elif sentiment_score < 35:
        title = '偏悲观，离极端恐慌更近'

    window_start = datetime.fromtimestamp(cutoff_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    window_end = datetime.fromtimestamp(now_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    gen = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    out_dir = SITE_BASE / code
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'community.html'
    build_page(symbol, name, quote, enriched, strong, title, top_words, sentiment_score, extremity_rsi, heat_score, window_start, window_end, gen, out_path)

    print(json.dumps({
        'ok': True,
        'symbol': symbol,
        'out': str(out_path),
        'sentiment_score': sentiment_score,
        'extremity_rsi': extremity_rsi,
        'heat_score': heat_score,
        'sample_count': total,
        'lookback_days': LOOKBACK_DAYS,
        'candidate_count': len(enriched),
        'reply_count': sum(int(x.get('reply_count', 0) or 0) for x in strong),
        'top_words': top_words[:6],
        'title': title,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
