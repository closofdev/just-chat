import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, toHistory } from '../lib/api.js';
import { DEFAULT_MODEL, FALLBACK_MODELS } from '../config/models.js';
import { calcTps } from '../lib/time.js';

const seedMessages = () => ([
  { id: 1, role: 'user', content: 'dadaw', time: Date.now() - 60000 },
  { id: 2, role: 'ai', content: 'Halo! Ada yang bisa saya bantu?', time: Date.now() - 30000, tps: 26 }
]);

// State + logika room chat: kirim, regenerate, stop, like, scroll, tick waktu.
export function useChat(scrollRef) {
  const [messages, setMessages] = useState(seedMessages);
  const [streamText, setStreamText] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [, setNow] = useState(Date.now());
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState(FALLBACK_MODELS);

  const messagesRef = useRef(messages);
  const modelRef = useRef(model);
  useEffect(() => { modelRef.current = model; }, [model]);
  const abortRef = useRef(null);
  const forceScrollRef = useRef(false);
  const fullRef = useRef('');
  const idRef = useRef(3);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // daftar model murni dari config (src/config/models.js), tanpa tambahan server
  useEffect(() => {
    setModels([...FALLBACK_MODELS]);
  }, []);

  // perbarui label waktu relatif tiap 5 detik tanpa fetch ulang
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // scroll ke bawah, kecuali user sedang membaca ke atas (force=true tetap paksa)
  const scrollBottom = useCallback((force) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!force && el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  useEffect(() => {
    scrollBottom(forceScrollRef.current);
    forceScrollRef.current = false;
  }, [messages, scrollBottom]);

  useEffect(() => {
    if (streamText !== null) scrollBottom(false);
  }, [streamText, scrollBottom]);

  const pushMessages = useCallback((next) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const requestAI = useCallback(async (history) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    fullRef.current = '';
    setThinking(true);
    setIsStreaming(true);
    setStreamText('');
    forceScrollRef.current = true;
    scrollBottom(true);
    // kunci identitas sesuai model terpilih agar tidak ikut persona riwayat chat
    const sysHistory = [
      { role: 'system', content: `Kamu adalah model AI "${modelRef.current}". Selalu jawab sesuai identitas aslimu, jangan mengaku sebagai model lain.` },
      ...history
    ];
    try {
      const full = await streamChat(sysHistory, {
        model: modelRef.current,
        signal: ctrl.signal,
        onToken: (text, first) => {
          fullRef.current = text;
          if (first) setThinking(false);
          setStreamText(text);
        }
      });
      pushMessages([...messagesRef.current, {
        id: idRef.current++, role: 'ai',
        content: full || '(respon kosong)', time: Date.now(), tps: calcTps(full, t0)
      }]);
    } catch (err) {
      if (ctrl.signal.aborted) {
        // stop manual: simpan jawaban parsial bila sudah ada
        if (fullRef.current.trim()) {
          pushMessages([...messagesRef.current, {
            id: idRef.current++, role: 'ai',
            content: fullRef.current, time: Date.now(), tps: calcTps(fullRef.current, t0)
          }]);
        } else {
          setMessages([...messagesRef.current]);
        }
      } else {
        pushMessages([...messagesRef.current, {
          id: idRef.current++, role: 'ai',
          content: `Gagal menghubungi AI (${err.message}). Jalankan "npm run serve" lalu buka http://localhost:8081`,
          time: Date.now()
        }]);
      }
    } finally {
      setThinking(false);
      setIsStreaming(false);
      setStreamText(null);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [pushMessages, scrollBottom]);

  const send = useCallback((content) => {
    const next = [...messagesRef.current, { id: idRef.current++, role: 'user', content, time: Date.now() }];
    pushMessages(next);
    forceScrollRef.current = true;
    requestAI(toHistory(next));
  }, [pushMessages, requestAI]);

  const regenerate = useCallback((idx) => {
    const cur = messagesRef.current;
    let prompt = '';
    for (let k = idx - 1; k >= 0; k--) {
      if (cur[k].role === 'user') { prompt = cur[k].content; break; }
    }
    // kirim ulang bubble user di bawah, bubble AI lama tetap dipertahankan
    const next = prompt
      ? [...cur, { id: idRef.current++, role: 'user', content: prompt, time: Date.now() }]
      : [...cur];
    pushMessages(next);
    forceScrollRef.current = true;
    requestAI(toHistory(next));
  }, [pushMessages, requestAI]);

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const toggleLike = useCallback((id) => {
    const next = messagesRef.current.map((m) => (m.id === id ? { ...m, liked: !m.liked } : m));
    pushMessages(next);
  }, [pushMessages]);

  return { messages, streamText, thinking, isStreaming, model, models, setModel, send, regenerate, stop, toggleLike };
}
