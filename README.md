# Lamp

**Bible study notes anchored to scripture.** Lamp is an offline-first web app for capturing
sermons and personal study as threaded notes, referencing verses inline as you type, and finding
everything you've ever written about a passage.

> "Your word is a lamp to my feet and a light to my path." — Psalm 119:105 (BSB)

**Status:** early development. The foundations (milestone M1) are being built; the app can't be
used for notes yet. Progress is tracked in [docs/BACKLOG.md](docs/BACKLOG.md).

# Motivation

- @hawites won't share notes on class, trying to community source notes

## What it does

- **Capture a lesson** from a sermon or a study in under two minutes, on a phone, offline.
- **Reference verses as you type:** `Rom 8:28-30` or `1 jn 3` completes into a verse chip that
  holds the text, labelled with its translation.
- **Find anything by verse:** the verse index shows every note, highlight and memory verse on a
  passage, across all lessons. Search covers text and tags too.
- **Read the Berean Standard Bible** (or the King James Version) offline, highlight verses and
  turn a highlight into a note.
- **Keep questions and takeaways visible** in a review queue, and memorise verses on a spaced
  schedule.
- **Optional account:** use it as a guest with no sign-up, or create an account to back up notes
  and sync them between devices.
- **Export** a lesson or series as Markdown, or print it to PDF.
- **Share verses in from other apps:** a verse shared from YouVersion or a Bible site, or pasted,
  waits in the Inbox with its reference and translation recognised, until it goes into a lesson.
  Pasting into a note offers to turn the references and verses in it into chips, and each chip
  opens in Blue Letter Bible, YouVersion, Bible Hub or Logos.
- **Import from YouVersion:** highlights and notes from YouVersion's data download land in the
  Inbox (Settings → Import) as one row, which opens its items and can dismiss them all at once.
  The export's format isn't confirmed yet, so this may not read a real file until it is.

### The weekly reminder, by browser

Turned on in Settings → Review, the reminder is a notification about once a week, "3 open questions
and 2 verses due.", and nothing when nothing waits. It needs Periodic Background Sync, which only
Chromium gives, and only to an installed app; the browser picks the moment and may wait longer for
an app that's rarely used. Everywhere else the switch is replaced by a line saying so, and the
Review tab's count is the reminder.

| Browser                                   | Weekly reminder | Review tab count | App icon badge |
| ----------------------------------------- | --------------- | ---------------- | -------------- |
| Chrome, Edge: installed app (desktop)     | Yes             | Yes              | Yes            |
| Chrome, Edge: installed app (Android)     | Yes             | Yes              | System's dot   |
| Chrome, Edge: in a tab                    | No              | Yes              | No             |
| Firefox                                   | No              | Yes              | No             |
| Safari (macOS, iOS), Home Screen apps too | No              | Yes              | No             |

The switch is per device: the browser keeps the permission and the registration, so it isn't
synced. Checked by hand with [MANUAL-TESTS.md](docs/MANUAL-TESTS.md).

### Sharing to Lamp, by platform

Installed, Lamp asks to be a share target (`share_target` in its manifest), so a verse shared from
another app opens Lamp's share screen. Only some browsers put a web app in the share sheet. Where
none does (an iPhone or iPad), copy the verse and tap **Add from clipboard** in the Inbox: it opens
the same screen, which finds the references and verses in what was copied.

| Platform                                    | Lamp in the share sheet | Add from clipboard |
| ------------------------------------------- | ----------------------- | ------------------ |
| Android: Chrome, Edge, Samsung (installed)  | Yes                     | Yes                |
| Android: Firefox                            | No                      | Yes                |
| Windows, ChromeOS: Chrome, Edge (installed) | Yes                     | Yes                |
| macOS, Linux: Chrome, Edge (installed)      | No                      | Yes                |
| iPhone, iPad: Safari, Home Screen app       | No                      | Yes (Safari asks)  |

From each browser's support for Web Share Target, 2026-10-18; **not yet checked on an iPhone or an
Android phone** (M9-07).

The full product description is the [PRD](<docs/Bible Study App — PRD.md>); the technical
design is [TECH-DESIGN.md](docs/TECH-DESIGN.md).

## How it's built

| Part                 | Stack                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo             | Turborepo, pnpm workspaces, TypeScript (ESM), Node 24                                                                                        |
| Web app (`apps/web`) | React 19, Vite, Tailwind CSS v4, shadcn/ui on Base UI, TanStack Router, Dexie, TipTap                                                        |
| API (`apps/api`)     | NestJS 12, Prisma 7, PostgreSQL 18                                                                                                           |
| Shared (`packages/`) | `domain` (verse references, parser, document model, Zod schemas), `ui` (components and themes), `bible-data` (Bible text pipeline), `config` |
| Tests                | Vitest, Playwright, against a local PostgreSQL (no Docker)                                                                                   |

