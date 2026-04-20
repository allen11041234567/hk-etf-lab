#!/usr/bin/env python3
from __future__ import annotations

import html
from pathlib import Path

from common import LATEST_DIR, PORTFOLIO_DIR, WORKSPACE, load_json

SITE_DIR = WORKSPACE / 'site' / 'arena'
ANALYST_DIR = SITE_DIR / 'analysts'
GROWTH_PAGE = SITE_DIR / 'growth.html'

AVATAR_MAP = {
    'fundamental_value': '🧾',
    'macro_allocation': '🌍',
    'dividend_defensive': '🛡️',
    'moneyflow': '💸',
    'sentiment_reversal': '🎭',
    'sector_rotation': '🔄',
    'trend_tech': '📈',
    'volatility_trader': '⚡',
    'tape_structure': '🎯',
    'meta_allocator': '🧠',
}

RISK_LABEL = {
    'low': '低风险',
    'medium_low': '中低风险',
    'medium': '中风险',
    'medium_high': '中高风险',
    'high': '高风险',
}

TEMPO_LABEL = {
    'slow': '慢节奏',
    'medium_slow': '中慢节奏',
    'medium': '中节奏',
    'medium_fast': '中快节奏',
    'fast': '快节奏',
}


def clean_name(name: str) -> str:
    text = (name or '').strip()
    for needle in ['南方东英', '南方']:
        text = text.replace(needle, '').strip()
    return ' '.join(text.split()) or (name or '')


def fmt_ts(ts: str) -> str:
    text = str(ts or '--')
    return text.replace('T', ' ').replace('+00:00', ' UTC')


def card_color(view: str) -> str:
    return {
        'bullish': '#ecfdf5',
        'bearish': '#fff1f2',
        'neutral': '#f8fafc',
    }.get(view, '#f8fafc')


def view_label(view: str) -> str:
    return {
        'bullish': '偏多',
        'bearish': '偏空',
        'neutral': '观望',
    }.get(view, '观望')


def find_portfolio(analyst_id: str) -> dict:
    return load_json(PORTFOLIO_DIR / f'{analyst_id}.json', default={})


def render_duel_block(duel_snapshot: dict) -> str:
    ranked = duel_snapshot.get('top_duels', [])[:3]
    blocks = []
    for duel in ranked:
        rows = ''.join(
            f"<tr><td>{html.escape(r['analyst_name'])}</td><td>{view_label(r['view'])}</td><td>{r['confidence']:.2f}</td><td>{r['position_target']:.0%}</td><td>{html.escape('；'.join(r['reasons']))}</td></tr>"
            for r in duel['rows']
        )
        blocks.append(f"<div class='duel-card'><div class='duel-head'><div class='duel-code'>{html.escape(duel['display_code'])}</div><div class='duel-name'>{html.escape(clean_name(duel['name']))}</div><div class='duel-meta'>分歧度 {duel['duel_score']:.2f} ｜ 观点分叉 {duel['unique_view_count']} 类 ｜ 仓位跨度 {duel['position_span']:.0%}</div></div><table><thead><tr><th>分析师</th><th>观点</th><th>置信度</th><th>仓位</th><th>理由</th></tr></thead><tbody>{rows}</tbody></table></div>")
    return ''.join(blocks)


def render_rank_block(rows: list[dict], views: list[dict], metric: str, fmt: str = 'pct', reverse_hint: str | None = None) -> str:
    def label(aid: str) -> str:
        return next((v['name'] for v in views if v['analyst_id'] == aid), aid)
    out = []
    for i, row in enumerate(rows[:3]):
        val = row.get(metric, 0)
        if fmt == 'pct':
            text = f"{val:.2%}"
        elif fmt == 'float':
            text = f"{val:.2f}"
        elif fmt == 'int':
            text = str(int(val))
        else:
            text = str(val)
        suffix = f"<span class='mini-note'>{html.escape(reverse_hint)}</span>" if reverse_hint and i == 0 else ''
        out.append(f"<div class='rank-item'><span>{i+1}. {html.escape(label(row['analyst_id']))}</span><div style='text-align:right'><b>{text}</b>{suffix}</div></div>")
    return ''.join(out)


