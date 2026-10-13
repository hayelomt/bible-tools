import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Cache Storage, in memory: one cache, by path. */
class FakeCache {
  readonly files = new Map<string, Response>();
  match(url: string) {
    return Promise.resolve(this.files.get(url)?.clone());
  }
  put(url: string, response: Response) {
    this.files.set(url, response);
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.files.keys()].map((p) => new Request(`http://x${p}`)));
  }
  delete(request: Request) {
    return Promise.resolve(this.files.delete(new URL(request.url).pathname));
  }
}

const MANIFEST = {
  translations: {
    WEB: {
      bytes: 4_093_745,
      books: {
        GEN: { file: 'WEB/GEN.2.json' },
        EXO: { file: 'WEB/EXO.1.json' },
        LEV: { file: 'WEB/LEV.1.json' },
      },
    },
  },
};

let cache: FakeCache;
let online: boolean;
const fetched: string[] = [];

beforeEach(() => {
  vi.resetModules();
  cache = new FakeCache();
  online = true;
  fetched.length = 0;
  vi.stubGlobal('caches', { open: () => Promise.resolve(cache) });
  vi.stubGlobal('fetch', (url: string) => {
    if (!online) return Promise.reject(new TypeError('offline'));
    fetched.push(url);
    return Promise.resolve(Response.json(url.endsWith('manifest.json') ? MANIFEST : { c: [] }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadBible', () => {
  it('stores the books not stored yet, and drops an older edition', async () => {
    await cache.put('/bible/WEB/EXO.1.json', Response.json({ c: [] }));
    await cache.put('/bible/WEB/GEN.1.json', Response.json({ c: [] }));
    const { downloadBible } = await import('./bible-download.ts');
    const { onBookArrived } = await import('./bible.ts');
    const arrived: string[] = [];
    onBookArrived((code) => arrived.push(code));

    await downloadBible();
    expect(fetched).toEqual([
      '/bible/manifest.json',
      '/bible/WEB/GEN.2.json',
      '/bible/WEB/LEV.1.json',
    ]);
    expect(arrived).toEqual(['GEN', 'LEV']);
    expect([...cache.files.keys()].toSorted()).toEqual([
      '/bible/WEB/EXO.1.json',
      '/bible/WEB/GEN.2.json',
      '/bible/WEB/LEV.1.json',
      '/bible/manifest.json',
    ]);
    expect(await state()).toEqual({ status: 'complete', total: 3, bytes: 4_093_745 });
  });

  it('pauses without a connection and goes on once online', async () => {
    // Offline, with the manifest and one book stored the last time.
    await cache.put('/bible/manifest.json', Response.json(MANIFEST));
    await cache.put('/bible/WEB/EXO.1.json', Response.json({ c: [] }));
    online = false;
    const { downloadBible } = await import('./bible-download.ts');
    await downloadBible();
    expect(await state()).toEqual({ status: 'paused', done: 1, total: 3 });

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect((await state()).status).toBe('complete'));
    expect(fetched).toContain('/bible/WEB/LEV.1.json');
  });
});

/** The download's state, as `useBibleDownload` reads it. */
async function state() {
  const { useBibleDownload } = await import('./bible-download.ts');
  const { renderHook } = await import('@testing-library/react');
  return renderHook(() => useBibleDownload()).result.current;
}
