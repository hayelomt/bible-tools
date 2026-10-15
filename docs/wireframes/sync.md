# Wireframes — sync status and conflicted copies

Low-fi layouts for M3-09 and M3-11. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md#offline-and-sync).

## Status indicator (M3-11)

Always in the same place: the header on a phone, the foot of the sidebar on a laptop. It's quiet
when all is well, and it only uses the destructive colour when the user has to act. A tap opens the
sync panel. Changes are announced to screen readers politely (`role="status"`).

On a phone the quiet states (`◌` and `✓`) show their icon alone, so the screen's title keeps its
room; the words are still read out. The states where the user has to act (`!`) keep their words.

| State           | Indicator               | Meaning                                                                        |
| --------------- | ----------------------- | ------------------------------------------------------------------------------ |
| Guest           | `◌ On this device`      | No account. Nothing is backed up.                                              |
| Synced          | `✓ Synced`              | Nothing waiting; last sync under a minute ago.                                 |
| Syncing         | `◌ Syncing…`            | A push or pull is running. Shown only after 1 s, so quick syncs don't flicker. |
| Offline         | `◌ Offline · 3 waiting` | No connection; "3 waiting" only when the outbox isn't empty.                   |
| Verify email    | `! Verify your email`   | Signed up, not verified; nothing syncs yet.                                    |
| Signed out      | `! Sign in to sync`     | Session expired or ended; changes wait in the outbox.                          |
| Update required | `! Update Lamp`         | The server needs a newer version (`426`).                                      |
| Problem         | `! Sync problem`        | Changes rejected, or retries failing for over 10 minutes.                      |

## Sync panel (M3-11)

A sheet on a phone, a popover on a laptop.

```text
┌──────────────────────────────────────┐
│ Sync                              ✕  │
├──────────────────────────────────────┤
│ ✓ Synced 2 min ago                   │
│ a•••@example.com · 2 devices         │
│                                      │
│ [ Sync now ]                         │
└──────────────────────────────────────┘
```

Offline with changes waiting:

```text
│ ◌ Offline                            │
│ 3 changes are saved on this device   │
│ and will sync when you're online.    │
│ Last synced today at 09:41.          │
```

First sync on a new device:

```text
│ ◌ Getting your notes…                │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░  1,240 of 3,000  │
│ You can keep working meanwhile.      │
```

Rejected changes (a change the server refused; later changes to the same item wait behind it):

```text
│ ! 1 change couldn't sync             │
│ ┌──────────────────────────────────┐ │
│ │ Section in "The Good Shepherd"   │ │
│ │ The server refused it: the verse │ │
│ │ reference is invalid.            │ │
│ │ [ Open section ] [ Discard ]     │ │
│ └──────────────────────────────────┘ │
```

Clock warning (§6.5):

```text
│ ! This device's clock is 12 minutes  │
│ off. Set it to automatic so the      │
│ newest edits win.                    │
```

Verify, signed out and update states each carry their one action in the panel: `[ Resend email ]`,
`[ Sign in ]`, `[ Reload to update ]`.

## Conflicted copy (M3-11, §6.4)

When the same section's text was changed on two devices, the newer text stays and the other is kept
beside it as a copy. The copy is a normal section with a label and two actions.

```text
│ ┃ Jesus is the door ⟦John 10:9 · BSB⟧│  ← the newer text, unchanged
│ ┃ salvation and pasture.             │
│ ┃                                    │
│ ┌──────────────────────────────────┐ │
│ │ Conflicted copy · Firefox on     │ │  ← label: device and time of the other edit
│ │ macOS · today 09:41              │ │
│ │ Jesus is the gate: John 10:9.    │ │  ← the other text, editable
│ │ Salvation, pasture, life.        │ │
│ │ [ Keep this instead ] [ Delete ] │ │
│ └──────────────────────────────────┘ │
```

- **Keep this instead** replaces the section's text with the copy's and deletes the copy, in one action (decision 32).
- **Delete** removes the copy, with an undo toast.
- The user can also copy text across by hand and then delete the copy.
- The lesson list shows "1 conflicted copy" on the lesson until it's resolved.
