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
