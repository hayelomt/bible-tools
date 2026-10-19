import { OUTSIDE_TRANSLATIONS } from './verse-ref.ts';

/**
 * Decision 97: the app's own text is no longer stored with a reference, only read in the
 * translation picked in Settings. These take what was stored before (a BSB or KJV translation, its
 * snapshot) out of a reference, and out of every chip in a value that holds them (a section body,
 * a queued change), leaving text from outside (`shared`, `pasted`) as it was. Anything else is
 * returned unchanged.
 */
export function withoutAppText<T>(ref: T): T {
  if (!isObject(ref) || (OUTSIDE_TRANSLATIONS as readonly unknown[]).includes(ref.translation)) {
    return ref;
  }
  if (!('translation' in ref) && !('snapshotText' in ref) && !('versionLabel' in ref)) return ref;
  const { translation: _translation, versionLabel: _label, snapshotText: _text, ...rest } = ref;
  return rest as T;
}

/** `withoutAppText` on each verse chip anywhere in `value` (a body, or a row holding one). */
export function chipsWithoutAppText<T>(value: T): T {
  if (Array.isArray(value)) return value.map(chipsWithoutAppText) as T;
  if (!isObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    copy[key] =
      key === 'attrs' && value.type === 'verse'
        ? withoutAppText(child)
        : chipsWithoutAppText(child);
  }
  return copy as T;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
