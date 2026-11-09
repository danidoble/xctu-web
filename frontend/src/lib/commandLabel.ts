// lib/commandLabel.ts — split a command name into an optional bracketed
// category badge + the human-readable remainder. Anything matching
// `^[CONTENIDO]` at the start is treated as the category; the rest of
// the string is the display name. Pure display — never mutates stored data.
//
// Examples:
//   "[SISTEMA] 00 - Descubrir tarjeta (06)"
//     => { category: "SISTEMA", displayName: "00 - Descubrir tarjeta (06)" }
//   "AT"
//     => { category: null, displayName: "AT" }

export type CommandLabel = {
  category: string | null;
  displayName: string;
  /** Original full name — used for tooltips and the filter fallback. */
  originalName: string;
};

// Match a single leading bracketed token. Brackets must be the very first
// characters and contain no nested brackets. Whitespace right after the
// closing bracket is consumed so "Foo]  Bar" and "Foo]Bar" behave the same.
const LABEL_RE = /^\[([^\[\]]+)\]\s*/;

export function parseCommandLabel(name: string): CommandLabel {
  const match = name.match(LABEL_RE);
  if (!match) {
    return { category: null, displayName: name, originalName: name };
  }
  const category = match[1].trim();
  const displayName = name.slice(match[0].length);
  return { category, displayName, originalName: name };
}
