import { createContext, use, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Places in the shell that a screen can fill from inside its own tree: the `h1` for a title that
 * comes from data (a lesson, a series), the header's actions (Saved, `⋯`) and the side panel
 * (a lesson's details on a wide laptop). Portals, so the content keeps the screen's state.
 */
type SlotName = 'title' | 'actions' | 'panel';
type Slots = Record<SlotName, HTMLElement | null>;
type SlotRefs = Record<SlotName, (el: HTMLElement | null) => void>;

const SlotsContext = createContext<Slots | null>(null);
const SlotRefsContext = createContext<SlotRefs | null>(null);

export function ShellSlots({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ title: null, actions: null, panel: null });
  // Stable callback refs: a new function each render would detach and reattach the slot.
  const refs = useMemo(() => {
    const ref = (name: SlotName) => (el: HTMLElement | null) =>
      setSlots((s) => (s[name] === el ? s : { ...s, [name]: el }));
    return { title: ref('title'), actions: ref('actions'), panel: ref('panel') };
  }, []);
  return (
    <SlotRefsContext value={refs}>
      <SlotsContext value={slots}>{children}</SlotsContext>
    </SlotRefsContext>
  );
}

/** The ref that makes an element of the shell the named slot. */
export function useSlotRef(name: SlotName) {
  const refs = use(SlotRefsContext);
  if (!refs) throw new Error('useSlotRef needs <ShellSlots>');
  return refs[name];
}

function SlotPortal({ name, children }: { name: SlotName; children: React.ReactNode }) {
  const target = use(SlotsContext)?.[name];
  return target ? createPortal(children, target) : null;
}

/** The screen's title when it comes from data; goes inside the shell's `h1`. */
export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <SlotPortal name="title">{children}</SlotPortal>;
}

/** Controls at the end of the screen's header. */
export function ScreenActions({ children }: { children: React.ReactNode }) {
  return <SlotPortal name="actions">{children}</SlotPortal>;
}

/** A side panel next to the screen's column; the screen decides when to use it. */
export function SidePanel({ children }: { children: React.ReactNode }) {
  return <SlotPortal name="panel">{children}</SlotPortal>;
}
