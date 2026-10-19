/**
 * Binary subtree representation (BSR) sets: Scott, Johnstone & van Binsbergen,
 * "Derivation representation using binary subtree sets", SCP 175 (2019).
 *
 * A BSR element is (Ω, i, k, j) with left extent i, pivot k and right extent j:
 * - (X ::= α, i, k, j): the whole rule X ::= α derives w[i..j), its last symbol
 *   starts at the pivot k (for |α| ≤ 1 the pivot is i; an ε-rule gives (X ::= ε, i, i, i));
 * - (α, i, k, j), α a prefix of a right-hand side with |α| ≥ 2 that is not the whole
 *   rule: α derives w[i..j), its last symbol starts at k. These elements are keyed by
 *   the string α, not by the rule, so rules with a common prefix share them.
 *
 * `bsrAdd(X ::= α · β, i, k, j)` inserts the rule element when β = ε and the string
 * element when |α| > 1 (nothing for the first symbol of a longer rule).
 *
 * The derivations of w embedded in a BSR set are found top-down from the elements
 * (S ::= α, 0, k, n): a rule element is split at its pivot into the prefix
 * (the string element (α', i, k', k) or, for one symbol, the symbol over w[i..k))
 * and its last symbol over w[k..j).
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';

export interface BSRRuleElement {
  kind: 'rule';
  production: Production;
  i: number;
  k: number;
  j: number;
  /** Step of the algorithm that added it (0 = before the first descriptor) */
  createdAt: number;
}

export interface BSRStringElement {
  kind: 'string';
  /** The string α (a proper prefix of length ≥ 2 of some right-hand side) */
  symbols: string[];
  i: number;
  k: number;
  j: number;
  createdAt: number;
}

export type BSRElement = BSRRuleElement | BSRStringElement;

export const stringKey = (symbols: string[]) => symbols.join('\u0000');

export function bsrElementKey(e: BSRElement): string {
  return e.kind === 'rule' ? `R${e.production.id}|${e.i}|${e.k}|${e.j}` : `S${stringKey(e.symbols)}|${e.i}|${e.k}|${e.j}`;
}

export function formatBSRElement(e: BSRElement): string {
  const omega = e.kind === 'rule' ? `${e.production.lhs} ::= ${e.production.rhs.join(' ') || 'ε'}` : e.symbols.join(' ');
  return `(${omega}, ${e.i}, ${e.k}, ${e.j})`;
}

/** A BSR set with the indexes the derivation search needs. */
export class BSRSet {
  readonly elements: BSRElement[] = [];
  private readonly keys = new Set<string>();
  /** lhs, i, j → rule elements */
  private readonly rules = new Map<string, BSRRuleElement[]>();
  /** α, i, j → string elements */
  private readonly strings = new Map<string, BSRStringElement[]>();

  /** Inserts the element; false when the set already has it. */
  insert(e: BSRElement): boolean {
    const key = bsrElementKey(e);
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.elements.push(e);
    if (e.kind === 'rule') push(this.rules, `${e.production.lhs}\u0001${e.i}\u0001${e.j}`, e);
    else push(this.strings, `${stringKey(e.symbols)}\u0001${e.i}\u0001${e.j}`, e);
    return true;
  }

  has(e: BSRElement): boolean {
    return this.keys.has(bsrElementKey(e));
  }

  get size(): number {
    return this.elements.length;
  }

  ruleElements(lhs: string, i: number, j: number): BSRRuleElement[] {
    return this.rules.get(`${lhs}\u0001${i}\u0001${j}`) ?? [];
  }

  stringElements(symbols: string[], i: number, j: number): BSRStringElement[] {
    return this.strings.get(`${stringKey(symbols)}\u0001${i}\u0001${j}`) ?? [];
  }

