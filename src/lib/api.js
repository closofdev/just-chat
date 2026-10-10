// Klien AI (streaming SSE) via proxy same-origin ke CodeBuddy.
// Token disuntikkan oleh server (env CODEBUDDY_TOKEN), jadi tidak ada
// kredensial yang ikut ke bundle browser.
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

// Stream token per token. onToken(fullText, isFirstToken). Resolve dengan teks penuh.
export async function streamChat(history, { model, signal, onToken }) {
  const res = await fetch(endpointFor(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'system', content: 'You are a helpful assistant.' }, ...history],
      stream: true
    }),
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
        const delta = JSON.parse(data).choices[0].delta || {};
        const tok = delta.content || '';
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
