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
    BSB: {
      bytes: 3_940_000,
      books: {
        GEN: { file: 'BSB/GEN.2.json' },
        EXO: { file: 'BSB/EXO.1.json' },
        LEV: { file: 'BSB/LEV.1.json' },
      },
    },
    KJV: {
      bytes: 4_210_000,
      books: { GEN: { file: 'KJV/GEN.1.json' }, EXO: { file: 'KJV/EXO.1.json' } },
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
  it('stores the books not stored yet, and drops an older edition and a dropped translation', async () => {
    await cache.put('/bible/BSB/EXO.1.json', Response.json({ c: [] }));
    await cache.put('/bible/BSB/GEN.1.json', Response.json({ c: [] }));
    await cache.put('/bible/WEB/GEN.1.json', Response.json({ c: [] }));
    await cache.put('/bible/KJV/GEN.1.json', Response.json({ c: [] }));
    const { downloadBible } = await import('./bible-download.ts');
    const { onBookArrived } = await import('./bible.ts');
    const arrived: string[] = [];
    onBookArrived((translation, code) => arrived.push(`${translation} ${code}`));

    await downloadBible('BSB');
    expect(fetched).toEqual([
      '/bible/manifest.json',
      '/bible/BSB/GEN.2.json',
      '/bible/BSB/LEV.1.json',
    ]);
    expect(arrived).toEqual(['BSB GEN', 'BSB LEV']);
    // The other translation's book stays.
    expect([...cache.files.keys()].toSorted()).toEqual([
      '/bible/BSB/EXO.1.json',
      '/bible/BSB/GEN.2.json',
      '/bible/BSB/LEV.1.json',
      '/bible/KJV/GEN.1.json',
      '/bible/manifest.json',
    ]);
    expect(await state('BSB')).toEqual({ status: 'complete', total: 3, bytes: 3_940_000 });
    expect(await state('KJV')).toEqual({ status: 'none' });
  });

  it('pauses without a connection and goes on once online', async () => {
    // Offline, with the manifest and one book stored the last time.
    await cache.put('/bible/manifest.json', Response.json(MANIFEST));
    await cache.put('/bible/BSB/EXO.1.json', Response.json({ c: [] }));
    online = false;
    const { downloadBible } = await import('./bible-download.ts');
    await downloadBible('BSB');
    expect(await state('BSB')).toEqual({ status: 'paused', done: 1, total: 3 });

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect((await state('BSB')).status).toBe('complete'));
    expect(fetched).toContain('/bible/BSB/LEV.1.json');
  });
});

describe('checkBible and removeBible', () => {
  it('finds a translation already stored, and removes only its books', async () => {
    await cache.put('/bible/KJV/GEN.1.json', Response.json({ c: [] }));
    await cache.put('/bible/BSB/GEN.2.json', Response.json({ c: [] }));
    const { checkBible, removeBible } = await import('./bible-download.ts');

    await checkBible('KJV');
    expect(await state('KJV')).toEqual({ status: 'none' });
    await cache.put('/bible/KJV/EXO.1.json', Response.json({ c: [] }));
    await checkBible('KJV');
    expect(await state('KJV')).toEqual({ status: 'complete', total: 2, bytes: 4_210_000 });

    await removeBible('KJV');
    expect(await state('KJV')).toEqual({ status: 'none' });
    expect([...cache.files.keys()].filter((p) => p.includes('/KJV/'))).toEqual([]);
    expect(cache.files.has('/bible/BSB/GEN.2.json')).toBe(true);
  });
});

/** A translation's download state, as `useBibleDownload` reads it. */
async function state(translation: 'BSB' | 'KJV') {
  const { useBibleDownload } = await import('./bible-download.ts');
  const { renderHook } = await import('@testing-library/react');
  return renderHook(() => useBibleDownload(translation)).result.current;
}
