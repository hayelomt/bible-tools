import { fileURLToPath } from 'node:url';
import type { TranslationSource } from './build.ts';

/** The texts the build ships (TECH-DESIGN §9), from the JSON files in `data/`. */
export const SOURCES: TranslationSource[] = [
  {
    id: 'BSB',
    name: 'Berean Standard Bible',
    licence: 'Public domain: the Berean Standard Bible was dedicated to the public domain in 2023.',
    file: fileURLToPath(new URL('../data/bsb.json', import.meta.url)),
    // Left out of the BSB, and of the source's arrays (see `readSource`).
    omitted: [
      'MAT 17:21',
      'MAT 18:11',
      'MAT 23:14',
      'MRK 7:16',
      'MRK 9:44',
      'MRK 9:46',
      'MRK 11:26',
      'MRK 15:28',
      'LUK 17:36',
      'LUK 23:17',
      'JHN 5:4',
      'ACT 8:37',
      'ACT 15:34',
      'ACT 24:7',
      'ACT 28:29',
      'ROM 16:24',
    ],
  },
  {
    id: 'KJV',
    name: 'King James Version',
    licence:
      'Public domain, except in the United Kingdom, where the rights are vested in the Crown.',
    file: fileURLToPath(new URL('../data/kjv.json', import.meta.url)),
  },
];
