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
| Email | Resend through its SDK in production; `.eml` files in development and tests | Q&A; changed 2026-10-13 (decision 50) |
| Errors | Sentry free tier, content scrubbed, off unless `SENTRY_DSN` is set | Q&A |
| Theme | Per user: a look (Classic, Folio, Soft, Lamplight), one of six reading-room presets for Classic (§8.5), plus light / dark / system, synced across devices | Q&A; looks 2026-10-13 |
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
├─ docs/              PRD, TECH-DESIGN, BACKLOG, UX-PATTERNS, wireframes/, decisions/
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
  - **Sync** (`sync.ts`): a change is `{ changeId, baseRev, clientTime, entity, entityId, op, row }`. An upsert carries the whole row without `rev` (its id must equal `entityId`) and, from M3-07, the optional `changed` field list (§6.4); a delete carries no row. Settings are one row per account, so their changes have no `entityId` and are upserts only. Push takes 1–100 changes; each result is `applied`, `conflict` (with a `resolution` and, for a conflicted copy, its `copyId`) or `rejected`. The pull query coerces its string parameters and defaults `limit` to 500.
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
| `Session` | id, userId, tokenHash, createdAt, lastSeenAt, expiresAt, userAgent, deviceId? | Opaque cookie token; only its SHA-256 is stored. `deviceId` is the device it syncs from, set by its first push or pull, so a device can be signed out (§6.6) |
| `EmailToken` | id, userId, kind (`verify`/`reset`), tokenHash, expiresAt, usedAt | Single use |
| `UserSettings` | userId (PK), themePreset, colorMode (`light`/`dark`/`system`), look (`classic`/`folio`/`soft`/`lamplight`), defaultTranslation, reviewWindowDays, autoPreviewVerses, rev, updatedAt | Synced like other entities |
| `Series` | id, userId, title, description, kind, … | |
| `Lesson` | id, userId, seriesId?, title, date (`date`), source, speaker?, church?, mainPassages jsonb | |
| `Section` | id, userId, lessonId, parentId?, orderKey, body jsonb, conflictOf?, conflictDevice? | `conflictOf` points to the section a conflicted copy came from, `conflictDevice` names the device that wrote its body (§6.4) |
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

*Built in M2-01 (`apps/web/src/data`):*
- **Tables** are named after the sync entities (`lesson`, `section`, `sectionTag` …) and hold the rows exactly as the domain schemas define them, so a pulled row is stored as is. `userSettings` and `syncState` are one row each, under fixed keys. `citation` is indexed on `sourceId`, `lessonId`, `startOrd` and `endOrd`; `outbox` on an auto-increment `seq` (push order) and `[entity+entityId]` (the pull check in §6.3).
- **`action(db, run)`** opens one read-write transaction over every table and hands `run` a writer: `create`, `update`, `remove` (a tombstone) and `updateSettings`. Each write fills in the sync fields (a new UUIDv7 id, `rev` 0 for a new row, `updatedAt` from the clock-adjusted time of the action), validates the row with its domain schema, rebuilds the row's citations with `citationsFor` (in `domain`, so the server uses the same function) and appends the change to the outbox with the row's current `rev` as `baseRev`. Anything thrown aborts the whole action. Actions in `src/data/actions/` wrap it; the engine merges queued upserts of one row before a push (M3-09, §6.3).
- **First run** (`ensureDevice`) creates `syncState` with a new device id, the default settings and the 24 seeded tags, once, even with several tabs open. The seeded tags are queued, since notes will link to them; the default settings are not, so a guest who later signs in takes the account's settings instead of overwriting them with this device's defaults. The initial theme comes from the `localStorage` mirror (§8.5). Dexie v3 adds `look` to a stored settings row as `classic`, unqueued like the defaults.

### 6.2 Push — `POST /api/sync/push`
Request: `{ deviceId, clientVersion, changes: Change[] }` (up to 100 changes, 1 MB at most). For each change, in order, the server opens **one transaction per change** and:
1. Returns the stored result if the `changeId` has already been processed (idempotent replay).
2. Validates the row with the entity's Zod schema and checks ownership of the row and every row it references (lesson, parent, tag).
3. Locks the user's revision counter: `UPDATE "user" SET sync_rev = sync_rev + 1 … RETURNING sync_rev` (§6.3).
4. Compares `baseRev` with the current row's `rev`. If they match, it applies the change. If not, it resolves the conflict (§6.4).
5. Recomputes the citations for the row, and writes the `SyncChange` result.

Response: one result per change: `applied` (new `rev`), `conflict` (resolution and new `rev`), or `rejected` (error code). Results are returned per change, so one bad change doesn't block the others. Later changes to the same entity are held on the device until the rejected one is resolved (shown in the sync panel).

*Built in M3-06 (`apps/api/src/sync`):*
- **Request:** the body is checked against `pushEnvelopeSchema`, which needs only a `changeId` on each change; each change is then parsed with `changeSchema` on its own, so a bad row is one rejected result, not a `400` for the batch. The JSON body limit is 1 MB for every route (`413 PAYLOAD_TOO_LARGE`). An unverified account gets `403 EMAIL_NOT_VERIFIED` and nothing is applied.
- **Order inside each transaction:** the user row is locked first (`SELECT … FOR UPDATE`), then the stored result is looked up, then the change is checked and applied, and only an applied change takes `sync_rev + 1`. So a replay, a rejection or a concurrent push of the same batch never moves `syncRev`, and the rows read for the checks can't change before the write.
- **Checks:** the row id must not belong to another account (`ID_TAKEN`); every id the row names (series, lesson, parent, conflict source, tag, answer or promoted section) must be a row of this account, a section's parent must be in the same lesson, and no row names itself (`REFERENCE_NOT_FOUND`); a delete needs an existing row (`NOT_FOUND`). A unique index the database checks, such as a tag name, gives `DUPLICATE`. Rejection messages name the failing fields, never their values.
- **Writes:** an upsert writes the whole row with the new `rev`; a delete sets `deletedAt` (kept if already set) and `updatedAt` to the change's `clientTime`. Citations are rebuilt with `citationsFor`. Applied and rejected results are stored in `sync_change` (`error` holds the code and message) and returned as they are on a replay.
- **Conflicts:** a `baseRev` other than the row's `rev` (0 for a new row) is settled by the §6.4 rules (built in M3-07, below).

### 6.3 Pull — `GET /api/sync/pull?cursor=<rev>&limit=500&deviceId=<id>&deviceName=<name>&clientVersion=<version>`
Returns every row of the user's with `rev > cursor`, tombstones included, ordered by `rev`, plus `{ nextCursor, hasMore, serverTime, minClientVersion }`.

**Why a per-user counter, not a global sequence:** with a global sequence, transaction A can take rev 10 and commit after transaction B commits rev 11. A device that pulled in between moves its cursor to 11 and never sees rev 10. Incrementing `User.syncRev` inside each write transaction locks that user's row, so one user's writes commit in revision order and a cursor can't skip a row. Different users don't block each other.

