# Wireframes — commentary, links, question threads and templates

Low-fi layouts for M10 (F22–F25). Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

The compile view is called **Commentary** in the app: it reads as the user's own running
commentary on a passage.

## Commentary (M10-01 to M10-04)

`/compile/$passage`. Every section that cites the passage, as one read-only document in canonical
order. It opens from a chip ("Read as commentary"), the reader's `⋯`, a verse search and the verse
index (`[ Commentary › ]` beside `[ Read › ]`).

```text
┌──────────────────────────────────────┐
│ ← Commentary                       ⋯ │  ← ⋯: Export…, Share link… (M13-04),
├──────────────────────────────────────┤     Read Romans 8
│ Romans 8                             │
│ ( Romans 8:28 | Romans 8 | Romans )  │  ← scope: the verses, the chapter, the book
│ 14 sections in 9 lessons             │
│                                      │
│ ROMANS 8:1                           │  ← a group: the verse they cite
│ ▏¹ There is therefore now no         │  ← its text, as in "Verse text in notes"
│ ▏condemnation for those who are…     │
│                                      │
│ No condemnation means the verdict is │  ← a section, read-only
│ already in. ⟦Romans 8:1 · BSB⟧       │
│ Justified by faith · Sun 7 Sep 2025 ›│  ← byline: lesson and date, opens the section
│                                      │
│ ROMANS 8:28                          │
│ ▏²⁸ And we know that God works all…  │
│                                      │
│ All things work together. That's the │
│ shepherd's promise.                  │
│ The Good Shepherd · Sun 12 Oct 2026 ›│
│ Also under Romans 8:38               │  ← it cites both: in full here, and…
│                                      │
│ ROMANS 8:38                          │
│ The Good Shepherd · Sun 12 Oct 2026 ›│  ← …a pointer under the other
│ ↑ Under Romans 8:28                  │
│                                      │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒         │  ← the rest arrives as you scroll
├──────────────────────────────────────┤
│ Lessons  Inbox   Read  Search  Review│
└──────────────────────────────────────┘
```

**Laptop:** the document in the centre column, and an outline of its groups in the side panel. A
click jumps to the group; the current one is marked as you scroll.