def render_growth(growth_snapshot: dict) -> str:
    items = growth_snapshot.get('items', [])
    reinforce = sum(1 for item in items if item.get('learning_mode') == 'reinforce')
    tighten = sum(1 for item in items if item.get('learning_mode') == 'tighten')
    neutral = len(items) - reinforce - tighten
    rows = []
    for item in items:
        learned = ''.join(f"<li>{html.escape(x)}</li>" for x in item.get('weekly_learned', [])[:3]) or '<li>样本还在积累中</li>'
        extra = []
        if item.get('no_trade'):
            extra.append('今日不交易')
        if item.get('relegation_state') == 'suppressed':
            extra.append('抑制名单')
        if item.get('best_regime') and item.get('best_regime') != 'unknown':
            extra.append(f"擅长 {item.get('best_regime')}")
        if item.get('worst_regime') and item.get('worst_regime') != 'unknown':
            extra.append(f"谨慎 {item.get('worst_regime')}")
        extra_html = (' ｜ ' + ' ｜ '.join(extra)) if extra else ''
        rows.append(f"<div class='card'><div class='top'><div class='avatar'>{AVATAR_MAP.get(item['analyst_id'],'🤖')}</div><div class='grow'><div class='name'>{html.escape(item['name'])}</div><div class='tagline'>学习模式：{html.escape(item.get('learning_mode','neutral'))} ｜ 最新净值 {float(item.get('nav',1.0)):.3f}{html.escape(extra_html)}</div></div></div><div class='meta'>置信偏置 {float(item.get('confidence_bias',0)):+.2f} ｜ 仓位倍率 {float(item.get('position_multiplier',1)):.2f} ｜ 置信地板 {float(item.get('confidence_floor',0.5)):.2f} ｜ 步长 {float(item.get('applied_step_size',0.25)):.2f}</div><div class='summary'>{html.escape(item.get('latest_reason') or '')}</div><ul style='margin:10px 0 0 18px;color:#334155;line-height:1.8'>{learned}</ul></div>")
    return f"<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>Arena 成长轨迹</title><style>body{{margin:0;background:linear-gradient(180deg,#f6f8fc 0%,#eef3fb 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827}} .wrap{{max-width:1100px;margin:0 auto;padding:24px 16px 36px}} .panel,.card{{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(17,24,39,.05);margin-bottom:16px}} .chips{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}} .chip{{display:inline-block;padding:7px 11px;border-radius:999px;background:#f8fafc;border:1px solid #e5e7eb;font-size:12px;color:#334155;text-decoration:none}} .top{{display:flex;gap:12px;align-items:flex-start}} .grow{{flex:1 1 auto}} .avatar{{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;background:#111827;color:#fff;font-size:20px}} .name{{font-size:20px;font-weight:800}} .tagline{{font-size:13px;color:#64748b;margin-top:4px}} .meta{{margin-top:10px;font-size:13px;color:#64748b}} .summary{{margin-top:10px;font-size:14px;line-height:1.75;color:#334155}} .stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}} .stat{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .stat .k{{font-size:12px;color:#64748b}} .stat .v{{font-size:24px;font-weight:800;margin-top:6px}} .feature-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}} .feature{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .feature b{{display:block;margin-bottom:6px}} @media (max-width:700px){{.wrap{{padding:14px 10px 24px}}.panel,.card{{padding:14px;border-radius:18px}}.stats{{grid-template-columns:1fr 1fr;gap:8px}}.feature-grid{{grid-template-columns:1fr;gap:10px}}}}</style></head><body><div class='wrap'><div class='panel'><div class='chips'><a class='chip' href='./ai-analysts.html'>← 返回 Arena</a><a class='chip' href='../index.html'>⌂ 首页</a><span class='chip'>公开成长留痕</span></div><h1 style='margin:0 0 10px;font-size:34px'>分析师成长轨迹</h1><div class='summary'>这里不是“会成长”的口号页，而是 10 位分析师参数、学习方向和最近优化动作的公开留痕页。谁在强化，谁在收敛，为什么调，都会直接展示出来。</div><div class='stats'><div class='stat'><div class='k'>分析师数量</div><div class='v'>{len(items)}</div></div><div class='stat'><div class='k'>强化模式</div><div class='v'>{reinforce}</div></div><div class='stat'><div class='k'>收敛模式</div><div class='v'>{tighten}</div></div><div class='stat'><div class='k'>观察模式</div><div class='v'>{neutral}</div></div></div><div class='feature-grid'><div class='feature'><b>可解释</b><span>展示学习模式、参数变化和最近学到的东西，不做黑箱包装。</span></div><div class='feature'><b>可比较</b><span>所有分析师在同一产品池、同一执行规则下迭代，方便长期横向比较。</span></div><div class='feature'><b>可追踪</b><span>不是一次性人设，而是持续留痕的成长曲线，方便对外做产品化叙事。</span></div></div></div>{''.join(rows)}</div></body></html>"


