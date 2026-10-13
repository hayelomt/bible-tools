# Lamp — UX patterns

**Date:** 2026-10-13 (M1-14) · **Applies to:** every UI task in M2–M6 ([BACKLOG](BACKLOG.md)).

Screens are designed in code: each UI task builds its screen from the shared components in
`packages/ui` and is reviewed in the browser at 360 px and 1280 px wide. This guide holds the rules
every screen follows. The [wireframes](#screens-and-wireframes) show what goes on each screen and
where. They are low-fi on purpose: layout, content and states, not colours or exact sizes. Where a
screen and its wireframe disagree with this guide, the guide wins. Change the guide first if a
screen needs something new.

## Screens and wireframes

| Screen | Wireframe | Tasks |
|---|---|---|
| App shell: bottom bar, sidebar | [shell.md](wireframes/shell.md#app-shell-m2-02) | M2-02 |
| Settings | [shell.md](wireframes/shell.md#settings-m2-02) | M2-02, M3-03 |
| Theme picker: looks, mode, presets | [shell.md](wireframes/shell.md#theme-picker-m2-03-m2-14) | M2-03, M2-14 |
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
| Empty, loading and error states | [states.md](wireframes/states.md) | all |

The theme demo at `/dev/themes` (M1-13) shows every component in every preset and mode. The
explorations behind the looks are at `/dev/looks` (M2-14).

## Layout

- **Two layouts.** Under 1024 px (Tailwind `lg`): one column with a header and a bottom bar.
  From 1024 px: a sidebar, and a side panel where a screen has one. Tablets get the phone layout
  with a wider column.
- **Four destinations:** Lessons, Read, Search, Review. Settings opens from the header (phone) or
  the sidebar (laptop). Nothing else goes in the bottom bar.
- **Width:** reading text (notes, scripture) is at most 42 rem wide, about 70 characters per line.
  Side margins are 16 px on a phone.
- **No sideways scroll** at 360 px on any screen. Long references and tag names wrap.
- **Safe areas:** the bottom bar and bottom sheets add `env(safe-area-inset-bottom)` for installed
  apps on phones with a home indicator.
- **Back:** every screen below a destination has `←` in the header, and the browser's back button
  does the same thing. Sheets and dialogs close with Esc, a tap outside, or back.

## Touch, keyboard and input

- **Touch targets are at least 44 × 44 px.** `globals.css` enforces this on touch screens
  (`pointer: coarse`) for buttons, inputs, select and tab triggers, menu items, and labels that
  hold a checkbox or switch; a mouse keeps the compact sizes. Custom controls must meet the same
  size, and adjacent targets keep 8 px apart. An E2E test measures the theme demo on a phone.
- **Inputs use 16 px text on phones** (the components' `text-base`), so iOS doesn't zoom on focus.
- **The keyboard reaches everything.** Every action has a keyboard path, including the ones done by
  drag (reorder has Move up and Move down in the section menu). Focus is always visible (the `ring`
  token, checked by the contrast test) and moves into a dialog when it opens and back when it
  closes.
- **Shortcuts (laptop):** `/` search, `n` new lesson, `←` `→` previous and next chapter in the
  reader, Esc closes the top layer. None of them fire while typing in a field.
- **Phone keyboard:** the editing toolbar sits on top of the on-screen keyboard
  (`visualViewport`), and the bottom bar hides while the keyboard is open. The field being typed in
  is never hidden behind the keyboard.

## Typography

- **Interface:** the system font (`font-sans`). **Scripture and note text:** Literata
  (`font-serif`), at least 17 px on a phone, line height 1.6.
- Verse numbers in the reader are small and muted, and are not read aloud as part of the verse
  text.
- Sentence case everywhere. Section labels in lists (RECENT, SERIES) are small capitals or a small
  muted heading, not shouting.

## Colour and themes

- **Semantic tokens only** (`bg-background`, `text-muted-foreground`, `bg-highlight-yellow`). No
  raw colours in components or screens. A new token, or a new pair of tokens used together, is added
  to the contrast test in `packages/ui/src/themes/themes.test.ts`.
- **The destructive colour** is for destructive actions and for errors the user must act on, never
  for decoration or for states that fix themselves (offline is not an error).
- **Colour is never the only signal.** Highlights have names ("Highlighted yellow"), question
  statuses have symbols and words, the sync status has text.
- **A look restyles, it doesn't rebuild.** Folio, Soft and Lamplight are stylesheets over the
  same screens (TECH-DESIGN §8.5): they hook onto `data-slot`, `data-variant` and `data-size`, never
  onto Tailwind classes. A screen that wants a look to reach a new element gives it a `data-slot`.
  Screens and their wireframes stay the same in every look.
- **Each look has its own colours** in light and dark, checked by the same contrast test as the
  presets. The presets apply to Classic only.
- The theme applies before the first paint, from `localStorage` (§8.5), including a downloaded
  look. The picker shows each preset in its own colours and each look by a picture of it.

## Saving and feedback

- **Everything saves as it's typed.** Notes, lesson details, takeaways and settings have no Save
  button. The lesson header says "Saved" (muted) once the last change is stored, which is within a
  second. Forms that talk to the server (sign-in, password) are the only forms with a submit button.
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
- **Server-only actions** (sign-in, sign-up, password, devices, delete account) keep what was typed
  when offline, disable the submit button, and say "Needs a connection" above it.
- **A guest is never nagged.** Settings invites sign-up once, in the account section. The sync
  status says "On this device" without a call to action.
- **Nothing typed is ever lost**, and the UI says so where people worry: on sign-out, on errors
  ("Your notes are safe on this device"), and on conflicted copies.
- **Conflicted copies** are labelled with the other device and time, and offer "Keep this instead"
  and "Delete". The lesson shows a count until they're resolved.

## Verse references and translation labels

- **Display format:** full book names and an en dash for ranges: "Romans 8:28–30", "1 John 3",
  "Romans 7:24–8:2". Abbreviations are for typing, not for display.
- **Scripture text always carries its translation**: the chip (`John 10:9 · WEB`), the expanded
  chip ("World English Bible"), the reader header, the autocomplete preview, the verse index and
  the export. Phase 2 adds more translations, so this must hold from the start.
- **A chip shows its snapshot**, the text captured when it was inserted. It never changes, even if
  the source text is corrected later.
- **KJV numbering** moved onto WEB's is always explained ("Typed as Romans 16:25–27 (KJV
  numbering)"), never silent.
- A chip is one unit for the cursor and for Backspace, and screen readers hear it as a button:
  "John 10:9, World English Bible, verse. Show text."

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

- WCAG 2.2 AA: contrast is tested for every preset; landmarks (`header`, `nav`, `main`); one `h1`
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
  relative for sync ("2 min ago") and absolute elsewhere.
- Counts are exact and singular when one: "1 change waiting", "3 changes waiting".
