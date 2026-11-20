// Tiny static server for local testing: node serve.js  ->  http://localhost:5181
const h = require('http'), fs = require('fs'), p = require('path');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
h.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const fp = p.join(__dirname, u === '/' ? 'index.html' : u);
  if (!fp.startsWith(__dirname)) { r.writeHead(403); return r.end(); }
  fs.readFile(fp, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[p.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); r.end(d); });
}).listen(5181, () => console.log('http://localhost:5181'));
