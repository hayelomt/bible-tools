import { createFileRoute } from '@tanstack/react-router';
import { TagThemeScreen } from '@/components/themes/tag-theme.tsx';
import { validateThemeSearch } from '@/components/themes/theme-map.tsx';

export const Route = createFileRoute('/_app/themes/$tagId')({
  staticData: { back: '/themes' },
  validateSearch: validateThemeSearch,
  component: TagThemeRoute,
});

/** A tag's row of the theme map as a list: its months or its books, with counts. */
function TagThemeRoute() {
  const { tagId } = Route.useParams();
  const { view = 'month' } = Route.useSearch();
  return <TagThemeScreen tagId={tagId} view={view} />;
}
