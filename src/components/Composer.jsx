import React, { useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, StopIcon, ImageIcon, FileIcon } from '../lib/icons.jsx';

export function Composer({ isStreaming, onSend, onStop, disabled }) {
  const [value, setValue] = useState('');
  const [attached, setAttached] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // autosize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [value, attached]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const canSend = isStreaming || value.trim() || attached;

  const submit = () => {
    if (disabled) return;
    if (isStreaming) { onStop(); return; }
    let v = value.trim();
    if (attached) v += (v ? '\n\n' : '') + `[lampiran: ${attached.name}]`;
    if (!v) return;
    onSend(v);
    setValue('');
    setAttached(null);
  };

  const pickFile = (accept) => (e) => {
    e.stopPropagation();
    fileRef.current.accept = accept === '*' ? '' : accept;
    fileRef.current.click();
    setOpenMenu(null);
  };

  const onFileChange = () => {
    const f = fileRef.current.files[0];
    fileRef.current.value = '';
    if (!f) return;
    setAttached({ name: f.name });
  };

  return (
    <footer className="composer-zone">
      {!attached ? null : (
        <div className="attach-bar">
          <span className="attach-chip">
            <span>{attached.name}</span>
            <button title="Hapus lampiran" onClick={() => setAttached(null)}>✕</button>
          </span>
        </div>
      )}
      <div className="composer">
        <div className="pop-wrap">
          <button
            className="cbtn plus-btn" title="Lampirkan" aria-label="Lampirkan" aria-haspopup="true"
            onClick={(e) => { e.stopPropagation(); setOpenMenu((o) => (o === 'attach' ? null : 'attach')); }}
          >
            <PlusIcon />
          </button>
          {openMenu !== 'attach' ? null : (
            <div className="pop-menu left" role="menu">
              <button className="pop-item" onClick={pickFile('image/*')}><ImageIcon />Foto / gambar</button>
              <button className="pop-item" onClick={pickFile('*')}><FileIcon />Dokumen / file</button>
            </div>
          )}
        </div>
        <textarea
          ref={taRef} rows="1" placeholder={disabled ? 'Jawab pertanyaan di atas...' : 'Tulis pesan...'} value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button
          className="send-btn" title={isStreaming ? 'Berhenti' : 'Kirim'}
          aria-label={isStreaming ? 'Berhenti' : 'Kirim'}
          disabled={!canSend} onClick={submit}
        >
          {isStreaming ? <StopIcon /> : <SendIcon />}
        </button>
      </div>
      <input type="file" ref={fileRef} className="hidden" onChange={onFileChange} />
    </footer>
  );
}
