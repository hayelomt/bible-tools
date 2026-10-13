<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Database resets need the user's consent

`pnpm test:int` and `pnpm e2e` run `prisma migrate reset --force` on `lamp_test_dev` and `lamp_e2e_dev`. Prisma refuses this under an AI agent, whatever the database is called. Before running either, ask the user for consent (name the command and the database, and say that its data is destroyed). Then run it with `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set to the exact text of their reply. Never set it without asking, and never reset `lamp_dev`.
