import type { Lesson, SourceType } from '@lamp/domain';
import { BookOpen, ExternalLink, Headphones, Link2, Play } from 'lucide-react';
import { linkHost } from '@/lib/media-time.ts';

type SourceValues = Pick<Lesson, 'sourceType' | 'sourceTitle' | 'sourceAuthor' | 'sourceUrl'>;

const ICONS: Record<SourceType, typeof Play> = {
  sermon: Play,
  book: BookOpen,
  podcast: Headphones,
  other: Link2,
};

/** "Sunday service · Pastor Ann · youtube.com": the source's filled-in parts, in that order. */
export function sourceWords(source: SourceValues): string {
  return [source.sourceTitle, source.sourceAuthor, source.sourceUrl && linkHost(source.sourceUrl)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Under the lesson's title (wireframes/sermon.md "Lesson source"): `▶ Sunday service ·
 * youtube.com ↗`, opening the link; a book without one is its title. Nothing without a source.
 */
export function SourceLine({ source }: { source: SourceValues }) {
  const words = sourceWords(source);
  if (!words) return null;
  const Icon = ICONS[source.sourceType ?? 'other'];
  const content = (
    <>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{words}</span>
    </>
  );
  if (!source.sourceUrl) {
    return <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{content}</p>;
  }
  return (
    <a
      href={source.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Source: ${words} (opens in a new tab)`}
      className="-mx-1 flex max-w-full items-center gap-1.5 self-start rounded-md px-1 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
    >
      {content}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}
