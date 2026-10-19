// Public API of @lamp/bible-data: the book file format, passage lookup and the KJV glossary matcher,
// for the web app and the API's shared pages.
// The build itself (build.ts, source.ts) runs in Node and is not exported.
export type { BookText } from './book-text.ts';
export type { BookManifest, Manifest, TranslationManifest } from './build.ts';
export { passageText, passageVerses, quoteText, type VerseText } from './lookup.ts';
export { MIN_WORDS_ALONE, VerseTextIndex, type VerseTextMatch } from './verse-match.ts';
export {
  createGlossary,
  type Glossary,
  type GlossaryData,
  type GlossaryEntry,
  type GlossaryHit,
  type GlossaryKind,
  type GlossaryRule,
  type PageGlossary,
  type PageVerse,
} from './glossary.ts';
