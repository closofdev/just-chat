// Daftar model AI yang tersedia di dropdown.
// Label inilah yang tampil di choose model, bukan hasil format otomatis.
// provider menentukan endpoint yang dipakai di server.cjs.
export const DEFAULT_MODEL = 'deepseek-v4.1-flash';

export const MODELS = [
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', provider: 'codebuddy' }
];
