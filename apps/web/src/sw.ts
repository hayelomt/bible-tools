import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  type PrecacheEntry,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

/**
 * The service worker (TECH-DESIGN §8.6): the app shell is precached, so every screen opens offline.
 * `/api` goes to the network, and `/bible` is read by the page from its own cache. A new version
 * waits until the page asks it to take over (`UpdatePrompt`), never by itself.
 */
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

/** `LOOKS_CACHE` in src/lib/looks.ts, which the worker can't import (it pulls in React). */
const LOOKS_CACHE = 'lamp-looks';
/** A downloaded look's built stylesheet or font (the precache leaves them out). */
const LOOK_FILE =
  /^\/assets\/(folio|soft|lamplight|fraunces|inter-tight|jetbrains-mono)-[\w-]+\.(css|woff2)$/;

// Workbox's injection point, named by Workbox.
// oxlint-disable-next-line no-underscore-dangle
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The chosen look's stylesheet and fonts, from the copy the page stores (src/lib/looks.ts), so
// the inline script's <link> works offline. Anything not stored goes to the network.
registerRoute(
  ({ url }) => url.origin === self.location.origin && LOOK_FILE.test(url.pathname),
  async ({ request }) =>
    (await caches.match(request, { cacheName: LOOKS_CACHE })) ?? fetch(request),
);

// Every address in the app is the same page; the router shows the screen.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/bible\//],
  }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// The first install controls the page it was installed from, so it works offline at once.
clientsClaim();
