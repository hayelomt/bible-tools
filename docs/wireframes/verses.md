# Wireframes — verse chips, autocomplete and the verse index

Low-fi layouts for M2-09, M2-10 and M4-07. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md#verse-references-and-translation-labels).

## Verse chip (M2-10)

In the text, a chip shows the display reference and the translation label. It is one unit: the
cursor moves over it, and Backspace deletes it whole.

```text
│ ┃ Jesus is the door ⟦John 10:9 · BSB⟧│
│ ┃ salvation and pasture.             │
```

Tapping it opens its text: a bottom sheet on a phone, a popover on a laptop. The text is read from
the translation picked in Settings, so picking the other changes it, and the label with it. On a
laptop, resting the mouse on
the chip opens the popover too, leaving the cursor in the note; it closes when the mouse leaves the
chip and the popover, unless the chip was clicked. Each verse starts with its number (²⁸ … ²⁹ …, and
"9:1" where a new chapter starts), once the book is on the device.

```text
┌──────────────────────────────────────┐
│ John 10:9                            │
│ Berean Standard Bible                │
│                                      │
│ I am the gate. If anyone enters      │  ← font-serif
│ through Me, he will be saved. He     │
│ will come in and go out and find     │
│ pasture.                             │
│                                      │
│ [ Every note on John 10:9 › ]        │  ← the verse index (M4-07)
│ [ Read in context › ] [ Memorise ]   │  ← reader (M5-04) · memory item (M6-01)
└──────────────────────────────────────┘
```

Phase 2 adds "View in …" here for other downloaded translations, without changing the note.

Screen readers hear the chip as a button: "John 10:9, Berean Standard Bible, verse. Show text."
From the keyboard, ← or → selects the chip (a ring shows it), and Enter or Space opens it. Esc, a
tap outside or × closes it, and the cursor is back where it was.

A chip inserted offline before its book was downloaded shows, instead of the text: "Text not
downloaded yet. It's added when the Bible is downloaded."

### Verse text in notes

With Settings → Bible → "Show verse text in notes" on (on by default, synced), each paragraph's
chips show their text under it, numbered, as a quote that isn't part of the note: it can't be
edited, and isn't saved, copied or exported with it. It's set apart from what was typed: a tinted
card with an accent edge, the reference in small capitals, the text smaller and in italics.

```text
│ ┃ Paul says in ⟦Romans 8:38–39 · BSB⟧│
│ ┃ and ⟦Psalm 23:1 · BSB⟧.            │
│ ┃ ▏ROMANS 8:38–39 · BSB              │  ← small caps, accent colour
│ ┃ ▏³⁸ For I am persuaded that neither│  ← font-serif italic, on bg-muted
│ ┃ ▏death… ³⁹ nor height, nor depth…  │
│ ┃ ▏PSALM 23:1 · BSB                  │
│ ┃ ▏¹ Yahweh is my shepherd…          │
```

## Verse autocomplete (M2-09)

