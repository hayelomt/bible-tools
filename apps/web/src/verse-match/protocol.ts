import type { VerseTextMatch } from '@lamp/bible-data';
import type { BookCode, Passage, TranslationId } from '@lamp/domain';

/** What the page asks the verse matcher's worker. */
export type MatcherRequest =
  | { type: 'book'; translation: TranslationId; code: BookCode }
  | { type: 'match'; id: number; text: string; hints: Passage[] };

/** What the worker answers. */
export type MatcherReply =
  | { type: 'ready'; buildMs: number; verses: number; bytes: number; books: number }
  | { type: 'results'; id: number; matches: VerseTextMatch[] }
  | { type: 'failed'; id?: number; message: string };
