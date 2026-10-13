import { useLiveQuery } from 'dexie-react-hooks';
import { useId } from 'react';
import { tagsOf } from '@/data/queries.ts';
import { TagInput } from './tag-input.tsx';
import { TagPageLink } from './tag-page-link.tsx';

interface SectionTagsProps {
  sectionId: string;
  /** The tag input is open (the section menu's Tags). */
  editing: boolean;
  /** The input closes: by Escape (`toHandle`, focus goes back to the section's ⠿) or by leaving it. */
  onDone: (toHandle: boolean) => void;
}

/**
 * A section's tags, under its text (wireframes/lessons.md): `#grace` as links to their pages, or the tag
 * input while they're being edited.
 */
export function SectionTags({ sectionId, editing, onDone }: SectionTagsProps) {
  const applied = useLiveQuery(() => tagsOf({ kind: 'section', id: sectionId }), [sectionId]);
  const inputId = useId();

  if (editing) {
    return (
      <div
        className="mt-2"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onDone(false);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Section tags
        </label>
        <TagInput
          id={inputId}
          target={{ kind: 'section', id: sectionId }}
          focusOnMount
          onEscape={() => onDone(true)}
        />
      </div>
    );
  }
  if (!applied?.length) return null;
  return (
    <ul
      aria-label="Tags"
      className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm break-all text-muted-foreground"
    >
      {applied.map(({ tag, link }) => (
        <li key={link.id}>
          <TagPageLink tag={tag} />
        </li>
      ))}
    </ul>
  );
}
