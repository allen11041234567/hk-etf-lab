#!/usr/bin/env python3
from __future__ import annotations

import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path('/root/.openclaw/workspace')
LATEST = WORKSPACE / 'data' / 'arena' / 'latest'
PORT = WORKSPACE / 'portfolio' / 'arena'
OUT = WORKSPACE / 'memory' / 'arena-full-explainer-latest.txt'
OUT_HTML = WORKSPACE / 'site' / 'arena' / 'daily-full-explainer.html'

NAME_MAP = {
    'dividend_defensive': '周守拙',
    'fundamental_value': '纪慎行',
    'macro_allocation': '顾衡',
    'meta_allocator': '裁判长 Zero',
    'moneyflow': '邵流川',
    'sector_rotation': '叶轮',
    'sentiment_reversal': '林逆',
    'tape_structure': '韩策',
    'trend_tech': '唐右',
    'volatility_trader': '乔震',
}

MARKET_PROXY = {
    'hsi': '03037.HK',
    'hstech': '03033.HK',
    'a50': '02822.HK',
    'nasdaq': '03034.HK',
    'hk_korea_tech': '03431.HK',
    'biotech': '03174.HK',
    'short_hstech': '07552.HK',
    'long_hstech_2x': '07226.HK',
}


def load(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def pct(x: float) -> str:
    return f"{x*100:+.2f}%"


def money(x: float) -> str:
    return f"{x:,.0f}"


def yesno(v: bool) -> str:
    return '是' if v else '否'


def view_label(v: str) -> str:
    return {
        'bullish': '偏多',
        'bearish': '偏空',
        'neutral': '观望',
    }.get(v, v or '--')


def action_label(v: str) -> str:
    return {
        'hold': '持有',
        'increase': '加仓',
        'reduce': '减仓',
        'switch': '切换',
        'exit': '退出',
    }.get(v, v or '--')


def clean_name(name: str) -> str:
    if not name:
        return '--'
    for token in ['南方东英', '工银南方东英', '南方富时中国', '南方富时']:
        name = name.replace(token, '')
    return name.strip()


def safe_float(v, default=0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def feature_change_pct(feature: dict) -> float:
    quote = feature.get('quote_raw') or {}
    prev_close = safe_float(quote.get('prev_close'))
    last = safe_float(quote.get('last') or feature.get('close'))
    if not prev_close:
        return 0.0
    return (last / prev_close) - 1.0


def find_feature(features_by_symbol: dict, symbol: str) -> dict:
    return features_by_symbol.get(symbol, {})


def summarize_market(features: list[dict], features_by_symbol: dict) -> list[str]:
    lines = []
    main_pool = [f for f in features if f.get('layer') == 'main']
    up_count = sum(1 for f in main_pool if feature_change_pct(f) > 0)
    down_count = sum(1 for f in main_pool if feature_change_pct(f) < 0)
    flat_count = len(main_pool) - up_count - down_count

    hsi = find_feature(features_by_symbol, MARKET_PROXY['hsi'])
    hstech = find_feature(features_by_symbol, MARKET_PROXY['hstech'])
    a50 = find_feature(features_by_symbol, MARKET_PROXY['a50'])
    long2x = find_feature(features_by_symbol, MARKET_PROXY['long_hstech_2x'])
    short2x = find_feature(features_by_symbol, MARKET_PROXY['short_hstech'])
    hk_korea = find_feature(features_by_symbol, MARKET_PROXY['hk_korea_tech'])
    biotech = find_feature(features_by_symbol, MARKET_PROXY['biotech'])

    hsi_chg = feature_change_pct(hsi)
    hstech_chg = feature_change_pct(hstech)
    a50_chg = feature_change_pct(a50)
    long2x_chg = feature_change_pct(long2x)
    short2x_chg = feature_change_pct(short2x)
    hk_korea_chg = feature_change_pct(hk_korea)
    biotech_chg = feature_change_pct(biotech)

    if hsi_chg > 0 and hstech_chg > 0 and long2x_chg > 0 and short2x_chg < 0:
        tone = '今天港股收盘更接近偏多震荡，指数没有失速，场内风险偏好也没有明显退潮。'
    elif hsi_chg < 0 and hstech_chg < 0:
        tone = '今天港股收盘偏弱，指数和科技同时承压，市场防守意味更重。'
    else:
        tone = '今天港股更像结构市，表面不算单边，但资金在不同主线之间做了明显取舍。'

    if hstech_chg > hsi_chg + 0.003:
        style_line = '风格上，科技跑赢宽基，说明资金更愿意为高弹性和成长方向付溢价。'
    elif hsi_chg > hstech_chg + 0.003:
        style_line = '风格上，宽基强于科技，说明市场虽然偏多，但更倾向先做稳健扩散而不是猛追高弹性。'
    else:
        style_line = '风格上，宽基和科技差距不大，市场不是纯进攻，也不是纯防守，而是在边走边筛选主线。'

    if hk_korea_chg > 0 and biotech_chg < 0:
        pool_line = '从主池映射看，跨市场科技仍在承接资金，生物科技相对偏弱，说明主线集中度还在科技链。'
    elif biotech_chg > hk_korea_chg:
        pool_line = '从主池映射看，生物科技相对更有弹性，说明市场并非只抱团单一科技主线。'
    else:
        pool_line = '从主池映射看，主线并不单一，但科技相关资产仍然占据更高关注度。'

    if long2x_chg > 0 and short2x_chg < 0:
        leverage_line = '杠杆验证层面，做多恒科走强、做空恒科回落，说明短线资金整体还是在往风险资产一侧站。'
    else:
        leverage_line = '杠杆验证层面，多空产品没有形成单边共识，说明追价资金并不算特别坚决。'

    lines.append(tone)
    lines.append(
        f"盘面抓手：恒指代理 03037 {pct(hsi_chg)}，恒科代理 03033 {pct(hstech_chg)}，A50 代理 02822 {pct(a50_chg)}，主池上涨 {up_count} 只，下跌 {down_count} 只，平盘 {flat_count} 只。"
    )
    lines.append(style_line)
    lines.append(pool_line)
    lines.append(leverage_line)
    return lines


def summarize_pool(features: list[dict], duel: dict) -> list[str]:
    lines = []
    main_pool = [f for f in features if f.get('layer') == 'main']
    ranked = sorted(main_pool, key=feature_change_pct, reverse=True)
    top3 = ranked[:3]
    bottom3 = ranked[-3:]
    hottest = sorted(main_pool, key=lambda f: safe_float((f.get('quote_raw') or {}).get('turnover')), reverse=True)[:3]

    lines.append('强势产品：' + '；'.join(
        f"{f.get('display_code')} {clean_name(f.get('name',''))} {pct(feature_change_pct(f))}" for f in top3
    ))
    lines.append('偏弱产品：' + '；'.join(
        f"{f.get('display_code')} {clean_name(f.get('name',''))} {pct(feature_change_pct(f))}" for f in bottom3
    ))
    lines.append('资金最集中的产品：' + '；'.join(
        f"{f.get('display_code')} {clean_name(f.get('name',''))} 成交额 {money(safe_float((f.get('quote_raw') or {}).get('turnover')))}" for f in hottest
    ))

    category_strength = defaultdict(list)
    for f in main_pool:
        category_strength[f.get('category', 'other')].append(feature_change_pct(f))
    cat_avg = {k: sum(v) / len(v) for k, v in category_strength.items() if v}
    ordered_cat = sorted(cat_avg.items(), key=lambda x: x[1], reverse=True)
    cat_name_map = {
        'growth_technology': '科技成长',
        'broad_equity': '宽基',
        'defensive_income': '防守收益',
        'cross_market_theme': '跨市场主题',
        'leveraged_inverse': '杠反产品',
    }
    if ordered_cat:
        mainline = cat_name_map.get(ordered_cat[0][0], ordered_cat[0][0])
        mainline_ret = pct(ordered_cat[0][1])
        weakline = cat_name_map.get(ordered_cat[-1][0], ordered_cat[-1][0])
        weakline_ret = pct(ordered_cat[-1][1])
        lines.append(f"主线判断：今天最强的是{mainline}（均值 {mainline_ret}），最弱的是{weakline}（均值 {weakline_ret}）。")

    hot_names = [clean_name(f.get('name','')) for f in hottest]
    if any('恒生科技ETF' in n or '美股七巨头ETF' in n or '纳斯达克100ETF' in n or '香港韩国科技+指数ETF' in n for n in hot_names):
        lines.append('产品池结论：资金还在围着科技和高弹性资产打，说明 Arena 里进攻派拿到更高话语权是有盘面基础的。')
    else:
        lines.append('产品池结论：资金没有只抱团高弹性，说明 Zero 不能简单把话语权全部给进攻派。')

    duel_rows = duel.get('top_duels') or []
    if duel_rows:
        d = duel_rows[0]
        lines.append(
            f"最大分歧点：{d.get('display_code')} {clean_name(d.get('name',''))}，分歧度 {safe_float(d.get('duel_score')):.2f}。这说明今天真正值得盯的不是“市场涨没涨”，而是这条主线还能不能继续扩散。"
        )
    return lines


def summarize_zero(chief_call: dict, zero_audit: dict, duel: dict) -> list[str]:
    lines = []
    lines.append(f"Zero 当前总判断：{chief_call.get('one_line','--')}")
    lines.append(
        f"系统主信号：{chief_call.get('trust_signal','--')} ｜ 今日更偏向：{chief_call.get('best_style_today','--')} ｜ 当前系统动作：{chief_call.get('global_action','--')}"
    )
    lines.append(f"Zero 审计：{zero_audit.get('verdict','--')}。{zero_audit.get('note','')}")
    if chief_call.get('promoted_analysts'):
        lines.append('今日提权：' + '、'.join(chief_call.get('promoted_analysts') or []))
    if chief_call.get('suppressed_analysts'):
        lines.append('今日压权：' + '、'.join(chief_call.get('suppressed_analysts') or []))
    if duel.get('top_duels'):
        duel_lines = []
        for d in duel.get('top_duels', [])[:3]:
            duel_lines.append(f"{d.get('display_code')} {clean_name(d.get('name',''))}（分歧度 {safe_float(d.get('duel_score')):.2f}）")
        lines.append('最有分歧的战场：' + '；'.join(duel_lines))
    return lines


def analyst_line(view: dict, book: dict, postmortem_map: dict) -> list[str]:
    aid = view['analyst_id']
    name = NAME_MAP.get(aid, aid)
    nav = safe_float(book.get('nav', 1.0), 1.0)
    ret = nav - 1.0
    trades = book.get('trades', [])
    holdings = book.get('holdings', [])
    focus = (view.get('focus_targets') or [{}])[0]
    issue = postmortem_map.get(aid, {})
    lines = [f"【{name}】"]
    lines.append(
        f"当前结论：{'今天不交易' if view.get('no_trade') else view_label(view.get('market_view'))} ｜ 目标仓位 {safe_float(view.get('position_target',0)):.0%} ｜ Zero权重 {safe_float(view.get('orchestration_weight',1.0)):.2f} ｜ 抑制名单 {yesno(view.get('relegation_state') == 'suppressed')}"
    )
    lines.append(
        f"当前状态：净值 {nav:.6f}，累计收益 {pct(ret)}，持仓 {len(holdings)} 个，成交 {len(trades)} 笔，环境适配 = 擅长 {view.get('best_regime','unknown')} / 谨慎 {view.get('worst_regime','unknown')}"
    )
    lines.append(f"核心解释：{view.get('public_summary','').strip()}")
    if focus.get('display_code'):
        lines.append(
            f"当前主盯标的：{focus.get('display_code')} {clean_name(focus.get('name',''))}，动作 {action_label(focus.get('action','--'))}，置信度 {safe_float(focus.get('confidence',0)):.2f}"
        )
    if issue:
        lines.append(f"系统复盘标签：{issue.get('issue_code','--')}。{issue.get('note','')}")
    return lines


def summarize_analyst_scoreboard(views: list[dict], leaderboard: dict) -> list[str]:
    rows = leaderboard.get('return', [])
    top3 = rows[:3]
    bottom3 = list(reversed(rows[-3:])) if rows else []
    no_trade_count = sum(1 for v in views if v.get('no_trade'))
    suppressed_count = sum(1 for v in views if v.get('relegation_state') == 'suppressed')
    lines = []
    if top3:
        lines.append('领先三人：' + '；'.join(f"{NAME_MAP.get(x['analyst_id'], x['analyst_id'])} {pct(safe_float(x.get('return',0)))}" for x in top3))
    if bottom3:
        lines.append('落后三人：' + '；'.join(f"{NAME_MAP.get(x['analyst_id'], x['analyst_id'])} {pct(safe_float(x.get('return',0)))}" for x in bottom3))
    lines.append(f"今日明确不交易人数：{no_trade_count} ｜ 当前抑制名单人数：{suppressed_count}")
    return lines


def render_html_report(lines: list[str], built_at: str, nav_label: str) -> str:
    content_lines = lines[3:] if len(lines) >= 3 else lines
    blocks = []
    in_list = False
    for line in content_lines:
        text = line.strip()
        if not text:
            if in_list:
                blocks.append('</ul>')
                in_list = False
            continue
        esc = html.escape(text)
        if text.startswith(('一、', '二、', '三、', '四、', '五、', '六、', '七、', '八、', '九、')):
            if in_list:
                blocks.append('</ul>')
                in_list = False
            blocks.append(f"<h2>{esc}</h2>")
        elif text.startswith('【') and text.endswith('】'):
            if in_list:
                blocks.append('</ul>')
                in_list = False
            blocks.append(f"<h3>{esc}</h3>")
        elif text.startswith('- '):
            if not in_list:
                blocks.append('<ul>')
                in_list = True
            blocks.append(f"<li>{html.escape(text[2:])}</li>")
        else:
            if in_list:
                blocks.append('</ul>')
                in_list = False
            blocks.append(f"<p>{esc}</p>")
    if in_list:
        blocks.append('</ul>')

    return f"""<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>Arena 每日全盘解释</title><style>
    body{{margin:0;background:linear-gradient(180deg,#f6f8fc 0%,#eef3fb 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827}}
    .wrap{{max-width:980px;margin:0 auto;padding:24px 16px 48px}}
    .panel{{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;box-shadow:0 10px 30px rgba(17,24,39,.05)}}
    .chips{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}} .chip{{display:inline-block;padding:7px 11px;border-radius:999px;background:#f8fafc;border:1px solid #e5e7eb;font-size:12px;color:#334155;text-decoration:none}}
    h1{{margin:0 0 10px;font-size:34px}} h2{{margin:24px 0 12px;font-size:24px}} h3{{margin:18px 0 8px;font-size:19px}}
    p,li{{font-size:15px;line-height:1.9;color:#334155}} ul{{margin:8px 0 8px 18px;padding:0}} .sub{{font-size:14px;color:#64748b;line-height:1.8}}
    @media (max-width:700px){{.wrap{{padding:14px 10px 28px}} .panel{{padding:16px;border-radius:18px}} h1{{font-size:28px}} h2{{font-size:22px}} p,li{{font-size:14px;line-height:1.8}} }}
    </style></head><body><div class='wrap'><div class='panel'><div class='chips'><a class='chip' href='./ai-analysts.html'>← 返回 Arena</a><a class='chip' href='./growth.html'>成长轨迹</a><span class='chip'>交易日 21:00 更新</span><span class='chip'>{html.escape(nav_label)}</span></div><h1>Arena 每日全盘解释</h1><div class='sub'>更新时间：{html.escape(built_at)} ｜ 这页面向 Arena 用户，固定包含港股市场总览、关注产品池战况、Zero 总判断、分析师战绩与分工、逐分析师详细解释、系统学习与明日观察。</div>{''.join(blocks)}</div></div></body></html>"""


def main() -> None:
    analyst_blob = load(LATEST / 'analyst_views.json', {})
    eval_snapshot = load(LATEST / 'eval_snapshot.json', {})
    leaderboard = load(LATEST / 'leaderboard.json', {}).get('rankings', {})
    growth = load(LATEST / 'growth_snapshot.json', {})
    zero_audit = load(LATEST / 'zero_audit_snapshot.json', {})
    postmortem = load(LATEST / 'postmortem_snapshot.json', {})
    duel = load(LATEST / 'duel_snapshot.json', {})
    features_blob = load(LATEST / 'features.json', {})

    views = analyst_blob.get('analyst_views', [])
    chief = next((v for v in views if v.get('analyst_id') == 'meta_allocator'), {})
    chief_call = chief.get('chief_call') or {}
    pm_map = {x['analyst_id']: x for x in postmortem.get('items', [])}
    growth_map = {x['analyst_id']: x for x in growth.get('items', [])}
    features = features_blob.get('features', [])
    features_by_symbol = {f.get('symbol'): f for f in features}

    built_at = eval_snapshot.get('built_at') or datetime.now(timezone.utc).isoformat()
    nav_label = eval_snapshot.get('nav_label') or '日内快照净值'

    lines = []
    lines.append('Arena 每日全盘解释')
    lines.append(f'时间：{built_at}')
    lines.append(f'净值口径：{nav_label}')
    lines.append('')

    lines.append('一、港股市场总览')
    lines.extend(summarize_market(features, features_by_symbol))
    lines.append('')

    lines.append('二、关注产品池战况')
    lines.extend(summarize_pool(features, duel))
    lines.append('')

    lines.append('三、Zero 的总判断')
    lines.extend(summarize_zero(chief_call, zero_audit, duel))
    lines.append('')

    lines.append('四、分析师战绩与分工')
    lines.extend(summarize_analyst_scoreboard(views, leaderboard))
    lines.append('')

    lines.append('五、每位分析师详细情况')
    for view in views:
        book = load(PORT / f"{view['analyst_id']}.json", {})
        lines.extend(analyst_line(view, book, pm_map))
        grow = growth_map.get(view['analyst_id'], {})
        if grow:
            lines.append(
                f"今天学会了什么：{grow.get('latest_reason','--')} ｜ 置信偏置 {safe_float(grow.get('confidence_bias',0)):+.2f} ｜ 仓位倍率 {safe_float(grow.get('position_multiplier',1)):.2f} ｜ 步长 {safe_float(grow.get('applied_step_size',0.25)):.2f}"
            )
        lines.append('')

    lines.append('六、为什么乔震会被 suppressed')
    qiao = next((v for v in views if v.get('analyst_id') == 'volatility_trader'), None)
    if qiao:
        lines.append('这不是因为他今天单日表现差，而是因为历史回放证据暂时不支持他被高信任对待。')
        lines.append('离线证据显示：avg_return = -0.0098，max_drawdown = -0.3460，最佳环境 = downtrend，最弱环境 = range。')
        lines.append('所以当前系统把他放进抑制名单，意思不是永远不用，而是：只在更适合他的环境里给他更谨慎的话语权。')
    lines.append('')

    lines.append('七、系统今天学到了什么')
    learned_points = []
    for item in growth.get('items', [])[:5]:
        learned_points.append(f"{item.get('name')}：{item.get('latest_reason','--')}")
    lines.extend(f'- {x}' for x in learned_points)
    lines.append('')

    lines.append('八、明天该怎么理解这套系统')
    lines.append('1) 先看恒指和恒科谁更强，确认市场是继续追科技，还是回到宽基扩散。')
    lines.append('2) 再看主池强势产品是否延续，尤其是今天的高成交科技线会不会继续领跑。')
    lines.append('3) 对被抑制分析师，不看一句话，要看环境是否重新回到其擅长 regime。')
    lines.append('4) 对今天不交易的分析师，不要当成缺席，要当成风险控制是否有效来跟踪。')

    text = '\n'.join(lines).strip()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding='utf-8')
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(render_html_report(lines, built_at, nav_label), encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