def render_index(views: list[dict], leaderboard: dict, duel_snapshot: dict, eval_snapshot: dict) -> str:
    bullish = sum(1 for v in views if v['market_view'] == 'bullish')
    bearish = sum(1 for v in views if v['market_view'] == 'bearish')
    neutral = len(views) - bullish - bearish
    leader = (leaderboard.get('rankings', {}).get('return') or [{}])[0].get('analyst_id', '--')
    leader_name = next((v['name'] for v in views if v['analyst_id'] == leader), leader)
    rankings = leaderboard.get('rankings', {})
    rank_return_rows = rankings.get('return', [])
    rank_drawdown_rows = rankings.get('drawdown', [])
    rank_activity_rows = rankings.get('activity', [])
    rank_aggressive_rows = rankings.get('aggressive', [])
    rank_cash_rows = rankings.get('cash_discipline', [])
    rank_return_html = render_rank_block(rank_return_rows, views, 'return', 'pct')
    rank_drawdown_html = render_rank_block(rank_drawdown_rows, views, 'drawdown', 'pct', '越接近 0 越稳')
    rank_activity_html = render_rank_block(rank_activity_rows, views, 'activity', 'int')
    rank_aggressive_html = render_rank_block(rank_aggressive_rows, views, 'aggressiveness', 'float')
    rank_cash_html = render_rank_block(rank_cash_rows, views, 'cash_discipline', 'float')
    leader_row = rank_return_rows[0] if rank_return_rows else {}
    leader_return = float(leader_row.get('return', 0.0) or 0.0)
    leader_drawdown = float(leader_row.get('drawdown', 0.0) or 0.0)
    leader_activity = int(leader_row.get('activity', 0) or 0)
    zero = next((v for v in views if v['analyst_id'] == 'meta_allocator'), None)
    chief_html = ''
    zero_audit_html = ''
    zero_audit = load_json(LATEST_DIR / 'zero_audit_snapshot.json', default={})
    postmortem = load_json(LATEST_DIR / 'postmortem_snapshot.json', default={})
    if zero and zero.get('chief_call'):
        cc = zero['chief_call']
        no_trade_line = "<br><br><b>当前系统态度：今天可以明确允许部分分析师选择不交易/保留现金。</b>" if cc.get('no_trade_bias') else ''
        chief_html = f"<div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>裁判长 Zero 今日判词</h2><div class='sub'>今天更适合相信：<b>{html.escape(cc.get('best_style_today','--'))}</b> ｜ 当前主信号：<b>{html.escape(cc.get('trust_signal','--'))}</b><br><br>{html.escape(cc.get('one_line',''))}{no_trade_line}</div><div class='focus' style='margin-top:12px'>{''.join(f'<span class=\'pill\'>优先关注：{html.escape(x)}</span>' for x in cc.get('watchlist', []))}{''.join(f'<span class=\'pill\'>谨慎对待：{html.escape(x)}</span>' for x in cc.get('avoidlist', []))}</div></div>"
        promoted = ''.join(f"<span class='pill'>提权：{html.escape(x)}</span>" for x in cc.get('watchlist', []))
        suppressed = ''.join(f"<span class='pill'>降权：{html.escape(x)}</span>" for x in cc.get('avoidlist', []))
        zero_note = html.escape(str(zero_audit.get('note') or ''))
        zero_verdict = html.escape(str(zero_audit.get('verdict') or '--'))
        zero_audit_html = f"<div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>Zero 调度审计</h2><div class='sub'>这部分不讲情绪化结论，只讲今天为什么让某些选手站前面，为什么让某些选手退后。当前偏好风格：<b>{html.escape(cc.get('best_style_today','--'))}</b>，主信号：<b>{html.escape(cc.get('trust_signal','--'))}</b>。当前审计结论：<b>{zero_verdict}</b>。</div><div class='focus' style='margin-top:12px'>{promoted}{suppressed}</div><div class='sub' style='margin-top:12px'>{zero_note}</div></div>"
    cards = []
    for v in views:
        focus = v.get('focus_targets', [])[:2]
        focus_html = ''.join(f"<span class='pill'>{html.escape(t['display_code'])} {html.escape(clean_name(t['name'])[:12])}</span>" for t in focus)
        tags = ''.join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in v.get('style_tags', [])[:2])
        risk = RISK_LABEL.get(v.get('risk_level'), v.get('risk_level') or '')
        if risk and risk not in v.get('style_tags', []):
            tags += f"<span class='tag'>{html.escape(risk)}</span>"
        portfolio = find_portfolio(v['analyst_id'])
        growth_item = next((x for x in load_json(LATEST_DIR / 'growth_snapshot.json', default={}).get('items', []) if x.get('analyst_id') == v['analyst_id']), {})
        strength_text, _, _ = analyst_profile(v, growth_item, portfolio_metrics(portfolio))
        stance = '今天不交易' if v.get('no_trade') else view_label(v['market_view'])
        extra_meta = []
        if v.get('relegation_state') == 'suppressed':
            extra_meta.append('抑制名单')
        if v.get('best_regime') and v.get('best_regime') != 'unknown':
            extra_meta.append(f"擅长{v.get('best_regime')}")
        if v.get('worst_regime') and v.get('worst_regime') != 'unknown':
            extra_meta.append(f"谨慎{v.get('worst_regime')}")
        extra_meta_html = (' ｜ ' + ' ｜ '.join(extra_meta)) if extra_meta else ''
        cards.append(f"""
        <a class='card' href='./analysts/{v['analyst_id']}.html' style='background:{card_color(v['market_view'])}'>
          <div class='top'><div class='avatar'>{AVATAR_MAP.get(v['analyst_id'],'🤖')}</div><div class='grow'><div class='name'>{html.escape(v['name'])}</div><div class='tagline'>{html.escape(v['tagline'])}</div><div class='tags'>{tags}</div></div><div class='view'>{html.escape(stance)}</div></div>
          <div class='meta'>置信度 {v['confidence']:.2f} ｜ 目标仓位 {v['position_target']:.0%} ｜ Zero权重 {float(v.get('orchestration_weight',1.0)):.2f} ｜ 当前净值 {float(portfolio.get('nav',1.0)):.3f}{html.escape(extra_meta_html)}</div>
          <div class='summary'>{html.escape(v['public_summary']).replace('南方东英','').replace('南方','')}</div>
          <div class='summary' style='font-size:13px;color:#64748b'>强项：{html.escape(strength_text)}</div>
          <div class='focus'>{focus_html}</div>
        </a>
        """)
    duel_html = render_duel_block(duel_snapshot)
    built_at = eval_snapshot.get('built_at', '--')
    version_id = eval_snapshot.get('version_id', 'arena-a0')
    sample_start = eval_snapshot.get('sample_start') or '--'
    last_valid_trading_day = eval_snapshot.get('last_valid_trading_day') or '--'
    nav_label = eval_snapshot.get('nav_label') or '日内快照净值'
    explainer_cta = "<a class='chip' href='./daily-full-explainer.html'>21:00 全盘解释</a>"
    explainer_panel = "<div class='panel' style='border:1px solid #c7d2fe;background:linear-gradient(180deg,#f8fbff 0%,#eef4ff 100%)'><h2 style='margin:0 0 12px;font-size:24px'>21:00 全盘解释</h2><div class='sub'>这是 Arena 每个交易日晚上 21:00 的固定栏目，不是普通公告。固定包含港股市场总览、关注产品池战况、Zero 总判断、分析师分工、逐分析师解释、系统学习与明日观察。</div><div class='cta'><a class='chip' style='background:#111827;color:#fff;border-color:#111827' href='./daily-full-explainer.html'>立即进入今晚全盘解释</a></div></div>"
    explainer_hero = "<div style='margin-top:16px;padding:16px 18px;border-radius:20px;background:linear-gradient(135deg,#111827 0%,#1e3a8a 100%);color:#fff'><div style='font-size:12px;opacity:.82;margin-bottom:6px'>ARENA 固定栏目</div><div style='font-size:22px;font-weight:800;line-height:1.3'>每个交易日 21:00，全盘解释都会在这里更新</div><div style='margin-top:8px;font-size:14px;line-height:1.8;opacity:.92'>不是短摘要，是完整的港股市场 + 产品池 + Zero + 分析师下半场报告。</div><div class='cta'><a class='chip' style='background:#fff;color:#111827;border-color:#fff' href='./daily-full-explainer.html'>打开 21:00 全盘解释</a></div></div>"
    return f"""<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>AI分析师擂台</title>
    <style>
    body{{margin:0;background:linear-gradient(180deg,#f6f8fc 0%,#eef3fb 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827}}
    .wrap{{max-width:1160px;margin:0 auto;padding:24px 16px 36px}} .hero,.panel{{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(17,24,39,.05);margin-bottom:16px}}
    .chips{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}} .chip{{display:inline-block;padding:7px 11px;border-radius:999px;background:#f8fafc;border:1px solid #e5e7eb;font-size:12px;color:#334155;text-decoration:none}}
    h1{{margin:0 0 10px;font-size:34px}} .sub{{font-size:15px;line-height:1.8;color:#475569}} .stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}} .stat{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .stat .k{{font-size:12px;color:#64748b}} .stat .v{{font-size:24px;font-weight:800;margin-top:6px}}
    .duel-grid{{display:grid;grid-template-columns:1fr;gap:12px}} .duel-card{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:20px;padding:14px}} .duel-head{{margin-bottom:10px}} .duel-code{{font-size:12px;color:#64748b;font-weight:700}} .duel-name{{font-size:18px;font-weight:800;margin-top:4px}} .duel-meta{{margin-top:6px;font-size:12px;color:#64748b;line-height:1.6}} table{{width:100%;border-collapse:collapse}} th,td{{border-bottom:1px solid #e5e7eb;padding:8px 6px;text-align:left;font-size:12px;line-height:1.6;vertical-align:top}} th{{font-size:11px;color:#64748b;text-transform:uppercase}}
    .grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}} .card{{display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:22px;padding:16px;box-shadow:0 8px 24px rgba(17,24,39,.04)}}
    .top{{display:flex;gap:12px;align-items:flex-start}} .grow{{flex:1 1 auto;min-width:0}} .avatar{{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;background:#111827;color:#fff;font-size:20px;flex:0 0 44px}} .name{{font-size:20px;font-weight:800}} .tagline{{font-size:13px;color:#64748b;margin-top:4px;line-height:1.5}} .view{{margin-left:auto;padding:7px 10px;border-radius:999px;background:#fff;border:1px solid #dbe4f0;font-size:12px;font-weight:700;white-space:nowrap}} .tags{{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}} .tag{{padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #dbe4f0;font-size:11px;color:#334155}} .meta{{margin-top:10px;font-size:13px;color:#64748b}} .summary{{margin-top:10px;font-size:14px;line-height:1.75;color:#334155}} .focus{{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}} .pill{{padding:6px 9px;border-radius:999px;background:#fff;border:1px solid #dbe4f0;font-size:11px;color:#334155}} .profile-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}} .profile-card{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .profile-card b{{display:block;margin-bottom:6px}}
    .rank-grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}} .rank-col{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:12px}} .rank-col h3{{margin:0 0 10px;font-size:16px}} .rank-list{{display:grid;gap:8px}} .rank-item{{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:#fff;border:1px solid #e5e7eb;font-size:13px;align-items:flex-start}} .mini-note{{display:block;margin-top:4px;font-size:11px;color:#64748b;font-weight:500}}
    .value-grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}} .value-card{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .value-card b{{display:block;margin-bottom:6px;font-size:15px}} .mini{{font-size:12px;color:#64748b;line-height:1.7}} .cta{{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}}
    @media (max-width:700px){{.wrap{{padding:14px 10px 24px}}h1{{font-size:28px}}.sub{{font-size:14px;line-height:1.7}}.stats,.value-grid{{grid-template-columns:1fr 1fr;gap:8px}}.grid{{grid-template-columns:1fr;gap:10px}}.rank-grid{{grid-template-columns:1fr;gap:10px}}.hero,.panel{{padding:14px;border-radius:18px}}.card{{padding:14px;border-radius:18px}}.name{{font-size:18px}}th,td{{font-size:11px;padding:7px 5px}}}}
    </style></head><body><div class='wrap'>
    <div class='hero'><div class='chips'><a class='chip' href='../index.html'>⌂ 首页</a><a class='chip' href='./growth.html'>成长轨迹</a>{explainer_cta}<span class='chip'>公开测试版</span><span class='chip'>同池对打</span><span class='chip'>次日开盘统一执行</span><span class='chip'>{html.escape(version_id)}</span></div><h1>AI分析师擂台</h1><div class='sub'>这不是一堆会说话的人设卡片，而是一个把 <b>同一产品池、同一执行规则、同一公开记账</b> 放到台面上的 AI 分析师竞技场。每位分析师每天都要给出观点、仓位、重点标的和模拟实盘，后续表现继续被追踪和比较。最近一次评估快照生成于 {html.escape(fmt_ts(built_at))}。</div><div class='cta'><span class='chip'>适合看谁今天更该被信</span><span class='chip'>适合看不同风格如何分歧</span><span class='chip'>适合长期跟踪谁真的在进化</span></div>{explainer_hero}<div class='stats'><div class='stat'><div class='k'>分析师数量</div><div class='v'>{len(views)}</div></div><div class='stat'><div class='k'>今日偏多</div><div class='v'>{bullish}</div></div><div class='stat'><div class='k'>今日偏空/观望</div><div class='v'>{bearish + neutral}</div></div><div class='stat'><div class='k'>当前领跑</div><div class='v' style='font-size:20px'>{html.escape(leader_name)}</div></div></div><div class='value-grid'><div class='value-card'><b>当前领跑战绩</b><div class='mini'>收益 {leader_return:+.2%} ｜ 最大回撤 {leader_drawdown:.2%} ｜ 成交 {leader_activity} 笔</div></div><div class='value-card'><b>样本区间</b><div class='mini'>{html.escape(sample_start)} 至 {html.escape(last_valid_trading_day)}，只按有效交易日统计。</div></div><div class='value-card'><b>净值口径</b><div class='mini'>当前展示为 <b>{html.escape(nav_label)}</b>。白天快照不等于正式收盘净值，盘后流程才代表更完整的日终观察。</div></div><div class='value-card'><b>当前阶段</b><div class='mini'>现在已经不是 demo 拼图，而是有排行、有留痕、有成长链路的公开测试版。</div></div></div></div>
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>为什么这个擂台值得看</h2><div class='value-grid'><div class='value-card'><b>同一规则</b><div class='mini'>所有分析师都在同一主战池下出手，执行规则统一，不允许各玩各的。</div></div><div class='value-card'><b>公开留痕</b><div class='mini'>观点、仓位、待执行订单、最近交易和净值曲线都公开展示，不只给一句结论。</div></div><div class='value-card'><b>持续成长</b><div class='mini'>不是固定人设，参数、学习模式和最近优化方向单独留痕，可追踪谁真的变强。</div></div><div class='value-card'><b>可直接使用</b><div class='mini'>你既可以看今天谁更强，也可以看某只标的上最分歧的对打和风格冲突。</div></div></div></div>
    {explainer_panel}
    {chief_html}
    {zero_audit_html}
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>系统复盘摘要</h2><div class='sub' style='margin-top:0'>当前复盘层不是为了装懂，而是为了回答“这批判断现在处于什么可信阶段”。最近一次系统结论：<b>{html.escape(str((postmortem.get('items') or [{}])[0].get('issue_code') if postmortem.get('items') else '--'))}</b>。这通常意味着样本不足或判断仍在早期验证阶段，不能过度解读短样本输赢。</div></div>
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>今日焦点标的对打</h2><div class='sub' style='margin-top:0;margin-bottom:12px'>优先展示当前分歧最大的标的，方便快速看出哪类风格正在互相打架。</div><div class='duel-grid'>{duel_html}</div></div>
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>当前排行榜</h2><div class='sub' style='margin-top:0;margin-bottom:12px'>同一规则下不只看赚没赚钱，还看回撤控制、调仓活跃度、进攻性，以及“不交易是否真的有纪律价值”，避免“只凭一条收益线下结论”。</div><div class='rank-grid'><div class='rank-col'><h3>收益榜</h3><div class='rank-list'>{rank_return_html}</div></div><div class='rank-col'><h3>回撤控制榜</h3><div class='rank-list'>{rank_drawdown_html}</div></div><div class='rank-col'><h3>调仓活跃榜</h3><div class='rank-list'>{rank_activity_html}</div></div><div class='rank-col'><h3>进攻榜</h3><div class='rank-list'>{rank_aggressive_html}</div></div></div><div class='rank-grid' style='margin-top:12px'><div class='rank-col'><h3>空仓纪律榜</h3><div class='rank-list'>{rank_cash_html}</div></div></div></div>
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>10位分析师</h2><div class='sub' style='margin-top:0;margin-bottom:12px'>每位分析师都有独立详情页，能继续下钻看学习留痕、模拟实盘、近期交易、决策框架与禁做条件。当前重点不是包装“谁值得跟”，而是把每位选手的规则边界做实。</div><div class='grid'>{''.join(cards)}</div></div>
    <div class='panel'><h2 style='margin:0 0 12px;font-size:24px'>怎么理解这个产品</h2><div class='value-grid'><div class='value-card'><b>用法 1</b><div class='mini'>把它当作“每日风格雷达”，先看 Zero 今日更适合信哪一派。</div></div><div class='value-card'><b>用法 2</b><div class='mini'>把它当作“分歧发现器”，直接看同一标的上谁看多、谁看空、理由差在哪。</div></div><div class='value-card'><b>用法 3</b><div class='mini'>把它当作“长期赛马场”，跟踪哪些分析师在持续变聪明，而不是偶尔说对。</div></div><div class='value-card'><b>说明</b><div class='mini'>当前为公开测试版，重点是可比性、可解释性和长期成长留痕，不是即时交易建议。</div></div></div></div></div></body></html>"""


