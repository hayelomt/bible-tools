import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/shell/app-shell.tsx';
import { whenDeviceReady } from '@/data/ready.ts';

/** Every screen of the app, inside the shell. The device is set up before the first one shows. */
export const Route = createFileRoute('/_app')({
  beforeLoad: whenDeviceReady,
  component: AppShell,
});
