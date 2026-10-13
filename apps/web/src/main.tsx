import '@lamp/ui/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorScreen, NotFoundScreen } from './components/error-screen.tsx';
import { routeTree } from './routeTree.gen.ts';

// TanStack Query is only for the few server calls (§8.1); notes are read from Dexie.
const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  // Rendered in place of the failing screen, so the shell around it stays.
  defaultErrorComponent: ErrorScreen,
  defaultNotFoundComponent: () => <NotFoundScreen />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /** The screen's title, shown as its `h1` by the shell. */
    title?: string;
    /** Where `←` goes, on screens below a destination. */
    back?: '/' | '/settings' | '/search';
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
