import { buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';

/** Sign-up and sign-in opened while already signed in (a bookmark, the back button). */
export function SignedInNote({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p>You're signed in as {email}.</p>
      <Link to="/settings" className={buttonVariants({ variant: 'outline' })}>
        Go to settings
      </Link>
    </div>
  );
}
