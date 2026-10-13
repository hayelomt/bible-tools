import { createFileRoute } from '@tanstack/react-router';
import { Placeholder } from '@/components/placeholder.tsx';

export const Route = createFileRoute('/_app/read')({
  staticData: { title: 'Read' },
  component: () => <Placeholder>The Bible reader arrives in a later version.</Placeholder>,
});
