import { Toaster, toast } from '@lamp/ui/components/sonner';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { INSTALL_LATER_KEY, INSTALL_LATER_MS } from '@/lib/install.ts';
import { finishWelcome } from '@/lib/welcome.ts';
import { InstallPrompt } from './install-prompt.tsx';

const PROMPT = 'Install Lamp to open it from your home screen and use it offline.';

/** The browser offers to install, as Chromium does; `outcome` is the user's answer. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function renderPrompt() {
  render(
    <>
      <input aria-label="Title" />
      <InstallPrompt />
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  localStorage.clear();
  finishWelcome();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  // Leaves no offer behind for the next test.
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
});

it('offers to install on load, waits while something is typed, and installs when asked', async () => {
  renderPrompt();
  const event = offerInstall();
  expect(event.defaultPrevented).toBe(true);
  expect(await screen.findByText(PROMPT)).toBeTruthy();

  act(() => screen.getByLabelText('Title').focus());
  await vi.waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
  act(() => screen.getByLabelText('Title').blur());
  expect(await screen.findByText(PROMPT)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Install' }));
  await vi.waitFor(() => expect(event.prompt).toHaveBeenCalled());
  await vi.waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
});

it('waits for the welcome on a new device', async () => {
  localStorage.clear();
  renderPrompt();
  offerInstall();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText(PROMPT)).toBeNull();
  act(() => finishWelcome());
  expect(await screen.findByText(PROMPT)).toBeTruthy();
});

it('Not now puts the offer off for two weeks', async () => {
  renderPrompt();
  offerInstall();
  fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
  await vi.waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
  expect(localStorage.getItem(INSTALL_LATER_KEY)).not.toBeNull();

  cleanup();
  renderPrompt();
  offerInstall();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText(PROMPT)).toBeNull();
});

it('offers again once two weeks have passed', async () => {
  localStorage.setItem(INSTALL_LATER_KEY, String(Date.now() - INSTALL_LATER_MS - 1));
  renderPrompt();
  offerInstall();
  expect(await screen.findByText(PROMPT)).toBeTruthy();
});

it('says how to add it from the Share menu on an iPhone', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
  );
  try {
    renderPrompt();
    expect(
      await screen.findByText('Install Lamp: tap Share, then Add to Home Screen.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(localStorage.getItem(INSTALL_LATER_KEY)).not.toBeNull();
  } finally {
    vi.restoreAllMocks();
  }
});
