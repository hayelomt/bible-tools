import { BookOpen, ListChecks, type LucideIcon, NotebookPen, Search } from 'lucide-react';

export interface NavItem {
  to: '/' | '/read' | '/search' | '/review';
  label: string;
  icon: LucideIcon;
}

/** The four destinations (UX-PATTERNS "Layout"). Nothing else goes in the bottom bar. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Lessons', icon: NotebookPen },
  { to: '/read', label: 'Read', icon: BookOpen },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/review', label: 'Review', icon: ListChecks },
];
