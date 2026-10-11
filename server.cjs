// Server statis + proxy ke CodeBuddy agar browser bebas dari blokir CORS.
// Token hanya hidup di proses ini (env CODEBUDDY_TOKEN), tidak pernah dikirim ke browser.
// Jalankan: node server.cjs  ->  buka http://localhost:8081
//
// Fitur agent (loop function-calling + tool webfetch/websearch/question) ada di
// bawah: lihat blok "AGENT TOOLS". Pola tool meniru opencode
// (packages/opencode/src/tool/*). Websearch memakai Exa MCP, sama seperti opencode.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8081;
const CODEBUDDY_TOKEN = process.env.CODEBUDDY_TOKEN || '';
const CODEBUDDY_HOST = 'www.codebuddy.ai';
// Opsional: tanpa key pun URL Exa MCP tetap bisa dipanggil (rate-limited).
const EXA_API_KEY = process.env.EXA_API_KEY || '';
const EXA_URL = EXA_API_KEY
  ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(EXA_API_KEY)}`
  : 'https://mcp.exa.ai/mcp';

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

// ============================================================================
// AGENT TOOLS
// Definisi tool (format OpenAI function-calling) + implementasinya.
// Meniru opencode: webfetch.ts, websearch.ts (Exa MCP), question.ts.
// ============================================================================

// --- Definisi tool yang dikirim ke model (native function-calling) ---
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'webfetch',
      description:
        '- Fetches content from a specified URL\n' +
        '- Takes a URL and optional format as input\n' +
        '- Fetches the URL content, converts to requested format (markdown by default)\n' +
        '- Use this tool when you need to retrieve and analyze web content\n' +
        'Usage notes:\n' +
        '  - The URL must be a fully-formed valid URL (http:// atau https://)\n' +
        '  - Format options: "markdown" (default), "text", or "html"',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch content from' },
          format: {
            type: 'string',
            enum: ['text', 'markdown', 'html'],
            description: 'The format to return the content in (text, markdown, or html). Defaults to markdown.',
          },
          timeout: { type: 'number', description: 'Optional timeout in seconds (max 120)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'websearch',
      description:
        '- Search the web - performs real-time web searches\n' +
        '- Provides up-to-date information for current events and recent data\n' +
        '- Use this tool for accessing information beyond knowledge cutoff\n' +
        'Usage notes:\n' +
        "  - livecrawl: 'fallback' (default) atau 'preferred'\n" +
        "  - type: 'auto' (default), 'fast', atau 'deep'",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Websearch query' },
          numResults: { type: 'number', description: 'Number of search results to return (default: 8)' },
          livecrawl: { type: 'string', enum: ['fallback', 'preferred'], description: "Live crawl mode (default: 'fallback')" },
          type: { type: 'string', enum: ['auto', 'fast', 'deep'], description: "Search type (default: 'auto')" },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'question',
      description:
        'Use this tool when you need to ask the user questions during execution. This allows you to:\n' +
        '1. Gather user preferences or requirements\n' +
        '2. Clarify ambiguous instructions\n' +
        '3. Get decisions on implementation choices as you work\n' +
        '4. Offer choices to the user about what direction to take.\n' +
        'Usage notes:\n' +
        '- When `custom` is enabled (default), a "Type your own answer" option is added automatically; don\'t include "Other" or catch-all options\n' +
        '- Answers are returned as arrays of labels; set `multiple: true` to allow selecting more than one\n' +
        '- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'Questions to ask',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'Complete question' },
                header: { type: 'string', description: 'Very short label (max 30 chars)' },
                options: {
                  type: 'array',
                  description: 'Available choices',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'Display text (1-5 words, concise)' },
                      description: { type: 'string', description: 'Explanation of choice' },
                    },
                    required: ['label', 'description'],
                  },
                },
                multiple: { type: 'boolean', description: 'Allow selecting multiple choices' },
                custom: { type: 'boolean', description: 'Allow typing a custom answer (default: true)' },
              },
              required: ['question', 'header', 'options'],
            },
          },
        },
        required: ['questions'],
      },
    },
  },
];

// --- webfetch: fetch URL + cuci HTML jadi text/markdown (meniru webfetch.ts) ---
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30 * 1000;
const MAX_TIMEOUT = 120 * 1000;

function stripHtml(html) {
  // buang script/style/noscript/iframe/object/embed + semua tag, sisakan teks
  let out = html.replace(/<(script|style|noscript|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<[^>]+>/g, '');
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // rapikan spasi berlebih
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToMarkdown(html) {
  // Turndown opsional (kalau terpasang). Fallback ke text.
  try {
    const TurndownService = require('turndown');
    const td = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });
    td.remove(['script', 'style', 'meta', 'link']);
    return td.turndown(html);
  } catch {
    return stripHtml(html);
  }
}

function acceptHeaderFor(format) {
  if (format === 'markdown') return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
  if (format === 'text') return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
  if (format === 'html') return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
  return 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
}

function uaFor(payload) {
  if (payload === 'opencode') {
    return 'opencode';
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
}

async function doFetch(url, headers, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runWebfetch(args) {
  const url = String(args.url || '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('URL must start with http:// or https://');
  }
  const format = args.format || 'markdown';
  const timeout = Math.min((args.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT);
  const headers = {
    'User-Agent': uaFor('browser'),
    Accept: acceptHeaderFor(format),
    'Accept-Language': 'en-US,en;q=0.9',
  };

  let res;
  try {
    res = await doFetch(url, headers, timeout);
    // Retry dengan UA jujur bila kena Cloudflare challenge (meniru webfetch.ts)
    if (res.status === 403 && res.headers.get('cf-mitigated') === 'challenge') {
      res = await doFetch(url, { ...headers, 'User-Agent': uaFor('opencode') }, timeout);
    }
  } catch (e) {
    throw new Error(`Request gagal: ${e.message}`);
  }

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > MAX_RESPONSE_SIZE) throw new Error('Response too large (exceeds 5MB limit)');

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_RESPONSE_SIZE) throw new Error('Response too large (exceeds 5MB limit)');

  const contentType = res.headers.get('content-type') || '';
  const mime = (contentType.split(';')[0] || '').trim().toLowerCase();
  const title = `${url} (${contentType})`;

  if (mime.startsWith('image/')) {
    const b64 = buf.toString('base64');
    return { title, output: 'Image fetched successfully', attachment: { mime, dataUrl: `data:${mime};base64,${b64}` } };
  }

  const text = buf.toString('utf8');
  if (format === 'html') return { title, output: text };
  if (contentType.includes('text/html')) {
    return { title, output: format === 'text' ? stripHtml(text) : htmlToMarkdown(text) };
  }
  return { title, output: text };
}

// --- websearch: Exa MCP (JSON-RPC 2.0), meniru mcp-websearch.ts + websearch.ts ---
function parseMcpPayload(payload) {
  const trimmed = (payload || '').trim();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const data = JSON.parse(trimmed);
    const content = data?.result?.content;
    if (Array.isArray(content)) {
      const hit = content.find((item) => item && item.text);
      if (hit) return hit.text;
    }
  } catch {
    /* bukan JSON valid */
  }
  return undefined;
}

function parseMcpResponse(body) {
  const trimmed = (body || '').trim();
  const direct = trimmed ? parseMcpPayload(trimmed) : undefined;
  if (direct) return direct;
  // fallback: respons SSE ("data: {...}")
  for (const line of (body || '').split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = parseMcpPayload(line.substring(6));
    if (data) return data;
  }
  return undefined;
}

// Hasil Exa berbentuk teks (judul/url/snippet). Coba ekstrak daftar terstruktur
// agar UI bisa menampilkan hasil yang bisa diklik.
function parseSearchResults(text) {
  if (!text) return [];
  const results = [];
  const lines = text.split('\n');
  const urlRe = /https?:\/\/[^\s)\]"'<>]+/;
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const urlMatch = line.match(urlRe);
    // baris judul biasanya berformat "Title: ..." atau "N. Title"
    const titleMatch = line.match(/^(?:\d+[.)]\s*)?(?:Title:\s*)?(.+)$/i);
    if (urlMatch) {
      if (cur) { cur.url = urlMatch[0]; results.push(cur); cur = null; }
      else results.push({ title: '', url: urlMatch[0], snippet: '' });
    } else if (/^(title|url|snippet|text|content)[:\s]/i.test(line) || titleMatch) {
      const clean = line.replace(/^(title|snippet|text|content)[:\s]+/i, '');
      if (!cur) cur = { title: clean.slice(0, 160), url: '', snippet: '' };
      else if (!cur.snippet) cur.snippet = clean.slice(0, 300);
    }
  }
  if (cur) results.push(cur);
  // hanya kembalikan yang punya url, unik, maksimal 8
  const seen = new Set();
  return results
    .filter((r) => r.url)
    .filter((r) => (seen.has(r.url) ? false : seen.add(r.url)))
    .slice(0, 8);
}

async function runWebsearch(args) {
  const params = {
    query: String(args.query || ''),
    type: args.type || 'auto',
    numResults: args.numResults || 8,
    livecrawl: args.livecrawl || 'fallback',
  };
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'web_search_exa', arguments: params },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(EXA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(`Websearch request gagal: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Websearch HTTP ${res.status}`);
  const text = await res.text();
  return parseMcpResponse(text) || 'No search results found. Please try a different query.';
}

// --- question: round-trip ke browser via SSE + POST reply ---
// id -> { resolve, reject } untuk pertanyaan yang sedang menunggu jawaban user.
const pendingQuestions = new Map();
let questionSeq = 0;

function createQuestionDeferred(questions) {
  const id = 'que_' + (++questionSeq) + '_' + Date.now().toString(36);
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  pendingQuestions.set(id, { resolve, reject, questions });
  // timeout keamanan 10 menit
  const timer = setTimeout(() => {
    const entry = pendingQuestions.get(id);
    if (entry) {
      pendingQuestions.delete(id);
      entry.reject(new Error('Pertanyaan tidak dijawab (timeout)'));
    }
  }, 10 * 60 * 1000);
  return { id, promise, timer };
}

function formatQuestionAnswers(questions, answers) {
  const parts = questions.map((q, i) => {
    const a = answers[i];
    const val = a && a.length ? a.join(', ') : 'Unanswered';
    return `"${q.question}"="${val}"`;
  });
  return `User has answered your questions: ${parts.join(', ')}. You can now continue with the user's answers in mind.`;
}

