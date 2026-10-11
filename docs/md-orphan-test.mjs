import { md } from '../src/lib/markdown.js';

const real = `1. Buka terminal
2. Arahkan ke folder
   1
3. Compile program:
4. Jalankan`;

const cases = [
  real,
  '1. Satu\n   1\n2. Dua',
  'Angka biasa: 3',
  '3',
  '1. A\n\n   2\n\n2. B',
  '**3**. Tekan sesuatu',
  'Text\n\n   5\n\nmore text'
];

for (const c of cases) {
  console.log('IN :', JSON.stringify(c));
  console.log('OUT:', md(c));
  console.log('---');
}