The list opens when the text just before the cursor parses as a reference with a number ("rom 8",
"Jude 3"; a book name alone doesn't open it), and closes as soon as it doesn't, or a space follows.
The selected suggestion shows its text in the translation picked in Settings (the BSB unless
changed), so the user never leaves the note.

```text
│ ┃ Paul says in rom 8:28▏             │
│ ┌──────────────────────────────────┐ │
│ │ Romans 8:28                  BSB │ │  ← selected
│ │ And we know that God works all   │ │
│ │ things together for the good of  │ │
│ │ those who love Him…              │ │
│ ├──────────────────────────────────┤ │
│ └──────────────────────────────────┘ │
│ ↑↓ choose · Enter insert · Esc keep  │  ← hint, laptop only
```

- **Enter** or a tap replaces the typed reference with the chip. **Esc** closes the list and keeps
  the text as typed.
- On a phone the list sits above the keyboard toolbar; on a laptop it's anchored under the cursor.
- The list never takes focus, so typing goes on as normal.

A name that matches several books lists them all (decision 15):

```text
│ ┃ see jo 3▏                          │
│ ┌──────────────────────────────────┐ │
│ │ Joshua 3                     BSB │ │  ← shortest name first (M1-09)
│ │ …                                │ │
│ │ Job 3                            │ │
│ │ Joel 3                           │ │
│ │ Jonah 3                          │ │
│ │ John 3                           │ │
│ └──────────────────────────────────┘ │
```

A reference that can't exist explains why, with nothing to insert:

```text
│ ┌──────────────────────────────────┐ │
│ │ Romans has 16 chapters.          │ │  ← muted
│ └──────────────────────────────────┘ │
```

Both translations number verses the KJV's way. A verse the BSB leaves out (Acts 8:37) shows its
note: "[Not in BSB: Some later manuscripts include this verse.]".

If the book isn't downloaded yet (first minutes after install), suggestions still appear and
insert a chip; the preview reads "Text not downloaded yet", and the chip shows its text when the
book arrives (M2-11).

## Verse index (M4-07)

Everything that cites a passage, newest first: sections, highlights and memory items. It opens from
a chip, the reader and search. `Rom 8` includes every citation that overlaps the chapter, including
ranges that start in chapter 7 or run into chapter 9.

```text
┌──────────────────────────────────────┐
│ ← Romans 8                           │
├──────────────────────────────────────┤
│ Romans 8 · BSB          [ Read › ]   │
│ 5 notes · 2 highlights · 1 memory    │
│ ( All | Notes | Highlights | Memory )│
│                                      │
│ NOTE · Sun 12 Oct                    │
│ The Good Shepherd                    │
│ Romans 8:28 — "…all things work      │  ← the cited reference, then the section text
│ together. That's the shepherd's      │
│ promise."                          › │
│ ──────────────────────────────────── │
│ HIGHLIGHT · Fri 3 Oct · yellow       │
│ Romans 8:38–39 — "neither death nor  │
│ life…" + note: memorise this       › │
│ ──────────────────────────────────── │
│ MEMORY · due in 3 days · 4 reviews   │
│ Romans 8:1                         › │
│ ──────────────────────────────────── │
│ NOTE · Sun 7 Sep                     │
│ Justified by faith                   │
│ Romans 7:24–8:2 — "Who will deliver  │  ← a range across chapters still counts
│ me…"                               › │
└──────────────────────────────────────┘
```

Empty: "Nothing cites Romans 8 yet. Notes, highlights and memory verses on it will show here."
`[ Read Romans 8 › ]`.

*As built in M5-02:* notes, lessons and highlights. The summary reads "2 notes · main passage of 1
lesson · 1 highlight", and the filter is All / Notes / Highlights (Memory waits for M6-01). A
highlight row is `HIGHLIGHT · Fri 3 Oct · yellow`, then its reference, verse text and note, and
opens the reader at its first verse. A lesson whose main passage overlaps shows as a row:
`LESSON · Sun 12 Oct`, its title, `Main passage: Romans 8`. In a note the cited chips are in bold,
in the text around them. `[ Read › ]` (M5-04) sits beside the summary and opens the reader at the
passage's first verse. The empty state reads "Nothing cites Romans 8 yet. Notes and highlights on
it will show here." with `[ Read Romans 8 › ]` under it. The address is `/verses/ROM.8`;
one that isn't a passage shows "Passage not found".

*As built in M6-01:* memory verses join, with the Memory filter and "1 memory verse" in the
summary. A row is `MEMORY · due in 3 days · 4 reviews` ("due today", "due tomorrow"; "new" before
the first review), then the reference and its text; it opens the reader at its first verse until
the review card (M6-02), and × removes it with Undo. The chip sheet's buttons are
`[ Read in context › ] [ Memorise ]` under "Every note on …".

*As built in M6-02:* a memory row opens that verse's memory card, and shows its stage: `MEMORY ·
due in 6 days · learning · 4 reviews` (new, learning, or known once it comes back after 21 days
or more).
