# Lamp — Technical Design (v1.0)

**Date:** 2026-10-12
**Based on:** [PRD v1.2](<Bible Study App — PRD.md>) and the decisions recorded in §2. The task breakdown is in [BACKLOG.md](BACKLOG.md). Feature IDs (F1–F16) refer to the PRD.
**Status:** draft for review. Product decisions are settled (§15), and the PRD changes in §16 are applied in PRD v1.1.

---

## 1. Overview

The app is an **offline-first PWA backed by a NestJS API and PostgreSQL**. Each signed-in device keeps a full copy of its user's notes in IndexedDB and works entirely from that copy. Changes go into a local outbox and sync to the server whenever the device is online. Postgres is the durable store and the hub between a user's devices (phone at church, laptop at home).

```
 ┌──────────── Device (browser / installed PWA) ────────────┐
 │  React UI ──reads──▶ Dexie (IndexedDB) ◀──writes── actions│
 │                         │  tables + outbox + syncState    │
 │  Service worker: app shell, Bible JSON                    │
 │  Search index (MiniSearch, Web Worker)                    │
 └──────────────┬────────────────────────────────────────────┘
                │ HTTPS, same origin, cookie session
                │ POST /api/sync/push   GET /api/sync/pull
 ┌──────────────▼──────────── VPS ───────────────────────────┐
 │ Caddy: TLS, static web app + Bible JSON, /api → NestJS     │
 │ NestJS 12 (ESM): auth, sync, settings, health              │
 │ Prisma 7 ──▶ PostgreSQL 18                                 │
 └────────────────────────────────────────────────────────────┘
```

Principles:
1. **The UI reads only from IndexedDB.** No screen waits on the network. The API is used for auth and sync only.
2. **One write path.** Every user data change, whether from a phone, a laptop or a test, goes through the same sync push. There are no separate CRUD endpoints that could drift from sync.
3. **One verse reference model**, in a shared `domain` package that both the browser and the server import. The parser, book table, citation ordinals, document model and SM-2 are written once.
4. **Shared Zod schemas** check the same input in the browser (forms), in the API (NestJS 12 Standard Schema validation) and in sync (each queued change).

## 2. Decisions

