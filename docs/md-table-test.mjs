import { md } from '../src/lib/markdown.js';

const sample = `Maka:

| Variabel | Nilai |
|----------|-------|
| a        | 5     |
| op       | +     |
| b        | 3     |

C++ otomatis memisahkan input berdasarkan spasi.`;

console.log(md(sample));
console.log('\n--- tanpa spasi padding ---');
console.log(md('| A | B |\n|---|---|\n| 1 | 2 |'));
