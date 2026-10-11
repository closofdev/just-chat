import katex from 'katex';

// Deteksi rumus matematika di teks yang SUDAH di-escape HTML.
// Delimiter yang didukung: $$...$$ (blok), \[...\] (blok), $...$ (inline), \(...\) (inline).
//
// Aturan ketat supaya teks biasa seperti "harga $5 dan $10" tidak ikut dirender.

const BLOCK_DELIMS = [
  { open: '$$', close: '$$' },
  { open: '\\[', close: '\\]' },
];
const INLINE_DELIMS = [
  { open: '\\(', close: '\\)' },
  { open: '$', close: '$' },
];

// Apakah isi kandidat benar-benar terlihat seperti rumus matematika?
function looksLikeMath(inner) {
  if (!inner || !inner.trim()) return false;
  const s = inner.trim();
  // rumus tidak wajar kalau terlalu panjang atau mengandung newline untuk inline
  if (s.length > 2000) return false;
  // harus mengandung minimal satu penanda matematika
  return /[\\^_{}=]|\d\s*[+\-*/]|[+\-*/]\s*\d|\b(frac|sqrt|sum|int|alpha|beta|gamma|theta|pi|lambda|matrix|begin|end|cdot|times|leq|geq|neq|pm|infty)\b/.test(s);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Render satu rumus pakai KaTeX. Gagal -> kembalikan teks aslinya (jangan sampai
// rumus yang tidak valid membuat seluruh pesan rusak).
function renderOne(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      errorColor: '#d97757',
      strict: false,
      trust: false,
      output: 'html',
    });
  } catch (e) {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

// Ganti semua rumus dalam satu potongan teks (bukan HTML tag).
function replaceMathInText(text) {
  let out = '';
  let i = 0;

  while (i < text.length) {
    let matched = false;

    // cek delimiter blok dulu ($$ dan \[)
    for (const d of BLOCK_DELIMS) {
      if (text.startsWith(d.open, i)) {
        const end = text.indexOf(d.close, i + d.open.length);
        if (end !== -1) {
          const inner = text.slice(i + d.open.length, end);
          if (looksLikeMath(inner)) {
            out += renderOne(inner.trim(), true);
            i = end + d.close.length;
            matched = true;
            break;
          }
        }
      }
    }
    if (matched) continue;

    // lalu delimiter inline (\( dan $)
    for (const d of INLINE_DELIMS) {
      if (text.startsWith(d.open, i)) {
        const end = text.indexOf(d.close, i + d.open.length);
        if (end !== -1) {
          const inner = text.slice(i + d.open.length, end);
          // inline tidak boleh melewati batas baris / kosong
          const noNewline = !inner.includes('\n');
          if (noNewline && inner.trim() && looksLikeMath(inner)) {
            // untuk '$', hindari '$5' (digit langsung setelah $)
            const isDollar = d.open === '$';
            const suspicious = isDollar && /^\d/.test(inner.trim());
            if (!suspicious) {
              out += renderOne(inner.trim(), false);
              i = end + d.close.length;
              matched = true;
              break;
            }
          }
        }
      }
    }
    if (matched) continue;

    out += text[i];
    i++;
  }

  return out;
}

// Proses HTML: rumus hanya dirender di luar tag (agar atribut tidak dirusak).
export function renderMath(html) {
  if (!html) return html;
  // pecah berdasarkan tag HTML, proses hanya bagian teks
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : replaceMathInText(part)))
    .join('');
}

// Buang blok rumus dari sumber sebelum markdown diparsing, supaya karakter
// seperti * dan _ di dalam rumus tidak dianggap penanda markdown.
// Mengembalikan { text, blocks } — blocks diisi markup KaTeX siap tempel.
export function extractMathBlocks(src, store) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    let matched = false;
    for (const d of BLOCK_DELIMS) {
      if (src.startsWith(d.open, i)) {
        const end = src.indexOf(d.close, i + d.open.length);
        if (end !== -1) {
          const inner = src.slice(i + d.open.length, end);
          if (looksLikeMath(inner)) {
            store.push({ html: renderOne(inner.trim(), true), display: true });
            out += `\u0001${store.length - 1}\u0001`;
            i = end + d.close.length;
            matched = true;
            break;
          }
        }
      }
    }
    if (matched) continue;
    out += src[i];
    i++;
  }
  return out;
}

// Versi inline untuk isi sel tabel / baris yang diproses markdown per bagian.
export function extractMathInline(src, store) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    let matched = false;
    for (const d of INLINE_DELIMS) {
      if (src.startsWith(d.open, i)) {
        const end = src.indexOf(d.close, i + d.open.length);
        if (end !== -1) {
          const inner = src.slice(i + d.open.length, end);
          const isDollar = d.open === '$';
          const suspicious = isDollar && /^\d/.test(inner.trim());
          if (!inner.includes('\n') && inner.trim() && looksLikeMath(inner) && !suspicious) {
            store.push({ html: renderOne(inner.trim(), false), display: false });
            out += `\u0001${store.length - 1}\u0001`;
            i = end + d.close.length;
            matched = true;
            break;
          }
        }
      }
    }
    if (matched) continue;
    out += src[i];
    i++;
  }
  return out;
}

// Kembalikan placeholder menjadi markup KaTeX.
export function restoreMath(html, store) {
  if (!store.length) return html;
  return html.replace(/\u0001(\d+)\u0001/g, (_, n) => store[+n]?.html || '');
}
