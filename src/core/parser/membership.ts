/**
 * Membership and all derivation trees for any context-free grammar (also
 * ambiguous ones, with ε-rules and cycles; not only LL or LR).
 *
 * D(A, i, j) says that A derives the part w[i..j) of the word. It is computed
 * for the parts by increasing length (dynamic programming as in CYK, but over
 * whole right-hand sides, not only A → B C): a right-hand side X1 … Xm derives
 * w[i..j) when it can be cut into consecutive parts derived by X1, …, Xm.
 * A part can depend on itself only through rules whose other symbols derive
 * ε (A → B with B ⇒* … A, A → A | ε); those are found by iterating to a
 * fixpoint within the part.
 *
 * The number of derivation trees is counted the same way; a cycle within a
 * part (A ⇒+ A over the same part) means infinitely many trees. The trees
 * themselves are listed up to a limit, without repeating a cycle.
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';

export interface ParseTree {
  tree: DerivationNode;
  /** Rule numbers in the order of the leftmost derivation */
  leftParse: number[];
}

export interface MembershipResult {
  accepted: boolean;
  /** Number of derivation trees of the word (Infinity with a cycle A ⇒+ A) */
  treeCount: number;
  /** The trees listed (cycles are not repeated), at most `maxTrees` */
  trees: ParseTree[];
  /** More trees exist than listed */
  moreTrees: boolean;
  /**
   * For a rejected word: the longest prefix that some word of L(G) starts
   * with (the input is wrong at the next symbol, or ends too early).
   */
  viablePrefix: number;
}

interface Tables {
  n: number;
  /** derives(A, i, j) */
  D: (A: string, i: number, j: number) => boolean;
  /** number of trees of A over w[i..j) */
  N: (A: string, i: number, j: number) => number;
  byLhs: Map<string, Production[]>;
}

const key = (A: string, i: number, j: number) => `${A}\u0000${i}\u0000${j}`;

function buildTables(g: Grammar, w: string[]): Tables {
  const n = w.length;
  const byLhs = new Map<string, Production[]>();
  for (const p of g.productions) {
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p);
  }
  const nts = [...byLhs.keys()];
  const counts = new Map<string, number>(); // A, i, j -> trees (0 = does not derive)
  const N = (A: string, i: number, j: number) => counts.get(key(A, i, j)) ?? 0;
  const D = (A: string, i: number, j: number) => N(A, i, j) > 0;

  // Trees of the suffix rhs[pos..] over w[i..j): Σ over the cuts of the products
  const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : a * b);
  const seqMemo = new Map<string, number>();
  const seqCount = (p: Production, pos: number, i: number, j: number, sameSpan: boolean): number => {
    const memoKey = `${p.id}\u0000${pos}\u0000${i}\u0000${j}`;
    if (!sameSpan) {
      const m = seqMemo.get(memoKey);
      if (m !== undefined) return m;
    }
    let total = 0;
    if (pos === p.rhs.length) {
      total = i === j ? 1 : 0;
    } else {
      const X = p.rhs[pos];
      if (!byLhs.has(X) && !g.nonTerminals.has(X)) {
        total = i < j && w[i] === X ? seqCount(p, pos + 1, i + 1, j, false) : 0;
      } else {
        for (let k = i; k <= j; k++) {
          const left = N(X, i, k);
          if (left === 0) continue;
          // the rest over w[k..j): the same part only when k = i
          total += mul(left, seqCount(p, pos + 1, k, j, sameSpan && k === i));
        }
      }
    }
    if (!sameSpan) seqMemo.set(memoKey, total);
    return total;
  };

  for (let len = 0; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      // Which non-terminals derive this part (fixpoint: a part can depend on itself)
      const derives = new Set<string>();
      for (let changed = true; changed; ) {
        changed = false;
        for (const A of nts) {
          if (derives.has(A)) continue;
          if (byLhs.get(A)!.some(p => seqCount(p, 0, i, j, true) > 0)) {
            derives.add(A);
            counts.set(key(A, i, j), 1); // provisional, makes D true for the fixpoint
            changed = true;
          }
        }
      }
      if (derives.size === 0) continue;

      // Same-part dependencies A → X (A → α X β with α, β deriving ε at the borders)
      const deps = new Map<string, Set<string>>();
      for (const A of derives) {
        const set = new Set<string>();
        for (const p of byLhs.get(A)!) {
          for (let pos = 0; pos < p.rhs.length; pos++) {
            const X = p.rhs[pos];
            if (!derives.has(X)) continue;
            const prefixEmpty = p.rhs.slice(0, pos).every(Y => D(Y, i, i));
            // at length 0 this is the current part, whose counts are still provisional: not memoized
            const suffixEmpty = seqCount(p, pos + 1, j, j, len === 0) > 0;
            if (prefixEmpty && suffixEmpty) set.add(X);
          }
        }
        deps.set(A, set);
      }
      // On a cycle, or depending on one: infinitely many trees
      const reaches = (from: string, to: string): boolean => {
        const stack = [...(deps.get(from) || [])];
        const seen = new Set<string>();
        while (stack.length) {
          const x = stack.pop()!;
          if (x === to) return true;
          if (seen.has(x)) continue;
          seen.add(x);
          stack.push(...(deps.get(x) || []));
        }
        return false;
      };
      const infinite = new Set([...derives].filter(A => reaches(A, A)));
      for (let changed = true; changed; ) {
        changed = false;
        for (const A of derives) {
          if (!infinite.has(A) && [...deps.get(A)!].some(X => infinite.has(X))) {
            infinite.add(A);
            changed = true;
          }
        }
      }
      // Finite counts: the remaining dependencies are acyclic, so the iteration settles
      for (const A of derives) counts.set(key(A, i, j), infinite.has(A) ? Infinity : 0);
      for (let round = 0; round <= derives.size; round++) {
        let changed = false;
        for (const A of derives) {
          if (infinite.has(A)) continue;
          const c = byLhs.get(A)!.reduce((sum, p) => sum + seqCount(p, 0, i, j, true), 0);
          if (c !== N(A, i, j)) {
            counts.set(key(A, i, j), c);
            changed = true;
          }
        }
        if (!changed) break;
      }
    }
  }
  return { n, D, N, byLhs };
}

