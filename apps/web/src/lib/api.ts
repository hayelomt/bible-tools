import { type HealthResponse, healthResponseSchema } from '@lamp/domain';

/** `GET /api/health`, checked against the schema the API shares. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`GET /api/health returned ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}
