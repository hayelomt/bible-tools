import { Button } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { useId, useState } from 'react';
import { OFFLINE_NOTE } from '@/lib/auth-messages.ts';

interface FieldProps extends Omit<React.ComponentProps<'input'>, 'id'> {
  label: string;
  /** A rule shown under the field ("At least 10 characters."). */
  hint?: string;
  /** Replaces the hint, in the destructive colour. */
  error?: string;
  /** A control inside the end of the field (the password's Show). */
  trailing?: React.ReactNode;
}

/** An inline text link ("Sign in ›"). */
export const linkClass = 'text-primary underline-offset-4 hover:underline';

/** A labelled input with its hint or error read out with it. */
export function Field({ label, hint, error, trailing, className, ...props }: FieldProps) {
  const id = useId();
  const noteId = useId();
  const note = error ?? hint;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={trailing ? `pr-16 ${className ?? ''}` : className}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {note && (
        <p
          id={noteId}
          className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {note}
        </p>
      )}
    </div>
  );
}

type PasswordFieldProps = Omit<FieldProps, 'type' | 'trailing'> & {
  autoComplete: 'current-password' | 'new-password';
};

/** A password, hidden until Show (wireframes/account.md). */
export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      type={shown ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={shown}
          aria-label={
            shown ? `Hide ${props.label.toLowerCase()}` : `Show ${props.label.toLowerCase()}`
          }
          onClick={() => setShown((s) => !s)}
        >
          {shown ? 'Hide' : 'Show'}
        </Button>
      }
    />
  );
}

/** The answer to a request that failed, above the button ("! The email or password is wrong."). */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

/** Shown above a disabled button while offline; the form keeps what was typed. */
export function OfflineNote() {
  return <p className="text-sm text-muted-foreground">{OFFLINE_NOTE}</p>;
}
