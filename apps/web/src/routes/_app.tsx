import { createFileRoute } from '@tanstack/react-router';
import { AppShell, ShellFrame } from '@/components/shell/app-shell.tsx';
import { whenDeviceReady } from '@/data/ready.ts';

/**
 * Every screen of the app, inside the shell. The device is set up before the first one shows;
 * meanwhile the shell's empty frame is drawn at once (not after the router's usual second), and
 * for no longer than the setup takes.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: whenDeviceReady,
  component: AppShell,
  pendingComponent: ShellFrame,
  pendingMs: 0,
  pendingMinMs: 0,
});
