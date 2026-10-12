import { readFileSync } from 'node:fs';

/** The API version from package.json (one level up from both `src/` and `dist/`). */
export const appVersion: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