/** The trees of A over w[i..j); `path` holds the parts on the current same-part chain (no cycle is repeated). */
function* treesOf(
  t: Tables,
  g: Grammar,
  w: string[],
  A: string,
  i: number,
  j: number,
  path: Set<string>,
  ids: { next: number }
): Generator<{ node: DerivationNode; parse: number[] }> {
  const here = key(A, i, j);
  if (path.has(here) || !t.D(A, i, j)) return;
  for (const p of t.byLhs.get(A) || []) {
    for (const parts of cuts(t, g, w, p, 0, i, j)) {
      // Children over the same part continue the chain; smaller parts start a new one
      const make = (idx: number) => {
        const [X, a, b] = parts[idx];
        if (!g.nonTerminals.has(X)) return single({ node: { id: `m${ids.next++}`, symbol: X, isTerminal: true }, parse: [] });
        const nextPath = a === i && b === j ? new Set([...path, here]) : new Set<string>();
        return treesOf(t, g, w, X, a, b, nextPath, ids);
      };
      for (const combo of product(parts.length, make)) {
        const children = p.rhs.length === 0
          ? [{ id: `m${ids.next++}`, symbol: 'ε', isTerminal: true }]
          : combo.map(c => c.node);
        yield {
          node: { id: `m${ids.next++}`, symbol: A, isTerminal: false, children },
          parse: [p.id, ...combo.flatMap(c => c.parse)]
        };
      }
    }
  }
}

function* single<T>(x: T): Generator<T> {
  yield x;
}

/** All combinations of the children (each child list is enumerated afresh for every prefix). */
function* product<T>(count: number, make: (idx: number) => Generator<T>): Generator<T[]> {
  if (count === 0) {
    yield [];
    return;
  }
  const go = function* (idx: number, acc: T[]): Generator<T[]> {
    if (idx === count) {
      yield acc;
      return;
    }
    for (const x of make(idx)) yield* go(idx + 1, [...acc, x]);
  };
  yield* go(0, []);
}