def nav_svg(nav_history: list[dict]) -> str:
    rows = nav_history[-30:] or [{'date': '--', 'nav': 1.0, 'equity': 1000000.0}]
    vals = [float(x.get('nav', 1.0) or 1.0) for x in rows]
    if len(vals) < 2:
        rows = rows + [rows[-1]]
        vals = vals + vals[:1]
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 0.001
    pts = []
    for i, val in enumerate(vals):
        x = 18 + (324 * i / max(1, len(vals) - 1))
        y = 78 - ((val - lo) / span) * 48
        pts.append((x, y, val))
    point_str = ' '.join(f'{x:.1f},{y:.1f}' for x, y, _ in pts)
    first = rows[0]
    last = rows[-1]
    first_date = str(first.get('date', '--'))
    last_date = str(last.get('date', '--'))
    first_nav = float(first.get('nav', 1.0) or 1.0)
    last_nav = float(last.get('nav', 1.0) or 1.0)
    total_return = last_nav - 1.0
    top_label = f'最高净值 {hi:.3f}'
    bottom_label = f'最低净值 {lo:.3f}'
    return f"""
    <div style='margin-top:10px'>
      <svg viewBox='0 0 360 118' style='width:100%;height:118px;display:block;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px'>
        <line x1='18' y1='18' x2='18' y2='78' stroke='#cbd5e1' stroke-width='1'/>
        <line x1='18' y1='78' x2='342' y2='78' stroke='#cbd5e1' stroke-width='1'/>
        <text x='18' y='13' font-size='10' fill='#64748b'>{html.escape(top_label)}</text>
        <text x='18' y='92' font-size='10' fill='#64748b'>{html.escape(first_date)}</text>
        <text x='302' y='92' font-size='10' fill='#64748b'>{html.escape(last_date)}</text>
        <text x='286' y='13' font-size='10' fill='#64748b'>{html.escape(bottom_label)}</text>
        <polyline points='{point_str}' fill='none' stroke='#2563eb' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/>
        <circle cx='{pts[0][0]:.1f}' cy='{pts[0][1]:.1f}' r='2.8' fill='#2563eb'/>
        <circle cx='{pts[-1][0]:.1f}' cy='{pts[-1][1]:.1f}' r='3.2' fill='#1d4ed8'/>
        <text x='18' y='108' font-size='10' fill='#475569'>起点净值 {first_nav:.3f}</text>
        <text x='222' y='108' font-size='10' fill='#1d4ed8'>最新净值 {last_nav:.3f} ｜ 累计收益 {total_return:+.2%}</text>
      </svg>
    </div>
    """


