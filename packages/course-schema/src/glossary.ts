import type { Block, GlossaryEntry } from "./schema.js";

const TERM_REF = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

export interface TermRef {
  /** The term as written inside the brackets. */
  term: string;
  /** Text shown to the reader (defaults to the term). */
  display: string;
  index: number;
  length: number;
}

export function normalizeTerm(term: string): string {
  return term.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function findTermRefs(text: string): TermRef[] {
  const refs: TermRef[] = [];
  for (const m of text.matchAll(TERM_REF)) {
    const term = m[1]!.trim();
    refs.push({ term, display: (m[2] ?? m[1]!).trim(), index: m.index, length: m[0].length });
  }
  return refs;
}

/** Text fields of a block that may contain [[term]] references. */
export function blockTexts(b: Block): string[] {
  switch (b.type) {
    case "markdown":
    case "callout":
    case "quote":
      return [b.text];
    default:
      return [];
  }
}

/** Keys under which an entry can be referenced: the term and its aliases, normalized. */
export function entryKeys(entry: GlossaryEntry): string[] {
  return [entry.term, ...(entry.aliases ?? [])].map(normalizeTerm);
}