| Area | Decision | Source |
|---|---|---|
| Offline model | Offline-first: full per-user copy on the device, outbox, push/pull sync | Q&A 2026-10-12 |
| Conflicts | Last write wins per row. If a section body changed on both sides, the losing version is kept as a "conflicted copy" section | Q&A |
| Users | Multi-user, email + password, open sign-up with email verification (sign-up can be turned off in `.env`) | Q&A |
| Name | **Lamp** (Psalm 119:105). Database and server names use `lamp` | Q&A 2026-10-12 |
| Hosting | One Ubuntu 24.04 VPS from the provider already in use: Node + PostgreSQL + Caddy, no containers. Backups by provider snapshots plus a local nightly dump | Q&A |
| Email | Resend over plain SMTP (nothing provider-specific in code) | Q&A |
| Errors | Sentry free tier, content scrubbed, off unless `SENTRY_DSN` is set | Q&A |
| Theme | Per user: one of six reading-room presets (§8.5) plus light / dark / system, synced across devices | Q&A |
| Translations | **WEB only** in phase 1 (public domain). ESV and other translations move to phase 2; the data model already supports several | Q&A |
| Guest mode | The app works fully without an account. Guest notes join the account at sign-up | Product Q&A 2026-10-12 |
| Verse chips | Show the captured snapshot with its translation label; expanding a chip can show it in any other downloaded translation (none besides WEB in phase 1) | Product Q&A |
| Sign-out | Local notes **stay on the device** as guest data; a different account signing in must choose what to do with them (§6.6) | Product Q&A |
| Tags | 24 seeded themes (§4.3), applied to sections and lessons | Product Q&A |
| Review queue | Takeaways from the last 14 days, adjustable in settings | Product Q&A |
| PDF | Print view + the browser's "Save as PDF" | Product Q&A |
| Admin | No admin UI in phase 1: CLI commands only | Default, not raised |
| Licence | MIT | Product Q&A |
| API | NestJS 12, ESM project, Vitest, oxlint, Standard Schema (Zod) validation | NestJS 12 release notes |
| ORM / DB | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`), PostgreSQL 18 | Request |
| Web | React 19, Vite, Tailwind CSS v4, shadcn/ui | Request |
| Monorepo | Turborepo + pnpm workspaces | Request |
| Tests | Vitest (unit, integration), Playwright (E2E); integration and E2E tests use the machine's own Postgres; no Docker | Request |

## 3. Repository layout

```
bible-tool/
├─ apps/
│  ├─ web/            React 19 + Vite PWA (Dexie, TipTap, TanStack Router)
│  ├─ api/            NestJS 12 (ESM) + Prisma 7
│  └─ e2e/            Playwright tests against the built web app and API
├─ packages/
│  ├─ domain/         pure TS, no DOM or Node APIs: books, VerseRef, parser,
│  │                  citation ordinals, fractional order, doc model, SM-2,
│  │                  sync types, Zod schemas for every entity and API call
│  ├─ bible-data/     source texts + build script → per-translation JSON + manifest
│  ├─ ui/             shadcn/ui components, theme presets (CSS variables), tokens
│  └─ config/         shared tsconfig, oxlint, Prettier and Vitest presets
├─ scripts/           dev-db.sh, check-node.sh
├─ docs/              PRD, TECH-DESIGN, BACKLOG, UX-PATTERNS, decisions/
├─ turbo.json  pnpm-workspace.yaml  .nvmrc  package.json
```

- **Runtime:** Node **24 LTS** (pinned in `.nvmrc` and `engines`). The NestJS 12 CLI needs Node 22.22.3+ or 24.15+. This machine has 22.22.2, so upgrade before scaffolding.
- **Module format:** ESM everywhere (`"type": "module"`). NestJS 12 and Prisma 7 are both ESM-first.
- **Tooling:** pnpm 10. Turborepo tasks are `dev`, `build`, `lint`, `typecheck`, `test`, `test:int` and `e2e`. oxlint (the NestJS 12 default) lints the whole repo and Prettier formats it.
- **Internal packages** are consumed as TypeScript source (`"exports": "./src/index.ts"`): Vite and Vitest compile them directly, and the API bundles them at build time (§11.2). This avoids a build step per package during development. Their relative imports name the `.ts` file (`./seed-tags.ts`, allowed by `allowImportingTsExtensions` in the base tsconfig), so they resolve the same way under bundler and `nodenext` resolution, in tsx and in Node's type stripping. The API's own sources keep `.js` specifiers, because SWC emits them unchanged.
- **Versions** are pinned exactly in `package.json` at scaffold time and kept current by Renovate. This document names major versions only.

## 4. Domain model (`packages/domain`)

### 4.1 Verse references

```ts
type BookCode = 'GEN' | 'EXO' | … | 'REV';          // 66 canonical codes (USFM ids)
interface VerseRef {
  book: BookCode;
  chapter: number;
  verseStart?: number;     // absent = whole chapter
  chapterEnd?: number;     // absent = same chapter (allows Rom 8:38–9:5)
  verseEnd?: number;
  display: string;         // "Romans 8:28–30", formatted from the fields
  translation: TranslationId;   // which text the snapshot came from
  snapshotText?: string;   // frozen at capture (F3)
}
```

- **Ordinals:** each verse maps to an integer `bookIndex·1,000,000 + chapter·1,000 + verse`. A reference becomes `[startOrd, endOrd]`; a whole chapter is `[c·1000+0, c·1000+999]`. Two references overlap when `a.start ≤ b.end && b.start ≤ a.end`. The verse index, verse search and reader markers all reduce to this one range query, on the device and on the server. Ordinals also make cross-chapter ranges free, which is why `chapterEnd` is included (closes BACKLOG gap 3).
- **Book table:** codes, names, abbreviations, numbered-book variants (`1 Jn`, `I John`, `First John`) and the chapter and verse counts from the default translation.
- **Parser:** `parseReference(input) → { ok, ref, mappedFrom? } | { ok: false, error }` and `suggest(input, limit) → Suggestion[]` for the autocomplete. Book names are matched by exact alias, then prefix, then fuzzy matching (edit distance ≤ 2 on names of 4+ letters, ranked relative to the alias length). Tests are table-driven. Rules settled on 2026-10-13:
  - A name that fits several books is an error that lists them (`Jud` → Judges or Jude; `Sam` → 1 or 2 Samuel), and `suggest` offers each one.
  - With no number typed, a book without a number wins over a numbered one (`Ti` → Titus, `Jhon` → John). `Tim` still means 1 or 2 Timothy.
  - In a one-chapter book, a bare number is a verse (`Jude 3`, `Jude 1` = verse 1), and the book name alone is the whole book.
  - Any other book name alone is an error ("Add a chapter"); `suggest` offers chapter 1.
  - Psalms display as "Psalm 23" for one and "Psalms 1–2" for a range.
  - Part-verse letters are accepted and dropped (`8:28a` → 8:28).
  - KJV verse numbers that WEB places elsewhere are moved onto WEB's, and `mappedFrom` keeps what was typed (§9).

### 4.2 Section document model

Section bodies are stored as **ProseMirror JSON**, the format TipTap uses (§8.3), with a restricted schema: paragraph, heading (h3 only), bullet and ordered lists, blockquote, bold, italic, link, and an inline atom node `verse` with `attrs: VerseRef`. The domain package provides:
- `bodySchema`: Zod validation of the whole tree, run on the device and again on the server. Unknown node types are rejected.
- `toPlainText(body)` for search, `citedRefs(body)` for citations, and `toMarkdown(body)` for export.

*Built in M1-10 (`doc.ts`):*
- Node and mark names are TipTap's (`bulletList`, `listItem`, `bold` …). Every node, mark and attribute object is strict, so unknown keys are rejected as well as unknown types; M2-07 configures TipTap to produce exactly these. A list item starts with a paragraph (`paragraph block*`), headings are level 3 only, link marks carry only `href` (http, https or mailto), and `verse` attrs are checked with `verseRefSchema` (the passage must exist in the book table).
- Bodies nested more than 32 levels deep are rejected before parsing, so a hostile push can't exhaust the stack.
- `toPlainText` writes one line per text block, with each chip as its display reference. `citedRefs` lists the chips in document order, repeats included.
- `toMarkdown` writes a chip as "Romans 8:28 (WEB)" in the sentence and puts its snapshot after the paragraph as a quote: `> **Romans 8:28 (WEB)** …` (decided 2026-10-13).

### 4.3 Other domain modules
- `order.ts`: fractional index keys for section siblings, using the `fractional-indexing` package (rocicorp, CC0). `keyAt(siblingKeys, index)` places an insert or a move; siblings sort by key, then by id (`compareOrder`), so two devices that insert at the same place offline still agree on the order. Keys compare by byte, matching the `"C"` collation on `section.order_key`.
- `srs.ts`: SM-2 (ease, interval, next review) as pure functions of `(state, grade, today)`.
- `sync.ts`: the change, push and pull types (§6) and the conflict rules as pure functions, so they can be unit-tested without a database.
- `schemas/`: a Zod schema per entity and per API request or response. *Built in M1-11:*
  - **Entity rows** (`entities.ts`) are the database columns minus `userId`, as the device stores them and sync sends them: every column present (nullable ones as `null`), times as ISO strings in UTC, `date` as `YYYY-MM-DD`, and `rev` as a plain number (a per-user counter never nears 2^53; the API converts the bigint at the edge; decided 2026-10-13). Objects are strict, ids are UUIDv7, one-line text is trimmed. `citationSchema` has no sync fields, since citations are never pushed.
  - **Sync** (`sync.ts`): a change is `{ changeId, baseRev, clientTime, entity, entityId, op, row }`. An upsert carries the whole row without `rev` (its id must equal `entityId`); a delete carries no row. Settings are one row per account, so their changes have no `entityId` and are upserts only. Push takes 1–100 changes; each result is `applied`, `conflict` (with a `resolution` and, for a conflicted copy, its `copyId`) or `rejected`. The pull query coerces its string parameters and defaults `limit` to 500.
  - **Auth** (`auth.ts`): emails are trimmed but keep their case (the column is citext); new passwords need 10–256 characters, while login accepts any non-empty password; email tokens are 43-character base64url strings. `resend-verification` has an empty body, since the user is signed in.
  - **API** (`api.ts`): health, the error body, and the devices list. The API imports these types (type-only, so its build needs nothing from `domain` until the bundling in §11.2), and the web app parses `/api/health` with the same schema.
  - **Contract test** (`apps/api/test/contract.int.test.ts`): compares each schema with the migrated database (field names, nullability, wire type, and the values and ranges in CHECK constraints), and fails if a table has neither a schema nor a place on the server-only list (`session`, `email_token`, `sync_change`).
- `seed-tags.ts`: the 24 seeded themes, copied into every new device and account: *grace, faith, prayer, hope, love, holiness, obedience, suffering, identity, worship, mission, repentance, forgiveness, salvation, the cross, resurrection, Holy Spirit, church, wisdom, justice, fear, stewardship, family, promises*.

## 5. Data model (Prisma, PostgreSQL)

### 5.1 Conventions
- `id`: UUIDv7 **generated on the client**, so offline creates need no server round trip. The server checks the format and that the row's owner is the signed-in user.
- Every user-owned row has `userId`, `createdAt`, `updatedAt` (client time, adjusted for clock offset, §6.5), `rev BigInt` (server-assigned, §6.3) and `deletedAt` (a tombstone, so deletes sync).
- Column names are `snake_case` via `@map`, Prisma models are PascalCase, and timestamps are `timestamptz`.
- Lists of verse references (`Lesson.mainPassages`) and section bodies are `jsonb`, validated by Zod. Everything that needs querying by verse is copied out to `Citation`.

### 5.2 Tables

| Model | Key fields | Notes |
|---|---|---|
| `User` | id, email (unique, citext), passwordHash, emailVerifiedAt, role (`user`/`admin`), syncRev BigInt, disabledAt | `syncRev` is the per-user revision counter (§6.3) |
| `Session` | id, userId, tokenHash, createdAt, lastSeenAt, expiresAt, userAgent | Opaque cookie token; only its SHA-256 is stored |
| `EmailToken` | id, userId, kind (`verify`/`reset`), tokenHash, expiresAt, usedAt | Single use |
| `UserSettings` | userId (PK), themePreset, colorMode (`light`/`dark`/`system`), defaultTranslation, reviewWindowDays, rev, updatedAt | Synced like other entities |
| `Series` | id, userId, title, description, kind, … | |
| `Lesson` | id, userId, seriesId?, title, date (`date`), source, speaker?, church?, mainPassages jsonb | |
| `Section` | id, userId, lessonId, parentId?, orderKey, body jsonb, conflictOf? | `conflictOf` points to the section a conflicted copy came from (§6.4) |
| `Tag` | id, userId, name (citext), isSeeded | Unique (userId, name) among non-deleted rows, case-insensitive through citext; the seeded tags are copied into each new account |
| `SectionTag`, `LessonTag` | id, userId, tagId, sectionId / lessonId | Join rows with their own id and tombstone, so they sync like any other row; one non-deleted link per (section or lesson, tag) |
| `Takeaway` | id, userId, lessonId, text | |
| `Question` | id, userId, lessonId, text, status, answerSectionId? | |
| `Highlight` | id, userId, ref jsonb, colour, note?, promotedSectionId? | |
| `MemoryItem` | id, userId, ref jsonb, ease, interval, nextReviewAt, reviewCount | |
| `Citation` | id, userId, sourceType, sourceId, lessonId?, book, startOrd, endOrd | **Derived:** rebuilt from the source row on every write, on the server and on the device. Index on `(user_id, start_ord, end_ord)`. Never pushed by the client. |
| `SyncChange` | id (= change id), userId, deviceId, receivedAt, status (`applied`/`conflict`/`rejected`), error jsonb, resultRev | Makes each change idempotent and records what happened (§6) |
| `Device` | id, userId, name, lastSyncAt, clientVersion | Primary key (userId, id): the id is the device's own `syncState.deviceId`, and one device can sync with several accounts over its life (§6.6). Created on first sync; shown in account settings with "Sign out this device" |

`Citation` is the only table the client never writes to the server. Both sides compute it from the source rows with the same domain function, so it can't disagree.

### 5.3 Migrations
`prisma migrate dev` creates migrations locally and `prisma migrate deploy` applies them at release. Raw SQL in migrations adds what Prisma can't express: `citext`, partial unique indexes (`WHERE deleted_at IS NULL`), check constraints on enum-like text columns, and the `"C"` collation on `section.order_key` (fractional keys compare byte by byte). *Checked at M1-04: `prisma migrate dev` leaves all of these alone (no drift), and an integration test runs `prisma migrate diff --exit-code` against the migrated database.* Enum values: series kind `sermon_series`/`book_study`/`custom`, lesson source `sermon`/`personal`/`group`, question status `open`/`answered`/`parked`, highlight colour `yellow`/`green`/`blue`/`pink`, citation sourceType `lesson`/`section`/`highlight`/`memory_item`. Foreign keys cascade from the user (account deletion) and from a lesson to its contents; optional links (a lesson's series, a question's answer section, a highlight's promoted section, `conflictOf`) are set to null. `Citation.sourceId` and `SyncChange.deviceId` have no foreign key. The Prisma client is generated into `apps/api/src/generated/` (git-ignored) by the Turbo task `db:generate` and on install.

## 6. Sync

### 6.1 On the device
Dexie holds one table per synced entity (same fields as §5.2 minus `userId`), plus:
- `outbox`: `{ changeId, entity, entityId, op: 'upsert' | 'delete', baseRev, row, clientTime }`, in order.
- `syncState`: `{ cursor, lastPushAt, lastPullAt, clockOffsetMs, deviceId }`.

**Every user action is one Dexie transaction** that writes the entity tables, the derived citations and the outbox entry together. If the tab dies halfway, nothing from that action is saved and nothing is queued.

### 6.2 Push — `POST /api/sync/push`
Request: `{ deviceId, clientVersion, changes: Change[] }` (up to 100 changes, 1 MB at most). For each change, in order, the server opens **one transaction per change** and:
1. Returns the stored result if the `changeId` has already been processed (idempotent replay).
2. Validates the row with the entity's Zod schema and checks ownership of the row and every row it references (lesson, parent, tag).
3. Locks the user's revision counter: `UPDATE "user" SET sync_rev = sync_rev + 1 … RETURNING sync_rev` (§6.3).
4. Compares `baseRev` with the current row's `rev`. If they match, it applies the change. If not, it resolves the conflict (§6.4).
5. Recomputes the citations for the row, and writes the `SyncChange` result.

Response: one result per change: `applied` (new `rev`), `conflict` (resolution and new `rev`), or `rejected` (error code). Results are returned per change, so one bad change doesn't block the others. Later changes to the same entity are held on the device until the rejected one is resolved (shown in the sync panel).

### 6.3 Pull — `GET /api/sync/pull?cursor=<rev>&limit=500`
Returns every row of the user's with `rev > cursor`, tombstones included, ordered by `rev`, plus `{ nextCursor, hasMore, serverTime, minClientVersion }`.

**Why a per-user counter, not a global sequence:** with a global sequence, transaction A can take rev 10 and commit after transaction B commits rev 11. A device that pulled in between moves its cursor to 11 and never sees rev 10. Incrementing `User.syncRev` inside each write transaction locks that user's row, so one user's writes commit in revision order and a cursor can't skip a row. Different users don't block each other.

The device applies a pulled row **only if the outbox has nothing pending for that entity**. Otherwise it skips the row, since the server will send the merged result again after the push. A new device starts at cursor 0 and pages through ("Getting your notes… 1,240 / 3,000").

**Triggers:** on app start, when the device comes online, 2 s after the last local write (debounced), every 60 s while visible, and on "Sync now". Failures retry with exponential backoff (5 s up to 5 min).

### 6.4 Conflicts
A conflict is a change whose `baseRev` is older than the server row's `rev`, meaning another device changed the row since this one last saw it.

| Case | Resolution |
|---|---|
| Both sides changed a row, and it isn't a section body change on both | **Last write wins** by adjusted `updatedAt` (§6.5). The losing values are discarded. |
| Section `body` changed on both sides | The newer body stays on the section. The older body is saved as a **new sibling section** with `conflictOf` set and a label "Conflicted copy · <device> · <time>". Nothing typed is lost; the user merges by hand and deletes the copy. |
| One side deleted, the other edited | **Edit wins**: the row is restored with the edit. |
| Both deleted | No-op. |
| A row references a parent that was deleted (e.g. a section added under a deleted lesson) | The parent is restored, so the new content is never left orphaned. |

These rules live in `domain/sync.ts` as pure functions with their own tests. The server only applies them.

### 6.5 Clocks
Every pull returns `serverTime`. The device stores `clockOffsetMs` and stamps `updatedAt` with `Date.now() + offset`, so last write wins compares adjusted times. If the offset is more than 5 minutes, the sync panel shows a warning.

### 6.6 Accounts and devices
- **Without an account:** the app works fully offline as a guest (PRD: no account required). Changes still go into the outbox. When the user signs up or signs in, the outbox is pushed and the guest data joins the account. Ids are UUIDs, so they can't collide. Seeded tags are matched by name.
- **Device owner:** `syncState.ownerUserId` records which account the local data last synced with (empty for a guest who has never signed in).
- **Sign out:** ends the session but **keeps the local notes**. They stay readable and editable as guest data, and edits keep going into the outbox. If the outbox isn't empty, the sign-out dialog says those changes will sync the next time this account signs in.
- **Signing in on a device that holds someone else's notes** (`ownerUserId` set and different): before anything syncs, the app asks **"This device has notes from another account"**. The choices are *Remove them from this device* (the default; deletes the local copy, then pulls the new account) and *Add them to this account*. That option copies every local row with **new ids** (references remapped), because the original ids belong to the other account on the server. It then replaces the outbox with the copies. If the outbox held unsynced changes, the dialog warns that those changes go only to the new account, not to the account they came from. Nothing from one account reaches another without that choice.
- **Settings → "Remove notes from this device"** lets a signed-out user wipe the local copy, e.g. on a shared computer.
- **Expired session while offline:** local work continues. The outbox waits until the user signs in again.
- **Client too old:** the server answers `426` when `clientVersion < minClientVersion`, and the app shows "Update required" (§8.6).

## 7. API (`apps/api`)

### 7.1 Modules

| Module | Endpoints |
|---|---|
| `health` | `GET /api/health`: version, DB reachable (503 `SERVICE_UNAVAILABLE` when not) |
| `auth` | `POST /api/auth/signup`, `/login`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/change-password`; `GET /api/auth/me` |
| `sync` | `POST /api/sync/push`, `GET /api/sync/pull` |
| `account` | `GET /api/account/devices`, `DELETE /api/account/devices/:id`, `DELETE /api/account` (deletes the account and all data) |
| `admin` (CLI only) | `nest-commander` commands: `user:create`, `user:disable`, `user:verify`. Phase 1 has no admin UI. |

