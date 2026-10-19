/**
 * HTML for the shared pages, written as strings on the server. Everything interpolated into
 * `markup` is escaped unless it is itself `Html`, so a note's text can never become markup.
 */

/** Markup that is already safe: made by `markup`, never from user text directly. */
export class Html {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

/** The server's own constant markup, style or script, put in as it is. Never user text. */
export const trusted = (constant: string): Html => new Html(constant);

/** A value `markup` accepts: text (escaped), markup, nothing, or a list of them. */
export type Part = Html | string | number | null | undefined | false | readonly Part[];

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/g, (c) => ENTITIES[c]!);
}

function render(part: Part): string {
  if (part instanceof Html) return part.value;
  if (Array.isArray(part)) return part.map(render).join('');
  if (part === null || part === undefined || part === false) return '';
  return escapeHtml(String(part as string | number));
}

/** A template of markup: `markup\`<p>${text}</p>\`` escapes `text`. */
export function markup(strings: TemplateStringsArray, ...parts: Part[]): Html {
  let out = strings[0]!;
  parts.forEach((part, i) => {
    out += render(part) + strings[i + 1]!;
  });
  return new Html(out);
}
