import folioHref from '@lamp/ui/looks/folio.css?url';
import lamplightHref from '@lamp/ui/looks/lamplight.css?url';
import softHref from '@lamp/ui/looks/soft.css?url';
import type { LookId } from '@lamp/ui/themes/presets';
import { useSyncExternalStore } from 'react';

/** Each downloaded look's stylesheet, as built (named by content hash). */
export const LOOK_HREFS: Record<Exclude<LookId, 'classic'>, string> = {
  folio: folioHref,
  soft: softHref,
  lamplight: lamplightHref,
};

/** The chosen look's stylesheet and fonts, kept for offline use and served by the service worker. */
export const LOOKS_CACHE = 'lamp-looks';

/** The `<link>` of the look shown; the inline script in index.html adds it with this id too. */
const LINK_ID = 'lamp-look';

export type LookState =
  | { status: 'classic' }
  | { status: 'loading'; look: LookId }
  | { status: 'ready'; look: LookId }
  /** Not stored and no connection: Classic shows until the look can be fetched. */
  | { status: 'failed'; look: LookId };

let state: LookState = { status: 'classic' };
let latest = 0;
const listeners = new Set<() => void>();

function set(next: LookState) {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Shows a look (TECH-DESIGN §8.5): links its stylesheet, sets `data-look` on `<html>` once it has
 * loaded (so a half-loaded look never shows), and stores it with its Latin fonts for offline
 * use. Classic removes the stylesheet and the stored copy. Without a connection and no stored
 * copy, Classic stays and the look is tried again once online.
 */
export async function showLook(look: LookId): Promise<void> {
  const call = ++latest;
  const root = document.documentElement;
  if (look === 'classic') {
    document.getElementById(LINK_ID)?.remove();
    delete root.dataset['look'];
    set({ status: 'classic' });
    if ('caches' in window) void caches.delete(LOOKS_CACHE);
    return;
  }
  const href = LOOK_HREFS[look];
  if (!(state.status === 'ready' && state.look === look)) set({ status: 'loading', look });
  try {
    await linkStylesheet(href);
  } catch {
    if (call !== latest) return;
    delete root.dataset['look'];
    set({ status: 'failed', look });
    const retry = () => {
      if (call === latest) void showLook(look);
    };
    window.addEventListener('online', retry, { once: true });
    return;
  }
  if (call !== latest) return;
  root.dataset['look'] = look;
  set({ status: 'ready', look });
  void storeLook(href);
}

/**
 * Resolves once the stylesheet applies. The one the inline script linked counts if it's the same
 * file; an older one (from before an update) stays if the new one can't be fetched.
 */
function linkStylesheet(href: string): Promise<void> {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (existing?.getAttribute('href') === href && existing.sheet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => {
      existing?.remove();
      link.id = LINK_ID;
      resolve();
    });
    link.addEventListener('error', () => {
      link.remove();
      if (existing?.sheet) resolve();
      else reject(new Error(`Couldn't load ${href}`));
    });
    document.head.append(link);
  });
}

/**
 * Puts the stylesheet and its Latin fonts in `LOOKS_CACHE`, then removes anything else there (an
 * older build's files). Other scripts' subsets load only for text that needs them, like
 * Literata's. In dev there's no service worker to read the cache.
 */
async function storeLook(href: string): Promise<void> {
  if (import.meta.env.DEV || !('caches' in window)) return;
  try {
    const cache = await caches.open(LOOKS_CACHE);
    const css = await stored(cache, href);
    const base = new URL(href, location.href);
    const fonts = [...css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)]
      .map(([, url]) => new URL(url!, base).pathname)
      .filter((path) => /-latin-(?!ext)/.test(path));
    for (const font of fonts) await stored(cache, font);
    const keep = new Set([base.pathname, ...fonts]);
    for (const request of await cache.keys()) {
      if (!keep.has(new URL(request.url).pathname)) await cache.delete(request);
    }
  } catch {
    // No connection: the next start tries again.
  }
}

async function stored(cache: Cache, path: string): Promise<string> {
  const hit = await cache.match(path);
  if (hit) return hit.text();
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  await cache.put(path, response.clone());
  return response.text();
}

/** Where the chosen look stands, re-rendering as it changes. */
export function useLookState(): LookState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