```text
┌──────────┬──────────────────────────────────────────────┬──────────────────────┐
│ sidebar  │ Romans 8                                 ⋯   │ IN THIS COMMENTARY   │
│          │ ( Romans 8:28 | Romans 8 | Romans )          │ Romans 8:1         2 │
│          │ 14 sections in 9 lessons                     │ Romans 8:14–17     1 │
│          │                                              │ Romans 8:28        5 │
│          │ ROMANS 8:28                                  │ Romans 8:31–39     4 │
│          │ ▏²⁸ And we know that God works all things…   │ Romans 8:38        2 │
│          │                                              │                      │
│          │ All things work together. That's the         │                      │
│          │ shepherd's promise.                          │                      │
│          │ The Good Shepherd · Sun 12 Oct 2026 ›        │                      │
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

- **Order:** by the first verse a group cites, then by date, oldest first, so it reads like a
  commentary that grew over time.
- **Read-only:** no cursor, no `⠿`, no toolbar. Text can be selected and copied; verse chips and
  link chips open as anywhere else. A reply shows under its section, indented, only if it cites the
  passage itself.
- The scope control offers the passage it was opened with, its chapter and its book. A book shows
  each chapter as a small heading (ROMANS 8) above its groups.
- **Several passages** (decided in M10-03): a section citing two passages in the scope is in full
  under the first, with "Also under …" linking to the other, and is a one-line pointer under the
  other: its lesson and date, then "↑ Under Romans 8:28", which jumps there.
- **Export** is the M6-05 dialog, titled "Export the commentary on Romans 8"; Markdown only.
- Opening it records a visit, synced (for "repeated verse", M12-01).
- **Empty:** "Nothing cites Romans 8 yet. Sections that cite it will show here as one document."
  `[ Read Romans 8 › ]`.
- **Loading:** a passage or a chapter shows at once. A book shows the first screen, then skeleton
  rows (after 300 ms) where the next groups are still being read.
- **Error:** an address that isn't a passage shows "Passage not found", as the verse index does.

## Link picker (M10-06)

Typing `[[` in a section opens a list over lessons and sections, as the verse autocomplete does.
Typing narrows it by title or text.

```text
│ ┃ As in [[shep▏                      │
│ ┌──────────────────────────────────┐ │
│ │ LESSON                           │ │
│ │ The Good Shepherd · Sun 12 Oct   │ │  ← selected
│ │ SECTIONS                         │ │
│ │ "I am the good shepherd…"        │ │
│ │ The Good Shepherd                │ │
│ │ "The same shepherd as Psalm 23"  │ │
│ │ Morning study                    │ │
│ └──────────────────────────────────┘ │
│ ↑↓ choose · Enter link · Esc keep    │  ← hint, laptop only
```

- With nothing typed after `[[`, it lists the five most recent lessons.
- **Enter** or a tap replaces `[[shep` with a link chip. **Esc** closes it and keeps the text.
- **Empty:** "Nothing matches "shep"." muted, with nothing to insert.
- **Loading:** if the search index is still being built, "Getting search ready…" shows after
  300 ms, with lesson titles only.

## Link chip (M10-06)

A link chip is a different shape from a verse chip: an arrow and the target's title, no
translation. It shows the target's current title, so a rename shows everywhere.

```text
│ ┃ Same idea as ⟨→ The Good Shepherd⟩ │  ← a lesson
│ ┃ and ⟨→ The Good Shepherd › "I am   │  ← a section: lesson › first words
│ ┃ the good shepherd…"⟩.              │
```

- A tap opens the target: the lesson, or the lesson scrolled to the section and briefly
  highlighted. From the keyboard, ← or → selects it and Enter opens it. Backspace deletes it whole.
- Screen readers hear "Link to lesson The Good Shepherd. Open."
- **Broken:** when the target is deleted, the chip stays, with the title it last had, struck
  through and marked:

```text
│ ┃ Same idea as ⟨⊘ The Good Shepherd  │
│ ┃ · deleted⟩                         │
```

A tap opens a small sheet: "The Good Shepherd was deleted. The link keeps the title it last had."
`[ Remove link ]` `[ Keep as text ]`. Screen readers hear "Broken link, The Good Shepherd,
deleted." A target that just hasn't synced to this device yet is not broken: it shows its title
muted and opens the not-found state ("…or not synced here yet").

## Linked from (M10-07)

The reverse of links: under a section, "Linked from 2" beside its tags; at the end of a lesson,
a list. Neither shows when nothing links there.

```text
│ ┃ I am the good shepherd. The good   │
│ ┃ shepherd lays down His life…       │
│ ┃ #grace             Linked from 2 ⠿ │  ← opens the list below
│ ┃ ┌────────────────────────────────┐ │
│ ┃ │ LINKED FROM                    │ │
│ ┃ │ Morning study · Thu 2 Oct    › │ │
│ ┃ │ "Same idea as The Good…"       │ │
│ ┃ │ Lazarus · Sun 19 Oct         › │ │
│ ┃ └────────────────────────────────┘ │
```

At the end of the lesson, after Questions (in the side panel on a laptop):

```text
│ LINKED FROM · 3                      │
│ Morning study · Thu 2 Oct          › │
│ "Same idea as The Good Shepherd"     │
│ ──────────────────────────────────── │
│ Lazarus · Sun 19 Oct               › │
│ "Compare the shepherd in John 10"    │
│ ──────────────────────────────────── │
│ …                                    │
```

- The lesson's list holds links to the lesson and to any of its sections. A row opens the linking
  section.
- It updates as links are added or removed, on every device after sync.

## Question thread (M10-08 to M10-11)

`/questions/$id`, from a question's `⋮` ("Thread") and from Review. The thread is every entry in
date order; the status follows the latest one.

```text
┌──────────────────────────────────────┐
│ ← Question                         ⋯ │  ← ⋯: Edit, Split…, Merge with…, Park, Delete
├──────────────────────────────────────┤
│ Who are the "other sheep"?           │
│ ◐ Partly answered · asked 3 times    │  ← status and lineage summary
│ since March                          │
│                                      │
│ ○ ASKED · Sun 2 Mar                  │
│   The Good Shepherd                › │
│ ↻ REVISITED · Sun 6 Apr              │
│   Lazarus                          › │
│ ◐ PARTIAL · Sun 4 May                │
│   Abiding in the vine              › │
│   "Gentiles, brought into one        │  ← the linked section's first lines
│   flock…"                            │
│ ↻ REVISITED · Sun 12 Oct             │
│   One flock                        › │
│                                      │
│ [ Add a partial answer ] [ Answer ]  │
└──────────────────────────────────────┘
```

| Entry | Symbol | Status it gives |
|---|---|---|
| Asked | ○ | Open |
| Revisited | ↻ | Open |
| Partial (a linked section) | ◐ | Partly answered (still open in Review) |
| Answered (a linked section) | ● | Answered |
| Reopened | ↺ | Open |
| Parked | ‖ | Parked |

- Each entry names its lesson and opens it there. Partial and answered entries also show the
  section they point to.
- **Answer** and **Add a partial answer** add a section to the latest entry's lesson, headed with
  the question, as "Answer in a section" does ([lessons.md](lessons.md#takeaways-and-questions-m4-03-m4-04)).
- **Reopen** (on an answered question) adds a reopened entry and puts it back in Review.
- **Empty:** never: a thread starts with its asked entry.
- **Error:** a deleted question shows "This question doesn't exist on this device…", as a lesson
  does.

**Revisit from another lesson.** A lesson's Questions `+ Add` offers "New question" and "Revisit a
question…". Revisit picks an open question (search by text), and adds a revisited entry in this
lesson instead of a copy:

```text
│ QUESTIONS                     + Add  │
│ ↻ Who are the "other sheep"?       ⋮ │  ← revisited here
│   first asked Sun 2 Mar · 3 entries  │
│ ○ Why does he call them by name?   ⋮ │
```

**Split** opens a dialog: the question's text in two fields, and each entry with `( 1 | 2 )` to say
which question keeps it. The second question's thread starts "Split from … on Fri 17 Oct". Nothing
is lost or copied. `[ Cancel ] [ Split ]`.

**Merge with…** picks another question, then asks: "Merge "Who are the other sheep?" into "One
flock, one shepherd?"? Their 6 entries become one thread, in date order." `[ Cancel ] [ Merge ]`.

**In Review** (M10-11), each question row shows its summary under the text: "Asked 3 times since
March · 1 partial answer". A question asked once with nothing since has none. The question's text opens
its thread. Built: "Partly answered" lasts from a partial answer until the question is answered or
reopened (decision 81).

## Template picker (M10-12 to M10-14)

A new lesson's empty first section offers a template, under "Write a note…", until something is
typed. A section's `⠿` menu has "Add a template…" too.

```text
│ The Good Shepherd                    │
│ Sun 12 Oct · Personal · Details ▾    │
│                                      │
│ ┃ Write a note…▏                     │
│   Start from a template ›            │  ← muted; goes once anything is typed
```

```text
┌──────────────────────────────────────┐
│ Start from a template             ✕  │
├──────────────────────────────────────┤
│ BUILT IN                             │
│ SOAP                                 │
│ Scripture · Observation · Application│
│ · Prayer                             │
│ ──────────────────────────────────── │
│ Inductive                            │
│ Observe · Interpret · Apply          │
│ ──────────────────────────────────── │
│ Lectio Divina                        │
│ Read · Meditate · Pray · Contemplate │
│ ──────────────────────────────────── │
│ Verse mapping                        │
│ The verse · Key words · Cross-       │
│ references · Paraphrase · Application│
│                                      │
│ YOURS                                │
│ Sermon notes                         │
│ Main point · Points ↳ 3 · Response   │  ← ↳ 3: three child sections
│                                      │
│ Manage templates in Settings ›       │
└──────────────────────────────────────┘
```

A tap applies it. The named sections replace the empty one, each a heading with the cursor in the
first:

```text
│ ┃ Scripture                          │  ← heading line, then an empty line
│ ┃ ▏                                  │
│ ┃ Observation                        │
│ ┃                                    │
│ ┃ Application                        │
│ ┃                                    │
│ ┃ Prayer                             │
│ ┃                                    │
```

- Afterwards they're ordinary sections: they edit, move and delete like any other.
- Applied to a lesson that already has text, or from a section's menu, the sections go after that
  point, with "Added 4 SOAP sections. `[ Undo ]`".
- Child sections are replies; a template nests one level, like the editor.

**Settings → Templates** lists the built-ins (read-only; "Copy to edit") and the user's own (edit,
delete). The lesson's `⋯` has "Save as template…", which keeps the section headings, not the
text. Defaults per kind are set here:

```text
┌──────────────────────────────────────┐
│ ← Templates                          │
├──────────────────────────────────────┤
│ NEW LESSONS START WITH               │
│ Sermon        [ No template     ▾ ]  │
│ Personal      [ SOAP            ▾ ]  │
│ Group         [ Inductive       ▾ ]  │
│                                      │
│ YOURS                     + New      │
│ Sermon notes                       › │
│                                      │
│ BUILT IN                             │
│ SOAP · Inductive · Lectio Divina ·   │
│ Verse mapping                      › │
└──────────────────────────────────────┘
```

- The kind is the lesson's Details row "Kind" (Sermon, Personal, Group; it was labelled "Source"
  in v1). A default applies only to a new lesson, and only when its first section is still empty.
- The editor is a name field and a list of section names with Tab and Shift+Tab to nest, Move up
  and Move down.
- Deleting a template happens at once, with Undo; lessons made from it don't change.
- **Empty (yours):** "No templates of your own yet. Save one from a lesson's ⋯, or make one here."
  `[ + New template ]`.
- Built (M10-13, M10-14): the editor saves with Create template or Save, and Cancel. Each name has a
  `⋯` with Move up, Move down, Make a child or Move out, and Remove. A built-in's "Copy to edit"
  opens the editor on "SOAP (copy)". Changing a new lesson's kind swaps its default while nothing is
  written in it (decision 82).
