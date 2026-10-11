// Klien AI (streaming SSE) via proxy same-origin ke server (/api/chat).
// Server menangani loop agent + tool (webfetch/websearch/question); browser
// hanya menampilkan token, status tool, dan form question.
import { DEFAULT_MODEL, MODELS } from '../config/models.js';

export const DEFAULT = DEFAULT_MODEL;
export { DEFAULT_MODEL, MODELS };

// petakan model -> endpoint proxy yang sesuai providernya
export function endpointFor(modelId) {
  const m = MODELS.find((x) => x.id === modelId) || MODELS[0];
  return m.provider === 'codebuddy' ? '/cb/chat/completions' : '/v1/chat/completions';
}

export function toHistory(messages) {
  return messages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
}

// Balas pertanyaan yang diajukan agent (tool "question").
export async function replyQuestion(id, answers) {
  const res = await fetch('/api/tool/question/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, answers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Stream via /api/chat (loop agent di server). Handlers opsional:
//   onToken(fullText, isFirstToken)   -> teks jawaban bertambah (per potongan)
//   onTool({ name, args, label })     -> agent MULAI memanggil tool
//   onToolResult({ id, name, display }) -> hasil terstruktur setelah tool selesai
//   onQuestion({ id, questions })     -> agent bertanya, tunggu replyQuestion()
// Resolve dengan teks penuh.
export async function streamChat(history, { model, signal, onToken, onTool, onToolResult, onQuestion }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, messages: history }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let gotToken = false;
  let currentEvent = null;

  const emit = (data) => {
    const tok = data.text || '';
    if (!tok) return;
    const first = !gotToken;
    gotToken = true;
    full += tok;
    if (onToken) onToken(full, first);
  };

  const handleEvent = (event, data) => {
    if (event === 'token') return emit(data);
    if (event === 'tool' && onTool) return onTool(data);
    if (event === 'tool_result' && onToolResult) return onToolResult(data);
    if (event === 'question' && onQuestion) return onQuestion(data);
    if (event === 'error' && onTool) return onTool({ name: 'error', label: data.message, args: {} });
    // tanpa event name -> anggap token biasa (fallback kompatibel)
    if (!event && data && data.text) return emit(data);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('event:')) {
        currentEvent = t.slice(6).trim();
        continue;
      }
      if (!t.startsWith('data:')) continue;
      const raw = t.slice(5).trim();
      if (raw === '[DONE]') continue;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue; // chunk belum lengkap
      }
      handleEvent(currentEvent, data);
      currentEvent = null;
    }
  }
  return full;
}
