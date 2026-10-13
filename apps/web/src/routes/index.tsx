import { createFileRoute } from '@tanstack/react-router';
import { ApiStatus } from '@/components/api-status.tsx';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Lamp</h1>
        <p className="text-muted-foreground">Sermon and Bible study notes.</p>
      </header>
      <ApiStatus />
    </>
  );
}
