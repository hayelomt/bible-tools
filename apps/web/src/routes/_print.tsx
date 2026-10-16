import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { whenDeviceReady } from '@/data/ready.ts';

/** The print views (M6-06): a page of their own, without the shell's navigation. */
export const Route = createFileRoute('/_print')({
  beforeLoad: whenDeviceReady,
  component: Outlet,
  pendingComponent: () => <ScreenSkeleton className="mx-auto max-w-[46rem] px-5 py-8" />,
  pendingMs: 0,
  pendingMinMs: 0,
});
