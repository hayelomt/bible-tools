// Builds dist/: one JSON file per book and translation, named by content hash, and manifest.json.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTranslation, type Manifest } from '../src/build.ts';
import { SOURCES } from '../src/sources.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

rmSync(dist, { recursive: true, force: true });
const manifest: Manifest = { version: 1, translations: {} };
for (const source of SOURCES) {
  const { manifest: translation, files } = buildTranslation(source);
  for (const [path, content] of files) {
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    writeFileSync(join(dist, path), content);
  }
  manifest.translations[source.id] = translation;
  console.log(
    `${source.id}: ${Object.keys(translation.books).length} books, ${(translation.bytes / 1e6).toFixed(2)} MB`,
  );
}
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
