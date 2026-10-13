import { createFileRoute } from '@tanstack/react-router';
import { Placeholder } from '@/components/placeholder.tsx';

export const Route = createFileRoute('/_app/review')({
  staticData: { title: 'Review' },
  component: () => <Placeholder>The review queue arrives in a later version.</Placeholder>,
});
