# Running a Lamp server: moderation and data deletion

For whoever runs a Lamp server. The app's privacy note (`/privacy`, `apps/web/src/routes/_app/privacy.tsx`)
makes promises to its users. This page says how the operator keeps them. Commands run as described in
the README's *Admin commands* (`pnpm cli …` in development, `node dist/cli.js …` on a server).

## Before going public

- **A `privacy@` mailbox.** The privacy note tells users to write to `privacy@` the app's host (the
  host of `APP_URL`, where mail already comes from `noreply@`). Make that address reach you before
  anyone signs up.
- **Backups kept 14 days at most.** The note says deleted data leaves the backups within 14 days.
  The nightly `pg_dump` keeps 14 (TECH-DESIGN §11.3); set the VPS provider's snapshots to keep no
  more than that.
- **Error reports.** With `SENTRY_DSN` set, the note's description of what Sentry receives applies.
  Leave it unset to send nothing.

## Answering mail

Answer within a week. Note what was asked, what you did and when, in a file outside the server
(not in its database, which a deletion empties).

### "Delete my account" or "delete my data"

1. Make sure the mail comes from the account's own address. If it doesn't, ask the person to sign in
   and use Settings → Delete account, or to write from that address.
2. `user:delete <email>` deletes the account and every row it owns, as Delete account in the app
   does. It asks for `--yes`.
3. Reply that it's done, and that the backups lose it within 14 days. Copies on their own devices
   stay until they use Settings → Storage → Remove notes from this device.

Someone who can still sign in needs no help. Point them at Settings → Delete account.

### "What do you hold about me?"

Their notes are theirs to see in the app, and Markdown export (a lesson's ⋯ → Export) gives them a
copy. For the account itself, the privacy note's list is the full list: email, password hash,
devices, sessions, share links and group memberships. Read their rows only if they ask you to.

### A report about a shared page

1. Open the address. If it breaks the law or targets someone, turn it off at once:
   `share-link:revoke <address>`. The command prints the account that made it.
2. If the account was made for abuse, `user:disable <email>` stops it signing in and signs it out
   everywhere. Its data stays, so the decision can be undone with `user:enable`. Delete it with
   `user:delete` only once you're sure.
3. Tell the reporter what you did. Tell the owner too, unless doing so would put someone at risk.

### A report about something in a group

Group threads and comments are seen only by members, so reports come from members. Until there is a
command for it, settle it through the group's owner: ask them to remove the member, which sends the
member's posts back to that member's own notes and deletes their comments. If the owner is the
problem, disable the account as above. Their group then keeps going without them, and a member
becomes the owner (TECH-DESIGN §17.12).

## What not to do

- Don't read notes to look for trouble. Act on what's reported to you.
- Don't edit a user's rows by hand. A device that syncs later would bring the old row back, or
  stop syncing. Revoke, disable or delete instead.
- Don't restore a backup over the live database to bring back one account's data: it would also
  bring back what others have deleted since.