  /** The elements added up to the given step (the set as the algorithm had it then). */
  upTo(step: number): BSRSet {
    const s = new BSRSet();
    for (const e of this.elements) if (e.createdAt <= step) s.insert(e);
    return s;
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

/**
 * bsrAdd(X ::= α · β, i, k, j) of the 2019 paper: the rule element when β = ε,
 * the string element when |α| > 1, nothing otherwise. Returns the element that
 * was meant (null when none) and whether it is new.
 */
export function bsrAdd(set: BSRSet, production: Production, dot: number, i: number, k: number, j: number, step: number): { element: BSRElement | null; isNew: boolean } {
  let element: BSRElement | null = null;
  if (dot === production.rhs.length) element = { kind: 'rule', production, i, k, j, createdAt: step };
  else if (dot > 1) element = { kind: 'string', symbols: production.rhs.slice(0, dot), i, k, j, createdAt: step };
  if (!element) return { element: null, isNew: false };
  const isNew = set.insert(element);
  return { element, isNew };
}

// ---------------------------------------------------------------------------
// Derivations embedded in a BSR set
// ---------------------------------------------------------------------------

/** One way a part of the input is split for a rule: [symbol, from, to] per symbol of the rule. */
export type Cut = [string, number, number][];

/**
 * The cuts of the rule element (X ::= x₁ … xₘ, i, k, j): xₘ over w[k..j), the prefix
 * x₁ … xₘ₋₁ over w[i..k) split further by the string elements of the set.
 */
export function cutsOfRuleElement(set: BSRSet, grammar: Grammar, tokens: string[], e: BSRRuleElement): Cut[] {
  const rhs = e.production.rhs;
  if (rhs.length === 0) return e.i === e.k && e.k === e.j ? [[]] : [];
  const last: [string, number, number] = [rhs[rhs.length - 1], e.k, e.j];
  if (!symbolFits(grammar, tokens, last)) return [];
  return prefixCuts(set, grammar, tokens, rhs.slice(0, -1), e.i, e.k).map(c => [...c, last]);
}

function symbolFits(grammar: Grammar, tokens: string[], [x, a, b]: [string, number, number]): boolean {
  return grammar.nonTerminals.has(x) ? a <= b : b === a + 1 && tokens[a] === x;
}

/** The cuts of α over w[i..k) that the set witnesses (α empty only for i = k). */
function prefixCuts(set: BSRSet, grammar: Grammar, tokens: string[], alpha: string[], i: number, k: number): Cut[] {
  if (alpha.length === 0) return i === k ? [[]] : [];
  if (alpha.length === 1) {
    const only: [string, number, number] = [alpha[0], i, k];
    return symbolFits(grammar, tokens, only) ? [[only]] : [];
  }
  const out: Cut[] = [];
  for (const s of set.stringElements(alpha, i, k)) {
    const last: [string, number, number] = [alpha[alpha.length - 1], s.k, k];
    if (!symbolFits(grammar, tokens, last)) continue;
    for (const c of prefixCuts(set, grammar, tokens, alpha.slice(0, -1), i, s.k)) out.push([...c, last]);
  }
  return out;
}

export interface BSRDerivations {
  /** The set has (S ::= α, 0, k, n) for some α, k (the acceptance test of the 2019 paper) */
  accepted: boolean;
  /** Number of derivation trees (Infinity when a cycle A ⇒+ A over one part is used) */
  treeCount: number;
  /** Trees listed (a cycle is not repeated), at most maxTrees */
  trees: DerivationNode[];
  moreTrees: boolean;
}

/** Number of derivation trees of `symbol` over w[i..j) embedded in the set. */
export function countBSRTrees(set: BSRSet, grammar: Grammar, tokens: string[], symbol: string, i: number, j: number): number {
  const memo = new Map<string, number>();
  const onPath = new Set<string>();
  let cyclic = false;
  const countSym = (x: string, a: number, b: number): number => {
    if (!grammar.nonTerminals.has(x)) return b === a + 1 && tokens[a] === x ? 1 : 0;
    const key = `${x}\u0001${a}\u0001${b}`;
    const m = memo.get(key);
    if (m !== undefined) return m;
    if (onPath.has(key)) {
      // Every element of a BSR set made by GLL (or from an Earley chart) stands for a
      // real derivation, so a part that depends on itself has infinitely many trees.
      cyclic = true;
      return 0;
    }
    onPath.add(key);
    let total = 0;
    for (const e of set.ruleElements(x, a, b)) {
      for (const cut of cutsOfRuleElement(set, grammar, tokens, e)) {
        let product = 1;
        for (const [y, c, d] of cut) {
          product *= countSym(y, c, d);
          if (product === 0) break;
        }
        total += product;
      }
    }
    onPath.delete(key);
    memo.set(key, total);
    return total;
  };
  const count = countSym(symbol, i, j);
  if (!cyclic) return count;
  // A cycle was seen: count again marking the parts on a cycle as infinite.
  return countWithCycles(set, grammar, tokens, symbol, i, j);
}

/**
 * Counting when parts depend on themselves: the parts reachable from the root form a
 * graph; a part on a cycle (or depending on one) with at least one tree has infinitely
 * many trees.
 */
function countWithCycles(set: BSRSet, grammar: Grammar, tokens: string[], symbol: string, i: number, j: number): number {
  type Part = string;
  const parts = new Map<Part, { x: string; a: number; b: number; cuts: Cut[] }>();
  const stack: [string, number, number][] = [[symbol, i, j]];
  const keyOf = (x: string, a: number, b: number) => `${x}\u0001${a}\u0001${b}`;
  while (stack.length) {
    const [x, a, b] = stack.pop()!;
    const key = keyOf(x, a, b);
    if (parts.has(key)) continue;
    const cuts = set.ruleElements(x, a, b).flatMap(e => cutsOfRuleElement(set, grammar, tokens, e));
    parts.set(key, { x, a, b, cuts });
    for (const cut of cuts) for (const [y, c, d] of cut) if (grammar.nonTerminals.has(y)) stack.push([y, c, d]);
  }
  // Finite trees first (least fixpoint of "has a tree"), then infinity along dependencies.
  const hasTree = new Set<Part>();
  const symHas = (y: string, c: number, d: number) =>
    grammar.nonTerminals.has(y) ? hasTree.has(keyOf(y, c, d)) : d === c + 1 && tokens[c] === y;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [key, p] of parts) {
      if (!hasTree.has(key) && p.cuts.some(cut => cut.every(([y, c, d]) => symHas(y, c, d)))) {
        hasTree.add(key);
        changed = true;
      }
    }
  }
  // Dependency graph between parts that have trees, through cuts whose all symbols have trees
  const deps = new Map<Part, Set<Part>>();
  for (const [key, p] of parts) {
    const ds = new Set<Part>();
    for (const cut of p.cuts) {
      if (!cut.every(([y, c, d]) => symHas(y, c, d))) continue;
      for (const [y, c, d] of cut) if (grammar.nonTerminals.has(y)) ds.add(keyOf(y, c, d));
    }
    deps.set(key, ds);
  }
  const reaches = (from: Part, to: Part) => {
    const st = [...(deps.get(from) ?? [])];
    const seen = new Set<Part>();
    while (st.length) {
      const x = st.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      st.push(...(deps.get(x) ?? []));
    }
    return false;
  };
  const infinite = new Set([...hasTree].filter(p => reaches(p, p)));
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of hasTree) {
      if (!infinite.has(p) && [...deps.get(p)!].some(d => infinite.has(d))) {
        infinite.add(p);
        changed = true;
      }
    }
  }
  const root = keyOf(symbol, i, j);
  if (!hasTree.has(root)) return 0;
  if (infinite.has(root)) return Infinity;
  // The rest is acyclic: plain memoized counting
  const memo = new Map<Part, number>();
  const count = (y: string, c: number, d: number): number => {
    if (!grammar.nonTerminals.has(y)) return d === c + 1 && tokens[c] === y ? 1 : 0;
    const key = keyOf(y, c, d);
    if (!hasTree.has(key)) return 0;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let total = 0;
    for (const cut of parts.get(key)!.cuts) total += cut.reduce((acc, [z, e, f]) => (acc === 0 ? 0 : acc * count(z, e, f)), 1);
    memo.set(key, total);
    return total;
  };
  return count(symbol, i, j);
}

