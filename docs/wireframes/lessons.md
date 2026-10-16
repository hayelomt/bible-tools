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

Welcome (M2-14, M2-15): the first screen on a new device, before the empty state. The mode is
already set to the default (Auto), so Continue alone is enough; it can change later in
Settings → Appearance. Shown once per device, and never on a device that already has lessons
or series.

```text
┌──────────────────────────────────────┐
│ Lessons                            ≡ │
├──────────────────────────────────────┤
│ Welcome to Lamp                      │
│ Choose light, dark, or Auto to       │
│ follow your device. You can change   │
│ it any time in Settings.             │
│                                      │
│ Mode         ( Light | Dark | Auto ) │  ← the mode control from Settings
│                                      │     (shell.md)
│ [ Continue →                       ] │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

First run (empty state, M2-06), after the welcome:

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
│ ←                          ✓       ⋯ │  ← ✓ means saved; ⋯: Details, Move to series, Export, Delete lesson
├──────────────────────────────────────┤
│ The Good Shepherd▏                   │  ← title, large; Enter moves to the first section
│ Sun 12 Oct · Sermon · Details ▾      │
│                                      │
│ ┃ Jesus is the door ⟦John 10:9 · BSB⟧│  ← section: rich text with verse chips
│ ┃ salvation and pasture.             │
│ ┃ #grace                           ⠿ │  ← its tags; ⠿ menu (tap) and drag (hold)
│ ┃                                    │
│ ┃  ┃ Compare ⟦Psalm 23:1 · BSB⟧ — the│  ← reply (second level, indented)
│ ┃  ┃ same shepherd.                ⠿ │
│                                      │
│ ┃ Write a note…▏                     │  ← always an empty section at the end, ready to type
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
│ │ Series    [ John           ▾ ]   │ │  ← No series, the series, Create series…
│ │ Tags      [#grace ×] [+ Tag ]    │ │  (M4-01)
│ └──────────────────────────────────┘ │
```

**Laptop:** notes in the centre column, details, takeaways and questions in a side panel. Sections
show their `⠿` on hover and focus.

```text
┌──────────┬──────────────────────────────────────────────┬──────────────────────┐
│ sidebar  │ The Good Shepherd                        ⋯   │ DETAILS              │
│          │ Sun 12 Oct · Sermon · Pastor Ann             │ Date    12 Oct 2026  │
│          │                                              │ Source  Sermon       │
│          │ Jesus is the door ⟦John 10:9 · BSB⟧        ⠿ │ Passages John 10:1–18│
│          │ salvation and pasture.              #grace   │ Series  John         │
│          │   Compare ⟦Psalm 23:1 · BSB⟧ — the same    ⠿ │ Tags    #grace       │
│          │   shepherd.                                  │                      │
│          │ Write a note…                                │ TAKEAWAYS     + Add  │
│          │                                              │ • He knows his sheep │
│          │                                              │ QUESTIONS     + Add  │
│          │                                              │ ○ Who are the "other │
│          │                                              │   sheep"?          ⋮ │
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

**Editing keys:** Enter on an empty last line ends the section and starts the next one; in an
empty reply it moves the reply out. Tab (or ⇥) makes the section a reply to the one above; Shift+Tab
(⇤) moves it back out. In a list they indent the list item instead. A third level isn't offered: Tab
does nothing in a reply or in a section that has replies. Backspace in an empty section deletes it.
The arrows move between sections at the first and last line, Alt+Shift+↑ and ↓ move the section
itself, and Escape leaves the editor.

## Section menu, reorder and delete (M2-08)

```text
│ ┃ Jesus is the door …              ⠿ │
│        ┌─────────────────────────┐   │
│        │ Reply                   │   │
│        │ Tags                    │   │  (M4-01)
│        │ Move up                 │   │  ← the keyboard and screen-reader way to reorder
│        │ Move down               │   │
│        │ Make a reply / Move out │   │
│        │ ─────────────────────── │   │
│        │ Delete                  │   │  ← destructive colour
│        └─────────────────────────┘   │
```

Each section has one `⠿` (decided 2026-10-13): a tap or click opens this menu, and pressing and
dragging it moves the section. A finger is held on it for a moment first, so a quick swipe still
scrolls. The section then follows the finger as a card, the other sections make room, and a dashed
slot shows where it will land. Pulling the card a little to the right makes it a reply (the slot
indents; not for a section that has replies). Escape cancels. Focus returns to the `⠿`
after Move up or Move down, so the keyboard can keep going. The empty section at the end has no `⠿`.

Deleting a section **without replies** happens at once, with an undo toast:

```text
├──────────────────────────────────────┤
│ Section deleted.            [ Undo ] │  ← 10 s; "Reply deleted." for a reply
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

**Phone:** a lesson without takeaways or questions shows neither list. A floating **+** above the
bottom bar offers Add takeaway and Add question; a list shows after the sections once it has one.
The **+** goes while anything is being typed, so it never covers the text or the editing toolbar.

```text
│ ┃ Write a note…                      │
│                                      │
│                       ┌────────────┐ │
│                       │Add takeaway│ │
│                       │Add question│ │
│                       └────────────┘ │
│                                 (+)  │
├──────────────────────────────────────┤
│ Lessons   Read   Search   Review     │
```

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
