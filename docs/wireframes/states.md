# Wireframes — empty, loading and error states

Shared states for every M2–M6 screen. The rules behind them are in
[UX-PATTERNS.md](../UX-PATTERNS.md#empty-loading-and-error-states); each screen's own empty state is
also drawn on its wireframe.

## Empty

One sentence on what will appear here, one on how it gets there, and at most one action.

```text
│                                      │
│      No lessons in this series yet.  │
│                                      │
│   Add one here, or move a lesson in  │
│   from its ⋯ menu.                   │
│                                      │
│        [ + New lesson in John ]      │
│                                      │
```

| Screen | Text | Action |
|---|---|---|
| Lessons home (first run) | Your notes start here. Capture a sermon or a study… | New lesson |
| Series | No lessons in this series yet. | New lesson in *series* |
| Lesson, no sections | (the empty first section, focused: "Write a note…") | — |
| Takeaways / questions | Nothing yet. A takeaway is one line you want to remember. | + Add |
| Tag page | No notes tagged #*tag* yet. | — |
| Search, no results | Nothing matches "*query*"… | — |
| Verse index | Nothing cites *passage* yet. | Read *passage* |
| Review | All caught up. | — |
| Memory verses | No memory verses yet. Add one from a verse chip or the reader. | Open the Bible |
| Devices (offline) | The list needs a connection. | — |

## Loading

Local data (lessons, notes, tags, the verse index) is read from the device and appears at once, so
these screens never show a spinner. Loading states exist only for work that can take time, and they
appear only after 300 ms.

Skeleton rows, for a list that is still being built (search index, a chapter the reader is still
fetching):

```text
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒             │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒    │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                     │
```

A progress bar with numbers, when the total is known (first sync, Bible download, backing up after
verification):

```text
│ Getting your notes…                  │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░  1,240 of 3,000  │
│ You can keep working meanwhile.      │
```

A button that waits on the server (sign in, change password) shows its own progress and stays the
same size: `[ Signing in… ]`, disabled.

A chapter whose book hasn't downloaded yet, offline:

```text
│ ‹      Obadiah 1 ▾     WEB         › │
├──────────────────────────────────────┤
│                                      │
│  Obadiah hasn't downloaded yet.      │
│  It will be here once you're online. │
│                                      │
```

## Errors

**A field:** the message sits under the field, in the destructive colour, and the field is marked
`aria-invalid`. Typed values are never cleared.

```text
│ Password                             │
│ [ ••••••                      Show ] │  ← red border
│ At least 10 characters.              │  ← destructive colour
```

**A failed server action** (network gone mid-request, server error): an alert above the form, with
what to do.

```text
│ ┌──────────────────────────────────┐ │
│ │ ! Couldn't reach the server.     │ │
│ │ Check the connection and try     │ │
│ │ again. Nothing was changed.      │ │
│ └──────────────────────────────────┘ │
```

**A crash** (the error boundary): the screen is replaced, the navigation stays. Notes are safe,
because every edit was already saved on the device.

```text
┌──────────────────────────────────────┐
│ Lessons                  ◌ Synced  ≡ │
├──────────────────────────────────────┤
│                                      │
│  Something went wrong on this screen.│
│                                      │
│  Your notes are safe on this device. │
│                                      │
│  [ Reload ]  [ Copy error details ]  │
│                                      │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
└──────────────────────────────────────┘
```

**Storage full** (the browser refuses a write): a toast that stays until dismissed: "This device is
out of space for Lamp. Your last change wasn't saved. Free some space, then try again." The editor
keeps the unsaved text on screen.

**Not found** (a link to a lesson that was deleted, or a bad URL): "This lesson doesn't exist on
this device. It may have been deleted, or not synced here yet." `[ Go to lessons ]`.