/**
 * The derivation trees of `symbol` over w[i..j) embedded in the set, in the order of
 * the rules and pivots; a part already on the path from the root is not entered again
 * (so a cycle A ⇒+ A is not repeated). `rootElement` restricts the root to one rule element.
 */
export function* bsrTrees(
  set: BSRSet,
  grammar: Grammar,
  tokens: string[],
  symbol: string,
  i: number,
  j: number,
  rootElement?: BSRRuleElement
): Generator<DerivationNode> {
  let next = 0;
  const fresh = (p: string) => `${p}${next++}`;
  function* ofSymbol(x: string, a: number, b: number, path: Set<string>, only?: BSRRuleElement): Generator<DerivationNode> {
    if (!grammar.nonTerminals.has(x)) {
      if (b === a + 1 && tokens[a] === x) yield { id: fresh(`t${a}_`), symbol: x, isTerminal: true };
      return;
    }
    const key = `${x}\u0001${a}\u0001${b}`;
    if (path.has(key)) return;
    const inner = new Set(path).add(key);
    for (const e of only ? [only] : set.ruleElements(x, a, b)) {
      for (const cut of cutsOfRuleElement(set, grammar, tokens, e)) {
        if (cut.length === 0) {
          yield { id: fresh(`n${a}_${b}_`), symbol: x, isTerminal: false, children: [{ id: fresh('eps'), symbol: 'ε', isTerminal: true }] };
          continue;
        }
        for (const children of combos(cut, inner)) {
          yield { id: fresh(`n${a}_${b}_`), symbol: x, isTerminal: false, children };
        }
      }
    }
  }
  function* combos(cut: Cut, path: Set<string>, idx = 0): Generator<DerivationNode[]> {
    if (idx === cut.length) {
      yield [];
      return;
    }
    const [y, c, d] = cut[idx];
    for (const first of ofSymbol(y, c, d, path)) {
      for (const rest of combos(cut, path, idx + 1)) yield [first, ...rest];
    }
  }
  yield* ofSymbol(symbol, i, j, new Set(), rootElement);
}

/** Acceptance, tree count and the first `maxTrees` trees of the whole word. */
export function bsrDerivations(set: BSRSet, grammar: Grammar, tokens: string[], maxTrees = 50): BSRDerivations {
  const n = tokens.length;
  const accepted = set.ruleElements(grammar.startSymbol, 0, n).length > 0;
  if (!accepted) return { accepted, treeCount: 0, trees: [], moreTrees: false };
  const treeCount = countBSRTrees(set, grammar, tokens, grammar.startSymbol, 0, n);
  const trees: DerivationNode[] = [];
  let moreTrees = false;
  for (const t of bsrTrees(set, grammar, tokens, grammar.startSymbol, 0, n)) {
    if (trees.length === maxTrees) {
      moreTrees = true;
      break;
    }
    trees.push(t);
  }
  return { accepted, treeCount, trees, moreTrees: moreTrees || treeCount > trees.length };
}
