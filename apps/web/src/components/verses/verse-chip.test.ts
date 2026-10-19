import { describe, expect, it } from 'vitest';
import { setActiveTranslation } from '@/data/translation.ts';
import { chipLabel } from './verse-chip.ts';

describe('chipLabel', () => {
  it('names the passage and the translation, as a button to show the text', () => {
    expect(chipLabel({ display: 'John 10:9' })).toBe(
      'John 10:9, Berean Standard Bible, verse. Show text.',
    );
    expect(chipLabel({ display: 'John 3:16', translation: 'shared', versionLabel: 'NIV' })).toBe(
      'John 3:16, NIV, verse. Show text.',
    );
  });

  it('names the translation picked in Settings for the app’s own text', () => {
    setActiveTranslation('KJV');
    try {
      expect(chipLabel({ display: 'John 10:9' })).toBe(
        'John 10:9, King James Version, verse. Show text.',
      );
    } finally {
      setActiveTranslation('BSB');
    }
  });
});
