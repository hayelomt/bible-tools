import { createFileRoute } from '@tanstack/react-router';
import { CommentaryScreen, type CommentarySearch } from '@/components/compile/commentary.tsx';

export const Route = createFileRoute('/_app/compile/$passage')({
  staticData: { back: '/search' },
  validateSearch: (search: Record<string, unknown>): CommentarySearch => ({
    scope: search.scope === 'chapter' || search.scope === 'book' ? search.scope : undefined,
  }),
  component: CompileRoute,
});

/** The compile view (F22), called Commentary in the app; the address is the passage's slug. */
function CompileRoute() {
  const { passage } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CommentaryScreen
      slug={passage}
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
