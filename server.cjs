// Server statis + proxy agar browser bisa mengakses API lokal tanpa kena blokir CORS.
// Jalankan: node server.js  ->  buka http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const UPSTREAM = 'http://127.0.0.1:20128';
const PORT = 8081;
// sajikan hasil build React bila ada, fallback ke file root (dev vanilla lama)
const DIST = path.join(__dirname, 'dist');
const ROOT = fs.existsSync(DIST) ? DIST : __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/v1/')) {
    try {
      const fwdHeaders = {};
      if (req.headers['content-type']) fwdHeaders['content-type'] = req.headers['content-type'];
      if (req.headers['authorization']) fwdHeaders['authorization'] = req.headers['authorization'];
      const proxy = http.request(
        UPSTREAM + url.pathname + url.search,
        { method: req.method, headers: fwdHeaders },
        (upRes) => {
          res.writeHead(upRes.statusCode, {
            'content-type': upRes.headers['content-type'] || 'application/json'
          });
          upRes.pipe(res);
        }
      );
      proxy.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream tidak terjangkau' }));
      });
      req.pipe(proxy);
    } catch (e) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy gagal' }));
    }
    return;
  }

  const file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const fp = path.join(ROOT, path.normalize(file));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`UI: http://localhost:${PORT}  -> proxy ${UPSTREAM}`));
