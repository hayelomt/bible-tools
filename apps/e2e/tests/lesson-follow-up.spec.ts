import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

interface StoredEntry {
  kind: string;
  sectionId: string | null;
  createdAt: string;
}

const takeaways = (page: Page) => page.getByRole('textbox', { name: 'Takeaway' });
const values = (page: Page) =>
  takeaways(page).evaluateAll((fields) => fields.map((f) => (f as HTMLTextAreaElement).value));
/** The Undo on the toast that says `message`. */
const undo = (page: Page, message: string) =>
  page.getByRole('listitem').filter({ hasText: message }).getByRole('button', { name: 'Undo' });
const questionList = (page: Page) =>
  page.getByRole('region', { name: 'Questions' }).getByRole('listitem');
/** Leaves the field being typed in, as tapping outside it does; the + button shows again. */
const stopTyping = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
/** The + button a phone adds takeaways and questions with. */
async function addFromButton(page: Page, item: 'Add takeaway' | 'Add question') {
  await stopTyping(page);
  await page.getByRole('button', { name: 'Add to lesson' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('takeaways are typed in place, saved as they are typed, and deleted with Undo', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');

    await addFromButton(page, 'Add takeaway');
    await expect(takeaways(page)).toBeFocused();
    await page.keyboard.type('He knows his sheep by name.');
    await page.keyboard.press('Enter');
    await expect(takeaways(page).nth(1)).toBeFocused();
    await page.keyboard.type('The door is narrow.');
    await expect
      .poll(async () =>
        (await rows<{ text: string }>(page, 'takeaway')).map((t) => t.text).toSorted(),
      )
      .toEqual(['He knows his sheep by name.', 'The door is narrow.']);
    const [first] = await rows<{ createdAt: string }>(page, 'takeaway');
    expect(first?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Enter then Backspace in the empty one leaves two.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await expect(takeaways(page)).toHaveCount(2);
    await expect(takeaways(page).nth(1)).toBeFocused();

    await page.reload();
    await expect
      .poll(() => values(page))
      .toEqual(['He knows his sheep by name.', 'The door is narrow.']);
    await takeaways(page).first().fill('He calls his own sheep by name.');
    await takeaways(page).first().blur();
    await page.getByRole('button', { name: 'Delete takeaway “The door is narrow.”' }).click();
    await expect(takeaways(page)).toHaveCount(1);
    await undo(page, 'Takeaway deleted.').click();
    await expect(takeaways(page)).toHaveCount(2);
    await page.reload();
    await expect
      .poll(() => values(page))
      .toEqual(['He calls his own sheep by name.', 'The door is narrow.']);

    // An empty takeaway goes as focus leaves it, without moving what was tapped from under the
    // pointer: "+ Add" under questions still opens its field.
    await addFromButton(page, 'Add question');
    await page.keyboard.type('Who is the door for?');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await takeaways(page).last().press('End');
    await takeaways(page).last().press('Enter');
    await expect(takeaways(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByRole('menuitem', { name: 'New question' }).click();
    await expect(page.getByRole('textbox', { name: 'New question' })).toBeFocused();
    await expect(takeaways(page)).toHaveCount(2);
  });

  test('a question is answered in a section and turns answered once that section has text', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    await addFromButton(page, 'Add question');
    const field = page.getByRole('textbox', { name: 'New question' });
    await field.fill('What is the door?');
    await field.press('Enter');
    await field.fill('Who are the other sheep?');
    await field.press('Enter');
    await field.press('Escape');
    await expect(questionList(page)).toHaveText([
      'Open: What is the door?',
      'Open: Who are the other sheep?',
    ]);

    // Promotion: a section headed with the question, the cursor under it; still open.
    await questionList(page).first().getByRole('button', { name: 'Question actions' }).click();
    await page.getByRole('menuitem', { name: 'Answer in a section' }).click();
    const answer = page.locator('[data-section]').filter({ hasText: 'What is the door?' });
    await expect(answer.getByRole('heading', { level: 3 })).toHaveText('What is the door?');
    await expect(answer.getByRole('textbox')).toBeFocused();
    const [section] = await rows<{ id: string }>(page, 'section');
    // The question's thread: asked, then answered in that section (F24).
    await expect
      .poll(async () =>
        (await rows<StoredEntry>(page, 'questionEntry'))
          .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((e) => [e.kind, e.sectionId]),
      )
      .toEqual([
        ['asked', null],
        ['asked', null],
        ['answered', section?.id],
      ]);
    await expect(questionList(page).first()).toHaveText('Open: What is the door?');

    // Text under the heading answers it.
    await page.keyboard.type('Jesus himself.');
    await expect(questionList(page).first()).toHaveText('Answered: What is the door?');
    // The empty section at the end is still last, below the answer.
    await expect(page.getByRole('textbox', { name: 'Note', exact: true }).last()).toHaveText('');

    // Emptying the answer opens it again.
    for (const _ of 'Jesus himself.') await page.keyboard.press('Backspace');
    await expect(questionList(page).first()).toHaveText('Open: What is the door?');
    await page.keyboard.type('The way in.');
    await expect(questionList(page).first()).toHaveText('Answered: What is the door?');
    await page.keyboard.press('Escape');

    // `›` goes to the answer.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole('button', { name: 'Go to answer' }).click();
    await expect(page.locator('[data-flash]')).toContainText('The way in.');
  });

  test('questions are parked and reopened, edited, and deleted with Undo', async ({ page }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    await addFromButton(page, 'Add question');
    await page.keyboard.type('Thief or hired hand?');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    const actions = () =>
      questionList(page).first().getByRole('button', { name: 'Question actions' });

    await actions().click();
    await page.getByRole('menuitem', { name: 'Park' }).click();
    await expect(questionList(page)).toHaveText(['Parked: Thief or hired hand?']);
    await undo(page, 'Question parked.').click();
    await expect(questionList(page)).toHaveText(['Open: Thief or hired hand?']);
    await actions().click();
    await page.getByRole('menuitem', { name: 'Park' }).click();
    await actions().click();
    await page.getByRole('menuitem', { name: 'Reopen' }).click();
    await expect(questionList(page)).toHaveText(['Open: Thief or hired hand?']);

    await actions().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edit = page.getByRole('textbox', { name: 'Edit question' });
    await edit.fill('The thief or the hired hand?');
    await edit.press('Enter');
    await expect(questionList(page)).toHaveText(['Open: The thief or the hired hand?']);

    await actions().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('region', { name: 'Questions' })).toHaveCount(0);
    await undo(page, 'Question deleted.').click();
    await expect(questionList(page)).toHaveText(['Open: The thief or the hired hand?']);
  });

  test('takeaways and questions stay off the page until the + button adds one', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    const plus = page.getByRole('button', { name: 'Add to lesson' });
    // Not while the title is typed, either.
    await expect(plus).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Takeaways' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Questions' })).toHaveCount(0);

    // It goes while a section is typed in, so it covers neither the text nor the toolbar.
    await page.getByRole('textbox', { name: 'Note', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Editing' })).toBeVisible();
    await expect(plus).toHaveCount(0);
    await stopTyping(page);
    await expect(plus).toBeVisible();

    // A takeaway left empty goes, and its list with it.
    await addFromButton(page, 'Add takeaway');
    await expect(takeaways(page)).toBeFocused();
    await takeaways(page).blur();
    await expect(page.getByRole('region', { name: 'Takeaways' })).toHaveCount(0);

    await addFromButton(page, 'Add takeaway');
    await page.keyboard.type('He knows his sheep by name.');
    await takeaways(page).blur();
    await expect(page.getByRole('region', { name: 'Takeaways' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Questions' })).toHaveCount(0);
  });
});

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('takeaways and questions sit in the side panel under the details', async ({ page }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    // The same column as the details, right of the notes.
    const left = async (name: string) =>
      (await page.getByRole('region', { name }).boundingBox())!.x;
    const title = (await page.getByRole('textbox', { name: 'Title', exact: true }).boundingBox())!;
    expect(await left('Details')).toBeGreaterThan(title.x + title.width);
    expect(await left('Takeaways')).toBe(await left('Details'));
    expect(await left('Questions')).toBe(await left('Details'));
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBe(0);
  });
});
