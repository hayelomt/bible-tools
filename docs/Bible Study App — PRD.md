# Lamp — Bible Study App PRD

Oct 12, 2026 · @Frost Biter · v1.2 (see [Change log](#change-log))

## Overview

A local-first Bible study web app where every note is anchored to scripture. Users capture lessons from sermons or personal study as threaded note sections, reference verses inline with autocomplete, tag themes, track takeaways and open questions, and later find everything they have ever written about a passage.

- Name: **Lamp**, from Psalm 119:105, "Your word is a lamp to my feet".
- Project nature: hobby, open source (MIT), no deadline.
- Phase 1 target: a single person's study across their own devices. Group and community features are phase 2.
- Form factor: an offline-first Progressive Web App with an optional account that syncs notes between devices. The World English Bible (WEB) is bundled for offline reading.
- Core differentiator: notes are organised around verses, not pages. A verse index, verse-aware search and reader highlights all key off one normalised reference model.

## Goals and non-goals

Phase 1 succeeds when one person can study offline for a month, on a phone and a laptop, and still find any note by the verse it touches.

**Goals**

- Capture a lesson from a sermon or personal study in under two minutes, with verses referenced by typing a reference.
- Work fully offline on phone and laptop. No account is needed to start; an account backs notes up and syncs them between devices.
- Make past notes findable by verse, tag, series and free text.
- Keep open questions and takeaways visible until they are resolved.
- Let notes leave the app as Markdown or PDF.

**Non-goals for phase 1**

- Multi-user collaboration, comments, shared lessons or groups. Accounts are private; nothing is shared between users.
- ESV, or any translation other than WEB (parallel and non-English translations included).
- Audio, video or devotional content feeds.
- An admin web interface. A deployment is run from command-line tools.

## Target user and jobs to be done

The phase 1 user is one person studying on their own: taking notes during a Sunday sermon on a phone, then expanding and revisiting them later on a laptop.

| Job | When it happens | What the app must do |
| --- | --- | --- |
| Capture a sermon | Sunday, on a phone, often offline | Fast lesson creation, verse autocomplete, threaded sections, no sign-in needed |
| Continue on another device | Later, on a laptop | Notes from the phone appear after sign-in; edits made on both devices sync without losing text |
| Study a passage | During the week, reader open | Read WEB offline, highlight, annotate, promote a highlight into a lesson section |
| Revisit a theme | Weeks or months later | Search by tag, verse or text; verse index shows every note on a passage |
| Follow up on questions | Weekly review | Review queue lists open questions and recent takeaways; a question becomes an answered section |
| Memorise a verse | Ongoing | Mark a verse, review it on a spaced schedule |
| Share a lesson | Occasionally | Export a lesson as Markdown or PDF |

## Core concepts and data model

The verse reference is the hub: sections, highlights and memory items all point at it, which is what makes the verse index, verse-aware search and "everything on Romans 8" cheap to build.

&#91;embedded content: data model · 8 entities, verse reference as hub\]

Series contain lessons; lessons contain a tree of sections; a question can be promoted into a section; sections, highlights and memory items all cite verse references. Every entity belongs to one user (or to the device, for a guest) and carries the fields sync needs; the full schema is in [TECH-DESIGN §5](TECH-DESIGN.md#5-data-model-prisma-postgresql).

| Entity | Key fields | Notes |
| --- | --- | --- |
| Series | id, title, description, kind (sermon series / book study / custom), createdAt | Optional grouping of lessons |
| Lesson | id, seriesId?, title, date, source (sermon / personal / group), speaker?, church?, mainPassages\[\] | Top-level container; mainPassages are verse references |
| Section | id, lessonId, parentId?, order, body (rich text), createdAt, updatedAt | Tree, max two levels deep in UI; body holds inline verse chips |
| Verse reference | book, chapter, verseStart?, chapterEnd?, verseEnd?, display, translation, snapshotText | Stored on every citing entity; book as canonical code (e.g. ROM); snapshotText frozen at capture; ranges may cross chapters |
| Tag | id, name, isSeeded | Many-to-many with sections and lessons; 24 seeded themes ship with the app |
| Takeaway | id, lessonId, text, createdAt | Short statements; shown in review queue |
| Question | id, lessonId, text, status (open / answered / parked), answerSectionId? | Promotion creates a section and links it |
| Highlight | id, verseRef, colour, note?, createdAt, promotedSectionId? | Made in the reader; can be promoted into a lesson section |
| Memory item | id, verseRef, addedAt, nextReviewAt, interval, ease | Simple spaced-repetition state |

## Feature specification

Each feature is a user story with acceptance criteria. All are phase 1 unless marked otherwise.

**F1. Lessons and series**

- As a user I can create a lesson with a title, date, source and one or more main passages, so a sermon has a home.
- As a user I can group lessons into a series and see them in order.
- Accepts: lesson creation takes one screen; date defaults to today; series is optional; a lesson can move between series.

**F2. Threaded note sections**

- As a user I can add a section under a lesson, and a reply-section under a section, so a thread of thought and its related verses stays together.
- Accepts: sections are a tree; UI allows two levels; sections reorder by drag; each section has its own tags and inline verse chips; deleting a parent asks before deleting children.

**F3. Verse autocomplete with inline preview**

- As a user, when I type a reference like `Rom 8:28-30` or `1 Jn 3`, I see a dropdown that completes it and shows the verse text below, so I never leave the note to look it up.
- Accepts: parser handles book abbreviations and fuzzy names, chapter-only, ranged and cross-chapter references; selecting inserts a verse chip holding the normalised reference and snapshot text; chip expands to full text on tap; works offline with WEB.
- A chip always shows the text it was captured with, labelled with its translation. When more translations exist (phase 2), an expanded chip can show the verse in any downloaded translation without changing the note.

**F4. Tags**

- As a user I can tag a section or lesson with a theme from a seeded list or my own, with autocomplete.
- Accepts: 24 seeded themes (grace, faith, prayer, hope, love, holiness, obedience, suffering, identity, worship, mission, repentance, forgiveness, salvation, the cross, resurrection, Holy Spirit, church, wisdom, justice, fear, stewardship, family, promises); custom tags persist; tag page lists every section and lesson with that tag.

**F5. Takeaways and open questions**

- As a user I can record key takeaways and open questions on a lesson, and turn a question into a section that holds its answer.
- Accepts: questions have status open / answered / parked; promoting creates a child section titled with the question and sets status to answered when the section has a body; takeaways and questions appear in the review queue.

**F6. Search**

- As a user I can search all notes by free text, tag or verse reference, offline.
- Accepts: client-side index; results grouped by lesson; a verse query (e.g. `Rom 8`) matches any chip within that chapter; results open at the matching section.

**F7. Cross-lesson verse index**

- As a user I can open any passage and see every section, highlight and memory item that cites it, across all lessons.
- Accepts: reachable from a verse chip, the reader and search; sorted newest first; shows the lesson, date and the surrounding section text.

**F8. Bible reader with highlights**

- As a user I can read WEB offline chapter by chapter, highlight verses, add a short note to a highlight, and promote a highlight into a section of a lesson.
- Accepts: chapter navigation and book picker; four highlight colours; promotion asks which lesson (or creates one) and inserts a section with the verse chip and note.

**F9. Review queue**

- As a user I can open a review view that lists open questions, recent takeaways and memory verses due today, so nothing is forgotten.
- Accepts: "recent" means the last 14 days by default, adjustable in settings; questions can be parked or answered from the queue; optional weekly reminder where the browser supports it, otherwise a badge count on the Review tab.

**F10. Scripture memory**

- As a user I can mark a verse to memorise and review it on a spaced schedule with a hide-and-reveal card.
- Accepts: simple SM-2 style intervals; a daily due list inside the review queue; progress per verse.

**F11. Export and share**

- As a user I can export a lesson or a series as Markdown, and as PDF, so I can share or archive it.
- Accepts: Markdown keeps section nesting, verse text and tags; PDF comes from a print view of the lesson saved with the browser's "Save as PDF", offline. Read-only share links are deferred to phase 2.

**F12. PWA and offline**

- As a user I can install the app and use every feature above with no network.
- Accepts: installable manifest; service worker caches the app shell and WEB text; all writes go to local storage first; works in a fresh install with no account.

**F13. ESV live fetch** — *moved to phase 2 (v1.1).* See [Phase 2 and beyond](#phase-2-and-beyond).

**F14. Accounts**

- As a user I can start without an account, and later sign up with email and password so my notes are backed up.
- Accepts: sign-up, email verification, sign-in, sign-out, forgotten-password reset and password change; notes made as a guest join the account at sign-up; nothing syncs until the email is verified; a deployment can turn public sign-up off.
- Signing out keeps the notes on the device. If a different account signs in on that device, the app asks whether to remove the previous notes (default) or add them to the new account; notes never move between accounts silently.
- A user can see their signed-in devices, sign one out, and delete their account and all its data.

**F15. Sync across devices**

- As a user my notes appear on every device I sign in on, and edits made offline on any of them reach the others when they reconnect.
- Accepts: every change is saved locally first and synced in the background; a status indicator shows synced / syncing / offline with N changes waiting; if the same section's text was edited on two devices, the newer text stays and the other is kept beside it as a "conflicted copy", so nothing typed is lost; a new device downloads all notes on first sign-in with progress shown.

**F16. Themes**

- As a user I can pick the app's look from a set of presets and choose light, dark or system mode.
- Accepts: six presets (Parchment, Vellum, Olive, Slate, Cedar, Midnight); every preset meets WCAG AA contrast in both modes; the choice syncs across my devices and applies before the first paint.

## Bible text and translation strategy

Phase 1 ships WEB only, bundled for offline use. The data model is translation-agnostic, so more translations can be added in phase 2 without migration.

| Translation | Phase | Delivery | Licence position |
| --- | --- | --- | --- |
| World English Bible (WEB) | 1 | Bundled as a compressed JSON per book, cached by the service worker | Public domain; safe to bundle in an open-source repo. The text is kept unchanged so it can keep the WEB name |
| Other open translations (e.g. BSB, KJV) | 2 | Same pipeline as WEB | Public domain (KJV: except in the UK); each gets a licence check |
| ESV | 2 | Live from the ESV API through the app's server, so no key reaches the browser | Licensed; the API terms restrict bulk download and offline storage. Re-check the terms before building |
| Non-English translations | 2 | To be decided per translation | Each needs its own licence check |

Rules that follow from this:

- The repo never contains an API key.
- Every verse chip stores which translation its snapshot came from and labels it in the UI.
- Reference normalisation (book code, chapter, verse range) is translation-independent; only the text lookup varies.
- Versification differences between translations are out of scope for phase 1 and noted as a phase 2 risk.

## Technical architecture

Phase 1 is an offline-first PWA with a small sync server. Each device holds its user's notes in IndexedDB and works from them, offline or online; a NestJS API with PostgreSQL stores accounts and syncs notes between devices. The full design is in [TECH-DESIGN.md](TECH-DESIGN.md).

| Layer | Choice |
| --- | --- |
| Monorepo | Turborepo + pnpm, TypeScript, ESM, Node 24 LTS |
| Web app | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Router, Dexie (IndexedDB), TipTap editor, MiniSearch |
| API | NestJS 12 with Zod validation shared with the web app |
| Database | PostgreSQL 18 through Prisma 7 |
| Sync | Outbox on the device, push/pull by per-user revision, last write wins with conflicted copies for section text |
| Bible text | WEB as per-book JSON, cached by the service worker |
| Export | Markdown from the document model; PDF through the browser's print view |
| Hosting | One Linux VPS: Caddy, Node, PostgreSQL; no containers |
| Tests | Vitest (unit, integration), Playwright (E2E), against the machine's own PostgreSQL |

Schema decisions to lock before coding:

1. Verse reference shape: `{ book, chapter, verseStart?, chapterEnd?, verseEnd?, display, translation, snapshotText }` with `book` as a canonical three-letter code.
2. Section tree: `parentId` plus a fractional `order` string so reordering never rewrites siblings.
3. All ids are UUIDs generated on the device, and all rows carry `createdAt`, `updatedAt`, a server revision and a delete marker, for sync.

## Phase 1 milestones

Phase 1 is sequenced into five milestones so the app is always usable; no dates, since this is a hobby project.

&#91;embedded content: phase 1 roadmap · 4 milestones, each with a gate\] *(predates v1.1; the table below is current)*

Milestone A must land before anything else because every later feature reads the verse references and section tree it defines. B comes next so the data model is proven against sync before more entities are built on it. C and D could be reordered; E depends on C (the review queue reads questions and takeaways) and D (memory verses come from the reader).

| Milestone | Features | Gate |
| --- | --- | --- |
| A · Spine | F1, F2, F3, F12, F16 | A sermon can be captured offline and reopened |
| B · Accounts and sync | F14, F15 | Notes captured offline on a phone appear on a laptop, and a two-device edit loses nothing |
| C · Structure | F4, F5, F6, F7 | Any past note can be found by tag, text or verse |
| D · Reader | F8 | Scripture is read, highlighted and promoted inside the app |
| E · Loops and output | F9, F10, F11 | Questions and verses come back for review; lessons export |

The task breakdown is in [BACKLOG.md](BACKLOG.md).

## Phase 2 and beyond

Phase 2 builds on the accounts and sync from phase 1 to add sharing, community and more translations.

- Read-only share links for lessons and series.
- Groups: shared series, members adding their own sections and questions to a group lesson, comments on sections.
- ESV through the server (F13), more open translations (BSB, KJV), parallel translations in the reader and chips, non-English translations as licences allow.
- Import from other note apps (Markdown folders first).
- Reading plans tied to series.
- An admin web interface for deployments.

## Open questions and risks

- [x] ~~Confirm the current ESV API terms on caching and non-commercial use before milestone C.~~ ESV moved to phase 2; check the terms before building it.
- [x] ~~Pick the front-end framework and the IndexedDB wrapper before milestone A.~~ React + Dexie (TECH-DESIGN §2).
- [x] ~~Decide whether verse chips re-render from the live translation or always show the snapshot.~~ Snapshot, with "View in …" for other downloaded translations (F3).
- [x] ~~Settle the seeded tag list and whether tags are also applied at lesson level.~~ 24 themes; tags apply to lessons too (F4).
- [ ] Versification differences across translations are ignored in phase 1; revisit when a second translation is added in phase 2.
- [ ] Storage growth: WEB plus notes stays small; measure storage on a low-end phone before release.
- [x] ~~Licence for the project itself (MIT or Apache-2.0) and a contributor guide.~~ MIT; the contributor guide is a backlog task.
- [x] ~~Theme preset names and colours.~~ The reading-room set: Parchment, Vellum, Olive, Slate, Cedar, Midnight; colours tuned in the UX pass.
- [ ] Notes are personal: hosting them needs a privacy note for users (what is stored, who can see it, how to delete it) before a public deployment.

## Change log

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-10-12 | First version. |
| 1.1 | 2026-10-12 | Technical design decisions: phase 1 gains a NestJS + PostgreSQL server, optional accounts (F14) and cross-device sync (F15), moved from phase 2. ESV (F13) moves to phase 2; phase 1 ships WEB only. Theme presets added (F16). Product decisions: guest use without an account, sign-out keeps notes on the device, chips show their snapshot, 24 seeded tags on sections and lessons, a 14-day review window, PDF through the print view, MIT licence, no admin UI. Verse references may cross chapters. Milestones become A–E, with accounts and sync as B. |
| 1.2 | 2026-10-12 | Named the app **Lamp**. Theme presets settled (F16). Hosting on the existing VPS provider, email through Resend, errors to Sentry, backups by provider snapshots; see TECH-DESIGN §15. |
