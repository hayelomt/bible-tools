import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@lamp/ui/components/sonner';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { whenDeviceReady } from '@/data/ready.ts';
import { useThemeSync } from '@/lib/theme.ts';

/**
 * Capture mode (M11-01): a screen of its own, without the shell's bars, so nothing but the notes,
 * the verse box and New section takes room during a sermon.
 */
export const Route = createFileRoute('/_capture')({
  beforeLoad: whenDeviceReady,
  component: CaptureLayout,
  pendingComponent: () => <ScreenSkeleton className="mx-auto max-w-2xl px-4 py-8" />,
  pendingMs: 0,
  pendingMinMs: 0,
});

function CaptureLayout() {
  useThemeSync();
  return (
    <>
      <Outlet />
      {/* Above the verse box and New section. */}
      <Toaster position="top-center" visibleToasts={1} />
    </>
  );
}
