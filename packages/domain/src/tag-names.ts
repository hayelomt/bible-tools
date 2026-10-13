/** `tagSchema` allows names up to 50 characters. */
export const MAX_TAG_NAME_LENGTH = 50;

/**
 * A tag name as typed, made ready to store: without the leading `#` the UI shows, with runs of
 * spaces made one and trimmed. Empty when nothing is left. Case is kept: "Holy Spirit" stays.
 */
export function normaliseTagName(typed: string): string {
  return typed
    .replace(/^[\s#]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_NAME_LENGTH)
    .trim();
}

/**
 * The key two names are the same tag by: case doesn't make a new tag (TECH-DESIGN §5.2, citext on
 * the server), so "Grace" is "grace".
 */
export function tagKey(name: string): string {
  return normaliseTagName(name).toLowerCase();
}
