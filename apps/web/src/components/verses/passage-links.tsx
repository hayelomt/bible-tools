import { type Passage, passageSlug } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

interface PassageLinkProps {
  passage: Passage;
  label?: string;
  children: React.ReactNode;
}

/** Opens the reader at the passage's first verse, or the top of its first chapter (M5-04). */
export function ReadLink({ passage, ...props }: PassageLinkProps) {
  const { book, chapter, verseStart } = passage;
  return (
    <PassageLink
      to="/read/$chapter"
      passage={{ book, chapter, ...(verseStart != null ? { verseStart } : {}) }}
      {...props}
    />
  );
}

/** A small outline button to a screen about a passage: its verse index or its commentary. */
export function PassageLink({
  to,
  passage,
  label,
  children,
}: PassageLinkProps & { to: '/read/$chapter' | '/compile/$passage' | '/verses/$passage' }) {
  const slug = passageSlug(passage);
  return (
    <Link
      to={to}
      params={to === '/read/$chapter' ? { chapter: slug } : { passage: slug }}
      aria-label={label}
      data-slot="button"
      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
    >
      {children}
      <ChevronRight aria-hidden />
    </Link>
  );
}
