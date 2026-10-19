/**
 * Opening a link to one of the app's own pages without reloading it: a note's text link to a
 * commentary, as the quarterly digest writes them (M12-08). The shell registers the router's
 * navigation; until it has, such a link is left to the browser.
 */
let navigate: ((href: string) => void) | undefined;

export function setInAppNavigate(next: ((href: string) => void) | undefined): void {
  navigate = next;
}

/** The address within the app a link points to, or null for one elsewhere. */
export function inAppHref(href: string, origin = globalThis.location?.origin): string | null {
  if (!origin) return null;
  try {
    const url = new URL(href, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

/** Opens `href` in the app if it's one of its pages; true when it did. */
export function openInApp(href: string): boolean {
  const path = inAppHref(href);
  if (!path || !navigate) return false;
  navigate(path);
  return true;
}
