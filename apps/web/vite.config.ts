import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import packageJson from './package.json' with { type: 'json' };

/**
 * Source maps for Sentry (TECH-DESIGN §11.3), made only when a deploy sets `SENTRY_AUTH_TOKEN`
 * (with `SENTRY_ORG` and `SENTRY_PROJECT`): uploaded for this release, then deleted, so they're
 * never served. Errors then show the source's files and lines.
 */
function sentrySourceMaps(): Plugin[] {
  if (!process.env.SENTRY_AUTH_TOKEN) return [];
  return sentryVitePlugin({
    release: { name: `lamp-web@${packageJson.version}` },
    sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
    telemetry: false,
  });
}

/** Routes drawn on the first load, never split from the entry. */
const FIRST_SCREEN = new Set<string>(['/_app', '/_app/']);

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

/**
 * Preloads the app's one font (Inter Tight, Latin) in the built page, so it downloads alongside
 * the stylesheet instead of after it, and text doesn't swap late.
 */
function preloadFont(): Plugin {
  return {
    name: 'lamp-preload-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const font = Object.keys(bundle ?? {}).find((file) =>
          /inter-tight-latin-wght-normal-[\w-]+\.woff2$/.test(file),
        );
        if (!font) return;
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${font}`,
              crossorigin: '',
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

/**
 * The PWA (TECH-DESIGN §8.6): `src/sw.ts` precaches the app shell, built with the list of files
 * Workbox injects. The Bible files are left out: the app downloads them in the background into
 * their own cache (src/data/bible-download.ts). A new version waits for the user (`UpdatePrompt`).
 */
function pwa() {
  return VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    registerType: 'prompt',
    // Registered by `UpdatePrompt`.
    injectRegister: false,
    injectManifest: {
      // Built after the app, so a map made here would outlive the Sentry upload's clean-up; the
      // worker doesn't report to Sentry, so it needs none.
      sourcemap: false,
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      // Inter Tight's subsets for other scripts load only when such text shows; offline it falls
      // back to the system font.
      globIgnores: ['bible/**', '**/inter-tight-{cyrillic,greek,vietnamese}*'],
    },
    // Already matched by the patterns above.
    includeManifestIcons: false,
    manifest: {
      name: 'Lamp',
      short_name: 'Lamp',
      description: 'Sermon and Bible study notes, on your device and offline.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      // Lamplight's light background.
      background_color: '#f8f3e9',
      theme_color: '#f8f3e9',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  });
}

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts and must run before the React plugin.
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      codeSplittingOptions: {
        // The shell and the lessons home are on the first screen: kept in the entry, so they load
        // with it instead of in a second round of requests after it runs (slow on a phone).
        splitBehavior: ({ routeId }) => (FIRST_SCREEN.has(routeId) ? [] : undefined),
      },
    }),
    react(),
    tailwindcss(),
    bibleText(),
    preloadFont(),
    pwa(),
    // Last, so it sees the files as they're written.
    ...sentrySourceMaps(),
  ],
  // Hidden: the files don't point at them, and they're deleted once uploaded.
  build: { sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false },
  // The search worker (src/search/search.worker.ts) imports modules the app shares, so it's built
  // as an ES module like the app.
  worker: { format: 'es' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('src', import.meta.url)) },
  },
  // `vite preview` reuses this proxy (preview.proxy defaults to server.proxy).
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiUrl } },
  },
  // Not Vite's default (4173), which other projects on the machine use.
  preview: { port: 4573, strictPort: true },
});
