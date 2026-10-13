# Wireframes — search

Low-fi layouts for M4-06. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

One box for three kinds of query. The app tells them apart: a parsed reference is a verse query, a
leading `#` is a tag, anything else is free text. Results update as the user types; there's no
search button.

## Before typing

```text
┌──────────────────────────────────────┐
│ [ ⌕ Notes, #tags or verses▏        ] │
├──────────────────────────────────────┤
│ Try  Romans 8  ·  #grace  ·  shepherd│  ← each one runs that search
│                                      │
│ RECENT                               │
│ John 10                            ↖ │
│ #hope                              ↖ │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

## Free text

```text
│ [ ⌕ shepherd                     ✕ ] │
│ 7 results in 3 lessons               │
│                                      │
│ THE GOOD SHEPHERD · Sun 12 Oct       │
│ …the same **shepherd** in Psalm 23…› │  ← the match in bold, with context
│ Takeaway: the **shepherd** knows   › │
│ his sheep by name.                   │
│ + 2 more in this lesson              │
│ ──────────────────────────────────── │
│ MORNING STUDY · Thu 2 Oct            │
│ Question: why a **shepherd**?      › │
```

Results are grouped by lesson, newest lesson first. A result opens the lesson at that section,
takeaway or question, scrolled to it and highlighted. A lesson whose title matches shows a
`Title: The Good **Shepherd**` row at the top of its group.

## Verse query

```text
│ [ ⌕ rom 8                        ✕ ] │
│ Romans 8 · 5 notes                   │
│ [ Verse index for Romans 8 › ]       │
│                                      │
│ THE GOOD SHEPHERD · Sun 12 Oct       │
│ ⟦Romans 8:28⟧ …all things work…    › │
│ ──────────────────────────────────── │
│ JUSTIFIED BY FAITH · Sun 7 Sep       │
│ ⟦Romans 7:24–8:2⟧ Who will deliver…› │
```

A verse query matches any chip that overlaps the passage, and a lesson whose main passage overlaps
it (`Main passage: John 10`). Words like "rom 8" are not also searched as text. "Verse index for
…" opens the verse index page (M4-07); it shows when something cites the passage.

## Tag query

```text
│ [ ⌕ #gr▏                         ✕ ] │
│ ┌──────────────────────────────────┐ │
│ │ #grace · 12                      │ │  ← tag suggestions with counts
│ │ #growth · 2                      │ │
│ └──────────────────────────────────┘ │
```

Choosing a tag shows the same list as the tag page, with `[ Open #grace › ]` at the top.

## No results and first open

```text
│ [ ⌕ melchizedek                  ✕ ] │
│                                      │
│ Nothing matches "melchizedek".       │
│ Search looks in sections, takeaways  │
│ and questions. Try a verse, like     │
│ Hebrews 7.                           │
```

The index is built in the background when the app starts. If search opens before it's ready:

```text
│ [ ⌕ shepherd                     ✕ ] │
│ Preparing search…                    │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒         │  ← skeleton rows, only after 300 ms
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                │
```

Verse and tag queries don't need the index, so they answer at once.
