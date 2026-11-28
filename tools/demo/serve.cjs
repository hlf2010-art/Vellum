#!/usr/bin/env node
/* Serves dist/demo locally the way Cloudflare Pages will: the same files and the headers from _headers (CSP included).
 *   node tools/demo/serve.cjs [port]      then open http://127.0.0.1:8790/   */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', 'dist', 'demo');
const TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function headersFor(url) {
  const out = {}; let rules = [];
  try {
    let cur = null;
    for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) { cur = { pat: line.trim(), h: {} }; rules.push(cur); }
      else if (cur) { const i = line.indexOf(':'); cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    }
  } catch {}
  for (const r of rules) { const re = new RegExp('^' + r.pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); if (re.test(url)) Object.assign(out, r.h); }
  return out;
}
function start(port = 8790) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('Not found'); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', ...headersFor(u) });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
if (require.main === module) start(+process.argv[2] || 8790).then(s => console.log('demo at http://127.0.0.1:' + s.address().port + '/'));
module.exports = { start };
