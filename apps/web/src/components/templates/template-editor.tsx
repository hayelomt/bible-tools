import { MAX_TEMPLATE_NAME, MAX_TITLE, type TemplateSection } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { cn } from 'cn';
import { Ellipsis, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  blankRow,
  canIndent,
  canMove,
  indent,
  move,
  outdent,
  problemWith,
  remove,
  rowsOf,
  structureOf,
  type TemplateRow,
} from './rows.ts';

interface TemplateEditorProps {
  name: string;
  structure: readonly TemplateSection[];
  /** "Create template" or "Save". */
  saveLabel: string;
  onSave: (fields: { name: string; structure: TemplateSection[] }) => Promise<void>;
  onCancel: () => void;
}

/**
 * A template's name and its section names (wireframes/thinking.md "Settings → Templates"). Tab and
 * Shift+Tab nest a name under the section above and back, Enter adds a name after, Backspace in an
 * empty one removes it; each name's `⋯` does the same by touch, with Move up and Move down. Saved
 * as a whole, so a half-made template never reaches the picker.
 */
export function TemplateEditor({
  name,
  structure,
  saveLabel,
  onSave,
  onCancel,
}: TemplateEditorProps) {
  const [title, setTitle] = useState(name);
  const [rows, setRows] = useState<TemplateRow[]>(() =>
    structure.length > 0 ? rowsOf(structure) : [blankRow()],
  );
  const [problem, setProblem] = useState<{ name?: string; rows?: string }>({});
  // A name to put the cursor in once the list has changed; a count, so each request is a new one.
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const ids = { name: useId(), nameError: useId(), list: useId(), rowsError: useId() };

  useEffect(() => {
    if (focus) inputs.current.get(focus.id)?.focus();
  }, [focus]);

  const change = (next: TemplateRow[], focusId?: string) => {
    setRows(next);
    setProblem((p) => ({ ...p, rows: undefined }));
    if (focusId) setFocus((f) => ({ id: focusId, seq: (f?.seq ?? 0) + 1 }));
  };
  const addAfter = (index: number) => {
    const row = blankRow(rows[index]?.level ?? 0);
    change([...rows.slice(0, index + 1), row, ...rows.slice(index + 1)], row.id);
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const missing = {
      name: title.trim() ? undefined : 'A template needs a name.',
      rows: problemWith(rows) ?? undefined,
    };
    if (missing.name || missing.rows) return setProblem(missing);
    await onSave({ name: title.trim(), structure: structureOf(rows) });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    const row = rows[index]!;
    if (event.key === 'Tab' && !event.shiftKey && canIndent(rows, index)) {
      event.preventDefault();
      change(indent(rows, index));
    } else if (event.key === 'Tab' && event.shiftKey && row.level === 1) {
      event.preventDefault();
      change(outdent(rows, index));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      addAfter(index);
    } else if (event.key === 'Backspace' && row.title === '' && rows.length > 1) {
      event.preventDefault();
      change(remove(rows, index), rows[Math.max(0, index - 1)]?.id);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={title}
          maxLength={MAX_TEMPLATE_NAME}
          required
          aria-invalid={!!problem.name || undefined}
          aria-describedby={problem.name ? ids.nameError : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblem((p) => ({ ...p, name: undefined }));
          }}
        />
        {problem.name && (
          <p id={ids.nameError} className="text-sm text-destructive">
            {problem.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 id={ids.list} className="text-sm font-medium">
          Sections
        </h2>
        <p className="text-sm text-muted-foreground">
          Tab makes a name a child of the section above; Shift+Tab moves it back.
        </p>
        <ul aria-labelledby={ids.list} className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.id} className={cn('flex items-center gap-1', row.level === 1 && 'pl-8')}>
              <Input
                ref={(element) => {
                  if (element) inputs.current.set(row.id, element);
                  else inputs.current.delete(row.id);
                }}
                aria-label={`${row.level === 1 ? 'Child of the section above' : 'Section'} ${index + 1}`}
                value={row.title}
                maxLength={MAX_TITLE}
                placeholder={row.level === 1 ? 'Child section' : 'Section'}
                aria-invalid={!!problem.rows || undefined}
                aria-describedby={problem.rows ? ids.rowsError : undefined}
                onChange={(event) =>
                  change(
                    rows.map((r) => (r.id === row.id ? { ...r, title: event.target.value } : r)),
                  )
                }
                onKeyDown={(event) => onKeyDown(event, index)}
              />
              <RowMenu
                label={row.title.trim() || `section ${index + 1}`}
                level={row.level}
                canUp={canMove(rows, index, -1)}
                canDown={canMove(rows, index, 1)}
                canIndent={canIndent(rows, index)}
                canRemove={rows.length > 1}
                onMove={(step) => change(move(rows, index, step), row.id)}
                onIndent={() => change(indent(rows, index), row.id)}
                onOutdent={() => change(outdent(rows, index), row.id)}
                onRemove={() => change(remove(rows, index))}
              />
            </li>
          ))}
        </ul>
        {problem.rows && (
          <p id={ids.rowsError} className="text-sm text-destructive">
            {problem.rows}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => addAfter(rows.length - 1)}
        >
          <Plus /> Add a section
        </Button>
      </div>

      <div className="flex gap-2">
        <Button type="submit">{saveLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface RowMenuProps {
  label: string;
  level: 0 | 1;
  canUp: boolean;
  canDown: boolean;
  canIndent: boolean;
  canRemove: boolean;
  onMove: (step: -1 | 1) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemove: () => void;
}

/** A name's `⋯`: the keyboard's moves, by touch. */
function RowMenu(props: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Actions for ${props.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="shrink-0 text-muted-foreground pointer-coarse:size-11"
        onClick={() => setOpen(true)}
      >
        <Ellipsis />
      </Button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuContent anchor={anchor} align="end" className="w-48">
          <DropdownMenuItem disabled={!props.canUp} onClick={() => props.onMove(-1)}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!props.canDown} onClick={() => props.onMove(1)}>
            Move down
          </DropdownMenuItem>
          {props.level === 1 ? (
            <DropdownMenuItem onClick={props.onOutdent}>Move out</DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!props.canIndent} onClick={props.onIndent}>
              Make a child
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!props.canRemove}
            onClick={props.onRemove}
          >
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