def portfolio_metrics(portfolio: dict) -> dict:
    nav_history = portfolio.get('nav_history', [])
    navs = [float(x.get('nav', 1.0) or 1.0) for x in nav_history] or [float(portfolio.get('nav', 1.0) or 1.0)]
    peak = navs[0]
    max_dd = 0.0
    for nav in navs:
        peak = max(peak, nav)
        drawdown = (nav / peak - 1.0) if peak else 0.0
        max_dd = min(max_dd, drawdown)
    return {
        'days': len(nav_history),
        'total_return': navs[-1] - 1.0,
        'max_drawdown': max_dd,
        'trade_count': len(portfolio.get('trades', [])),
    }


def decision_framework(v: dict, metrics: dict) -> dict:
    tags = set(v.get('style_tags', []))
    risk = v.get('risk_level') or ''
    tempo = v.get('tempo') or ''
    confidence = float(v.get('confidence', 0) or 0)
    position = float(v.get('position_target', 0) or 0)

    trigger = []
    veto = []
    failure = []

    if '趋势' in tags or '技术面' in tags:
        trigger.append('趋势方向明确且确认信号未被破坏')
        veto.append('震荡反复、方向来回切换时不重仓')
        failure.append('一旦趋势确认失效，优先撤退而不是硬扛')
    if '量价' in tags or '结构' in tags:
        trigger.append('量价结构同步改善，价格突破不是空心上涨')
        veto.append('放量不足或突破质量差时不追')
        failure.append('关键结构位被跌破后，原判断应视为失效')
    if '资金面' in tags or '活跃度' in tags:
        trigger.append('量能和活跃度持续支持当前方向')
        veto.append('量能掉队、热度降温时不追价')
        failure.append('资金确认消失后，原先的顺势逻辑不再成立')
    if '反转' in tags or '情绪' in tags:
        trigger.append('情绪出现明显过热或过冷，赔率转向极端')
        veto.append('情绪尚未极端时不抢跑反转')
        failure.append('若趋势继续强化，逆向判断必须快速认错')
    if '防守' in tags or '红利' in tags:
        trigger.append('回撤控制优先，防守资产承接仍在')
        veto.append('高弹性主线加速时，不抢做最强进攻段')
        failure.append('若防守资产失去承接，慢节奏优势会消失')
    if '宏观' in tags or '配置' in tags:
        trigger.append('跨市场或大类资产相对顺风时才提高配置权重')
        veto.append('单一事件噪音不足以推翻整体配置框架')
        failure.append('宏观主线切换后，旧配置逻辑必须整体重估')
    if '元分析' in tags:
        trigger.append('只有当某类风格占优证据足够多时才提权')
        veto.append('分歧过大且证据不集中时，不强推单一路线')
        failure.append('若被提权的风格连续失手，Zero 调度本身要被问责')

    if confidence < 0.6:
        veto.append('当前置信度仍不高，信号说服力有限')
    if position > 0.75 and risk == 'high':
        failure.append('高风险高仓位组合对时机错误非常敏感')
    if tempo in {'fast', 'medium_fast'}:
        veto.append('慢节奏账户不适合照搬这种节奏')

    trigger = trigger[:2] or ['当前触发条件仍在观察中']
    veto = veto[:2] or ['当前没有额外禁做提示']
    failure = failure[:2] or ['当前主要失效条件仍在观察中']
    return {
        'trigger': '；'.join(trigger),
        'veto': '；'.join(veto),
        'failure': '；'.join(failure),
        'rule_text': '统一规则为当日收盘形成观点，下一有效交易日开盘执行。非交易日页面更新不触发成交。',
    }


