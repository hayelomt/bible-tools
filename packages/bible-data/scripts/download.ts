// Downloads each source zip, checks its pinned checksum and unzips it into source/ (gitignored).
// Does nothing for a source already unzipped from the same checksum. Needs `unzip` on the PATH.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from '../src/sources.ts';

for (const source of SOURCES) {
  const stamp = join(source.dir, '.sha256');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === source.sha256) {
    console.log(`${source.id}: source is up to date`);
    continue;
  }

  console.log(`${source.id}: downloading ${source.url}`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.id}: ${source.url} returned ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(zip).digest('hex');
  if (sha256 !== source.sha256) {
    throw new Error(
      `${source.id}: the download's checksum is ${sha256}, not the pinned ${source.sha256}. ` +
        'eBible.org has probably published a new zip: check what changed, then update the ' +
        'checksum in packages/bible-data/src/sources.ts.',
    );
  }

  rmSync(source.dir, { recursive: true, force: true });
  mkdirSync(source.dir, { recursive: true });
  const file = join(source.dir, 'source.zip');
  writeFileSync(file, zip);
  execFileSync('unzip', ['-q', '-o', file, '-d', source.dir], { stdio: 'inherit' });
  rmSync(file);
  writeFileSync(stamp, sha256);
  console.log(`${source.id}: unzipped into ${source.dir}`);
}
