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

export interface ScannedInput extends TokenizedInput {
  /** The text of every token: the name or number read as an identifier or number terminal, otherwise the terminal */
  lexemes: string[];
}

/**
 * A simple scanner for the recursive-descent simulator: as tokenizeInput, but a name
 * (x, count) that is no terminal is read as the identifier terminal (id, ident) and a
 * number as the number terminal (num, number), keeping its text as the lexeme. Within
 * a word, names, numbers and the other terminals are taken by maximal munch
 * (x:=x-1 gives x := x - 1); keywords are the terminals that look like names.
 */
export function scanInput(text: string, terminals: Iterable<string>, classes: { identifier?: string; number?: string }): ScannedInput {
  if (!classes.identifier && !classes.number) {
    const plain = tokenizeInput(text, terminals);
    return { ...plain, lexemes: [...plain.tokens] };
  }
  const terms = [...new Set(terminals)].filter(t => t.length > 0).sort((a, b) => b.length - a.length);
  const termSet = new Set(terms);
  const tokens: string[] = [];
  const lexemes: string[] = [];
  const unknown: string[] = [];
  let split = false;
  const push = (token: string, lexeme: string) => {
    tokens.push(token);
    lexemes.push(lexeme);
  };

  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (termSet.has(word)) {
      push(word, word);
      continue;
    }
    const start = tokens.length;
    let ok = true;
    for (let i = 0; i < word.length && ok;) {
      const rest = word.slice(i);
      const name = rest.match(/^[\p{L}_][\p{L}\p{N}_]*/u)?.[0];
      const num = rest.match(/^\p{N}+(?:\.\p{N}+)?/u)?.[0];
      if (name) {
        const parts = termSet.has(name) ? [name] : classes.identifier ? null : splitWord(name, terms);
        if (parts) parts.forEach(t => push(t, t));
        else if (classes.identifier) push(classes.identifier, name);
        else ok = false;
        i += name.length;
      } else if (num && !termSet.has(num) && classes.number) {
        push(classes.number, num);
        i += num.length;
      } else {
        const t = terms.find(t => rest.startsWith(t));
        if (t) {
          push(t, t);
          i += t.length;
        } else {
          ok = false;
        }
      }
    }
    if (!ok) {
      tokens.length = start;
      lexemes.length = start;
      const parts = splitWord(word, terms);
      if (parts) parts.forEach(t => push(t, t));
      else {
        push(word, word);
        unknown.push(word);
      }
    }
    if (tokens.length - start > 1) split = true;
  }
  return { tokens, lexemes, split, unknown };
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
