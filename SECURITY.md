# Security

Lamp stores people's personal notes, so security problems matter even in a hobby project.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead: on the repository's
**Security** tab, choose **Report a vulnerability**. Include what you found, how to reproduce it,
and what an attacker could do with it.

You'll get a reply within a week. Once a fix is released, the advisory is published with credit to
you, unless you'd rather stay anonymous.

## Supported versions

Only the latest release, and `main`, receive security fixes.

## Scope

In scope: the web app, the API, sync, accounts and anything that could expose one user's notes to
another (TECH-DESIGN §12). Out of scope: self-hosted deployments with a changed configuration, and
problems that need physical access to an unlocked device, since notes are stored on the device by
design.
