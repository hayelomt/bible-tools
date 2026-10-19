import { createFileRoute } from '@tanstack/react-router';
import { ThemeMapScreen, validateThemeSearch } from '@/components/themes/theme-map.tsx';

export const Route = createFileRoute('/_app/themes/')({
  staticData: { back: '/review' },
  validateSearch: validateThemeSearch,
  component: ThemeMapRoute,
});

/** The theme map (F31), from the foot of Review and a tag page's `⋯`. */
function ThemeMapRoute() {
  const { view = 'month' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ThemeMapScreen
      view={view}
      onView={(next) =>
        void navigate({ search: next === 'book' ? { view: 'book' } : {}, replace: true })
      }
    />
  );
}
