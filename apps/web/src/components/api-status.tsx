import { Button } from '@lamp/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/lib/api.ts';

/** Shows whether the API (and its database) answers, through the `/api` proxy. */
export function ApiStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  let text = 'Checking the server…';
  if (health.isError) text = 'Server unreachable';
  else if (health.data) text = `Server ok · v${health.data.version}`;

  return (
    <div className="flex items-center gap-3">
      <output className="text-sm">{text}</output>
      <Button
        variant="outline"
        size="sm"
        disabled={health.isFetching}
        onClick={() => void health.refetch()}
      >
        Check again
      </Button>
    </div>
  );
}
