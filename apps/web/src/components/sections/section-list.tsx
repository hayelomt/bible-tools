import { emptyBody, newId, type SectionBody } from '@lamp/domain';
import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RowNotFoundError } from '@/data/action.ts';
import { removeSection, updateSection } from '@/data/actions/sections.ts';
import { lessonSections } from '@/data/queries.ts';
import { EditingToolbar } from './editing-toolbar.tsx';
import {
  afterPlacement,
  endPlacement,
  indentPlacement,
  outdentPlacement,
  outline,
  type OutlineItem,
  type OutlineRow,
  type Placement,
  replyPlacement,
} from './outline.ts';
import { type FocusRequest, SectionEditor } from './section-editor.tsx';

export interface SectionItem extends OutlineItem {
  body: SectionBody;
  /** False for a draft: shown, but not stored until it has text. */
  stored: boolean;
  /** The stored row's; null for a draft. */
  updatedAt: string | null;
}
export type SectionRow = OutlineRow<SectionItem>;

/** A move shown before it's stored; `storedAt` is the row's `updatedAt` once its write is done. */
interface Move {
  placement: Placement;
  storedAt: string | null;
}

/** What a section row asks of the list. */
export interface SectionListApi {
  lessonId: string;
  /** Runs writes one after another, so a reply is never stored before its section. */
  enqueue: (write: () => Promise<unknown>) => void;
  /** A change is waiting to be stored (typing hasn't settled yet). */
  setDirty: (id: string, dirty: boolean) => void;
  /** Where a draft goes when it's stored: read at that moment, after any Tab or Shift+Tab. */
  placementOf: (id: string) => Placement;
  /** A draft was stored; until the live query has it, moves must update the row. */
  markStored: (id: string) => void;
  register: (id: string, editor: Editor | null) => void;
  setActive: (id: string, active: boolean) => void;
  endSection: (id: string) => void;
  enterEmpty: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  backspaceEmpty: (id: string) => boolean;
  leave: (id: string, direction: 'up' | 'down') => boolean;
  /** An empty draft that lost focus goes away, unless it's the only section. */
  discardIfEmpty: (id: string) => void;
}

interface SectionListProps {
  lessonId: string;
  /** Bumped to put the cursor in the first section (Enter in the title). */
  focusFirst: number;
  onSavingChange: (saving: boolean) => void;
}

/**
 * A lesson's sections (F2, wireframes/lessons.md): each section and reply has its own editor and
 * row. New sections are drafts until they have text, like a new lesson. Tab, Shift+Tab, Enter and
 * Backspace move between sections and change the level, and the toolbar does the same by touch.
 */