- **Validation:** `@Body({ schema })` and `@Query({ schema })` with `StandardSchemaValidationPipe`, using Zod schemas from `packages/domain`. Responses are typed with the same schemas.
- **Errors:** one shape, `{ errorCode, message, details? }`, using the `errorCode` that NestJS 12 adds to `HttpException`.
- **Data access:** a `PrismaService` wraps the generated client (`@prisma/adapter-pg`). Every repository method takes `userId` as its first argument. Integration tests check that one user can never read or write another user's rows (§10.2).
- **Config:** `@nestjs/config` with a Zod `validationSchema`. The app refuses to start if `.env` is invalid.
- **Logging:** the NestJS `ConsoleLogger` with structured params, written as JSON to journald in production. Request bodies are never logged.

### 7.2 Auth
- **Passwords:** argon2id (`@node-rs/argon2`), at least 10 characters, checked against the zxcvbn-ts common-password list.
- **Sessions:** an opaque 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie. The expiry is **90 days, renewed on use**, long enough for a month offline. A password change or reset ends every other session.
- **Same origin:** the web app and the API are served from one origin (Caddy routes `/api` to Nest), so there's no CORS. CSRF protection is SameSite cookies plus an `Origin` check on every non-GET request.
- **Email verification:** required before the first **push**. Until then the app works locally and the sync panel says "Verify your email to back up your notes".
- **Rate limits:** `@nestjs/throttler` on login, sign-up and the email endpoints (per IP and per email). Five failed logins for one email lock it for 15 minutes.
- **Sign-up switch:** `SIGNUP_ENABLED=false` hides registration (for a private family deployment).

