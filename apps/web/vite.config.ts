import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `/api` goes to the API (`pnpm dev`: :3000). The E2E run points it at its own API instance.
const apiUrl = process.env.LAMP_API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts and must run before the React plugin.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('src', import.meta.url)) },
  },
  // `vite preview` reuses this proxy (preview.proxy defaults to server.proxy).
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiUrl } },
  },
  preview: { port: 4173, strictPort: true },
});