export function SectionList({ lessonId, focusFirst, onSavingChange }: SectionListProps) {
  const stored = useLiveQuery(() => lessonSections(lessonId), [lessonId]);
  const [drafts, setDrafts] = useState<OutlineItem[]>([]);
  // Moves and removals show at once, before the live query catches up, so focus stays put.
  const [moves, setMoves] = useState<ReadonlyMap<string, Move>>(new Map());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [writing, setWriting] = useState(0);

  const draftsRef = useRef(drafts);
  const created = useRef(new Set<string>());
  const editors = useRef(new Map<string, Editor>());
  const writes = useRef(Promise.resolve());

  const storedById = useMemo(() => new Map(stored?.map((s) => [s.id, s])), [stored]);

  // The optimistic state goes once the stored rows show it. A move settles only when the row is
  // as new as the move's own write: an older read can show the same place on its way elsewhere
  // (Shift+Tab then Tab), and dropping the move then would make the section jump.
  useEffect(() => {
    if (!stored) return;
    setMoves((current) => {
      const left = [...current].filter(([id, move]) => {
        const row = storedById.get(id);
        return row && (move.storedAt === null || row.updatedAt < move.storedAt);
      });
      return left.length === current.size ? current : new Map(left);
    });
    setRemoved((current) => {
      const left = [...current].filter((id) => storedById.has(id));
      return left.length === current.size ? current : new Set(left);
    });
  }, [stored, storedById, moves]);

  const rows = useMemo(() => {
    if (!stored) return [];
    const items: SectionItem[] = [
      ...stored
        .filter((s) => !removed.has(s.id))
        .map((s) => ({ ...s, ...moves.get(s.id)?.placement, stored: true })),
      ...drafts
        .filter((d) => !storedById.has(d.id))
        .map((d) => ({ ...d, body: emptyBody(), stored: false, updatedAt: null })),
    ];
    return outline(items);
  }, [stored, storedById, drafts, moves, removed]);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });

  const updateDrafts = useCallback((change: (drafts: OutlineItem[]) => OutlineItem[]) => {
    draftsRef.current = change(draftsRef.current);
    setDrafts(draftsRef.current);
  }, []);

  /** A new draft at `placement`, with the cursor in it. */
  const addDraft = useCallback(
    (placement: Placement) => {
      const id = newId();
      updateDrafts((ds) => [...ds, { id, ...placement }]);
      setFocus({ id, at: 'start' });
    },
    [updateDrafts],
  );

  // The lesson always ends with an empty section, ready to type: a new one appears as soon as the
  // last one is stored, so there's no "+ Section" button to find.
  if (stored && !trailingDraft(rows)) {
    const next = { id: newId(), ...endPlacement(rows) };
    draftsRef.current = [...draftsRef.current, next];
    setDrafts(draftsRef.current);
  }

  useEffect(() => {
    if (focusFirst === 0 || !stored) return;
    const first = rowsRef.current[0];
    if (first) setFocus({ id: first.item.id, at: 'start' });
    // Only a new request moves the cursor, not new rows.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirst, stored === undefined]);

  const saving = dirty.size > 0 || writing > 0;
  useEffect(() => onSavingChange(saving), [saving, onSavingChange]);

  const api = useMemo<SectionListApi>(() => {
    const rowOf = (id: string) => rowsRef.current.find((r) => r.item.id === id);
    const isStored = (id: string) => rowOf(id)?.item.stored === true || created.current.has(id);
    const enqueue = (write: () => Promise<unknown>) => {
      setWriting((n) => n + 1);
      writes.current = writes.current
        .then(async () => {
          await write();
        })
        .catch((error: unknown) => {
          // A section (or its lesson) deleted meanwhile has nothing left to save.
          if (error instanceof RowNotFoundError) return;
          // The storage-full toast (states.md) will report this; the text stays on screen.
          console.error('Saving a section failed', error);
        })
        .finally(() => setWriting((n) => n - 1));
    };
    const focusAt = (id: string, at: FocusRequest['at']) => setFocus({ id, at });
    /** Moves a section, keeping the cursor where it was. */
    const moveTo = (id: string, placement: Placement) => {
      if (isStored(id)) {
        const move: Move = { placement, storedAt: null };
        setMoves((m) => new Map(m).set(id, move));
        enqueue(async () => {
          const { updatedAt } = await updateSection(id, placement);
          setMoves((m) =>
            m.get(id) === move ? new Map(m).set(id, { ...move, storedAt: updatedAt }) : m,
          );
        });
      } else {
        updateDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...placement } : d)));
      }
      focusAt(id, 'keep');
    };
    const outdent = (id: string) => {
      const placement = outdentPlacement(rowsRef.current, id);
      if (placement) moveTo(id, placement);
    };

    return {
      lessonId,
      enqueue,
      setDirty: (id, isDirty) =>
        setDirtyIds((ids) => {
          if (ids.has(id) === isDirty) return ids;
          const next = new Set(ids);
          if (isDirty) next.add(id);
          else next.delete(id);
          return next;
        }),
      placementOf: (id) => {
        const draft = draftsRef.current.find((d) => d.id === id);
        const item = draft ?? rowOf(id)?.item;
        return { parentId: item?.parentId ?? null, orderKey: item?.orderKey ?? '' };
      },
      markStored: (id) => created.current.add(id),
      register: (id, editor) => {
        if (editor) editors.current.set(id, editor);
        else editors.current.delete(id);
      },
      setActive: (id, active) =>
        setActiveId((current) => (active ? id : current === id ? null : current)),
      endSection: (id) => {
        const all = rowsRef.current;
        const row = rowOf(id);
        const next = all[all.findIndex((r) => r.item.id === id) + 1];
        // The empty section waiting below is the next one; no need for another.
        if (
          row &&
          next &&
          !next.item.stored &&
          next.parent === row.parent &&
          editors.current.get(next.item.id)?.isEmpty !== false
        ) {
          focusAt(next.item.id, 'start');
        } else {
          addDraft(afterPlacement(all, id));
        }
      },
      enterEmpty: (id) => {
        // Enter in an empty reply moves it out, as in a list; in an empty section it does nothing.
        if (rowOf(id)?.level === 1) outdent(id);
      },
      indent: (id) => {
        const placement = indentPlacement(rowsRef.current, id);
        if (placement) moveTo(id, placement);
      },
      outdent,
      backspaceEmpty: (id) => {
        const all = rowsRef.current;
        const index = all.findIndex((r) => r.item.id === id);
        const row = all[index];
        if (!row || row.replies > 0 || all.length === 1) return false;
        const previous = all[index - 1];
        // The empty section at the end stays; Backspace there only goes up.
        if (trailingDraft(all)?.item.id === id) {
          if (previous) focusAt(previous.item.id, 'end');
          return true;
        }
        if (previous) focusAt(previous.item.id, 'end');
        else focusAt(all[index + 1]!.item.id, 'start');
        if (isStored(id)) {
          setRemoved((r) => new Set(r).add(id));
          enqueue(() => removeSection(id));
        } else {
          updateDrafts((ds) => ds.filter((d) => d.id !== id));
        }
        return true;
      },
      leave: (id, direction) => {
        const all = rowsRef.current;
        const index = all.findIndex((r) => r.item.id === id);
        const next = all[direction === 'up' ? index - 1 : index + 1];
        if (!next) return false;
        focusAt(next.item.id, direction === 'up' ? 'end' : 'start');
        return true;
      },
      discardIfEmpty: (id) => {
        if (isStored(id) || trailingDraft(rowsRef.current)?.item.id === id) return;
        if (editors.current.get(id)?.isEmpty === false) return;
        updateDrafts((ds) => ds.filter((d) => d.id !== id));
      },
    };
  }, [lessonId, addDraft, updateDrafts]);

  if (!stored) return null;
  const activeRow = rows.find((r) => r.item.id === activeId);
  const activeEditor = activeId ? editors.current.get(activeId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <SectionEditor
            key={row.item.id}
            row={row}
            api={api}
            focus={focus?.id === row.item.id ? focus : undefined}
          />
        ))}
      </div>
      {activeRow && activeEditor && (
        // On a phone the toolbar is fixed over the page; this keeps the last lines clear of it.
        <div aria-hidden className="h-12 lg:hidden" />
      )}
      {activeRow && activeEditor && (
        <EditingToolbar
          editor={activeEditor}
          stored={activeRow.item.stored}
          canIndent={indentPlacement(rows, activeRow.item.id) !== null}
          canOutdent={activeRow.level === 1}
          onIndent={() => api.indent(activeRow.item.id)}
          onOutdent={() => api.outdent(activeRow.item.id)}
          onReply={() => addDraft(replyPlacement(rows, activeRow.item.id))}
        />
      )}
    </div>
  );
}

/** The empty section at the end of the lesson: the last row, if it's a top-level draft. */
function trailingDraft(rows: readonly SectionRow[]): SectionRow | undefined {
  const last = rows.at(-1);
  return last && !last.item.stored && last.level === 0 ? last : undefined;
}
