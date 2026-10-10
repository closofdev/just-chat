import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: npm run dev -> http://localhost:5173 (API /v1 diproxy ke 9Router lokal)
// Prod: npm run build + npm run serve (Docker) -> http://localhost:8081
// Key AI hanya dipegang server/proxy, tidak pernah masuk bundle browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const upstream = env.AI_UPSTREAM || 'http://127.0.0.1:20128';
  const apiKey = env.AI_API_KEY || '';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/v1': {
          target: upstream,
          changeOrigin: true,
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
        }
      }
    }
  };
});
