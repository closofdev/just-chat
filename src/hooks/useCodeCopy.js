import { useEffect, useRef } from 'react';
import { COPY_SVG, CHECK_SVG } from '../lib/icons.jsx';

// Pasang tombol salin di setiap <pre> dalam scope (dipakai AiMessage & StreamMessage).
export function useCodeCopy(scopeRef, html) {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    scope.querySelectorAll('pre').forEach((pre) => {
      if (pre.dataset.copyReady) return;
      pre.dataset.copyReady = '1';
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.title = 'Salin kode';
      btn.setAttribute('aria-label', 'Salin kode');
      btn.innerHTML = COPY_SVG;
      let timer = null;
      btn.onclick = (e) => {
        e.stopPropagation();
        const code = (pre.querySelector('code') || pre).innerText;
        navigator.clipboard.writeText(code);
        btn.innerHTML = CHECK_SVG;
        btn.classList.add('done');
        clearTimeout(timer);
        timer = setTimeout(() => { btn.innerHTML = COPY_SVG; btn.classList.remove('done'); }, 1200);
      };
      pre.appendChild(btn);
    });
  }, [scopeRef, html]);
}
