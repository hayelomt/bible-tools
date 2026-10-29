# Changelog

Lamp's releases, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The web app and the API ship together and carry the same version. The user-facing notes for each release are in [`docs/releases/`](docs/releases/).

## [Unreleased]

### Added

- **Enduring Word in "Open in…".** A verse chip opens David Guzik's commentary on its chapter at enduringword.com. New accounts show it; existing ones can switch it on in Settings → Open in. Changes the sync format, so apps before 2.1.0 are asked to update.

## [Unreleased]

### Added

- **Density and text size.** Settings → Appearance gains Density (Compact, Default, Roomy) and Text size (Small, Default, Large, Larger), for each device. They apply before the first paint, and touch targets stay at 44 px (TECH-DESIGN §8.5, decision 107).

## [2.0.0] - 2026-10-19

The first tagged release. v1.0 (M7-10) was never tagged, so 2.0.0 brings the v1 study app and v2's interop, thinking, sermon, reflection and group features. Release notes: [`docs/releases/v2.0.0.md`](docs/releases/v2.0.0.md).

### Added

- **Sharing (F34, M13-01 to M13-05).** Read-only share links for a lesson, a series, a compile view and a handout, served by the API at `/s/<token>`. Links can expire and be revoked, and are listed in Settings → Shared links. They render with no session, no cookies, `noindex` and a strict CSP. Frozen links keep a snapshot; live ones show current rows. The app also has a privacy note and a user guide (`/privacy`, `/guide`), and `docs/OPERATIONS.md` describes moderation and deletion.
- **Groups (F35, M13-07 to M13-13).**
  - Groups around one or more series: members join by invite link, and the owner can hand over the group or remove a member.
  - Each group lesson has a group thread beside each member's private notes. Members can comment on sections and ask the group questions, and the group's questions page shows who asked and who answered.
  - The group page lists new activity, and an optional weekly email of it has one-click unsubscribe (RFC 8058).
  - Each group has its own feed and revision, and isolation tests cover every group table (TECH-DESIGN §17.12).
- **Reflection and export (M12).** Old lessons, repeated verses and long-open questions come back in Review. Also new: a theme map (tags by month and by book), a quarterly digest, a one-page handout, and Notion-flavoured Markdown.
- **Sermon workflow (M11).** Capture mode, inbox triage (bulk actions, snooze, promote, keyboard shortcuts), lesson sources with section timestamps and pages that open the recording at that moment, and a prep card for the coming passage.
- **Thinking layer (M10).** A compile view of every note on a passage, `[[` links between notes with "Linked from", question threads that span lessons (revisit, split, merge), and study-method templates (built-in and custom, with a default per lesson kind).
- **Interop (M9).** An inbox for verses shared from other apps (share target), verse chips from pasted references and verse text, "Open in…" other Bible apps, and a YouVersion importer.
- **The v1 study app (M1 to M6).** Lessons and series, a section editor with replies and verse chips, tags, takeaways, open questions, search, the verse index, the reader with highlights, scripture memory (SM-2), the review queue, Markdown and print export, and an offline-first PWA. Accounts with email verification, sync between devices with conflict copies, and a device list.

### Changed

- Verse references keep no translation or text of the app's own; only text from outside (`shared` or `pasted`) is stored (decision 97).
- One theme, Lamplight, in light, dark and auto.

### Known gaps

- The YouVersion importer reads a made-up export file. It hasn't been tried with a real export yet (M9-11).
- The real-use checks are still to do (M9-14, M11-11, M13-15), and so is the v1 hardening (M7: security headers, the accessibility pass, performance budgets in CI, the month-long field test).

### Upgrading

- **PostgreSQL 18 is required.** A migration uses the built-in `uuidv7()`.
- **`SHARE_LINK_SECRET`** (32+ characters) is required in production. The API refuses to start without it. Changing it turns every share link and unsubscribe link off.
- The web server must proxy **`/s/`** to the API as well as `/api/`.
- The newest sync format needs web app 0.7.0 or later. Older apps show "Update required" until they reload (TECH-DESIGN §6.7).

[2.0.0]: docs/releases/v2.0.0.md
