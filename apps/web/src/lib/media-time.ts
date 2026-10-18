import { clockLabel } from './source-time.ts';

/**
 * A source's link at a moment (F28, M11-07): YouTube's `t`, Vimeo's `#t=1m2s`, and the media
 * fragment `#t=62` that browsers honour on an audio or video file. Null where the link can't jump
 * to a time: it opens at the start.
 */
export function momentUrl(link: string, seconds: number): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const s = Math.max(0, Math.floor(seconds));
  if (host === 'youtu.be' || (host === 'youtube.com' && isYouTubeVideo(url))) {
    url.searchParams.delete('start');
    url.searchParams.set('t', String(s));
    return url.toString();
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    url.hash = `t=${hms(s)}`;
    return url.toString();
  }
  if (MEDIA_FILE.test(url.pathname)) {
    url.hash = `t=${s}`;
    return url.toString();
  }
  return null;
}

const MEDIA_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|webm|mov)$/i;

function isYouTubeVideo(url: URL): boolean {
  return (
    (url.pathname === '/watch' && url.searchParams.has('v')) ||
    /^\/(live|shorts|embed)\/[\w-]+/.test(url.pathname)
  );
}

/** Vimeo's form: "9m45s", "1h2m10s". */
function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h > 0 ? `${h}h` : ''}${h > 0 || m > 0 ? `${m}m` : ''}${seconds % 60}s`;
}

/** "youtube.com" from a link, for a source's line; the link itself when it doesn't parse. */
export function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

/** A section's time as its button says it: "Open at 09:45". */
export const openAtLabel = (seconds: number) => `Open at ${clockLabel(seconds * 1000)}`;

/**
 * A typed link as stored: "gracechapel.org/sermons" gains `https://`; null when it isn't a web
 * address (http or https, up to 2,048 characters, as the schema takes).
 */
export function webAddress(typed: string): string | null {
  const text = typed.trim();
  const withScheme = /^[a-z][\w+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return withScheme.length <= 2048 ? withScheme : null;
  } catch {
    return null;
  }
}
