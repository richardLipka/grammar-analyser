/**
 * Splits the input of a simulator into terminals.
 *
 * Words separated by spaces are tokens. A word that is not a terminal is
 * split into terminals by longest match (with backtracking, so a split is
 * found whenever one exists): with the terminals a, b the word aabb gives
 * a a b b, with id, + the word id+id gives id + id. A word that cannot be
 * split stays as it is (the parser then reports it).
 */

export interface TokenizedInput {
  tokens: string[];
  /** Some word was split into several terminals */
  split: boolean;
  /** Words that are no terminal and cannot be split into terminals */
  unknown: string[];
}

export function tokenizeInput(text: string, terminals: Iterable<string>): TokenizedInput {
  const terms = [...new Set(terminals)].filter(t => t.length > 0).sort((a, b) => b.length - a.length);
  const termSet = new Set(terms);
  const tokens: string[] = [];
  const unknown: string[] = [];
  let split = false;

  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (termSet.has(word)) {
      tokens.push(word);
      continue;
    }
    const parts = splitWord(word, terms);
    if (parts) {
      tokens.push(...parts);
      split = true;
    } else {
      tokens.push(word);
      unknown.push(word);
    }
  }
  return { tokens, split, unknown };
}

/** Longest-match split of a word into terminals, null if there is none. */
function splitWord(word: string, termsLongestFirst: string[]): string[] | null {
  const failed = new Set<number>();
  const go = (i: number): string[] | null => {
    if (i === word.length) return [];
    if (failed.has(i)) return null;
    for (const t of termsLongestFirst) {
      if (word.startsWith(t, i)) {
        const rest = go(i + t.length);
        if (rest) return [t, ...rest];
      }
    }
    failed.add(i);
    return null;
  };
  return go(0);
}
