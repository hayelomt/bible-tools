import type { TranslationId } from '@lamp/domain';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DownloadState } from '@/data/bible-download.ts';
import { BibleDownloadIndicator } from './bible-download-indicator.tsx';

let downloads = new Map<TranslationId, DownloadState>();
vi.mock('@/data/bible-download.ts', () => ({ useBibleDownloads: () => downloads }));
// A link without the router: an anchor is enough here.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function shown(state: DownloadState, translation: TranslationId = 'BSB') {
  downloads = new Map([[translation, state]]);
  render(<BibleDownloadIndicator />);
  act(() => vi.advanceTimersByTime(300));
}

it('shows the books downloaded so far, after 300 ms', () => {
  downloads = new Map([['BSB', { status: 'downloading', done: 45, total: 66 }]]);
  render(<BibleDownloadIndicator />);
  expect(screen.queryByRole('link')).toBeNull();
  act(() => vi.advanceTimersByTime(300));
  const link = screen.getByRole('link', {
    name: 'Downloading the Berean Standard Bible: 45 of 66 books',
  });
  expect(link.textContent).toBe('Bible 45/66');
});

it('says it is starting before the size is known', () => {
  shown({ status: 'starting' }, 'KJV');
  expect(
    screen.getByRole('link', { name: 'Starting to download the King James Version' }),
  ).toBeTruthy();
});

it.each<DownloadState>([
  { status: 'none' },
  { status: 'complete', total: 66, bytes: 1 },
  { status: 'paused', done: 3, total: 66 },
  { status: 'unavailable' },
])('shows nothing while $status', (state) => {
  shown(state);
  expect(screen.queryByRole('link')).toBeNull();
});
