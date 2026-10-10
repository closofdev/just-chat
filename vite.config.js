import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: npm run dev -> http://localhost:5173 (/cb diproxy ke CodeBuddy)
// Prod: npm run build + npm run serve (Docker) -> http://localhost:8081
// Token AI hanya dipegang server/proxy (CODEBUDDY_TOKEN), tidak masuk bundle browser.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/cb': {
        target: 'https://www.codebuddy.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cb/, '/v2'),
        secure: true
      }
    }
  }
});
