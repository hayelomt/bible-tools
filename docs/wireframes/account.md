# Wireframes — account, sign-in and devices

Low-fi layouts for M3-03, M3-05, M3-10 and M3-12. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

Accounts are optional. Every screen here can be left with `←`, and the notes keep working on the
device whatever happens on these screens. Each one opens from Settings, or from the sync status
when it asks the user to act.

## Sign up (M3-05)

```text
┌──────────────────────────────────────┐
│ ← Create an account                  │
├──────────────────────────────────────┤
│ Back up your notes and sync them     │
│ between your devices. The 12 lessons │
│ on this device join the account.     │
│                                      │
│ Email                                │
│ [ you@example.com                  ] │
│ Password                             │
│ [ ••••••••••                  Show ] │
│ At least 10 characters.              │
│                                      │
│ [          Create account          ] │
│                                      │
│ Already have an account? Sign in ›   │
└──────────────────────────────────────┘
```

Offline, the form stays filled in and the button is disabled, with one line above it: "Needs a
connection. Your notes keep working offline." When sign-up is turned off on the server, the screen
says "This Lamp server doesn't take new accounts." and links to sign-in.

## Sign in (M3-05)

```text
┌──────────────────────────────────────┐
│ ← Sign in                            │
├──────────────────────────────────────┤
│ Email                                │
│ [ you@example.com                  ] │
│ Password                             │
│ [ ••••••••••                  Show ] │
│                                      │
│ ! The email or password is wrong.    │  ← inline, destructive colour
│                                      │
│ [             Sign in              ] │
│ Forgot your password? ›              │
│ No account? Create one ›             │
└──────────────────────────────────────┘
```

After five failed tries: "Too many tries. Wait 15 minutes, or reset your password."

## Check your email, and verify (M3-05)

```text
┌──────────────────────────────────────┐
│ ← Check your email                   │
├──────────────────────────────────────┤
│ We sent a link to you@example.com.   │
│ Open it on any device to finish.     │
│                                      │
│ Until then your notes stay on this   │
│ device and don't sync.               │
│                                      │
│ [ Send it again ]  available in 60 s │
│ Wrong address? Sign out and start    │
│ again ›                              │
└──────────────────────────────────────┘
```

The link opens the verify page:

```text
│ Email verified.                      │
│ Backing up your notes…               │
│ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  120 of 210      │
│ [ Go to your lessons ]               │  ← available at once; sync carries on
```

A used or expired link: "This link has expired or was already used. `[ Send a new link ]`".

## Forgot and reset password (M3-05)

```text
│ ← Reset your password                │
│ Email [ you@example.com            ] │
│ [ Send a reset link ]                │
```

After sending, always the same message, whether or not the account exists: "If there's an account
for you@example.com, a link is on its way. It works for one hour."

The link opens:

```text
│ ← Choose a new password              │
│ New password [ ••••••••••     Show ] │
│ At least 10 characters.              │
│ [ Set password ]                     │
```

Then: "Password changed. Your other devices are signed out." `[ Continue ]`.

## Change password (M3-03)

```text
│ ← Change password                    │
│ Current password [ ••••••••   Show ] │
│ New password     [ ••••••••   Show ] │
│ Your other devices will be signed    │
│ out. Their notes stay on them.       │
│ [ Change password ]                  │
```

## Notes from another account (M3-10)

Shown when someone signs in on a device whose notes belong to a different account, before anything
syncs. Nothing moves between accounts without this choice.

```text
┌──────────────────────────────────────┐
│ This device has notes from another   │
│ account                              │
│                                      │
│ 12 lessons here belong to            │
│ a•••@example.com.                    │
│                                      │
│ (●) Remove them from this device     │  ← default
│     They stay in that account.       │
│ ( ) Add them to b•••@example.com     │
│     They're copied into this account.│
│                                      │
│ ! 3 changes from that account never  │  ← only when its outbox isn't empty
│   synced. Removing them loses those  │
│   changes; adding them copies them   │
│   here instead.                      │
│                                      │
│          [ Cancel ] [ Continue ]     │  ← Cancel abandons the sign-in
└──────────────────────────────────────┘
```

## Sign out

Sign-out keeps the notes on the device. If changes are waiting, the dialog says so:

```text
┌──────────────────────────────────────┐
│ Sign out?                            │
│ Your notes stay on this device. 3    │
│ changes haven't synced yet; they     │
│ sync the next time you sign in here. │
│              [ Cancel ] [ Sign out ] │
└──────────────────────────────────────┘
```

## Remove notes from this device (M3-10)

Settings → Storage, signed out only (for a shared computer).

```text
┌──────────────────────────────────────┐
│ Remove all notes from this device?   │
│                                      │
│ 12 lessons, 3 highlights and 2       │
│ memory verses are deleted from this  │
│ device. Notes already synced to an   │
│ account stay in that account.        │
│                                      │
│ ! 3 changes never synced and will be │
│   lost.                              │
│                                      │
│      [ Cancel ] [ Remove notes ]     │
└──────────────────────────────────────┘
```

## Devices (M3-12)

```text
┌──────────────────────────────────────┐
│ ← Devices                            │
├──────────────────────────────────────┤
│ This device                          │
│ Chrome on Android                    │
│ Last synced 2 min ago · Lamp 1.0.0   │
│ ──────────────────────────────────── │
│ Firefox on macOS                     │
│ Last synced 3 days ago · Lamp 1.0.0  │
│                       [ Sign out ]   │
│ ──────────────────────────────────── │
│ Safari on iPhone                     │
│ Last synced 2 months ago · Lamp 0.9.0│
│                       [ Sign out ]   │
└──────────────────────────────────────┘
```

Signing a device out asks first: "Sign out Firefox on macOS? Its notes stay on it, and it stops
syncing until someone signs in there again." Offline, the list shows the last copy with "Needs a
connection to update".

## Delete account (M3-03)

The one action that needs typing to confirm.

```text
┌──────────────────────────────────────┐
│ Delete your account?                 │
│                                      │
│ Every lesson, note, highlight and    │
│ memory verse in the account is       │
│ deleted from the server, and every   │
│ device is signed out. This can't be  │
│ undone. Notes already on a device    │
│ stay there until you remove them.    │
│                                      │
│ Password [ ••••••••••            ]   │
│ Type DELETE to confirm               │
│ [                                ]   │
│                                      │
│      [ Cancel ] [ Delete account ]   │  ← enabled once both are filled in
└──────────────────────────────────────┘
```

The password is asked again because this is the one change that can't be undone from any device (decision 30).
