# Lamp — UX patterns

**Date:** 2026-10-17 (M1-14; v2 screens from M8-04) · **Applies to:** every UI task in M2–M6 and
M9–M13 ([BACKLOG](BACKLOG.md)).

Screens are designed in code: each UI task builds its screen from the shared components in
`packages/ui` and is reviewed in the browser at 360 px and 1280 px wide. This guide holds the rules
every screen follows. The [wireframes](#screens-and-wireframes) show what goes on each screen and
where. They are low-fi on purpose: layout, content and states, not colours or exact sizes. Where a
screen and its wireframe disagree with this guide, the guide wins. Change the guide first if a
screen needs something new.

## Screens and wireframes

| Screen | Wireframe | Tasks |
|---|---|---|
| App shell: bottom bar, sidebar, Inbox tab and badge | [shell.md](wireframes/shell.md#app-shell-m2-02-m9-02) | M2-02, M9-02 |
| Settings | [shell.md](wireframes/shell.md#settings-m2-02) | M2-02, M3-03 |
| Settings: v2 sections | [shell.md](wireframes/shell.md#settings-in-v2-m9m13) | M9-09, M9-10, M10-13, M12-01, M13-04, M13-12 |
| Appearance: light, dark, auto | [shell.md](wireframes/shell.md#appearance-m2-03-m2-15) | M2-03, M2-15 |
| Bible download, update prompt | [shell.md](wireframes/shell.md#bible-download-m2-11) | M2-11 |
| Lessons home, welcome and first run | [lessons.md](wireframes/lessons.md#lessons-home-m2-06) | M2-06, M2-14 |
| Lesson: capture and edit (phone, laptop) | [lessons.md](wireframes/lessons.md#lesson-capture-and-edit-m2-04-m2-07) | M2-04, M2-07 |
| Section menu, reorder, delete | [lessons.md](wireframes/lessons.md#section-menu-reorder-and-delete-m2-08) | M2-08 |
| Series | [lessons.md](wireframes/lessons.md#series-m2-05) | M2-05 |
| Takeaways and questions | [lessons.md](wireframes/lessons.md#takeaways-and-questions-m4-03-m4-04) | M4-03, M4-04 |
| Tag input, tag page | [lessons.md](wireframes/lessons.md#tag-input-m4-01) | M4-01, M4-02 |
| Verse chip | [verses.md](wireframes/verses.md#verse-chip-m2-10) | M2-10 |
| Verse autocomplete | [verses.md](wireframes/verses.md#verse-autocomplete-m2-09) | M2-09 |
| Verse index | [verses.md](wireframes/verses.md#verse-index-m4-07) | M4-07 |
| Search | [search.md](wireframes/search.md) | M4-06 |
| Reader, book picker | [reader.md](wireframes/reader.md#chapter-view-m5-01-m5-04) | M5-01, M5-04 |
| Highlights, notes, add to lesson | [reader.md](wireframes/reader.md#selected-verses-m5-02-m5-03-m6-01) | M5-02, M5-03 |
| Sign up, sign in, verify, reset | [account.md](wireframes/account.md) | M3-05 |
| Change password, delete account | [account.md](wireframes/account.md#change-password-m3-03) | M3-03 |
| Notes from another account, remove notes | [account.md](wireframes/account.md#notes-from-another-account-m3-10) | M3-10 |
| Devices | [account.md](wireframes/account.md#devices-m3-12) | M3-12 |
| Sync status and panel | [sync.md](wireframes/sync.md) | M3-09, M3-11 |
| Conflicted copy | [sync.md](wireframes/sync.md#conflicted-copy-m3-11-64) | M3-11 |
| Review queue | [review.md](wireframes/review.md#review-queue-m6-03) | M6-03, M6-04 |
| Memory card, memorise | [review.md](wireframes/review.md#memory-card-m6-02) | M6-01, M6-02 |
| Export menu, print view | [export.md](wireframes/export.md) | M6-05, M6-06 |
| Inbox | [interop.md](wireframes/interop.md#inbox-m9-02-m9-07) | M9-02, M9-07 |
| Share landing (`/share`) | [interop.md](wireframes/interop.md#share-landing-m9-06) | M9-06 |
| Paste prompt (section, inbox) | [interop.md](wireframes/interop.md#paste-prompt-m9-08-m9-09) | M9-08, M9-09 |
| "Open in…" and its settings | [interop.md](wireframes/interop.md#open-in-m9-10) | M9-10 |
| YouVersion import, dismiss an import | [interop.md](wireframes/interop.md#youversion-import-m9-11-m9-12) | M9-11, M9-12 |
| Commentary (compile view) | [thinking.md](wireframes/thinking.md#commentary-m10-01-to-m10-04) | M10-01 to M10-04 |
| `[[` link picker | [thinking.md](wireframes/thinking.md#link-picker-m10-06) | M10-06 |
| Link chip, broken link | [thinking.md](wireframes/thinking.md#link-chip-m10-06) | M10-05, M10-06 |
| Linked from | [thinking.md](wireframes/thinking.md#linked-from-m10-07) | M10-07 |
| Question thread, revisit, split, merge | [thinking.md](wireframes/thinking.md#question-thread-m10-08-to-m10-11) | M10-08 to M10-11 |
| Template picker, templates settings | [thinking.md](wireframes/thinking.md#template-picker-m10-12-to-m10-14) | M10-12 to M10-14 |
| Capture mode | [sermon.md](wireframes/sermon.md#capture-mode-m11-01) | M11-01 |
| Inbox triage, keys | [sermon.md](wireframes/sermon.md#inbox-triage-m11-02-to-m11-05) | M11-02 to M11-05 |
| Lesson source, kind | [sermon.md](wireframes/sermon.md#lesson-source-m11-06) | M11-06 |
| Section timestamps and pages | [sermon.md](wireframes/sermon.md#section-timestamps-and-pages-m11-07) | M11-07, M11-08 |
| Prep card | [sermon.md](wireframes/sermon.md#prep-card-m11-09) | M11-09 |
| Resurfaced in Review | [reflection.md](wireframes/reflection.md#resurfaced-in-review-m12-01-m12-02) | M12-01, M12-02 |
| Theme map | [reflection.md](wireframes/reflection.md#theme-map-m12-03-m12-04-m12-10) | M12-03, M12-04, M12-10 |
| Quarterly digest draft | [reflection.md](wireframes/reflection.md#quarterly-digest-m12-07-m12-08) | M12-07, M12-08 |
| Export: Notion, handout | [reflection.md](wireframes/reflection.md#export-notion-and-handout-m12-05-m12-06) | M12-05, M12-06 |
| Handout | [reflection.md](wireframes/reflection.md#handout-m12-05) | M12-05 |
| Share link, shared links in Settings | [sharing.md](wireframes/sharing.md#share-link-m13-04) | M13-01, M13-04 |
| Shared page | [sharing.md](wireframes/sharing.md#shared-page-m13-02-m13-03) | M13-02, M13-03 |
| Groups: create, invite, join, members | [sharing.md](wireframes/sharing.md#groups-m13-07) | M13-07 |
| Group and private threads, comments | [sharing.md](wireframes/sharing.md#lesson-in-a-group-public-and-private-threads-m13-08) | M13-08, M13-09 |
| Group questions | [sharing.md](wireframes/sharing.md#group-questions-m13-10) | M13-10 |
| Notifications, email digest | [sharing.md](wireframes/sharing.md#notifications-m13-11-m13-12) | M13-11, M13-12 |
| Empty, loading and error states | [states.md](wireframes/states.md) | all |

The theme demo (`/dev/themes`, M1-13) and the looks explorations (`/dev/looks`, M2-14) were removed
with the single theme (M2-15).

## Layout

- **Two layouts.** Under 1024 px (Tailwind `lg`): one column with a header and a bottom bar.
  From 1024 px: a sidebar, and a side panel where a screen has one. Tablets get the phone layout
  with a wider column.
- **Five destinations:** Lessons, Inbox, Read, Search, Review (Inbox joined in v2). Under
  1024 px each tab is 72 px wide at 360 px, with its icon above its label. Settings opens from the
  header (phone) or the sidebar (laptop). Nothing else goes in the bottom bar: groups live on the
  Lessons home and in the sidebar, the theme map in Review.
- **Badges:** Inbox counts items waiting, Review counts open questions and verses due. A small
  filled number, hidden at zero, "99+" above 99, and part of the tab's name for screen readers.
  Nothing else gets a badge; resurfaced items and group activity are quiet.
- **Width:** reading text (notes, scripture) is at most 42 rem wide, about 70 characters per line.
  Side margins are 16 px on a phone.
- **No sideways scroll** at 360 px on any screen. Long references and tag names wrap. A grid too
  wide for a phone (the theme map) changes shape instead: its rows become the touch targets, and
  each opens a list.
- **Safe areas:** the bottom bar and bottom sheets add `env(safe-area-inset-bottom)` for installed
  apps on phones with a home indicator.
- **Back:** every screen below a destination has `←` in the header, and the browser's back button
  does the same thing. Sheets and dialogs close with Esc, a tap outside, or back.

## Touch, keyboard and input

- **Touch targets are at least 44 × 44 px.** `globals.css` enforces this on touch screens
  (`pointer: coarse`) for buttons, inputs, select and tab triggers, menu items, and labels that
  hold a checkbox or switch; a mouse keeps the compact sizes. Custom controls must meet the same
  size, and adjacent targets keep 8 px apart. An E2E test measures Settings on a phone.
- **Inputs use 16 px text on phones** (the components' `text-base`), so iOS doesn't zoom on focus.
- **The keyboard reaches everything.** Every action has a keyboard path, including the ones done by
  drag (reorder has Move up and Move down in the section menu). Focus is always visible (the `ring`
  token, checked by the contrast test) and moves into a dialog when it opens and back when it
  closes.
- **Shortcuts (laptop):** `/` search, `n` new lesson, `←` `→` previous and next chapter in the
  reader, Esc closes the top layer. None of them fire while typing in a field. A screen with its own
  keys (inbox triage) lists them with `?`, and shows each action's key beside its button.
- **Multi-select:** "Select" in the header, or holding an item, shows checkboxes (44 px targets).
  A bar with the count and the actions replaces the bottom bar, as the reader's selection bar
  does; ✕ or Esc ends it. Bulk actions are one action with one Undo.
- **Read-only views** (the commentary, shared pages, other members' sections): no cursor, no `⠿`,
  no editing toolbar. Text can be selected and copied, chips open as anywhere, and each section
  has a byline that opens it where it can be edited, if the reader may.
- **Phone keyboard:** the editing toolbar sits on top of the on-screen keyboard
  (`visualViewport`), and the bottom bar hides while the keyboard is open. The field being typed in
  is never hidden behind the keyboard.

## Typography

- **One font, Inter Tight,** for the interface, scripture and notes (`font-sans`, `font-serif` and
  `font-mono` all resolve to it). Scripture and note text are at least 17 px on a phone, line
  height 1.6.
- Verse numbers in the reader are small and muted, and are not read aloud as part of the verse
  text.
- Sentence case everywhere. Section labels in lists (RECENT, SERIES) are small capitals or a small
  muted heading, not shouting.

## Colour and theme

- **Semantic tokens only** (`bg-background`, `text-muted-foreground`, `bg-highlight-yellow`). No
  raw colours in components or screens. A new token, or a new pair of tokens used together, is added
  to the contrast test in `packages/ui/src/themes/theme.test.ts`.
- **The destructive colour** is for destructive actions and for errors the user must act on, never
  for decoration or for states that fix themselves (offline is not an error).
- **Colour is never the only signal.** Highlights have names ("Highlighted yellow"), question
  statuses have symbols and words, the sync status has text.
- **Heat grids** (the theme map) use a stepped scale of theme tokens, shown with its numbers
  ("· none ░ 1–2 ▒ 3–5 ▓ 6–9 █ 10+"); zero is a plain dot, not the lightest colour. Each cell or row
  has its count in its name, and the grid is a table to screen readers. The scale is in the
  contrast test.
- **Paper and shared pages:** the print view and the handout are dark on white whatever the mode.
  Shared pages are in Lamplight, light or dark following the reader's device.
- **One theme, Lamplight** (glass panels with lit edges, amber accents), in light and dark. Auto
  follows the device. There are no looks or presets to choose.
- **Lamplight's surfaces are plain CSS** (`lamplight.css`, TECH-DESIGN §8.5): they hook onto
  `data-slot` and `data-variant`, never onto Tailwind classes. A screen that wants the theme to
  reach a new element gives it a `data-slot`.
- **Keep it cheap to paint.** Only the top bar and the bottom bar blur what's behind them; repeated
  panels (rows, cards) use an opaque fill instead of a blur each.
- The mode applies before the first paint, from `localStorage` (§8.5), so there's no flash.

## Saving and feedback

- **Everything saves as it's typed.** Notes, lesson details, takeaways and settings have no Save
  button. Drafts that aren't lessons yet (the quarterly digest) save as they're typed too, and have
  one button that makes them a lesson ("Keep as a lesson"). The lesson header shows a tick (muted), named "Saved" for screen readers, once the last
  change is stored, which is within a second. Forms that talk to the server (sign-in, password) are
  the only forms with a submit button.
- **Local actions are instant** and never show a spinner. Only server actions and long background
  work show progress (see [loading](#empty-loading-and-error-states)).
- **Toasts:** one at a time, at the bottom above the bar (phone) or bottom-right (laptop). They
  confirm an action and offer at most one follow-up: Undo, Open, Reload. They're announced
  politely to screen readers. An undo toast lasts 10 s; a toast that needs a decision (a new
  version) stays until it's used.

## Confirmations

**Undo for one, ask for many.** An action that removes one thing happens at once, with an Undo
toast. An action that removes more than one thing, or can't be undone, asks first.

| Action | Pattern |
|---|---|
| Delete a section without replies, a takeaway, a question, a highlight, a tag from an item | At once, Undo toast |
| Park a question, remove a memory verse | At once, Undo toast |
| Dismiss or place an inbox item; snooze one | At once, Undo toast |
| Bulk send, tag or dismiss of selected inbox items | At once, one Undo toast for all (the selection is the confirmation) |
| Dismiss all items from an import | Ask, giving the count and the import's date |
| Dismiss a resurfaced item for a year | At once, Undo toast |
| Delete a template, a comment of one's own; discard the digest draft | At once, Undo toast |
| Split or merge questions | A dialog that says where each entry goes |
| Revoke a share link, make a new invite link | Ask: the old address stops working |
| Remove a member, make someone owner, leave a group | Ask, naming the person and the group |
| Delete a section with replies | Ask: "Delete this section and its 2 replies?" |
| Delete a lesson | Ask, giving the number of sections |
| Delete a series | Ask: its lessons stay, without a series |
| Delete a tag everywhere | Ask, giving how many items use it |
| Sign out, sign out another device | Ask, saying the notes stay on the device |
| Remove notes from this device | Ask, with a warning if changes never synced |
| Notes from another account | Choose: remove (default) or add to this account |
| Delete account | Ask, with the password and the word DELETE typed in |

In a confirmation dialog the title is a question that names the thing ("Delete the series John?"),
the body says what happens to anything attached, and the confirm button repeats the verb with a
count ("Delete all 3"). Focus starts on Cancel.

## Offline and sync

- **Offline is normal, not an error.** Nothing blocks local work. The sync status says "Offline · 3
  waiting" in muted text; no banners, no red.
- **The sync status lives in one place** (the header on a phone, the sidebar foot on a laptop) and
  opens the sync panel. States, wording and the panel: [sync.md](wireframes/sync.md).
- **Server-only actions** (sign-in, sign-up, password, devices, delete account, share links,
  joining and managing groups) keep what was typed when offline, disable the submit button, and say
  "Needs a connection" above it. A guest sees "Sign in to…" in their place, once, with Sign in.
- **A guest is never nagged.** Settings invites sign-up once, in the account section. The sync
  status says "On this device" without a call to action.
- **Nothing typed is ever lost**, and the UI says so where people worry: on sign-out, on errors
  ("Your notes are safe on this device"), and on conflicted copies.
- **Conflicted copies** are labelled with the other device and time, and offer "Keep this instead"
  and "Delete". The lesson shows a count until they're resolved.

## Verse references and translation labels

- **Display format:** full book names and an en dash for ranges: "Romans 8:28–30", "1 John 3",
  "Romans 7:24–8:2". Abbreviations are for typing, not for display.
- **Scripture text always carries its translation**: the chip (`John 10:9 · BSB`), the expanded
  chip ("Berean Standard Bible"), the reader header, the autocomplete preview, the verse index and
  the export. The app has two translations (BSB and KJV), and a chip reads in the one picked in
  Settings.
- **A chip shows its text as the Bible has it now**, in the translation picked in Settings: picking
  the other changes every chip, its label and the text under its paragraph. Only text from outside
  (`shared`, `pasted`) stays as it came.
- A chip is one unit for the cursor and for Backspace, and screen readers hear it as a button:
  "John 10:9, Berean Standard Bible, verse. Show text."
- **Labels for text from outside:** a shared chip whose translation can't be identified is labelled
  "shared" (`⟦Psalm 23:1 · shared⟧`), a pasted one "pasted". They are never guessed as BSB or KJV.
- **Link chips are not verse chips.** A link chip (`⟨→ The Good Shepherd⟩`) has an arrow, the
  target's current title and no translation, and a tap opens the target itself rather than a sheet.
  A broken one (the target was deleted) keeps its last title, struck through, with ⊘ and the word
  "deleted", so colour isn't the only signal. Screen readers hear "Link to lesson The Good
  Shepherd" or "Broken link, The Good Shepherd, deleted".
- **Inbox items aren't notes yet:** they don't show in the verse index, search or a commentary
  until they're placed in a lesson.

## Empty, loading and error states

The shared layouts are in [states.md](wireframes/states.md).

- **Empty:** one sentence on what will appear here, one on how it gets there, at most one action. A
  first run is welcoming and leads to the first lesson; it never asks for an account.
- **Loading:** reads from the device are instant and show nothing. Background work shows a skeleton
  after 300 ms, or a progress bar with numbers when the total is known (first sync, Bible download).
  A button waiting on the server shows its own progress ("Signing in…").
- **Errors:** a field error goes under the field and never clears what was typed. A failed server
  action shows an alert saying what to do and that nothing changed. A crash shows the error boundary
  with Reload and Copy error details; the navigation stays.

## Accessibility

- WCAG 2.2 AA: contrast is tested for Lamplight in both modes; landmarks (`header`, `nav`, `main`); one `h1`
  per screen; every control has a name.
- Motion respects `prefers-reduced-motion`: no slide or bounce, only fades.
- The sync status and toasts are live regions (`role="status"`); errors that block an action use
  `role="alert"`.
- Each screen is checked with the keyboard alone and with a screen reader (VoiceOver on iOS or
  TalkBack) before its task is done.

## Words

- Plain words, sentence case, no jargon: "sync", not "replicate"; "lesson", not "document".
- Buttons are verbs: "Add", "Delete all 3", "Sign in". Links say where they go.
- Dates: "Sun 12 Oct" in lists, "Sunday 12 October 2026" on the lesson and in exports. Times are
  relative for sync and for a share link's "opened 2 h ago", and absolute elsewhere. Today's inbox
  items show the time ("10:42").
- **Names for v2 things:** the compile view is "Commentary" ("Read as commentary"); the lesson's
  Sermon / Personal / Group is its "Kind", and "Source" is what it came from (a sermon recording, a
  book, a podcast); an inbox item is "sent to" a lesson or "dismissed"; a group's own part of a
  lesson is the "group thread", the rest "my notes".
- Counts are exact and singular when one: "1 change waiting", "3 changes waiting".
