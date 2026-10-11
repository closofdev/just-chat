// Parser markdown ringan: bold, code, code block (termasuk fence terbuka saat stream),
// heading, hr, quote, list, link, tabel, dan rumus KaTeX.
import { extractMathBlocks, extractMathInline, restoreMath } from './math.js';

export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function md(src) {
  let h = esc(src);
  // code block diamankan dulu agar parsing inline tidak merusaknya
  const pres = [];
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    pres.push(`<pre${lang ? ` data-lang="${lang}"` : ''}><code>${code.replace(/^\n|\n$/g, '')}</code></pre>`);
    return `\u0000${pres.length - 1}\u0000`;
  });
  // rumus blok ($$...$$ dan \[...\]) diamankan sebelum parsing markdown,
  // supaya *, _, dan | di dalam rumus tidak dirusak parser.
  const mathStore = [];
  h = extractMathBlocks(h, mathStore);
  // ---- Chip link berjenis (ala ChatGPT) ----------------------------------
  const ICONS = {
    github: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>',
    npm: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M0 0v24h24V0H0Zm19.2 19.2h-2.4v-12H12v12H4.8V4.8h14.4v14.4Z"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19"/></svg>',
  };
  const chip = (kind, href, label, title) =>
    `<a class="link-chip link-chip-${kind}" href="${href}" target="_blank" rel="noopener"${title ? ` title="${title}"` : ''}>` +
    `<span class="link-chip-icon">${ICONS[kind] || ICONS.link}</span><span class="link-chip-label">${label}</span></a>`;

  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  // klasifikasi URL -> { kind, label }
  function classifyUrl(u) {
    const host = hostOf(u);
    if (!host) return null;
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return { kind: 'youtube', label: host };
    if (host === 'registry.npmjs.org' || host === 'npmjs.com' || host === 'npm.im') return { kind: 'npm', label: host };
    if (host === 'github.com' || host === 'gist.github.com') return { kind: 'github', label: host };
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(u)) return { kind: 'image', label: host };
    if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|json|zip)$/i.test(u)) return { kind: 'file', label: (u.split('/').pop() || host).slice(0, 40) };
    return null; // bukan jenis khusus -> biarkan sebagai link biasa
  }

  // nama repo GitHub yang meyakinkan: owner/repo (boleh ada sub-path owner/repo/path).
  // Ciri: alfanumerik + . _ -, tanpa spasi, dan ada sinyal "nama repo nyata"
  // (huruf besar, digit, atau tanda hubung). Kata sambung umum diblokir.
  const REPO_BLOCK = new Set(['dan/atau', 'atau/dan', 'serta/atau', 'dan/atau/dll']);
  const isGithubRepo = (s) => {
    if (s.includes('://') || /\s/.test(s)) return false;
    if (REPO_BLOCK.has(s.toLowerCase())) return false;
    const parts = s.split('/');
    if (parts.length < 2 || parts.length > 3) return false;
    if (!parts.every((p) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(p))) return false;
    // sinyal repo nyata: ada huruf besar, digit, atau tanda hubung di salah satu bagian
    return parts.some((p) => /[A-Z0-9]/.test(p) || p.includes('-') || p.includes('_') || p.includes('.'));
  };
  const ghChip = (repo) => chip('github', `https://github.com/${repo}`, repo, 'Buka di GitHub');

  const inline = (t) => {
    // rumus inline (\(...\) dan $...$) diamankan dulu
    const t2 = extractMathInline(t, mathStore);
    return t2
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // URL mentah (http...) -> chip berjenis kalau dikenal, kalau tidak -> link biasa
      .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, (m, pre, url) => {
        const c = classifyUrl(url);
        if (!c) return `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
        return pre + chip(c.kind, url, c.label, url);
      })
      .replace(/`([^`]+?)`/g, (_, code) => {
        const repo = code.trim();
        return isGithubRepo(repo) ? ghChip(repo) : `<code>${code}</code>`;
      })
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, label, href) => {
        const c = classifyUrl(href);
        return c ? chip(c.kind, href, label, href) : `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
      });
  };
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
  const flushPara = () => { if (para.length) { out += `<p>${para.join('<br>')}</p>`; para = []; } };  const flushList = () => { if (list) { out += list.tag === 'ol' ? `<ol>${list.items}</ol>` : `<ul>${list.items}</ul>`; list = null; listGap = false; } };
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
  const isOrphanNumber = (l) => /^\s*\**\s*\d{1,2}\s*[.)]?\s*\**\s*$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    // angka telanjang: di dalam list = sisa penomoran (dibuang),
    // di luar list = biarkan sebagai teks biasa
    if (isOrphanNumber(line)) {
      if (list) continue;
      flushPara(); flushList(); para.push(inline(line.trim())); continue;
    }
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
    else { flushPara(); flushList(); para.push(inline(line)); }
  }
  flushPara(); flushList();
  if (tailPre) out += pres[+tailPre.replace(/\u0000/g, '')];
  return restoreMath(out, mathStore);
}

// bungkus tiap kata dengan span agar bisa dianimasikan satu-per-satu (aman untuk tag HTML)
export function wrapWords(html) {
  return html.split(/(<[^>]*>)/g).map((part) => {
    if (!part || part.startsWith('<')) return part;
    return part.split(/(\s+)/).map((w) => (w.trim() ? `<span class="stream-word">${w}</span>` : w)).join('');
  }).join('');
}
