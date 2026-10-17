import { BookOpen, Inbox, ListChecks, type LucideIcon, NotebookPen, Search } from 'lucide-react';

export interface NavItem {
  to: '/' | '/inbox' | '/read' | '/search' | '/review';
  label: string;
  icon: LucideIcon;
}

/** The five destinations (UX-PATTERNS "Layout"). Nothing else goes in the bottom bar. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Lessons', icon: NotebookPen },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/read', label: 'Read', icon: BookOpen },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/review', label: 'Review', icon: ListChecks },
];
