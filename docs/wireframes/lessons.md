# Wireframes — lessons, sections, series and tags

Low-fi layouts for M2-04 to M2-08 and M4-01 to M4-04. Legend and shared rules:
[shell.md](shell.md), [UX-PATTERNS.md](../UX-PATTERNS.md).

## Lessons home (M2-06)

"New lesson" is the first thing on the screen and is one tap.

```text
┌──────────────────────────────────────┐
│ Lessons                  ◌ Synced  ≡ │
├──────────────────────────────────────┤
│ [ + New lesson                     ] │
│                                      │
│ RECENT                               │
│ The Good Shepherd                    │
│ Sun 12 Oct · John 10:1–18 · John     │  ← date · main passages · series
│ ──────────────────────────────────── │
│ Abiding in the vine                  │
│ Sun 5 Oct · John 15:1–11 · John      │
│ ──────────────────────────────────── │
│ Morning study                        │
│ Thu 2 Oct · Psalm 23 · Personal      │
│ ──────────────────────────────────── │
│ Show all 24 lessons ›                │
│                                      │
│ SERIES                       + New   │
│ John · 3 lessons                   › │
│ Romans · 8 lessons                 › │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

First run (empty state, M2-06):

```text
┌──────────────────────────────────────┐
│ Lessons                            ≡ │
├──────────────────────────────────────┤
│                                      │
│          Your notes start here.      │
│                                      │
│   Capture a sermon or a study. It's  │
│   saved on this device and works     │
│   offline; no account needed.        │
│                                      │
│        [ + New lesson ]              │
│                                      │
│   Or open the Bible to read ›        │
│                                      │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

## Lesson: capture and edit (M2-04, M2-07)

"New lesson" creates the lesson and opens it with the title focused and an empty first section
below. Date (today) and source (Sermon) are already set. The other details are one tap away and
never in the way of typing. Everything saves as it's typed; there's no Save button.

```text
┌──────────────────────────────────────┐
│ ←                       Saved      ⋯ │  ← ⋯: Details, Move to series, Export, Delete lesson
├──────────────────────────────────────┤
│ The Good Shepherd▏                   │  ← title, large; Enter moves to the first section
│ Sun 12 Oct · Sermon · Details ▾      │
│                                      │
│ ┃ Jesus is the door ⟦John 10:9 · WEB⟧│  ← section: rich text with verse chips
│ ┃ salvation and pasture.             │
│ ┃ #grace                           ⋮ │  ← its tags; ⋮ section menu
│ ┃                                    │
│ ┃  ┃ Compare ⟦Psalm 23:1 · WEB⟧ — the│  ← reply (second level, indented)
│ ┃  ┃ same shepherd.                ⋮ │
│                                      │
│ ┃ Write a note…▏                     │  ← empty section, ready to type
│                                      │
│ [ + Section ]                        │
│                                      │
│ TAKEAWAYS                     + Add  │  (M4-03)
│ • He knows his sheep by name.        │
│                                      │
│ QUESTIONS                     + Add  │  (M4-04)
│ ○ Who are the "other sheep"?       ⋮ │
├──────────────────────────────────────┤
│  B   I   •   1.   ❝   ↳ Reply   ⇤  ⇥ │  ← editing toolbar, sits on top of the keyboard
└──────────────────────────────────────┘
```

**Details** opens in place (phone) or lives in the side panel (laptop):

```text
│ Sun 12 Oct · Sermon · Details ▴      │
│ ┌──────────────────────────────────┐ │
│ │ Date      [ 12 Oct 2026      ]   │ │
│ │ Source    ( Sermon | Personal |  │ │
│ │             Group )              │ │
│ │ Speaker   [ Pastor Ann       ]   │ │
│ │ Church    [ Grace Chapel     ]   │ │
│ │ Passages  [John 10:1–18 ×] [+ ]  │ │  ← the reference input (same parser as chips)
│ │ Series    [ John           ▾ ]   │ │
│ │ Tags      [#grace ×] [+ Tag ]    │ │  (M4-01)
│ └──────────────────────────────────┘ │
```

**Laptop:** notes in the centre column, details, takeaways and questions in a side panel. Sections
show a drag handle on hover.

