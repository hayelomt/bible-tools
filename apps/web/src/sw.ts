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

// Workbox's injection point, named by Workbox.
// oxlint-disable-next-line no-underscore-dangle
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

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
