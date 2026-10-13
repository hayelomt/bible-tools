import { normaliseTagName, type Tag, tagKey } from '@lamp/domain';

/** What the tag input offers for the text typed so far. */
export interface TagMatches {
  /** Tags to pick, best first: the same name, then names and words starting with it, then the rest. */
  tags: Tag[];
  /** A name no tag has yet, offered as "Create". */
  create: string | null;
  /** The typed name is a tag that's already on the item. */
  alreadyOn: Tag | null;
}

const MAX_MATCHES = 8;

/**
 * Matches what's typed in the tag input against every tag (wireframes/lessons.md "Tag input"),
 * ignoring case and a leading `#`. Tags already on the item aren't offered again. With nothing
 * typed, every other tag is offered, in `all`'s order (by name).
 */
export function matchTags(
  all: readonly Tag[],
  typed: string,
  applied: ReadonlySet<string>,
): TagMatches {
  const name = normaliseTagName(typed);
  const key = name.toLowerCase();
  const offered = all.filter((t) => !applied.has(t.id));
  if (!key) return { tags: offered, create: null, alreadyOn: null };

  const exact = all.find((t) => tagKey(t.name) === key) ?? null;
  const rank = (tag: Tag): number => {
    const tagName = tagKey(tag.name);
    if (tagName === key) return 0;
    if (tagName.startsWith(key)) return 1;
    if (tagName.split(' ').some((word) => word.startsWith(key))) return 2;
    return tagName.includes(key) ? 3 : -1;
  };
  const tags = offered
    .map((tag) => ({ tag, rank: rank(tag) }))
    .filter((m) => m.rank >= 0)
    // A stable sort, so tags of the same rank keep `all`'s order.
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, MAX_MATCHES)
    .map((m) => m.tag);
  return {
    tags,
    create: exact ? null : name,
    alreadyOn: exact && applied.has(exact.id) ? exact : null,
  };
}
