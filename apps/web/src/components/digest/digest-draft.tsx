import { type Quarter, quarterLabel } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import type { Editor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ellipsis } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ExportDialog } from '@/components/export-dialog.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { discardDraft, keepDigest, restoreDraft, saveDraftTitle } from '@/data/actions/digest.ts';
import { db, type DigestDraft } from '@/data/db.ts';
import { exportDigestDraft } from '@/export/load.ts';
import { runWrite } from '@/lib/run-write.ts';
import { type DraftNavigation, DraftSection } from './draft-section.tsx';

/**
 * The digest draft (F32, M12-08, wireframes/reflection.md "Quarterly digest"): lesson-like,
 * saved as it's typed, but not a lesson until "Keep as a lesson". Its `⋯` has Export… and
 * Discard draft.
 */
export function DigestDraftScreen({ quarter }: { quarter: Quarter }) {
  const readFrom = useRef<number | null>(null);
  const draft = useLiveQuery(async () => {
    readFrom.current ??= performance.now();
    return (await db.digestDraft.get(quarter)) ?? null;
  }, [quarter]);
  // The draft's time, from reading IndexedDB to its sections drawn (`digest.spec.ts`).
  const marked = useRef(false);
  useEffect(() => {
    if (!draft || marked.current) return;
    marked.current = true;
    performance.mark('lamp:digest-draft-ready', {
      detail: { ms: performance.now() - (readFrom.current ?? 0) },
    });
  }, [draft]);
  if (draft === undefined) return <ScreenSkeleton />;
  if (draft === null) {
    return (
      <>
        <ScreenTitle>Digest draft</ScreenTitle>
        <NotFoundScreen>
          There’s no {quarterLabel(quarter)} digest draft on this device. It may have been kept as a
          lesson, discarded, or drafted on another device.
        </NotFoundScreen>
      </>
    );
  }
  return <Draft draft={draft} />;
}

function Draft({ draft }: { draft: DigestDraft }) {
  const navigate = useNavigate();
  const { quarter } = draft;
  const [title, setTitle] = useState(draft.title);
  const [exporting, setExporting] = useState(false);
  const editors = useRef(new Map<string, Editor>());
  // The sections as the draft opened: each editor keeps its own text from then on.
  const [sections] = useState(draft.sections);
  const nav = useMemo<DraftNavigation>(
    () => ({
      register: (id, editor) => {
        if (editor) editors.current.set(id, editor);
        else editors.current.delete(id);
      },
      move: (id, direction) => {
        const i = sections.findIndex((s) => s.id === id) + (direction === 'down' ? 1 : -1);
        const next = sections[i] && editors.current.get(sections[i].id);
        if (!next) return false;
        next.commands.focus(direction === 'down' ? 'start' : 'end');
        return true;
      },
    }),
    [sections],
  );

  function discard() {
    runWrite(
      discardDraft(quarter).then((gone) => {
        if (!gone) return;
        void navigate({ to: '/' });
        toast('Digest draft discarded.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(restoreDraft(gone), 'the digest draft'),
          },
        });
      }),
      'the digest draft',
    );
  }

  function keep() {
    runWrite(
      keepDigest(quarter).then((lesson) => {
        if (lesson) void navigate({ to: '/lessons/$lessonId', params: { lessonId: lesson.id } });
      }),
      'the digest',
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>Digest draft</ScreenTitle>
      <ScreenActions>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Digest draft actions" />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setExporting(true)}>Export…</DropdownMenuItem>
            <DropdownMenuItem onClick={discard}>Discard draft</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ScreenActions>
      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        title={`Export “${title}”`}
        description="Markdown keeps the notes, verses and links."
        load={() => exportDigestDraft(quarter)}
      />

      <header className="flex flex-col gap-1">
        <input
          aria-label="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            runWrite(saveDraftTitle(quarter, e.target.value), 'the digest draft');
          }}
          className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground"
          placeholder="Title"
        />
        <p className="text-sm text-muted-foreground">Draft · not in your lessons yet</p>
      </header>

      <div className="flex flex-col gap-4 border-l-2 pl-4">
        {sections.map((section) => (
          <DraftSection
            key={section.id}
            quarter={quarter}
            id={section.id}
            body={section.body}
            nav={nav}
          />
        ))}
      </div>

      <Button size="lg" className="self-start" onClick={keep}>
        Keep as a lesson
      </Button>
    </div>
  );
}
