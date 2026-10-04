/**
 * An example word of L(G) for the demonstrations (simulators, membership,
 * recursive descent): always derived from the grammar being processed, of a
 * reasonable length, and using as many different rules as possible, so that
 * a demonstration shows more than the shortest word.
 *
 * First the lengths every non-terminal can derive (up to the maximal length)
 * are computed by a fixpoint, remembering the round in which each length was
 * reached first. A word is derived with an exact length: every non-terminal
 * is expanded by a rule not used yet when it can give the length it has to,
 * otherwise by a rule whose parts were all reached in earlier rounds than
 * this one. A new rule can be taken at most once each, and the rounds
 * decrease along every branch otherwise, so the derivation always ends.
 *
 * The lengths tried are the first three of the start symbol that reach the
 * target (else the longest one there is), each with the length shared among
 * the parts of a rule evenly, to the left, or to the right; the word that
 * uses the most different rules wins, the shorter one on a tie. The choice is
 * deterministic: the same grammar gives the same word.
 */

import { Grammar, Production } from '../ast/grammar';
import { testMembership } from '../parser/membership';
import { tokenizeInput } from '../parser/inputTokenizer';

/**
 * Length of the shortest word every generating non-terminal derives, and the
 * rule that first reached it. A value is only ever replaced by a strictly
 * smaller one, so these rules never lead back to their non-terminal:
 * expanding by them always ends in a word (S → S | a gives S → a).
 */
export function shortestYields(g: Grammar): { len: Map<string, number>; rule: Map<string, Production> } {
  const len = new Map<string, number>();
  const rule = new Map<string, Production>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of g.productions) {
      let sum = 0;
      for (const s of p.rhs) {
        if (!g.nonTerminals.has(s)) sum += 1;
        else if (len.has(s)) sum += len.get(s)!;
        else {
          sum = Infinity;
          break;
        }
      }
      if (sum < (len.get(p.lhs) ?? Infinity)) {
        len.set(p.lhs, sum);
        rule.set(p.lhs, p);
        changed = true;
      }
    }
  }
  return { len, rule };
}

export interface ExampleOptions {
  /** Aim at least this many terminals (default 8) */
  target?: number;
  /** Never more than this many, unless no word is that short (default 14) */
  max?: number;
}

/** Longer shortest words are no example for a demonstration. */
export const EXAMPLE_LIMIT = 40;

/**
 * An example word of L(G); null when the language is empty or its shortest
 * word is longer than EXAMPLE_LIMIT.
 */
