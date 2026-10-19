import { useId } from 'react';

/** The privacy note's and the guide's text: a readable column of headed sections (M13-05). */
export function DocPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-prose flex-col gap-8 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_li]:ml-5 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1">
      {children}
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Where to write about privacy: `privacy@` this server's host, as mail comes from `noreply@` it. */
export const privacyAddress = (): string => `privacy@${location.hostname}`;
