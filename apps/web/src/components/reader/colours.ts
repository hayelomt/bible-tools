import type { Highlight } from '@lamp/domain';

/** The reader's four colours (F8), as the shared highlight tokens. */
export const HIGHLIGHT_COLOUR_CLASS: Record<Highlight['colour'], string> = {
  yellow: 'bg-highlight-yellow',
  green: 'bg-highlight-green',
  blue: 'bg-highlight-blue',
  pink: 'bg-highlight-pink',
};

export const HIGHLIGHT_COLOUR_NAME: Record<Highlight['colour'], string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
};