/** The ways to cut w[i..j) into parts for rhs[pos..]: [symbol, from, to] per symbol. */
function* cuts(t: Tables, g: Grammar, w: string[], p: Production, pos: number, i: number, j: number): Generator<[string, number, number][]> {
  if (pos === p.rhs.length) {
    if (i === j) yield [];
    return;
  }
  const X = p.rhs[pos];
  if (!g.nonTerminals.has(X)) {
    if (i < j && w[i] === X) for (const rest of cuts(t, g, w, p, pos + 1, i + 1, j)) yield [[X, i, i + 1], ...rest];
    return;
  }
  for (let k = i; k <= j; k++) {
    if (!t.D(X, i, k)) continue;
    for (const rest of cuts(t, g, w, p, pos + 1, k, j)) yield [[X, i, k], ...rest];
  }
}

/** Longest prefix of w that some word of L(G) starts with (Earley recognizer). */
export function viablePrefixLength(g: Grammar, w: string[]): number {
  const nullable = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of g.productions) {
      if (!nullable.has(p.lhs) && p.rhs.every(s => nullable.has(s))) {
        nullable.add(p.lhs);
        changed = true;
      }
    }
  }
  // Only rules whose symbols all generate a word can take part in a derivation of a word
  const generating = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of g.productions) {
      if (!generating.has(p.lhs) && p.rhs.every(s => !g.nonTerminals.has(s) || generating.has(s))) {
        generating.add(p.lhs);
        changed = true;
      }
    }
  }
  const rules = g.productions.filter(p => p.rhs.every(s => !g.nonTerminals.has(s) || generating.has(s)));
  if (!generating.has(g.startSymbol)) return 0;
  type Item = { p: Production; dot: number; origin: number };
  const start: Production = { id: -1, lhs: '\u0000', rhs: [g.startSymbol] };
  const sets: Item[][] = [[]];
  const seen: Set<string>[] = [new Set()];
  const add = (k: number, it: Item) => {
    const s = `${it.p.id}|${it.dot}|${it.origin}`;
    if (!seen[k].has(s)) {
      seen[k].add(s);
      sets[k].push(it);
    }
  };
  add(0, { p: start, dot: 0, origin: 0 });
  for (let k = 0; k <= w.length; k++) {
    if (k > 0) {
      sets.push([]);
      seen.push(new Set());
      for (const it of sets[k - 1]) {
        if (it.dot < it.p.rhs.length && it.p.rhs[it.dot] === w[k - 1] && !g.nonTerminals.has(w[k - 1])) {
          add(k, { p: it.p, dot: it.dot + 1, origin: it.origin });
        }
      }
      if (sets[k].length === 0) return k - 1;
    }
    for (let x = 0; x < sets[k].length; x++) {
      const it = sets[k][x];
      if (it.dot < it.p.rhs.length) {
        const B = it.p.rhs[it.dot];
        if (g.nonTerminals.has(B)) {
          for (const q of rules) if (q.lhs === B) add(k, { p: q, dot: 0, origin: k });
          if (nullable.has(B)) add(k, { p: it.p, dot: it.dot + 1, origin: it.origin });
        }
      } else {
        for (const y of sets[it.origin]) {
          if (y.dot < y.p.rhs.length && y.p.rhs[y.dot] === it.p.lhs) add(k, { p: y.p, dot: y.dot + 1, origin: y.origin });
        }
      }
    }
  }
  return w.length;
}

export function testMembership(g: Grammar, w: string[], maxTrees = 20): MembershipResult {
  const t = buildTables(g, w);
  const count = t.N(g.startSymbol, 0, w.length);
  const trees: ParseTree[] = [];
  let moreTrees = false;
  if (count > 0) {
    const ids = { next: 0 };
    for (const r of treesOf(t, g, w, g.startSymbol, 0, w.length, new Set(), ids)) {
      if (trees.length === maxTrees) {
        moreTrees = true;
        break;
      }
      trees.push({ tree: r.node, leftParse: r.parse });
    }
  }
  return {
    accepted: count > 0,
    treeCount: count,
    trees,
    moreTrees: moreTrees || count > trees.length,
    viablePrefix: count > 0 ? w.length : viablePrefixLength(g, w)
  };
}
