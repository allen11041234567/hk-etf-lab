import fs from 'fs';
import path from 'path';

const [,, date] = process.argv;
if (!date) {
  console.error('Usage: node merge_daily.mjs <YYYY-MM-DD>');
  process.exit(1);
}

const baseDir = path.resolve('..', date);
const normDir = path.join(baseDir, 'normalized');
const dailyDir = path.join(baseDir, 'daily');
fs.mkdirSync(dailyDir, { recursive: true });
const files = fs.existsSync(normDir) ? fs.readdirSync(normDir).filter(f => f.endsWith('.json')).sort() : [];
const merged = [];
const seen = new Set();
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(normDir, file), 'utf8'));
  for (const item of data.items || []) {
    if (!seen.has(item.dedupeKey)) {
      seen.add(item.dedupeKey);
      merged.push(item);
    }
  }
}
merged.sort((a, b) => a.hourBucket - b.hourBucket || a.user.localeCompare(b.user));
const out = {
  date,
  source: 'futu',
  symbol: '07709',
  mergedCount: merged.length,
  items: merged
};
fs.writeFileSync(path.join(dailyDir, 'merged.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ out: path.join(dailyDir, 'merged.json'), mergedCount: merged.length }, null, 2));
