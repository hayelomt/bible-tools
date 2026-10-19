import { escapeMarkdown, toNotionBlocks } from '@lamp/domain';
import { outline } from '@/components/sections/outline.ts';
import {
  headerLines,
  type LessonForExport,
  linkWriter,
  questionLine,
  safeHref,
  scriptureCredit,
  sectionMoment,
  sourceOf,
  tagLabel,
} from './markdown.ts';

/**
 * A lesson as Markdown that pastes into Notion with its structure (F33, M12-06,
 * wireframes/reflection.md "Export: Notion and handout"). Flat where the Markdown export nests:
 *
 * - Each header line is a paragraph of its own, since Notion doesn't keep a hard break; the
 *   source's link is written out, which Notion makes a link.
 * - A section's body as `toNotionBlocks` writes it: verse text quoted with the reference under it
 *   as a caption. A reply, at any depth, is one level of quote under its section.
 * - A section's tags are a line of text after it: "Tags: #hope · #Holy Spirit".
 * - A link chip is its target's title, as text: Notion has no file to link it to.
 * - Takeaways as a list, questions as to-dos, and the credit after a divider, as in the Markdown.
 */
export function notionMarkdown(data: LessonForExport): string {
  const { lesson } = data;
  const files = linkWriter(data.links ?? new Map());
  const links = (link: Parameters<typeof files>[0]) => {
    const target = files(link);
    return target && { text: target.text };
  };

  const blocks = [`# ${escapeMarkdown(lesson.title)}`, ...headerLines(data).map(escapeMarkdown)];
  const source = sourceOf(lesson);
  if (source) {
    const words = escapeMarkdown(source.words);
    blocks.push(source.url ? `${words} · ${safeHref(source.url)}` : words);
  }

  for (const row of outline(data.sections)) {
    const moment = sectionMoment(row.item, lesson);
    const tags = data.sectionTags.get(row.item.id) ?? [];
    blocks.push(
      ...toNotionBlocks(row.item.body, {
        headingLevel: 2,
        links,
        quoted: row.level > 0,
        lead: moment
          ? moment.href
            ? `[${moment.label}](${safeHref(moment.href)})`
            : `[${moment.label}]`
          : undefined,
        after:
          tags.length > 0
            ? `Tags: ${tags.map((t) => escapeMarkdown(tagLabel(t))).join(' · ')}`
            : undefined,
      }),
    );
  }

  if (data.takeaways.length > 0) {
    blocks.push(
      '## Takeaways',
      data.takeaways.map((t) => `- ${escapeMarkdown(t.text)}`).join('\n'),
    );
  }
  if (data.questions.length > 0) {
    blocks.push('## Questions', data.questions.map(questionLine).join('\n'));
  }
  const credit = scriptureCredit([data]);
  if (credit) blocks.push('---', credit);
  return `${blocks.join('\n\n')}\n`;
}