export function exampleWord(g: Grammar, options: ExampleOptions = {}): string[] | null {
  const { len } = shortestYields(g);
  const shortestLength = len.get(g.startSymbol);
  if (shortestLength === undefined || shortestLength > EXAMPLE_LIMIT) return null;
  const target = options.target ?? 8;
  const max = Math.max(options.max ?? 14, shortestLength);
  const byLhs = new Map<string, Production[]>();
  for (const p of g.productions) {
    if (!p.rhs.every(s => !g.nonTerminals.has(s) || len.has(s))) continue;
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p);
  }

  // round.get(A)[k]: the round in which A first derived a word of k symbols (Infinity: never, up to max)
  const round = new Map<string, number[]>();
  for (const A of byLhs.keys()) round.set(A, new Array(max + 1).fill(Infinity));
  const terminal = Array.from({ length: max + 1 }, (_, k) => k === 1);
  /** The lengths a symbol gives, of a non-terminal only those reached before round `before`. */
  const lengths = (s: string, before: number): boolean[] =>
    g.nonTerminals.has(s) ? round.get(s)!.map(r => r < before) : terminal;
  /** sums[i]: the lengths the symbols i, i+1, … of the right-hand side give together. */
  const suffixSums = (rhs: string[], before: number): boolean[][] => {
    const sums: boolean[][] = [];
    sums[rhs.length] = Array.from({ length: max + 1 }, (_, k) => k === 0);
    for (let i = rhs.length - 1; i >= 0; i--) {
      const own = lengths(rhs[i], before);
      const rest = sums[i + 1];
      const both = new Array<boolean>(max + 1).fill(false);
      for (let a = 0; a <= max; a++) {
        if (!own[a]) continue;
        for (let b = 0; a + b <= max; b++) if (rest[b]) both[a + b] = true;
      }
      sums[i] = both;
    }
    return sums;
  };
  // Every round uses only the lengths of the previous rounds
  for (let r = 0, changed = true; changed; r++) {
    changed = false;
    const reached: [string, number][] = [];
    for (const [A, rules] of byLhs) {
      for (const p of rules) {
        suffixSums(p.rhs, r)[0].forEach((ok, k) => {
          if (ok && round.get(A)![k] === Infinity) reached.push([A, k]);
        });
      }
    }
    for (const [A, k] of reached) {
      if (round.get(A)![k] === Infinity) {
        round.get(A)![k] = r;
        changed = true;
      }
    }
  }

  type Sharing = 'even' | 'left' | 'right';
  /** A word of exactly k symbols derived from A; `used` collects the rules. */
  const derive = (A: string, k: number, sharing: Sharing, used: Set<number>): string[] => {
    const r = round.get(A)![k];
    let before = Infinity;
    let rule = byLhs.get(A)!.find(p => !used.has(p.id) && suffixSums(p.rhs, Infinity)[0][k]);
    if (!rule) {
      before = r;
      rule = byLhs.get(A)!.find(p => suffixSums(p.rhs, r)[0][k])!;
    }
    used.add(rule.id);
    const { rhs } = rule;
    const sums = suffixSums(rhs, before);
    const word: string[] = [];
    let rest = k;
    rhs.forEach((s, i) => {
      const own = lengths(s, before);
      // the share of this symbol: as even as the lengths allow (larger on a tie), or the most, or the least
      const share = sharing === 'even' ? Math.ceil(rest / (rhs.length - i)) : sharing === 'left' ? rest : 0;
      let part = -1;
      for (let a = 0; a <= rest; a++) {
        if (own[a] && sums[i + 1][rest - a] && (part === -1 || Math.abs(a - share) <= Math.abs(part - share))) part = a;
      }
      if (g.nonTerminals.has(s)) word.push(...derive(s, part, sharing, used));
      else word.push(s);
      rest -= part;
    });
    return word;
  };

  // The lengths to try: the first three that reach the target, else the longest there is
  const ofStart = round.get(g.startSymbol)!;
  let candidates = ofStart.map((r, k) => (r < Infinity && k >= target ? k : -1)).filter(k => k !== -1).slice(0, 3);
  if (candidates.length === 0) candidates = [ofStart.map((r, k) => (r < Infinity ? k : -1)).reduce((a, b) => Math.max(a, b))];
  // The word that uses the most different rules (the shorter one on a tie)
  let best: { word: string[]; rules: number } | null = null;
  for (const k of candidates) {
    for (const sharing of ['even', 'left', 'right'] as const) {
      const used = new Set<number>();
      const word = derive(g.startSymbol, k, sharing, used);
      if (!best || used.size > best.rules) best = { word, rules: used.size };
    }
  }
  return best!.word;
}

/**
 * The word shown in the demonstrations: the preferred one (of a preset or a
 * link) when it belongs to L(G), otherwise the example word of the grammar;
 * '' when there is none.
 */
export function demonstrationWord(g: Grammar, preferred = ''): string {
  if (preferred.trim()) {
    const input = tokenizeInput(preferred, g.terminals);
    if (input.unknown.length === 0 && input.tokens.length <= EXAMPLE_LIMIT && testMembership(g, input.tokens, 0).accepted) return preferred;
  }
  return exampleWord(g)?.join(' ') ?? '';
}
