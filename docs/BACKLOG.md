# Lamp — Build Backlog (v2.1)

**Date:** 2026-10-12 (v1.0: first version, static app with no server · v2.0: rewritten for PRD v1.1 and TECH-DESIGN v1.0, adding the NestJS + Postgres server, accounts and sync · v2.1: name, themes, hosting, email, backups and error reporting decided)
**Based on:** [PRD v1.2](<Bible Study App — PRD.md>) and [TECH-DESIGN v1.0](TECH-DESIGN.md). Refs point to feature IDs (F1–F16) and to design sections (§).
**Team:** one developer working with Claude Code. Open source (MIT), so contributors can pick up tasks. Screens are designed in code: each UI task builds the screen with the shared components and is reviewed in the browser at phone and laptop widths.

## How to use this file
- **Status:** ☐ to do · ◐ in progress · ☑ done. Update the status cell in place.
- **Size:** **S** ≤ ½ day · **M** ≈ 1 day · **L** 2–3 days. Anything bigger is split before starting.
- **Done when:** a task isn't done until its condition is met, it has tests where it says so, and CI is green.
- **UI tasks** (M2–M6) follow `docs/UX-PATTERNS.md` and the wireframes from M1-14.
- **Tests** run against the machine's own PostgreSQL (`lamp_test`, `lamp_e2e`), never Docker (§10.2).
- **New work:** goes into a milestone table with the next free ID. A scope change also needs a PRD change-log entry.

---

## Summary