### 7.3 Email
Nodemailer over SMTP, sending through **Resend** in production (the domain verified with SPF and DKIM). In development and tests, emails are written to `apps/api/tmp/emails/*.eml`. The E2E tests read verification and reset links from there. Templates are plain HTML plus a text version.

## 8. Web app (`apps/web`)

### 8.1 Stack
React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (in `packages/ui`), **TanStack Router** (typed routes), **Dexie** with `useLiveQuery` for all data, **TanStack Query** only for the few server calls (auth, account, sync status), react-hook-form with the Zod resolver.

*Set up in M1-06:*
- **shadcn/ui on Base UI** (`base-nova` style, the CLI's default) rather than Radix. Components live in `packages/ui/src/components` and import each other through the package name (`@lamp/ui/lib/utils`), as the shadcn monorepo layout expects; the app imports them the same way (`@lamp/ui/components/button`) and its own code through `@/`. Run `pnpm dlx shadcn@<version> add <name>` from `apps/web`, which writes into `packages/ui`.
- `packages/ui/src/styles/globals.css` holds Tailwind, the tokens and `@theme inline`; the app imports it once (`@lamp/ui/globals.css`). It uses system fonts until the UX pass picks reading fonts.
- **File-based routes** in `apps/web/src/routes`; the router Vite plugin writes `src/routeTree.gen.ts` on `dev` and `build`. The file is committed so typecheck works without a build, and is excluded from lint and Prettier.
- Vite serves on `:5173` and proxies `/api` to `LAMP_API_URL` (default `http://127.0.0.1:3000`); `vite preview` (`:4173`) reuses the proxy.

### 8.2 Data flow
Screens read with `useLiveQuery`, so any local write, including one applied from a pull, re-renders them. Writes go through **action functions** (`createLesson`, `addSection`, `promoteQuestion` …) in `src/data/actions/`. Each one is a single Dexie transaction (§6.1). Components never write to Dexie directly.

### 8.3 Editor
**TipTap** (ProseMirror) with:
- A custom inline atom node `verse` that renders a chip (display reference, translation label; tap to expand the snapshot text).
- A suggestion plugin for the verse autocomplete (F3). It opens when the text before the cursor parses as a book name or reference, shows `suggest()` results with a preview from the local Bible JSON, and inserts the `verse` node on Enter or tap.
- Autosave: changes are debounced at 500 ms into a `updateSection` action. A section never has unsaved state for more than a second.

### 8.4 Search and verse index
- **Free text:** MiniSearch in a Web Worker, built from the plain text of sections, takeaways and questions at startup and updated after each action and pull. Target: 5,000 sections indexed in under 1 s on a mid-range phone.
- **Verses and tags:** Dexie queries on `citations` (`startOrd`/`endOrd` index) and on the join tables. The search box detects a reference with `parseReference` and a `#tag` prefix.
- The server keeps no search index in phase 1, since every device holds the full data. Postgres full-text search waits for phase 2 groups.

### 8.5 Theme
- Presets live in `packages/ui/src/themes/*.css` as CSS variable sets for the shadcn tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--accent`, `--ring`, `--radius`, …), each with light and dark values. They're selected with `<html data-theme="parchment" class="dark">`.
- Tailwind v4 maps the tokens with `@theme inline`, so components use only semantic classes (`bg-background`, `text-primary`) and never raw colours.
- Presets (the "reading-room" set): *Parchment* (default: cream paper, ink brown, burgundy accent), *Vellum* (off-white, charcoal, gold), *Olive* (soft sage, deep olive), *Slate* (cool grey, blue-slate), *Cedar* (warm wood tones, amber), *Midnight* (deep navy, soft gold; dark first). Exact colours are tuned in the UX pass and must pass the contrast test.
- The choice is stored in `UserSettings` (synced) and mirrored to `localStorage`. A small inline script in `index.html` applies it before the first paint, so there's no flash of the wrong theme.
- A CI test checks WCAG AA contrast for every preset in both modes.

### 8.6 PWA
- `vite-plugin-pwa` (Workbox) in `injectManifest` mode: precaches the app shell; installable manifest; `navigator.storage.persist()` requested after sign-in or the first lesson.
- **Bible text:** WEB is downloaded in the background after the first load (about 1–1.5 MB compressed) and served cache-first. Settings show download progress and storage use.
- **Updates:** a new service worker waits. The app shows "New version — Reload" and never reloads by itself while an editor has focus or the outbox is mid-push.

### 8.7 Export (F11)
- **Markdown:** `toMarkdown` from `domain`, for one lesson or a whole series. It keeps section nesting, verse text with translation labels, tags, takeaways and questions.
- **PDF:** a print view of the same HTML with a print stylesheet, saved through the browser's "Save as PDF". It works offline and the output matches the screen. If one-tap download turns out to matter on phones, a lazily loaded generator can replace it later.

### 8.8 Review queue and notifications (F9, F10)
The queue is a local query: open questions, takeaways from the last `reviewWindowDays` (default 14), and memory items with `nextReviewAt ≤ today`. The weekly reminder is best effort. Phase 1 has no server push, and Periodic Background Sync only works in Chromium for installed apps. Elsewhere the app shows a badge count on the Review tab.

## 9. Bible text (`packages/bible-data`)

- **Phase 1 ships WEB only** (public domain). The pipeline, manifest and `translation` field on every reference already handle several translations, so adding open ones later (BSB, KJV) is a data change, not a code change.
- **Source:** WEB USFM from eBible.org. Its licence notice is kept in the package.
- **Build:** `pnpm --filter @lamp/bible-data build` → `dist/<translation>/<BOOK>.<hash>.json` (`{ "c": [[ "v1 text", "v2 text", … ], …] }`) with footnotes, cross references, headings and word markup removed and the words unchanged (eBible's condition for keeping the "World English Bible" name; only line breaks collapse to single spaces), plus `manifest.json` (translations, licence, source checksum, and per book the file, content hash, size and verse counts). Files are named by content hash and served as immutable static files. Two optional fields, decided 2026-10-13: `d` keeps titles outside the verse numbering by the `"c:v"` they precede (the 138 Psalm titles and Psalm 119 letters), and `n` keeps the footnote for each verse WEB leaves empty. The build fails if a book or verse is missing or the counts differ from the domain book table. *M1-12:* 66 files, 4.09 MB, about 1.26 MB gzipped; eBible's `copr.htm` notice ships unchanged beside them. `passageVerses` and `passageText` in the package do the lookup.
- **Text lookup:** `getText(ref, translation)` in the web app loads the book file from the service worker cache and slices it. The server never needs Bible text in phase 1. It validates references against the book table only.
- **Source files:** not committed. `pnpm --filter @lamp/bible-data download` fetches the eBible.org zip, checks the checksum pinned in `src/sources.ts` and unzips it into `packages/bible-data/source/eng-web/` (gitignored); `build` runs it when the source is missing. CI restores `source/` from a cache keyed on `src/sources.ts` before the unit and build jobs, and the package's Turbo inputs include the source's checksum stamp, so a cached run without the source is never reused. A new zip from eBible.org fails the download until the checksum is updated by hand. `@lamp/bible-data` tests compare the domain book table with that source chapter by chapter.
- **Versification:** the book table uses WEB's chapter and verse counts, and WEB numbers are the canonical ones. Typed KJV numbers that WEB puts elsewhere are mapped by `domain/versification.ts`. A diff of the eBible.org KJV and WEB texts found only one such place: WEB prints the Romans doxology at 14:24–26 (KJV 16:25–27) and keeps 16:25 as an empty verse. Matthew 23:13–14 come in the opposite order in WEB, but both numbers exist there, so they follow WEB. WEB also has empty, footnote-only verses at Luke 17:36, Acts 8:37, 15:34 and 24:7; the book files keep them as `""` with the footnote in `n`, and M2-09 decides how a chip shows them. With a second translation (phase 2), a reference past the end of a chapter in that translation shows "Not in this translation".
- **Chips and translations:** a chip always shows its snapshot with its translation label. Expanding it offers "View in …" for any other downloaded translation, and hides that option while WEB is the only one.
- **More open translations, ESV and other licensed translations:** phase 2. Licensed ones go through a server proxy so the key never reaches the browser.

## 10. Testing

| Level | Tool | Runs against | Scope |
|---|---|---|---|
| Unit | Vitest | Nothing external | `domain` (parser, ordinals, doc model, SM-2, conflict rules: high coverage), `ui` (theme contrast), web components (Testing Library + happy-dom), API services with mocked dependencies |
| Web integration | Vitest + `fake-indexeddb` | In-memory IndexedDB | Actions write tables + citations + outbox atomically; pull apply rules; search index updates |
| API integration | Vitest + supertest | **Local Postgres `lamp_test`** | Every endpoint through a real Nest app: auth flows, sync push/pull, idempotency, conflict cases, per-user isolation, migrations |
| Sync contract | Vitest | `lamp_test` + two `fake-indexeddb` devices | The web sync engine running in Node against a real API instance: two devices edit offline, sync, and end up identical with the expected conflicted copies |
| E2E | Playwright | Built web + built API on **local Postgres `lamp_e2e`** | Sign up → verify (link from `tmp/emails`) → capture a lesson **offline** (`context.setOffline`) → reconnect → a second browser context (second device) sees it; conflict flow; theme switch; export |

### 10.1 Vitest setup for NestJS
NestJS dependency injection reads `design:paramtypes` metadata. The API's `vitest.config.ts` compiles tests with `unplugin-swc` (with `@swc/core`) and turns off Vite's own transform (`oxc: false`), so tests use the same compiler as `nest build` (SWC builder). *Checked at scaffold (M1-02): the NestJS 12 template doesn't add this, and Vite 8's Oxc transform does emit the metadata too, so SWC is for parity rather than strictly required.* The repo stays on **TypeScript 6** until 7.1: TypeScript 7.0 has no programmatic compiler API, which the Nest CLI needs. Add `vite-tsconfig-paths` if path aliases are used.

### 10.2 Test databases (no Docker)
- `scripts/dev-db.sh` (idempotent) uses the local Postgres (Postgres.app 18 on macOS, the distro package on Linux) to create the role `lamp` and the databases `lamp_dev`, `lamp_test` and `lamp_e2e`, and writes the connection strings to `apps/api/.env.local` and `.env.test`. Only creating the role needs an admin: the script uses `$PG_ADMIN` if set, else your own user when it is a superuser or has `CREATEROLE` (Postgres.app), else `sudo -u postgres psql` (the Linux package). Everything else runs as `lamp`, which has `CREATEDB` for Prisma's shadow database. `.env.test` also holds `E2E_DATABASE_URL` for Playwright.
- **Integration tests:** a Vitest `globalSetup` runs `prisma migrate reset --force` on `lamp_test` once per run (Prisma 7 no longer seeds on reset), after checking that the database name ends in `_test`. Prisma refuses to reset when an AI agent runs it unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` carries the user's consent; Turbo passes `PRISMA_*` through for `test:int`. Each test file then truncates all tables in `beforeEach` (one `TRUNCATE … RESTART IDENTITY CASCADE`). Test files run one at a time (`fileParallelism: false`). If the suite gets slow, switch to one database per Vitest worker, cloned from a migrated template database.
- **API integration tests** boot the real `AppModule` with `createTestApp()` (`apps/api/test/int/app.ts`) and call it through supertest; `test/health.int.test.ts` is the pattern (one app per file, `truncateAll` in `beforeEach`).
- **E2E** (`apps/e2e`, `pnpm e2e`): `turbo run e2e` builds the workspace dependencies first, then Playwright starts the built API (`node dist/main.js` on `:3100`, so a running `pnpm dev` is never reused) and `vite preview` (`:4173`, proxying `/api` to `:3100`) through `webServer`; tests use the preview URL as `baseURL`, and its `globalSetup` resets `lamp_e2e` (Playwright starts the web servers before the global setup; the API only connects on its first query). The database URL comes from `E2E_DATABASE_URL`, else `apps/api/.env.test`, and must name a `*_e2e` database. Tests run one worker at a time against the one database. Browser tests run in **Chromium only** (`pnpm --filter @lamp/e2e exec playwright install chromium`); Safari on the iPhone is checked by hand on a real device.
- **CI (GitHub Actions):** installs PostgreSQL 18 from the PGDG apt repository on the Ubuntu runner and starts it, with no containers, so CI matches local and production. Jobs are lint + typecheck, unit, integration, and E2E (Chromium), all through Turbo with remote caching off.

## 11. Deployment (VPS)

### 11.1 Server
Ubuntu 24.04 LTS · Node 24 LTS · PostgreSQL 18 (PGDG) · **Caddy** (automatic HTTPS, serves `apps/web/dist` and the Bible JSON, proxies `/api/*` to `127.0.0.1:3000`, sets security headers) · the API runs as a **systemd** service under its own user · `.env` at `/etc/lamp/api.env` (mode 600).

### 11.2 Release
On a `v*` tag, GitHub Actions builds:
- `apps/web/dist` and `packages/bible-data/dist`.
- The API bundled into one ESM file with tsup or Rspack, with the workspace packages inlined and production dependencies installed alongside, plus the Prisma client and migrations.

It then copies the release to `/srv/lamp/releases/<version>`, runs `prisma migrate deploy`, switches the `current` symlink and runs `systemctl restart`. The previous five releases are kept for rollback. Migrations must stay backward compatible for one release: add first, drop in a later release.

### 11.3 Operations
- Backups: **daily VPS provider snapshots** of the whole server, plus a nightly `pg_dump -Fc` to `/var/backups/lamp` (kept 14 days) so the snapshots always hold a clean database dump that can be restored on its own. Restore tested monthly. *Risk: both copies live with one provider; add an off-provider bucket later if the data grows important to others.*
- `GET /api/health` is watched by an uptime monitor.
- Errors go to **Sentry** (free tier) from the API and the web app, only when `SENTRY_DSN` is set, so self-hosted copies send nothing. Note text and request bodies are scrubbed before sending.

## 12. Security and privacy
- Notes are personal: no analytics on content, and logs never contain request bodies or note text.
- Every query is scoped by `userId` (§7.1), and the isolation tests are part of the integration suite.
- Rich text is rendered from validated ProseMirror JSON by TipTap. User HTML is never inserted into the page.
- The push body size is capped, and the size of each entity field is capped by Zod.
- Caddy sets CSP (`default-src 'self'`; scripts by hash for the theme snippet), HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- Account deletion removes every row the user owns in one transaction and ends all sessions.

## 13. Local development

```bash
nvm use                      # Node 24 (from .nvmrc)
pnpm install
./scripts/dev-db.sh          # role + lamp_dev / lamp_test / lamp_e2e on local Postgres
pnpm db:migrate              # prisma migrate dev on lamp_dev
pnpm dev                     # turbo: web on :5173, api on :3000 (Vite proxies /api)
pnpm test | test:int | e2e
```
Development emails land in `apps/api/tmp/emails/`. `pnpm db:seed` creates a demo user with a few lessons.

## 14. Performance budgets
- First load (app shell, without Bible text): ≤ 250 KB of JavaScript, gzipped.
- Opening a lesson with 50 sections: < 100 ms from IndexedDB on a mid-range phone.
- Autocomplete suggestion: < 30 ms per keystroke.
- First sync of 3,000 rows on a new device: < 10 s on 4G.

## 15. Decisions log

The product decisions below were settled on 2026-10-12 and are reflected in the sections listed.

| # | Question | Decision | Where |
|---|---|---|---|
| 1 | Can the app be used without an account? | Yes: guest until sign-up; guest notes join the account | §6.6 |
| 2 | Which translations ship in phase 1? | WEB only | §9 |
| 3 | What do verse chips show if the default translation changes? | The captured snapshot with its label; "View in …" for other downloaded translations | §4.1, §9 |
| 4 | Seeded tags, and tags on lessons? | 24 core themes; tags apply to sections and lessons | §4.3, §5.2 |
| 5 | PDF export | Print view + "Save as PDF" | §8.7 |
| 6 | Review window for takeaways | 14 days, adjustable in settings | §8.8 |
| 7 | What sign-out does to local notes | They stay on the device; another account signing in must choose to remove or adopt them | §6.6 |
| 8 | Admin UI | None in phase 1; CLI commands only | §7.1 |
| 9 | Project licence | MIT | — |
| 10 | App name | Lamp | — |
| 11 | Theme presets | Reading-room set: Parchment, Vellum, Olive, Slate, Cedar, Midnight | §8.5 |
| 12 | Hosting, email, errors | Existing VPS provider; Resend; Sentry free tier | §11 |
| 13 | Backups | Provider snapshots plus a local nightly dump | §11.3 |
| 14 | Sign-up and sessions | Open sign-up, verify before first sync; 90-day sessions renewed on use (confirmed) | §7.2 |
| 15 | Parser rules for ambiguous input (2026-10-13) | Ambiguous names list the candidates; unnumbered books win; bare numbers in one-chapter books are verses; part-verse letters dropped | §4.1 |
| 16 | KJV verse numbers (2026-10-13) | Accepted and moved onto WEB's numbers, with the typed reference kept as `mappedFrom` | §4.1, §9 |
| 17 | WEB source files (2026-10-13) | Downloaded by a script with a pinned checksum, gitignored, cached in CI | §9 |
| 18 | Section order keys (2026-10-13) | The `fractional-indexing` package; ties broken by id | §4.3 |
| 19 | Verse chips in Markdown export (2026-10-13) | Reference in the sentence, snapshot quoted after the paragraph | §4.2 |
| 20 | `rev` on the wire (2026-10-13) | A plain number; the API converts Postgres bigint at the edge | §4.3 |
| 21 | Psalm titles (2026-10-13) | Kept in the book files' `d` field, outside the verse text | §9 |
| 22 | Empty WEB verses (2026-10-13) | `""` in the text, with the footnote kept in the `n` field | §9 |

**Still open:** nothing blocks phase 1. Exact preset colours are tuned in the UX pass; mapping between other translations' numbering waits for a second translation in phase 2.

## 16. PRD changes this design implies (applied in PRD v1.1)
- **Architecture:** phase 1 now has a server (NestJS + Postgres) and accounts, with guest use still allowed. The "no backend" wording and the *Architecture* table need rewriting.
- **Sync moves into phase 1.** Cross-device sync was a phase 2 item. Phase 2 keeps sharing, groups and comments.
- **F13 (ESV) moves to phase 2**, together with any second translation. The translation table lists WEB only for phase 1, and F3 and F12 drop their ESV wording.
- **Non-goals:** remove "Cloud sync between devices"; add "ESV and any second translation".
- **F4:** the seeded list is the 24 themes in §4.3, and tags apply to lessons as well as sections.
- **F9:** "recent takeaways" means the last 14 days, adjustable in settings.
- **F11:** PDF is made through the browser's print view.
- **Open questions:** tick framework/storage, ESV terms (deferred), chips vs snapshot, seeded tags, licence (MIT).
- **BACKLOG:** rewritten as v2.0 with seven milestones; accounts and sync are M3.
