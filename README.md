# Lamp

**Bible study notes anchored to scripture.** Lamp is an offline-first web app for capturing
sermons and personal study as threaded notes, referencing verses inline as you type, and finding
everything you've ever written about a passage.

> "Your word is a lamp to my feet, and a light for my path." — Psalm 119:105 (WEB)

**Status:** early development. The foundations (milestone M1) are being built; the app can't be
used for notes yet. Progress is tracked in [docs/BACKLOG.md](docs/BACKLOG.md).

## What it does

- **Capture a lesson** from a sermon or a study in under two minutes, on a phone, offline.
- **Reference verses as you type:** `Rom 8:28-30` or `1 jn 3` completes into a verse chip that
  holds the text, labelled with its translation.
- **Find anything by verse:** the verse index shows every note, highlight and memory verse on a
  passage, across all lessons. Search covers text and tags too.
- **Read the World English Bible** offline, highlight verses and turn a highlight into a note.
- **Keep questions and takeaways visible** in a review queue, and memorise verses on a spaced
  schedule.
- **Optional account:** use it as a guest with no sign-up, or create an account to back up notes
  and sync them between devices.
- **Export** a lesson or series as Markdown, or print it to PDF.

The full product description is the [PRD](<docs/Bible Study App — PRD.md>); the technical
design is [TECH-DESIGN.md](docs/TECH-DESIGN.md).

## How it's built

| Part                 | Stack                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo             | Turborepo, pnpm workspaces, TypeScript (ESM), Node 24                                                                                      |
| Web app (`apps/web`) | React 19, Vite, Tailwind CSS v4, shadcn/ui on Base UI, TanStack Router, Dexie, TipTap                                                      |
| API (`apps/api`)     | NestJS 12, Prisma 7, PostgreSQL 18                                                                                                         |
| Shared (`packages/`) | `domain` (verse references, parser, document model, Zod schemas), `ui` (components and themes), `bible-data` (WEB text pipeline), `config` |
| Tests                | Vitest, Playwright, against a local PostgreSQL (no Docker)                                                                                 |

## Running it locally

You need **Node 24** (`.nvmrc`; [nvm](https://github.com/nvm-sh/nvm) is the easy way), **pnpm 10**
and **PostgreSQL 18** running on your machine (Postgres.app on macOS, the PGDG packages on Linux).
No Docker.

```bash
nvm use                                   # Node 24
pnpm install
./scripts/dev-db.sh                       # creates the lamp role and lamp_dev, lamp_test_dev, lamp_e2e_dev
pnpm db:migrate                           # applies the migrations to lamp_dev
pnpm --filter @lamp/bible-data download   # fetches the WEB text (about 4 MB) into packages/bible-data/source
pnpm dev                                  # web on http://localhost:5173, API on :3000
```

`dev-db.sh` is safe to run again; it writes the connection strings to `apps/api/.env.local` and
`apps/api/.env.test`. See `apps/api/.env.example` for the other settings.

### Commands

| Command                                              | What it does                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                           | Web app and API with reload                                           |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | Static checks                                                         |
| `pnpm test`                                          | Unit tests                                                            |
| `pnpm test:int`                                      | API integration tests; resets `lamp_test_dev`                         |
| `pnpm e2e`                                           | Builds the apps and runs Playwright (Chromium); resets `lamp_e2e_dev` |
| `pnpm build`                                         | Production build of everything                                        |
| `pnpm db:seed`                                       | A demo user with a few lessons in `lamp_dev`                          |

Notes live in the browser until sync arrives (M3), so the server seed doesn't show in the app. To
try the app with data, open <http://localhost:5173/dev/seed> under `pnpm dev`: it clears this
browser's database, seeds a month of lessons (series, replies, verse chips, tags, takeaways,
questions in each status), or adds 5,000 generated sections. Dev builds only.

`pnpm e2e` needs Chromium once: `pnpm --filter @lamp/e2e exec playwright install chromium`.

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

The Bible text is the [World English Bible](https://ebible.org/web/), which is in the public
domain. "World English Bible" is a trademark of eBible.org; Lamp ships the text unchanged so it can
use the name. The licence notice is kept with the data (`packages/bible-data`).
