// Dump PDF text as lines with x positions: one JSON line per text line.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const [, , inFile, outFile] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(inFile)) }).promise;
const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height, f: i.fontName }));
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    let ln = lines.find(l => Math.abs(l.y - it.y) < 2.5);
    if (!ln) { ln = { y: it.y, items: [] }; lines.push(ln); }
    ln.items.push(it);
  }
  lines.sort((a, b) => a.y - b.y);
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // merge adjacent items into segments (gap < 6pt)
    const segs = [];
    for (const it of l.items) {
      const last = segs[segs.length - 1];
      if (last && it.x - (last.x + last.w) < 6) { last.s += (it.x - (last.x + last.w) > 1 && !last.s.endsWith(' ') && !it.s.startsWith(' ') ? ' ' : '') + it.s; last.w = it.x + it.w - last.x; last.fonts.add(it.f); }
      else segs.push({ s: it.s, x: it.x, w: it.w, fonts: new Set([it.f]) });
    }
    out.push(JSON.stringify({ p, y: Math.round(l.y * 10) / 10, h: Math.round(l.items[0].h * 10) / 10, segs: segs.map(s => ({ s: s.s.replace(/\s+/g, ' ').trim(), x: Math.round(s.x), r: Math.round(s.x + s.w), f: [...s.fonts].join(',') })) }));
  }
}
fs.writeFileSync(outFile, out.join('\n'));
console.log(inFile, doc.numPages, 'pages', out.length, 'lines');