*Built in M3-08 (`apps/api/src/sync/pull.service.ts`; decided 2026-10-13):*
- **One snapshot:** a page is read in one `REPEATABLE READ` transaction. The user lock makes one account's revs commit in order, but the pull reads eleven tables, and separate reads would each see a different moment: a push could commit rev 10 in a table already read and rev 11 in one not yet read, and the cursor would pass rev 10. From one snapshot, the page holds every rev up to its newest.
- **Whole revs:** a conflicted copy and restored parents share their change's rev, so a page never ends partway through a rev. Each table is read up to `limit + 1` rows, the lists are merged by rev; if row `limit + 1` shares a rev with the page's last rows, the page stops before that rev, and a single rev larger than `limit` comes whole. `nextCursor` is the last row's rev (the cursor itself when the page is empty).
- **Order:** by rev, and within a rev parents first (the order of `ENTITY_NAMES`: settings, series, lesson, section, tag, then links and the rest). Each row is the device's row (`ENTITY_SCHEMAS`, `rev` included), tagged with its entity; settings carry no id.
- **Access:** a session and a verified email, as for push (`403 EMAIL_NOT_VERIFIED`).
- **`remaining`** (added in M3-09, decided 2026-10-13): the rows after the request's cursor, this page's included, counted in the same snapshot, so first-sync progress can show "1,240 of 3,000".
- **Client version (§6.6):** push and pull both carry `clientVersion` (`major.minor.patch`, from the web app's package.json; anything else is a `400`). Older than `MIN_CLIENT_VERSION` gets `426 UPGRADE_REQUIRED` with `details.minClientVersion`, before anything is read or applied. `MIN_CLIENT_VERSION` is a constant in `domain/client-version.ts`, `0.0.0` for now, raised in the release that changes what sync carries.

The device applies a pulled row **only if the outbox has nothing pending for that entity**. Otherwise it skips the row, since the server will send the merged result again after the push. A new device starts at cursor 0 and pages through ("Getting your notes… 1,240 / 3,000").

**Triggers:** on app start, when the device comes online, 2 s after the last local write (debounced), every 60 s while visible, and on "Sync now". Failures retry with exponential backoff (5 s up to 5 min).

*Built in M3-09 (`apps/web/src/sync`; decided 2026-10-13):*
- **The engine** (`SyncEngine`, one per app in `sync.ts`) runs push, then pull, under a Web Lock (`lamp-sync`), so tabs sharing the database take turns. Runs never overlap: a trigger during one asks for one more after it. The shell tells it who is signed in (`useSyncAccount`); a change of account or of its verification syncs at once. While a retry waits, the 2 s and 60 s triggers wait too; coming online and "Sync now" go at once.
- **Push** (`outbox.ts`): batches of up to 100 changes and under 900 kB, in outbox order, with `deviceName` from the user agent ("Chrome on Android") and `clientVersion` from the web app's package.json. Before each batch, a run of unsent upserts to one row, one right after another in the outbox, is merged into one change (first `changeId` and `baseRev`, last row and time, the union of `changed`), because the server only chains *applied* changes in a push: after a conflict, each queued autosave of a section would make its own conflicted copy. Only neighbours merge, so a row never moves past a change that refers to it, and a change once sent (`sent`) never merges, so a retry after a lost answer sends the same changes. An applied or settled result removes the change and moves the row's `rev` and the `baseRev` of its queued changes to the new rev; the server's version of a conflict comes in the pull.
- **Rejections** stay in the outbox with the server's code and message (`rejected`), and hold back later changes to that row; other rows go on. `discardRejected` drops one with the changes behind it: a row the server never had is removed, and for any other the cursor moves back before the row's rev so the next pull restores the server's copy. The sync panel's Discard (M3-11) calls it.
- **Pull** (`pull.ts`): each page is stored in one transaction, skipping rows the outbox has a change for, with citations rebuilt, then the cursor, `lastPullAt` and the clock offset (`serverTime` minus the request's midpoint). The rows go to `onRowsChanged`, so the search index updates as for an action.
- **Status** (`useSyncStatus`): `guest`, `synced`, `syncing`, `offline` (no answer), `failing` (an error answer; `failingSince` for the panel's 10 minutes), `unverified`, `signed-out` (401, or no session on a device that has synced), `update-required` (426; nothing more until a reload) and `other-account`; plus `progress` (`{ done, total, firstSync }`) while a pull runs. The status line and panel are built in M3-11 (below).
- **Owner** (§6.6, decided 2026-10-13): the engine only syncs when `syncState.ownerUserId` is empty or the signed-in account; an empty one is claimed on the first sync, so a guest's notes join the account. Another account's notes wait (`other-account`) for the dialog M3-10 added (§6.6).

### 6.4 Conflicts
A conflict is a change whose `baseRev` is older than the server row's `rev`, meaning another device changed the row since this one last saw it.

| Case | Resolution |
|---|---|
| Both sides changed a row, and it isn't a section body change on both | **Last write wins** by adjusted `updatedAt` (§6.5). The losing values are discarded. |
| Section `body` changed on both sides | The newer body stays on the section. The older body is saved as a **new sibling section** with `conflictOf` set and a label "Conflicted copy · <device> · <time>". Nothing typed is lost; the user merges by hand and deletes the copy, or taps "Keep this instead", which moves the copy's body onto the section and deletes the copy in one local action. |
| One side deleted, the other edited | **Edit wins**: the row is restored with the edit. |
| Both deleted | No-op. |
| A row references a parent that was deleted (e.g. a section added under a deleted lesson) | The parent is restored, so the new content is never left orphaned. |

These rules live in `domain/sync.ts` as pure functions with their own tests. The server only applies them.

*Built in M3-07 (`packages/domain/src/sync.ts`, `apps/api/src/sync`; decided 2026-10-13):*
- **What each side changed.** An upsert carries `changed`: the fields this device edited since `baseRev` (the writer lists the patch's keys and `updatedAt`; a restore lists `deletedAt`; a new row sends none, meaning every field). The server keeps `section.body_rev`, the rev that last changed the body (server-only; existing rows start at their `rev`). So "the body changed on both sides" is exact: the device listed `body`, its body differs from the stored one, and `body_rev > baseRev`. Without these, a move on one device racing typing on the other would make a spurious copy, or put the old body back.
- **`resolveUpsert` / `resolveDelete`** take the stored row, its `rev`, the change and (for sections) whether the body changed on the server, and return the row to store, the resolution, an optional losing body for a copy, and whether anything the device sent was kept:
  - A current `baseRev`: the listed fields are written over the stored row (`applied`).
  - An edit of a row deleted on the server restores it with the edit (`edit-won`); a delete of a row edited since `baseRev` is dropped (`edit-won`); a delete of a deleted row keeps the first deletion (`already-deleted`).
  - A body edited on both sides: the row with the later `updatedAt` stays (the device's listed fields over the stored row if the device is later), and the other body becomes a copy (`conflicted-copy`).
  - Anything else is last write wins by `updatedAt`, ties to the server: `client-won` writes only the listed fields, so the server's edits to other fields survive; `server-won` keeps the stored row, except a body only the device edited, which is not part of what the server's write won.
  - Values are compared as JSON ignoring key order (`sameJson`), since `jsonb` reorders keys.
- **The conflicted copy** (`conflictedCopy`) is a new section with a server-made UUIDv7, the same lesson and parent, an order key between the section and its next live sibling, the losing body, `conflictOf` set, and `createdAt`/`updatedAt` of the losing write (the time in its label). Its id is the result's `copyId`. The label's device is `conflictDevice` (added in M3-11, below).
- **Parents** (`PARENT_COLUMNS`: a section's lesson and parent section, a tag link's tag and section or lesson, a takeaway's or question's lesson, a lesson's series) are restored, recursively and with their citations, whenever an edit is kept on a live row. With no other conflict the result is `parent-restored`. A losing edit restores nothing.
- **Every result takes a new rev**, `server-won` and `already-deleted` included, so a device that skipped the row while its change was queued (§6.3) pulls the settled row again. A conflict's resolution and `copyId` are stored in `sync_change` (`resolution`, `copy_id`) and replayed like any result.
- **One batch builds on itself:** a change with the same `baseRev` as an earlier *applied* change to the same row in the same push is taken as built on that change's rev, so a device's queued edits don't conflict with each other. After a conflict, later changes to that row are settled against the stored row as usual. Across pushes, the engine (M3-09) moves the `baseRev` of queued changes forward when a result comes back.

*Built in M3-11 (decided 2026-10-13):*
- **Where the label's device comes from** (decided 2026-10-13: stored, not left out): the server keeps `section.body_device`, server-only like `body_rev`, set to the pushing device's `deviceName` whenever a push changes the body. A conflicted copy gets a synced `conflictDevice`: the pushing device's name when its body lost, otherwise the stored body's `body_device` (null for a body written before this column, which the label shows as "another device"). `resolveUpsert` says which side lost (`copy.from`). Migration `20261013200000_conflict_device`; Dexie version 4 adds `conflictDevice: null` to stored sections and to queued section changes (the server's schema requires it) and indexes `conflictOf`, so a lesson counts its copies from the index alone.
- **In the editor** a copy is a section in a bordered group named by its label, "Conflicted copy · Firefox on macOS · today 09:41" (the copy's `createdAt`, the losing write's time), with **Keep this instead** and **Delete**. Keep (`keepConflictedCopy`, one action) puts the copy's body on its section, moves the copy's replies after the section's own and its tags onto the section, and deletes the copy; focus goes to the section's handle, since an editor with focus doesn't take a stored change. A copy whose section is gone becomes an ordinary section. Delete is the section delete, with Undo. The lesson list shows "1 conflicted copy" until none are left.

### 6.5 Clocks
Every pull returns `serverTime`. The device stores `clockOffsetMs` and stamps `updatedAt` with `Date.now() + offset`, so last write wins compares adjusted times. If the offset is more than 5 minutes, the sync panel shows a warning.

### 6.6 Accounts and devices
- **Without an account:** the app works fully offline as a guest (PRD: no account required). Changes still go into the outbox. When the user signs up or signs in, the outbox is pushed and the guest data joins the account. Ids are UUIDs, so they can't collide. Seeded tags are matched by name.
- **Device owner:** `syncState.ownerUserId` records which account the local data last synced with (empty for a guest who has never signed in).
- **Sign out:** ends the session but **keeps the local notes**. They stay readable and editable as guest data, and edits keep going into the outbox. If the outbox isn't empty, the sign-out dialog says those changes will sync the next time this account signs in.
- **Signing in on a device that holds someone else's notes** (`ownerUserId` set and different): before anything syncs, the app asks **"This device has notes from another account"**. The choices are *Remove them from this device* (the default; deletes the local copy, then pulls the new account) and *Add them to this account*. That option copies every local row with **new ids** (references remapped), because the original ids belong to the other account on the server. It then replaces the outbox with the copies. If the outbox held unsynced changes, the dialog warns that those changes go only to the new account, not to the account they came from. Nothing from one account reaches another without that choice.
- **Settings → "Remove notes from this device"** lets a signed-out user wipe the local copy, e.g. on a shared computer.
- **Expired session while offline:** local work continues. The outbox waits until the user signs in again.
- **Client too old:** the server answers `426` to a push or pull when `clientVersion < minClientVersion`, and the app shows "Update required" (§8.6).

*Built in M3-10 (`apps/web/src/sync`; decided 2026-10-13):*
- **Owner:** the first sync with an account claims a device whose `ownerUserId` is empty, and records `ownerEmail` too, so the dialog can name the other account (masked: "a•••@example.com").
- **Tags by name** (`tags.ts`, decided 2026-10-13: all tags, not only seeded ones): before each push, every live tag the server never took (rev 0, with no change sent and unanswered) whose name matches a synced tag in any case is merged into it. The local tag and its changes go; its links move to the synced tag as new changes (new `changeId`s, as the server answers a changeId it has seen with the stored result), and a link the synced tag already has on the same section or lesson is dropped. A device that has never pulled (cursor 0) pulls before it pushes, so a guest's 24 seeded tags meet the account's. The same step repairs a tag two devices made offline: the second is refused as `DUPLICATE`, the pull brings the first, and the next run merges them.
- **Notes from another account** (`OtherAccountDialog` in the shell, shown in phase `other-account`): *Remove* (`removeNotes`) clears every row, the citations and the outbox, seeds the 24 tags again and keeps the device id. *Add* (`copyNotes`) gives each live row a new id with its references remapped (the columns the server checks, §6.2), drops a row whose required parent wasn't copied, clears an optional reference that wasn't, and makes the outbox the copies' creates, so unsynced changes go only to the new account. Either way the settings stay at rev 0, unqueued, so the account's settings win; the owner changes and the cursor goes back to 0. *Cancel* signs out. The dialog can't be dismissed otherwise.
- **Sign-out** asks first, saying how many rows have unsynced changes (seeded tags never count); signed out, Settings says the changes sync at the next sign-in as that account.
- **Remove notes from this device** (Settings → Storage, signed out only; decided 2026-10-13): `removeNotes` without an owner, plus a new device id and the recent searches cleared. The look, mode and preset stay, and so does the Bible download.

*Devices, built in M3-12 (`apps/api/src/account/devices.service.ts`, `routes/_app/settings/devices.tsx`, `lib/devices.ts`; decided 2026-10-13: a session belongs to a device):*
- **Recorded on sync:** a push or pull that goes through upserts the `Device` row (name, version, `lastSyncAt`) and sets the session's `device_id`. A pull names the device as a push does (`deviceId`, `deviceName`), so a new device appears on its first sync, which is a pull. A refused sync (unverified, `426`) records nothing.
- **The list** (`GET /api/account/devices`) is the devices with a live session, most recently synced first. A device whose sessions ended (signed out here, by its own sign-out, or by a password change or reset) drops off until it signs in and syncs again; its row stays, so it comes back with its first-seen time.
- **Sign out** (`DELETE /api/account/devices/:id`, `204`) deletes every session of that device in the account, so its next request gets `401` and it keeps its notes, as in any sign-out. `404` when the account has no such device signed in. Signing out this device's own id also clears its cookie, though the screen doesn't offer it.
- **The screen** (`/settings/devices`, from Settings → Account "Devices · 2 devices ›"): this device first (its `syncState.deviceId`, without a Sign out), then the others with "Last synced 2 min ago · Lamp 1.0.0" and **Sign out**, which asks first. The last list is mirrored in `localStorage` with its account's id, so offline the list and the counts still show, with "Needs a connection to update"; with no copy, "The list needs a connection."
- **The count** shows in Settings and in the sync panel ("a•••@example.com · 2 devices"), from the same query, asked again at most once a minute.
- **Tests:** `devices.int.test.ts` (recording, the list, sign-out and its `401`, password changes, other accounts) and `e2e/tests/devices.spec.ts`: a laptop and a phone (two browser contexts) on one account; the laptop lists both, shows its copy offline, and signs the phone out; the phone's next sync gets `401`, it asks to sign in, and its lesson is still there.

*Status line and panel, built in M3-11 (`components/shell/sync-status.tsx`, `sync/status-view.ts`, `sync/rejected.ts`):*
- **One state shown** (`syncView`), first match wins: *update*, *signed out*, *verify*, *paused* (the other-account dialog is open), *guest*; then *problem* (a refused change, or a server failing for over 10 minutes), *offline* (no answer, or the browser offline), *synced*, else *syncing*. A signed-in device before the engine's first run counts as syncing, not as a guest. "Syncing…" shows only after a second; until then the previous state stays.
- **The line** is a button with an `<output>` (polite `status`), in the phone's header and the laptop's sidebar foot; the destructive colour only for the states that need the user. "Offline · N waiting" counts rows with unsynced changes, as the sign-out dialog does (seeded tags never count).
- **The panel** is a bottom sheet on a phone, a popover on a laptop. It shows the state's line and its one action (Resend email, Sign in, Reload to update), first-sync progress ("1,240 of 3,000"), "Last synced today at 09:41" from this session's sync or else the stored `lastPullAt`, the masked email with the device count (from the devices list, M3-12) and **Sync now**. A clock more than 5 minutes off (§6.5) gets a warning.
- **Refused changes** are listed with what they were ("Section in "The Good Shepherd""), the reason in words by error code, the server's code and message as details, **Open** (the lesson, scrolled to the section, takeaway or question; the series; the tag; Settings) and **Discard** (`discardRejected`, then a sync).
- **Reload to update** waits for writes in flight, asks the service worker to look for a new version, lets a waiting one take over, and reloads.
- **Tests:** `status-view.test.ts` (every state and its words), `rejected.test.ts` (descriptions, the Dexie upgrade), `sections.test.ts` (Keep this instead), and `e2e/tests/sync-status.spec.ts`, which shows every state in the browser against a mocked API (`page.route` for `/api/auth/me` and the sync endpoints).

## 7. API (`apps/api`)

### 7.1 Modules

| Module | Endpoints |
|---|---|
| `health` | `GET /api/health`: version, DB reachable (503 `SERVICE_UNAVAILABLE` when not) |
| `auth` | `POST /api/auth/signup`, `/login`, `/logout`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/change-password`; `GET /api/auth/me` |
| `sync` | `POST /api/sync/push`, `GET /api/sync/pull` |
| `account` | `GET /api/account/devices`, `DELETE /api/account/devices/:id`, `DELETE /api/account` (deletes the account and all data; the body carries the current password, checked again; §7.2) |
| `admin` (CLI only) | `nest-commander` commands: `user:create`, `user:disable`, `user:enable`, `user:verify`. Phase 1 has no admin UI. |

- **Validation:** `@Body({ schema })` and `@Query({ schema })` with `StandardSchemaValidationPipe`, using Zod schemas from `packages/domain`. Responses are typed with the same schemas.
- **Errors:** one shape, `{ errorCode, message, details? }`, using the `errorCode` that NestJS 12 adds to `HttpException`.
- **Data access:** a `PrismaService` wraps the generated client (`@prisma/adapter-pg`). Every repository method takes `userId` as its first argument. Integration tests check that one user can never read or write another user's rows (§10.2).
- **Config:** `@nestjs/config` with a Zod `validationSchema`. The app refuses to start if `.env` is invalid.
- **Logging:** the NestJS `ConsoleLogger` with structured params, written as JSON to journald in production. Request bodies are never logged.

*Admin CLI, built in M3-04 (`apps/api/src/cli.ts`, `src/admin`):*
- **Entry:** `CommandFactory.run(CliModule)`. `CliModule` loads the same validated config and `PrismaModule` as the API, and nothing of HTTP (no guards, throttles or mail). `nest build` compiles it next to `main.js` as `dist/cli.js`; `pnpm cli` builds, then runs it (README). The bundled release (M7-02) has to ship it too.
- **Commands** take the email (citext, so any case). `user:create` sets the role (`--role`, checked in the command, since nest-commander lists choices without enforcing them) and marks the email verified, since the admin vouches for it; it ignores `SIGNUP_ENABLED` and applies the sign-up schema and the common-password list. `user:disable` sets `disabledAt` and deletes the account's sessions in one transaction; `user:enable` undoes it (added so a mistaken disable needs no SQL). Repeating a command reports that nothing changed and succeeds.
- **The password** is never an argument (shell history). At a terminal it is asked twice, masked (nest-commander's `InquirerService`); otherwise it is the first line of stdin. `PasswordInput` is the one seam, replaced in the integration tests (`admin.int.test.ts`).
- **Errors:** a `CliError` prints its message alone and exits 1; anything else prints in full.

### 7.2 Auth
- **Passwords:** argon2id (`@node-rs/argon2`), at least 10 characters, checked against the zxcvbn-ts common-password list.
- **Sessions:** an opaque 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie. The expiry is **90 days, renewed on use**, long enough for a month offline. A password change or reset ends every other session.
- **Same origin:** the web app and the API are served from one origin (Caddy routes `/api` to Nest), so there's no CORS. CSRF protection is SameSite cookies plus an `Origin` check on every non-GET request.
- **Email verification:** required before the first **push**. Until then the app works locally and the sync panel says "Verify your email to back up your notes".
- **Rate limits:** `@nestjs/throttler` on login, sign-up and the email endpoints (per IP and per email). Five failed logins for one email lock it for 15 minutes.
- **Sign-up switch:** `SIGNUP_ENABLED=false` hides registration (for a private family deployment).

*Built in M3-01 (`apps/api/src/auth`):*
- **Guards:** two global guards, in order. `OriginGuard` refuses any request other than GET, HEAD and OPTIONS unless its `Origin` names the host it was sent to (`403 BAD_ORIGIN`). The app and the API share one origin, and Caddy and Vite's proxy pass `Host` through, so nothing is configured. `SessionGuard` then needs a session on every route not marked `@Public()` (health, sign-up, login, logout) and puts the user on the request for `@CurrentUser()`.
- **Sessions:** the cookie is `lamp_session` (`Path=/api`, `HttpOnly`, `Secure`, `SameSite=Lax`, 90-day `Expires`). A session last seen over an hour ago gets another 90 days and the cookie is sent again, so renewal writes at most once an hour. An expired session is deleted when it is next used; a disabled user's sessions are refused. The cookie is `Secure` everywhere except under `pnpm dev` (`NODE_ENV=development`), so a phone on the LAN can sign in over plain HTTP; tests keep it, since browsers accept `Secure` cookies on localhost and 127.0.0.1.
- **Passwords:** argon2id at 19 MiB, 2 passes, 1 lane. The common-password list is `@zxcvbn-ts/language-common` (`400 PASSWORD_TOO_COMMON`). A login for an unknown email still verifies against a dummy hash, and answers exactly like a wrong password (`401 INVALID_CREDENTIALS`).
- **Lockout and rate limits:** five failed logins for one email within 15 minutes lock that email for 15 minutes (`429 ACCOUNT_LOCKED` with `retryAfterSeconds`), whether or not an account has it. `@nestjs/throttler` allows 30 requests per IP and 10 per email in 15 minutes to sign-up, login and the email endpoints (§7.3) (`429 TOO_MANY_REQUESTS`). Both are in memory: the API is one process, and a restart only forgets the counts. `trust proxy` is `loopback`, so `req.ip` is the client behind Caddy.
- **Validation:** a global `StandardSchemaValidationPipe` answers `400 VALIDATION_FAILED` with `details.issues` (path and message, never the value sent).
- **Sign-up** creates only the user and its session, and sends the verification email (§7.3). The default settings and seeded tags for the account come with the guest data (§6.6), so a guest's own settings and tags aren't overwritten by server defaults.

*Built in M3-03 (`apps/api/src/auth`, `src/account`):*
- **Asking for the password again** (`AuthService.confirmPassword`): a wrong answer is `403 WRONG_PASSWORD`, not `401`, so the app doesn't take it for a lost session. Wrong answers count towards the login lockout of the account's email (`429 ACCOUNT_LOCKED`), so a stolen session can't be used to guess the password. Both endpoints use the auth throttles.
- **Change password** (`POST /api/auth/change-password`, `{ currentPassword, newPassword }`, `204`): checks the common-password list, then sets the hash and deletes every other session of the account in one transaction. The session that asked stays signed in; the others get `401` on their next request and keep their notes.
- **Delete account** (`DELETE /api/account`, `{ password }`, `204`): one `DELETE` of the user row. Every table with a `user_id` references the user with `ON DELETE CASCADE`, so sessions, email tokens, notes, citations, sync changes and devices all go in the same statement, and the response clears the cookie. The email can sign up again. The integration test fills every table that has a `user_id` column (found from `information_schema`, so a new table must be added to the fixture) and checks that none of the user's rows remain.

### 7.3 Email
The **Resend** SDK sends in production (the domain verified with SPF and DKIM). In development and tests, emails are written to `apps/api/tmp/emails/*.eml`. The E2E tests read verification and reset links from there. Templates are plain HTML plus a text version.

*Built in M3-02 (`apps/api/src/mail`, `src/auth`):*
- **Client, by convention:** `MailService` calls one `EmailClient` (`emails.send`, the part of the Resend SDK the app uses), chosen by `NODE_ENV` in `createEmailClient`: the real `Resend` with `RESEND_API_KEY` in production, and `MockResend` in development and tests. The mock answers as Resend does (an id, or a `validation_error` for a bad sender, recipient or subject) but writes `apps/api/tmp/emails/<ms>-<seq>-<recipient>-<id>.eml` instead of sending (plain 8-bit UTF-8, so the links read as they are). So the code that runs in development is the code that runs in production, up to the client. The sender is `Lamp <noreply@` the host of `APP_URL`>. `APP_URL` defaults to `http://localhost:5173` (E2E sets its preview server), and production refuses to start without an `https://` `APP_URL` and a Resend key. Links are `APP_URL/verify-email?token=…` and `APP_URL/reset-password?token=…`, the pages M3-05 adds. The folder is kept between runs and shared with development, so the integration tests use addresses unique to the run and find their emails by the recipient in the file name (`test/int/mail.ts`, parsed with `mailparser`).
- **Tokens** (`EmailToken`): 32 random bytes, only the SHA-256 stored, single use. Verification links last 24 hours (they can sit in an inbox), reset links one hour. Using one marks the user's other unused tokens of that kind used, so an older link stops working. Use is a conditional update inside the transaction that acts on it, so two concurrent requests can't both succeed. An unknown, used, expired or wrong-kind token gets the same `400 TOKEN_INVALID`.
- **Verification:** sign-up sends the email; if sending fails, the account still stands and is logged. `POST /verify-email` needs no session, since the link may be opened on another device. `POST /resend-verification` needs one, allows one email a minute (`429 RESEND_TOO_SOON` with `retryAfterSeconds`, the "Send it again" wait) and answers `409 ALREADY_VERIFIED` once verified.
- **Reset:** `POST /forgot-password` answers `204` whether or not the account exists, and sends nothing to a disabled account. `POST /reset-password` checks the common-password list, sets the password, ends **every** session of the account, marks the email verified (the link proves the address) and lifts a login lockout. The user then signs in with the new password.
- All four endpoints use the auth throttles (§7.2).


## 8. Web app (`apps/web`)

### 8.1 Stack
React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (in `packages/ui`), **TanStack Router** (typed routes), **Dexie** with `useLiveQuery` for all data, **TanStack Query** only for the few server calls (auth, account, sync status), react-hook-form with the Zod resolver.

*Set up in M1-06:*
- **shadcn/ui on Base UI** (`base-nova` style, the CLI's default) rather than Radix. Components live in `packages/ui/src/components` and import each other through the package name (`@lamp/ui/lib/utils`), as the shadcn monorepo layout expects; the app imports them the same way (`@lamp/ui/components/button`) and its own code through `@/`. Run `pnpm dlx shadcn@<version> add <name>` from `apps/web`, which writes into `packages/ui`.
- `packages/ui/src/styles/globals.css` holds Tailwind, the tokens and `@theme inline`; the app imports it once (`@lamp/ui/globals.css`). Reading text uses Literata, the interface the system font (§8.5).
- **File-based routes** in `apps/web/src/routes`; the router Vite plugin writes `src/routeTree.gen.ts` on `dev` and `build`. The file is committed so typecheck works without a build, and is excluded from lint and Prettier.
- Vite serves on `:5173` and proxies `/api` to `LAMP_API_URL` (default `http://127.0.0.1:3000`); `vite preview` (`:4173`) reuses the proxy.

*Shell, built in M2-02:*
- Every screen is a child of the pathless layout route `_app` (`src/routes/_app/`), which renders the shell: a top bar and a bottom bar under 1024 px, a sidebar from 1024 px, and the screen in a column of at most 42 rem. `/dev/themes` sits outside it. The layout's `beforeLoad` runs the device's first-run setup (`ensureDevice`, §6.1) before any screen shows.
- A screen names itself with `staticData: { title, back? }`. The shell renders the title as the screen's only `h1`, and `back` adds `←` (and hides the phone's sync status and settings button, as on the wireframes' sub-screens).
- The router's default error and not-found components render in place of the screen, so the navigation stays; a catch-all route (`_app/$`) keeps unknown addresses inside the shell. The error screen offers Reload and "Copy error details".
- Read, Search and Review show one muted line until their milestones; Settings has the account section (M3-05, below) and About, which also shows the server status from `/api/health`.

*Account screens, built in M3-05 (`src/routes/_app/`, `components/account/`, `lib/api.ts`, `lib/account.ts`):*
- **Routes:** `/signup`, `/signin`, `/check-email`, `/verify-email?token=`, `/forgot-password`, `/reset-password?token=` (the addresses in the emails, §7.3) and `/settings/password`, all inside the shell with `←` to Settings, so the notes are a tap away on every one. Settings → Account invites a guest to sign up or sign in; signed in, it shows the email and whether it's verified (with "Verify your email ›" to `/check-email`), Devices (M3-12), Change password and Sign out. Delete account joins it later.
- **Client:** `lib/api.ts` throws `ApiRequestError` (status, `errorCode`, `details`) for the shared error body and `NetworkError` when nothing answers (a 502 or 504 from the proxy counts as nothing). `authErrorMessage` turns each code into the wireframes' wording; forms check fields with the domain request schemas before sending (`fieldErrors`). Requests use TanStack Query mutations.
- **The account** is `useAccount()`: `GET /api/auth/me` (null on `401`), mirrored to `localStorage` (`lamp.account`) so an offline start still knows who is signed in, refetched on focus and on reconnect. `syncState.ownerUserId` (M3-10) is separate: the mirror is only for the screens.
- **Offline:** every form keeps what was typed and disables its button, with "Needs a connection. Your notes keep working offline." (`useOnline`). Sign-out needs a connection too, since the cookie is `HttpOnly`.
- **Verify page:** the token is sent by a query keyed on it, not a mutation, so React's double mount and a reload don't spend it twice; a used link on an already verified account still says "Email verified." The first backup's progress shows in the sync panel (M3-11), from the engine's status (M3-09).
- **Resend:** "Send it again" waits 60 s after sign-up or a resend, or the `retryAfterSeconds` the server answers; a new link from an expired one needs the session, so a signed-out device is sent to sign in.
- **Reset** ends every session, this device's too (§7.3), so its last step says every device was signed out and Continue opens sign-in, instead of the wireframe's "Your other devices are signed out". A used reset link is only known when it's submitted (there is no check endpoint).
- **Sign-up off:** the screen learns it from the `SIGNUP_DISABLED` answer, then shows "This Lamp server doesn't take new accounts." with a link to sign in.
- Sign-out asks first, with the "changes waiting" line from wireframes/account.md (M3-10).

*Lessons and series, built in M2-04 to M2-06:*
- A screen whose title comes from data (a lesson, a series) fills the shell's `h1` through `ScreenTitle`, and can add header controls (`ScreenActions`: a tick once the lesson is saved, `⋯`) and a side panel (`SidePanel`). These are portals into slots of the shell (`components/shell/slots.tsx`), so their content keeps the screen's state.
- Routes: `/` (lessons home: New lesson, the five most recent lessons, the series), `/lessons` (all lessons, newest first), `/lessons/$lessonId` and `/series/$seriesId`. `n` starts a new lesson from anywhere but a text field.
- **A new lesson is a draft until its title has text.** "New lesson" makes the id at once and opens `/lessons/<id>?new=true`; the lesson is stored with that id once a title is typed, so the address never changes, and the `?new` is then dropped. Leaving before typing a title stores nothing. A cleared title isn't stored: the screen says "A lesson needs a title." and the old one stays.
- The lesson screen saves as it's typed (`useLessonSaver`): typed fields after 500 ms, choices at once, writes one after another so an update never overtakes the create, and a flush on blur, on leaving the screen and when the page is hidden. Changes not stored yet are shown on top of the stored row, so a second change made before the first is stored builds on it.
- Main passages use the reference input (`PassageInput`): `suggest()` completions in an ARIA combobox, a KJV-numbered reference explained in its option, an unreadable one explained under the field. They're stored as normalised `VerseRef`s without a snapshot (the lesson cites the passage, it doesn't quote it) and indexed as citations.
- Details open in place under the title, or sit in a side panel from 1280 px, where the sidebar, the 42 rem column and the panel fit side by side.
- Deleting a lesson tombstones its sections and their tags, its tags, takeaways and questions in the same action. Deleting a series keeps its lessons, without a series. Both ask first.

*Tag pages, takeaways and questions, built in M4-02 to M4-04:*
- **Tag page** (`/tags/$tagId`): the sections and lessons with the tag, grouped by lesson, newest lesson first, sections in reading order (a section, then its replies). A tag on a note, under a section or in Details, links to it (decided 2026-10-13; search adds `#tag` queries in M4-06). A section opens its lesson at `?section=<id>`, scrolled to it and highlighted for 2 s. The page's `⋯` renames a tag everywhere it's used, but never to a name another tag has in any case (decided 2026-10-13: "There's already a tag #hope.", no merging), and deletes it after asking, taking it off every note.
- **Takeaways** are lines typed in place (decided 2026-10-13), saved 500 ms after typing stops and on blur, in the order they were made (`createdAt`, which the review queue reads). A new one is a draft until it has text. Enter starts the next, Backspace in an empty one removes it, × deletes with Undo, and one left empty is deleted with Undo when focus leaves it. A row that goes as focus leaves it waits until the tap that moved focus is over (`afterPress`), so what was tapped doesn't move from under the pointer.
- **Questions** are open, answered or parked, each with its own icon and name. The `⋮` has Answer in a section (or Go to answer), Park or Reopen, Edit and Delete; park and delete are undone from the toast. **Answer in a section** (`promoteQuestion`) adds a top-level section at the end of the lesson, headed (h3) with the question, links it by `answerSectionId` and puts the cursor under the heading; the PRD's "child section" is read as a section of the lesson, as in the wireframe. A question whose answer section still exists goes back to it instead of getting a second.
- **The status follows the answer** (decided 2026-10-13): answered while the section has text below its heading, open while it's empty or deleted, worked out inside the section actions (`syncAnswers`), so it changes in the same transaction as the text and Undo of a delete answers it again. A parked question stays parked until reopened, then takes the status its answer gives it.
- On a phone takeaways and questions follow the sections, each list only once it has an entry; a floating + adds the first, and hides while a field has focus (`useTyping`). From 1280 px they're in the side panel under the details, empty or not.

*Screens* follow [UX-PATTERNS.md](UX-PATTERNS.md) and its wireframes (M1-14): bottom bar under 1024 px and sidebar above, 44 px touch targets on touch screens (enforced in `globals.css`), autosave with no Save buttons, undo for single deletes and a confirmation for anything larger.

### 8.2 Data flow
Screens read with `useLiveQuery`, so any local write, including one applied from a pull, re-renders them. Writes go through **action functions** (`createLesson`, `addSection`, `promoteQuestion` …) in `src/data/actions/`. Each one is a single Dexie transaction (§6.1). Components never write to Dexie directly.

### 8.3 Editor
**TipTap** (ProseMirror) with:
- A custom inline atom node `verse` that renders a chip (display reference, translation label; tap to expand the snapshot text).
- A suggestion plugin for the verse autocomplete (F3). It opens when the text before the cursor parses as a book name or reference, shows `suggest()` results with a preview from the local Bible JSON, and inserts the `verse` node on Enter or tap.
- Autosave: changes are debounced at 500 ms into a `updateSection` action. A section never has unsaved state for more than a second.

*Built in M2-07 (`apps/web/src/components/sections/`):*
- **One TipTap editor per section** (decided 2026-10-13), each saved as its own row, so a move, a delete and later a sync conflict touch one section. StarterKit is cut down to what the body allows (§4.2): headings h3 only; no code, strike, underline, rule, hard break or trailing node; links http, https and mailto only. `toBody` turns TipTap's JSON into a body, keeping only the attributes the strict schema allows (a list's `type`, a link's `target` and `rel` and unset verse fields are dropped). A round-trip test runs every node through a real editor. The `verse` node exists so bodies with chips load and save; M2-09 inserts it and M2-10 draws the chip.
- **Outline** (`outline.ts`): a lesson's sections in reading order, each followed by its replies, and pure functions that place a new or moved section with `keyBetween`. A reply whose parent is missing or is itself a reply (only through sync) shows at the top level.
- **New sections are drafts until they have text**, like a new lesson (decided 2026-10-13): the id is made at once, the row is stored on the first character, so opening a lesson never leaves empty rows. The lesson always ends with an empty draft ("Write a note…"), and a new one appears as soon as the last is stored, so there's no "+ Section" button (decided 2026-10-13). Enter at the end of the last section moves into it, and Backspace there only goes up. Any other empty draft goes away when it loses focus. Sections show once the lesson is stored, and Enter in the title moves to the first one.
- **Keys:** Enter on an empty last line ends the section and starts the next at the same level; Enter in an empty reply moves it out. Tab makes a section a reply to the one above, and does nothing in a reply, in a section with replies or in the first section (decided 2026-10-13), so a third level can't be made. Shift+Tab moves a reply out, to just after its section. In a list, Tab and Shift+Tab indent the list item instead. Backspace in an empty section with no replies deletes it (tags included) and goes to the end of the one above. Arrow up on the first line and down on the last move between sections. Tab never leaves the editor, so Escape does (it blurs it).
- **Toolbar** (decided 2026-10-13): B, I, bulleted and numbered list, quote, Reply, ⇤ and ⇥, for the section being typed in. On a phone it's fixed above the bottom bar, or on the on-screen keyboard while it's open (`visualViewport`), and the bottom bar hides meanwhile. On a laptop it sticks to the bottom of the column. Its buttons don't take focus, so the phone's keyboard stays open; keyboard users have the keys above and Ctrl+B / Ctrl+I.
- **Saving:** each section saves 500 ms after typing stops, at once on blur, and when the page is hidden or closed. Writes for all sections of a lesson run one after another, so a reply is never stored before its section. Moves and deletes show at once; a move stays shown until the stored row is as new as its own write, so an older read can't make the section jump back. The lesson's tick waits for its sections too, and is named "Saved" for screen readers.
- **Closing the tab mid-typing:** a write started in `pagehide` is asynchronous, and the browser may drop it with the page. So the hide handler also keeps the waiting text in `localStorage` (synchronous), and the next start (`restoreUnsaved`, in the `_app` route's `beforeLoad`) stores it through the same actions. It only applies to the row it was typed on: if that row changed since (the write did land, or a newer change came) or its lesson is gone, the kept text is dropped. Tested end to end: text typed and the tab closed at once is there on reopen.

*Built in M2-08:*
- **One `⠿` per section** (decided 2026-10-13): tap, click or Enter opens the section menu; press and drag moves the section. One 44 px gutter on a phone instead of a handle and a `⋮`. It's always shown on touch screens, and on hover or focus with a mouse. The empty section at the end has none, as there's nothing to move or delete.
- **Section menu:** Reply, Tags, Move up, Move down, Make a reply or Move out, Delete. Tags opens the tag input under the section's text; Escape closes it and returns focus to the `⠿`; leaving it closes it too. Move up and down swap with the sibling above or below (a section takes its replies along, a reply stays under its section), and never go below the empty section at the end. Focus comes back to the section's `⠿`, so the keyboard can move it again. In the editor, Alt+Shift+↑ and ↓ do the same.
- **Drag** (decided 2026-10-13: dnd-kit's sortable list, replacing our own pointer code, whose landing line was hard to see): a mouse drags after 4 px; a finger is held for 250 ms first, so a quick swipe on the handle still scrolls the page. The section follows the pointer as a card (its first lines and "+ 2 replies"), the other rows slide apart, and a dashed slot shows where it lands; its replies fold away until the drop. Pulling the card 12 px right of the column's edge drops it as a reply (`dropAt` in `outline.ts`): never for a section with replies, never at the top of the lesson, and only as a reply between two replies. The slot is indented for a reply and greyed where nothing fits. dnd-kit scrolls near the edges, and Escape cancels. A drop where the section already is writes nothing.
- **Delete:** a section without replies goes at once with a 10 s "Section deleted. Undo" toast. Undo restores the same rows (the writer's `restore` clears the tombstone and queues an upsert, so it syncs as an edit). A section with replies asks first ("Delete this section and its 2 replies?", focus on Cancel) and deletes them in one action, with their tags. Focus moves to the `⠿` above, so a phone's keyboard stays shut.
- **Toasts:** shadcn's Sonner (decided 2026-10-13), one at a time, above the bottom bar on a phone and bottom-right on a laptop, coloured by the theme tokens.

*Built in M2-09 (`apps/web/src/components/verses/`):*
- **Finding the reference** (`find-reference.ts`, pure): the list opens once a number is typed (decided 2026-10-13: "rom 8", "Jude 3", "rom 8:28–", not "Romans" alone, so everyday words that are book names don't open it), and closes on a space or anything else after it. The reference ends at the cursor and starts at a word, after a space, punctuation or a chip. Each word start in the last 48 characters is tried, and the best book match wins: exact, then the start of a name, then a misspelling. On a tie, an exact or prefix match takes the longer text ("1 Jn 3", "Song of Songs 2"); a misspelling takes a book number but no other word, so "a romns 8" leaves the "a" alone. Numbers past the end of a book that was clearly meant show why ("Romans has 16 chapters.") with nothing to insert; anything else shows nothing.
- **The plugin** is TipTap's `@tiptap/suggestion` with that matcher, ahead of the section keys (priority 1100), so ↑, ↓, Enter and Escape go to the list while it has a passage to insert, and to the sections otherwise. Escape closes it and keeps the text; it stays closed for that reference. Enter or a tap replaces the typed text with the `verse` chip and a space. The list never takes focus (the editor points at the selected option with `aria-activedescendant`). On a laptop it hangs under the reference (Floating UI, through the plugin's `mount`); on a phone it sits above the editing toolbar.
- **Text** (`data/bible.ts`): the web app serves `@lamp/bible-data`'s `dist/` under `/bible/` (a Vite plugin: from the package in dev, copied into the build). A book is fetched the first time a suggestion needs it and kept in memory for the session (decided 2026-10-13); M2-11 adds the service worker cache and the background download. Offline before that, suggestions still work and insert a chip without its snapshot, and the preview reads "Text not downloaded yet".
- **Empty verses** (decided 2026-10-13): a verse WEB leaves out, on its own, snapshots as its footnote, marked: "[Not in WEB: TR adds …]", so a chip never holds nothing. In a range they're skipped.

*Built in M2-10 (`verse-chip.ts`, `verse-viewer.tsx`):*
- **The chip** is a plain DOM node view (no React per chip): the display reference and the translation label, `role="button"`, labelled "John 10:9, World English Bible, verse. Show text." The node is an atom, so the cursor and Backspace treat it as one unit. Copying still writes `renderHTML`'s `span[data-verse]`, so a pasted chip keeps its fields.
- **Opening it:** a tap or click opens it without moving the cursor or bringing up the phone's keyboard (the chip takes the pointer events; ProseMirror ignores them). From the keyboard (decided 2026-10-13), ← or → selects the chip as one unit (a ring shows it), and Enter or Space opens it; Tab stays the section key.
- **The viewer**, one for the page: a popover under the chip on a laptop, a bottom sheet on a phone (Base UI, with a `Popover` added to `@lamp/ui`). It shows the reference, the translation's full name (`TRANSLATION_NAMES`) and the snapshot, never the current text, so a corrected edition doesn't change a note (tested by serving a changed book after a reload). Esc, a tap outside or × closes it, and focus goes back to the note with the selection it had, only if the note had focus.
- **Hover** (decided 2026-10-13): on a laptop with a mouse, resting on a chip for 400 ms opens the popover without taking focus from the note; it closes 250 ms after the pointer leaves the chip and the popover. A click pins it open (a click on the open chip isn't a press outside).
- **Verse numbers** (decided 2026-10-13): the stored snapshot stays one string. The viewer, the autocomplete and the previews split it into numbered verses from the book's verse texts (`numberedVerses`), only where those join up to exactly the snapshot; otherwise (a corrected edition, a footnote, a book not downloaded) the text shows without numbers.
- **Verse text in notes** (`verse-preview.ts`, decided 2026-10-13): with `UserSettings.autoPreviewVerses` on, each text block's chips get a widget decoration after the block holding their snapshots, numbered. Not part of the document, so never saved, copied or exported; redrawn when the setting changes or a book arrives.
- **A chip without its text** (decided 2026-10-13), inserted offline before its book arrived, says "Text not downloaded yet. It's added when the Bible is downloaded." M2-11 fills it in. A chip inserted while its book is still being fetched gets its text when the book arrives (not a step of its own for Undo), and an open viewer shows it.

### 8.4 Search and verse index
- **Free text:** MiniSearch in a Web Worker, built from the plain text of sections, takeaways and questions at startup and updated after each action and pull. Target: 5,000 sections indexed in under 1 s on a mid-range phone.
- **Verses and tags:** Dexie queries on `citations` (`startOrd`/`endOrd` index) and on the join tables. The search box detects a reference with `parseReference` and a `#tag` prefix.
- The server keeps no search index in phase 1, since every device holds the full data. Postgres full-text search waits for phase 2 groups.

*Built in M4-05 and M4-06:*
- **Index** (`src/search/`): `search.worker.ts` opens the device database itself, reads every live lesson title, section, takeaway and question once (`allDocs`), and answers searches in order with what it has. `action()` reports the rows each action wrote once its transaction commits (`onRowsChanged` in `data/changes.ts`); the client forwards them, and the worker re-reads just those rows. A pull (M3-09) reports its rows the same way. Every word of a query must match; the last one as a prefix, and words over four letters allow a typo. Text is matched lower case and without accents.
- **Speed** (the M4-05 target): 5,050 rows (50 lessons, 5,000 sections of about 40 words) are ready about 300 ms after the worker starts, with Chrome's CPU slowed 4× as a mid-range phone stand-in (Ryzen 7 5800H, 2026-10-13). `search.spec.ts` checks it stays under 1 s; the index marks `lamp:search-ready` with the times.
- **One box** (`/search?q=`): `parseQuery` reads a leading `#` as a tag, a reference `parseReference` accepts as a verse query, and anything else as free text. A one-chapter book's name alone ("Jude") is a verse query. Verse and tag queries read Dexie directly, so they answer before the index is ready.
- **Results** are grouped by lesson, newest first, three per lesson before "+ N more". In a lesson: the lesson itself (its title matched, a main passage overlaps the verse, or it has the tag), then sections in reading order, then takeaways and questions (decided 2026-10-13: lesson titles and main passages match too). A result opens the lesson at `?section=`, `?takeaway=` or `?question=`, scrolled to and highlighted for 2 s (decided 2026-10-13). The tag page uses the same list.
- **Recent searches**: the last five that led to a result, kept in this browser only (`lamp.recentSearches`; decided 2026-10-13).

*Built in M4-07:*
- **Verse index** (`/verses/$passage`): the address is the passage's slug (`passageSlug` in `verse-ref.ts`: `ROM.8`, `ROM.8.28-30`, `ROM.7.24-8.2`), never re-read by the parser, so KJV numbering isn't mapped twice. `verseIndex` runs the same overlap query as a verse search and lists its rows flat, newest lesson first: a lesson whose main passage overlaps, then its sections in reading order, each with the lesson, the date and the text around the chip (`around` in `snippet.ts`). It opens from a chip ("Every note on …") and from a verse search ("Verse index for …").
- Highlights and memory items, with the All / Notes / Highlights / Memory filter, join the page with M5-02 and M6-01; its "Read ›" button comes with the reader (M5-04) (decided 2026-10-13).
- **The M4 gate** (`gate-find.spec.ts`) writes a month of lessons straight to the device, checked against the sync schemas and with citations from `citationsFor`, as a pull would leave them, then finds one note by tag, by text and by verse on a phone.

### 8.5 Theme
- Presets live in `packages/ui/src/themes/*.css` as CSS variable sets for the shadcn tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--accent`, `--ring`, `--radius`, …), each with light and dark values. They're selected with `<html data-theme="parchment" class="dark">`.
- Tailwind v4 maps the tokens with `@theme inline`, so components use only semantic classes (`bg-background`, `text-primary`) and never raw colours.
- Presets (the "reading-room" set): *Parchment* (default: cream paper, ink brown, burgundy accent), *Vellum* (off-white, charcoal, gold), *Olive* (soft sage, deep olive), *Slate* (cool grey, blue-slate), *Cedar* (warm wood tones, amber), *Midnight* (deep navy, soft gold; dark first). Colours were tuned in M1-13 and M1-14, and every change must pass the contrast test.
- The choice is stored in `UserSettings` (synced) and mirrored to `localStorage`. A small inline script in `index.html` applies it before the first paint, so there's no flash of the wrong theme.
- A CI test checks WCAG AA contrast for every preset in both modes.

*Built in M1-13:*
- Each preset file sets 15 tokens (background, foreground, card, primary, secondary, muted, accent with their foregrounds, border, input, ring) under `[data-theme='<id>']` and `[data-theme='<id>'].dark`. `globals.css` holds what the presets share, declared on every `[data-theme]` element: `--radius`, the destructive colour, the four reader highlights (`bg-highlight-yellow` …), and aliases (`--popover` and the sidebar tokens point at card, primary, accent). The shadcn chart tokens are dropped, since the app has no charts. `index.html` ships `data-theme="parchment"`.
- The `dark` variant is `&:where(.dark, .dark *):not(:where(.light, .light *))`, so a `.light` element inside a dark page switches back. The demo uses it to show both modes side by side.
- `@lamp/ui/themes/presets` has the preset list (checked against `THEME_PRESETS` in `domain`), `resolveMode`, `applyTheme`, and `readTheme`/`saveTheme` for the `localStorage` key `lamp.theme`. The inline script in `index.html` repeats that logic, since it has to run before any module loads; an E2E test checks it with the app's scripts blocked.
- **The contrast test** (`themes.test.ts`) converts each token from OKLCH to sRGB, composites translucent colours the way the browser does, and checks 29 (light) or 31 (dark) pairs per preset, taken from how the components combine them: text on its background at 4.5:1, including hover and tinted states (`bg-primary/80`, `bg-destructive/10` and `/20`, `dark:bg-input/30`); field borders, switch tracks, checked controls and the focus ring at 3:1 (WCAG 1.4.11). `--border` is decorative (dividers, card edges) and is not checked. Every colour must be inside sRGB.
- **Demo page:** `/dev/themes` in the web app shows the 15 components (button, badge, card, alert, input, textarea, label, checkbox, switch, tabs, separator, select, dropdown menu, tooltip, dialog) and reading text in all 12 preset and mode panels, with buttons that switch the page itself. Popups render in a portal, so they take the page's preset. The route stays in production builds, linked from nowhere, so presets can be checked on a real phone against the deployed app.
- **Fonts:** the interface uses the system font. Scripture and notes use Literata (`font-serif`), self-hosted from `@fontsource-variable/literata` with the weight axis, upright and italic. The browser downloads only the subsets a page needs (Latin is 52 KB per style).

*Picker, built in M2-03:*
- The theme picker is a bottom sheet over Settings (`ThemeSheet`, shadcn's Sheet on Base UI's dialog; decided 2026-10-13, replacing the `/settings/theme` screen), the same on a laptop but centred and no wider than the column. It shows the mode control and the six presets as a radio group of cards, each drawn in its own preset and the current mode; Settings has the same mode control and the Theme row naming the current preset, which opens the sheet. Each mode control has its own radio group name (`useId`), since both are on the page at once. Midnight in light mode offers "Use dark mode". Both controls are native radios, so arrow keys work and a choice applies at once.
- The choice is written with the `updateSettings` action (stored in the local `UserSettings` and queued for sync). The shell's `useThemeSync` watches the settings with `useLiveQuery`, applies them to `<html>`, follows the device while the mode is "system", and mirrors them to `localStorage` for the inline script. A pulled settings row (M3) takes effect the same way. `/dev/themes` sits outside the shell, so its buttons change only the mirror.
- An E2E test picks every preset in both modes and reloads with the app's scripts blocked: the inline script alone shows the chosen theme, so there is no flash of the default.

*Looks, built in M2-14 (`packages/ui/src/looks`, `src/lib/looks.ts`, `look-picker.tsx`, `welcome.tsx`):*
- **A second axis.** The look decides how the interface is drawn; the preset colours it. *Classic* is the interface above, coloured by a preset. *Folio* (a printed study Bible: Fraunces headings, hairline rules, small capitals, one vermilion), *Soft* (rounded paper cards on a warm wash, Inter Tight, a floating tab bar) and *Lamplight* (glass panels, amber glow, JetBrains Mono for references) each bring their own colours for light and dark, so the preset is kept but not shown with them. Scripture and notes stay in Literata in every look. `LOOKS` in `@lamp/ui/themes/presets` lists them, checked against `THEME_LOOKS` in `domain`; `UserSettings.look` is synced (Zod enum, Prisma column) and mirrored in `lamp.theme` with the look's stylesheet path (`lookHref`).
- **Plain CSS over hooks.** Each look is one file in `packages/ui/src/looks/`, applied as `<html data-look="folio">`. It sits outside Tailwind's layers, so its rules win over the components' utilities, and it selects on `data-slot` (the shadcn components', plus `row-list`, `row-title`, `welcome-title` and the like on screens) and on `data-variant` / `data-size`, which `Button` now sets. The tokens are set on `:root[data-look='<id>']` and `….dark`, including `--radius` (Folio 0.125 rem, Soft 1 rem, Lamplight 0.75 rem; Classic 0.625 rem). Rules stay flat so the contrast test can read the tokens.
- **Downloaded when chosen.** A look's stylesheet and fonts are left out of the precache (`globIgnores`), so Classic users never fetch them (about 7–13 KB of CSS per look and 37–46 KB per Latin font file). `showLook` links the built stylesheet, sets `data-look` only once it has loaded (never half-applied), then stores it and its Latin fonts in the `lamp-looks` cache, removing older builds' files; the service worker serves those paths cache-first from it. Choosing Classic removes the link, the attribute and the cache. Offline with nothing stored, the look shows "couldn't be downloaded", Classic stays, and it tries again at the `online` event.
- **Before the first paint**, the inline script checks `lookHref` against a same-origin `.css` pattern (mirroring `readTheme`), sets `data-look` and writes the `<link id="lamp-look">` in, so it blocks the first paint like any stylesheet in `<head>`. The welcome E2E test reloads Folio in dark mode with the app's scripts blocked and checks Folio's radius.
- **The contrast test** checks every look in both modes like a preset (every colour token set, opaque and inside sRGB, the same pairs at AA), plus each look's ink button plain and hovered and the verse chips on their tints.
- **Picker and welcome.** `LookPicker` is a radio group of cards: Classic drawn live in the chosen preset, the others by a picture of the look (`public/looks/<id>-<mode>.svg`). The theme sheet shows the looks, the mode control and, for Classic only, the presets; the Theme row names the look, or the preset with Classic. A new device first sees `Welcome` (the looks, the mode, Continue) on the lessons home; Continue sets `lamp.welcomed` in `localStorage`, once per device, and a device that already has lessons or series skips it. Other E2E tests start with that flag set.
- **`/dev/looks`** shows the explorations the looks came from (a fourth, Grid, was not built as a look), loaded only when that page opens.

### 8.6 PWA
- `vite-plugin-pwa` (Workbox) in `injectManifest` mode: precaches the app shell; installable manifest; `navigator.storage.persist()` requested after sign-in or the first lesson.
- **Bible text:** WEB is downloaded in the background after the first load (about 1–1.5 MB compressed) and served cache-first. Settings show download progress and storage use.
- **Updates:** a new service worker waits. The app shows "New version — Reload" and never reloads by itself while an editor has focus or the outbox is mid-push.

*Built in M2-11 (`sw.ts`, `bible.ts`, `bible-download.ts`, `snapshots.ts`, `update-prompt.tsx`):*
- **Service worker:** `vite-plugin-pwa` 1.3.0 in `injectManifest` mode (2.0.0 was ten days old). Downloaded looks (M2-14, §8.5) are left out of the precache and served from the `lamp-looks` cache. `src/sw.ts` precaches the built JS, CSS, HTML, icons and Literata's Latin subsets (about 1.7 MB, 56 files), serves `index.html` for every address except `/api` and `/bible`, and claims the page on its first install so it works offline at once. Other Literata subsets load only for text in those scripts. Typechecked on its own (`tsconfig.sw.json`, WebWorker lib).
- **Manifest and icon:** "Lamp", standalone, Parchment's background; a clay oil lamp in Parchment's red on cream (`public/icon.svg`, decided 2026-10-13), exported as 192 and 512 px PNGs, a maskable 512 px and a 180 px Apple touch icon.
- **Bible text:** kept by the page in a Cache Storage cache (`lamp-bible`), not by the service worker, so it works the same with or without one and the page knows the progress. Book files are read cache-first (named by content hash, never stale); the manifest network-first, falling back to the stored copy offline, so a corrected edition is picked up on the next start. Two seconds after start, `downloadBible` fetches the books not stored yet one at a time, shows "N of 66 books" in Settings, pauses without a connection ("Download paused: no connection. It continues when you're online.") and goes on at the `online` event or after 30 s; at the end it removes files the manifest no longer lists. Without Cache Storage (not a secure context), books are fetched as they're needed.
- **Chips waiting for their text** get it when their book arrives, fetched or downloaded: open editors through the `VerseSnapshots` extension (not an Undo step), stored sections through `fillStoredSnapshots`, one action per section from the row as it is then, so the change syncs and never overwrites a newer one.
- **Storage:** `navigator.storage.persist()` is asked after the first lesson is stored. Settings shows the space used and whether the browser keeps it.
- **Updates:** a toast, "A new version of Lamp is ready. [Later] [Reload]", that stays until used. It's put away while any text field or editor has focus and comes back when focus leaves; Later leaves the update for the next start. Reload waits for writes in flight (`writesSettled`), tells the new worker to take over and reloads when it does (the plugin only reloads for an update found just after load). An open app checks for a new version every hour. Reload also waits for a sync in flight (`syncEngine.settled()`, M3-09). Checked by hand with `docs/MANUAL-TESTS.md`.
- **E2E:** Playwright blocks service workers (`serviceWorkers: 'block'`) so `page.route` sees every request; `offline.spec.ts` allows them and checks the app in airplane mode after the first load: every screen, a reload, an address opened directly, and a book never opened before.

### 8.7 Export (F11)
- **Markdown:** `toMarkdown` from `domain`, for one lesson or a whole series. It keeps section nesting, verse text with translation labels, tags, takeaways and questions.
- **PDF:** a print view of the same HTML with a print stylesheet, saved through the browser's "Save as PDF". It works offline and the output matches the screen. If one-tap download turns out to matter on phones, a lazily loaded generator can replace it later.

### 8.8 Review queue and notifications (F9, F10)
The queue is a local query: open questions, takeaways from the last `reviewWindowDays` (default 14), and memory items with `nextReviewAt ≤ today`. The weekly reminder is best effort. Phase 1 has no server push, and Periodic Background Sync only works in Chromium for installed apps. Elsewhere the app shows a badge count on the Review tab.

## 9. Bible text (`packages/bible-data`)

- **Phase 1 ships WEB only** (public domain). The pipeline, manifest and `translation` field on every reference already handle several translations, so adding open ones later (BSB, KJV) is a data change, not a code change.
- **Source:** WEB USFM from eBible.org. Its licence notice is kept in the package.
- **Build:** `pnpm --filter @lamp/bible-data build` → `dist/<translation>/<BOOK>.<hash>.json` (`{ "c": [[ "v1 text", "v2 text", … ], …] }`) with footnotes, cross references, headings and word markup removed and the words unchanged (eBible's condition for keeping the "World English Bible" name; only line breaks collapse to single spaces), plus `manifest.json` (translations, licence, source checksum, and per book the file, content hash, size and verse counts). Files are named by content hash and served as immutable static files. Two optional fields, decided 2026-10-13: `d` keeps titles outside the verse numbering by the `"c:v"` they precede (the 138 Psalm titles and Psalm 119 letters), and `n` keeps the footnote for each verse WEB leaves empty. The build fails if a book or verse is missing or the counts differ from the domain book table. *M1-12:* 66 files, 4.09 MB, about 1.26 MB gzipped; eBible's `copr.htm` notice ships unchanged beside them. `passageVerses` and `passageText` in the package do the lookup.
- **Text lookup:** the web app loads the book file from its Bible cache (`bookState`, `whenBook`; §8.6) and slices it (`snapshotText`). The server never needs Bible text in phase 1. It validates references against the book table only.
- **Source files:** not committed. `pnpm --filter @lamp/bible-data download` fetches the eBible.org zip, checks the checksum pinned in `src/sources.ts` and unzips it into `packages/bible-data/source/eng-web/` (gitignored); `build` runs it when the source is missing. CI restores `source/` from a cache keyed on `src/sources.ts` before the unit and build jobs, and the package's Turbo inputs include the source's checksum stamp, so a cached run without the source is never reused. A new zip from eBible.org fails the download until the checksum is updated by hand. `@lamp/bible-data` tests compare the domain book table with that source chapter by chapter.
- **Versification:** the book table uses WEB's chapter and verse counts, and WEB numbers are the canonical ones. Typed KJV numbers that WEB puts elsewhere are mapped by `domain/versification.ts`. A diff of the eBible.org KJV and WEB texts found only one such place: WEB prints the Romans doxology at 14:24–26 (KJV 16:25–27) and keeps 16:25 as an empty verse. Matthew 23:13–14 come in the opposite order in WEB, but both numbers exist there, so they follow WEB. WEB also has empty, footnote-only verses at Luke 17:36, Acts 8:37, 15:34 and 24:7; the book files keep them as `""` with the footnote in `n`, and a chip on one alone holds its footnote, marked "[Not in WEB: …]" (§8.3, M2-09). With a second translation (phase 2), a reference past the end of a chapter in that translation shows "Not in this translation".
- **Chips and translations:** a chip always shows its snapshot with its translation label. Expanding it offers "View in …" for any other downloaded translation, and hides that option while WEB is the only one.
- **More open translations, ESV and other licensed translations:** phase 2. Licensed ones go through a server proxy so the key never reaches the browser.

## 10. Testing

| Level | Tool | Runs against | Scope |
|---|---|---|---|
| Unit | Vitest | Nothing external | `domain` (parser, ordinals, doc model, SM-2, conflict rules: high coverage), `ui` (theme contrast), web components (Testing Library + happy-dom), API services with mocked dependencies |
| Web integration | Vitest + `fake-indexeddb` | In-memory IndexedDB | Actions write tables + citations + outbox atomically; pull apply rules; search index updates |
| API integration | Vitest + supertest | **Local Postgres `lamp_test_dev`** | Every endpoint through a real Nest app: auth flows, sync push/pull, idempotency, conflict cases, per-user isolation, migrations |
| Sync contract | Vitest | `lamp_test_dev` + two `fake-indexeddb` devices | The web sync engine running in Node against a real API instance: two devices edit offline, sync, and end up identical with the expected conflicted copies |
| E2E | Playwright | Built web + built API on **local Postgres `lamp_e2e_dev`** | Sign up → verify (link from `tmp/emails`) → capture a lesson **offline** (`context.setOffline`) → reconnect → a second browser context (second device) sees it; conflict flow; theme switch; export |

### 10.1 Vitest setup for NestJS
NestJS dependency injection reads `design:paramtypes` metadata. The API's `vitest.config.ts` compiles tests with `unplugin-swc` (with `@swc/core`) and turns off Vite's own transform (`oxc: false`), so tests use the same compiler as `nest build` (SWC builder). *Checked at scaffold (M1-02): the NestJS 12 template doesn't add this, and Vite 8's Oxc transform does emit the metadata too, so SWC is for parity rather than strictly required.* The repo stays on **TypeScript 6** until 7.1: TypeScript 7.0 has no programmatic compiler API, which the Nest CLI needs. Add `vite-tsconfig-paths` if path aliases are used.

### 10.2 Test databases (no Docker)
- `scripts/dev-db.sh` (idempotent) uses the local Postgres (Postgres.app 18 on macOS, the distro package on Linux) to create the role `lamp` and the databases `lamp_dev`, `lamp_test_dev` and `lamp_e2e_dev`, and writes the connection strings to `apps/api/.env.local` and `.env.test`. Only creating the role needs an admin: the script uses `$PG_ADMIN` if set, else your own user when it is a superuser or has `CREATEROLE` (Postgres.app), else `sudo -u postgres psql` (the Linux package). Everything else runs as `lamp`, which has `CREATEDB` for Prisma's shadow database. `.env.test` also holds `E2E_DATABASE_URL` for Playwright. The `_dev` in every name marks a development database; the reset guards below check for `_test_dev` and `_e2e_dev`.
- **Integration tests:** a Vitest `globalSetup` runs `prisma migrate reset --force` on `lamp_test_dev` once per run (Prisma 7 no longer seeds on reset), after checking that the database name ends in `_test_dev`. **AI agents:** Prisma 7 refuses `migrate reset` whenever it detects an agent (from variables such as `CURSOR_AGENT` or `CLAUDECODE`), whatever the database is called, unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` holds the user's consent message. An agent asks the user first, then runs `test:int` or `e2e` with that variable set; Turbo passes `PRISMA_*` through to both tasks. A person running the tests, and CI, need nothing. *Corrected at M3-01: an earlier note said the `_dev` suffix satisfied Prisma's check; Prisma 7.10 has no such exemption.* Each test file then truncates all tables in `beforeEach` (one `TRUNCATE … RESTART IDENTITY CASCADE`). Test files run one at a time (`fileParallelism: false`). If the suite gets slow, switch to one database per Vitest worker, cloned from a migrated template database.
- **API integration tests** boot the real `AppModule` with `createTestApp()` (`apps/api/test/int/app.ts`) and call it through supertest; `test/health.int.test.ts` is the pattern (one app per file, `truncateAll` in `beforeEach`).
- **E2E** (`apps/e2e`, `pnpm e2e`): `turbo run e2e` builds the workspace dependencies first, then Playwright starts the built API (`node dist/main.js` on `:3100`, so a running `pnpm dev` is never reused) and `vite preview` (`:4173`, proxying `/api` to `:3100`) through `webServer`; tests use the preview URL as `baseURL`, and its `globalSetup` resets `lamp_e2e_dev` (Playwright starts the web servers before the global setup; the API only connects on its first query). The database URL comes from `E2E_DATABASE_URL`, else `apps/api/.env.test`, and must name a `*_e2e_dev` database. Tests run one worker at a time against the one database. Browser tests run in **Chromium only** (`pnpm --filter @lamp/e2e exec playwright install chromium`); Safari on the iPhone is checked by hand on a real device.
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
- Every query is scoped by `userId` (§7.1), and the isolation tests are part of the integration suite (`apps/api/test/isolation.int.test.ts`, M3-13). One account fills every table through the API; another then tries to read it (pull, account, devices), overwrite or delete each entity, reference each entity through every id column (`ENTITY_TABLES` refs), reuse a change id, sign out a device id both accounts share, and sign out, change the password and delete its own account. Every row the first account has, in every table, must be unchanged, and it must still be signed in. The tables come from the schema (`Prisma.ModelName` and every `user_id` column), so a new model is covered or fails the fixture check.
- Rich text is rendered from validated ProseMirror JSON by TipTap. User HTML is never inserted into the page.
- The push body size is capped, and the size of each entity field is capped by Zod.
- Caddy sets CSP (`default-src 'self'`; scripts by hash for the theme snippet), HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- Account deletion needs the current password again, removes every row the user owns in one transaction and ends all sessions.

## 13. Local development

```bash
nvm use                      # Node 24 (from .nvmrc)
pnpm install
./scripts/dev-db.sh          # role + lamp_dev / lamp_test_dev / lamp_e2e_dev on local Postgres
pnpm db:migrate              # prisma migrate dev on lamp_dev
pnpm dev                     # turbo: web on :5173, api on :3000 (Vite proxies /api)
pnpm test | test:int | e2e
```
Development emails land in `apps/api/tmp/emails/`. `pnpm db:seed` creates a demo user with a few lessons. Until sync (M3), the app's own data is seeded in the browser: `/dev/seed` (`apps/web/src/dev/seed.ts`, dev builds only) clears the device database and writes a demo month through the app's actions, or adds 5,000 generated sections.

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
| 23 | Components in M1-13 (2026-10-13) | The core shadcn set is added now, so the presets are tuned against what M2 uses | §8.5 |
| 24 | Reading font (2026-10-13) | Literata, self-hosted, for scripture and notes; the system font for the interface | §8.5 |
| 25 | Touch targets (2026-10-13) | 44 px on touch screens through one `pointer: coarse` rule in `globals.css`; compact sizes with a mouse | UX-PATTERNS |
| 26 | New lesson (2026-10-13) | One tap creates the lesson and opens it ready to type; the other details sit in a collapsible row | UX-PATTERNS |
| 27 | Destructive actions (2026-10-13) | Undo for one thing; ask first for more than one, or for what can't be undone | UX-PATTERNS |
| 28 | Wireframes (2026-10-13) | Text (ASCII) wireframes in `docs/wireframes/`, linked from UX-PATTERNS | UX-PATTERNS |
| 29 | Copyright and conduct (2026-10-13) | MIT © "The Lamp contributors"; the Contributor Covenant 2.1 adopted by link, reports to a maintainer privately; vulnerabilities through GitHub's private reporting | — |
| 30 | Deleting an account (2026-10-13) | Asks for the password again and the typed word DELETE | §7.1, §12 |
| 31 | Theme demo route (2026-10-13) | `/dev/themes` stays in production builds, unlinked | §8.5 |
| 32 | Resolving a conflicted copy (2026-10-13) | "Keep this instead" swaps the copy's body in and deletes the copy, besides merging by hand | §6.4 |
| 33 | Section editor (2026-10-13) | One TipTap editor per section, not one for the whole lesson | §8.3 |
| 34 | Empty sections (2026-10-13) | A new section is a draft until it has text; Backspace in an empty one deletes it | §8.3 |
| 35 | Tab on a section with replies (2026-10-13) | Does nothing, as in a reply; a third level is never made | §8.3 |
| 36 | Editing toolbar (2026-10-13) | The full toolbar in M2-07, on the keyboard on a phone | §8.3, UX-PATTERNS |
| 37 | Theme picker (2026-10-13) | A bottom sheet over Settings, on laptops too (narrow, centred); no `/settings/theme` address | §8.5 |
| 38 | Section handle (2026-10-13) | One `⠿` that opens the menu on a tap and drags on a press; drag started from it, not by a long press on the text (which selects words) | §8.3 |
| 39 | Drag and toasts (2026-10-13) | Drag uses dnd-kit (core + sortable) with our two-level drop rules (it replaced our own pointer code, whose landing line was hard to see); toasts are Sonner | §8.3 |
| 40 | When the verse list opens (2026-10-13) | Once a number is typed after a book ("rom 8"), not on a book name alone | §8.3 |
| 41 | Bible text before the service worker (2026-10-13) | Static files under `/bible/`, fetched on first use and kept for the session; the service worker cache comes in M2-11 | §8.3, §9 |
| 42 | A verse WEB leaves out (2026-10-13) | On its own, the chip snapshots its footnote, marked "[Not in WEB: …]"; skipped in a range | §8.3, §9 |
| 43 | A chip without its text (2026-10-13) | Says the text is coming; never shows text that wasn't captured | §8.3 |
| 44 | Opening a chip from the keyboard (2026-10-13) | ← or → selects it, Enter or Space opens it; chips are not Tab stops | §8.3 |
| 45 | Hovering a chip (2026-10-13) | On a laptop, opens the popover without taking focus; a click pins it | §8.3 |
| 46 | Verse numbers (2026-10-13) | Added when shown, from the book's verse texts, never stored; none when the snapshot doesn't match | §8.3 |
| 47 | Verse text in notes (2026-10-13) | A synced setting, off by default; the text shows as a quote under the paragraph, not part of the note | §8.3 |
| 45 | App icon (2026-10-13) | A clay oil lamp in Parchment's red on cream; an SVG that can be replaced later | §8.6 |
| 46 | Where the Bible text is kept (2026-10-13) | A Cache Storage cache the page fills (books cache-first, manifest network-first), not a service-worker route | §8.6, §9 |
| 47 | The update prompt (2026-10-13) | Hidden while any text field has focus; Later waits for the next start; Reload waits for writes in flight | §8.6 |
| 48 | Looks (2026-10-13) | A second theme axis beside the presets: Classic (with the presets), Folio, Soft and Lamplight, each with its own colours; plain CSS over `data-slot` hooks, downloaded only when chosen | §8.5, F16 |
| 49 | First-run welcome (2026-10-13) | A new device picks a look and mode first, with the defaults already set; once per device, skipped where lessons already exist | §8.5, F16 |
| 50 | Email client and configuration (2026-10-13) | The Resend SDK rather than SMTP through nodemailer, accepting code tied to the provider. Environment variables follow convention over configuration: a variable only for a real deployment choice, the rest derived from `NODE_ENV` (no mail transport, folder, sender or cookie switches) | §2, §7.2, §7.3 |
| 51 | A conflicted copy's device (2026-10-13) | Stored: the server records which device last wrote each body, and the copy carries it as `conflictDevice` | §6.4 |
| 52 | Signing a device out (2026-10-13) | A session belongs to the device it syncs from (`session.device_id`, set on its first push or pull); signing a device out deletes its sessions. The list shows only devices with a live session | §5.2, §6.6 |

**Still open:** nothing blocks phase 1. Mapping between other translations' numbering waits for a second translation in phase 2.

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
