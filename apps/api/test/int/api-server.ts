import type { AddressInfo } from 'node:net';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    /** `http://127.0.0.1:<port>` of the API the sync contract test syncs with. */
    apiOrigin: string;
  }
}

/**
 * After the reset: one real API listening on a port, for tests that only talk HTTP to it (the
 * sync contract test in apps/web, M3-14). Every other test boots its own app in its worker.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  process.env.LOG_LEVEL = 'silent';
  const { createTestApp } = await import('./app.js');
  const { app, server } = await createTestApp();
  await app.listen(0, '127.0.0.1');
  project.provide('apiOrigin', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return () => app.close();
}
