# Wireframes — share links and groups

Low-fi layouts for M13 (F34, F35). Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md). Everything here talks to the server: it needs an account and a
connection, and says so ([offline and sync](../UX-PATTERNS.md#offline-and-sync)).

## Share link (M13-04)

"Share link…" in the `⋯` of a lesson, a series and a commentary, and in the export dialog (for the
handout too). One link per target.

```text
┌──────────────────────────────────────┐
│ Share "The Good Shepherd"         ✕  │
├──────────────────────────────────────┤
│ Anyone with the link can read this   │
│ lesson. They can't edit or comment,  │
│ and they don't need an account. Your │
│ other notes stay private.            │
│                                      │
│ Expires  ( Never | 7 days | 30 days )│
│          Pick a date…                │
│                                      │
│ [ Create link ]                      │
└──────────────────────────────────────┘
```

A commentary adds a choice, frozen by default:

```text
│ Keeps    ( As it is now | Up to date)│  ← frozen at creation, or live
│ As it is now: later notes on         │
│ Romans 8 won't show.                 │
```

Once made:

```text
┌──────────────────────────────────────┐
│ Share "The Good Shepherd"         ✕  │
├──────────────────────────────────────┤
│ [ lamp.example/s/k3J9…qT   ][ Copy ] │
│ Created Fri 17 Oct · never opened    │
│ Expires Sun 16 Nov                   │
│                                      │
│ [ Share… ]           Revoke link…    │  ← Share… is the device's share sheet
└──────────────────────────────────────┘
```

- Copy confirms with "Link copied."
- **Revoke** asks, since a new link would be a different address: "Revoke the link to The Good
  Shepherd? Anyone who has it can't open it any more." `[ Cancel ] [ Revoke link ]`.
- **Guest:** "Sign in to share a link. Your notes are on this device only, so there's nothing for
  a link to show." `[ Sign in ]`.
- **Offline:** the button is disabled, with "Needs a connection" above it.
- **Loading:** `[ Creating link… ]`, disabled, the same size.
- **Error:** the failed-action alert: "Couldn't make the link. Check the connection and try again.
  Nothing was shared."
- A lesson must have synced for its link to show the latest text; if changes are waiting, the
  dialog says "2 changes haven't synced yet; the link shows them once they have."

## Shared links in Settings (M13-04)

Settings → Shared links lists every link, newest first.

```text
┌──────────────────────────────────────┐
│ ← Shared links                       │
├──────────────────────────────────────┤
│ LESSON · The Good Shepherd           │
│ Created Fri 17 Oct · opened 2 h ago  │
│ Expires Sun 16 Nov                   │
│ [ Copy ]                    Revoke…  │
│ ──────────────────────────────────── │
│ COMMENTARY · Romans 8 · as of 17 Oct │  ← frozen; "up to date" for live
│ Created Fri 17 Oct · never opened    │
│ Never expires                        │
│ [ Copy ]                    Revoke…  │
│ ──────────────────────────────────── │
│ SERIES · John                        │
│ Expired Wed 1 Oct                    │  ← muted
│                             Remove   │
└──────────────────────────────────────┘
```

- An expired link stays listed, muted, until removed; a revoked one leaves the list.
- **Empty:** "No shared links. Make one from a lesson's, a series' or a commentary's ⋯."
- **Loading:** skeleton rows after 300 ms (the list is on the server).
- **Error (offline):** "The list needs a connection.", as Devices does.

## Shared page (M13-02, M13-03)

What someone with the link sees, in any browser, signed out: one read-only page in Lamplight,
light or dark following their device. No navigation, no editing, no comments, no account prompt.

```text
┌──────────────────────────────────────┐
│ Lamp                                 │  ← small wordmark, not a link to sign up
├──────────────────────────────────────┤
│ The Good Shepherd                    │
│ Sunday 12 October 2026 · Sermon      │
│ Pastor Ann, Grace Chapel             │
│ John 10:1–18                         │
│                                      │
│ Jesus is the door (John 10:9, BSB):  │
│ salvation and pasture.               │
│ ▏JOHN 10:9 · BSB                     │  ← verse text quoted, as in the notes
│ ▏I am the gate. If anyone enters     │
│ ▏through Me, he will be saved…       │
│                                      │
│   Compare Psalm 23:1 (BSB): the same │
│   shepherd.                          │
│                                      │
│ Takeaways                            │
│ • He knows his sheep by name.        │
│                                      │
│ Questions                            │
│ ○ Who are the "other sheep"?         │
│                                      │
│ ──────────────────────────────────── │
│ Shared from Lamp. Scripture: Berean  │
│ Standard Bible (public domain).      │
└──────────────────────────────────────┘
```

- **Laptop:** the same column, centred, 42 rem wide.
- A link chip to something the link doesn't cover shows its title as plain text, not a link.
- **Series:** the series' title and description, then its lessons in date order, each opening its
  own page under the same link.
- **Commentary:** as the app's ([thinking.md](thinking.md#commentary-m10-01-to-m10-04)), with
  bylines as plain text, and "As of Friday 17 October 2026" under the title when frozen.
- **Handout:** the handout page, with its Print button.
- **Not found** (revoked, expired or mistyped; the server answers `404` for all three):

```text
│                                      │
│  This link doesn't work any more.    │
│                                      │
│  It may have expired or been turned  │
│  off. Ask the person who shared it   │
│  for a new one.                      │
│                                      │
```

- **Loading:** none; the server sends the page whole.
- **Empty:** a lesson with nothing in it shows its title and details alone.

## Groups (M13-07)

A group studies one or more series together. Groups are listed on the Lessons home under SERIES,
and in the sidebar under SERIES, with a count of what's new (M13-11). A guest sees no GROUPS
section; an account with none sees "Study a series with others: they see its lessons and what's
added to the group's thread." under `+ New`.

```text
│ SERIES                       + New   │
│ John · 3 lessons                   › │
│                                      │
│ GROUPS                       + New   │
│ Thursday group · 4 members   2 new › │
```

**Create** (from GROUPS `+ New`, or a series' `⋯` → "Study with a group…"):

```text
┌──────────────────────────────────────┐
│ New group                         ✕  │
├──────────────────────────────────────┤
│ Name     [ Thursday group        ]   │
│ Series   [ John                ▾ ]   │
│ Your name in this group              │
│          [ Ann                   ]   │  ← what members see; never the email
│                                      │
│ Members will see the lessons in John │
│ and what's added to their group      │
│ thread. Your own notes stay private. │
│                                      │
│              [ Cancel ] [ Create ]   │
└──────────────────────────────────────┘
```

**The group page:**

```text
┌──────────────────────────────────────┐
│ ← Thursday group                   ⋯ │  ← ⋯: Rename, Add a series…, Leave group…
├──────────────────────────────────────┤
│ John · 3 lessons                   › │
│                                      │
│ [ Invite people ]                    │
│                                      │
│ ACTIVITY · 2 new                     │  ← in-app notifications (M13-11)
│ Ben replied to your section in       │
│ The Good Shepherd · 2 h ago        › │
│ Cara asked "Why a gate, not a        │
│ door?" in Lazarus · yesterday      › │
│                                      │
│ Questions · 5 open                 › │  ← the group queue (M13-10)
│ Members · 4                        › │
└──────────────────────────────────────┘
```

**Invite** (the owner only; members don't see the button) shows the link to copy or share:

```text
│ Anyone with this link can join       │
│ Thursday group.                      │
│ [ lamp.example/j/8fQ…   ][ Copy ]    │
│ [ Share… ]           Make a new link…│  ← the old one stops working; asks first
```

**Join** (`/join?token=…`, opened from the link; a query, so logs and error reports never hold
the token):

```text
┌──────────────────────────────────────┐
│ Join Thursday group?                 │
├──────────────────────────────────────┤
│ Ann invited you to study John        │
│ together. Members see what you add   │
│ to the group thread, and your        │
│ comments. Your own notes stay yours. │
│                                      │
│ Your name in this group              │
│ [ Ben                            ]   │
│                                      │
│ [ Join group ]                       │
└──────────────────────────────────────┘
```

- Signed out, the button is `[ Sign in to join ]` with "New to Lamp? Sign up" under it; after
  signing in it comes back here.
- A link that was replaced or the group is gone: "This invite doesn't work any more. Ask for a new
  link."
- Joining needs a connection, and says so.

**Members:**

```text
┌──────────────────────────────────────┐
│ ← Members                            │
├──────────────────────────────────────┤
│ Ann · owner                          │
│ Ben · member                       ⋮ │  ← owner only: Make owner…, Remove…
│ Cara · member                      ⋮ │
│ You · member                         │
│                                      │
│ [ Leave group… ]                     │
└──────────────────────────────────────┘
```

- **Remove** asks: "Remove Ben from Thursday group? Ben loses access on their next sync. What
  they added to the group goes back to their own notes, and their comments are deleted."
  `[ Cancel ] [ Remove Ben ]` (decision 98, TECH-DESIGN §17.12).
- **Make owner** asks: "Make Ben the owner of Thursday group? You'll be a member." `[ Make owner ]`.
- **Leave** asks: "Leave Thursday group? What you added to it goes back to your own notes, and
  your comments are deleted." The owner can't leave until they make someone else owner, and the
  dialog says so; the last member leaving deletes the group, and the dialog says that instead.
- **Loading:** skeleton rows after 300 ms. **Error (offline):** "Members need a connection."

## Lesson in a group: public and private threads (M13-08)

A lesson in a shared series has two threads: the group's, which every member sees, and the user's
own, which never leaves them. A switch under the details chooses which one is shown.

```text
┌──────────────────────────────────────┐
│ ←                          ✓       ⋯ │
├──────────────────────────────────────┤
│ The Good Shepherd                    │
│ Sun 12 Oct · Group · Thursday group  │
│ ( Group thread | My notes )          │
│                                      │
│ ┃ ANN · Sun 12 Oct                   │  ← author and date on every group section
│ ┃ The door is the only way in.       │
│ ┃ ⟦John 10:9 · BSB⟧                  │
│ ┃ 2 comments                       › │
│                                      │
│ ┃ YOU · Mon 13 Oct                   │
│ ┃ Compare ⟦Psalm 23:1 · BSB⟧.      ⠿ │  ← only your own sections have ⠿
│ ┃ No comments · Comment            › │
│                                      │
│ ┃ Add to the group thread…           │  ← new sections here are public
│                                      │
│ QUESTIONS · GROUP             + Add  │
│ ○ Who are the "other sheep"? · Cara  │
├──────────────────────────────────────┤
│ Lessons  Inbox   Read  Search  Review│
└──────────────────────────────────────┘
```

- "My notes" is the ordinary lesson, private. The empty section there reads "Write a note…" and the
  group's reads "Add to the group thread…", so it's clear where typing goes.
- Other members' sections are read-only. A member's own group sections edit as usual; their `⠿`
  menu adds "Move to my notes", and a private section's adds "Share with the group".
- **Laptop:** the same switch above the centre column; the side panel holds details, group
  questions and "Linked from".
- **Empty (group thread):** "Nothing in the group thread yet. What you add here, the group sees."
- As built (M13-08): every section's `⋯` has Reply; one's own adds Move to my notes and Delete
  (with Undo). A member's "My notes" is a lesson of their own for the group lesson, made the first
  time they touch it, and off their Lessons home while they're in the group.
- **Offline:** both threads work; group sections wait to sync, and others' arrive when online.

## Comments (M13-09)

Only on group sections. "2 comments ›" opens them under the section.

```text
│ ┃ The door is the only way in.       │
│ ┃ 2 comments                       ⌃ │
│ ┃   Ben · Sun 12 Oct                 │
│ ┃   Like the sheepfold walls.        │
│ ┃   You · Mon 13 Oct               ⋮ │  ← ⋮: Edit, Delete (your own only)
│ ┃   And Psalm 118:20.                │
│ ┃   [ Add a comment…▏            ]   │
```

- Comments are plain text with verse chips. Enter posts; Shift+Enter is a new line. They're typed
  in a plain box, and the references in them become chips when posted (decision 101).
- Deleting one's own comment happens at once, with Undo.
- **Empty:** "No comments yet." with the field.

## Group questions (M13-10)

Open questions across the group's series, with who asked and who answered.

```text
┌──────────────────────────────────────┐
│ ← Questions · Thursday group         │
├──────────────────────────────────────┤
│ ( Open 5 | Answered 3 )              │
│                                      │
│ ○ Who are the "other sheep"?         │
│   Cara · The Good Shepherd · 12 Oct  │
│   [ Answer ]                       › │
│ ──────────────────────────────────── │
│ ◐ Why a gate, not a door?            │
│   Ben · Lazarus · 19 Oct             │
│   Partly answered by Ann             │
│   [ Answer ]                       › │
│ ──────────────────────────────────── │
│ …                                    │
└──────────────────────────────────────┘
```

- **Answer** opens the lesson's group thread with a new section headed with the question.
- Answered rows say "Answered by Ann · Tue 14 Oct".
- A question is answered once a member's answer in the thread has text below its heading;
  partial answers only make it "Partly answered", still under Open (decision 102).
- **Empty:** "No open questions in the group. Questions members add to a group thread show here."

## Notifications (M13-11, M13-12)

In-app only: the group's ACTIVITY list (above) and the count on its row. Replies to your sections,
comments on them, and new questions. Opening the group marks them seen. There's no bell and no new
tab.

Email digests are off by default, in Settings → Groups:

```text
│ GROUPS                               │
│ Weekly email of group activity [○ ]  │
│ Sent on Mondays when there's         │
│ something new. Each email has a link │
│ to stop them.                        │
```

- **Empty (activity):** "Nothing new. Replies and new questions in Thursday group show here."

*Built (M13-11, M13-12, 2026-10-19):* ACTIVITY lists every new row and at least ten in all, latest
first: "Ben replied to your section in The Good Shepherd · 2 h ago", "Ben commented on your section
in …", "Cara asked "Why a gate?" in …", each opening the lesson's group thread. New rows have a dot
and stay marked while the page is open; the heading says "Activity · 2 new". "2 new" is on the
group's row on the Lessons home and in the sidebar until the group is opened. What's new is what
reached the group after the last visit on any device (decision 106). The switch needs a verified
email and a connection, and says so in its line. The email lists the same rows for the week, per
group, with a link to each group and "Stop these emails" (decisions 103–105); the link opens
`/unsubscribe`, which asks "Stop the weekly email of group activity?" with [ Stop the emails ], then
"You won't get the weekly email of group activity any more. To get it again, turn it on in Settings
→ Groups."; a broken link says "This link doesn't work. Turn the email off in Settings → Groups."
