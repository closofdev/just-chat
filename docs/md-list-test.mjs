import { md } from '../src/lib/markdown.js';

const cases = [
  '3. Tekan `Ctrl + Shift + B` untuk build, atau gunakan terminal:',
  '**3**. Tekan sesuatu',
  '1. Install ekstensi C/C++\n2. Buka file `kalkulator.cpp`\n3. Tekan `Ctrl + Shift + B` untuk build\n    3\n4. Online Compiler',
  '3. Tekan `Ctrl + Shift + B`\n\n**3**\n'
];

for (const c of cases) {
  console.log('IN :', JSON.stringify(c));
  console.log('OUT:', md(c));
  console.log('---');
}
