# Wireframes — app shell and settings

Low-fi layouts for M2-02, M2-03 and M2-11. They show what is on each screen and where; colours, type
and exact spacing come from the components and the presets. Rules that apply everywhere are in
[UX-PATTERNS.md](../UX-PATTERNS.md).

Legend: `[ Button ]` · `[ field____ ]` · `( A | B )` segmented control · `[○ ]` / `[● ]` switch off / on ·
`›` opens a screen · `⋯` / `⋮` menu · `◌` sync status · `≡` settings · `⟦John 10:9 · WEB⟧` verse chip ·
`▏` cursor.

## App shell (M2-02)

**Phone, under 1024 px.** A header with the screen title, the sync status and settings; a bottom bar
with the four destinations. The bar hides while the on-screen keyboard is open.

```text
┌──────────────────────────────────────┐
│ Lessons                  ◌ Synced  ≡ │  ← title · sync status (taps open the sync panel) · settings
├──────────────────────────────────────┤
│                                      │
│                                      │
│            screen content            │
│      one column, 16 px side margin   │
│                                      │
│                                      │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│  ← bottom bar, 56 px + safe area; Review shows a count badge
└──────────────────────────────────────┘
```

**Laptop, 1024 px and wider.** A sidebar with the same destinations, the series list, the sync
status and settings. Content is centred with a maximum width of 42 rem (about 70 characters of note
text). Screens that have a side panel (the lesson) use the space to the right.

```text
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ Lamp          │                                                              │
│               │   Screen title                                         ⋯     │
│ ▤ Lessons     │                                                              │
│ ▢ Read        │   ┌──────────────────────────────────────────┐               │
│ ⌕ Search   /  │   │                                          │               │
│ ✓ Review   3  │   │       content, max 42 rem, centred       │               │
│               │   │                                          │               │
│ SERIES        │   └──────────────────────────────────────────┘               │
│ Romans        │                                                              │
│ John          │                                                              │
│ + New series  │                                                              │
│               │                                                              │
│ ◌ Synced      │                                                              │
│ ≡ Settings    │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- `/` focuses search from anywhere except a text field. `n` starts a new lesson.
- The current destination is marked in the bar or sidebar (`aria-current="page"`).

## Settings (M2-02)

One scrolling page in sections. A guest sees the account section as an invitation, never as a
blocker.

```text
┌──────────────────────────────────────┐
│ ← Settings                           │
├──────────────────────────────────────┤
│ ACCOUNT                              │
│ Your notes are only on this device.  │
│ Sign up to back them up and sync     │
│ them to your other devices.          │
│ [ Sign up ]  [ Sign in ]             │
│                                      │
│ APPEARANCE                           │
│ Theme                    Parchment › │
│ Mode       ( Light | Dark | System ) │
│                                      │
│ BIBLE                                │
│ World English Bible       4.1 MB  ✓  │
│                                      │
│ REVIEW                               │
│ Keep takeaways in review  [ 14 ] days│
│ Weekly reminder               [○ ]   │
│                                      │
│ STORAGE                              │
│ 6.2 MB used · kept by the browser ✓  │
│ [ Remove notes from this device… ]   │  ← signed out only (M3-10)
│                                      │
│ ABOUT                                │
│ Lamp 1.0.0 · MIT licence · Source ›  │
│ WEB text: public domain, eBible.org ›│
└──────────────────────────────────────┘
```

Signed in, the account section becomes (M3-03, M3-12):

```text
│ ACCOUNT                              │
│ a•••@example.com · verified          │
│ Devices                    2 devices │
│ Change password                    › │
│ [ Sign out ]                         │
│ ...                                  │
│ Delete account…                      │  ← at the very end, in the destructive colour
```

## Theme picker (M2-03)

A bottom sheet over Settings, opened from the Theme row (decided 2026-10-13). On a laptop it's
the same sheet, centred and no wider than the column. It closes with Esc, a tap outside or ×.
Each card is drawn in its own preset (`data-theme` on the card) in the current mode, so the choice
is visible before it's made. A tap applies it at once; there is no Save.

```text
│ Settings (dimmed)                    │
╭──────────────────────────────────────╮
│ Theme                              × │
│                                      │
│ Mode       ( Light | Dark | System ) │
│                                      │
│ ┌────────────────┐ ┌────────────────┐│
│ │ Aa  Grace ▬▬   │ │ Aa  Grace ▬▬   ││  ← sample text, a badge, a button
│ │ Parchment    ✓ │ │ Vellum         ││
│ └────────────────┘ └────────────────┘│
│ ┌────────────────┐ ┌────────────────┐│
│ │ Olive          │ │ Slate          ││
│ └────────────────┘ └────────────────┘│
│ ┌────────────────┐ ┌────────────────┐│
│ │ Cedar          │ │ Midnight       ││
│ └────────────────┘ └────────────────┘│
│                                      │
│ Midnight is made for dark mode.      │  ← only with Midnight in light mode
│ [ Use dark mode ]                    │
└──────────────────────────────────────┘  ← scrolls inside the sheet past 85 % of the screen
```

The cards are a radio group: arrow keys move, the selected card has `aria-checked`.

## Bible download (M2-11)

WEB downloads in the background after the first load. Settings shows the progress; nothing else
waits for it, except opening a chapter that isn't stored yet.

```text
│ BIBLE                                │
│ World English Bible                  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  45 of 66 books │
```

```text
│ BIBLE                                │
│ World English Bible                  │
│ ! Download paused: no connection.    │
│ It continues when you're online.     │
```

Once every book is stored, the row shows its size and ✓, as in Settings above. A browser that
can't keep files for offline use (not a secure context) says "This browser can't keep it for
offline use; books load as they're opened." The storage row says "kept by the browser" once
`storage.persist()` is granted, otherwise "the browser may clear it if the device runs low on
space".

In the reader, a book that hasn't arrived yet shows the loading state from
[states.md](states.md#loading).

## Update prompt (M2-11)

A new version waits until the user agrees. The prompt is a toast that stays until it's used or
dismissed, and it never appears while an editor has focus or a push is running.

```text
├──────────────────────────────────────┤
│ A new version of Lamp is ready.      │
│                 [ Later ] [ Reload ] │
├──────────────────────────────────────┤
│ ▤ Lessons  ▢ Read  ⌕ Search  ✓ Review│
```

"Update required" (the server refuses this version, §6.6) is a sync state, shown in
[sync.md](sync.md).
