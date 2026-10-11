import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, toHistory, replyQuestion } from '../lib/api.js';
import { DEFAULT_MODEL, MODELS } from '../config/models.js';
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
  const [models, setModels] = useState(MODELS);
  // tool yang sedang dijalankan agent (badge live, hilang setelah selesai)
  const [activeTool, setActiveTool] = useState(null);
  // pertanyaan dari agent yang menunggu jawaban user
  const [pendingQuestion, setPendingQuestion] = useState(null);

  const messagesRef = useRef(messages);
  const modelRef = useRef(model);
  useEffect(() => { modelRef.current = model; }, [model]);
  const abortRef = useRef(null);
  const forceScrollRef = useRef(false);
  const fullRef = useRef('');
  const idRef = useRef(3);
  const pendingQuestionRef = useRef(null);

  useEffect(() => { pendingQuestionRef.current = pendingQuestion; }, [pendingQuestion]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // daftar model murni dari config (src/config/models.js), tanpa tambahan server
  useEffect(() => {
    setModels([...MODELS]);
  }, []);

  // perbarui label waktu relatif tiap 5 detik tanpa fetch ulang
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // auto-scroll: tempel ke bawah selama user tidak menggulir ke atas sendiri
  const stickRef = useRef(true);

  const scrollBottom = useCallback((force) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!force && !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollRef]);

  // deteksi posisi user: kalau jauh dari bawah, hentikan auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickRef.current = distance < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  useEffect(() => {
    if (forceScrollRef.current) {
      stickRef.current = true;
      scrollBottom(true);
      forceScrollRef.current = false;
      return;
    }
    scrollBottom(false);
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
    try {
      const full = await streamChat(history, {
        model: modelRef.current,
        signal: ctrl.signal,
        onToken: (text, first) => {
          fullRef.current = text;
          if (first) setThinking(false);
          setStreamText(text);
        },
        onTool: (info) => {
          setThinking(false);
          if (info.name === 'error') {
            setActiveTool({ name: 'error', label: info.label });
            return;
          }
          setActiveTool({ name: info.name, label: info.label });
        },
        onToolResult: () => {
          // tool selesai -> sembunyikan badge
          setActiveTool(null);
        },
        onQuestion: (q) => {
          setThinking(false);
          setActiveTool(null);
          setPendingQuestion({ id: q.id, questions: q.questions || [] });
        },
      });
      pushMessages([...messagesRef.current, {
        id: idRef.current++, role: 'ai',
        content: full || '(respon kosong)', time: Date.now(), tps: calcTps(full, t0),
      }]);
    } catch (err) {
      if (ctrl.signal.aborted) {
        // stop manual: simpan jawaban parsial bila sudah ada
        if (fullRef.current.trim()) {
          pushMessages([...messagesRef.current, {
            id: idRef.current++, role: 'ai',
            content: fullRef.current, time: Date.now(), tps: calcTps(fullRef.current, t0),
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
      setActiveTool(null);
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

  // kirim jawaban user untuk pertanyaan agent -> server lanjut loop
  const answerQuestion = useCallback(async (answers) => {
    const pq = pendingQuestionRef.current;
    if (!pq) return;
    setPendingQuestion(null);
    try {
      await replyQuestion(pq.id, answers);
    } catch (err) {
      pushMessages([...messagesRef.current, {
        id: idRef.current++, role: 'ai',
        content: `Gagal mengirim jawaban (${err.message}).`, time: Date.now()
      }]);
    }
  }, [pushMessages]);

  return {
    messages, streamText, thinking, isStreaming, model, models, setModel,
    send, regenerate, stop, toggleLike,
    activeTool, pendingQuestion, answerQuestion,
  };
}
