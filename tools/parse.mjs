// Parse the four "Mias Jahr in Freiburg" line dumps into structured stories.
import fs from 'fs';
const dir = process.argv[2], outFile = process.argv[3];
let lines = [];
for (let i = 1; i <= 4; i++) {
  for (const l of fs.readFileSync(`${dir}/teil${i}.jsonl`, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(l); o.book = i; lines.push(o);
  }
}
// drop running header/footer
lines = lines.filter(o => !(o.segs.length === 1 && (/^Page \d+ of \d+$/.test(o.segs[0].s) || (o.h < 7 && /^Mias Jahr/.test(o.segs[0].s)))));

const stories = [];
let cur = null, sec = null, table = null, cols = null, lastY = null, lastP = null;
const txt = o => o.segs.map(s => s.s).join(' ');
const joinWrap = (a, b) => (a.endsWith('-') && /^[a-zäöü]/.test(b) ? a + b : a + ' ' + b);

for (const o of lines) {
  const t = txt(o);
  const gap = (o.p === lastP && o.book === (lastBook)) ? o.y - lastY : 99;
  var lastBook; lastY = o.y; lastP = o.p; lastBook = o.book;
  const m = t.match(/^Geschichte (\d+) · (.+) · (A[12])$/);
  if (m && o.h > 13) {
    cur = { n: +m[1], title: m[2], level: m[3], story: [], questions: [], answers: [], words: [], chunks: [], repeated: '', grammar: { title: '', lines: [] } };
    stories.push(cur); sec = null; continue;
  }
  if (!cur) continue;
  if (o.h > 15) { sec = 'skip'; continue; } // "Tracker nach Teil", "Was bisher geschah"
  if (t === 'Die Geschichte') { sec = 'story'; continue; }
  if (t === 'Fragen' || /^Quiz:/.test(t)) { sec = 'q'; continue; }
  if (t === 'Lösungen (Answer key)') { sec = 'a'; continue; }
  if (t === 'Wortschatz') { sec = null; continue; }
  if (t === 'Neue Wörter') { sec = 'words'; table = cur.words; cols = null; continue; }
  if (t === 'Neue Chunks') { sec = 'chunks'; table = cur.chunks; cols = null; continue; }
  if (/^Wiederholte Wörter/.test(t)) { sec = 'rep'; cur.rep = []; table = cur.rep; cols = null; cur.repeated = t.replace(/^Wiederholte Wörter:?\s*/, ''); continue; }
  if (/^Grammatik:/.test(t) && o.h > 13) { sec = 'gram'; cur.grammar.title = t.replace(/^Grammatik:\s*/, ''); continue; }
  if (sec === 'skip' || !sec) continue;

  if (sec === 'story') {
    const speaker = o.segs[0] && /^[A-ZÄÖÜ][^:]{0,25}:/.test(t);
    if (cur.story.length && gap < 20) cur.story[cur.story.length - 1] = joinWrap(cur.story[cur.story.length - 1], t);
    else cur.story.push(t);
  } else if (sec === 'q' || sec === 'a') {
    const arr = sec === 'q' ? cur.questions : cur.answers;
    const nm = t.match(/^(\d+)\.\s+(.*)$/);
    if (nm && o.segs[0].x < 66) arr.push(nm[2]);
    else if (arr.length) arr[arr.length - 1] = joinWrap(arr[arr.length - 1], t);
  } else if (sec === 'rep' && !cols && o.segs[0].s !== 'Deutsch') {
    cur.repeated = joinWrap(cur.repeated, t);
  } else if (sec === 'gram') {
    if (cur.grammar.lines.length && gap < 20) cur.grammar.lines[cur.grammar.lines.length - 1] = joinWrap(cur.grammar.lines[cur.grammar.lines.length - 1], t);
    else cur.grammar.lines.push(t.replace(/\*/g, ''));
  } else if (sec === 'words' || sec === 'chunks' || sec === 'rep') {
    if (o.segs[0].s === 'Deutsch') { cols = o.segs.map(s => s.x); continue; }
    if (!cols) continue;
    if (t === 'Geschichte' && o.segs.length === 1) continue; // second header line
    const cells = ['', '', ''];
    for (const s of o.segs) {
      let c = 0; for (let k = 0; k < cols.length; k++) if (s.x >= cols[k] - 6) c = k;
      cells[c] = cells[c] ? cells[c] + ' ' + s.s : s.s;
    }
    if (gap < 20 && table.length) {
      const r = table[table.length - 1];
      ['de', 'en', 'ex'].forEach((k, i) => { if (cells[i]) r[k] = r[k] ? joinWrap(r[k], cells[i]) : cells[i]; });
    } else table.push({ de: cells[0], en: cells[1], ex: cells[2] });
  }
}
// story paragraphs: split into {sp, t}
for (const s of stories) {
  s.story = s.story.map(p => { const m = p.match(/^([A-ZÄÖÜ][\wäöüß. ]{0,22}):\s+(.*)$/); return m ? { sp: m[1], t: m[2] } : { t: p }; });
}
fs.writeFileSync(outFile, JSON.stringify(stories, null, 1));
const nw = stories.reduce((a, s) => a + s.words.length, 0), nc = stories.reduce((a, s) => a + s.chunks.length, 0);
console.log(stories.length, 'stories', nw, 'words', nc, 'chunks');
for (const s of stories) {
  const bad = [...s.words, ...s.chunks].filter(r => !r.de || !r.en || !r.ex);
  if (s.questions.length < 5 || s.answers.length !== s.questions.length || !s.story.length || bad.length) console.log('CHECK', s.n, 'q', s.questions.length, 'a', s.answers.length, 'p', s.story.length, 'bad', JSON.stringify(bad).slice(0, 200));
}
