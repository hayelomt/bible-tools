# Wireframes — reader, highlights and promotion

Low-fi layouts for M5-01 to M5-04. Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

## Chapter view (M5-01, M5-04)

One chapter per page, in the reading face. The header names the translation. Swipe left or right
(phone) or use `←` `→` (laptop) for the next or previous chapter; the arrows in the header do the
same. The reader reopens where it was left.

```text
┌──────────────────────────────────────┐
│ ‹      John 10 ▾      BSB          › │  ← ‹ › chapters · "John 10 ▾" opens the picker
├──────────────────────────────────────┤
│ ¹ "Truly, truly, I tell you, whoever │  ← verse numbers small and muted
│ does not enter the sheepfold by the  │
│ gate, but climbs in some other way,  │
│ is a thief and a robber.             │
│ …                                    │
│ ⁹ I am the gate. If anyone enters  • │  ← • this verse has notes (M5-04)
│ through Me, he will be saved…        │
│ ¹⁰ The thief comes only to steal…    │
│ ¹¹ ░I am the good shepherd. The good │  ← highlighted (yellow)
│ ░shepherd lays down His life for the │
│ ░sheep.░                           • │
│ …                                    │
│                                      │
│ [ ‹ John 9 ]           [ John 11 › ] │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

Tapping a verse selects it; tapping more extends the selection. A marker `•` opens the verse index
for that verse.

*As built in M5-04:* the marker sits after the verse's text and shows where a note's chip cites the
verse; a lesson's main passage and a highlight don't add one. The selection bar has "Verse index"
for the selected verses, in place of the `⋯` menu's "Every note on …" until that menu is built.

*As built in M6-01:* the `⋯` menu holds Memorise (or "In memory verses ✓") and Verse index; Copy is
left out.

## Book and chapter picker (M5-01)

```text
┌──────────────────────────────────────┐
│ ← Choose a passage   [ Filter____ ]  │  ← "1 jo" narrows to 1 John
├──────────────────────────────────────┤
│ OLD TESTAMENT                        │
│ Genesis   Exodus    Leviticus        │
│ Numbers   Deuteronomy  Joshua  …     │
│ NEW TESTAMENT                        │
│ Matthew   Mark      Luke             │
│ John ✓    Acts      Romans  …        │
└──────────────────────────────────────┘
```

Choosing a book shows its chapters:

```text
│ ← John                               │
│ [ 1][ 2][ 3][ 4][ 5][ 6][ 7]         │  ← 44 px squares
│ [ 8][ 9][10][11][12][13][14]         │
│ [15][16][17][18][19][20][21]         │
```

A one-chapter book (Jude) opens straight away.

## Selected verses (M5-02, M5-03, M6-01)

A bar replaces the bottom navigation while verses are selected.

```text
├──────────────────────────────────────┤
│ John 10:9–11 selected            ✕   │
│ ( ● ● ● ● )  Note  Add to lesson  ⋯  │  ← four highlight colours · ⋯: Memorise, Copy,
│                                      │      Every note on John 10:9–11
└──────────────────────────────────────┘
```

On a highlighted selection the colours include "Remove highlight". **Note** opens a short text
field under the verse:

```text
│ ¹¹ ░I am the good shepherd…░         │
│ ┌──────────────────────────────────┐ │
│ │ Note on John 10:11               │ │
│ │ [ Memorise this one▏          ]  │ │
│ │                  [ Done ]        │ │
│ └──────────────────────────────────┘ │
```

## Add to lesson (M5-03)

```text
┌──────────────────────────────────────┐
│ Add John 10:11 to a lesson           │
│                                      │
│ ○ The Good Shepherd · Sun 12 Oct     │  ← recent lessons first
│ ○ Abiding in the vine · Sun 5 Oct    │
│ ○ Search lessons…                    │
│ ○ New lesson "John 10:11"            │
│                                      │
│ Adds a section with the verse and    │
│ your note.                           │
│                  [ Cancel ] [ Add ]  │
└──────────────────────────────────────┘
```

After adding, a toast: "Added to The Good Shepherd. `[ Open ]`". The highlight now links to that
section.

*As built in M5-03:* the most recent lesson is chosen to start with. "Search lessons…" is a field
above the list, shown once there are more than five lessons; it narrows them by title. A new
lesson is titled with the reference, dated today, Personal, with the passage as its main passage.
The section is the verse chip, then the note. Once added, the bar's "Add to lesson" reads "Open in
lesson" until that section is deleted.
