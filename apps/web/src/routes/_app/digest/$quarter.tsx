import type { Quarter } from '@lamp/domain';
import { createFileRoute } from '@tanstack/react-router';
import { DigestDraftScreen } from '@/components/digest/digest-draft.tsx';
import { NotFoundScreen } from '@/components/error-screen.tsx';

export const Route = createFileRoute('/_app/digest/$quarter')({
  staticData: { back: '/' },
  component: DigestRoute,
});

/** A quarter's digest draft (F32, M12-08), from the card on the Lessons home. */
function DigestRoute() {
  const { quarter } = Route.useParams();
  if (!/^\d{4}-Q[1-4]$/.test(quarter)) return <NotFoundScreen />;
  return <DigestDraftScreen key={quarter} quarter={quarter as Quarter} />;
}
