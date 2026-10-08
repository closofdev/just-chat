import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: npm run dev -> http://localhost:5173 (API /v1 diproxy ke 9Router lokal)
// Prod: npm run build + npm run serve -> http://localhost:8081
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:20128',
        changeOrigin: true
      }
    }
  }
});
