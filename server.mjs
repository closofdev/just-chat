// Server lokal (node langsung) untuk just-chat.
// Logika agent ada di api/_agent.js, dipakai bersama serverless Vercel.
// Jalankan: node server.mjs  ->  buka http://localhost:8081
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentStream, resolveQuestion, SYSTEM_PROMPT } from './api/_agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8081;
const CODEBUDDY_TOKEN = process.env.CODEBUDDY_TOKEN || '';
const CODEBUDDY_HOST = 'www.codebuddy.ai';
const EXA_API_KEY = process.env.EXA_API_KEY || '';

// sajikan hasil build React bila ada, fallback ke file root (mode vanilla lama)
const DIST = path.join(__dirname, 'dist');
const ROOT = fs.existsSync(DIST) ? DIST : __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

function collectBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function sseWrite(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Handler POST /api/chat
async function handleChat(req, res, body) {
  let input;
  try {
    input = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body bukan JSON valid' }));
    return;
  }

  if (!CODEBUDDY_TOKEN) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'CODEBUDDY_TOKEN belum diset di server' }));
    return;
  }

  const model = input.model || 'deepseek-v4.1-flash';
  const messages = Array.isArray(input.messages) ? [...input.messages] : [];
  if (!messages.some((m) => m.role === 'system')) {
    messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  });

  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());

  const sse = (event, data) => sseWrite(res, event, data);
  const stream = createAgentStream({ token: CODEBUDDY_TOKEN, model, messages, signal: ctrl.signal, sse });
  const reader = stream.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
    }
  } finally {
    res.end();
  }
}

// Handler POST /api/tool/question/reply
async function handleQuestionReply(req, res, body) {
  let input;
  try {
    input = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body bukan JSON valid' }));
    return;
  }
  const ok = resolveQuestion(input.id, input.answers);
  if (!ok) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request tidak ditemukan / sudah dijawab' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  // daftar model: sumber kebenaran ada di src/config/models.js
  if (url.pathname === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [{ id: 'deepseek-v4.1-flash', object: 'model', owned_by: 'codebuddy' }]
    }));
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    collectBody(req).then((body) => handleChat(req, res, body));
    return;
  }
  if (url.pathname === '/api/tool/question/reply' && req.method === 'POST') {
    collectBody(req).then((body) => handleQuestionReply(req, res, body));
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

server.listen(PORT, () => console.log(
  `UI: http://localhost:${PORT}  -> CodeBuddy ${CODEBUDDY_HOST}  ` +
  `(CODEBUDDY_TOKEN: ${CODEBUDDY_TOKEN ? 'ada' : 'KOSONG'}, EXA_API_KEY: ${EXA_API_KEY ? 'ada' : 'kosong (mode tanpa key)'})`
));
