// Serverless function Vercel: POST /api/chat
// Mem-proxy ke CodeBuddy sambil menyuntikkan CODEBUDDY_TOKEN dari Environment
// Variables Vercel. Token tidak pernah dikirim ke browser.
import { createAgentStream, SYSTEM_PROMPT, MAX_TOOL_ROUNDS } from './_agent.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.CODEBUDDY_TOKEN || '';
  if (!token) {
    res.status(500).json({ error: 'CODEBUDDY_TOKEN belum diset di Environment Variables Vercel' });
    return;
  }

  // Vercel (Node runtime) biasanya sudah mem-parse JSON; kalau belum, baca manual.
  let input = req.body;
  if (!input || typeof input === 'string') {
    try {
      input = JSON.parse(input || '{}');
    } catch {
      res.status(400).json({ error: 'Body bukan JSON valid' });
      return;
    }
  }

  const model = input.model || 'deepseek-v4.1-flash';
  const messages = Array.isArray(input.messages) ? [...input.messages] : [];
  if (!messages.some((m) => m.role === 'system')) {
    messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  // SSE ditulis langsung ke socket respons; jangan pakai res.end() sebelum selesai.
  const sse = (event, data) => {
    const payload = (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(data)}\n\n`;
    res.write(payload);
  };
  res.write(':ok\n\n');

  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());

  const stream = createAgentStream({ token, model, messages, signal: ctrl.signal, sse });
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(new TextDecoder().decode(value));
    }
  } catch (e) {
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
    } catch { /* koneksi sudah tutup */ }
  } finally {
    res.end();
  }
}

// dipakai agar MAX_TOOL_ROUNDS ikut ter-tree-shake dengan benar saat bundling
void MAX_TOOL_ROUNDS;
