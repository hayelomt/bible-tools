# Wireframes — verse chips, autocomplete and the verse index

Low-fi layouts for M2-09, M2-10 and M4-07. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md#verse-references-and-translation-labels).

## Verse chip (M2-10)

In the text, a chip shows the display reference and the translation label. It is one unit: the
cursor moves over it, and Backspace deletes it whole.

```text
│ ┃ Jesus is the door ⟦John 10:9 · WEB⟧│
│ ┃ salvation and pasture.             │
```

Tapping it opens the captured text: a bottom sheet on a phone, a popover on a laptop. The text is
the snapshot taken when the chip was inserted and never changes. On a laptop, resting the mouse on
the chip opens the popover too, leaving the cursor in the note; it closes when the mouse leaves the
chip and the popover, unless the chip was clicked. Each verse starts with its number (²⁸ … ²⁹ …, and
"9:1" where a new chapter starts), once the book is on the device.

```text
┌──────────────────────────────────────┐
│ John 10:9                            │
│ World English Bible                  │
│                                      │
│ I am the door. If anyone enters in   │  ← font-serif
│ by me, he will be saved, and will go │
│ in and go out, and will find pasture.│
│                                      │
│ [ Every note on John 10:9 › ]        │  ← the verse index (M4-07)
│ [ Read in context › ] [ Memorise ]   │  ← reader (M5-04) · memory item (M6-01)
└──────────────────────────────────────┘
```

Phase 2 adds "View in …" here for other downloaded translations, without changing the note.

Screen readers hear the chip as a button: "John 10:9, World English Bible, verse. Show text."
From the keyboard, ← or → selects the chip (a ring shows it), and Enter or Space opens it. Esc, a
tap outside or × closes it, and the cursor is back where it was.

A chip inserted offline before its book was downloaded shows, instead of the text: "Text not
downloaded yet. It's added when the Bible is downloaded."

### Verse text in notes

With Settings → Bible → "Show verse text in notes" on (off by default, synced), each paragraph's
chips show their text under it, numbered, as a quote that isn't part of the note: it can't be
edited, and isn't saved, copied or exported with it. It's set apart from what was typed: a tinted
card with an accent edge, the reference in small capitals, the text smaller and in italics.

```text
│ ┃ Paul says in ⟦Romans 8:38–39 · WEB⟧│
│ ┃ and ⟦Psalm 23:1 · WEB⟧.            │
│ ┃ ▏ROMANS 8:38–39 · WEB              │  ← small caps, accent colour
│ ┃ ▏³⁸ For I am persuaded that neither│  ← font-serif italic, on bg-muted
│ ┃ ▏death… ³⁹ nor height, nor depth…  │
│ ┃ ▏PSALM 23:1 · WEB                  │
│ ┃ ▏¹ Yahweh is my shepherd…          │
```

## Verse autocomplete (M2-09)

The list opens when the text just before the cursor parses as a reference with a number ("rom 8",
"Jude 3"; a book name alone doesn't open it), and closes as soon as it doesn't, or a space follows.
The selected suggestion shows its WEB text, so the user never leaves the note.

```text
│ ┃ Paul says in rom 8:28▏             │
│ ┌──────────────────────────────────┐ │
│ │ Romans 8:28                  WEB │ │  ← selected
│ │ We know that all things work     │ │
│ │ together for good for those who  │ │
│ │ love God…                        │ │
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
│ │ Joshua 3                     WEB │ │  ← shortest name first (M1-09)
│ │ …                                │ │
│ │ Job 3                            │ │
│ │ Joel 3                           │ │
│ │ Jonah 3                          │ │
│ │ John 3                           │ │
│ └──────────────────────────────────┘ │
```

A reference with KJV numbering is moved onto WEB's and says so (decision 16):

```text
│ ┌──────────────────────────────────┐ │
│ │ Romans 14:24–26              WEB │ │
│ │ Typed as Romans 16:25–27 (KJV    │ │
│ │ numbering)                       │ │
│ │ Now to him who is able to…       │ │
│ └──────────────────────────────────┘ │
```

A reference that can't exist explains why, with nothing to insert:

```text
│ ┌──────────────────────────────────┐ │
│ │ Romans has 16 chapters.          │ │  ← muted
│ └──────────────────────────────────┘ │
```

A verse WEB leaves out (Acts 8:37) shows its footnote, and the chip keeps it: "[Not in WEB: TR adds
Philip said, …]".

If the WEB text isn't downloaded yet (first minutes after install), suggestions still appear and
insert a chip; the preview reads "Text not downloaded yet", and the chip's snapshot is filled in
when the book arrives (M2-11).

## Verse index (M4-07)

Everything that cites a passage, newest first: sections, highlights and memory items. It opens from
a chip, the reader and search. `Rom 8` includes every citation that overlaps the chapter, including
ranges that start in chapter 7 or run into chapter 9.

```text
┌──────────────────────────────────────┐
│ ← Romans 8                           │
├──────────────────────────────────────┤
│ Romans 8 · WEB          [ Read › ]   │
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
