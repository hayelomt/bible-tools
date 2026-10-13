import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorScreen } from './error-screen.tsx';

afterEach(cleanup);

describe('ErrorScreen', () => {
  it('reassures, and copies the details for a bug report', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ErrorScreen error={new TypeError('lesson is undefined')} reset={() => {}} />);

    expect(screen.getByRole('alert').textContent).toContain('Your notes are safe on this device.');
    fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('TypeError: lesson is undefined'),
    );
    vi.unstubAllGlobals();
  });
});
