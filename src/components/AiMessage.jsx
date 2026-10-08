import React, { useEffect, useMemo, useRef, useState } from 'react';
import { md } from '../lib/markdown.js';
import { fmtResp } from '../lib/time.js';
import { useCodeCopy } from '../hooks/useCodeCopy.js';
import { CopyIcon, RetryIcon, HeartIcon, CheckIcon } from '../lib/icons.jsx';

export function AiMessage({ msg, onRegenerate, onToggleLike }) {
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const html = useMemo(() => md(msg.content), [msg.content]);
  useCodeCopy(bodyRef, html);

  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="msg-ai">
      <div className="ai-body">
        <div className="md" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
        <div className="ai-actions">
          <button className={'mini-btn' + (copied ? ' done' : '')} title="Salin" aria-label="Salin" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button className="mini-btn" title="Buat ulang" aria-label="Buat ulang" onClick={onRegenerate}>
            <RetryIcon />
          </button>
          <button
            className={'mini-btn' + (msg.liked ? ' liked' : '')}
            title="Suka" aria-label="Suka" onClick={onToggleLike}
          >
            <HeartIcon />
          </button>
          <span className="resp-time">{fmtResp(msg)}</span>
        </div>
      </div>
    </div>
  );
}
