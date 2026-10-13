import { createFileRoute, redirect } from '@tanstack/react-router';
import { chapterSlug } from '@/lib/chapters.ts';
import { readingPosition } from '@/lib/reading-position.ts';

/** Read in the navigation: the reader reopens at the chapter last read (F8). */
export const Route = createFileRoute('/_app/read/')({
  beforeLoad: () => {
    throw redirect({
      to: '/read/$chapter',
      params: { chapter: chapterSlug(readingPosition()) },
      replace: true,
    });
  },
});
