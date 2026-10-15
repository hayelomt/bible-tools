import { useDownloadStatuses } from '@/data/bible-download.ts';
import { formatBytes, useStorageUse } from '@/data/storage.ts';

/** What Lamp stores on this device and whether the browser keeps it, in settings. */
export function StorageStatus() {
  // Measured again as a Bible download moves on, or one is removed.
  return <StorageLine key={useDownloadStatuses()} />;
}

function StorageLine() {
  const use = useStorageUse();
  if (!use) return null;
  return (
    <p className="text-sm">
      {formatBytes(use.usage)} used ·{' '}
      {use.persisted
        ? 'kept by the browser'
        : 'the browser may clear it if the device runs low on space'}
    </p>
  );
}
