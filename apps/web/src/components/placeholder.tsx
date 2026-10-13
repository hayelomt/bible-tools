/** A destination that isn't built yet: one muted line, so the layout never changes later. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
