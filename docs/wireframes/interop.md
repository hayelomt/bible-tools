# Wireframes — inbox, share, paste, "Open in…" and import

Low-fi layouts for M9 (F17–F21). Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md). Triage (multi-select, snooze, promote) is M11 and is drawn in
[sermon.md](sermon.md#inbox-triage-m11-02-to-m11-05).

Inbox items are not notes yet: they don't show in the verse index, search or a commentary until
they're placed in a lesson (decided 2026-10-17).

## Inbox (M9-02, M9-07)

The fifth tab, after Lessons ([shell.md](shell.md#app-shell-m2-02-m9-02)). Newest first. Each item
shows its chip, its text, where it came from and its translation. The add box is always at the top.

```text
┌──────────────────────────────────────┐
│ Inbox                    ◌ Synced  ≡ │
├──────────────────────────────────────┤
│ [ Add a verse or a note…▏          ] │  ← typed or pasted; Enter adds
│ [ Add from clipboard ]               │  ← M9-07; the main way in on an iPhone
│                                      │
│ ⟦Romans 8:28 · BSB⟧                  │
│ And we know that God works all       │  ← the snapshot, 3 lines, then "…"
│ things together for the good…        │
│ Shared · bible.com · 10:42           │  ← origin · source · received
│ [ Send to lesson ]                 ⋯ │  ← ⋯: Append to a section, Dismiss
│ ──────────────────────────────────── │
│ Look up "hesed" before Sunday.       │  ← text only, no chip
│ Added · Thu 16 Oct                   │
│ [ Send to lesson ]                 ⋯ │
│ ──────────────────────────────────── │
│ ⟦Psalm 23:1 · shared⟧                │  ← translation not identified
│ The LORD is my shepherd; I shall …   │
│ Shared · Wed 15 Oct                  │
│ [ Send to lesson ]                 ⋯ │
│ ──────────────────────────────────── │
│ YOUVERSION IMPORT · Tue 14 Oct       │  ← an import is one row (M9-11)
│ 980 items                          › │
├──────────────────────────────────────┤
│ Lessons  Inbox⁴  Read  Search  Review│
└──────────────────────────────────────┘
```

- **Origin words:** Shared, Pasted, Added (typed in the box), Imported, Captured. The time is
  "10:42" today, "Thu 16 Oct" before.
- **Send to lesson** opens a sheet like Add to lesson ([reader.md](reader.md#add-to-lesson-m5-03)),
  with the most recent lesson chosen, so it's two taps. The item becomes a new section at the end:
  the chip, then the text.
- **Append to a section** opens the same sheet, then the lesson's sections (first line of each);
  the item goes at the end of the one chosen.
- **Dismiss** happens at once.
- Either way the item leaves the list with a toast: "Sent to The Good Shepherd. `[ Undo ]`" or
  "Dismissed. `[ Undo ]`". Undo puts it back where it was, and takes the section back out.
- **The badge** is the number of items waiting (not snoozed), on the tab and at the end of the
  sidebar's Inbox row, like Review's. It's hidden at zero and reads "99+" above 99.
- An import shows as one row, so a thousand highlights don't bury this week's shares. It opens a
  list of its items, oldest first by their original date, with the same actions.
- **Laptop:** the same list in the centre column; `[ Send to lesson ]` and `⋯` show on hover and
  focus, like a section's `⠿`.

Add from clipboard reads the clipboard once, when tapped (the browser may ask first), and runs the
paste prompt below on what it finds. If the browser refuses: "Lamp couldn't read the clipboard.
Paste into the box instead."

**Empty:**

```text
│ [ Add a verse or a note…           ] │
│ [ Add from clipboard ]               │
│                                      │
│         Nothing waiting.             │
│                                      │
│   Verses you share to Lamp, paste    │
│   here or import land here until     │
│   you put them in a lesson.          │
│                                      │
```

- **Loading:** none; the inbox is read from the device.
- **Error:** a chip whose book isn't downloaded still shows the shared text (it is the snapshot).
  Storage full is the shared toast ([states.md](states.md#errors)), and the add box keeps what was
  typed.

## Share landing (M9-06)

Sharing to Lamp from another app opens `/share`. It works offline, from the precached shell. It
shows what was found and asks where it goes; nothing is added until a button is tapped.

```text
┌──────────────────────────────────────┐
│ ✕ Shared to Lamp                     │
├──────────────────────────────────────┤
│ FOUND                                │
│ ⟦John 10:11 · BSB⟧                   │  ← reference and translation recognised
│ I am the good shepherd. The good     │
│ shepherd lays down His life for the  │
│ sheep.                               │
│ from bible.com/bible/3034/JHN.10     │
│                                      │
│ [ Add to The Good Shepherd ]         │  ← only if that lesson was open in the
│ [ Add to inbox ]                     │     last 10 minutes; then it's the filled one
│ Add to another lesson…               │
└──────────────────────────────────────┘
```

- With no lesson open in the last 10 minutes, `[ Add to inbox ]` is the only button, and filled.
- **Add to The Good Shepherd** adds a section at the end of that lesson and opens it there, with
  "Added to The Good Shepherd. `[ Undo ]`".
- **Add to inbox** opens the Inbox with the item at the top, briefly highlighted, and "Added to
  your inbox. `[ Undo ]`".
- **Several references** in one share each become an item (or a section); each has a checkbox,
  ticked to start with:

```text
│ FOUND 3                              │
│ ☑ ⟦Romans 8:28 · shared⟧             │
│ ☑ ⟦Romans 8:38–39 · shared⟧          │
│ ☐ ⟦Psalm 23:1 · shared⟧              │
│ The rest of the text is kept as a    │
│ note on the first.                   │
│ [ Add 2 to inbox ]                   │
```

- **No reference found:** "No verse found. It's kept as a note." and the text below it, with the
  same buttons.
- **Loading:** if the verse matcher (M9-04) is still building, "Looking for verses…" shows after
  300 ms; the buttons work at once, and the item is matched when the matcher is ready.
- **Error:** an empty share (no text, no address): "Nothing came through. Try sharing again, or
  paste into the Inbox." `[ Go to inbox ]`.

## Paste prompt (M9-08, M9-09)

Pasting into a section, or into the Inbox's add box, pastes the text exactly as copied. If it holds
references or known verse text, a quiet prompt offers chips. Nothing changes until a tap.

```text
│ ┃ Paul says Romans 8:28 And we know  │
│ ┃ that God works all things together │
│ ┃ for the good…▏                     │
│ ┌──────────────────────────────────┐ │
│ │ Romans 8:28 · BSB                │ │  ← reference found, text matched
│ │ [ Make chip ]                 ✕  │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  B   I   •   1.   ❝   ↳ Reply   ⇤  ⇥ │
```

- **Make chip** replaces the reference, and the verse text that follows it, with
  `⟦Romans 8:28 · BSB⟧`; the rest stays as typed. Undo (Ctrl+Z, or the toolbar's) brings back the
  paste.
- **Several found:** "3 references found" `[ Make 3 chips ]` `[ Choose… ]` `✕`. Choose lists each
  with its own Make chip.
- **Verse text without a reference:** "This is John 3:16 (BSB)." `[ Make chip ]`; the match
  supplies the reference.
- **A reference with text from another translation** makes `⟦John 3:16 · pasted⟧`, keeping the
  text as pasted.
- The prompt sits where the autocomplete does: above the editing toolbar on a phone, under the
  pasted text on a laptop. It never takes focus. It goes on ✕, Esc, or once typing goes on
  elsewhere.
- Turned off in Settings → Editing:

```text
│ EDITING                              │
│ Offer verse chips when pasting [● ]  │  ← synced; on by default
```

- **Loading:** references are found at once. If the matcher is still building, the prompt offers
  the references it has, and verse text without one isn't matched this time.
- **Error:** none to show; if matching fails, the paste stays as it was and no prompt appears.

## "Open in…" (M9-10)

The chip sheet ([verses.md](verses.md#verse-chip-m2-10)) gains a row of targets. Each opens the
passage in a new tab, or in the installed app where the platform does that.

```text
┌──────────────────────────────────────┐
│ John 10:9                            │
│ Berean Standard Bible                │
│                                      │
│ I am the gate. If anyone enters      │
│ through Me, he will be saved. He     │
│ will come in and go out and find     │
│ pasture.                             │
│                                      │
│ [ Every note on John 10:9 › ]        │
│ [ Read as commentary › ]             │  ← M10-02
│ [ Read in context › ] [ Memorise ]   │
│                                      │
│ OPEN IN                              │
│ Blue Letter Bible                  ↗ │
│ YouVersion                         ↗ │
│ Bible Hub                          ↗ │
│ Logos                              ↗ │
└──────────────────────────────────────┘
```

- The link carries the translation where the target has it; a `shared` or `pasted` chip opens in
  the target's own default.
- Lamp keeps nothing from the target. Offline, the links still show; the target says if it can't
  load.
- Settings → Open in: each target with a switch and `⠿` (drag, or Move up and Move down in its
  menu). Synced.

```text
┌──────────────────────────────────────┐
│ ← Open in                            │
├──────────────────────────────────────┤
│ Shown in the verse sheet, in this    │
│ order.                               │
│                                      │
│ Blue Letter Bible        [● ]      ⠿ │
│ YouVersion               [● ]      ⠿ │
│ Bible Hub                [○ ]      ⠿ │  ← hidden
│ Logos                    [● ]      ⠿ │
└──────────────────────────────────────┘
```

- With every target off, the OPEN IN block goes from the sheet.
- **Loading:** none; the target table is bundled, and a newer one is fetched in the background.
- **Error:** a target table that fails to load leaves the last one in use, silently.

## YouVersion import (M9-11, M9-12)

Settings → Import, and the Inbox's `⋯`. It runs on the device, offline too; nothing is uploaded.

```text
│ IMPORT                               │
│ YouVersion highlights and notes      │
│ Download your data from YouVersion,  │
│ then choose the file here.           │
│ [ Choose file… ]                     │
```

While it runs (a progress bar with numbers, as in [states.md](states.md#loading)):

```text
│ IMPORT                               │
│ Importing from YouVersion…           │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░   412 of 1,030  │
│ You can keep working meanwhile.      │
│ [ Cancel ]                           │  ← adds nothing
```

Done, as a toast and in place:

```text
│ Imported 1,018 into your inbox.      │
│ 12 were already there and skipped.   │
│ [ Open inbox › ]                     │
```

- Each highlight or note is an item: its chip (the exported text, labelled with its version, or
  "shared" if it isn't BSB or KJV), the note, the original date and the highlight colour by name
  ("yellow").
- **Loading:** "Reading the file…" shows after 300 ms, until the total is known.
- **Error (malformed file):** an alert in place, and nothing is added:

```text
│ ┌──────────────────────────────────┐ │
│ │ ! This isn't a YouVersion export │ │
│ │ Lamp can read. Nothing was       │ │
│ │ imported. Choose the file from   │ │
│ │ YouVersion's data download.      │ │
│ └──────────────────────────────────┘ │
```

- **Nothing new** (a second import): "Nothing new: all 1,030 were already imported."

**Dismiss an import (M9-12).** The import's row in the Inbox opens its items; its `⋯` has "Dismiss
all from this import…". It asks first, since it removes many:

```text
┌──────────────────────────────────────┐
│ Dismiss 980 items from the           │
│ YouVersion import of Tue 14 Oct?     │
│                                      │
│ Items you've already put in a lesson │
│ stay there. Other items aren't       │
│ touched.                             │
│                                      │
│        [ Cancel ] [ Dismiss all 980 ]│  ← focus starts on Cancel
└──────────────────────────────────────┘
```