| Milestone | PRD | Goal | S | M | L | Effort (ideal days) |
|---|---|---|---|---|---|---|
| [M1](#m1--foundations) | — | Monorepo, API and web scaffolds, database, CI, domain core, WEB data, UX pass | 2 | 11 | 2 | 9 – 17 |
| [M2](#m2--spine) | A | Capture a sermon offline as a guest and reopen it | 3 | 6 | 4 | 9.75 – 17.5 |
| [M3](#m3--accounts-and-sync) | B | Accounts, and notes syncing between devices without loss | 4 | 7 | 4 | 10.5 – 19 |
| [M4](#m4--structure) | C | Find any past note by tag, text or verse | 2 | 5 | 1 | 4.5 – 8.5 |
| [M5](#m5--reader) | D | Read, highlight and promote scripture | 2 | 3 | 0 | 2 – 4 |
| [M6](#m6--loops-and-output) | E | Review queue, scripture memory, export | 3 | 4 | 0 | 2.75 – 5.5 |
| [M7](#m7--release) | — | VPS deploy, hardening, a month of real use, public v1.0 | 6 | 4 | 0 | 3.5 – 7 |
| **Total** | | | **22** | **40** | **11** | **≈ 42 – 78.5** |

The effort range runs from optimistic (S ¼ d, M ½ d, L 1½ d, assuming Claude Code handles most boilerplate) to conservative (S ½ d, M 1 d, L 2½ d). This is a hobby project with no deadline, so the range is for planning order, not dates. The likeliest to run over: the reference parser (M1-09), the section editor (M2-07), the verse autocomplete (M2-09), and the sync engine with its conflict rules (M3-06, M3-07, M3-09).

### Order
```
M1 ──▶ M2 (A) ──▶ M3 (B) ──▶ M4 (C) ──▶ M5 (D) ──▶ M6 (E) ──▶ M7 (v1.0)
```
- **M2 builds the app as a guest-only, offline app**, but every write already goes through the outbox (M2-01). M3 then only has to drain that outbox, with no rework of the screens.
- **Sync (M3) comes before the remaining features** so the data model is proven against two devices and conflicts while it has few entities. Every entity added later gets sync for free.
- M4 and M5 can swap. M6 needs both: the review queue reads questions and takeaways (M4), and memory verses come from the reader (M5).
- Each milestone ends with a **gate test** that checks the PRD gate for that milestone. You can study with the app from the end of M2, and across devices from the end of M3.

---

## M1 — Foundations
*Goal: a monorepo that runs locally and passes CI, with the parts every feature depends on built and tested: the domain core (verse references, parser, document model, schemas), the database schema, the WEB text and the theme presets. Screens exist only as wireframes.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☑ | M1-01 | Monorepo scaffold: Turborepo + pnpm workspaces, Node 24 (`.nvmrc`, `engines`, `scripts/check-node.sh`), ESM everywhere, `packages/config` (tsconfig, oxlint, Prettier, Vitest preset), empty `packages/domain`, `ui` and `bible-data` consumed as TS source | M | §3 | `pnpm lint`, `pnpm typecheck` and `pnpm test` run across the workspace; the wrong Node version fails with a clear message |
| ☑ | M1-02 | API scaffold: `nest new` (NestJS 12, **ESM** option) in `apps/api`; check that Vitest uses `unplugin-swc` so dependency injection works, and add it if not; `@nestjs/config` with Zod env validation; `GET /api/health`; one error shape with `errorCode`; structured JSON logging | M | §7.1, §10.1 | A unit test injecting a service passes; `/api/health` returns the version; a bad `.env` stops startup with a clear error |
| ☑ | M1-03 | Local database, **no Docker**: `scripts/dev-db.sh` (idempotent) creates the role `lamp` and the databases `lamp_dev`, `lamp_test` and `lamp_e2e` on the local Postgres (Postgres.app 18 on macOS), and writes `.env.local` and `.env.test` | S | §10.2, §13 | A fresh clone plus the script gives three working databases, with no containers running |
| ☑ | M1-04 | Prisma 7 schema for every §5.2 table: `prisma-client` generator, `@prisma/adapter-pg`, snake_case mapping, client-generated UUIDv7 ids, `rev`, `deletedAt`, `User.syncRev`; raw SQL in migrations for `citext`, partial unique indexes and check constraints; `PrismaService`; a demo seed (`pnpm db:seed`) | L | §5 | Migrations apply cleanly to an empty database; integration tests cover the unique rules (tag names per user, case-insensitive email) and cascading deletes |
| ☑ | M1-05 | Test harness: API integration tests (Vitest `globalSetup` runs `prisma migrate reset` on `lamp_test`, truncate between tests, supertest against a real Nest app); Playwright skeleton in `apps/e2e` (resets `lamp_e2e`, starts the built API through `webServer`; `vite preview` joins in M1-06, once the web app exists) | M | §10 | A sample integration test and a sample E2E test pass locally against the local Postgres |
| ☑ | M1-06 | Web scaffold: React 19 + Vite in `apps/web`, Tailwind CSS v4, shadcn/ui set up in `packages/ui`, TanStack Router, Vite proxy from `/api` to `:3000`; add `vite preview` to the Playwright `webServer` and point `baseURL` at it | M | §8.1 | `pnpm dev` starts web on `:5173` and api on `:3000`; the web app shows `/api/health` through the proxy |
| ☑ | M1-07 | CI (GitHub Actions): installs **PostgreSQL 18 from PGDG on the runner** (no service containers), then lint + typecheck, unit, integration and E2E (Chromium), and build, all through Turbo | M | §10.2 | CI is green on `main`; PRs show status |
| ☑ | M1-08 | Book table and verse references in `domain`: 66 USFM codes, names, abbreviations, numbered-book variants, chapter and verse counts; the `VerseRef` type (with `chapterEnd`); verse ordinals and the overlap check | M | §4.1 | Tests check the counts against the WEB data (M1-12) and cover overlap for verses, ranges, whole chapters and cross-chapter ranges |
| ☑ | M1-09 | **Reference parser**: `parseReference` and `suggest` for abbreviations, fuzzy names, numbered books, chapter-only, verse ranges, cross-chapter ranges and en dashes; structured errors for out-of-range chapters and verses | L | §4.1, F3 | A table-driven suite of at least 200 cases passes; parser branch coverage is at least 95% |
| ☐ | M1-10 | Section document model and ordering: Zod schema for the restricted ProseMirror JSON with the `verse` node; `toPlainText`, `citedRefs`, `toMarkdown`; fractional order keys | M | §4.2, §4.3 | Round-trip and validation tests pass; 1,000 random inserts and moves keep the order correct |
| ☐ | M1-11 | Zod schemas in `domain` for every entity, the sync change, push and pull messages, and the auth requests; the 24 seeded tags (`seed-tags.ts`) | M | §4.3, §5.2, §6 | The API and web app import the same schemas; a contract test fails if a Prisma model and its schema disagree |
| ☐ | M1-12 | WEB data pipeline in `packages/bible-data`: eBible.org USFM → one JSON file per book (footnotes and markup removed, text unchanged), named by content hash, plus `manifest.json`; licence notice kept | M | §9 | 66 files are generated and the total size is recorded in the README; a lookup returns the right text for verses, ranges and whole chapters |
| ☐ | M1-13 | Theme presets in `packages/ui`: the 6 reading-room presets (Parchment, Vellum, Olive, Slate, Cedar, Midnight) as CSS variable sets for the shadcn tokens, light and dark each, mapped with Tailwind v4 `@theme inline`; a demo page | M | §8.5, F16 | The demo page shows every component in every preset and mode; a CI test checks WCAG AA contrast for all of them |
| ☐ | M1-14 | **UX pass**: low-fi wireframes for capture on a phone, lesson view, verse chip, autocomplete, reader, verse index, search, review queue, sign-up / sign-in / verify, sync status and its states, conflicted copy, the "notes from another account" dialog, devices list and theme picker, plus empty, loading and error states; `docs/UX-PATTERNS.md` (touch targets ≥ 44 px, confirmations, offline and sync cues, translation labels) | M | F1–F16 | Every M2–M6 screen has a wireframe linked from the guide; the preset colours are tuned |
| ☐ | M1-15 | Open-source basics: MIT `LICENSE`, README (what it is, how to run it), CONTRIBUTING (setup, tests, how to pick a task from this backlog), code of conduct, issue and PR templates | S | PRD *Overview* | The repo can be made public without anything missing |

## M2 — Spine
*PRD milestone A (F1, F2, F3, F12, F16). The app works offline as a guest; nothing talks to the server yet, but every write already queues for sync. **Gate:** a sermon can be captured offline and reopened.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M2-01 | **Dexie data layer**: tables mirroring §5.2, `outbox`, `syncState`; an action helper that writes the entity tables, the derived citations and the outbox entry **in one transaction**; seeded tags on first run | L | §6.1, §8.2 | Tests with fake-indexeddb: a failure inside an action leaves no table change, citation or outbox entry |
| ☐ | M2-02 | App shell: routes, bottom navigation on phones and a sidebar on laptops, settings page, error boundary; starts as a guest with no sign-in prompt | M | §8.1, F12 | Every route renders at 360 px and 1280 px with no horizontal scroll |
| ☐ | M2-03 | F16 Theme picker in settings (preset + light / dark / system), stored in local `UserSettings` and mirrored to `localStorage`; an inline script applies it before the first paint | S | §8.5, F16 | Reloading in any preset and mode shows no flash of the default theme |
| ☐ | M2-04 | F1 Lesson create and edit on one screen: title, date (defaults to today), source, speaker, church, main passages through the reference input | M | F1 | A lesson can be created with only a title; main passages are stored as normalised refs |
| ☐ | M2-05 | F1 Series: create, rename, list lessons in date order, move a lesson between series or out of one | M | F1 | Moving a lesson updates both series; a lesson without a series still shows on the home screen |
| ☐ | M2-06 | F1 Lessons home: recent lessons, series list, "New lesson" in one tap, first-run empty state | S | F1 | A fresh install shows the empty state and leads to the first lesson |
| ☐ | M2-07 | F2 **Section editor** (TipTap on the M1-10 model): add a section, reply under a section (two levels in the UI), autosave debounced at 500 ms through an action | L | §8.3, F2 | Text typed and the tab closed within one second is still there on reopen; a third level can't be created |
| ☐ | M2-08 | F2 Reorder sections by drag (touch, mouse and keyboard) with fractional order; deleting a section with replies asks first | M | F2 | Order survives a reload; a cancelled delete changes nothing |
| ☐ | M2-09 | F3 **Verse autocomplete**: a TipTap suggestion plugin that opens when the text before the cursor parses as a reference, shows `suggest()` results with a WEB preview, and inserts a `verse` node with the snapshot | L | §8.3, F3 | `Rom 8:28-30`, `1 Jn 3`, `romns 8` and `Rom 8:38–9:5` complete correctly offline; Escape keeps the typed text |
| ☐ | M2-10 | F3 Verse chip: display reference and translation label, tap to expand the snapshot; keyboard and screen-reader accessible; deleted as one unit | M | §9, F3 | The chip text never changes after capture, shown by a test |
| ☐ | M2-11 | F12 **PWA**: `vite-plugin-pwa` (injectManifest) precaching the app shell, installable manifest, WEB downloaded in the background with progress in settings, `storage.persist()`; safe update ("New version — Reload", never while editing) | L | §8.6, F12 | In airplane mode after the first load, every screen works and any book opens; manual script: an update mid-edit loses nothing |
| ☐ | M2-12 | Gate test (Playwright, offline): create a lesson, add three sections with a reply and two verse chips, reload, reopen; the outbox holds every change | M | PRD *Milestones* A | Passes in CI; the capture takes under two minutes when done by hand |
| ☐ | M2-13 | Real-use check: take notes during an actual sermon on a phone with the installed app; log where typing or verse entry is slow | S | PRD *Goals* | Findings are fixed or logged as tasks before M3 starts |

## M3 — Accounts and sync
*PRD milestone B (F14, F15). **Gate:** notes captured offline on a phone appear on a laptop, and a two-device edit loses nothing.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M3-01 | Auth backend: sign-up, sign-in, sign-out, `me`; argon2id; opaque session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`), 90 days and renewed on use, stored as a hash; `Origin` check on non-GET requests; throttling and a 15-minute lockout after 5 failed sign-ins; `SIGNUP_ENABLED` | L | §7.2, F14 | Integration tests: sign-up, sign-in, lockout, session expiry and renewal, a missing `Origin` rejected, sign-up off |
| ☐ | M3-02 | Email: nodemailer over SMTP, file transport in dev and tests (`apps/api/tmp/emails`); email verification, resend, forgotten password and reset (single-use, hashed, 1 h tokens); HTML and text templates | M | §7.3, F14 | Integration tests read the link from the `.eml` file and complete each flow; a used or expired token is refused |
| ☐ | M3-03 | Password change ends other sessions; account deletion removes every row the user owns and ends all sessions | S | §7.2, §12, F14 | Tests: other sessions stop working after a change; nothing of a deleted user remains |
| ☐ | M3-04 | Admin CLI (`nest-commander`): `user:create`, `user:disable`, `user:verify` | S | §7.1 | Each command works against `lamp_dev` and is documented in the README |
| ☐ | M3-05 | Auth screens: sign up, sign in, "check your email", verify landing, forgot and reset password, change password; the app keeps working locally on every screen | M | F14 | The full flow works end to end locally with links from `tmp/emails` |
| ☐ | M3-06 | **Push endpoint**: one transaction per change; idempotent by change id (`SyncChange`); Zod and ownership checks on the row and everything it references; `User.syncRev` incremented as the per-user lock; citations recomputed; a result per change; verified email required | L | §6.2, §6.3 | Tests: a replayed batch changes nothing; a change to another user's row is rejected; one bad change doesn't block the rest |
| ☐ | M3-07 | **Conflict rules** as pure functions in `domain/sync.ts`, applied by the push endpoint: last write wins by adjusted `updatedAt`; a section body changed on both sides keeps the older body as a "conflicted copy" sibling; edit beats delete; a deleted parent is restored | L | §6.4, F15 | Unit tests for every row of the §6.4 table, and integration tests for the same cases through the endpoint |
| ☐ | M3-08 | **Pull endpoint**: rows with `rev > cursor` including tombstones, paged at 500, with `nextCursor`, `hasMore`, `serverTime` and `minClientVersion`; `426` for clients that are too old | M | §6.3 | Tests: the cursor never skips a row under concurrent pushes; a first pull from 0 returns everything |
| ☐ | M3-09 | **Client sync engine**: triggers (start, online, 2 s after a write, every 60 s, "Sync now"), backoff from 5 s to 5 min, push in batches of up to 100, pulled rows skipped while the outbox has a change for that entity, later changes held after a rejection, clock offset, first-sync progress | L | §6.1–6.5 | Unit tests plus a manual test that toggles the network in the middle of editing |
| ☐ | M3-10 | Guest and device rules: guest notes join the account at sign-up; `ownerUserId`; sign-out keeps the notes; the "notes from another account" dialog (remove by default, or add with new ids and remapped references); "Remove notes from this device" in settings | M | §6.6, F14 | Tests for each path, including adopting another account's notes with unsynced changes |
| ☐ | M3-11 | Sync status UI: synced, syncing, offline with N waiting, "verify your email", "update required", clock warning, rejected changes with details; "Sync now"; the conflicted-copy label in the editor | M | §6, F15 | Every state can be shown with a mocked API |
| ☐ | M3-12 | Devices: created on first sync; the list in account settings with last sync and version; sign a device out | S | §7.1, F14 | A signed-out device gets `401` and keeps its notes |
| ☐ | M3-13 | Isolation tests: one user can never read, overwrite, reference or delete another user's rows through any endpoint | S | §12 | The suite covers every model |
| ☐ | M3-14 | **Sync contract test**: the web sync engine running in Node on two fake-indexeddb devices against a real API on `lamp_test`; both edit offline, sync, and end up identical with the expected conflicted copies | M | §10 | Passes in CI, including a randomised run of 200 operations |
| ☐ | M3-15 | Gate test (Playwright): a guest captures a lesson offline, signs up and verifies, a second browser context signs in and sees it; both edit the same section offline, reconnect, and the conflicted copy appears | M | PRD *Milestones* B | Passes in CI |

## M4 — Structure
*PRD milestone C (F4, F5, F6, F7). **Gate:** any past note can be found by tag, text or verse.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M4-01 | F4 Tag input with autocomplete on sections and lessons: seeded and custom tags, a new tag on Enter | M | F4 | Custom tags sync and show in autocomplete; the same name can't be created twice with different case |
| ☐ | M4-02 | F4 Tag page: every section and lesson with the tag, grouped by lesson, newest first | S | F4 | A section shows up immediately after tagging |
| ☐ | M4-03 | F5 Takeaways on a lesson: add, edit, delete | S | F5 | Takeaways sync and carry `createdAt` for the review queue |
| ☐ | M4-04 | F5 Open questions: add, set status (open / answered / parked), promote to a child section titled with the question; answered once that section has a body | M | F5 | Tests: promotion links `answerSectionId`; an empty answer section leaves the question open |
| ☐ | M4-05 | F6 Search index: MiniSearch in a Web Worker over sections, takeaways and questions, built at startup and updated after each action and pull | M | §8.4, F6 | 5,000 seeded sections index in under 1 s on a mid-range phone (recorded) |
| ☐ | M4-06 | F6 **Search UI**: one box for free text, `#tags` and verse queries (detected by the parser); results grouped by lesson; a result opens the lesson at the matching section | L | §8.4, F6 | Each query type returns the right sections in a fixture test; works offline |
| ☐ | M4-07 | F7 **Verse index** page: every section, highlight and memory item citing a passage, newest first, with lesson, date and surrounding text; reachable from a chip and from search | M | §4.1, F7 | Opening `Rom 8` lists every citation that overlaps the chapter, including cross-chapter ranges |
| ☐ | M4-08 | Gate test: seed a month of lessons, then find a note by tag, by free text and by verse | M | PRD *Milestones* C | Passes in CI |

## M5 — Reader
*PRD milestone D (F8). **Gate:** scripture is read, highlighted and promoted inside the app.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M5-01 | F8 Reader: WEB chapter view, book and chapter picker, previous and next by swipe and keyboard, reopens at the last position | M | §9, F8 | Any chapter opens offline; the last position survives a reload |
| ☐ | M5-02 | F8 Highlights: select one or more verses, four colours, an optional note; edit and delete | M | F8 | Highlights sync and appear in the citation index |
| ☐ | M5-03 | F8 Promote a highlight into a lesson section: pick a lesson or create one, insert a section with the verse chip and the note, set `promotedSectionId` | M | F8 | The new section appears in the lesson and the highlight links to it |
| ☐ | M5-04 | Reader ↔ verse index: tapping a verse opens its verse index; verses with notes show a marker | S | F7, F8 | Markers match the citation index for the chapter |
| ☐ | M5-05 | Gate test: open a chapter, highlight two verses, promote one into a new lesson, find it in the verse index | S | PRD *Milestones* D | Passes in CI |

## M6 — Loops and output
*PRD milestone E (F9, F10, F11). **Gate:** questions and verses come back for review; lessons export.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M6-01 | F10 Memory items: "Memorise" from the reader and from a chip; SM-2 in `domain/srs.ts` | M | §4.3, F10 | Unit tests cover every grade and the first three reviews |
| ☐ | M6-02 | F10 Review card: hide and reveal, grade buttons, progress per verse | M | F10 | Grading updates `nextReviewAt`; progress shows on the verse index page |
| ☐ | M6-03 | F9 **Review queue**: open questions, takeaways from the last `reviewWindowDays` (default 14, set in settings), memory verses due today; park or answer a question from the queue | M | §8.8, F9 | An empty queue shows a done state; actions update the lesson; the window setting syncs |
| ☐ | M6-04 | F9 Weekly reminder: Periodic Background Sync where supported (Chromium, installed app), otherwise a badge count on the Review tab | S | §8.8, F9 | Behaviour per browser is recorded in the README; unsupported browsers degrade silently |
| ☐ | M6-05 | F11 Markdown export for a lesson and a series: nesting, verse text with translation labels, tags, takeaways and questions | M | §8.7, F11 | Golden-file tests pass; the output renders correctly on GitHub |
| ☐ | M6-06 | F11 PDF: a print view of a lesson or series with a print stylesheet, saved through the browser's "Save as PDF" | S | §8.7, F11 | The printed output matches the screen in Chrome, Safari and Firefox, offline |
| ☐ | M6-07 | Gate test: a question answered, a memory verse reviewed, a lesson exported to Markdown and opened in print view | S | PRD *Milestones* E | Passes in CI |

## M7 — Release
*Goal: public v1.0 on a VPS. The PRD success test passes: one person studies offline for a month on a phone and a laptop and still finds any note by the verse it touches.*

| Status | ID | Task | Size | Refs | Done when |
|---|---|---|---|---|---|
| ☐ | M7-01 | VPS setup: Ubuntu 24.04, Node 24, PostgreSQL 18 (PGDG), Caddy (HTTPS, static web and Bible JSON, `/api` proxy), a systemd unit under its own user, `/etc/lamp/api.env` (mode 600), firewall | M | §11.1 | The domain serves the app over HTTPS and `/api/health` answers |
| ☐ | M7-02 | Release pipeline: on a `v*` tag, build the web app, the Bible data and the bundled API; copy to `releases/<version>`, run `prisma migrate deploy`, switch the `current` symlink, restart; keep five releases; a rollback script | M | §11.2 | Two tags deploy in a row, and a rollback to the previous release works |
| ☐ | M7-03 | Security headers in Caddy (CSP with the theme script by hash, HSTS and the rest); dependency audit; check the push body and field size caps | S | §12 | securityheaders.com grade A; the audit has no high or critical findings |
| ☐ | M7-04 | Operations: daily provider snapshots turned on; nightly `pg_dump` to `/var/backups/lamp` kept 14 days; a restore test from a snapshot and from a dump; an uptime monitor on `/api/health` | S | §11.3 | Both a snapshot and a dump restore into a fresh database |
| ☐ | M7-05 | Sentry (free tier) in the API and web app, on only when `SENTRY_DSN` is set, with note content scrubbed | S | §11.3, §12 | A test error from each app appears with the release version and no note text |
| ☐ | M7-06 | Accessibility pass: axe on every screen, keyboard-only use of the editor and chips, screen-reader check of chips, reader and sync status | M | — | No serious axe violations; the capture flow works with the keyboard only |
| ☐ | M7-07 | Performance budgets in CI: first-load JavaScript, lesson open time, autocomplete latency, first sync time; storage use measured on a low-end phone | S | §14 | The budgets are enforced and the storage numbers are in the README |
| ☐ | M7-08 | **Month-long field test** on a real phone and laptop with one account: offline Sundays, conflicts, an app update, a browser restart, a sign-out and sign-in | M | PRD *Goals* | No data lost; any note can be found by verse at the end; issues found are fixed |
| ☐ | M7-09 | User guide (install, capture, verse entry, accounts and sync, what the sync indicator means), privacy note (what is stored, who can see it, how to delete it), architecture overview for contributors | S | PRD *Open questions* | Linked from the README and the app's settings |
| ☐ | M7-10 | v1.0 release: changelog, tag, release notes, the repo made public, first issues labelled "good first issue" | S | — | v1.0 is live and the repo is public |

---

## External dependencies

| Needed for | Item | Owner | Status |
|---|---|---|---|
| M1-01 | Node 24 LTS on the dev machine (it has 22.22.2; the NestJS 12 CLI needs 22.22.3+ or 24.15+) | You | ☑ |
| M1-07, M7-02 | GitHub repository (private until v1.0, then public) | You | ☐ |
| M1-12 | WEB USFM from eBible.org (public domain, free download) | You | ☐ |
| M2-13, M7-07, M7-08 | Test devices: an Android phone and an iPhone, ideally one low-end | You | ☐ |
| M7-01 | An Ubuntu 24.04 VPS from your existing provider, and a domain for Lamp | You | ☐ |
| M7-01 | Resend account with the domain verified (SPF, DKIM) for verification and reset emails | You | ☐ |
| M7-04 | Daily snapshots turned on at the VPS provider | You | ☐ |
| M7-05 | Sentry account (free tier) | You | ☐ |
