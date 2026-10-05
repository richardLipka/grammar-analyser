/**
 * Test helpers: an Earley recognizer for any CFG and a check that two
 * grammars agree on all short words (language equivalence up to a length).
 */
import { Grammar, Production } from '../core/ast/grammar';
import { computeNullable } from '../core/analyser/grammarAnalyser';

export const rules = (g: Grammar) => g.productions.map(p => `${p.lhs} -> ${p.rhs.join(' ')}`.trim());

/** Earley recognizer (with the Aycock–Horspool nullable fix) for any CFG. */
export function accepts(g: Grammar, word: string[]): boolean {
  const nullable = computeNullable(g);
  const aug: Production = { id: -1, lhs: '\u0000', rhs: [g.startSymbol] };
  type Item = { p: Production; dot: number; origin: number };
  const chart: Item[][] = Array.from({ length: word.length + 1 }, () => []);
  const keys: Set<string>[] = Array.from({ length: word.length + 1 }, () => new Set());
  const add = (i: number, it: Item) => {
    const key = `${it.p.id}|${it.p.lhs}|${it.dot}|${it.origin}`;
    if (!keys[i].has(key)) {
      keys[i].add(key);
      chart[i].push(it);
    }
  };
  add(0, { p: aug, dot: 0, origin: 0 });
  for (let i = 0; i <= word.length; i++) {
    for (let k = 0; k < chart[i].length; k++) {
      const it = chart[i][k];
      if (it.dot < it.p.rhs.length) {
        const X = it.p.rhs[it.dot];
        if (g.nonTerminals.has(X)) {
          for (const q of g.productions) if (q.lhs === X) add(i, { p: q, dot: 0, origin: i });
          if (nullable.has(X)) add(i, { p: it.p, dot: it.dot + 1, origin: it.origin });
        } else if (i < word.length && word[i] === X) {
          add(i + 1, { p: it.p, dot: it.dot + 1, origin: it.origin });
        }
      } else {
        for (const w of chart[it.origin]) {
          if (w.dot < w.p.rhs.length && w.p.rhs[w.dot] === it.p.lhs) {
            add(i, { p: w.p, dot: w.dot + 1, origin: w.origin });
          }
        }
      }
    }
  }
  return keys[word.length].has(`-1|\u0000|1|0`);
}

export function wordsUpTo(alphabet: string[], n: number): string[][] {
  const result: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let len = 1; len <= n; len++) {
    layer = layer.flatMap(w => alphabet.map(a => [...w, a]));
    // one by one: a layer can have more words than a call can take arguments
    for (const w of layer) result.push(w);
  }
  return result;
}

/** L(g1) = L(g2) on all words up to maxLen; with a large alphabet only up to the length that keeps it below 200,000 words. */
export function expectEquivalent(g1: Grammar, g2: Grammar, maxLen = 6) {
  const alphabet = [...new Set([...g1.terminals, ...g2.terminals])];
  let len = maxLen;
  while (len > 1 && alphabet.length ** len > 200000) len--;
  for (const w of wordsUpTo(alphabet, len)) {
    const a = accepts(g1, w);
    const b = accepts(g2, w);
    if (a !== b) {
      throw new Error(`L(G) and L(G') differ on '${w.join(' ') || 'ε'}': ${a} vs ${b}\n${rules(g2).join('\n')}`);
    }
  }
}
