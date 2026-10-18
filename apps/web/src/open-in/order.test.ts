import { describe, expect, it } from 'vitest';
import { allTargets, moveShown, setShown } from './order.ts';

describe('the "Open in…" order', () => {
  it('lists hidden targets after the shown ones', () => {
    expect(allTargets(['logos', 'youversion'])).toEqual([
      'logos',
      'youversion',
      'blueletterbible',
      'biblehub',
    ]);
  });

  it('hides a target, and shows it again at the end', () => {
    const hidden = setShown(['blueletterbible', 'youversion', 'logos'], 'youversion', false);
    expect(hidden).toEqual(['blueletterbible', 'logos']);
    expect(setShown(hidden, 'youversion', true)).toEqual([
      'blueletterbible',
      'logos',
      'youversion',
    ]);
  });

  it('moves a shown target, within the list', () => {
    const shown = ['blueletterbible', 'youversion', 'logos'] as const;
    expect(moveShown(shown, 'logos', 0)).toEqual(['logos', 'blueletterbible', 'youversion']);
    expect(moveShown(shown, 'blueletterbible', 1)).toEqual([
      'youversion',
      'blueletterbible',
      'logos',
    ]);
    expect(moveShown(shown, 'blueletterbible', 9)).toEqual([
      'youversion',
      'logos',
      'blueletterbible',
    ]);
    expect(moveShown(shown, 'youversion', -1)).toEqual(['youversion', 'blueletterbible', 'logos']);
  });
});
