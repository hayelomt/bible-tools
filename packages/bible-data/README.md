# @lamp/bible-data

The Bible text Lamp ships to the device (TECH-DESIGN §9). Two translations, both public domain:

- **Berean Standard Bible (BSB)**, the default ([berean.bible](https://berean.bible/))
- **King James Version (KJV)**, downloaded when the user asks for it in settings

## Commands

```bash
pnpm --filter @lamp/bible-data build      # data/ → dist/
```

## Source

`data/bsb.json` and `data/kjv.json` are committed. Each is an array of the 66 books in canonical
order, `{ "abbrev", "name", "chapters": [[verse 1, verse 2, …], …] }`. The abbreviations and names
are Portuguese, so [`src/source.ts`](src/source.ts) matches books by position.

The source text carries leftovers of the markup it was taken out of. The build removes them and
changes no words:

- a stray `[’’]` at the end of 59 BSB verses, and `vvv` in three (Genesis 35:18, Luke 9:33, Acts 4:36);
- a space before closing punctuation or after `(` ("the LORD ." → "the LORD."), common in the KJV.

Spaces next to straight quotes (`"`) are left as they are, since an opening quote can't be told from a
closing one.

The BSB leaves out 16 verses that later manuscripts add (Matthew 17:21, Acts 8:37, Romans 16:24, …,
listed in [`src/sources.ts`](src/sources.ts)), and the source drops them from its arrays, so the
verses after each sit one place early. The build puts each back as `""`, so every verse keeps its
number. Both translations then number verses the KJV's way, which is the book table in
`@lamp/domain`.

## Output

```text
dist/
  manifest.json              per translation: name, licence, size, and per book: file, sha256, bytes, verses
  BSB/GEN.<hash>.json        one file per book, named by content hash (cache forever)
  KJV/GEN.<hash>.json
```

A book file is `{ "c": [[verse 1, verse 2, …], …], "n"?: {…} }`:

- `c[chapter - 1][verse - 1]` is the verse text. A Psalm's title is part of its first verse.
- `n` holds a note for each verse the translation leaves out, keyed by `"chapter:verse"`: "Some
  later manuscripts include this verse." Those verses are `""` in `c`. Only the BSB has them.

The build fails if a source doesn't have 66 books, a verse is empty without a note, or the chapter
and verse counts differ from the book table in `@lamp/domain`.

**Size (2026-10-15):** BSB 3,938,659 bytes and KJV 4,208,649 bytes, 66 files each.

## Lookup

`passageVerses(bookText, passage)` returns the verses of one verse, a range, whole chapters or a
range across chapters; `passageText` joins them into a chip snapshot, skipping empty verses.

## Licence

The Berean Standard Bible was dedicated to the public domain in 2023. The King James Version is in
the public domain, except in the United Kingdom, where the rights are vested in the Crown.
