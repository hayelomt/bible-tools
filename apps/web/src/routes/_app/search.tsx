import { createFileRoute } from '@tanstack/react-router';
import { Placeholder } from '@/components/placeholder.tsx';

export const Route = createFileRoute('/_app/search')({
  staticData: { title: 'Search' },
  component: () => <Placeholder>Search arrives in a later version.</Placeholder>,
});
