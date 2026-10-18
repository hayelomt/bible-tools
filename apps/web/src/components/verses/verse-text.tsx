import {
  type ChipTranslation,
  isAppTranslation,
  type Passage,
  type TranslationId,
} from '@lamp/domain';
import { type BookState, type NumberedVerse, numberedVerses, useBook } from '@/data/bible.ts';

/** A verse number before its text, raised without making its line taller. */
export const NUMBER_CLASS =
  'relative -top-[0.5em] mr-0.5 align-baseline font-sans not-italic text-[0.65em] leading-none text-muted-foreground';

function verses(book: BookState, passage: Passage, text: string): NumberedVerse[] | null {
  return book.status === 'ready' ? numberedVerses(book.text, passage, text) : null;
}

interface VerseTextProps {
  passage: Passage;
  /** The translation the text is from; its book gives the numbers. */
  translation: ChipTranslation;
  text: string;
  className?: string;
}

/**
 * A passage's text with its verse numbers ("²⁸ We know… ²⁹ For whom…"). Numbered once the book is
 * on the device and the text is still its own (`numberedVerses`); plain until then, or otherwise.
 * Text from outside (`shared`, `pasted`) is always plain: Lamp has no book for it.
 */
export function VerseText({ translation, ...props }: VerseTextProps) {
  if (!isAppTranslation(translation)) return <p className={props.className}>{props.text}</p>;
  return <NumberedText translation={translation} {...props} />;
}

function NumberedText({
  passage,
  translation,
  text,
  className,
}: VerseTextProps & { translation: TranslationId }) {
  const book = useBook(translation, passage.book);
  const numbered = verses(book, passage, text);
  return (
    <p className={className}>
      {numbered
        ? numbered.map((v, i) => (
            <span key={v.label}>
              {i > 0 && ' '}
              <sup className={NUMBER_CLASS}>{v.label}</sup>
              {v.text}
            </span>
          ))
        : text}
    </p>
  );
}

/** `VerseText` as plain DOM, for the editor's previews; drawn again when the book arrives. */
export function verseTextNodes(book: BookState | null, passage: Passage, text: string): Node[] {
  const numbered = book && verses(book, passage, text);
  if (!numbered) return [document.createTextNode(text)];
  return numbered.flatMap((v, i) => {
    const number = document.createElement('sup');
    number.className = NUMBER_CLASS;
    number.textContent = v.label;
    return [
      ...(i > 0 ? [document.createTextNode(' ')] : []),
      number,
      document.createTextNode(v.text),
    ];
  });
}
