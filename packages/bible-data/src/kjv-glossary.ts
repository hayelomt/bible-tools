// The KJV glossary data, apart from the matcher so the web app can load it only when it is needed.
import data from '../data/kjv-glossary.json' with { type: 'json' };
import type { GlossaryData } from './glossary.ts';

export const KJV_GLOSSARY = data as GlossaryData;
