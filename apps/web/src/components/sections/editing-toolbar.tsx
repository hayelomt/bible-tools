import { Button } from '@lamp/ui/components/button';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Reply,
  TextQuote,
} from 'lucide-react';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';

interface EditingToolbarProps {
  editor: Editor;
  /** The section is stored, so a reply can hang under it. */
  stored: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onReply: () => void;
}

/**
 * The editing toolbar for the section being typed in (wireframes/lessons.md): B, I, lists, quote,
 * Reply, ⇤ and ⇥. On a phone it sits on top of the on-screen keyboard, where the bottom bar was;
 * on a laptop it stays at the bottom of the column. Its buttons don't take focus from the editor.
 * ⇤ and ⇥ do what Shift+Tab and Tab do: indent a list item inside a list, else change the level.
 */
export function EditingToolbar({
  editor,
  stored,
  canIndent,
  canOutdent,
  onIndent,
  onOutdent,
  onReply,
}: EditingToolbarProps) {
  const keyboard = useKeyboardInset();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      inList: e.isActive('listItem'),
      canSink: e.can().sinkListItem('listItem'),
      canLift: e.can().liftListItem('listItem'),
      empty: e.isEmpty,
    }),
  });
  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    command(editor.chain().focus()).run();

  return (
    <div
      role="toolbar"
      aria-label="Editing"
      // Under the bottom bar's height when the keyboard is closed, on the keyboard when it's open.
      style={{
        bottom: keyboard > 0 ? keyboard : undefined,
      }}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex justify-between gap-1 overflow-x-auto border-t bg-background px-2 py-1 lg:sticky lg:bottom-4 lg:justify-start lg:rounded-xl lg:border lg:shadow-sm"
      // Pressing a button keeps the cursor in the editor (and the phone's keyboard open).
      onPointerDown={(event) => event.preventDefault()}
    >
      <Tool
        icon={Bold}
        label="Bold"
        pressed={state.bold}
        onClick={() => run((c) => c.toggleBold())}
      />
      <Tool
        icon={Italic}
        label="Italic"
        pressed={state.italic}
        onClick={() => run((c) => c.toggleItalic())}
      />
      <Tool
        icon={List}
        label="Bulleted list"
        pressed={state.bulletList}
        onClick={() => run((c) => c.toggleBulletList())}
      />
      <Tool
        icon={ListOrdered}
        label="Numbered list"
        pressed={state.orderedList}
        onClick={() => run((c) => c.toggleOrderedList())}
      />
      <Tool
        icon={TextQuote}
        label="Quote"
        pressed={state.blockquote}
        onClick={() => run((c) => c.toggleBlockquote())}
      />
      <Tool icon={Reply} label="Reply" disabled={!stored && state.empty} onClick={onReply} />
      <Tool
        icon={IndentDecrease}
        label={state.inList ? 'Outdent list item' : 'Move out'}
        disabled={state.inList ? !state.canLift : !canOutdent}
        onClick={() => (state.inList ? run((c) => c.liftListItem('listItem')) : onOutdent())}
      />
      <Tool
        icon={IndentIncrease}
        label={state.inList ? 'Indent list item' : 'Make a reply'}
        disabled={state.inList ? !state.canSink : !canIndent}
        onClick={() => (state.inList ? run((c) => c.sinkListItem('listItem')) : onIndent())}
      />
    </div>
  );
}

interface ToolProps {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function Tool({ icon: Icon, label, pressed, disabled, onClick }: ToolProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keyboard users have Tab, Ctrl+B and the rest in the editor; the toolbar is for touch and mouse.
      tabIndex={-1}
      className="aria-pressed:bg-muted aria-pressed:text-foreground"
      onClick={onClick}
    >
      <Icon aria-hidden />
    </Button>
  );
}
