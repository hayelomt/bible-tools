# Wireframes — review queue and memory verses

Low-fi layouts for M6-01 to M6-04. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

## Review queue (M6-03)

Open questions, takeaways from the last 14 days (set in settings), and memory verses due today. The
Review tab shows the number of open questions plus verses due.

```text
┌──────────────────────────────────────┐
│ Review                   ◌ Synced  ≡ │
├──────────────────────────────────────┤
│ MEMORY VERSES · 2 due     [ Start › ]│
│ John 10:27 · Romans 8:28             │
│                                      │
│ OPEN QUESTIONS · 3                   │
│ Who are the "other sheep"?           │
│ The Good Shepherd · Sun 12 Oct       │
│ [ Answer ] [ Park ] [ Open lesson › ]│
│ ──────────────────────────────────── │
│ Thief vs hired hand?                 │
│ The Good Shepherd · Sun 12 Oct       │
│ [ Answer ] [ Park ] [ Open lesson › ]│
│ ──────────────────────────────────── │
│ …                                    │
│                                      │
│ TAKEAWAYS · last 14 days             │
│ • He knows his sheep by name.        │
│   The Good Shepherd · Sun 12 Oct   › │
│ • Abide, don't strive.               │
│   Abiding in the vine · Sun 5 Oct  › │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

- **Answer** opens the lesson with a new section headed with the question (as in
  [lessons.md](lessons.md#takeaways-and-questions-m4-03-m4-04)).
- **Park** takes the question out of the queue at once, with an undo toast. Parked questions stay
  on their lesson.

All done:

```text
│                                      │
│              All caught up.          │
│                                      │
│   No open questions and no verses    │
│   due. Takeaways from the last 14    │
│   days show here too.                │
│                                      │
```

## Memory card (M6-02)

```text
┌──────────────────────────────────────┐
│ ← Memory verses             1 of 2   │
├──────────────────────────────────────┤
│                                      │
│ John 10:27 · WEB                     │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │  Say it from memory, then show   │ │
│ │  the verse.                      │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [         Show the verse           ] │
└──────────────────────────────────────┘
```

After "Show the verse":

```text
│ John 10:27 · WEB                     │
│ ┌──────────────────────────────────┐ │
│ │ My sheep hear my voice, and I    │ │  ← font-serif
│ │ know them, and they follow me.   │ │
│ └──────────────────────────────────┘ │
│                                      │
│ How well did you know it?            │
│ [ Again ] [ Hard ] [ Good ] [ Easy ] │
│  today     2 days   6 days   12 days │  ← when it comes back, per grade
│                                      │
│ 4 reviews · learning since 3 Sep     │
```

The last card ends with "Done for today. Next verse due tomorrow." and a link back to Review.

## Memorise (M6-01)

"Memorise" is in the chip sheet ([verses.md](verses.md#verse-chip-m2-10)) and the reader's
selection bar ([reader.md](reader.md#selected-verses-m5-02-m5-03-m6-01)). It adds the verse at once
with a toast: "John 10:27 added to memory verses. `[ Undo ]`". A verse already in the list shows
"In memory verses ✓" instead.

## Weekly reminder (M6-04)

Settings → Review → Weekly reminder. Where the browser can't do it (anything but an installed
Chromium app), the switch is replaced by a line: "This browser can't send reminders. The Review tab
shows a count instead."
