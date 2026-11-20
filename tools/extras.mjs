// Find words from the old app's A1/A2 theme lists that the storybooks don't teach.
import fs from 'fs';
const [, , storiesFile, dataJs, outFile] = process.argv;
const stories = JSON.parse(fs.readFileSync(storiesFile, 'utf8'));
globalThis.window = globalThis; eval(fs.readFileSync(dataJs, 'utf8'));
const { THEMES } = globalThis.CONTENT;
const norm = s => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/^(der|die|das|sich)\s+/, '').replace(/[!?.…,]/g, '').trim();
const known = new Set();
for (const s of stories) for (const r of [...s.words, ...s.chunks, ...(s.rep || [])])
  for (const part of r.de.split(/[\/,;]/)) { const n = norm(part); if (n) known.add(n); }
const out = { A1: [], A2: [] };
for (const th of THEMES) {
  const lvl = th.level === 'A2' ? 'A2' : 'A1';
  for (const line of th.words.trim().split('\n')) {
    const [w, pl, en] = line.split('|'); if (!w || !en) continue;
    if (known.has(norm(w))) continue;
    if (th.id === 'num' || th.id === 'questions') continue;
    let de = w;
    if (/^(der|die|das) /.test(w) && pl && pl !== '-') de = pl === '*' ? w + ' (plural only)' : `${w}, die ${pl}`;
    out[lvl].push({ de, en, theme: th.de });
    known.add(norm(w));
  }
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('A1 extras', out.A1.length, 'A2 extras', out.A2.length);
console.log(out.A1.slice(0, 12).map(x => x.de).join(' · '));
console.log(out.A2.slice(0, 12).map(x => x.de).join(' · '));
