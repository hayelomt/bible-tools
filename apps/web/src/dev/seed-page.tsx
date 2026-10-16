import { Button } from '@lamp/ui/components/button';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { writesSettled } from '@/data/action.ts';
import { db } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { count } from '@/lib/labels.ts';
import { clearDevice, seedBulk, seedDemo } from './seed.ts';

type Job = 'demo' | 'bulk' | 'clear';

const JOBS: Record<Job, { title: string; description: string; confirm: string }> = {
  demo: {
    title: 'Replace everything with the demo month?',
    description:
      'Every lesson on this device is deleted, then two series and ten lessons from the last five weeks are added: notes with replies and verse chips, tags, takeaways, and open, parked and answered questions.',
    confirm: 'Clear and seed',
  },
  bulk: {
    title: 'Add 5,000 sections?',
    description:
      'Adds a “Bulk” series of 50 lessons with 100 generated sections each, for trying search and long lists. What’s here now stays.',
    confirm: 'Add 5,000 sections',
  },
  clear: {
    title: 'Clear this device?',
    description:
      'Every lesson, series, tag and question on this device is deleted, as on a first run. Your settings stay.',
    confirm: 'Clear everything',
  },
};

/**
 * Dev data (`/dev/seed`, dev builds only): clear this browser's database, seed the demo month, or
 * add 5,000 sections. The page reloads after each, so the search index is built again.
 */
export function SeedPage() {
  const totals = useLiveQuery(async () => ({
    lessons: await db.lesson.filter((l) => l.deletedAt === null).count(),
    sections: await db.section.filter((s) => s.deletedAt === null).count(),
  }));
  const [asking, setAsking] = useState<Job | null>(null);
  // The last job asked about stays in the dialog while it closes.
  const [shown, setShown] = useState<Job>('demo');
  if (asking && asking !== shown) setShown(asking);
  const [running, setRunning] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(job: Job) {
    setRunning(JOBS[job].confirm);
    setFailed(null);
    const started = performance.now();
    try {
      await writesSettled();
      await ensureDevice(db, { colorMode: 'system' });
      if (job !== 'bulk') {
        await clearDevice(db);
        localStorage.removeItem('lamp.recentSearches');
      }
      if (job === 'demo') await seedDemo(db);
      if (job === 'bulk') await seedBulk(db);
      console.info(`/dev/seed: ${job} took ${Math.round(performance.now() - started)} ms`);
      location.assign('/');
    } catch (error) {
      console.error(error);
      setFailed(error instanceof Error ? error.message : String(error));
      setRunning(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dev data</h1>
        <p className="text-muted-foreground">
          This browser’s database, written through the app’s own actions. Only in dev builds.
        </p>
        {/* Always there, so the buttons don't move as the counts load. */}
        <p className="min-h-5 text-sm text-muted-foreground">
          {totals &&
            `Now: ${count(totals.lessons, 'lesson')}, ${count(totals.sections, 'section')}.`}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button disabled={!!running} onClick={() => setAsking('demo')}>
          Clear and seed the demo month
        </Button>
        <Button variant="outline" disabled={!!running} onClick={() => setAsking('bulk')}>
          Add 5,000 sections
        </Button>
        <Button variant="destructive" disabled={!!running} onClick={() => setAsking('clear')}>
          Clear everything
        </Button>
      </div>
      {running && <output className="text-sm">{running}… the app opens when it’s done.</output>}
      {failed && <p className="text-sm text-destructive">Failed: {failed}</p>}
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        title={JOBS[shown].title}
        description={JOBS[shown].description}
        confirmLabel={JOBS[shown].confirm}
        onConfirm={() => {
          setAsking(null);
          void run(shown);
        }}
      />
    </main>
  );
}
