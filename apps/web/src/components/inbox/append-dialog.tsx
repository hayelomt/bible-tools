import { toPlainText } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Choice, LessonPicker } from '@/components/reader/add-to-lesson.tsx';
import { lessonById, lessonSections, readingOrder } from '@/data/queries.ts';

interface AppendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAppend: (sectionId: string) => void;
}

/**
 * "Append to a section" (wireframes/interop.md): the lesson, as in Send to lesson, then its
 * sections by their first line. The item goes at the end of the one chosen.
 */
export function AppendDialog({ open, onOpenChange, onAppend }: AppendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <AppendSteps onAppend={onAppend} />}</DialogContent>
    </Dialog>
  );
}

function AppendSteps({ onAppend }: Pick<AppendDialogProps, 'onAppend'>) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  if (!lessonId) {
    return (
      <LessonPicker
        title="Append to a section"
        description="First the lesson, then the section the item goes at the end of."
        newLesson={null}
        submit="Next"
        onPick={(choice) => choice !== 'new' && setLessonId(choice.lessonId)}
      />
    );
  }
  return <SectionStep lessonId={lessonId} onBack={() => setLessonId(null)} onAppend={onAppend} />;
}

function SectionStep({
  lessonId,
  onBack,
  onAppend,
}: {
  lessonId: string;
  onBack: () => void;
  onAppend: (sectionId: string) => void;
}) {
  const data = useLiveQuery(async () => {
    const [lesson, sections] = await Promise.all([lessonById(lessonId), lessonSections(lessonId)]);
    return { lesson, sections: readingOrder(sections, sections) };
  }, [lessonId]);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!data) return null;
  const { lesson, sections } = data;
  const choice = chosen ?? sections[0]?.id ?? null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) onAppend(choice);
      }}
    >
      <DialogHeader>
        <DialogTitle>Append to a section</DialogTitle>
        <DialogDescription>{lesson?.title}</DialogDescription>
      </DialogHeader>
      <fieldset className="flex max-h-[50svh] min-w-0 flex-col gap-1 overflow-y-auto border-0 p-0">
        <legend className="sr-only">Section</legend>
        {sections.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">This lesson has no sections yet.</p>
        )}
        {sections.map((section) => (
          <Choice
            key={section.id}
            name="section"
            value={section.id}
            checked={choice === section.id}
            onChoose={setChosen}
          >
            <span className={section.parentId ? 'pl-4' : undefined}>
              {firstLine(toPlainText(section.body))}
            </span>
          </Choice>
        ))}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={!choice}>
          Append
        </Button>
      </DialogFooter>
    </form>
  );
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.trim() || 'Empty section';
