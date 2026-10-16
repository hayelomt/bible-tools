# Contributing to Lamp

Thanks for helping. Lamp is a hobby project with no deadline, built by one developer working with
Claude Code, and open to anyone who wants to pick up a task. This guide gets you from a fresh clone
to a merged pull request.

## Setting up

Follow [Running it locally](README.md#running-it-locally) in the README: Node 24, pnpm 10 and a
local PostgreSQL 18. Docker isn't used anywhere, for development or tests.

Check the setup with:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

`pnpm install` checks the Node version once and stops with a message saying which one to use.

## Picking a task

All planned work is in [docs/BACKLOG.md](docs/BACKLOG.md), in milestones that are built in order.

1. **Take the first ☐ task in the current milestone** whose dependencies are done. Earlier
   milestones come first, in the order the backlog's _Order_ section gives (M4 is built before M3). A task's _Refs_ column points to
   the PRD feature (F1–F16) and the TECH-DESIGN section (§) it implements; read those first.
2. **Say you're taking it.** Open an issue titled with the task ID ("M2-04: Lesson create and
   edit"), or comment on the existing one, so two people don't build the same thing.
3. **Mark it ◐** in BACKLOG.md in your pull request, and ☑ when its _Done when_ condition is met.
4. **Size matters.** S is up to half a day, M about a day, L two or three days. If a task turns out
   bigger, split it in the backlog before going on.

Something that isn't in the backlog (a bug, an idea) starts as an issue. New work goes into a
milestone with the next free ID; a change of scope also needs an entry in the PRD's change log.

## Building it

- **Read the design first.** [TECH-DESIGN.md](docs/TECH-DESIGN.md) records how each part works,
  and its §15 decisions log records why. A change that goes against a decision needs the decision
  changed first, in the same pull request, with the reason.
- **Screens** follow [docs/UX-PATTERNS.md](docs/UX-PATTERNS.md) and the wireframe for the screen.
  Check them in the browser at 360 px and 1280 px wide, with the keyboard alone, and in dark
  mode.
- **Shared code** goes in `packages/domain` (pure TypeScript, no I/O) when the web app and the API
  both need it. Request and response shapes are Zod schemas there, used by both sides.
- **Write the code like the code around it:** naming, comment density, idioms. Comments say why,
  not what.
- **Keep the docs true.** If you change how something works, update the section of TECH-DESIGN that
  describes it in the same pull request.

## Tests

| Kind        | Command         | Where                            | Needs                                     |
| ----------- | --------------- | -------------------------------- | ----------------------------------------- |
| Unit        | `pnpm test`     | `*.test.ts` next to the code     | Nothing                                   |
| Integration | `pnpm test:int` | `apps/api/test/**/*.int.test.ts` | Local Postgres (`lamp_test_dev`)          |
| End to end  | `pnpm e2e`      | `apps/e2e/tests`                 | Local Postgres (`lamp_e2e_dev`), Chromium |

- `test:int` and `e2e` **reset their database** (`prisma migrate reset`) before running. They only
  ever touch `lamp_test_dev` and `lamp_e2e_dev`, never `lamp_dev`, and refuse any other database.
  When an AI agent runs them, Prisma refuses the reset until you consent: the agent asks, then sets
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` to your reply (TECH-DESIGN §10.2).
- Add tests with the change. The _Done when_ column of each task says which tests prove it.
- `packages/domain` runs its tests with coverage, and fails below its thresholds (the parser keeps
  at least 95% branch coverage).
- The theme presets have a contrast test. A new colour token, or a new pair of tokens used
  together, goes into `packages/ui/src/themes/themes.test.ts`.

## Pull requests

1. Branch from `main`, named after the task: `m2-04-lesson-form`.
2. Before pushing, run what CI runs:

   ```bash
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm e2e && pnpm build
   ```

3. Open the pull request with the template filled in. Keep one task per pull request.
4. CI runs the same checks on GitHub Actions. A pull request merges when CI is green and a
   maintainer has reviewed it.

Commit messages start with the task ID when there is one: `M2-04: Lesson create and edit`. The
summary line says what changed; the body says why, if it isn't obvious.

## Code style

Prettier formats everything (`pnpm format`), and oxlint checks it with warnings treated as errors.
TypeScript runs in strict mode. There's nothing else to remember: if the checks pass, the style is
right.

## Licence

By contributing, you agree that your contributions are licensed under the project's
[MIT licence](LICENSE).
