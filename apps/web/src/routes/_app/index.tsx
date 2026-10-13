import { createFileRoute } from '@tanstack/react-router';
import { Placeholder } from '@/components/placeholder.tsx';

export const Route = createFileRoute('/_app/')({
  staticData: { title: 'Lessons' },
  component: () => <Placeholder>Your lessons will be listed here.</Placeholder>,
});
