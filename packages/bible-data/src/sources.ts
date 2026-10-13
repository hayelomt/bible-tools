import { fileURLToPath } from 'node:url';
import type { TranslationSource } from './build.ts';

/**
 * The texts the build downloads (TECH-DESIGN §9). The checksum pins the exact zip: when eBible.org
 * publishes a new one, the download fails until someone checks the changes and updates it here.
 */
export const SOURCES: TranslationSource[] = [
  {
    id: 'WEB',
    name: 'World English Bible',
    licence:
      'Public domain. “World English Bible” is a trademark of eBible.org; changed text must not use the name.',
    url: 'https://ebible.org/Scriptures/eng-web_usfm.zip',
    sha256: '3e2521d1a53656e1371e6701e46ed9ac2634061478def673976d88dad34f0156',
    dir: fileURLToPath(new URL('../source/eng-web/', import.meta.url)),
    notice: 'copr.htm',
  },
];
