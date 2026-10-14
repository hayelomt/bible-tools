import { type ReactNode, createContext, use } from 'react';

const SelectionBarOpen = createContext<(open: boolean) => void>(() => {});

/** Tells the shell that the reader is covering the bottom navigation with its selection bar. */
export function SelectionBarOpenProvider({
  setOpen,
  children,
}: {
  setOpen: (open: boolean) => void;
  children: ReactNode;
}) {
  return <SelectionBarOpen value={setOpen}>{children}</SelectionBarOpen>;
}

export function useSetSelectionBarOpen(): (open: boolean) => void {
  return use(SelectionBarOpen);
}
