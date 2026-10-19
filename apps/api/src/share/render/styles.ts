/**
 * The shared pages' one stylesheet, inline and allowed by its hash (`page.ts`). The colours are
 * Lamplight's tokens (packages/ui/src/styles/globals.css), light or dark as the reader's device
 * is (UX-PATTERNS "Paper and shared pages"); the handout is dark on white, like the app's.
 */
export const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --background: oklch(0.965 0.014 80);
  --foreground: oklch(0.23 0.02 55);
  --primary: oklch(0.45 0.1 58);
  --muted-foreground: oklch(0.47 0.025 65);
  --border: oklch(0.88 0.02 80);
  --quote: oklch(0.45 0.1 58 / 0.4);
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.16 0.01 60);
    --foreground: oklch(0.93 0.015 80);
    --primary: oklch(0.82 0.14 75);
    --muted-foreground: oklch(0.68 0.02 70);
    --border: oklch(0.29 0.012 60);
    --quote: oklch(0.82 0.14 75 / 0.4);
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font: 1.0625rem/1.6 'Inter Tight Variable', ui-sans-serif, system-ui, sans-serif;
  overflow-wrap: break-word;
}
.bar, main, footer { max-width: 42rem; margin: 0 auto; padding: 0 1rem; }
.bar { padding-top: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
.wordmark { font-weight: 600; color: var(--primary); letter-spacing: 0.02em; }
main { padding-top: 1.5rem; padding-bottom: 2rem; }
footer {
  padding-top: 0.75rem;
  padding-bottom: 2.5rem;
  border-top: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 0.875rem;
}
footer p { margin: 0; }
a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
h1 { font-size: 1.875rem; line-height: 1.2; margin: 0 0 0.5rem; font-weight: 600; }
h2 { font-size: 1.25rem; line-height: 1.3; margin: 2rem 0 0.75rem; font-weight: 600; }
h3, h4, h5 { font-size: 1.0625rem; margin: 0; font-weight: 600; }
p, ul, ol, blockquote { margin: 0; }
.muted { color: var(--muted-foreground); font-size: 0.9375rem; }
.details { display: flex; flex-direction: column; gap: 0.125rem; margin-bottom: 1.5rem; }
.doc > * + * { margin-top: 1rem; }
.note > * + * { margin-top: 0.75rem; }
.note p { white-space: pre-wrap; }
.reply { margin-left: 1rem; padding-left: 1rem; border-left: 2px solid var(--border); }
.moment { font-variant-numeric: tabular-nums; margin-bottom: -0.5rem; }
.tags { font-style: italic; }
blockquote { padding-left: 1rem; border-left: 2px solid var(--border); }
blockquote > * + * { margin-top: 0.75rem; }
.verse-quote { border-left-color: var(--quote); color: var(--muted-foreground); white-space: pre-line; }
.verse-quote strong { color: var(--foreground); font-weight: 600; }
.chip { font-weight: 500; }
ul, ol { padding-left: 1.5rem; }
li + li { margin-top: 0.25rem; }
li > * + * { margin-top: 0.75rem; }
.questions { list-style: none; padding: 0; }
.questions li { display: flex; gap: 0.5rem; }
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
.lessons { list-style: none; padding: 0; }
.lessons li { display: flex; gap: 1rem; }
.lessons .date { flex: 0 0 8.5rem; color: var(--muted-foreground); font-size: 0.9375rem; }
.back { display: inline-block; margin-bottom: 1rem; font-size: 0.9375rem; }
.group { margin-top: 2rem; }
.group-heading {
  margin: 0 0 0.75rem; font-size: 0.875rem; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase;
}
.chapter-heading { margin-top: 2.5rem; }
.entry { margin-top: 1.25rem; }
.entry > * + * { margin-top: 0.75rem; }
.gone { display: flex; flex-direction: column; gap: 0.75rem; padding: 3rem 0; }

/* The handout (M12-05): a box A4 and Letter both hold inside the print margins. */
@page { margin: 18mm 16mm; }
.handout main { max-width: calc(210mm + 2rem); }
.handout .tools { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
.handout .tools output { flex: 1; color: var(--muted-foreground); font-size: 0.875rem; }
.handout button {
  font: inherit; font-weight: 500; padding: 0.5rem 1rem; min-height: 2.75rem;
  border: 0; border-radius: 0.75rem; cursor: pointer;
  background: var(--primary); color: var(--background);
}
.handout-frame { overflow: hidden; }
.handout-paper {
  width: 210mm; padding: 18mm 16mm; background: #fff; color: #171717;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
  transform: scale(var(--sheet-scale, 1)); transform-origin: top left;
}
.handout-box { width: 178mm; height: 242mm; overflow: hidden; line-height: 1.375; font-size: 11pt; }
.handout-box h1 { font-size: 1.8em; margin: 0; }
.handout-box .details { gap: 0.2em; margin: 0.2em 0 0; }
.handout-box .details p { font-size: 0.85em; color: #525252; }
.handout-box .passages { margin-top: 0.9em; display: flex; flex-direction: column; gap: 0.5em; }
.handout-box .passage { font-weight: 600; }
.handout-box .passage-text { font-size: 0.85em; color: #262626; }
.handout-box sup { font-size: 0.65em; color: #737373; margin-right: 0.125rem; }
.handout-box.no-text .passage-text { display: none; }
.handout-box h2 {
  margin: 0.9em 0 0.3em; font-size: 0.8em; letter-spacing: 0.05em; text-transform: uppercase;
}
.handout-box ol, .handout-box ul { padding-left: 1.6em; }
.handout-box li + li { margin-top: 0; }
.handout-box.two-columns .notes { columns: 2; column-gap: 2em; }
.handout-box .notes li { break-inside: avoid; }
.handout-box .notes span {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.handout-box .questions li { gap: 0.5em; }
.handout-box .credit {
  margin-top: 1.2em; padding-top: 0.4em; border-top: 1px solid #d4d4d4;
  font-size: 0.75em; color: #525252;
}
@media print {
  html, body { background: #fff !important; color-scheme: light; }
  .bar, footer, .handout .tools { display: none; }
  .handout main { padding: 0; max-width: none; }
  .handout-frame { height: auto !important; overflow: visible; }
  .handout-paper { width: auto; padding: 0; transform: none; box-shadow: none; }
}
`;
