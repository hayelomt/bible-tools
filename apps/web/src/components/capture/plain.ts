import type { SectionBody } from '@lamp/domain';

/**
 * Whether capture mode can edit a section as it is (F26): paragraphs of plain text and verse
 * chips, nothing else. Capture's editor has only those, so anything more (a heading, a list, bold,
 * a link) would be lost; such a section shows read-only there.
 */
export function isPlainBody(body: SectionBody): boolean {
  return body.content.every(
    (block) =>
      block.type === 'paragraph' &&
      (block.content ?? []).every(
        (node) => node.type === 'verse' || (node.type === 'text' && !node.marks?.length),
      ),
  );
}
