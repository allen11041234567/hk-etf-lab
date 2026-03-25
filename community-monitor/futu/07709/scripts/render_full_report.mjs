import fs from 'fs';
import path from 'path';

const [,, date, slot] = process.argv;
if (!date || !slot) {
  console.error('Usage: node render_full_report.mjs <YYYY-MM-DD> <slot>');
  process.exit(1);
}

const SYMBOL = '07709';
const PRODUCT_NAME = '南方兩倍做多海力士';
const jsonPath = path.resolve('..', date, 'normalized', `${slot}.json`);
const reportDir = path.resolve('..', date, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const items = data.items || [];

function slotInterval(slotValue) {
  const raw = String(slotValue).padStart(4, '0');
  const endHour = raw === '2400' ? 24 : Number(raw.slice(0, 2));
  const startHour = (endHour + 18) % 24;
  const start = `${String(startHour).padStart(2, '0')}:00`;
  const end = raw === '2400' ? '24:00' : `${raw.slice(0, 2)}:00`;
  return `${start}–${end}`;
}

function bucketSummary(list) {
  const buckets = {};
  for (const item of list) buckets[item.hourBucket] = (buckets[item.hourBucket] || 0) + 1;
  return Object.entries(buckets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([hour, count]) => `- ${hour} 小时前：${count} 条`);
}

function cleanText(text = '') {
  return String(text)
    .replace(/\$[^$]+\([^)]*\)\$/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[【】「」\[\]（）()，,。.!！?？:：;；|/\\+*=~“”"'`…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stopwords = new Set([
  '南方兩倍做多海力士','海力士','南方兩倍','做多','南方','今天','明天','現在','这个','這個','就是','是不是','應該','真的','还是','還是',
  '可以','不能','有点','有點','一下','已经','已經','因为','因為','如果','这个是','怎麼','什么','什麼','沒有','没有','一个','一個',
  '觉得','覺得','可能','应该','應該','你们','你哋','我们','我哋','大家','自己','时候','時候','东西','玩意','這邊','那邊','一下子',
  '回复','樓主','评论','評論','查看更多評論','Capital','OpenAPI','ETF','港股篇','熱門個股','專欄文章'
]);

const topicRules = [
  { name: '明日走势 / 高开预期', patterns: ['起飛','起飞','高開','高开','明天35','今天35','34','35','40','見底','见底','補缺口','破頂'] },
  { name: 'ADR / 估值催化', patterns: ['ADR','adr','上市','pe','估值','美股'] },
  { name: '杠杆磨损 / 长拿风险', patterns: ['磨損','磨损','回本就跑','太坑','震盪','震荡','長期','长期','槓桿','杠杆'] },
  { name: '产品机制 / 溢价同步', patterns: ['不同步','唔同步','溢價','溢价','高水','低水','正股','韓股','韩国','兩倍槓桿','两倍槓桿','两倍杠杆'] },
  { name: '短线交易 / 加仓上车', patterns: ['加倉','加仓','上車','上车','補','补','買','买','跑','走人','半貨','半货','入貨','入货'] },
  { name: '情绪宣泄 / 套牢回本', patterns: ['回來','回来','本37','本可以','逃生門','逃生门','唉','錯','错','清盤','清盘'] },
];

const bullishPatterns = ['起飛','起飞','高開','高开','上車','上车','加倉','加仓','見底','见底','衝','冲','耐心等爆','33唔難','35','40','買','买','補','补','破頂'];
const bearishPatterns = ['磨損','磨损','太坑','回本就跑','清盤','清盘','倒跌','出貨','出货','唔同步','不同步','跑','走人','沒用','无可能','不建議看評論區'];
const disagreementAxes = [
  { name: '该不该继续拿 / 逢高先跑', left: ['上車','上车','加倉','加仓','補','补','等爆','見底','见底'], right: ['回本就跑','走人','放走半貨','放走半货','出貨','出货','要跑'] },
  { name: 'ADR 是重大催化 / 只是情绪题材', left: ['ADR','adr','pe','估值'], right: ['什麼時候才能上市','什么时候才能上市','只是','未必','不一定'] },
  { name: '两倍产品能放大收益 / 两倍产品会持续磨损', left: ['兩倍','两倍','漲了14個點','涨了14个点','賺到了4W','赚到了'], right: ['磨損','磨损','太坑','震盪','震荡','全白乾'] },
];

function combinedText(item) {
  return [item.postText, ...(item.replies || [])].filter(Boolean).join(' ');
}

function countMatches(text, patterns) {
  return patterns.reduce((sum, pattern) => sum + (text.includes(pattern) ? 1 : 0), 0);
}

const tagLibrary = [
  '起飛','起飞','高開','高开','34','35','40','ADR','adr','加倉','加仓','上車','上车','磨損','磨损','溢價','溢价','高水','低水',
  '回本就跑','太坑','見底','见底','破頂','破顶','補缺口','补缺口','正股','韓股','韩国','不同步','唔同步','短線','短线'
];

function collectTerms(list) {
  const counts = new Map();
  for (const term of tagLibrary) counts.set(term, 0);
  for (const item of list) {
    const text = combinedText(item);
    for (const term of tagLibrary) {
      if (text.includes(term)) counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
}

function topTopicSummaries(list) {
  const scored = topicRules.map(rule => {
    let score = 0;
    const matched = [];
    for (const item of list) {
      const text = combinedText(item);
      const hitCount = countMatches(text, rule.patterns);
      if (hitCount > 0) {
        score += hitCount;
        matched.push(item);
      }
    }
    return { ...rule, score, matched };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(topic => {
    const matchedPosts = topic.matched.length;
    const matchedReplies = topic.matched.reduce((sum, item) => sum + (item.visibleReplyCount || 0), 0);
    let summary = `相关讨论主要由 ${matchedPosts} 条主贴、${matchedReplies} 条可见回复构成。`;
    if (topic.name === '明日走势 / 高开预期') summary = `大家集中在赌明天是否高开、能否冲到 34/35，属于最强的方向性话题。`;
    if (topic.name === '短线交易 / 加仓上车') summary = `讨论重点是要不要继续上车、补仓、等确认后追，交易味最重。`;
    if (topic.name === 'ADR / 估值催化') summary = `不少人把 ADR 与低估值叙事当作继续看多的理由。`;
    if (topic.name === '杠杆磨损 / 长拿风险') summary = `风险派在反复提醒：两倍产品适合波段，不适合长拿扛震荡。`;
    if (topic.name === '产品机制 / 溢价同步') summary = `机制派在解释为什么它与正股不完全同步，以及高水低水/溢价问题。`;
    return {
      name: topic.name,
      score: topic.score,
      summary
    };
  });
}

function topViewpoints(list, patterns, limit = 4) {
  return list
    .map(item => ({ item, score: countMatches(combinedText(item), patterns) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.visibleReplyCount || 0) - (a.item.visibleReplyCount || 0))
    .slice(0, limit)
    .map(({ item }) => `- ${cleanText(item.postText).slice(0, 90)}`);
}

function sentimentBreakdown(list) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const item of list) {
    const text = combinedText(item);
    const bull = countMatches(text, bullishPatterns);
    const bear = countMatches(text, bearishPatterns);
    if (bull > bear) bullish += 1;
    else if (bear > bull) bearish += 1;
    else neutral += 1;
  }
  const total = list.length || 1;
  const bullPct = Math.round(bullish / total * 100);
  const bearPct = Math.round(bearish / total * 100);
  const neutralPct = Math.round(neutral / total * 100);
  let label = '分歧偏多';
  if (bullish >= bearish * 1.5) label = '偏多';
  else if (bearish >= bullish * 1.5) label = '偏空';
  else if (Math.abs(bullish - bearish) <= Math.max(2, Math.round(total * 0.08))) label = '强分歧';
  return { bullish, bearish, neutral, bullPct, bearPct, neutralPct, label };
}

function disagreementSummary(list) {
  return disagreementAxes.map(axis => {
    let left = 0;
    let right = 0;
    const samples = [];
    for (const item of list) {
      const text = combinedText(item);
      const l = countMatches(text, axis.left);
      const r = countMatches(text, axis.right);
      left += l;
      right += r;
      if ((l > 0 || r > 0) && samples.length < 2) {
        samples.push(cleanText(item.postText).slice(0, 70));
      }
    }
    return { ...axis, left, right, samples };
  }).filter(x => x.left > 0 || x.right > 0)
    .sort((a, b) => (b.left + b.right) - (a.left + a.right))
    .slice(0, 3);
}

function userPersona(list) {
  let shortTerm = 0;
  let trapped = 0;
  let mechanism = 0;
  let emotional = 0;
  for (const item of list) {
    const text = combinedText(item);
    if (countMatches(text, ['明天','高開','高开','收市','34','35','40','上車','上车','加倉','加仓','補','补','跑']) > 0) shortTerm += 1;
    if (countMatches(text, ['本37','38','回來','回来','回本','套牢','唉','錯','错']) > 0) trapped += 1;
    if (countMatches(text, ['ADR','磨損','磨损','溢價','溢价','不同步','唔同步','正股','韓股','韩国','槓桿','杠杆']) > 0) mechanism += 1;
    if (countMatches(text, ['😭','🤣','💪','唉','慘','惨','衝','冲','起飛','起飞']) > 0) emotional += 1;
  }
  const total = list.length || 1;
  return [
    `- 短线交易型居多：约 ${Math.round(shortTerm / total * 100)}% 的样本在讨论明天高开、34/35 目标位、加仓和先跑。`,
    `- 套牢/回本型明显存在：约 ${Math.round(trapped / total * 100)}% 的样本在谈成本价、回本、是否解套。`,
    `- 机制研究型不低：约 ${Math.round(mechanism / total * 100)}% 的样本在讨论 ADR、溢价、同步性、磨损和杠杆原理。`,
    `- 情绪表达偏强：约 ${Math.round(emotional / total * 100)}% 的样本带有明显宣泄、打气或懊悔语气。`
  ];
}

function positiveStyleLines(list) {
  const pool = [
    '明天高开唔出奇，呢种走法就系等消息发酵。',
    '唔好畀盘中震走，强势票最钟意吓散户再拉。',
    '只要 ADR 预期继续发酵，34/35 其实唔离谱。',
    '呢只而家更似短线情绪票，气氛返嚟就会弹得快。',
    '见底味道越来越重，肯承接就代表下面有人接。',
    '唔使太早落车，真转强通常系高开再走趋势。',
    '磨损系长拿问题，短线食波幅反而系佢强项。',
    '而家最重要唔系怕，系等确认位再顺势加。',
    '今日补完缺口都唔算差，留返力听日冲更合理。',
    '你睇讨论气氛都知，多头资金仲未死心。',
    '大位未必一步到，但 33-35 呢段明显有人信。',
    '有消息、有弹性、有情绪，短线最怕就系你唔敢。'
  ];
  const dynamic = list
    .map(item => cleanText(item.postText))
    .filter(Boolean)
    .filter(text => countMatches(text, bullishPatterns) > countMatches(text, bearishPatterns))
    .slice(0, 4)
    .map(text => `${text.slice(0, 26)}，所以我会继续偏正面看。`);

  const unique = [];
  for (const line of [...dynamic, ...pool]) {
    if (!unique.includes(line)) unique.push(line);
    if (unique.length >= 10) break;
  }
  return unique.slice(0, 10).map((line, idx) => `${idx + 1}. ${line}`);
}

const visibleReplies = items.reduce((sum, item) => sum + (item.visibleReplyCount || 0), 0);
const bucketLines = bucketSummary(items);
const topTerms = collectTerms(items).slice(0, 10).map(([term, count]) => `${term}(${count})`);
const topTopics = topTopicSummaries(items);
const sentiment = sentimentBreakdown(items);
const bullishViews = topViewpoints(items, bullishPatterns);
const bearishViews = topViewpoints(items, bearishPatterns);
const disagreements = disagreementSummary(items);
const persona = userPersona(items);
const styleLines = positiveStyleLines(items);

const lines = [];
lines.push(`# ${SYMBOL} ${PRODUCT_NAME} 六小时舆情报告`);
lines.push(`日期：${date}`);
lines.push(`报告时段：${slot}（覆盖区间：${slotInterval(slot)}）`);
lines.push(`产品：${PRODUCT_NAME} (${SYMBOL}.HK)`);
lines.push('');
lines.push('## 一、样本概览');
lines.push(`- 主贴数：${items.length}`);
lines.push(`- 可见回复数：${visibleReplies}`);
lines.push(`- 主贴+回复合计：${items.length + visibleReplies}`);
lines.push(`- 讨论热词：${topTerms.join(' / ') || '无明显聚类'}`);
lines.push(`- 说明：统计基于当前抓到的主贴与可见回复，属于高覆盖近似值，不保证平台绝对全量。`);
lines.push('');
lines.push('## 二、总体情绪分析');
lines.push(`- 情绪结论：**${sentiment.label}**`);
lines.push(`- 多头样本：${sentiment.bullish} 条（约 ${sentiment.bullPct}%）`);
lines.push(`- 空头样本：${sentiment.bearish} 条（约 ${sentiment.bearPct}%）`);
lines.push(`- 中性/资讯样本：${sentiment.neutral} 条（约 ${sentiment.neutralPct}%）`);
if (sentiment.label === '偏多') {
  lines.push(`- 解读：讨论核心仍然围绕“明天高开 / 34-35 / ADR 催化 / 继续上车”，看涨气氛明显压过风险提醒。`);
} else if (sentiment.label === '偏空') {
  lines.push(`- 解读：样本里对磨损、回本离场、产品机制缺陷的提醒明显更多，风险意识占上风。`);
} else if (sentiment.label === '强分歧') {
  lines.push(`- 解读：一边在赌高开和继续拉升，一边在提醒磨损、先跑与别被情绪带节奏，社区分歧很重。`);
} else {
  lines.push(`- 解读：多头声音略占优，但风险提醒并没有消失，整体属于偏交易型、非单边一致预期。`);
}
lines.push('');
lines.push('## 三、讨论最集中的主题');
for (const topic of topTopics) {
  lines.push(`- **${topic.name}**（热度命中 ${topic.score}）`);
  lines.push(`  - 样本侧写：${topic.summary}`);
}
if (!topTopics.length) lines.push('- 暂无明显主题聚类');
lines.push('');
lines.push('## 四、多头（正面）观点总结');
if (bullishViews.length) lines.push(...bullishViews);
else lines.push('- 当前样本中没有足够鲜明的多头论点。');
lines.push('');
lines.push('## 五、空头（负面）观点总结');
if (bearishViews.length) lines.push(...bearishViews);
else lines.push('- 当前样本中没有足够鲜明的空头论点。');
lines.push('');
lines.push('## 六、代表性分歧点');
for (const d of disagreements) {
  lines.push(`- **${d.name}**：支持侧 ${d.left} 次命中 vs 反对侧 ${d.right} 次命中`);
  if (d.samples.length) lines.push(`  - 代表样本：${d.samples.join(' / ')}`);
}
if (!disagreements.length) lines.push('- 当前样本分歧点不够集中。');
lines.push('');
lines.push('## 七、用户画像分析');
lines.push(...persona);
lines.push('');
lines.push('## 八、结论（舆情分析）');
lines.push(`- 这六小时的社区讨论本质上是 **“短线情绪博弈 + 产品机制争议并存”**。`);
lines.push(`- 如果只看情绪面，市场更愿意交易“明天高开、34/35、ADR 催化”这一边；如果看风险面，最大的压制来自“两倍产品磨损、与正股不同步、回本就跑”。`);
lines.push(`- 所以这不是那种纯一致性看多社区，而是 **偏多但高分歧** 的交易场：适合观察情绪温度，不适合把评论区当成单一方向指标。`);
lines.push('');
lines.push('## 九、模拟正方发言风格（10 条）');
lines.push(...styleLines);
lines.push('');
lines.push('## 十、讨论时间分布');
lines.push(...bucketLines);
lines.push('');
lines.push('## 附：代表性原话（节选）');
const picks = items
  .map(item => ({ item, score: Math.max(countMatches(combinedText(item), bullishPatterns), countMatches(combinedText(item), bearishPatterns)) + (item.visibleReplyCount || 0) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);
for (const { item } of picks) {
  lines.push(`- [${item.hourBucket}h] ${item.user}：${cleanText(item.postText).slice(0, 120)}`);
}

const outPath = path.join(reportDir, `${SYMBOL}-${date}-${slot}-full.md`);
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ out: outPath }, null, 2));
