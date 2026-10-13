import { createFileRoute } from '@tanstack/react-router';
import { NotFoundScreen } from '@/components/error-screen.tsx';

/** Any other address, inside the shell so the navigation stays. */
export const Route = createFileRoute('/_app/$')({
  staticData: { title: 'Not found' },
  component: NotFoundScreen,
});
