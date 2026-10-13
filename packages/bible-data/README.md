# @lamp/bible-data

The Bible text Lamp ships to the device (TECH-DESIGN §9). Phase 1 has one translation: the
**World English Bible (WEB)**, public domain, from [eBible.org](https://ebible.org/web/).

## Commands

```bash
pnpm --filter @lamp/bible-data download   # fetch and unzip the source into source/ (gitignored)
pnpm --filter @lamp/bible-data build      # source/ → dist/ (downloads first if needed)
```

`download` fetches `eng-web_usfm.zip`, checks it against the SHA-256 pinned in
[`src/sources.ts`](src/sources.ts) and unzips it into `source/eng-web/`. It does nothing when the
source is already there. When eBible.org publishes a new zip, the checksum no longer matches and the
download stops: look at what changed, then update the checksum. CI caches `source/` under a key
derived from `src/sources.ts`.

## Output

```
dist/
  manifest.json              translations, licence, source checksum, and per book: file, sha256, bytes, verses
  WEB/GEN.<hash>.json        one file per book, named by content hash (cache forever)
  WEB/copr.htm               eBible.org's licence notice, unchanged
```

A book file is `{ "c": [[verse 1, verse 2, …], …], "d"?: {…}, "n"?: {…} }`:

- `c[chapter - 1][verse - 1]` is the verse text. Footnotes, cross references, headings and word
  markup (Strong's numbers) are removed; the words are unchanged, with line breaks collapsed to
  single spaces. That keeps eBible's condition for using the name "World English Bible".
- `d` holds titles outside the verse numbering, keyed by the `"chapter:verse"` they come before:
  the Psalm titles (`"3:1": "A Psalm by David, when he fled from Absalom his son."`) and the
  Psalm 119 letters (`"119:9": "BETH"`). Only Psalms has them.
- `n` holds the footnote for each verse WEB leaves empty (Luke 17:36; Acts 8:37, 15:34, 24:7;
  Romans 16:25). Those verses are `""` in `c`.

The build fails if a book is missing, a verse is missing, or the chapter and verse counts differ from
the book table in `@lamp/domain`.

**Size (2026-10-13 source):** 66 files, 4,093,745 bytes in total (Psalms is the largest at 228 KB,
3 John the smallest at 1.6 KB); about 1.26 MB with gzip. The manifest is 34 KB.

## Lookup

`passageVerses(bookText, passage)` returns the verses of one verse, a range, whole chapters or a
range across chapters; `passageText` joins them into a chip snapshot, skipping empty verses.

## Licence

The World English Bible is in the public domain. "World English Bible" is a trademark of eBible.org,
whose only request is that changed text not use the name. The full notice ships as `dist/WEB/copr.htm`.
