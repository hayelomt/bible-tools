import { buttonVariants } from '@lamp/ui/components/button';
import { Textarea } from '@lamp/ui/components/textarea';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';

/**
 * A note under the selected verses (wireframes/reader.md "Selected verses"). It is stored as it's
 * typed; Done closes it.
 */
export function HighlightNote({
  label,
  initial,
  onSave,
  onClose,
  flushRef,
}: {
  label: string;
  initial: string;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
  /** The reader flushes a note still being typed before it closes the field or changes verse. */
  flushRef: RefObject<(() => Promise<void>) | null>;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  const save = useRef(onSave);
  const latest = useRef(text);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const field = useRef<HTMLTextAreaElement>(null);

  function flush(): Promise<void> {
    if (!dirty.current) return Promise.resolve();
    dirty.current = false;
    clearTimeout(timer.current);
    return save.current(latest.current);
  }

  useEffect(() => {
    save.current = onSave;
    flushRef.current = flush;
  });

  useEffect(() => {
    field.current?.focus();
    return () => {
      const saveNow = flushRef.current;
      flushRef.current = null;
      void saveNow?.();
    };
  }, [flushRef]);

  function change(value: string) {
    latest.current = value;
    dirty.current = true;
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }

  function close() {
    void flush().then(onClose);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <label htmlFor={id} className="text-sm font-medium">
        Note on {label}
      </label>
      <Textarea
        ref={field}
        id={id}
        value={text}
        maxLength={5000}
        rows={3}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={close}
          data-slot="button"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'pointer-coarse:min-h-11',
          })}
        >
          Done
        </button>
      </div>
    </div>
  );
}
