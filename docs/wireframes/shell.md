# Wireframes — app shell and settings

Low-fi layouts for M2-02, M2-03 and M2-11, and the shell's v2 changes (the Inbox tab, M9-02; the
new Settings sections, M9–M13). They show what is on each screen and where; colours, type
and exact spacing come from the components and the theme. Rules that apply everywhere are in
[UX-PATTERNS.md](../UX-PATTERNS.md).

Legend: `[ Button ]` · `[ field____ ]` · `( A | B )` segmented control · `[○ ]` / `[● ]` switch off / on ·
`›` opens a screen · `⋯` / `⋮` menu · `◌` sync status · `≡` settings · `⟦John 10:9 · BSB⟧` verse chip ·
`▏` cursor · `⟨→ The Good Shepherd⟩` link chip · `⟨⊘ The Good Shepherd · deleted⟩` broken link chip ·
`☐` / `☑` checkbox · `▒` skeleton · `Inbox⁴` a count badge in a one-line bar.

## App shell (M2-02, M9-02)

**Phone, under 1024 px.** A header with the screen title, the sync status and settings; a bottom bar
with the five destinations: Lessons, Inbox, Read, Search, Review (Inbox joined in v2, decided
2026-10-17). Each tab is 72 px wide at 360 px, its icon above its label. The bar hides while the
on-screen keyboard is open.

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
│   ▤      ✉ 4     ▢      ⌕      ✓ 3   │  ← bottom bar, 56 px + safe area
│ Lessons  Inbox   Read  Search  Review│  ← Inbox and Review show count badges
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
│ ✉ Inbox    4  │   ┌──────────────────────────────────────────┐               │
│ ▢ Read        │   │                                          │               │
│ ⌕ Search   /  │   │       content, max 42 rem, centred       │               │
│ ✓ Review   3  │   │                                          │               │
│               │   └──────────────────────────────────────────┘               │
│ SERIES        │                                                              │
│ Romans        │                                                              │
│ John          │                                                              │
│ + New series  │                                                              │
│               │                                                              │
│ GROUPS        │                                                              │  ← M13-07; only once in a group
│ Thursday  2   │                                                              │
│               │                                                              │
│ ◌ Synced      │                                                              │
│ ≡ Settings    │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- `/` focuses search from anywhere except a text field. `n` starts a new lesson.
- The current destination is marked in the bar or sidebar (`aria-current="page"`).
- **Badges:** Inbox counts the items waiting (not snoozed); Review counts open questions and verses
  due. Each is a small filled number on the icon, and at the end of the sidebar row; hidden at zero,
  "99+" above 99. Screen readers hear "Inbox, 4 waiting".
- The M2–M6 wireframes in the other files still draw the four-tab bar in its one-line form; read
  it as the five tabs above.

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
│ Mode         ( Light | Dark | Auto ) │  ← the only appearance setting
│                                      │
│ BIBLE                                │
│ Translation            ( BSB | KJV ) │
│ Berean Standard Bible     3.9 MB  ✓  │
│ King James Version      [ Download ] │
│ Show verse text in notes      [● ]   │  ← wireframes/verses.md
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
│ Bible text: the BSB › and the KJV,   │
│ both public domain                   │
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

## Settings in v2 (M9–M13)

New sections join the page, between Bible and Review unless noted. Each is drawn with its screen.

```text
│ EDITING                              │
│ Offer verse chips when pasting [● ]  │  ← interop.md (M9-09)
│ Open in                          4 › │  ← interop.md (M9-10)
│ Templates                          › │  ← thinking.md (M10-13, M10-14)
│                                      │
│ REVIEW                               │
│ …                                    │
│ Bring back: a year ago, repeated     │  ← reflection.md (M12-01)
│ verses, stale questions              │
│                                      │
│ IMPORT                               │
│ YouVersion highlights and notes    › │  ← interop.md (M9-11)
│                                      │
│ SHARING                              │  ← signed in only
│ Shared links                     3 › │  ← sharing.md (M13-04)
│ Weekly email of group activity [○ ]  │  ← sharing.md (M13-12); once in a group
│                                      │
│ ABOUT                                │
│ …                                    │
│ User guide                         › │  ← M13-05: in the app, so they read offline
│ Privacy                            › │
```

The privacy note (`/privacy`) and the user guide (`/guide`) are pages in the app, under About, for
guests too (built 2026-10-19, M13-05; Shared links stayed under Account, where M13-04 put it). The
note names the server it came from and `privacy@` its host. Delete account is at the very end, for
an account (M3-03's dialog, built with the note).

## Appearance (M2-03, M2-15)

One theme, Lamplight, in light and dark (TECH-DESIGN §8.5), so Appearance holds only the mode.
There is no Theme row and no sheet (the theme picker, its looks and presets were removed on
2026-10-16). A tap applies the mode at once; there is no Save.

```text
│ APPEARANCE                           │
│ Mode         ( Light | Dark | Auto ) │
│                                      │
```

- **Auto** (`system`, the default) follows the device, and changes with it while the app is open.
- The control is three native radios in one group (a segmented control): arrow keys move
  between them. The same control is on the first-run welcome (lessons.md).
- The mode is synced and applies before the first paint, so a reload never flashes the other one.

## Bible download (M2-11)

The active translation downloads in the background after the first load, and another one when
it's asked for in Settings. Nothing waits for it, except opening a chapter that isn't stored yet.

While a translation downloads, a ring that fills as books arrive shows beside the sync status:
with "45/66" in the phone's top bar (the ring alone under 380 px, so the screen's title stays
whole), and with "Bible 45/66" above it at the foot of the laptop's sidebar. Like any
loading state it shows only after 300 ms, so a check that finds every book stored never flashes
it. It opens Settings, and it's gone once the download is done or paused (Settings says why).

```text
├──────────────────────────────────────┤
│ Lessons           ◔ 45/66  ◌ Synced ⚙│
├──────────────────────────────────────┤
```

Settings shows the same progress for each translation:

```text
│ BIBLE                                │
│ Berean Standard Bible                │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  45 of 66 books │
```

```text
│ BIBLE                                │
│ Berean Standard Bible                │
│ Download paused: no connection. It   │
│ continues when you're online.        │
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
│ Lessons  Inbox   Read  Search  Review│
```

"Update required" (the server refuses this version, §6.6) is a sync state, shown in
[sync.md](sync.md).

## Install prompt

When the app loads in a browser that can install it, a toast offers to. It stays until it's used,
and it's put away while something is being typed. On a new device it waits until the welcome is
done, so it doesn't cover Continue. In Chrome, Edge and Android, Install opens the
browser's own dialog. On an iPhone or iPad, which have no install dialog, it says how to add Lamp
from the Share menu. "Not now" (or OK, or declining the browser's dialog) puts it off for 14 days
on this device. The installed app never shows it.

```text
├──────────────────────────────────────┤
│ Install Lamp to open it from your    │
│ home screen and use it offline.      │
│              [ Not now ] [ Install ] │
├──────────────────────────────────────┤
│ Lessons  Inbox   Read  Search  Review│
```
