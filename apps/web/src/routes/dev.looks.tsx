import { createFileRoute } from '@tanstack/react-router';
import { LooksDemo } from '@/components/looks/looks-demo.tsx';

/** Look and feel explorations (components/looks), loaded only when this page opens. */
export const Route = createFileRoute('/dev/looks')({
  component: LooksDemo,
});
