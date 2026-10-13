import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// `/api` goes to the API (`pnpm dev`: :3000). The E2E run points it at its own API instance.
const apiUrl = process.env.LAMP_API_URL ?? 'http://127.0.0.1:3000';

/**
 * The WEB book files and manifest built by `@lamp/bible-data` (TECH-DESIGN §9), served under
 * `/bible/`: from its `dist/` in dev, copied into the build otherwise. The files are named by
 * content hash, so they can be cached for good.
 */
function bibleText(): Plugin {
  const dist = fileURLToPath(new URL('../../packages/bible-data/dist/', import.meta.url));
  const missing = `No Bible text in ${dist}: run \`pnpm --filter @lamp/bible-data build\`.`;
  return {
    name: 'lamp-bible-text',
    configureServer(server) {
      if (!existsSync(dist)) server.config.logger.warn(missing);
      server.middlewares.use('/bible', (req, res, next) => {
        const file = path.join(dist, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
        if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/html');
        createReadStream(file).pipe(res);
      });
    },
    async generateBundle() {
      if (!existsSync(dist)) this.error(missing);
      const files = await readdir(dist, { recursive: true, withFileTypes: true });
      for (const entry of files.filter((f) => f.isFile())) {
        const file = path.join(entry.parentPath, entry.name);
        this.emitFile({
          type: 'asset',
          fileName: `bible/${path.relative(dist, file).split(path.sep).join('/')}`,
          source: await readFile(file),
        });
      }
    },
  };
}

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts and must run before the React plugin.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    bibleText(),
  ],
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
