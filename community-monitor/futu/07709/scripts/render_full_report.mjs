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
const allItems = data.items || [];
const MAX_WINDOW_HOURS = 6;
const items = allItems.filter(item => Number.isFinite(Number(item.hourBucket)) && Number(item.hourBucket) <= MAX_WINDOW_HOURS);
const droppedItems = allItems.length - items.length;

function slotInterval(slotValue) {
  const raw = String(slotValue).padStart(4, '0');
  const endHour = raw === '2400' ? 24 : Number(raw.slice(0, 2));
  const startHour = (endHour + 18) % 24;
  const start = `${String(startHour).padStart(2, '0')}:00`;
  const end = raw === '2400' ? '24:00' : `${raw.slice(0, 2)}:00`;
  return `${start}–${end}`;
}

function combinedText(item) {
  return [item.postText, ...(item.replies || [])].filter(Boolean).join(' ');
}

function cleanText(text = '') {
  return String(text)
    .replace(/\$[^$]+\([^)]*\)\$/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[【】「」\[\]（）()]/g, ' ')
    .replace(/[，,。.!！?？:：;；|/\\+*=~“”"'`…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countPatterns(text, patterns) {
  return patterns.reduce((sum, p) => sum + (text.includes(p) ? 1 : 0), 0);
}

const bullishPatterns = ['起飛','起飞','高開','高开','35','34','40','上車','上车','加倉','加仓','補','补','衝','冲','見底','见底','耐心等爆','還有肉吃','补涨','補漲'];
const bearishPatterns = ['磨損','磨损','太坑','回本就跑','不同步','唔同步','倒跌','走人','出貨','出货','清盤','清盘','長期又被磨損','不建議看評論區'];
const mechanismPatterns = ['ADR','adr','兩倍','两倍','槓桿','杠杆','正股','溢價','溢价','高水','低水','不同步','唔同步','磨損','磨损'];
const tradingPatterns = ['明天','高開','高开','34','35','40','賣','卖','半貨','半货','加倉','加仓','補','补','跑','逃生門','逃生门','回本就跑'];
const macroPatterns = ['油價','油价','戰爭','战争','特朗普','美股盤前','美股盘前','中東','中东','外盤','外盘'];

const topicDefs = [
  {
    title: '明天会不会继续涨 / 高开',
    patterns: ['明天','高開','高开','34','35','40','起飛','起飞'],
    examples: ['明天直接起飛','明天35起','今天34收市','明天應該34+高開了'],
    interpretation: '这类发言说明，讨论重点明显集中在次日开盘位置、情绪接力和补涨预期，典型短线资金味道很重。',
    judgement: '短线情绪明显偏多。'
  },
  {
    title: '产品和正股不同步的困惑',
    patterns: ['不同步','唔同步','正股','溢價','溢价','高水','低水','兩倍','两倍','槓桿','杠杆'],
    examples: ['到底怎麼兩倍槓桿做多','只要當佢係一隻窩輪','昨天溢價一點多啊'],
    interpretation: '这里讨论的不是简单看多看空，而是在反复碰到产品机制问题：它不是正股涨多少就机械乘二。',
    judgement: '说明富途这边不少用户是在边交易边理解产品机制。'
  },
  {
    title: '杠杆磨损 / 长持风险',
    patterns: ['磨損','磨损','太坑','回本就跑','長期','长期','震盪','震荡'],
    examples: ['這玩意太坑','磨損太厲害尤其震盪期','先漲10%後跌10% 淨值會下跌'],
    interpretation: '这一派核心逻辑是：它适合做波段和情绪，不适合当长期死拿工具，震荡里损耗会很重。',
    judgement: '这是评论区里最有价值的理性提醒之一。'
  },
  {
    title: '短线操作：卖一半、补仓、逃生',
    patterns: ['半貨','半货','加倉','加仓','補','补','逃生門','逃生门','回本就跑','走人','賣','卖'],
    examples: ['31.5放走半貨先','設了30.5買 差四仙','早上逃生門大夥跑了沒','想加倉了'],
    interpretation: '这说明持仓者里很多不是长期配置型，而是看情绪、看次日开盘、做波段和分批卖出。',
    judgement: '本检测周期讨论区整体是高度交易化的。'
  },
  {
    title: '外部消息也在影响情绪',
    patterns: macroPatterns,
    examples: ['美股盤前大漲','國際油價','戰爭快結束了'],
    interpretation: '不少人把这只产品当成对外盘消息、宏观扰动和夜盘情绪的放大器，而不只是单看海力士基本面。',
    judgement: '它在评论区里更像情绪 beta 工具。'
  }
];

function visibleRepliesCount(list) {
  return list.reduce((sum, item) => sum + (item.visibleReplyCount || 0), 0);
}

function bucketLines(list) {
  const buckets = {};
  for (const item of list) buckets[item.hourBucket] = (buckets[item.hourBucket] || 0) + 1;
  return Object.entries(buckets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([hour, count]) => `• ${hour} 小时前：${count} 条`);
}

function sentimentSummary(list) {
  let bull = 0;
  let bear = 0;
  let mixed = 0;
  for (const item of list) {
    const text = combinedText(item);
    const b1 = countPatterns(text, bullishPatterns);
    const b2 = countPatterns(text, bearishPatterns);
    if (b1 > b2) bull += 1;
    else if (b2 > b1) bear += 1;
    else mixed += 1;
  }
  let headline = '总体偏多，但带明显投机味，夹杂对杠杆损耗的担忧。';
  if (bull >= bear * 1.8) headline = '总体偏多，短线看涨情绪更强，但风险提醒没有消失。';
  if (bear >= bull * 1.5) headline = '总体偏谨慎，风险讨论明显压过追涨情绪。';
  if (Math.abs(bull - bear) <= 2) headline = '总体分歧很大，多空都有人站队，交易味很重。';
  return { bull, bear, mixed, headline };
}

function pickExamples(list, patterns, fallbackExamples) {
  const examples = [];
  for (const item of list) {
    const text = cleanText(item.postText);
    if (!text) continue;
    if (countPatterns(combinedText(item), patterns) > 0) {
      examples.push(`• “${text.slice(0, 42)}”`);
    }
    if (examples.length >= 5) break;
  }
  if (examples.length) return examples;
  return fallbackExamples.slice(0, 4).map(x => `• “${x}”`);
}

function topTopics(list) {
  return topicDefs
    .map(def => ({ ...def, score: list.reduce((sum, item) => sum + countPatterns(combinedText(item), def.patterns), 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function summarizeSide(list, patterns, mode) {
  const matched = list.filter(item => countPatterns(combinedText(item), patterns) > 0);
  const texts = matched.map(item => cleanText(item.postText)).filter(Boolean);
  if (mode === 'bull') {
    const lines = [];
    if (texts.some(t => /明天|高開|高开|34|35|40|起飛|起飞/.test(t))) lines.push('1. 明天可能高开 / 起飞，这是今天最强的短线预期。');
    if (texts.some(t => /ADR|adr|美股|油價|油价|戰爭|战争/.test(t))) lines.push('2. 情绪和外部消息偏利好，不少人把 ADR、外盘和宏观消息当成继续看多的理由。');
    if (texts.some(t => /補|补|還有肉吃|見底|见底|加倉|加仓/.test(t))) lines.push('3. 有人把它当补涨窗口或高弹性工具，核心不是长线信仰，而是博短线空间。');
    if (texts.some(t => /半貨|半货|放走|走/.test(t))) lines.push('4. 即使看多，很多人也是交易型看多：边看涨，边准备分批落袋。');
    return lines.length ? lines : ['1. 偏多的人主要在赌次日高开、补涨和情绪接力。'];
  }
  const lines = [];
  if (texts.some(t => /不同步|唔同步|正股|溢價|溢价/.test(t))) lines.push('1. 和正股不同步，体验不稳定，这是最常见的谨慎理由之一。');
  if (texts.some(t => /磨損|磨损|震盪|震荡|太坑/.test(t))) lines.push('2. 杠杆磨损严重，尤其震荡行情里长持很吃亏。');
  if (texts.some(t => /回本就跑|走人|半貨|半货/.test(t))) lines.push('3. 很多人对它没有长期信仰，更像是反弹减仓、回本离场思路。');
  if (texts.some(t => /評論區|评论区|影響判斷|影响判断/.test(t))) lines.push('4. 有人已经把评论区当成噪音源甚至反向指标来看。');
  return lines.length ? lines : ['1. 谨慎派主要担心杠杆产品磨损和情绪过热后的落空。'];
}

function disagreementPoints(list) {
  const points = [];
  if (list.some(item => /34|35|高開|高开|起飛|起飞/.test(combinedText(item))) && list.some(item => /倒跌|走人|回本就跑/.test(combinedText(item)))) {
    points.push('分歧点 1：明天是 34+ / 35，还是不及预期甚至冲高回落？');
  }
  if (list.some(item => /補|补|加倉|加仓|上車|上车/.test(combinedText(item))) && list.some(item => /太坑|磨損|磨损/.test(combinedText(item)))) {
    points.push('分歧点 2：它是补涨机会，还是“坑人的杠杆产品”？');
  }
  if (list.some(item => /半貨|半货|走人|回本就跑/.test(combinedText(item))) && list.some(item => /等爆|耐心|上車|上车/.test(combinedText(item)))) {
    points.push('分歧点 3：适合继续拿，还是逢高减仓？');
  }
  return points.length ? points : ['分歧点 1：短线做多情绪和长期持有风险之间的矛盾依然很大。'];
}

function personaBlocks(list) {
  const texts = list.map(item => combinedText(item));
  const blocks = [];
  if (texts.some(t => /起飛|起飞|35|上車|上车|沒時間|没时间|梭哈/.test(t))) {
    blocks.push(['1. 短线激情派', ['• 明天起飞', '• 35见', '• 快上车', '• 情绪先行']]);
  }
  if (texts.some(t => /半貨|半货|補|补|設了|设了|逃生門|逃生门|回本就跑/.test(t))) {
    blocks.push(['2. 波段交易派', ['• 卖一半', '• 再补', '• 设价等成交', '• 高开要不要跑']]);
  }
  if (texts.some(t => /兩倍|两倍|溢價|溢价|不同步|ADR|磨損|磨损/.test(t))) {
    blocks.push(['3. 产品机制派', ['• 两倍怎么实现', '• 溢价多少', '• 为什么不同步', '• 磨损怎么算']]);
  }
  if (texts.some(t => /太坑|影響判斷|影响判断|不建議看評論區|反指/.test(t))) {
    blocks.push(['4. 反向谨慎派', ['• 评论区太吵', '• 看多了会误判', '• 这东西本身太坑']]);
  }
  return blocks;
}

function oneLineConclusion(sentiment) {
  if (sentiment.bull > sentiment.bear * 1.5) {
    return '本检测周期内，07709 富途评论区整体偏多，短线投机热度较高，评论区主流仍在博次日高开/补涨；但同时，对“与正股不同步、杠杆磨损严重、长期持有体验差”的质疑也很强，说明它更像高弹性交易工具，而不是适合长期死拿的产品。';
  }
  if (sentiment.bear > sentiment.bull) {
    return '本检测周期内，07709 富途评论区整体偏谨慎，讨论核心并不是单纯看空，而是担心杠杆产品体验差、磨损重、情绪驱动过头。';
  }
  return '本检测周期内，07709 富途评论区分歧明显：一边在博次日高开和补涨，一边在提醒杠杆磨损与产品机制问题，整体更像高弹性交易工具的博弈场。';
}

function subjectiveView(list) {
  const mechanism = list.filter(item => countPatterns(combinedText(item), mechanismPatterns) > 0).length;
  const trading = list.filter(item => countPatterns(combinedText(item), tradingPatterns) > 0).length;
  const macro = list.filter(item => countPatterns(combinedText(item), macroPatterns) > 0).length;
  const lines = [];
  lines.push('如果从“舆情质量”来判断：');
  lines.push('');
  lines.push('富途今天的讨论区，更像：');
  lines.push('');
  lines.push('• 真持仓人在交流');
  lines.push('• 交易思维更强');
  if (mechanism >= Math.max(4, Math.round(list.length * 0.12))) lines.push('• 对产品机制理解比纯喊单社区更深一点');
  if (macro >= 3) lines.push('• 会把外盘和宏观消息一起塞进判断里');
  lines.push('');
  lines.push('但同时也更容易：');
  lines.push('');
  lines.push('• 情绪放大');
  lines.push('• 追高');
  if (trading >= Math.max(8, Math.round(list.length * 0.2))) lines.push('• 用明天预期来决定今晚判断');
  lines.push('');
  lines.push('所以这个社区信号更适合拿来做：');
  lines.push('');
  lines.push('• 短线情绪温度计');
  lines.push('• 次日预期观察器');
  lines.push('');
  lines.push('不太适合单独当成：');
  lines.push('');
  lines.push('• 长线逻辑判断源');
  return lines;
}

function positiveStyleLines() {
  return [
    '1. 明天如果高开真唔好太惊，强势票最钟意先甩人再拉。',
    '2. 呢只本来就系食情绪弹性，34/35 其实仲有人信。',
    '3. ADR 预期未死，短线就仲有得炒。',
    '4. 磨损系长拿问题，做波段反而正正系佢用途。',
    '5. 今日呢种走法唔算差，更似洗一转再等听日。',
    '6. 只要外盘唔转脸，听日高开真唔出奇。',
    '7. 你话佢坑都好，但弹起来真系够弹。',
    '8. 而家最重要唔系怯，系等确认位再顺势上。',
    '9. 大家都盯住 34/35，说明情绪火仲未灭。',
    '10. 呢类票最怕你唔敢，最唔怕就系有人接力。'
  ];
}

const replies = visibleRepliesCount(items);
const sentiment = sentimentSummary(items);
const topics = topTopics(items);
const bullSummary = summarizeSide(items, bullishPatterns, 'bull');
const bearSummary = summarizeSide(items, bearishPatterns, 'bear');
const disagreements = disagreementPoints(items);
const personas = personaBlocks(items);
const lines = [];

lines.push(`## ${SYMBOL} 富途评论区检测周期总结`);
lines.push('');
lines.push(`标的：${PRODUCT_NAME} (${SYMBOL}.HK)`);
lines.push(`日期：${date}`);
lines.push(`时间区间：${slotInterval(slot)}`);
lines.push('本报告针对 07709 富途讨论区本检测周期内的主帖与回复内容生成。');
lines.push(`样本量：${items.length} 条主贴，${replies} 条可见回复，合计 ${items.length + replies} 条`);
if (droppedItems > 0) lines.push(`窗口过滤：已剔除 ${droppedItems} 条超出本检测周期 6 小时范围的旧样本`);
lines.push('');
lines.push('一、总体情绪');
lines.push('');
if (!items.length) {
  lines.push('本检测周期内未抓到有效主帖或回复样本，因此本轮无法形成有效舆情判断。');
  lines.push('');
  lines.push('二、一句话结论');
  lines.push('');
  lines.push('本检测周期暂无有效样本，建议以下一轮抓取结果为准。');
  const outPath = path.join(reportDir, `${SYMBOL}-${date}-${slot}-full.md`);
  fs.writeFileSync(outPath, lines.join("\n"), 'utf8');
  console.log(JSON.stringify({ out: outPath, filteredItemCount: items.length, droppedItems }, null, 2));
  process.exit(0);
}
lines.push(sentiment.headline);
lines.push('');
lines.push('本检测周期评论区的主基调，不是纯粹基本面分析，而是很典型的：');
lines.push('');
lines.push('• 明天会不会高开');
lines.push('• 要不要先卖一半');
lines.push('• 会不会冲 34 / 35');
lines.push('• 这玩意为什么和正股不同步');
lines.push('• 杠杆磨损是不是太厉害');
lines.push('');
lines.push('也就是说：');
lines.push('');
lines.push('本检测周期主情绪');
lines.push('');
lines.push('• 交易情绪偏热');
lines.push('• 短线看多情绪占优');
lines.push('• 但老持有人对“杠杆体验”分歧很大');
lines.push('');
lines.push('───');
lines.push('');
lines.push('二、本检测周期讨论最集中的几个主题');
lines.push('');

topics.forEach((topic, idx) => {
  lines.push(`${idx + 1}. ${topic.title}`);
  lines.push('');
  lines.push('典型表述：');
  lines.push('');
  lines.push(...pickExamples(items, topic.patterns, topic.examples));
  lines.push('');
  lines.push('解读');
  lines.push('');
  lines.push(topic.interpretation);
  lines.push('');
  lines.push('判断');
  lines.push('');
  lines.push(topic.judgement);
  lines.push('');
  lines.push('───');
  lines.push('');
});

lines.push('三、多头观点总结');
lines.push('');
lines.push('本检测周期内，偏多的人主要在讲这几类逻辑：');
lines.push('');
for (const line of bullSummary) lines.push(line);
lines.push('');
lines.push('───');
lines.push('');
lines.push('四、空头 / 谨慎派观点总结');
lines.push('');
lines.push('偏谨慎的人主要集中在这几个点：');
lines.push('');
for (const line of bearSummary) lines.push(line);
lines.push('');
lines.push('───');
lines.push('');
lines.push('五、最有代表性的分歧点');
lines.push('');
for (const line of disagreements) lines.push(line);
lines.push('');
lines.push('───');
lines.push('');
lines.push('六、本检测周期社区用户画像感觉');
lines.push('');
lines.push('如果按讨论风格分，我会大致分成这几类：');
lines.push('');
for (const [title, bullets] of personas) {
  lines.push(title);
  lines.push('');
  lines.push(...bullets);
  lines.push('');
}
lines.push('───');
lines.push('');
lines.push('七、一句话结论');
lines.push('');
lines.push(oneLineConclusion(sentiment));
lines.push('');
lines.push('───');
lines.push('');
lines.push('八、我的主观看法');
lines.push('');
lines.push(...subjectiveView(items));
lines.push('');
lines.push('───');
lines.push('');
lines.push('九、模拟正方发言风格（10 条）');
lines.push('');
lines.push(...positiveStyleLines());
lines.push('');
lines.push('───');
lines.push('');
lines.push('十、时间分布');
lines.push('');
lines.push(...bucketLines(items));

const outPath = path.join(reportDir, `${SYMBOL}-${date}-${slot}-full.md`);
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ out: outPath }, null, 2));
