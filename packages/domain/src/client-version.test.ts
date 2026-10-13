import { describe, expect, it } from 'vitest';
import { compareVersions, isClientSupported, MIN_CLIENT_VERSION } from './client-version.ts';
import { clientVersionSchema } from './schemas/sync.ts';

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
  });

  it('ignores a pre-release or build suffix', () => {
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0+abc', '1.1.9')).toBeGreaterThan(0);
  });
});

describe('isClientSupported', () => {
  it('serves the minimum version and anything newer, and refuses older', () => {
    expect(isClientSupported(MIN_CLIENT_VERSION)).toBe(true);
    expect(isClientSupported('1.4.0', '1.4.0')).toBe(true);
    expect(isClientSupported('1.5.0', '1.4.0')).toBe(true);
    expect(isClientSupported('1.3.9', '1.4.0')).toBe(false);
  });
});

describe('clientVersionSchema', () => {
  it('takes major.minor.patch with an optional suffix', () => {
    for (const version of ['0.0.0', '1.12.3', '1.0.0-beta.1', '1.0.0+build.7']) {
      expect(clientVersionSchema.safeParse(version).success).toBe(true);
    }
    for (const version of ['', '1.0', 'v1.0.0', 'latest', `1.0.0-${'x'.repeat(50)}`]) {
      expect(clientVersionSchema.safeParse(version).success).toBe(false);
    }
  });
});
