const KEY = 'lamp.recentSearches';
const MAX = 5;

/**
 * The last searches that led somewhere (wireframes/search.md "RECENT"), newest first. Kept on this
 * device only; storage that's blocked or full just means no list.
 */
export function recentSearches(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((q) => typeof q === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string): void {
  const text = query.trim();
  if (!text) return;
  const others = recentSearches().filter((q) => q.toLowerCase() !== text.toLowerCase());
  try {
    localStorage.setItem(KEY, JSON.stringify([text, ...others].slice(0, MAX)));
  } catch {
    // Not remembered; search works the same.
  }
}
