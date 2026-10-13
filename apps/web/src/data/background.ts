import { onBookArrived } from './bible.ts';
import { downloadBible } from './bible-download.ts';
import { startSearchIndex } from '@/search/client.ts';
import { fillStoredSnapshotsSoon } from './snapshots.ts';

/** The download waits this long after start, so the first screen has the connection first. */
const DOWNLOAD_DELAY_MS = 2000;

let started = false;

/**
 * Work the app does on its own once the device is set up (M2-11): the WEB text downloads in the
 * background, and stored chips waiting for their text get it as their book arrives. The search
 * index (M4-05) is built in its worker.
 */
export function startBackgroundWork() {
  if (started) return;
  started = true;
  startSearchIndex();
  onBookArrived(() => fillStoredSnapshotsSoon());
  fillStoredSnapshotsSoon();
  setTimeout(() => void downloadBible(), DOWNLOAD_DELAY_MS);
}
