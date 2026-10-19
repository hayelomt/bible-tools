import { createHash } from 'node:crypto';
import type { VerseReader, VerseRef } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { withoutTokens } from '../share-token.js';
import { bodyHtml } from './body.js';
import { markup, trusted } from './markup.js';
import { page } from './page.js';

describe('markup', () => {
  it('escapes text and keeps markup made with it', () => {
    const text = `<b>"Tom" & 'Jerry'</b>`;
    expect(markup`<p title="${text}">${text}${markup`<br />`}${trusted('<hr>')}</p>`.value).toBe(
      '<p title="&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;">' +
        '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;<br /><hr></p>',
    );
  });

  it('leaves out nothing-values and joins lists', () => {
    expect(markup`${null}${undefined}${false}${['a', markup`<i>b</i>`, 3]}`.value).toBe(
      'a<i>b</i>3',
    );
  });
});

describe('bodyHtml', () => {
  it('links a chip only where the page covers it, and never takes a link mark to javascript:', () => {
    const body = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'noteLink' as const,
              attrs: {
                targetType: 'lesson' as const,
                targetId: '0199e0a0-0000-7000-8000-000000000001',
                label: 'Here',
              },
            },
            {
              type: 'noteLink' as const,
              attrs: {
                targetType: 'lesson' as const,
                targetId: '0199e0a0-0000-7000-8000-000000000002',
                label: '<Elsewhere>',
              },
            },
          ],
        },
      ],
    };
    const out = bodyHtml(body, 2, (link) => (link.label === 'Here' ? '#top' : null), NO_TEXT).value;
    expect(out).toBe('<p><a href="#top">Here</a>&lt;Elsewhere&gt;</p>');
  });

  it("quotes a chip's text in the owner's translation, and text from outside as it came", () => {
    const rom = { book: 'ROM' as const, chapter: 8, verseStart: 28, display: 'Romans 8:28' };
    const kjv: VerseReader = { translation: 'KJV', text: () => 'And we know…' };
    const niv = {
      ...rom,
      translation: 'shared' as const,
      versionLabel: 'NIV',
      snapshotText: 'In all things…',
    };
    expect(bodyHtml(chips(rom, niv), 2, () => null, kjv).value.replaceAll(/\s+/g, ' ')).toBe(
      '<p><span class="chip">Romans 8:28 (KJV)</span><span class="chip">Romans 8:28 (NIV)</span></p>' +
        '<blockquote class="verse-quote"><strong>Romans 8:28 (KJV)</strong> And we know…</blockquote>' +
        '<blockquote class="verse-quote"><strong>Romans 8:28 (NIV)</strong> In all things…</blockquote>',
    );
    // Without its book, a chip is its reference alone.
    expect(bodyHtml(chips(rom), 2, () => null, NO_TEXT).value).not.toContain('blockquote');
  });
});

/** A body of one paragraph holding these chips. */
const chips = (...attrs: VerseRef[]) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph' as const,
      content: attrs.map((a) => ({ type: 'verse' as const, attrs: a })),
    },
  ],
});

/** A reader without the books: the BSB, no text. */
const NO_TEXT: VerseReader = { translation: 'BSB', text: () => '' };

describe('withoutTokens', () => {
  it("hides a shared page's token in a logged URL", () => {
    const token = 'k3J9'.padEnd(43, 'x');
    expect(withoutTokens(`/s/${token}`)).toBe('/s/…');
    expect(withoutTokens(`/s/${token}/lessons/1`)).toBe('/s/…/lessons/1');
    expect(withoutTokens('/api/sync/pull')).toBe('/api/sync/pull');
    expect(withoutTokens('/api/email/unsubscribe?token=abc.def&x=1')).toBe(
      '/api/email/unsubscribe?token=…&x=1',
    );
  });
});

describe('page', () => {
  it('allows exactly its script and style, by their hashes', () => {
    const script = 'print()';
    const { html, csp } = page({ title: 'T', main: 'M', script });
    const hash = createHash('sha256').update(script).digest('base64');
    expect(html).toContain(`<script>${script}</script>`);
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    const styleHash = createHash('sha256').update(style).digest('base64');
    expect(csp).toContain(`style-src 'sha256-${styleHash}'`);
  });
});
