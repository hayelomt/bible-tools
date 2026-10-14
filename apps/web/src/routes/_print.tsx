import { createFileRoute, Outlet } from '@tanstack/react-router';
import { whenDeviceReady } from '@/data/ready.ts';

/** The print views (M6-06): a page of their own, without the shell's navigation. */
export const Route = createFileRoute('/_print')({
  beforeLoad: whenDeviceReady,
  component: Outlet,
});
