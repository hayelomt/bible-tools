import { Alert, AlertDescription, AlertTitle } from '@lamp/ui/components/alert';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { reportError } from '@/lib/report-error.ts';

/**
 * The error boundary of every screen (wireframes/states.md "Errors"). It replaces the screen only,
 * so the navigation stays usable, and the error goes to Sentry where it's on.
 */
export function ErrorScreen({ error }: ErrorComponentProps) {
  const [copied, setCopied] = useState(false);
  // Caught here, so the browser's error handler never sees it.
  useEffect(() => reportError(error), [error]);

  async function copyDetails() {
    const details = [
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      `at ${location.pathname}`,
      `on ${navigator.userAgent}`,
      (error instanceof Error && error.stack) || '',
    ].join('\n');
    await navigator.clipboard.writeText(details);
    setCopied(true);
  }

  return (
    <Alert>
      <AlertTitle>Something went wrong on this screen.</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>Your notes are safe on this device. Reloading usually fixes it.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          <Button variant="outline" onClick={() => void copyDetails()}>
            {copied ? 'Copied' : 'Copy error details'}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function NotFoundScreen({
  children = "There's nothing at this address.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{children}</p>
      <Link to="/" data-slot="button" className={buttonVariants()}>
        Go to lessons
      </Link>
    </div>
  );
}
