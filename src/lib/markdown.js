// Parser markdown ringan: bold, code, code block (termasuk fence terbuka saat stream),
// heading, hr, quote, list, link. Disalin 1:1 dari versi vanilla.
export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function md(src) {
  let h = esc(src);
  // code block diamankan dulu agar parsing inline tidak merusaknya
  const pres = [];
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    pres.push(`<pre${lang ? ` data-lang="${lang}"` : ''}><code>${code.replace(/^\n|\n$/g, '')}</code></pre>`);
    return `\u0000${pres.length - 1}\u0000`;
  });
  const inline = (t) => t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // fence yang belum tertutup (streaming) langsung dirender sebagai code block
  let tailPre = null;
  const fenceIdx = h.indexOf('```');
  let head = h;
  if (fenceIdx !== -1) {
    head = h.slice(0, fenceIdx);
    let tailLang = '';
    const tail = h.slice(fenceIdx).replace(/^```(\w*)\n?/, (_, lang) => { tailLang = lang || ''; return ''; });
    pres.push(`<pre${tailLang ? ` data-lang="${tailLang}"` : ''}><code>${tail.replace(/\n$/, '')}</code></pre>`);
    tailPre = `\u0000${pres.length - 1}\u0000`;
  }
  const lines = head.split('\n');
  let out = '', para = [], list = null, listGap = false;
  const flushPara = () => { if (para.length) { out += `<p>${para.join('<br>')}</p>`; para = []; } };
  const flushList = () => { if (list) { out += list.tag === 'ol' ? `<ol>${list.items}</ol>` : `<ul>${list.items}</ul>`; list = null; listGap = false; } };
  // buka list; kalau tipe sama dengan list sebelumnya, lanjutkan blok yang sama
  const openList = (tag) => {
    if (list && list.tag === tag) { listGap = false; return; }
    flushList();
    list = { tag, items: '' };
    listGap = false;
  };
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');
  const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  // baris yang isinya cuma angka (sisa penomoran model) dibuang agar tak jadi blok nyasar
  const isOrphanNumber = (l) => /^\s*\**\s*\d{1,2}\s*[.)]?\s*\**\s*$/.test(l);  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (isOrphanNumber(line)) { continue; }
    // tabel: baris header + garis pemisah
    if (isTableRow(line) && isTableSep(lines[i + 1] || '')) {
      flushPara(); flushList();
      const head = cellsOf(line);
      i += 2;
      let body = '';
      while (i < lines.length && isTableRow(lines[i])) { body += `<tr>${cellsOf(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`; i++; }
      i--;
      out += `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    else if (/^\u0000\d+\u0000$/.test(line)) { flushPara(); flushList(); out += pres[+line.replace(/\u0000/g, '')]; }
    else if ((m = line.match(/^(#{1,4})\s+(.+)/))) { flushPara(); flushList(); const lv = m[1].length; out += `<h${lv + 1}>${inline(m[2])}</h${lv + 1}>`; }
    else if (/^---+$/.test(line.trim())) { flushPara(); flushList(); out += '<hr>'; }
    else if ((m = line.match(/^&gt;\s?(.*)/))) { flushPara(); flushList(); out += `<blockquote>${inline(m[1]) || '<br>'}</blockquote>`; }
    else if ((m = line.match(/^-\s+(.+)/))) { flushPara(); openList('ul'); list.items += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\d+[.)]\s+(.+)/))) { flushPara(); openList('ol'); list.items += `<li>${inline(m[1])}</li>`; }
    else if (!line.trim()) {
      flushPara();
      // baris kosong setelah list: tahan dulu, kalau ternyata diikuti list sejenis tetap digabung
      if (list) listGap = true;
      else flushList();
    }
    else {
      if (list && listGap) flushList();
      else flushList();
      para.push(inline(line));
    }
  }
  flushPara(); flushList();
  if (tailPre) out += pres[+tailPre.replace(/\u0000/g, '')];
  return out;
}

// bungkus tiap kata dengan span agar bisa dianimasikan satu-per-satu (aman untuk tag HTML)
export function wrapWords(html) {
  return html.split(/(<[^>]*>)/g).map((part) => {
    if (!part || part.startsWith('<')) return part;
    return part.split(/(\s+)/).map((w) => (w.trim() ? `<span class="stream-word">${w}</span>` : w)).join('');
  }).join('');
}
