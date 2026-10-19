import { downloadBible } from './bible-download.ts';
import { loadOpenInTable } from '@/open-in/table.ts';
import { startSearchIndex } from '@/search/client.ts';
import { syncEngine } from '@/sync/sync.ts';
import { followSettings, onActiveTranslation } from './translation.ts';

/** The download waits this long after start, so the first screen has the connection first. */
const DOWNLOAD_DELAY_MS = 2000;

let started = false;

/**
 * Work the app does on its own once the device is set up (M2-11): the active translation downloads
 * in the background (again whenever the user picks another). The search index (M4-05) is built in
 * its worker, and sync (M3-09) starts its triggers. The newest "Open in…" table (M9-10) is fetched.
 */
export function startBackgroundWork() {
  if (started) return;
  started = true;
  startSearchIndex();
  syncEngine.start();
  void loadOpenInTable();
  void followSettings().then(() => {
    let delay = DOWNLOAD_DELAY_MS;
    onActiveTranslation((translation) => {
      setTimeout(() => void downloadBible(translation), delay);
      delay = 0;
    });
  });
}