```text
┌──────────┬──────────────────────────────────────────────┬──────────────────────┐
│ sidebar  │ The Good Shepherd                        ⋯   │ DETAILS              │
│          │ Sun 12 Oct · Sermon · Pastor Ann             │ Date    12 Oct 2026  │
│          │                                              │ Source  Sermon       │
│          │ ⠿ Jesus is the door ⟦John 10:9 · WEB⟧        │ Passages John 10:1–18│
│          │   salvation and pasture.            #grace ⋮ │ Series  John         │
│          │     ⠿ Compare ⟦Psalm 23:1 · WEB⟧ — the same  │ Tags    #grace       │
│          │       shepherd.                            ⋮ │                      │
│          │ ⠿ Write a note…                              │ TAKEAWAYS     + Add  │
│          │                                              │ • He knows his sheep │
│          │ [ + Section ]                                │ QUESTIONS     + Add  │
│          │                                              │ ○ Who are the "other │
│          │                                              │   sheep"?          ⋮ │
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

**Editing keys:** Enter on an empty last line ends the section and starts the next one; in an
empty reply it moves the reply out. Tab (or ⇥) makes the section a reply to the one above; Shift+Tab
(⇤) moves it back out. In a list they indent the list item instead. A third level isn't offered: Tab
does nothing in a reply or in a section that has replies. Backspace in an empty section deletes it.
The arrows move between sections at the first and last line, and Escape leaves the editor.

## Section menu, reorder and delete (M2-08)

```text
│ ┃ Jesus is the door …              ⋮ │
│        ┌─────────────────────────┐   │
│        │ Reply                   │   │
│        │ Tags                    │   │
│        │ Move up                 │   │  ← the keyboard and screen-reader way to reorder
│        │ Move down               │   │
│        │ Make a reply / Move out │   │
│        │ ─────────────────────── │   │
│        │ Delete                  │   │  ← destructive colour
│        └─────────────────────────┘   │
```

Drag: a long press on the section (phone) or the `⠿` handle (laptop) picks it up. A line shows
where it will land, and dropping it on the right half of a section makes it a reply.

Deleting a section **without replies** happens at once, with an undo toast:

```text
├──────────────────────────────────────┤
│ Section deleted.            [ Undo ] │  ← 10 s
├──────────────────────────────────────┤
```

Deleting a section **with replies** asks first, naming what goes:

```text
┌──────────────────────────────────────┐
│ Delete this section and its 2        │
│ replies?                             │
│                                      │
│ Their text, tags and verse links are │
│ deleted.                             │
│                                      │
│           [ Cancel ] [ Delete all 3 ]│  ← focus starts on Cancel
└──────────────────────────────────────┘
```

## Takeaways and questions (M4-03, M4-04)

```text
│ QUESTIONS                     + Add  │
│ ○ Who are the "other sheep"?       ⋮ │  ← ○ open
│ ● What is the "door"?              › │  ← ● answered: › jumps to the answer section
│ ‖ Thief vs hired hand?             ⋮ │  ← ‖ parked, muted
```

Question menu: **Answer in a section** · Park (or Reopen) · Edit · Delete. "Answer in a section"
adds a top-level section headed with the question and puts the cursor under it; the question turns
answered as soon as that section has text.

```text
│ ┃ Who are the "other sheep"?         │  ← heading, from the question
│ ┃ ▏                                  │
```

## Series (M2-05)

```text
┌──────────────────────────────────────┐
│ ← John                             ⋯ │  ← ⋯: Rename, Export series, Delete series…
├──────────────────────────────────────┤
│ Book study · 3 lessons               │
│ Walking through John on Sundays.     │
│                                      │
│ Sun 5 Oct    Abiding in the vine   › │  ← date order, oldest first
│ Sun 12 Oct   The Good Shepherd     › │
│ Sun 19 Oct   Lazarus               › │
│                                      │
│ [ + New lesson in John ]             │
└──────────────────────────────────────┘
```

**Move to series** (lesson `⋯`): a list of series with the current one ticked, "No series" and
"+ New series". Choosing one moves the lesson at once.

**Delete series** asks first, since it holds lessons: "Delete the series John? Its 3 lessons stay,
without a series." `[ Cancel ] [ Delete series ]`.

## Tag input (M4-01)

```text
│ Tags  [#grace ×] [#hope ×] [ gr▏   ] │
│              ┌──────────────────────┐│
│              │ grace                ││  ← seeded and custom tags, matching as you type
│              │ growth               ││
│              │ + Create "gr"        ││  ← Enter on a new name creates it
│              └──────────────────────┘│
```

Case doesn't make a new tag: typing "Grace" picks the existing "grace".

## Tag page (M4-02)

```text
┌──────────────────────────────────────┐
│ ← #grace                           ⋯ │  ← ⋯: Rename tag, Delete tag
├──────────────────────────────────────┤
│ 12 sections in 4 lessons             │
│                                      │
│ THE GOOD SHEPHERD · Sun 12 Oct       │
│ Jesus is the door ⟦John 10:9⟧        │
│ salvation and pasture.             › │
│ ──────────────────────────────────── │
│ ABIDING IN THE VINE · Sun 5 Oct      │
│ The whole lesson is tagged.        › │
│ Apart from me you can do nothing …   │
│ ──────────────────────────────────── │
│ …                                    │
└──────────────────────────────────────┘
```

A result opens the lesson scrolled to that section, which is briefly highlighted.