def analyst_profile(v: dict, growth_item: dict, metrics: dict) -> tuple[str, str, str]:
    tags = set(v.get('style_tags', []))
    risk = v.get('risk_level')
    tempo = v.get('tempo')
    learning_mode = growth_item.get('learning_mode', 'neutral')
    strengths = []
    risks = []
    fit = []

    if '波动' in tags or '事件' in tags:
        strengths.append('擅长抓高弹性与事件驱动机会')
        risks.append('容易在噪音放大时显得激进')
    if '防守' in tags or '红利' in tags:
        strengths.append('擅长守住回撤并稳定底仓节奏')
        risks.append('行情单边进攻时可能显得偏慢')
    if '资金面' in tags or '活跃度' in tags:
        strengths.append('擅长跟踪热度、量能和资金迁移')
        risks.append('量能失真时容易追到半拍')
    if '趋势' in tags or '技术面' in tags:
        strengths.append('擅长在确认后的方向里持续跟进')
        risks.append('震荡市里容易被来回打脸')
    if '量价' in tags or '结构' in tags:
        strengths.append('擅长看结构破位和量价是否配合')
        risks.append('对假突破会更敏感')
    if '宏观' in tags or '配置' in tags:
        strengths.append('擅长做更均衡的跨市场配置判断')
        risks.append('爆发行情里可能不如进攻派锐利')
    if '元分析' in tags:
        strengths.append('擅长决定今天更该信哪一类人')
        risks.append('更像调度者，不是单一打法选手')
    if '反转' in tags or '情绪' in tags:
        strengths.append('擅长在拥挤交易里寻找反身性机会')
        risks.append('趋势持续时会显得过早谨慎')

    if risk in ['low', 'medium_low']:
        fit.append('更适合偏稳、偏配置、偏回撤控制场景')
    elif risk in ['medium', 'medium_high']:
        fit.append('更适合做主线判断与中等强度出手')
    else:
        fit.append('更适合高弹性、强节奏、短决策窗口场景')

    if tempo in ['slow', 'medium_slow']:
        fit.append('适合配合更慢节奏账户或底仓决策')
    elif tempo in ['medium', 'medium_fast']:
        fit.append('适合作为多数交易日的常规参考')
    else:
        fit.append('更适合需要快速反应的交易视角')

    if learning_mode == 'reinforce':
        fit.append('最近处于强化阶段，说明当前打法暂时被系统认可')
    elif learning_mode == 'tighten':
        fit.append('最近处于收敛阶段，说明系统在压缩其失误边界')
    else:
        fit.append('最近处于观察阶段，说明系统暂时不急着大调参数')

    if metrics.get('max_drawdown', 0) <= -0.01:
        risks.append('近期回撤已经偏大，需要结合仓位理解')
    if metrics.get('trade_count', 0) <= 2:
        risks.append('当前成交样本仍偏少，结论可信度有限')

    strengths = strengths[:2] or ['目前主要优势还在持续观察中']
    risks = risks[:2] or ['当前明显短板暂不突出，但样本还不够长']
    fit = fit[:3]
    return '；'.join(strengths), '；'.join(risks), '；'.join(fit)


