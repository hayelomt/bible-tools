import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

const box = (page: Page) => page.getByRole('searchbox', { name: 'Search' });

/** A lesson with one section typed after the title; the section is left with Escape. */
async function lessonWithNote(page: Page, title: string, type: (page: Page) => Promise<void>) {
  await page.goto('/');
  await newLesson(page, title);
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await type(page);
  await page.keyboard.press('Escape');
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('free text, tags and verses each find their notes, and a result opens at the match', async ({
    page,
    context,
  }) => {
    await lessonWithNote(page, 'Abiding in the vine', async () => {
      await page.keyboard.type('Apart from me you can do nothing. Rom 8:28');
      await expect(page.getByRole('listbox', { name: 'Verse suggestions' })).toBeVisible();
      await page.keyboard.press('Enter');
    });
    await expect.poll(async () => (await rows(page, 'section')).length).toBe(1);
    await page.getByRole('button', { name: 'Section actions' }).click();
    await page.getByRole('menuitem', { name: 'Tags' }).click();
    const tags = page.getByRole('combobox', { name: 'Section tags' });
    await tags.fill('grace');
    await tags.press('Enter');
    await tags.press('Escape');
    await expect(
      page.locator('[data-section]').first().getByRole('link', { name: '#grace' }),
    ).toBeVisible();

    await lessonWithNote(page, 'The Good Shepherd', () =>
      page.keyboard.type('I am the good shepherd.'),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.getByRole('button', { name: 'Add to lesson' }).click();
    await page.getByRole('menuitem', { name: 'Add takeaway' }).click();
    await page.keyboard.type('The shepherd knows his sheep.');
    await page.getByRole('textbox', { name: 'Takeaway' }).blur();

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Search' })
      .click();
    await expect(box(page)).toBeFocused();
    // All of it is on the device. (Without the service worker here, the screens are loaded first;
    // offline.spec.ts checks search from the service worker's copy.)
    await context.setOffline(true);

    // Free text: the title, the section and the takeaway, the word in bold.
    await box(page).fill('shepherd');
    await expect(page.getByText('3 results in 1 lesson')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([/^The Good Shepherd · /]);
    await expect(page.locator('strong')).toHaveText(['Shepherd', 'shepherd', 'shepherd']);
    await page.getByRole('link', { name: /^Takeaway: The shepherd knows/ }).click();
    await expect(page.locator('[data-flash] textarea')).toHaveValue(
      'The shepherd knows his sheep.',
    );

    // Back to the same search.
    await page.goBack();
    await expect(box(page)).toHaveValue('shepherd');
    await expect(page.getByText('3 results in 1 lesson')).toBeVisible();

    // A verse query matches the chip, and isn't searched as words.
    await box(page).fill('rom 8');
    await expect(page.getByText('Romans 8 · 1 note')).toBeVisible();
    await page.getByRole('link', { name: /Romans 8:28.*Apart from me/ }).click();
    await expect(page.locator('[data-flash]')).toContainText('Apart from me');
    await page.goBack();

    // A tag: suggestions with counts, then what the tag page shows.
    await box(page).fill('#gr');
    await page
      .getByRole('list', { name: 'Tags' })
      .getByRole('button', { name: '#grace · 1' })
      .click();
    await expect(box(page)).toHaveValue('#grace');
    await expect(page.getByRole('link', { name: 'Open #grace' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Apart from me/ })).toBeVisible();

    // Nothing found says where search looks.
    await box(page).fill('melchizedek');
    await expect(page.getByText('Nothing matches “melchizedek”.')).toBeVisible();

    // The searches that led somewhere come back before typing.
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByRole('region', { name: 'Recent' }).getByRole('button')).toHaveText([
      '#grace',
      'rom 8',
      'shepherd',
    ]);
    await page.getByRole('button', { name: 'Romans 8', exact: true }).click();
    await expect(box(page)).toHaveValue('Romans 8');
    await expect(page.getByText('Romans 8 · 1 note')).toBeVisible();
  });

  test('the index keeps up with each change', async ({ page }) => {
    await lessonWithNote(page, 'Lazarus', () => page.keyboard.type('Jesus wept.'));
    await expect.poll(async () => (await rows(page, 'section')).length).toBe(1);
    await page.goto('/search?q=wept');
    await expect(page.getByRole('link', { name: 'Jesus wept.' })).toBeVisible();
    await page.getByRole('link', { name: 'Jesus wept.' }).click();
    await page.getByRole('textbox', { name: 'Note', exact: true }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' He called him out of the tomb.');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.goBack();
    await box(page).fill('tomb');
    await expect(page.getByText('1 result in 1 lesson')).toBeVisible();
  });
});

test('5,000 sections are indexed in under 1 s at a mid-range phone’s speed', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  // 50 lessons of 100 sections, each about 40 words, written straight into the device database.
  await page.evaluate(async () => {
    const words =
      'grace faith hope love shepherd sheep door vine branch abide light world truth life way spirit word flesh glory father son servant king kingdom heaven earth bread water wine wedding feast lamb blood cross tomb rise risen sin forgive mercy peace joy fruit seed sower field harvest prayer fast temple law prophet promise covenant'.split(
        ' ',
      );
    const text = (n: number) =>
      Array.from({ length: n }, (_, i) => words[(i * 7 + n * 13) % words.length]).join(' ');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lamp');
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const tx = db.transaction(['lesson', 'section'], 'readwrite');
    const now = new Date().toISOString();
    const meta = { createdAt: now, updatedAt: now, rev: 0, deletedAt: null };
    for (let l = 0; l < 50; l++) {
      const lessonId = crypto.randomUUID();
      tx.objectStore('lesson').put({
        id: lessonId,
        seriesId: null,
        title: `Seeded lesson ${l}`,
        date: `2026-0${1 + (l % 9)}-1${l % 10}`,
        source: 'sermon',
        speaker: null,
        church: null,
        mainPassages: [],
        ...meta,
      });
      for (let s = 0; s < 100; s++) {
        tx.objectStore('section').put({
          id: crypto.randomUUID(),
          lessonId,
          parentId: null,
          orderKey: `a${String(s).padStart(3, '0')}`,
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: text(20 + (s % 7)) }] },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `${text(20)} note ${l}-${s}` }],
              },
            ],
          },
          conflictOf: null,
          ...meta,
        });
      }
    }
    await new Promise((resolve, reject) => {
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
    db.close();
  });

  // Chrome slowed four times: the usual stand-in for a mid-range phone.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.reload();
  const ready = await page.waitForFunction(
    () =>
      (performance.getEntriesByName('lamp:search-ready')[0] as PerformanceMark | undefined)
        ?.detail ?? null,
    undefined,
    { timeout: 30_000 },
  );
  const { ms, buildMs, docs } = (await ready.jsonValue()) as {
    ms: number;
    buildMs: number;
    docs: number;
  };
  console.log(
    `Search index: ${docs} rows in ${Math.round(ms)} ms (${Math.round(buildMs)} ms to build)`,
  );
  expect(docs).toBe(5050);
  expect(ms).toBeLessThan(1000);

  await page.goto('/search?q=seeded lesson 17');
  await expect(page.getByText('1 result in 1 lesson')).toBeVisible();
});
