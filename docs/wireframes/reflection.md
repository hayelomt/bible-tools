# Wireframes — resurfacing, theme map, digest and handout

Low-fi layouts for M12 (F30–F33). Legend and shared rules: [shell.md](shell.md),
[UX-PATTERNS.md](../UX-PATTERNS.md).

## Resurfaced in Review (M12-01, M12-02)

Review ([review.md](review.md#review-queue-m6-03)) gains a block after the open questions: old
material brought back by three rules. It's quiet: it doesn't add to the tab's count.

```text
┌──────────────────────────────────────┐
│ Review                   ◌ Synced  ≡ │
├──────────────────────────────────────┤
│ MEMORY VERSES · 2 due     [ Start › ]│
│ John 10:27 · Romans 8:28             │
│                                      │
│ OPEN QUESTIONS · 3                   │
│ …                                    │
│                                      │
│ BACK AGAIN                           │
│ A YEAR AGO · Sun 13 Oct 2025         │
│ Light of the world                 ⋮ │  ← ⋮: Dismiss for a year
│ John 8:12 · 7 sections             › │
│ ──────────────────────────────────── │
│ REPEATED VERSE · Romans 8:28         │
│ In 4 lessons; not read as a          │
│ commentary since April.            ⋮ │
│ [ Read as commentary › ]             │
│ ──────────────────────────────────── │
│ STALE QUESTION · open 4 months       │
│ Why did Jesus wait two days?       ⋮ │
│ Asked 2 times since June             │  ← lineage summary (M10-11)
│ [ Answer ] [ Park ] [ Thread › ]     │
│                                      │
│ TAKEAWAYS · last 14 days             │
│ …                                    │
├──────────────────────────────────────┤
│ Lessons  Inbox   Read  Search  Review│
└──────────────────────────────────────┘
```

- **A year ago:** lessons and questions from the same week in earlier years; the row opens the
  lesson (or the question's thread).
- **Repeated verse:** a verse cited in three or more lessons whose commentary hasn't been opened in
  six months. Opening the commentary takes it out.
- **Stale question:** open for more than 90 days. It shows here instead of in Open questions, so
  it's never listed twice.
- **Dismiss for a year** happens at once, on every device: "Hidden until Oct 2027. `[ Undo ]`".
- At most five rows, a year ago first; `[ Show all 8 ]` for more.
- Settings → Review turns each rule off (synced):

```text
│ REVIEW                               │
│ Takeaways from the last              │
│ ( 7 | 14 | 30 | 90 days )            │
│ Bring back                           │
│ A year ago                    [● ]   │
│ Repeated verses               [● ]   │
│ Stale questions               [● ]   │
│ Weekly reminder               [○ ]   │
```

- **Empty:** the block isn't shown; "All caught up." still covers the rest.
- **Loading:** none; the rules run on the device.

## Theme map (M12-03, M12-04, M12-10)

From the foot of Review, "Theme map ›", and from a tag page's `⋯`. Two heat grids from local data;
it works offline.

**Phone, by month.** Each tag is one row of 24 small cells, oldest month on the left. The row is
the touch target, so the cells can stay small enough for 24 months to fit at 360 px.

```text
┌──────────────────────────────────────┐
│ ← Theme map                          │
├──────────────────────────────────────┤
│ ( By month | By book )               │
│ Last 24 months · 12 of 31 tags       │
│                                      │
│          Nov 2024          Oct 2026  │
│ grace    ··░░▒·░▓▓▒░·░▒▒▓█▓▒░▒▓▒░  › │
│ hope     ░···░▒▒░···░░·▒▒░···░▒▓▓  › │
│ prayer   ▒▓▒░░···░▒░···░░▒▒▒░░··░  › │
│ fear     ···········░▓█▓░········  › │
│ …                                    │
│ [ Show all 31 tags ]                 │
│                                      │
│ · none  ░ 1–2  ▒ 3–5  ▓ 6–9  █ 10+   │  ← the scale, with numbers
└──────────────────────────────────────┘
```

A row opens the tag's months as a list with counts ("Mar 2026 · 4 sections ›"); a month opens its
sections, as the tag page does.

**Phone, by book.** Each tag is a strip of the 39 Old Testament books, then the 27 New Testament
books, in canonical order. A book with no notes is a plain dot.

```text
│ ( By month | By book )               │
│ All 66 books · 12 of 31 tags         │
│                                      │
│ grace                           42 › │
│ OT  ·····░·······░·▒···▒·········░·· │
│ NT  ▓▒░▓█▒░·░▒··▒··▒▓▒····░░·        │
│ hope                            19 › │
│ OT  ·········░·····▓▒··▒█····░······ │
│ NT  ░·░·▒░··········░··░▒··          │
```

A row opens the tag's books with counts, every one of the 66, "no notes" for the plain ones.

**Laptop.** The full grid: tags down, months (or the 66 books, by abbreviation) across, and each
cell can be clicked to open its sections.

```text
┌──────────┬──────────────────────────────────────────────────────────────────────┐
│ sidebar  │ Theme map                ( By month | By book )                      │
│          │                                                                      │
│          │           Gen Exo … Psa Pro … Isa … Mat Mrk Luk Jhn Act Rom … Rev    │
│          │ grace      ·   ·     ░   ·     ▒     ░   ·   ▒   ▓   ░   █     ·     │
│          │ hope       ·   ·     ▓   ░     █     ·   ·   ░   ▒   ·   ▓     ░     │
│          │ prayer     ░   ·     █   ▒     ·     ▓   ░   ▒   ▒   ░   ░     ·     │
│          │                                                                      │
│          │ · none  ░ 1–2  ▒ 3–5  ▓ 6–9  █ 10+                                   │
└──────────┴──────────────────────────────────────────────────────────────────────┘
```

- The colours are a scale of theme tokens, readable in light and dark (M12-10). The pattern of
  cells is never the only signal: each cell or row has its count in its name ("grace, March 2026,
  4 sections"), and the grid is a table to screen readers.
- Tags are ordered by how often they're used. A tag with no sections in the period isn't shown.
- **Empty:** "No tags yet. Tag sections and lessons to see what you dwell on." `[ Go to lessons ]`.
- **Loading:** with two years of notes it can take a moment: skeleton rows after 300 ms.
- **Error:** the shared error boundary.

## Quarterly digest (M12-07, M12-08)

On the first open after a quarter ends, a card on the Lessons home (once per account, not per
device):

```text
│ [ + New lesson                     ] │
│ ┌──────────────────────────────────┐ │
│ │ Your July–September digest is    │ │
│ │ ready to look over.              │ │
│ │ [ Open draft › ]      Not now    │ │
│ └──────────────────────────────────┘ │
```

The draft is a lesson-like page, saved as it's typed like everything else, but not a lesson yet:

```text
┌──────────────────────────────────────┐
│ ← Digest draft                     ⋯ │  ← ⋯: Export…, Discard draft
├──────────────────────────────────────┤
│ July–September 2026▏                 │
│ Draft · not in your lessons yet      │
│                                      │
│ ┃ Lessons and series                 │
│ ┃ 11 lessons: 8 in John, 3 personal. │
│ ┃ Top tags                           │
│ ┃ #grace 14 · #hope 9 · #prayer 6    │
│ ┃ Questions                          │
│ ┃ 4 answered, 3 still open.          │
│ ┃ Memory verses                      │
│ ┃ 5 added, 38 reviews.               │
│ ┃ Commentaries that grew             │
│ ┃ John 10 (+9) · Romans 8 (+4)       │
│ ┃ Write a note…                      │
│                                      │
│ [ Keep as a lesson ]                 │
└──────────────────────────────────────┘
```

- The sections are ordinary text to edit. Lesson titles, questions and passages in it are link
  chips and verse chips, so they open what they name.
- **Keep as a lesson** makes it a lesson dated the quarter's last day and tagged #digest, and
  opens it. **Discard draft** happens at once, with Undo; the card doesn't come back for that
  quarter.
- "Not now" hides the card until the next open of the app.
- **Empty:** a quarter with no lessons makes no draft and no card.
- **Loading:** "Drafting your digest…" with skeleton rows after 300 ms.

## Export: Notion and handout (M12-05, M12-06)

The export dialog ([export.md](export.md#export-menu-m6-05-m6-06)) gains two lines:

```text
┌──────────────────────────────────────┐
│ Export "The Good Shepherd"           │
│                                      │
│ [ Markdown file (.md) ]              │
│ [ Copy as Markdown ]                 │
│ [ Copy for Notion ]                  │  ← M12-06: flat headings and quotes
│ [ Print or save as PDF ]             │
│ [ Handout (one page) ]               │  ← M12-05
│ [ Share link… ]                      │  ← M13-04
└──────────────────────────────────────┘
```

"Copy for Notion" confirms with "Copied for Notion." Both work offline.

## Handout (M12-05)

A print view, dark on white like the print view, that fits a lesson on one page: its details,
main passages, section headings, takeaways and questions.

```text
┌──────────────────────────────────────┐
│ ← Back                     [ Print ] │  ← screen only
├──────────────────────────────────────┤
│ The Good Shepherd                    │
│ Sunday 12 October 2026 · Pastor Ann  │
│ Sunday service (youtube.com/…)       │  ← the source (M11-08)
│                                      │
│ John 10:1–18 (BSB)                   │
│ ¹ Truly, truly, I tell you, whoever  │  ← small type
│ does not enter the sheepfold… ¹⁸ …   │
│                                      │
│ Notes                                │
│ 1. Jesus is the door                 │  ← each top-level section's first line
│ 2. The thief and the hired hand      │
│ 3. Other sheep, one flock            │
│                                      │
│ Takeaways                            │
│ • He knows his sheep by name.        │
│                                      │
│ Questions                            │
│ ☐ Who are the "other sheep"?         │
│                                      │
│ Scripture: Berean Standard Bible     │
│ (public domain). Made with Lamp.     │
└──────────────────────────────────────┘
```

- **To fit one page**, in this order: the passage text is cut to its references, the notes go into
  two columns, then the type gets smaller, down to 9 pt. It never runs onto a second page.
- If it still doesn't fit, the screen bar says what's left out: "Too long for one page: 4 note
  headings left out." Nothing is printed in the destructive colour.
- **Empty:** a lesson with no sections, takeaways or questions prints its details and passages
  alone.
- **Loading:** none.
