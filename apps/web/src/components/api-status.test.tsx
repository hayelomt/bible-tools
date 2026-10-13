import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiStatus } from './api-status.tsx';

function renderWithQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ApiStatus', () => {
  it('shows the API version once /api/health answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok', version: '1.2.3' })),
    );
    renderWithQuery();
    expect(await screen.findByText('Server ok · v1.2.3')).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('/api/health');
  });

  it('says the server is unreachable when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    renderWithQuery();
    expect(await screen.findByText('Server unreachable')).toBeDefined();
  });
});