def render_analyst(v: dict) -> str:
    rows = []
    for t in v.get('focus_targets', []):
        rows.append(f"<tr><td>{html.escape(t['display_code'])}</td><td>{html.escape(clean_name(t['name']))}</td><td>{view_label(t['view'])}</td><td>{t['confidence']:.2f}</td><td>{t['position_target']:.0%}</td><td>{html.escape('；'.join(t['reasons']))}</td></tr>")
    learning_state = load_json(LATEST_DIR / 'learning_state.json', default={}).get('analysts', {}).get(v['analyst_id'], {})
    growth_snapshot = load_json(LATEST_DIR / 'growth_snapshot.json', default={})
    growth_item = next((x for x in growth_snapshot.get('items', []) if x.get('analyst_id') == v['analyst_id']), {})
    tag_list = list(v.get('style_tags', []))
    risk = RISK_LABEL.get(v.get('risk_level'), v.get('risk_level') or '')
    tempo = TEMPO_LABEL.get(v.get('tempo'), v.get('tempo') or '')
    for extra in [risk, tempo]:
        if extra and extra not in tag_list:
            tag_list.append(extra)
    tags = ''.join(f"<span class='tag'>{html.escape(tag)}</span>" for tag in tag_list)
    portfolio = find_portfolio(v['analyst_id'])
    metrics = portfolio_metrics(portfolio)
    strength_text, risk_text, fit_text = analyst_profile(v, growth_item, metrics)
    framework = decision_framework(v, metrics)
    history = portfolio.get('history', [])[-5:][::-1]
    hist_rows = ''.join(f"<tr><td>{html.escape(x['date'])}</td><td>{view_label(x['market_view'])}</td><td>{x['position_target']:.0%}</td><td>{html.escape(x['summary'])}</td></tr>" for x in history)
    pending = portfolio.get('pending_order') or {}
    holdings = portfolio.get('holdings', [])
    holding_rows = ''.join(f"<tr><td>{html.escape(h.get('display_code', h.get('symbol','--')))}</td><td>{html.escape(clean_name(h.get('name','--')))}</td><td>{h.get('shares',0)}</td><td>{float(h.get('cost',0)):.3f}</td></tr>" for h in holdings) or "<tr><td colspan='4'>当前空仓</td></tr>"
    trade_rows = ''.join(f"<tr><td>{html.escape(t.get('date','--'))}</td><td>{html.escape(t.get('side','--'))}</td><td>{html.escape(t.get('symbol','--'))}</td><td>{float(t.get('price',0)):.3f}</td><td>{int(t.get('shares',0))}</td><td>{float(t.get('fee',0)):.2f}</td></tr>" for t in portfolio.get('trades', [])[-5:][::-1]) or "<tr><td colspan='6'>暂无成交记录</td></tr>"
    pending_html = '无待执行订单'
    if pending:
        pending_html = f"次日开盘执行：{html.escape(pending.get('display_code','--'))} {html.escape(clean_name(pending.get('name','--')))}，目标仓位 {pending.get('target_position',0):.0%}"
    learned = ''.join(f"<li>{html.escape(x)}</li>" for x in growth_item.get('weekly_learned', [])[:3]) or '<li>样本还在积累中</li>'
    orchestration_note = html.escape(v.get('orchestration_note') or 'Zero 今日没有额外加减权说明。')
    learning_reason = html.escape(learning_state.get('latest_reason') or v.get('learning_update') or '暂无')
    sample_start = portfolio.get('nav_history', [{}])[0].get('date', '--') if portfolio.get('nav_history') else '--'
    sample_end = portfolio.get('nav_history', [{}])[-1].get('date', '--') if portfolio.get('nav_history') else '--'
    stance_label = '今天不交易' if v.get('no_trade') else view_label(v['market_view'])
    relegation_note = ''
    if v.get('relegation_state') == 'suppressed':
        relegation_note = "<div class='sub' style='margin-top:8px;color:#b45309'><b>当前处于抑制名单：</b>系统会降低这位分析师的默认话语权与出手优先级，直到后验表现修复。</div>"
    regime_note = ''
    if v.get('best_regime') and v.get('best_regime') != 'unknown':
        regime_note = f"<div class='sub' style='margin-top:8px;color:#64748b'><b>环境适配：</b>更擅长 {html.escape(str(v.get('best_regime')))}，更应谨慎 {html.escape(str(v.get('worst_regime','unknown')))}。</div>"
    return f"""<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>{html.escape(v['name'])}｜AI分析师擂台</title>
    <style>
    body{{margin:0;background:linear-gradient(180deg,#f7f9fc 0%,#edf3fb 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827}}
    .wrap{{max-width:980px;margin:0 auto;padding:24px 16px 36px}} .panel{{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(17,24,39,.05);margin-bottom:16px}}
    .chips{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}} .chip{{display:inline-block;padding:7px 11px;border-radius:999px;background:#f8fafc;border:1px solid #e5e7eb;font-size:12px;color:#334155;text-decoration:none}}
    .top{{display:flex;gap:14px;align-items:flex-start}} .avatar{{width:56px;height:56px;border-radius:999px;display:grid;place-items:center;background:#111827;color:#fff;font-size:24px;flex:0 0 56px}} .name{{font-size:30px;font-weight:800}} .tagline{{font-size:14px;color:#64748b;margin-top:6px}} .view{{margin-top:10px;display:inline-block;padding:8px 12px;border-radius:999px;background:#eef4ff;border:1px solid #cfe0ff;font-size:13px;font-weight:700;color:#1d4ed8}}
    .tagline2{{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}} .tag{{padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #dbe4f0;font-size:11px;color:#334155}}
    .sub{{margin-top:12px;font-size:15px;line-height:1.8;color:#334155}} .stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}} .stat{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .stat .k{{font-size:12px;color:#64748b}} .stat .v{{font-size:22px;font-weight:800;margin-top:6px}} .follow-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}} .follow-card{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px}} .follow-card b{{display:block;margin-bottom:6px}}
    table{{width:100%;border-collapse:collapse;margin-top:8px}} th,td{{border-bottom:1px solid #e5e7eb;padding:10px 8px;text-align:left;font-size:13px;line-height:1.6;vertical-align:top}} th{{font-size:12px;color:#64748b;text-transform:uppercase}}
    ul{{margin:8px 0 0 18px;color:#334155;line-height:1.8}}
    @media (max-width:700px){{.wrap{{padding:14px 10px 24px}}.panel{{padding:14px;border-radius:18px}}.top{{gap:10px}}.avatar{{width:46px;height:46px;flex-basis:46px;font-size:20px}}.name{{font-size:24px}}.tagline{{font-size:13px}}.stats{{grid-template-columns:1fr 1fr;gap:8px}}th,td{{font-size:12px;padding:8px 6px}}}}
    </style></head><body><div class='wrap'><div class='panel'><div class='chips'><a class='chip' href='../ai-analysts.html'>← 返回擂台</a><a class='chip' href='../growth.html'>成长轨迹</a><a class='chip' href='../../index.html'>⌂ 首页</a></div><div class='top'><div class='avatar'>{AVATAR_MAP.get(v['analyst_id'],'🤖')}</div><div><div class='name'>{html.escape(v['name'])}</div><div class='tagline'>{html.escape(v['tagline'])}</div><div class='tagline2'>{tags}</div><div class='view'>今日结论：{stance_label}</div></div></div><div class='stats'><div class='stat'><div class='k'>置信度</div><div class='v'>{v['confidence']:.2f}</div></div><div class='stat'><div class='k'>目标仓位</div><div class='v'>{v['position_target']:.0%}</div></div><div class='stat'><div class='k'>Zero权重</div><div class='v'>{float(v.get('orchestration_weight',1.0)):.2f}</div></div><div class='stat'><div class='k'>更新日期</div><div class='v' style='font-size:18px'>{html.escape(v['date'])}</div></div></div><div class='sub'>{html.escape(v['public_summary']).replace('南方东英','').replace('南方','')}</div>{relegation_note}{regime_note}</div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>决策框架与禁做条件</h2><div class='follow-grid'><div class='follow-card'><b>出手门槛</b><div class='mini'>{html.escape(framework['trigger'])}</div></div><div class='follow-card'><b>禁做条件</b><div class='mini'>{html.escape(framework['veto'])}</div></div><div class='follow-card'><b>失效条件</b><div class='mini'>{html.escape(framework['failure'])}</div></div></div><div class='sub' style='margin-top:10px;color:#64748b'>执行口径：{html.escape(framework['rule_text'])}</div></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>选手画像</h2><div class='profile-grid'><div class='profile-card'><b>擅长什么</b><div class='mini'>{html.escape(strength_text)}</div></div><div class='profile-card'><b>潜在短板</b><div class='mini'>{html.escape(risk_text)}</div></div><div class='profile-card'><b>更适合什么场景</b><div class='mini'>{html.escape(fit_text)}</div></div></div></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>Zero 调度说明</h2><div class='sub' style='margin-top:0'>{orchestration_note}</div></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>学习与变聪明记录</h2><div class='sub' style='margin-top:0'>学习模式：{html.escape(str(growth_item.get('learning_mode','neutral')))} ｜ 最新调整：{learning_reason}<br>置信偏置 {float(growth_item.get('confidence_bias',0)):+.2f} ｜ 仓位倍率 {float(growth_item.get('position_multiplier',1)):.2f} ｜ 置信地板 {float(growth_item.get('confidence_floor',0.5)):.2f} ｜ 步长 {float(growth_item.get('applied_step_size',0.25)):.2f}</div><ul>{learned}</ul></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>模拟实盘摘要</h2><div class='sub' style='margin-top:0'>当前净值 {portfolio.get('nav',1.0):.3f} ｜ 当前权益 {float(portfolio.get('equity',1000000.0)):,.0f} ｜ 持仓市值 {float(portfolio.get('holdings_value',0.0)):,.0f} ｜ 待执行订单：{html.escape(pending_html)}</div><div class='sub' style='margin-top:8px;color:#64748b'>样本区间：{html.escape(sample_start)} 至 {html.escape(sample_end)} ｜ 最近有效交易日：{html.escape(sample_end)} ｜ 页面更新时间不等于成交日</div><div class='stats'><div class='stat'><div class='k'>累计收益</div><div class='v' style='font-size:18px'>{metrics['total_return']:+.2%}</div></div><div class='stat'><div class='k'>最大回撤</div><div class='v' style='font-size:18px'>{metrics['max_drawdown']:.2%}</div></div><div class='stat'><div class='k'>成交笔数</div><div class='v'>{metrics['trade_count']}</div></div><div class='stat'><div class='k'>净值样本天数</div><div class='v'>{metrics['days']}</div></div></div>{nav_svg(portfolio.get('nav_history', []))}<table><thead><tr><th>持仓代码</th><th>产品</th><th>股数</th><th>成本价</th></tr></thead><tbody>{holding_rows}</tbody></table></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>最近交易</h2><table><thead><tr><th>日期</th><th>方向</th><th>代码</th><th>价格</th><th>股数</th><th>费用</th></tr></thead><tbody>{trade_rows}</tbody></table></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>今日重点标的</h2><table><thead><tr><th>代码</th><th>产品</th><th>观点</th><th>置信度</th><th>目标仓位</th><th>理由</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div><div class='panel'><h2 style='margin:0 0 10px;font-size:24px'>最近观点记录</h2><table><thead><tr><th>日期</th><th>市场判断</th><th>仓位</th><th>摘要</th></tr></thead><tbody>{hist_rows}</tbody></table></div></div></body></html>"""


def main() -> None:
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    ANALYST_DIR.mkdir(parents=True, exist_ok=True)
    analyst_blob = load_json(LATEST_DIR / 'analyst_views.json', default={'analyst_views': []})
    leaderboard = load_json(LATEST_DIR / 'leaderboard.json', default={})
    duel_snapshot = load_json(LATEST_DIR / 'duel_snapshot.json', default={})
    eval_snapshot = load_json(LATEST_DIR / 'eval_snapshot.json', default={})
    growth_snapshot = load_json(LATEST_DIR / 'growth_snapshot.json', default={})
    views = analyst_blob.get('analyst_views', [])
    (SITE_DIR / 'ai-analysts.html').write_text(render_index(views, leaderboard, duel_snapshot, eval_snapshot))
    GROWTH_PAGE.write_text(render_growth(growth_snapshot))
    for v in views:
        (ANALYST_DIR / f"{v['analyst_id']}.html").write_text(render_analyst(v))
    print(f'wrote {SITE_DIR / "ai-analysts.html"}')
    print(f'wrote {GROWTH_PAGE}')
    print(f'wrote {len(views)} analyst pages')


if __name__ == '__main__':
    main()
