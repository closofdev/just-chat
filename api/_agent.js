// Inti logika agent: definisi tool, eksekusi tool, dan loop function-calling.
// Dipakai bersama oleh server lokal (server.cjs) dan serverless Vercel (api/chat.js).
// Tidak ada state global kecuali antrean pertanyaan (lihat pendingQuestions).

export const CODEBUDDY_HOST = 'www.codebuddy.ai';

// Opsional: tanpa key pun URL Exa MCP tetap bisa dipanggil (rate-limited).
export function exaUrl() {
  const key = process.env.EXA_API_KEY || '';
  return key
    ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(key)}`
    : 'https://mcp.exa.ai/mcp';
}

// header wajib ala CLI CodeBuddy
export function codebuddyHeaders(token, contentType) {
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
    'x-codebuddy-request': '1',
  };
}

// --- Definisi tool yang dikirim ke model (format OpenAI function-calling) ---
export const TOOLS = [
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
        '- When `custom` is enabled (default), a "Type your own answer" option is added automatically\n' +
        "- Answers are returned as arrays of labels; set `multiple: true` to allow selecting more than one\n" +
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

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30 * 1000;
const MAX_TIMEOUT = 120 * 1000;

export function stripHtml(html) {
  let out = html.replace(/<(script|style|noscript|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<[^>]+>/g, '');
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToMarkdown(html) {
  // Turndown tidak dipakai (bukan dependensi); jatuh ke konversi teks polos.
  return stripHtml(html);
}

function acceptHeaderFor(format) {
  if (format === 'markdown') return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
  if (format === 'text') return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
  if (format === 'html') return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
  return 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
}

function uaFor(payload) {
  if (payload === 'opencode') return 'opencode';
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

export async function runWebfetch(args) {
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
    if (res.status === 403 && res.headers.get('cf-mitigated') === 'challenge') {
      res = await doFetch(url, { ...headers, 'User-Agent': uaFor('opencode') }, timeout);
    }
  } catch (e) {
    throw new Error(`Request gagal: ${e.message}`);
  }

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > MAX_RESPONSE_SIZE) throw new Error('Response too large (exceeds 5MB limit)');

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_RESPONSE_SIZE) throw new Error('Response too large (exceeds 5MB limit)');

  const contentType = res.headers.get('content-type') || '';
  const mime = (contentType.split(';')[0] || '').trim().toLowerCase();
  const title = `${url} (${contentType})`;

  if (mime.startsWith('image/')) {
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    return { title, output: 'Image fetched successfully', attachment: { mime, dataUrl: `data:${mime};base64,${b64}` } };
  }

  const text = new TextDecoder().decode(buf);
  if (format === 'html') return { title, output: text };
  if (contentType.includes('text/html')) {
    return { title, output: format === 'text' ? stripHtml(text) : htmlToMarkdown(text) };
  }
  return { title, output: text };
}

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

export function parseMcpResponse(body) {
  const trimmed = (body || '').trim();
  const direct = trimmed ? parseMcpPayload(trimmed) : undefined;
  if (direct) return direct;
  for (const line of (body || '').split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = parseMcpPayload(line.substring(6));
    if (data) return data;
  }
  return undefined;
}

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
  const seen = new Set();
  return results
    .filter((r) => r.url)
    .filter((r) => (seen.has(r.url) ? false : seen.add(r.url)))
    .slice(0, 8);
}

export async function runWebsearch(args) {
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
    res = await fetch(exaUrl(), {
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

// --- question: round-trip lewat SSE + POST reply ---
export const pendingQuestions = new Map();
let questionSeq = 0;

function createQuestionDeferred(questions) {
  const id = 'que_' + ++questionSeq + '_' + Date.now().toString(36);
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  pendingQuestions.set(id, { resolve, questions });
  const timer = setTimeout(() => {
    if (pendingQuestions.has(id)) pendingQuestions.delete(id);
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

// Jawab pertanyaan dari UI. Return true kalau id ditemukan.
export function resolveQuestion(id, answers) {
  const entry = pendingQuestions.get(id);
  if (!entry) return false;
  pendingQuestions.delete(id);
  entry.resolve(Array.isArray(answers) ? answers : []);
  return true;
}

export const MAX_TOOL_ROUNDS = 8;

export const SYSTEM_PROMPT =
  'You are a helpful assistant with access to tools. ' +
  'Gunakan tool yang tersedia bila perlu informasi terbaru atau mengambil konten URL. ' +
  'Saat butuh preferensi/pilihan dari user, gunakan tool "question".';

// Satu panggilan ke CodeBuddy. Mengembalikan { text, toolCalls, finishReason }.
// `onDelta` dipanggil tiap delta teks agar bisa di-stream langsung.
export async function callCodebuddy(token, model, messages, useTools, signal, onDelta) {
  const payload = { model, messages, stream: true };
  if (useTools) {
    payload.tools = TOOLS;
    payload.tool_choice = 'auto';
  }

  let res;
  try {
    res = await fetch(`https://${CODEBUDDY_HOST}/v2/chat/completions`, {
      method: 'POST',
      headers: codebuddyHeaders(token, 'application/json'),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    // tampilkan penyebab asli (cause) supaya tidak cuma "fetch failed"
    const cause = e && e.cause ? ` (cause=${e.cause.code || e.cause.message || e.cause})` : '';
    throw new Error(`tidak bisa menghubungi CodeBuddy: ${e.message}${cause}`);
  }

  if (res.status >= 400) {
    const errBody = await res.text();
    throw new Error(`CodeBuddy HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  const toolAcc = new Map();
  let finishReason = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      const choice = parsed.choices && parsed.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      if (delta.content) {
        text += delta.content;
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
  }

  const toolCalls = Array.from(toolAcc.values()).filter((t) => t.function.name);
  return { text, toolCalls, finishReason };
}

// Eksekusi satu tool. Mengembalikan { output, attachment?, display? }.
export async function executeTool(name, rawArgs, sse) {
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

// Susun ReadableStream SSE dari loop agent. `sse` menerima (event, data).
export function createAgentStream({ token, model, messages, signal, sse }) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const write = (event, data) => {
        const payload = (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(enc.encode(payload));
      };
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const useTools = round < MAX_TOOL_ROUNDS - 1;
          const onDelta = (chunk) => sse('token', { text: chunk });
          const { toolCalls } = await callCodebuddy(token, model, messages, useTools, signal, onDelta);
          if (!toolCalls.length) break;

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
            let result;
            try {
              result = await executeTool(tc.function.name, tc.function.arguments, sse);
            } catch (e) {
              result = { output: `Error: ${e.message}`, display: { kind: 'error', message: e.message } };
            }
            messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output });
            sse('tool_result', { id: tc.id, name: tc.function.name, display: result.display || null });
            if (result.attachment) sse('attachment', result.attachment);
          }
        }
      } catch (e) {
        if (!signal || !signal.aborted) sse('error', { message: e.message });
      } finally {
        write(null, '[DONE]');
        controller.close();
      }
    },
  });
}
