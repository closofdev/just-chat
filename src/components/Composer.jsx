import React, { useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, StopIcon, ImageIcon, FileIcon } from '../lib/icons.jsx';

function shortName(id) {
  const base = id.includes('/') ? id.split('/').pop() : id;
  return base.split(/[-_]+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  );
}

export function Composer({ isStreaming, onSend, onStop, model, models, onModelChange }) {
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

  const toggle = (name) => (e) => {
    e.stopPropagation();
    setOpenMenu((o) => (o === name ? null : name));
  };

  const canSend = isStreaming || value.trim() || attached;

  const submit = () => {
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

  const chooseModel = (id) => (e) => {
    e.stopPropagation();
    onModelChange(id);
    setOpenMenu(null);
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
            onClick={toggle('attach')}
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
          ref={taRef} rows="1" placeholder="Tulis pesan..." value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <div className="pop-wrap">
          <button
            className="cbtn model-btn" title="Pilih model" aria-label="Pilih model" aria-haspopup="true"
            onClick={toggle('model')}
          >
            <span id="modelName">{(models.find((m) => m.id === model)?.label) || shortName(model)}</span>
            <ChevronIcon />
          </button>
          {openMenu !== 'model' ? null : (
            <div className="pop-menu right" role="menu">
              {models.map((m) => (
                <button
                  key={m.id} className={'pop-item' + (m.id === model ? ' active' : '')}
                  title={m.id} onClick={chooseModel(m.id)}
                >
                  <span>{m.label || shortName(m.id)}</span>
                  {m.id === model ? <span className="tick">✓</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
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
