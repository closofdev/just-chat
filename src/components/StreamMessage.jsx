import React, { useEffect, useMemo, useRef } from 'react';
import { md, wrapWords } from '../lib/markdown.js';
import { useCodeCopy } from '../hooks/useCodeCopy.js';

// Baris jawaban AI yang sedang di-stream: fade per kata + kursor kedip.
export function StreamMessage({ text }) {
  const bodyRef = useRef(null);
  const html = useMemo(() => wrapWords(md(text)), [text]);
  useCodeCopy(bodyRef, html);

  useEffect(() => {
    const spans = bodyRef.current?.querySelectorAll('.stream-word');
    const last = spans?.[spans.length - 1];
    if (last) last.classList.add('fresh');
  }, [html]);

  return (
    <div className="msg-ai">
      <div className="ai-body">
        <div
          className="md"
          ref={bodyRef}
          dangerouslySetInnerHTML={{ __html: html + '<span class="streaming-caret"></span>' }}
        />
      </div>
    </div>
  );
}
