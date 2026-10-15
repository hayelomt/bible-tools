import type { BookCode } from '@lamp/domain';

/**
 * A glossary of KJV words whose meaning a modern reader may miss (data/kjv-glossary.json), and the
 * matcher that finds them in the verses on a page.
 */

/** Obsolete: a word no longer used. Shifted: a word still used, with another meaning. */
export type GlossaryKind = 'obsolete' | 'shifted' | 'phrase';

export interface GlossaryEntry {
  /** The headword, lower case unless it is a name ("God forbid"). */
  term: string;
  /** Other spellings and inflections that count as the term: "spake", "fetched a compass". */
  forms?: readonly string[];
  kind: GlossaryKind;
  meaning: string;
  note?: string;
  /**
   * The only verses where the old sense applies, as `BOOK.chapter.verse` ("2TH.2.7"). For a word
   * that keeps its modern sense elsewhere: "let" means "hinder" in four verses, and "let us" is
   * modern everywhere else.
   */
  only?: readonly string[];
}

/** A grammar note shown once per page, instead of flagging every "thee" or "-eth" verb. */
export interface GlossaryRule {
  id: string;
  /** A case-sensitive regular expression; the rule applies when it matches any verse. */
  trigger: string;
  title: string;
  meaning: string;
}

export interface GlossaryData {
  source: string;
  rules: readonly GlossaryRule[];
  entries: readonly GlossaryEntry[];
}

/** A verse of the text on a page. */
export interface PageVerse {
  book: BookCode;
  chapter: number;
  verse: number;
  text: string;
}

export interface GlossaryHit {
  entry: GlossaryEntry;
  /** The verses it occurs in, in page order, each once. */
  verses: PageVerse[];
  /** How many times it occurs on the page. */
  count: number;
}

export interface PageGlossary {
  /** In the order each entry first occurs on the page. */
  hits: GlossaryHit[];
  rules: GlossaryRule[];
}

export interface Glossary {
  data: GlossaryData;
  /** The entries and rules that apply to these verses. */
  find(verses: readonly PageVerse[]): PageGlossary;
  /**
   * Entries matching a word or phrase: in the term or its forms first, then in the meaning or
   * note ("hinder" finds "let"). An empty query returns every entry, by term.
   */
  search(query: string): GlossaryEntry[];
}

const escape = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const normalise = (s: string) => s.trim().toLowerCase().replaceAll(/\s+/g, ' ');
const byTerm = (a: GlossaryEntry, b: GlossaryEntry) => a.term.localeCompare(b.term);

export function createGlossary(data: GlossaryData): Glossary {
  // Every term and form, to the entries it belongs to.
  const surfaces = new Map<string, GlossaryEntry[]>();
  for (const entry of data.entries) {
    for (const form of [entry.term, ...(entry.forms ?? [])]) {
      const key = normalise(form);
      surfaces.set(key, [...(surfaces.get(key) ?? []), entry]);
    }
  }
  // One pattern for all of them, longest first: at each position the longest form wins, so a
  // phrase ("in the room of") is matched before a word inside it ("room").
  const alternatives = [...surfaces.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map((s) => escape(s).replaceAll(' ', String.raw`\s+`));
  const pattern = new RegExp(String.raw`\b(?:${alternatives.join('|')})\b`, 'gi');
  const scopes = new Map(data.entries.map((e) => [e, e.only && new Set(e.only)]));
  const triggers = data.rules.map((rule) => [rule, new RegExp(rule.trigger)] as const);

  function find(verses: readonly PageVerse[]): PageGlossary {
    const hits = new Map<GlossaryEntry, GlossaryHit>();
    for (const verse of verses) {
      const ref = `${verse.book}.${verse.chapter}.${verse.verse}`;
      for (const [match] of verse.text.matchAll(pattern)) {
        const entry = surfaces.get(normalise(match))?.find((e) => scopes.get(e)?.has(ref) ?? true);
        if (!entry) continue;
        const hit = hits.get(entry) ?? { entry, verses: [], count: 0 };
        if (hit.verses.at(-1) !== verse) hit.verses.push(verse);
        hit.count++;
        hits.set(entry, hit);
      }
    }
    const rules = triggers
      .filter(([, trigger]) => verses.some((v) => trigger.test(v.text)))
      .map(([rule]) => rule);
    return { hits: [...hits.values()], rules };
  }

  function search(query: string): GlossaryEntry[] {
    const q = normalise(query);
    if (!q) return data.entries.toSorted(byTerm);
    const word = new RegExp(String.raw`\b${escape(q)}`, 'i');
    const rank = (e: GlossaryEntry) => {
      const forms = [e.term, ...(e.forms ?? [])].map(normalise);
      if (forms.includes(q)) return 0;
      if (forms.some((f) => f.startsWith(q))) return 1;
      if (forms.some((f) => f.includes(q))) return 2;
      if (word.test(e.meaning) || (e.note !== undefined && word.test(e.note))) return 3;
      return undefined;
    };
    const ranked: [GlossaryEntry, number][] = [];
    for (const entry of data.entries) {
      const r = rank(entry);
      if (r !== undefined) ranked.push([entry, r]);
    }
    return ranked.toSorted((a, b) => a[1] - b[1] || byTerm(a[0], b[0])).map(([entry]) => entry);
  }

  return { data, find, search };
}
