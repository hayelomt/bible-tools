import { createFileRoute } from '@tanstack/react-router';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { SeedPage } from '@/dev/seed-page.tsx';

/** Dev data (`dev/seed.ts`). A production build leaves the seeder out. */
export const Route = createFileRoute('/dev/seed')({
  component: import.meta.env.DEV ? SeedPage : NotFoundScreen,
});
