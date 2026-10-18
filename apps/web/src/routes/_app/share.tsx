import { createFileRoute } from '@tanstack/react-router';
import { ShareLanding } from '@/components/share/share-landing.tsx';

export interface ShareSearch {
  /** The Web Share Target's fields (F18): the app's title, the text and the address shared. */
  title?: string;
  text?: string;
  url?: string;
  /** Opened by "Add from clipboard" (M9-07): the text is a paste, not a share. */
  from?: 'clipboard';
}

const field = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/**
 * Where a share lands (F18, M9-06, wireframes/interop.md "Share landing"): the manifest's
 * `share_target` opens `/share?title=…&text=…&url=…`, a GET, so the precached shell opens it
 * offline. Nothing is added until a button is tapped.
 */
export const Route = createFileRoute('/_app/share')({
  staticData: { back: '/inbox' },
  validateSearch: (search: Record<string, unknown>): ShareSearch => ({
    title: field(search.title),
    text: field(search.text),
    url: field(search.url),
    from: search.from === 'clipboard' ? 'clipboard' : undefined,
  }),
  component: ShareScreen,
});

function ShareScreen() {
  const search = Route.useSearch();
  // A new share while this screen is open starts over.
  return <ShareLanding key={JSON.stringify(search)} {...search} />;
}
