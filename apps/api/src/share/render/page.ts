import { createHash } from 'node:crypto';
import { markup, type Part, trusted } from './markup.js';
import { PAGE_CSS } from './styles.js';

/**
 * The whole document of a shared page (wireframes/sharing.md "Shared page"): the Lamp wordmark,
 * the content and the footer, in Lamplight, light or dark as the reader's device is. Nothing is
 * loaded from anywhere: the style is inline and allowed by its hash, as is the one script a page
 * may have (the handout's).
 */

export interface Page {
  html: string;
  /** The `Content-Security-Policy` that lets exactly this page's style and script run. */
  csp: string;
}

const hashOf = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

const STYLE_HASH = hashOf(PAGE_CSS);

export function page({
  title,
  main,
  footer,
  script,
  bodyClass,
}: {
  title: string;
  main: Part;
  footer?: Part;
  /** The server's own inline JavaScript, allowed by its hash. */
  script?: string;
  bodyClass?: string;
}): Page {
  const document = markup`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>${trusted(PAGE_CSS)}</style>
</head>
<body${bodyClass ? markup` class="${bodyClass}"` : ''}>
<header class="bar"><span class="wordmark">Lamp</span></header>
<main>${main}</main>
${footer ? markup`<footer>${footer}</footer>` : ''}
${
  // Exactly the hashed text: nothing around it inside the element.
  script ? markup`<script>${trusted(script)}</script>` : ''
}
</body>
</html>
`;
  return {
    html: document.value,
    csp: [
      "default-src 'none'",
      `style-src ${STYLE_HASH}`,
      `script-src ${script ? hashOf(script) : "'none'"}`,
      "img-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}
