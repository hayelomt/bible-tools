import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
      <Outlet />
    </main>
  ),
});
