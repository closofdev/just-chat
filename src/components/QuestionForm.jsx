import React, { useState } from 'react';

// Form pertanyaan dari agent (tool "question").
// Meniru schema opencode: question, header, options[{label,description}],
// multiple?, custom? (default true).
export function QuestionForm({ pending, onAnswer }) {
  const questions = pending?.questions || [];

  // satu state per pertanyaan: array label terpilih
  const [selected, setSelected] = useState(() => questions.map(() => []));
  // jawaban custom (ketik sendiri) per pertanyaan
  const [custom, setCustom] = useState(() => questions.map(() => ''));

  if (!questions.length) return null;

  const toggle = (qi, label, multiple) => {
    setSelected((prev) => {
      const next = prev.map((arr) => arr.slice());
      const cur = next[qi];
      const idx = cur.indexOf(label);
      if (multiple) {
        if (idx >= 0) cur.splice(idx, 1);
        else cur.push(label);
      } else {
        next[qi] = idx >= 0 ? [] : [label];
      }
      return next;
    });
  };

  const setCustomAt = (qi, val) => {
    setCustom((prev) => prev.map((v, i) => (i === qi ? val : v)));
  };

  const submit = () => {
    const answers = questions.map((q, qi) => {
      const picked = selected[qi].slice();
      const own = (custom[qi] || '').trim();
      if (own) picked.push(own);
      return picked;
    });
    onAnswer(answers);
  };

  const anyEnabled = questions.some((_, qi) => {
    const multiple = questions[qi].multiple;
    return selected[qi].length > 0 || (custom[qi] || '').trim();
  });

  return (
    <div className="question-card">
      {questions.map((q, qi) => {
        const multiple = !!q.multiple;
        // custom default true kecuali eksplisit false
        const allowCustom = q.custom !== false;
        return (
          <div className="question-item" key={qi}>
            <div className="question-head">
              <span className="question-header">{q.header}</span>
              {multiple ? <span className="question-hint">boleh pilih banyak</span> : null}
            </div>
            <div className="question-text">{q.question}</div>
            <div className="question-options">
              {(q.options || []).map((opt, oi) => {
                const checked = selected[qi].includes(opt.label);
                return (
                  <label className={'question-opt' + (checked ? ' checked' : '')} key={oi}>
                    <input
                      type={multiple ? 'checkbox' : 'radio'}
                      name={'q' + qi}
                      checked={checked}
                      onChange={() => toggle(qi, opt.label, multiple)}
                    />
                    <span className="opt-body">
                      <span className="opt-label">{opt.label}</span>
                      {opt.description ? <span className="opt-desc">{opt.description}</span> : null}
                    </span>
                  </label>
                );
              })}
              {allowCustom ? (
                <label className={'question-opt custom' + (custom[qi].trim() ? ' checked' : '')}>
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={'q' + qi}
                    checked={!!custom[qi].trim()}
                    onChange={() => {
                      // klik baris custom: fokus ke input, treat sebagai pilihan
                      const el = document.getElementById('custom-' + qi);
                      if (el) el.focus();
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <input
                    id={'custom-' + qi}
                    className="opt-input"
                    placeholder="Type your own answer..."
                    value={custom[qi]}
                    onChange={(e) => setCustomAt(qi, e.target.value)}
                  />
                </label>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="question-actions">
        <button className="question-submit" disabled={!anyEnabled} onClick={submit}>
          Kirim jawaban
        </button>
      </div>
    </div>
  );
}
