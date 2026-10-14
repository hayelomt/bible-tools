# Wireframes — export and print

Low-fi layouts for M6-05 and M6-06. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

## Export menu (M6-05, M6-06)

From a lesson's `⋯` or a series' `⋯`:

```text
┌──────────────────────────────────────┐
│ Export "The Good Shepherd"           │
│                                      │
│ [ Markdown file (.md) ]              │  ← downloads at once, offline
│ [ Copy as Markdown ]                 │
│ [ Print or save as PDF ]             │  ← opens the print view
└──────────────────────────────────────┘
```

"Copy as Markdown" confirms with a toast: "Copied." Phase 2 adds share links here.

*As built in M6-05:* the lesson's `⋯` has "Export…" and the series' "Export series…", opening a
dialog titled `Export "The Good Shepherd"` with "Markdown keeps the notes, verses, tags and
questions." and the two Markdown buttons; Print joined them in M6-06, and the line became
"Markdown and print keep the notes, verses, tags and questions." The file is named
`2026-10-12-the-good-shepherd.md` for a lesson and `john.md` for a series. The Markdown is in
TECH-DESIGN §8.7, and `apps/web/src/export/golden/` holds an example of each.

## Print view (M6-06)

The lesson as a document: no navigation, no menus, the reading face throughout, and verse text
quoted in full with its translation, as in the Markdown export (decision 19). The browser's print
dialog opens on top; "Save as PDF" there makes the file.

```text
┌──────────────────────────────────────┐
│ ← Back                     [ Print ] │  ← screen only; hidden when printed
├──────────────────────────────────────┤
│ The Good Shepherd                    │
│ Sunday 12 October 2026 · Sermon      │
│ Pastor Ann, Grace Chapel             │
│ John 10:1–18 · #grace                │
│                                      │
│ Jesus is the door (John 10:9, WEB):  │
│ salvation and pasture.               │
│   > John 10:9 (WEB) I am the door.   │
│   > If anyone enters in by me…       │
│                                      │
│     Compare Psalm 23:1 (WEB): the    │
│     same shepherd.                   │
│                                      │
│ Takeaways                            │
│ • He knows his sheep by name.        │
│                                      │
│ Questions                            │
│ ○ Who are the "other sheep"?         │
│                                      │
│ ──────────────────────────────────── │
│ Scripture: World English Bible       │
│ (public domain).                     │
└──────────────────────────────────────┘
```

A series prints each lesson on a new page, in date order, after a title page listing them.

*As built in M6-06:* the view is `/lessons/$id/print` (or `/series/$id/print`), a white page with
dark text whatever the theme, so it looks the same on screen and on paper; the bar holds `← Back`
and `[ Print ]` and is left out of the print. Answered questions print as ☑, open ones as ☐, and a
parked one ends in *(parked)*. The title page lists each lesson's date ("Sun 12 Oct 2026") and
title. The print dialog opens once, from Export; reloading the view doesn't open it again.
