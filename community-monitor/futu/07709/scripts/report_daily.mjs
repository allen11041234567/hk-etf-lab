import fs from 'fs';
import path from 'path';

const [,, date] = process.argv;
if (!date) {
  console.error('Usage: node report_daily.mjs <YYYY-MM-DD>');
  process.exit(1);
}

const mergedPath = path.resolve('..', date, 'daily', 'merged.json');
const reportDir = path.resolve('..', date, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
const items = merged.items || [];
const buckets = {};
for (const item of items) buckets[item.hourBucket] = (buckets[item.hourBucket] || 0) + 1;
const keywords = ['起飛','高開','35','磨損','不同步','溢價','加倉','回本就跑','ADR','看多','看空'];
const hits = Object.fromEntries(keywords.map(k => [k, 0]));
for (const item of items) {
  const text = `${item.postText} ${(item.replies || []).join(' ')}`;
  for (const k of keywords) if (text.includes(k)) hits[k] += 1;
}
const lines = [];
lines.push(`# 07709 富途社区日报`);
lines.push(`日期：${date}`);
lines.push('');
lines.push('## 抓取覆盖');
lines.push(`- 数据源：Futu 07709 community`);
lines.push(`- 去重后样本数：${items.length}`);
lines.push(`- 说明：基于多时段抓取合并，统计为“主贴 + 当前可见回复”近似覆盖，不保证平台官方绝对全量。`);
lines.push('');
lines.push('## 小时分布');
for (const hour of Object.keys(buckets).sort((a,b)=>Number(a)-Number(b))) {
  lines.push(`- ${hour} 小时前：${buckets[hour]} 条`);
}
lines.push('');
lines.push('## 高频关键词命中');
for (const [k,v] of Object.entries(hits).sort((a,b)=>b[1]-a[1])) lines.push(`- ${k}：${v}`);
lines.push('');
lines.push('## 样本摘录（前20条）');
items.slice(0,20).forEach((item, idx) => {
  lines.push(`${idx+1}. [${item.hourBucket}h] ${item.user}`);
  lines.push(`   - ${item.postText.slice(0, 220)}`);
  if ((item.replies || []).length) lines.push(`   - 回复：${item.replies.slice(0,3).join(' | ')}`);
});
const outPath = path.join(reportDir, `07709-${date}-report.md`);
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ out: outPath }, null, 2));
