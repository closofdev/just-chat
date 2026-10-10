// Server statis + proxy ke CodeBuddy agar browser bebas dari blokir CORS.
// Token hanya hidup di proses ini (env CODEBUDDY_TOKEN), tidak pernah dikirim ke browser.
// Jalankan: node server.cjs  ->  buka http://localhost:8081
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8081;
const CODEBUDDY_TOKEN = process.env.CODEBUDDY_TOKEN || '';
const CODEBUDDY_HOST = 'www.codebuddy.ai';

// sajikan hasil build React bila ada, fallback ke file root (mode vanilla lama)
const DIST = path.join(__dirname, 'dist');
const ROOT = fs.existsSync(DIST) ? DIST : __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

// header wajib ala CLI CodeBuddy
function codebuddyHeaders(token, contentType) {
  return {
    accept: 'text/event-stream',
    authorization: `Bearer ${token}`,
    'content-type': contentType || 'application/json',
    'x-agent-intent': 'craft',
    'x-agent-purpose': 'conversation_topic',
    'x-agent-type': 'auxiliary',
    'x-ide-name': 'CLI',
    'x-ide-type': 'CLI',
    'x-ide-version': '2.161.4',
    'x-product': 'SaaS',
    'x-private-data': 'false',
    'x-codebuddy-request': '1'
  };
}

function proxyCodebuddy(req, res, url) {
  if (!CODEBUDDY_TOKEN) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'CODEBUDDY_TOKEN belum diset di server' }));
    return;
  }
  const upstreamPath = url.pathname.replace(/^\/cb/, '/v2');
  let proxy;
  try {
    proxy = https.request(
      {
        host: CODEBUDDY_HOST,
        path: upstreamPath + url.search,
        method: req.method,
        headers: codebuddyHeaders(CODEBUDDY_TOKEN, req.headers['content-type'])
      },
      (upRes) => {
        res.writeHead(upRes.statusCode, {
          'content-type': upRes.headers['content-type'] || 'application/json',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        upRes.pipe(res);
      }
    );
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'gagal menghubungi CodeBuddy' }));
    return;
  }
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'CodeBuddy tidak terjangkau' }));
  });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  // daftar model: satu-satunya sumber kebenaran ada di src/config/models.js,
  // endpoint ini hanya supaya klien lama tetap mendapat bentuk data yang sama.
  if (url.pathname === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [{ id: 'deepseek-v4.1-flash', object: 'model', owned_by: 'codebuddy' }]
    }));
    return;
  }

  if (url.pathname.startsWith('/cb')) { proxyCodebuddy(req, res, url); return; }

  const file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const fp = path.join(ROOT, path.normalize(file));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(
  `UI: http://localhost:${PORT}  -> CodeBuddy ${CODEBUDDY_HOST}  (CODEBUDDY_TOKEN: ${CODEBUDDY_TOKEN ? 'ada' : 'KOSONG'})`
));