// ============================================================================
// LOOP AGENT + SSE
// Alur: kirim messages + tools ke CodeBuddy; kalau model minta tool_calls,
// eksekusi tool lalu ulangi; kalau teks biasa, stream ke browser.
// Browser <-> server via SSE (server->client) + POST (client->server).
// ============================================================================

const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT =
  'You are a helpful assistant with access to tools. ' +
  'Gunakan tool yang tersedia bila perlu informasi terbaru atau mengambil konten URL. ' +
  'Saat butuh preferensi/pilihan dari user, gunakan tool "question".';

function sseWrite(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Satu panggilan ke CodeBuddy. Mengembalikan { text, toolCalls, finishReason }.
// `onDelta` (opsional) dipanggil tiap delta teks agar bisa di-stream langsung.
async function callCodebuddy(model, messages, useTools, signal, onDelta) {
  const payload = {
    model,
    messages,
    stream: true,
  };
  if (useTools) {
    payload.tools = TOOLS;
    payload.tool_choice = 'auto';
  }

  const upstreamPath = '/v2/chat/completions';
  const bodyStr = JSON.stringify(payload);

  const upstream = await new Promise((resolve, reject) => {
    const p = https.request(
      {
        host: CODEBUDDY_HOST,
        path: upstreamPath,
        method: 'POST',
        headers: { ...codebuddyHeaders(CODEBUDDY_TOKEN, 'application/json'), 'content-length': Buffer.byteLength(bodyStr) },
      },
      resolve,
    );
    p.on('error', reject);
    if (signal) signal.addEventListener('abort', () => p.destroy(new Error('aborted')));
    p.write(bodyStr);
    p.end();
  });

  return await new Promise((resolve, reject) => {
    if (upstream.statusCode >= 400) {
      let errBody = '';
      upstream.on('data', (c) => (errBody += c));
      upstream.on('end', () => reject(new Error(`CodeBuddy HTTP ${upstream.statusCode}: ${errBody.slice(0, 300)}`)));
      return;
    }

    let buf = '';
    let text = '';
    // akumulasi tool_calls berdasarkan index
    const toolAcc = new Map();
    let finishReason = null;

    upstream.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = parsed.choices && parsed.choices[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (delta.content) {
          text += delta.content;
          // stream per potongan ke browser (bukan satu blob di akhir)
          if (onDelta) onDelta(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolAcc.get(idx) || { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.function.name = tc.function.name;
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
            toolAcc.set(idx, cur);
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    });

    upstream.on('end', () => {
      const toolCalls = Array.from(toolAcc.values()).filter((t) => t.function.name);
      resolve({ text, toolCalls, finishReason });
    });
    upstream.on('error', reject);
  });
}

// Eksekusi satu tool. Mengembalikan { output, attachment?, display? }.
async function executeTool(name, rawArgs, sse) {
  let args = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    throw new Error(`Argumen tool tidak valid: ${rawArgs}`);
  }

  if (name === 'webfetch') {
    sse('tool', { name, args, label: `Mengambil ${args.url || ''}` });
    const r = await runWebfetch(args);
    const summary = (r.output || '').replace(/\s+/g, ' ').slice(0, 400);
    return {
      output: r.output,
      attachment: r.attachment,
      display: { kind: 'webfetch', url: args.url, format: args.format || 'markdown', summary },
    };
  }

  if (name === 'websearch') {
    sse('tool', { name, args, label: `Mencari di web: ${args.query || ''}` });
    const output = await runWebsearch(args);
    return {
      output,
      display: { kind: 'websearch', query: args.query, results: parseSearchResults(output) },
    };
  }

  if (name === 'question') {
    const questions = Array.isArray(args.questions) ? args.questions : [];
    sse('tool', { name, args, label: 'Menanyakan ke user' });
    const { id, promise, timer } = createQuestionDeferred(questions);
    sse('question', { id, questions });
    try {
      const answers = await promise;
      return {
        output: formatQuestionAnswers(questions, answers),
        display: { kind: 'question', questions, answers },
      };
    } finally {
      clearTimeout(timer);
      pendingQuestions.delete(id);
    }
  }

  throw new Error(`Tool tidak dikenal: ${name}`);
}

// Handler utama: POST /api/chat  (body: { model, messages })
async function handleChat(req, res, body) {
  let input;
  try {
    input = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body bukan JSON valid' }));
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
    connection: 'keep-alive',
  });

  const sse = (event, data) => sseWrite(res, event, data);
  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const useTools = round < MAX_TOOL_ROUNDS - 1;
      // stream tiap delta teks langsung ke browser
      const onDelta = (chunk) => sse('token', { text: chunk });
      const { toolCalls } = await callCodebuddy(model, messages, useTools, ctrl.signal, onDelta);

      // tidak ada tool call -> selesai (teks sudah ter-stream via onDelta)
      if (!toolCalls.length) break;

      // ada tool call: catat assistant msg (teks sudah ter-stream)
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id || 'call_' + Math.random().toString(36).slice(2),
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments || '{}' },
        })),
      });

      for (const tc of messages[messages.length - 1].tool_calls) {
        const callId = tc.id;
        let result;
        try {
          result = await executeTool(tc.function.name, tc.function.arguments, sse);
        } catch (e) {
          result = { output: `Error: ${e.message}`, display: { kind: 'error', message: e.message } };
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output });
        // kirim hasil terstruktur untuk panel lipat di UI
        sse('tool_result', {
          id: callId,
          name: tc.function.name,
          display: result.display || null,
        });
        if (result.attachment) sse('attachment', result.attachment);
      }
    }
  } catch (e) {
    if (!ctrl.signal.aborted) sse('error', { message: e.message });
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

function collectBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function handleQuestionReply(req, res, body) {
  let input;
  try {
    input = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Body bukan JSON valid' }));
    return;
  }
  const entry = pendingQuestions.get(input.id);
  if (!entry) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request tidak ditemukan / sudah dijawab' }));
    return;
  }
  pendingQuestions.delete(input.id);
  entry.resolve(Array.isArray(input.answers) ? input.answers : []);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
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

  // --- Agent: loop function-calling + tool (webfetch/websearch/question) ---
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    collectBody(req).then((body) => handleChat(req, res, body));
    return;
  }
  if (url.pathname === '/api/tool/question/reply' && req.method === 'POST') {
    collectBody(req).then((body) => handleQuestionReply(req, res, body));
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

if (require.main === module) {
  server.listen(PORT, () => console.log(
    `UI: http://localhost:${PORT}  -> CodeBuddy ${CODEBUDDY_HOST}  ` +
    `(CODEBUDDY_TOKEN: ${CODEBUDDY_TOKEN ? 'ada' : 'KOSONG'}, EXA_API_KEY: ${EXA_API_KEY ? 'ada' : 'kosong (mode tanpa key)'})`
  ));
}

// Ekspor untuk pengujian (tidak dipakai saat dijalankan sebagai server).
module.exports = { runWebfetch, runWebsearch, parseMcpResponse, stripHtml, TOOLS };
