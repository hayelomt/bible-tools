/** `GET /api/health`. Moves to the shared schemas in `domain` with M1-11. */
export interface Health {
  status: 'ok';
  version: string;
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`GET /api/health returned ${res.status}`);
  return (await res.json()) as Health;
}
