import type { ImportedItem } from './youversion.ts';

/** The page asks the import worker to read one export file. */
export interface ImportRequest {
  file: Blob;
}

export type ImportReply =
  /** The file is read: this many records to go through. */
  | { type: 'total'; total: number }
  | { type: 'progress'; done: number }
  | { type: 'done'; items: ImportedItem[] }
  /** `format`: the file isn't an export Lamp can read (otherwise something else broke). */
  | { type: 'failed'; format: boolean; message: string };
