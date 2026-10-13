import { Toaster, toast } from '@lamp/ui/components/sonner';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdatePrompt } from './update-prompt.tsx';

const updateServiceWorker = vi.fn<(reload?: boolean) => Promise<void>>(() => Promise.resolve());

// A new version is waiting.
vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react');
  return {
    useRegisterSW: () => ({
      needRefresh: useState(true),
      offlineReady: useState(false),
      updateServiceWorker,
    }),
  };
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  updateServiceWorker.mockClear();
});

const PROMPT = 'A new version of Lamp is ready.';

it('waits while something is typed, and reloads only when asked', async () => {
  render(
    <>
      <input aria-label="Title" />
      <UpdatePrompt />
      <Toaster />
    </>,
  );
  expect(await screen.findByText(PROMPT)).toBeTruthy();

  // Typing: the prompt is put away until focus leaves the field.
  act(() => screen.getByLabelText('Title').focus());
  await vi.waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
  act(() => screen.getByLabelText('Title').blur());
  expect(await screen.findByText(PROMPT)).toBeTruthy();
  expect(updateServiceWorker).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await vi.waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
});

it('Later puts the new version off', async () => {
  render(
    <>
      <UpdatePrompt />
      <Toaster />
    </>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
  await vi.waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
  expect(updateServiceWorker).not.toHaveBeenCalled();
});
