import { md } from '../src/lib/markdown.js';

const strip = (s) => s.replace(/<span class="katex[^"]*"[^>]*>/g, '[K]').replace(/<\/span>/g, '[/K]');

const cases = [
  ['blok pmatrix', '$$A = \\begin{pmatrix} 2 & -1 \\\\ 3 & 4 \\end{pmatrix}$$'],
  ['inline dollar', 'Nilai $x = 5$ dan $y^2$ ya.'],
  ['inline kurung', 'Rumus \\(a^2 + b^2 = c^2\\) terkenal.'],
  ['block bracket', '\\[\\int_0^1 x dx = \\frac{1}{2}\\]'],
  ['teks harga (TIDAK boleh jadi rumus)', 'Harganya $5 dan $10 saja.'],
  ['teks dolar tunggal', 'Biaya $100 per bulan.'],
];

for (const [name, src] of cases) {
  const out = md(src);
  const hasKatex = out.includes('katex');
  console.log(`--- ${name} ---`);
  console.log('katex:', hasKatex);
  console.log(out.slice(0, 260).replace(/\n/g, ' '));
  console.log('');
}
