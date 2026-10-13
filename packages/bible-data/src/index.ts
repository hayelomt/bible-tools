// Public API of @lamp/bible-data: the book file format and passage lookup, for the web app.
// The build itself (build.ts, usfm.ts) runs in Node and is not exported.
export type { BookManifest, Manifest, TranslationManifest } from './build.ts';
export { passageText, passageVerses, type VerseText } from './lookup.ts';
export type { BookText } from './usfm.ts';
