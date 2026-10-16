import '@lamp/ui/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorScreen, NotFoundScreen } from './components/error-screen.tsx';
import { ScreenSkeleton } from './components/screen-skeleton.tsx';
import { routeTree } from './routeTree.gen.ts';

// TanStack Query is only for the few server calls (§8.1); notes are read from Dexie.
const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  // Rendered in place of the failing screen, so the shell around it stays.
  defaultErrorComponent: ErrorScreen,
  defaultNotFoundComponent: () => <NotFoundScreen />,
  // A screen whose code is slow to arrive shows its shape inside the shell, not a blank column.
  defaultPendingComponent: () => <ScreenSkeleton />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** The screen's title, shown as its `h1` by the shell. */
    title?: string;
    /** Where `←` goes, on screens below a destination. */
    back?: '/' | '/settings' | '/search' | '/review';
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Errors and traces, only in a build given a DSN; loaded after the first render (lib/sentry.ts).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) void import('./lib/sentry.ts').then((m) => m.startSentry(sentryDsn, router));
