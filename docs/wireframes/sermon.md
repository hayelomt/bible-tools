# Wireframes — capture mode, triage, sources and the prep card

Low-fi layouts for M11 (F26–F29). Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md). The inbox itself is in
[interop.md](interop.md#inbox-m9-02-m9-07).

## Capture mode (M11-01)

For keeping up during a sermon. One tap from the lesson header (`◉ Capture`, beside `⋯`), or from
the prep card. Plain text only: no tags, formatting, replies or drag. The bottom bar and the
editing toolbar go; the screen stays on where the browser allows it.

```text
┌──────────────────────────────────────┐
│ [ Done ]   ● 23:14              ⋯    │  ← time since the start · ⋯: Set the start
├──────────────────────────────────────┤
│ JOHN 10:1–18                       ▾ │  ← the prep passage, pinned; ▾ shows its text
│                                      │
│ 02:10  The door is the only way in.  │  ← each section with its time
│ 09:45  Sheep know the voice before   │
│        they see the shepherd.        │
│        ⟦John 10:27 · BSB⟧            │
│ 23:14  Hired hand runs; the shepherd │
│        stays▏                        │  ← the section being typed
│                                      │
│                                      │
│ [ Verse: rom 8 28_____ ]  [ Insert ] │  ← quick verse box; Enter inserts the chip
│ [          + New section           ] │  ← large; also Enter on an empty line
└──────────────────────────────────────┘
```

- **The time** counts from the source's start time ([below](#lesson-source-m11-06)), or from
  opening capture mode if there's none. "Set the start" changes it ("The recording starts at
  10:30"); the sections' times move with it.
- **The quick verse box** takes a reference as typed ("rom 8 28") and inserts the chip at the
  cursor; the autocomplete list doesn't open, so nothing covers the notes. An impossible reference
  shows why under the box ("Romans has 16 chapters."), as the autocomplete does.
- **Done** returns to the lesson with the same sections, in the normal view, each with its time
  ([section timestamps](#section-timestamps-and-pages-m11-07)).
- **Laptop:** the same, centred, in larger type. Ctrl+Enter is New section; Ctrl+K focuses the
  verse box.
- **Empty:** the first section is ready to type, with "Type what you hear. Each section gets the
  time it started." in its place.
- **Loading:** none.
- **Error:** storage full is the shared toast; the typed text stays on screen.

## Inbox triage (M11-02 to M11-05)

The Inbox ([interop.md](interop.md#inbox-m9-02-m9-07)) gains selection, more actions per item, a
snooze and a flag for old items.

**Phone.** "Select" in the header (or holding an item) shows checkboxes. A bar replaces the bottom
navigation, as the reader's selection bar does.

```text
┌──────────────────────────────────────┐
│ ✕ 3 selected            Select all   │
├──────────────────────────────────────┤
│ ☑ ⟦Romans 8:28 · BSB⟧                │
│   And we know that God works all…    │
│   Shared · 10:42                     │
│ ──────────────────────────────────── │
│ ☑ Look up "hesed" before Sunday.     │
│   Added · Thu 16 Oct                 │
│ ──────────────────────────────────── │
│ ☐ ⟦Psalm 23:1 · shared⟧              │
│   Shared · Mon 8 Sep · 39 days old   │  ← older than 30 days: flagged in words
│ ──────────────────────────────────── │
│ ☑ ⟦Isaiah 40:11 · KJV⟧               │
│   Pasted · Wed 15 Oct                │
├──────────────────────────────────────┤
│ Send to lesson   Tag   Dismiss    ⋯  │  ← ⋯: Make a lesson, Snooze
└──────────────────────────────────────┘
```

An item's own `⋯` (outside selection) holds: Send to lesson · Append to a section · Make a takeaway
· Make a question · Tag · Snooze · Dismiss.

- **Bulk actions** are one action each, with one Undo: "3 items sent to The Good Shepherd.
  `[ Undo ]`", "12 items dismissed. `[ Undo ]`". The selection is the confirmation, so dismissing
  selected items doesn't ask.
- **Tag** adds tags to the items (the tag input from lessons.md); placed items take them into
  their sections.
- **Make a takeaway / a question** asks for the lesson (the Send to lesson sheet), with the text
  in a field to edit first. The chip goes with it. The item leaves the inbox.
- **Make a lesson** from the selected items: a dialog with a title (the first item's reference to
  start with), "3 items become 3 sections, in the order received." `[ Cancel ] [ Make lesson ]`.
  The new lesson opens.
- **Snooze** offers Tomorrow · Sunday · In a week · Pick a date. The item hides until then on every
  device, with "Snoozed until Sun 26 Oct. `[ Undo ]`". A "Snoozed · 4 ›" row at the end of the
  list shows them, with Wake now.
- **Old items:** "39 days old" in muted text after the date, never the destructive colour.

**Laptop.** The list on the left with a focus ring on the current item, and the item in the side
panel with every action as a button. `?` shows the keys.

```text
┌──────────┬──────────────────────────────────────────────┬──────────────────────┐
│ sidebar  │ Inbox · 14                    Select   ⋯     │ ⟦Romans 8:28 · BSB⟧  │
│          │ [ Add a verse or a note…                   ] │ And we know that God │
│          │                                              │ works all things     │
│          │ ☑ ⟦Romans 8:28 · BSB⟧ And we know…   10:42   │ together for the     │
│          │ ☐ Look up "hesed" before Sunday.  Thu 16 Oct │ good of those who    │
│          │ ☐ ⟦Psalm 23:1 · shared⟧ … 39 days old  8 Sep │ love Him…            │
│          │ ☐ ⟦Isaiah 40:11 · KJV⟧ He shall…   Wed 15 Oct│ Shared · youversion  │
│          │                                              │                      │
│          │ YOUVERSION IMPORT · Tue 14 Oct · 980       › │ [ Send to lesson   s]│
│          │ Snoozed · 4                                › │ [ Append          a ]│
│          │                                              │ [ Takeaway        w ]│
│          │                                              │ [ Question        q ]│
│          │                                              │ [ Tag             t ]│
│          │                                              │ [ Snooze          z ]│
│          │                                              │ [ Dismiss         d ]│
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

```text
┌──────────────────────────────────────┐
│ Inbox keys                        ✕  │
├──────────────────────────────────────┤
│ j  k  ↓ ↑  next, previous item       │
│ x          select it                 │
│ s          send to lesson            │
│ a          append to a section       │
│ w          make a takeaway           │
│ q          make a question           │
│ t          tag                       │
│ z          snooze                    │
│ d          dismiss                   │
│ l          make a lesson from the    │
│            selected items            │
│ Shift+x    select all                │
│ ?          this list                 │
└──────────────────────────────────────┘
```

- The side panel shows each action's key, and the key list uses the same letters.
- The keys never fire while typing in the add box, as with every shortcut.
- After an action, focus moves to the next item, so the whole inbox can be cleared from the
  keyboard.
- **Empty:** "Inbox clear." with the add box above it; the snoozed row stays if any are snoozed.
- **Loading** and **errors:** as the inbox.

## Lesson source (M11-06)

A lesson's Details gain a Source, and the old Sermon / Personal / Group row is now **Kind**
(decided 2026-10-17).

```text
│ Sun 12 Oct · Sermon · Details ▴      │
│ ┌──────────────────────────────────┐ │
│ │ Date      [ 12 Oct 2026      ]   │ │
│ │ Kind      ( Sermon | Personal |  │ │  ← was "Source" in v1
│ │             Group )              │ │
│ │ Speaker   [ Pastor Ann       ]   │ │
│ │ Church    [ Grace Chapel     ]   │ │
│ │ Passages  [John 10:1–18 ×] [+ ]  │ │
│ │ Series    [ John           ▾ ]   │ │
│ │ Tags      [#grace ×] [+ Tag ]    │ │
│ │ SOURCE                           │ │
│ │ Type   ( Sermon | Book |         │ │
│ │          Podcast | Other )       │ │
│ │ Title     [ Sunday service   ]   │ │
│ │ Link      [ youtube.com/…    ]   │ │
│ │ Author    [ Pastor Ann       ]   │ │  ← "Author" for a book or podcast
│ │ Starts at [ 10:30            ]   │ │  ← the recording's start, for times
│ └──────────────────────────────────┘ │
```

Under the lesson title, a lesson with a source shows it:

```text
│ The Good Shepherd                    │
│ Sun 12 Oct · Sermon · Details ▾      │
│ ▶ Sunday service · youtube.com     ↗ │  ← opens the link; a book shows its title
```

- Empty fields don't show. A lesson without a source is unchanged.
- **Error:** a link that isn't a web address: "This isn't a web address." under the field; the
  text stays.

## Section timestamps and pages (M11-07)

A section can carry a time (from capture mode) or a page (typed in). It shows as a small muted
button at the start of the section's first line.

```text
│ ┃ ▶ 09:45  Sheep know the voice      │  ← opens the recording at 9:45
│ ┃ before they see the shepherd.      │
│ ┃                                  ⠿ │
│ ┃ p. 112  "The shepherd goes ahead…" │  ← a page; not a button
│ ┃                                  ⠿ │
```

- The section's `⠿` menu has "Time or page…": a field that takes "9:45" or "p. 112", and Remove.
- **▶ opens the media at that time** where the link supports it (YouTube, Vimeo, audio files with
  `#t=`). Elsewhere it opens at the start, and its label says so: "Opens at the start; this site
  can't jump to a time."
- Without a source link the time is plain text, not a button.
- Export and print show them as "[09:45]" and "[p. 112]" (M11-08).

## Prep card (M11-09)

On the Lessons home, under New lesson. Until a passage is entered it's one line:

```text
│ [ + New lesson                     ] │
│ Prep the next sermon ›               │  ← muted
│                                      │
│ RECENT                               │
```

Entering the passage (the reference input) shows what Lamp already has on it:

```text
│ [ + New lesson                     ] │
│ ┌──────────────────────────────────┐ │
│ │ NEXT SERMON · Sun 19 Oct       ✕ │ │
│ │ John 11:1–44                     │ │
│ │ 6 sections in 3 lessons        › │ │  ← the commentary (M10-02)
│ │ 2 open questions               › │ │
│ │ #death  #hope  #grace            │ │  ← tags on sections that cite it
│ │ Last in John: The Good Shepherd  │ │
│ │ · Sun 12 Oct                   › │ │
│ │ [ Start capture ]                │ │
│ └──────────────────────────────────┘ │
│                                      │
│ RECENT                               │
```

- Entering the passage makes a draft lesson: the passage as its main passage, dated next Sunday,
  Sermon, in the last series used. **Start capture** opens it in capture mode with the passage
  pinned.
- The card clears once that lesson has a section with text, or its date has passed. ✕ clears it
  now, and deletes the draft if it's still empty.
- **Empty (nothing on the passage):** "Nothing on John 11:1–44 yet. You'll start fresh." with
  Start capture.
- **Loading:** none; the counts come from the device.
- **Error:** a passage that can't exist shows why under the field ("John has 21 chapters.").
