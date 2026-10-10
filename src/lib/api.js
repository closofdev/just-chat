// Klien AI asli (OpenAI-compatible, streaming SSE) via 9Router lokal.
// Request selalu lewat proxy same-origin (/v1); API key disuntikkan oleh server,
// jadi tidak ada kredensial yang ikut ke bundle browser.
import { DEFAULT_MODEL, FALLBACK_MODELS } from '../config/models.js';

export const API_BASE = '/v1';

export { DEFAULT_MODEL, FALLBACK_MODELS };

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.data || []).map((m) => m.id).filter(Boolean);
}

export function toHistory(messages) {
  return messages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
}

// Stream token per token. onToken(fullText, isFirstToken). Resolve dengan teks penuh.
export async function streamChat(history, { model, signal, onToken }) {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: history, stream: true }),
    signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let gotToken = false;
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
      try {
        const tok = JSON.parse(data).choices[0].delta.content || '';
        if (tok) {
          const first = !gotToken;
          gotToken = true;
          full += tok;
          onToken(full, first);
        }
      } catch (e) { /* abaikan chunk yang belum lengkap */ }
    }
  }
  return full;
}
