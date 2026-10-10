import { md } from '../src/lib/markdown.js';

const cases = [
  '**3**. Tekan sesuatu',
  '1. Install\n2. Buka file\n   1\n3. Tekan `Ctrl + B`\n4. Selesai',
  '1. Satu\n\n   2\n\n2. Dua',
  'Angka biasa: 3\n\n1. Pertama\n2. Kedua',
  '3. Tekan build'
];

for (const c of cases) {
  console.log('IN :', JSON.stringify(c));
  console.log('OUT:', md(c));
  console.log('---');
}
