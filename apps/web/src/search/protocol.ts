import type { RowRef } from '@/data/changes.ts';
import type { TextHit } from './text-index.ts';

/** What the page asks the search worker. */
export type WorkerRequest =
  { type: 'changed'; refs: readonly RowRef[] } | { type: 'search'; id: number; query: string };

/** What the search worker answers. */
export type WorkerReply =
  | { type: 'ready'; buildMs: number; docs: number }
  | { type: 'results'; id: number; hits: TextHit[] }
  | { type: 'failed'; id?: number; message: string };
