# Lamp — Bible Study App PRD

Oct 17, 2026 · @Frost Biter · v1.8 (see [Change log](#change-log))

## Overview

A local-first Bible study web app where every note is anchored to scripture. Users capture lessons from sermons or personal study as threaded note sections, reference verses inline with autocomplete, tag themes, track takeaways and open questions, and later find everything they have ever written about a passage.

- Name: **Lamp**, from Psalm 119:105, "Your word is a lamp to my feet".
- Project nature: hobby, open source (MIT), no deadline.
- Phase 1 (v1, F1–F16) target: a single person's study across their own devices.
- Form factor: an offline-first Progressive Web App with an optional account that syncs notes between devices. The Berean Standard Bible (BSB) is bundled for offline reading, and the King James Version (KJV) is an optional download. No further translations are planned.
- Core differentiator: notes are organised around verses, not pages. A verse index, verse-aware search and reader highlights all key off one normalised reference model.

**v2 position (F17–F35).** Lamp is where a person's thinking about scripture lives. Reading, translations, commentaries, word study and reading plans belong to the apps people already use (YouVersion, Blue Letter Bible, Bible Hub, Logos); Lamp does not compete with them. v2 makes Lamp the place those apps send verses *to*, and the place where notes accumulate into something that compounds: a running commentary per passage, links between ideas, the history of a question, and what resurfaces over time. v2 replaces the earlier phase 2 plan.

- v2 core: interop (share target, paste, "Open in…", YouVersion import, a lightweight inbox) and the thinking layer (compile view, backlinks, question lineage, study-method templates).
- v2 long tail: the sermon workflow, reflection over time, more export formats, read-only share links, and groups.

## Goals and non-goals

Phase 1 succeeds when one person can study offline for a month, on a phone and a laptop, and still find any note by the verse it touches.

v2 succeeds when a verse found in any other app reaches a Lamp lesson in two taps, and when opening a passage shows everything the user has ever thought about it as one readable document.

**Goals (phase 1)**

- Capture a lesson from a sermon or personal study in under two minutes, with verses referenced by typing a reference.
- Work fully offline on phone and laptop. No account is needed to start; an account backs notes up and syncs them between devices.
- Make past notes findable by verse, tag, series and free text.
- Keep open questions and takeaways visible until they are resolved.
- Let notes leave the app as Markdown or PDF.

**Goals (v2)**

- Receive verses and notes from other apps without retyping.
- Hand off to other apps for reading and word study with one tap, and never host that content.
- Turn years of scattered sections into a running commentary per passage.
- Connect ideas across lessons, not only verses.
- Bring old questions and old notes back at the right time.
- Let a lesson, series or commentary be read by others through a link, and let a group study a series together.

**Non-goals for v2 (and beyond)**

- Reading plans, streaks, audio Bible, daily-verse feeds.
- Commentaries, dictionaries, Strong's numbers, interlinear text, cross-reference databases.
- Friend activity feeds of what others highlight or read.
- Translations beyond BSB and KJV; parallel translation view; ESV.
- Teaching tools: discussion-guide generation, lesson forks.
- Importers other than YouVersion (Logos, Olive Tree, Kindle and Markdown folders are out of scope).
- An admin web interface. A deployment is run from command-line tools.

In phase 1 accounts are private and nothing is shared between users; sharing arrives with v2's share links (F34) and groups (F35).

## Target user and jobs to be done

The phase 1 user is one person studying on their own: taking notes during a Sunday sermon on a phone, then expanding and revisiting them later on a laptop.

| Job | When it happens | What the app must do |
| --- | --- | --- |
| Capture a sermon | Sunday, on a phone, often offline | Fast lesson creation, verse autocomplete, threaded sections, no sign-in needed |
| Continue on another device | Later, on a laptop | Notes from the phone appear after sign-in; edits made on both devices sync without losing text |
| Study a passage | During the week, reader open | Read the BSB or KJV offline, highlight, annotate, promote a highlight into a lesson section |
| Revisit a theme | Weeks or months later | Search by tag, verse or text; verse index shows every note on a passage |
| Follow up on questions | Weekly review | Review queue lists open questions and recent takeaways; a question becomes an answered section |
| Memorise a verse | Ongoing | Mark a verse, review it on a spaced schedule |
| Share a lesson | Occasionally | Export a lesson as Markdown or PDF |

## Core concepts and data model

The verse reference is the hub: sections, highlights and memory items all point at it, which is what makes the verse index, verse-aware search and "everything on Romans 8" cheap to build.

&#91;embedded content: data model · 8 entities, verse reference as hub\]

Series contain lessons; lessons contain a tree of sections; a question can be promoted into a section; sections, highlights and memory items all cite verse references. Every entity belongs to one user (or to the device, for a guest) and carries the fields sync needs; the full schema is in [TECH-DESIGN §5](TECH-DESIGN.md#5-data-model-prisma-postgresql). From v2, sections and comments a member shares into a group are visible to that group (F35).

| Entity | Key fields | Notes |
| --- | --- | --- |
| Series | id, title, description, kind (sermon series / book study / custom), createdAt | Optional grouping of lessons |
| Lesson | id, seriesId?, title, date, kind (sermon / personal / group; called source until v1.8), speaker?, church?, mainPassages\[\] | Top-level container; mainPassages are verse references |
| Section | id, lessonId, parentId?, order, body (rich text), createdAt, updatedAt | Tree, max two levels deep in UI; body holds inline verse chips |
| Verse reference | book, chapter, verseStart?, chapterEnd?, verseEnd?, display, translation, snapshotText | Stored on every citing entity; book as canonical code (e.g. ROM); snapshotText frozen at capture; ranges may cross chapters |
| Tag | id, name, isSeeded | Many-to-many with sections and lessons; 24 seeded themes ship with the app |
| Takeaway | id, lessonId, text, createdAt | Short statements; shown in review queue |
| Question | id, lessonId, text, status (open / answered / parked), answerSectionId? | Promotion creates a section and links it |
| Highlight | id, verseRef, colour, note?, createdAt, promotedSectionId? | Made in the reader; can be promoted into a lesson section |
| Memory item | id, verseRef, addedAt, nextReviewAt, interval, ease | Simple spaced-repetition state |

### Data model additions (v2)

| Entity | Key fields | Notes |
| --- | --- | --- |
| Inbox item | id, origin (share / paste / import / capture), verseRef?, text?, translation?, sourceUrl?, receivedAt, snoozedUntil?, placedInSectionId? | F17, F27; placed items keep a pointer for undo |
| Link | fromSectionId, targetType (lesson / section), targetId | F23; derived from the link chips in section bodies, like the verse index, so it can never disagree with the text; backlinks are the reverse index |
| Question entry | id, questionId, lessonId, kind (asked / revisited / partial / answered / reopened / parked), sectionId?, createdAt | F24; question status derives from the latest entry |
| Template | id, name, structure (named sections with nesting) | F25; the four built-ins are part of the app, not stored; the default template per lesson kind is a setting |
| Source | type (sermon / book / podcast / other), title, url?, author?, startedAt? | F28; optional fields on the lesson, since a lesson has at most one; sections carry an optional timestamp or page |
| Passage visit, resurface dismissal | passage, visitedAt; rule, target, until | F30; synced so a visit or a dismissal on one device holds on all |
| Share link | id, targetType, targetId, token, expiresAt?, isLive, createdAt, lastOpenedAt, revokedAt? | F34 |
| Group | id, name, ownerUserId, inviteToken, createdAt | F35 |
| Group membership | groupId, userId, role (owner / member), joinedAt | F35 |
| Group series | groupId, seriesId | F35; a series shared into a group |
| Comment | id, sectionId, userId, body, createdAt | F35; only on public sections |

Sections gain `visibility` (private / group) and an optional `groupId`; both default to private so v1 data needs no migration beyond new columns. The lesson's source (sermon / personal / group) is renamed its *kind*, so it doesn't clash with F28's source. The technical design of each entity is in [TECH-DESIGN §17](TECH-DESIGN.md#17-v2-design-f17f35).

## Feature specification

Each feature is a user story with acceptance criteria. F1–F16 are phase 1 (v1); F17–F35 are v2, where core features ship first and long-tail features follow in the milestone order below.

### Phase 1

**F1. Lessons and series**

- As a user I can create a lesson with a title, date, source and one or more main passages, so a sermon has a home.
- As a user I can group lessons into a series and see them in order.
- Accepts: lesson creation takes one screen; date defaults to today; series is optional; a lesson can move between series.

**F2. Threaded note sections**

- As a user I can add a section under a lesson, and a reply-section under a section, so a thread of thought and its related verses stays together.
- Accepts: sections are a tree; UI allows two levels; sections reorder by drag; each section has its own tags and inline verse chips; deleting a parent asks before deleting children.

**F3. Verse autocomplete with inline preview**

- As a user, when I type a reference like `Rom 8:28-30` or `1 Jn 3`, I see a dropdown that completes it and shows the verse text below, so I never leave the note to look it up.
- Accepts: parser handles book abbreviations and fuzzy names, chapter-only, ranged and cross-chapter references; selecting inserts a verse chip holding the normalised reference and snapshot text; chip expands to full text on tap; works offline with the BSB or KJV.
- A chip always shows the text it was captured with, labelled with its translation.

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

- As a user I can read the BSB or KJV offline chapter by chapter, highlight verses, add a short note to a highlight, and promote a highlight into a section of a lesson.
- Accepts: chapter navigation and book picker; four highlight colours; promotion asks which lesson (or creates one) and inserts a section with the verse chip and note.

**F9. Review queue**

- As a user I can open a review view that lists open questions, recent takeaways and memory verses due today, so nothing is forgotten.
- Accepts: "recent" means the last 14 days by default, adjustable in settings; questions can be parked or answered from the queue; optional weekly reminder where the browser supports it, otherwise a badge count on the Review tab.

**F10. Scripture memory**

- As a user I can mark a verse to memorise and review it on a spaced schedule with a hide-and-reveal card.
- Accepts: simple SM-2 style intervals; a daily due list inside the review queue; progress per verse.

**F11. Export and share**

- As a user I can export a lesson or a series as Markdown, and as PDF, so I can share or archive it.
- Accepts: Markdown keeps section nesting, verse text and tags; PDF comes from a print view of the lesson saved with the browser's "Save as PDF", offline. Read-only share links are F34.

**F12. PWA and offline**

- As a user I can install the app and use every feature above with no network.
- Accepts: installable manifest; service worker caches the app shell, and the Bible text is kept on the device; all writes go to local storage first; works in a fresh install with no account.

**F13. ESV live fetch** — *moved to phase 2 (v1.1), dropped in v1.7.* ESV and further translations are a non-goal; see [Bible text and translation strategy](#bible-text-and-translation-strategy).

**F14. Accounts**

- As a user I can start without an account, and later sign up with email and password so my notes are backed up.
- Accepts: sign-up, email verification, sign-in, sign-out, forgotten-password reset and password change; notes made as a guest join the account at sign-up; nothing syncs until the email is verified; a deployment can turn public sign-up off.
- Signing out keeps the notes on the device. If a different account signs in on that device, the app asks whether to remove the previous notes (default) or add them to the new account; notes never move between accounts silently.
- A user can see their signed-in devices, sign one out, and delete their account and all its data.

**F15. Sync across devices**

- As a user my notes appear on every device I sign in on, and edits made offline on any of them reach the others when they reconnect.
- Accepts: every change is saved locally first and synced in the background; a status indicator shows synced / syncing / offline with N changes waiting; if the same section's text was edited on two devices, the newer text stays and the other is kept beside it as a "conflicted copy", so nothing typed is lost; a new device downloads all notes on first sign-in with progress shown.

**F16. Themes**

- As a user I can choose light or dark mode, or Auto to follow my device.
- Accepts: one theme, Lamplight, in light and dark, set in Inter Tight throughout; it meets WCAG AA contrast in both modes; a new device offers the mode on first run, defaulting to Auto so it can be skipped; the choice syncs across my devices and applies before the first paint.

### v2 core

**F17. Inbox (lightweight)**

- As a user I have an inbox where verses and notes that arrive from outside a lesson wait until I place them, so capture never requires choosing a lesson first.
- Accepts: a flat list of inbox items, newest first; each item holds a verse chip and/or free text, its origin (share, paste, import, capture) and the translation of any verse text it carried; an item can be sent to a lesson as a new section, appended to an existing section, or dismissed; a badge on the Inbox tab shows the count; items sync like any other entity.
- Full triage tooling (bulk actions, promote to takeaway/question, tagging in the inbox) is F27.

**F18. Share target**

- As a user I can share a verse or passage from another app (YouVersion, Blue Letter Bible, a browser) straight into Lamp, so the verse lands in my inbox with its reference already recognised.
- Accepts: Lamp registers as a PWA share target for text and URLs; shared text is run through the reference parser and verse detector (F19); a recognised reference becomes a chip with the shared text as its snapshot, labelled with the translation when it can be identified from the text or URL, otherwise "shared"; the share lands in the inbox by default, or directly in the lesson that was open in the last 10 minutes when the user chooses "add to current lesson"; works offline and queues if the app was not yet loaded.

**F19. Paste intelligence**

- As a user, when I paste text that contains a reference or a recognisable verse, Lamp offers to turn it into a chip, so copying from any source is as good as a share.
- Accepts: on paste into a section or the inbox, the text is scanned for references (reusing the F3 parser) and for verse text matched against BSB and, when downloaded, KJV; a non-intrusive prompt offers "make chip" per detected reference, keeping any surrounding text as the section body; when the pasted text is a verse but the reference is not present, the match supplies it; pasted text from an unknown translation keeps its text verbatim with translation "pasted"; nothing is converted without the user's confirmation; the prompt can be turned off in settings.

**F20. "Open in…" on chips**

- As a user I can open any chip's passage in the app I use for reading or word study, so Lamp hands off instead of reproducing those tools.
- Accepts: an expanded chip offers Blue Letter Bible, YouVersion, Bible Hub and Logos; each is a deep link built from the normalised reference, with a translation parameter where the target supports it; the user can hide targets and reorder them in settings; Lamp stores nothing from the target; links open in a new tab or the installed app as the platform allows.

**F21. YouVersion importer**

- As a user I can import my YouVersion highlights and notes, so what I already wrote there becomes material in Lamp rather than being lost.
- Accepts: accepts the export file YouVersion provides to the user; each highlight or note becomes an inbox item with a chip (reference and verse text as exported, labelled with its translation), the note text, the original date and colour; duplicates on re-import are detected by reference, date and text and skipped; the import runs client-side with a progress bar; the user can place items from the inbox or dismiss them in bulk once F27 lands.

**F22. Compile view**

- As a user I can open a passage and read every section I have ever written about it stitched into one document in canonical order, so my notes become my own running commentary.
- Accepts: reachable from a chip, the reader, search and the verse index; the scope can be a verse range, a chapter or a book; sections are ordered by the first verse they cite, then by date, and grouped under the verse they cite with the lesson title and date as a byline; sections that cite several passages appear under each; the view is read-only, with each section linking back to its lesson; exports as Markdown and (via F34) can be shared read-only; large books render progressively.

**F23. Backlinks**

- As a user I can link to another lesson or section from inside a section, and see which sections link to the one I am reading, so ideas connect across lessons the way verses already do.
- Accepts: typing `[[` opens a picker over lessons and sections (search by title or body text); the link renders as a chip with the target's title and resolves on tap; a "Linked from" list under each section and each lesson shows backlinks; links survive renames; deleting a target leaves a visibly broken chip rather than silently removing text; links are included in Markdown export as relative references.

**F24. Question lineage**

- As a user I can see the history of a question across lessons, so I know where I asked it, where I revisited it and what partial answers I have gathered.
- Accepts: a question can be revisited from another lesson, which creates a linked entry rather than a duplicate; the question page shows a thread of entries in date order: asked, revisited, partially answered (a linked section), answered, reopened; status is derived from the latest entry; the review queue (F9) shows the lineage summary; a question can be split into two or merged with another.

**F25. Study-method templates**

- As a user I can start a lesson or a section from a study-method scaffold, so I follow a method without rebuilding its structure every time.
- Accepts: four built-in templates: SOAP (Scripture, Observation, Application, Prayer), inductive (Observe, Interpret, Apply), Lectio Divina (Read, Meditate, Pray, Contemplate) and verse mapping (the verse, key words, cross-references I find, paraphrase, application); applying a template creates named sections (and child sections where the method nests) that behave like ordinary sections afterwards; the user can create and edit their own templates; a template can be set as the default for new lessons of a given kind (e.g. personal study).

### v2 long tail

**F26. Capture mode**

- As a user I can switch a lesson into a stripped-down live view during a sermon, so I can keep up without touching formatting.
- Accepts: one-tap entry from a lesson; large "new section" button, a quick verse box that accepts a reference and inserts a chip, and plain text only; every section gets a timestamp; no tags, formatting or drag-reorder in this view; exiting returns to the normal lesson with the sections intact; optional: a passage entered beforehand (F29) is pinned at the top.

**F27. Inbox triage**

- As a user I can process the inbox quickly, so a week of shares, pastes and captures becomes structured notes.
- Accepts: multi-select with bulk "send to lesson", "dismiss" and "tag"; promote an item directly to a takeaway or a question on a chosen lesson; create a lesson from a set of items; keyboard shortcuts on desktop; a "process later" snooze that hides an item until a date; items older than 30 days are flagged.

**F28. Source attachment**

- As a user I can attach the source of a lesson or a section (sermon audio or video URL with a timestamp, a book with a page, a podcast episode), so I can return to the moment a thought came from.
- Accepts: a lesson has an optional source (type, title, URL, author); a section can carry a timestamp or a page that links to the lesson's source; timestamps captured in F26 are relative to a start time the user sets, and open the media at that point when the URL supports it; sources appear in Markdown export and in the handout.

**F29. Prep card**

- As a user I can enter the passage announced for the coming sermon and see what I already have on it, so I arrive already thinking.
- Accepts: a card on the home screen for the next lesson's passage; shows the compile view summary, open questions and tags that cite the passage, and the last lesson in the same series; entering the passage creates a draft lesson that F26 opens into; the card clears when the lesson is saved.

**F30. Resurfacing**

- As a user my review queue brings back old material at the right time, so notes do not disappear after they are written.
- Accepts: three resurfacing rules feed the queue (F9): "a year ago" (lessons and questions from the same week in earlier years), "repeated verse" (a verse cited in three or more lessons that has no compile view visit in six months) and "stale question" (open questions older than 90 days); each rule can be turned off; a resurfaced item can be dismissed for a year.

**F31. Theme map**

- As a user I can see my tags against time and against the books of the Bible, so I notice what I dwell on and what I never touch.
- Accepts: two views: tags by month for the last 24 months, and tags by book across the whole Bible, each as a heat grid; a cell opens the matching sections; books with no notes are shown plainly; the view works offline from local data.

**F32. Quarterly digest**

- As a user I receive a drafted summary every quarter of what I studied, so I can reflect and keep a record.
- Accepts: generated locally on the first open after a quarter ends; lists lessons and series, top tags, questions answered and still open, memory verses added and reviewed, and the compile views that grew most; editable before saving; stored as a special lesson tagged "digest"; exportable as Markdown.

**F33. Export: Notion-friendly Markdown and printable handout**

- As a user I can export a lesson in a flat Markdown that pastes cleanly into Notion, and as a one-page handout for printing.
- Accepts: Notion export flattens the section tree into headings and quotes, keeps verse text as block quotes with the reference as a caption, and keeps tags as a line of text; the handout is a print view that fits a lesson's main passages, takeaways, questions and section headings on one page, dark on white like the F11 print view; both work offline.

**F34. Read-only share links**

- As a user I can create a link that lets anyone read a lesson, a series, a compile view or a handout, so I can share without the reader needing an account.
- Accepts: a link is created per target with an unguessable id; the owner can revoke it, set an expiry and see the created and last-opened dates; shared pages are served by the API in Lamplight, light or dark following the reader's device, with no editing and no comments; a series link lists its lessons; a compile-view link is frozen at creation time or set to live, as the owner chooses; share links appear in the owner's settings.

**F35. Groups**

- As a user I can create a group around a series, so several people study it together, add their own sections and questions, comment on each other's sections and keep a shared list of open questions.
- Accepts: a group has an owner, members invited by link, and one or more shared series; a lesson in a shared series shows a public thread (visible to members) and each member's private thread; members add sections and questions to the public thread and comment on any public section; a group questions queue lists open questions across the shared series with who asked and who answered; members can leave, and the owner can remove members and transfer ownership; private notes never sync to other members; notifications for replies and new questions are in-app, with optional email digests.

## Bible text and translation strategy

Lamp ships two public-domain translations (decided 2026-10-15, replacing WEB; TECH-DESIGN §9). The user picks one in settings; it is what the reader shows and what new chips, highlights and passages quote. No further translations are planned: Lamp hands off to other apps for reading (F20) rather than hosting more text.

| Translation | Delivery | Licence position |
| --- | --- | --- |
| Berean Standard Bible (BSB) | The default; downloaded in the background as one JSON file per book and kept on the device | Public domain since 2023; safe to bundle in an open-source repo |
| King James Version (KJV) | Same pipeline, downloaded when the user asks for it in settings | Public domain (except in the UK) |
| ESV, other and non-English translations | Not planned (non-goal from v1.7) | — |

Rules that follow from this:

- The repo never contains an API key.
- Every verse chip stores which translation its snapshot came from and labels it in the UI.
- Reference normalisation (book code, chapter, verse range) is translation-independent; only the text lookup varies.
- Both translations number verses the KJV's way, so nothing typed is remapped. A verse the BSB leaves out keeps its number and shows the BSB's note.

## Technical architecture

Phase 1 is an offline-first PWA with a small sync server. Each device holds its user's notes in IndexedDB and works from them, offline or online; a NestJS API with PostgreSQL stores accounts and syncs notes between devices. v2 adds public share pages (F34) and syncing between group members (F35) to the server. The full design is in [TECH-DESIGN.md](TECH-DESIGN.md).

| Layer | Choice |
| --- | --- |
| Monorepo | Turborepo + pnpm, TypeScript, ESM, Node 24 LTS |
| Web app | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Router, Dexie (IndexedDB), TipTap editor, MiniSearch |
| API | NestJS 12 with Zod validation shared with the web app |
| Database | PostgreSQL 18 through Prisma 7 |
| Sync | Outbox on the device, push/pull by per-user revision, last write wins with conflicted copies for section text |
| Bible text | BSB and KJV as per-book JSON, kept on the device |
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

Milestone A must land before anything else because every later feature reads the verse references and section tree it defines. C comes next, then B: finding past notes matters more than sync while the app is used on one device, and every write already queues for sync, so B adds sync to C's entities without rework. D could come before B or C; E depends on C (the review queue reads questions and takeaways) and D (memory verses come from the reader).

| Milestone | Features | Gate |
| --- | --- | --- |
| A · Spine | F1, F2, F3, F12, F16 | A sermon can be captured offline and reopened |
| B · Accounts and sync | F14, F15 | Notes captured offline on a phone appear on a laptop, and a two-device edit loses nothing |
| C · Structure | F4, F5, F6, F7 | Any past note can be found by tag, text or verse |
| D · Reader | F8 | Scripture is read, highlighted and promoted inside the app |
| E · Loops and output | F9, F10, F11 | Questions and verses come back for review; lessons export |

## v2 milestones

v2 continues the letters from v1's A–E. No dates.

| Milestone | Features | Gate |
| --- | --- | --- |
| F · Interop core | F17, F18, F19, F20, F21 | A verse shared from YouVersion reaches a lesson in two taps; a YouVersion export lands in the inbox |
| G · Thinking layer | F22, F23, F24, F25 | Opening Romans 8 shows every section ever written on it as one document; a question's history reads as a thread |
| H · Sermon workflow | F26, F27, F28, F29 | A sermon is captured live, triaged in the week and traced back to its recording |
| I · Reflection and export | F30, F31, F32, F33 | Old questions and verses return on their own; a lesson pastes into Notion and prints on one page |
| J · Sharing and groups | F34, F35 | A lesson is readable by link; a group studies a series with a shared questions queue |

F and G are the v2 core and ship before the rest. H, I and J can be reordered; J is the only milestone that adds new server surface beyond sync.

The task breakdown for both phases is in [BACKLOG.md](BACKLOG.md).

## Beyond v2

v2 replaces the earlier phase 2 plan. Share links and groups are F34 and F35; import is from YouVersion only (F21); ESV and further translations, parallel translations, other importers and reading plans are non-goals. An admin web interface for deployments is the one item left for later.

## Open questions and risks

- [x] ~~Confirm the current ESV API terms on caching and non-commercial use before milestone C.~~ ESV moved to phase 2, then dropped in v1.7.
- [x] ~~Pick the front-end framework and the IndexedDB wrapper before milestone A.~~ React + Dexie (TECH-DESIGN §2).
- [x] ~~Decide whether verse chips re-render from the live translation or always show the snapshot.~~ Snapshot (F3). "View in …" another downloaded translation was dropped in v1.7.
- [x] ~~Settle the seeded tag list and whether tags are also applied at lesson level.~~ 24 themes; tags apply to lessons too (F4).
- [x] ~~Versification: phase 1 maps KJV numbers onto WEB's (TECH-DESIGN §9); revisit for other translations when a second one is added in phase 2.~~ The BSB and KJV both use KJV numbering, so nothing is remapped (TECH-DESIGN §9).
- [ ] Storage growth: the Bible text plus notes stays small; measure storage on a low-end phone before release.
- [x] ~~Licence for the project itself (MIT or Apache-2.0) and a contributor guide.~~ MIT; the contributor guide is a backlog task.
- [x] ~~Theme preset names and colours.~~ The reading-room set: Parchment, Vellum, Olive, Slate, Cedar, Midnight; colours tuned in the UX pass. (Superseded 2026-10-16: one theme.)
- [ ] Notes are personal: hosting them needs a privacy note for users (what is stored, who can see it, how to delete it) before a public deployment.

**v2**

- [ ] Share-target support differs between browsers and platforms (iOS in particular); confirm the fallback (paste, F19) is prominent where the share sheet is unavailable.
- [ ] The YouVersion export format is not documented publicly; build the importer against a real export and expect it to change.
- [ ] Deep-link URL formats for Blue Letter Bible, Bible Hub and Logos need verifying before F20; keep them in a config table so they can be updated without a release.
- [ ] Verse-text matching for paste (F19) against BSB and KJV only; text from other translations will not match and keeps its reference only when one is present.
- [ ] Compile view ordering when a section cites several passages: duplicated under each, as specified, or shown once with a pointer; decide after trying both with real notes.
- [ ] Groups bring moderation and data-deletion duties for the operator; the privacy note from v1 must cover public threads and comments before J ships.

## Change log

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-10-12 | First version. |
| 1.1 | 2026-10-12 | Technical design decisions: phase 1 gains a NestJS + PostgreSQL server, optional accounts (F14) and cross-device sync (F15), moved from phase 2. ESV (F13) moves to phase 2; phase 1 ships WEB only. Theme presets added (F16). Product decisions: guest use without an account, sign-out keeps notes on the device, chips show their snapshot, 24 seeded tags on sections and lessons, a 14-day review window, PDF through the print view, MIT licence, no admin UI. Verse references may cross chapters. Milestones become A–E, with accounts and sync as B. |
| 1.2 | 2026-10-12 | Named the app **Lamp**. Theme presets settled (F16). Hosting on the existing VPS provider, email through Resend, errors to Sentry, backups by provider snapshots; see TECH-DESIGN §15. |
| 1.3 | 2026-10-13 | Verse entry (F3) accepts KJV verse numbers that WEB places elsewhere and moves them onto WEB's; parser rules for ambiguous input settled (TECH-DESIGN §4.1, §15). |
| 1.4 | 2026-10-13 | Build order: milestone C (structure) before B (accounts and sync). Letters and features unchanged. |
| 1.5 | 2026-10-13 | Themes (F16) gain looks: Classic with the six presets, plus Folio, Soft and Lamplight, downloaded when chosen; a new device picks a look and mode first (TECH-DESIGN §8.5). |
| 1.6 | 2026-10-16 | One theme (F16): Lamplight in light and dark, with Auto following the device, and Inter Tight as the only font. The looks and presets are removed; a new device picks only the mode (TECH-DESIGN §8.5). |
| 1.7 | 2026-10-17 | v2 scope. Position: study alongside other Bible apps rather than repeat them; reader stays minimal. Added F17–F35: inbox, share target, paste intelligence, "Open in…", YouVersion import, compile view, backlinks, question lineage, study-method templates, capture mode, inbox triage, source attachment, prep card, resurfacing, theme map, quarterly digest, Notion Markdown and handout export, read-only share links, groups with a shared questions queue. Milestones F–J, with F and G as the core. Dropped from the roadmap: ESV and further translations (BSB bundled, KJV optional), reading plans, streaks, audio, commentaries, Strong's, interlinear, friend feeds, teaching tools, importers other than YouVersion. Also: the PRD now says BSB and KJV where it said WEB (replaced 2026-10-15, TECH-DESIGN §15 #53), and the KJV → WEB verse mapping is gone; F3 drops viewing a chip in another translation; F33's handout prints dark on white like the F11 print view, and F34's shared pages use Lamplight in the reader's light or dark mode, since looks were removed in 1.6. "Phase 2 and beyond" becomes "Beyond v2". |
| 1.8 | 2026-10-17 | The v2 data model follows TECH-DESIGN §17 (M8-02): links are derived from section bodies, question entries gain *parked*, built-in templates are part of the app and the default per lesson kind is a setting, the source is fields on the lesson, and visits and dismissals for resurfacing are added. The lesson's source (sermon / personal / group) becomes its kind. |