## Running it locally

You need **Node 24** (`.nvmrc`; [nvm](https://github.com/nvm-sh/nvm) is the easy way), **pnpm 10**
and **PostgreSQL 18** running on your machine (Postgres.app on macOS, the PGDG packages on Linux).
No Docker.

```bash
nvm use                                   # Node 24
pnpm install
./scripts/dev-db.sh                       # creates the lamp role and lamp_dev, lamp_test_dev, lamp_e2e_dev
pnpm db:migrate                           # applies the migrations to lamp_dev
pnpm --filter @lamp/bible-data build      # builds the BSB and KJV text (about 4 MB each) into packages/bible-data/dist
pnpm dev                                  # web on http://localhost:5173, API on :3000
```

`dev-db.sh` is safe to run again; it writes the connection strings to `apps/api/.env.local` and
`apps/api/.env.test`. See `apps/api/.env.example` for the other settings.

### Commands

| Command                                              | What it does                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Web app and API with reload                                                                    |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | Static checks                                                                                  |
| `pnpm test`                                          | Unit tests                                                                                     |
| `pnpm test:int`                                      | API integration tests; resets `lamp_test_dev`                                                  |
| `pnpm e2e`                                           | Builds the apps and runs Playwright (Chromium; Firefox for the handout); resets `lamp_e2e_dev` |
| `pnpm build`                                         | Production build of everything                                                                 |
| `pnpm db:seed`                                       | A demo user with a few lessons in `lamp_dev`                                                   |

Notes live in the browser until sync arrives (M3), so the server seed doesn't show in the app. To
try the app with data, open <http://localhost:5173/dev/seed> under `pnpm dev`: it clears this
browser's database, seeds a month of lessons (series, replies, verse chips, tags, takeaways,
questions in each status), or adds 5,000 generated sections. Dev builds only.

`pnpm e2e` needs the browsers once: `pnpm --filter @lamp/e2e exec playwright install chromium firefox`.

### Performance

Two years of notes (207 lessons, 2,484 sections, 2,713 tags, 80 memory verses), from the first
read of IndexedDB to the screen drawn, median of three opens in Chrome on a phone-sized window
(`themes.spec.ts`, `digest.spec.ts`; measured 2026-10-19 on the development machine). The budget
is 200 ms at 4× (TECH-DESIGN §14, decision 94).

| Screen                    | CPU 4× (mid-range phone) | CPU 6× (low-end phone) |
| ------------------------- | ------------------------ | ---------------------- |
| Theme map, by month       | 118 ms                   | 222 ms                 |
| Theme map, by book        | 167 ms                   | 312 ms                 |
| Quarterly digest, drafted | 124 ms                   | 276 ms                 |
| Quarterly digest, opened  | 140 ms                   | 269 ms                 |

### Admin CLI

Accounts can be managed from the command line, for example on a private server with
`SIGNUP_ENABLED=false`. `pnpm cli <command>` builds the API and runs it against the database in
`apps/api/.env.local` (`lamp_dev`); on a server, run `node dist/cli.js <command>` from `apps/api`
with the API's environment. `pnpm cli --help` lists the commands, and `pnpm cli help <command>`
explains one.

| Command                                       | What it does                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm cli user:create <email> [--role admin]` | Creates an account with its email already verified, even with sign-up turned off. |
| `pnpm cli user:disable <email>`               | Stops the account from signing in and signs out all its devices. Its data stays.  |
| `pnpm cli user:enable <email>`                | Lets a disabled account sign in again.                                            |
| `pnpm cli user:verify <email>`                | Marks the account's email verified without the link, so it can sync.              |

`user:create` asks for the password twice, hidden; it is never taken as an argument, so it stays
out of the shell history. In a script, pipe it in instead: `printf '%s\n' "$PASSWORD" | pnpm cli
user:create reader@example.com`. The same rules as sign-up apply (at least 10 characters, not a
common password). Emails match in any case. A command that refuses prints why and exits with 1.

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, tests, and how to pick
a task from the backlog. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
To report a security problem, see [SECURITY.md](SECURITY.md).

## Licence

Lamp is [MIT licensed](LICENSE).

The Bible text is the [Berean Standard Bible](https://berean.bible/), which was dedicated to the
public domain in 2023, and the King James Version, which is in the public domain outside the United
Kingdom. The source files are kept with the data (`packages/bible-data`).
