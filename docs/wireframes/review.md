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

*As built in M6-03:* the memory block stays first, then `OPEN QUESTIONS · 6` with the first five
and `[ Show all 6 ]`, then the takeaways (`TAKEAWAYS · last 14 days`), each row opening its lesson
at the takeaway. A section with nothing in it isn't shown, and "All caught up." replaces the lot
when all three are empty, adding when the next verse is due ("Next verse due tomorrow."). Answer is
the filled button. The window is Settings → Review → "Takeaways from the last" `( 7 days | 14 days |
30 days | 90 days )`, synced. The tab's count is a small filled number on the Review icon (and at
the end of the sidebar's Review row), hidden at zero.

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

*As built in M6-02:* `/review/memory` runs through the verses due when it opens, soonest due first;
the Review tab's memory block (`MEMORY VERSES · 2 due [ Start › ]` and the references) came now,
before the rest of the queue. Again puts the verse at the end of the run, so it comes round again,
and the count grows ("3 of 3"). A verse index row opens the card for that one verse, due or not,
ending "Reviewed. John 10:27 comes back in 6 days." The keys 1–4 grade once the verse shows. The
progress line is "New · added Wed 14 Oct", "4 reviews · learning since Wed 3 Sep" or "12 reviews ·
known · added Wed 3 Sep"; known means it comes back after 21 days or more. The verse index row
shows the same stage: `MEMORY · due in 6 days · learning · 4 reviews`.

## Memorise (M6-01)

"Memorise" is in the chip sheet ([verses.md](verses.md#verse-chip-m2-10)) and the reader's
selection bar ([reader.md](reader.md#selected-verses-m5-02-m5-03-m6-01)). It adds the verse at once
with a toast: "John 10:27 added to memory verses. `[ Undo ]`". A verse already in the list shows
"In memory verses ✓" instead.

*As built in M6-01:* in the reader it's in the selection bar's `⋯`, with Verse index. "In memory
verses ✓" opens the passage's verse index on Memory, where × on the row removes it with Undo
("John 10:27 removed from memory verses."). A verse is the passage exactly as selected or cited:
John 10:27–28 is another memory verse than John 10:27.

## Weekly reminder (M6-04)

Settings → Review → Weekly reminder. Where the browser can't do it (anything but an installed
Chromium app), the switch is replaced by a line: "This browser can't send reminders. The Review tab
shows a count instead."

*As built in M6-04:* the switch reads "Weekly reminder", with "About once a week, when questions
or verses are waiting. On this device only." under it. Turning it on asks for notifications; if
they're blocked, it stays off and says "Notifications are blocked for Lamp. Allow them in the
browser's site settings." The notification is "Time to review" / "3 open questions and 2 verses
due." and opens Review; with nothing waiting there's none.
