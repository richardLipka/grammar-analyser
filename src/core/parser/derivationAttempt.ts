/**
 * How a grammar derives a word, or how far it gets when it does not.
 *
 * For a word of the language: a derivation tree and its leftmost derivation.
 *
 * For another word, the general analyser (an Earley recognizer, any
 * context-free grammar) finds the longest prefix w[0..k) that some word of
 * the language starts with, and what the grammar allows after it: the
 * terminals that can follow, and whether the word may end there. The attempt
 * shown is a partial derivation tree whose leaves are the prefix, then a
 * terminal the grammar needs at position k (marked: the word has another
 * symbol there, or ends), then the symbols that were not derived any more.
 * It is built from an Earley item [A → α • t β, i] at position k and the
 * chain of items that predicted A back to the start symbol: on every level
 * the symbols before the dot are complete subtrees over their part of the
 * prefix, the symbols after it stay unexpanded. When nothing can follow the
 * prefix but it is itself a word of the language, the attempt is its full
 * derivation tree, and the word goes on where the derivation has ended.
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';
import { sequenceTrees, testMembership } from './membership';

export type WordExplanation =
  | {
    generated: true;
    tree: DerivationNode;
    /** The sentential forms of the leftmost derivation */
    forms: string[][];
    /** Number of derivation trees (Infinity with a cycle) */
    treeCount: number;
  }
  | {
    generated: false;
    /**
     * empty-language: the grammar generates no word;
     * mismatch: after the prefix the word has a symbol the grammar cannot continue with;
     * ends-early: the whole word is only the beginning of words of the language;
     * goes-on: the prefix is a word of the language and nothing can follow it
     */
    reason: 'empty-language' | 'mismatch' | 'ends-early' | 'goes-on';
    /** w[0..matched) is a prefix of some word of the language */
    matched: number;
    /** The terminals that can follow the prefix */
    expected: string[];
    /** The prefix itself is a word of the language */
    canEnd: boolean;
    /** The symbol of the word after the prefix (none when the word ends) */
    found?: string;
    /** `found` is not a terminal of this grammar at all */
    unknownSymbol: boolean;
    /** The partial derivation tree (null for an empty language) */
    tree: DerivationNode | null;
    /** The leftmost derivation of the tree, up to where it breaks off */
    forms: string[][];
  };

type Item = { p: Production; dot: number; origin: number };

/** The sentential forms of the leftmost derivation of a (possibly partial) tree. */
export function leftmostForms(root: DerivationNode): string[][] {
  let frontier: DerivationNode[] = [root];
  const forms = [frontier.map(n => n.symbol)];
  for (;;) {
    const i = frontier.findIndex(n => !n.isTerminal && n.children && n.children.length > 0);
    if (i === -1) return forms;
    const kids = frontier[i].children!.filter(c => !(c.isTerminal && c.symbol === 'ε'));
    frontier = [...frontier.slice(0, i), ...kids, ...frontier.slice(i + 1)];
    forms.push(frontier.map(n => n.symbol));
  }
}

export function explainWord(g: Grammar, w: string[]): WordExplanation {
  const membership = testMembership(g, w, 1);
  if (membership.accepted) {
    const tree = membership.trees[0].tree;
    return { generated: true, tree, forms: leftmostForms(tree), treeCount: membership.treeCount };
  }

  // Earley sets over the longest prefix that some word starts with (rules whose symbols all generate)
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
  const nullable = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of rules) {
      if (!nullable.has(p.lhs) && p.rhs.every(s => nullable.has(s))) {
        nullable.add(p.lhs);
        changed = true;
      }
    }
  }
  const unknownAt = (k: number) => k < w.length && !g.terminals.has(w[k]);
  if (!generating.has(g.startSymbol)) {
    return {
      generated: false, reason: 'empty-language', matched: 0, expected: [], canEnd: false,
      found: w[0], unknownSymbol: unknownAt(0), tree: null, forms: []
    };
  }

  const start: Production = { id: -1, lhs: '\u0000', rhs: [g.startSymbol] };
  const sets: Item[][] = [];
  const seen: Set<string>[] = [];
  const add = (k: number, it: Item) => {
    const s = `${it.p.id}|${it.dot}|${it.origin}`;
    if (!seen[k].has(s)) {
      seen[k].add(s);
      sets[k].push(it);
    }
  };
  const close = (k: number) => {
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
  };
  sets.push([]);
  seen.push(new Set());
  add(0, { p: start, dot: 0, origin: 0 });
  close(0);
  let k = 0;
  while (k < w.length) {
    const next: Item[] = [];
    for (const it of sets[k]) {
      if (it.dot < it.p.rhs.length && it.p.rhs[it.dot] === w[k] && !g.nonTerminals.has(w[k])) {
        next.push({ p: it.p, dot: it.dot + 1, origin: it.origin });
      }
    }
    if (next.length === 0) break;
    sets.push([]);
    seen.push(new Set());
    for (const it of next) add(k + 1, it);
    close(k + 1);
    k++;
  }

  const here = sets[k];
  const expected = [...new Set(here
    .filter(it => it.dot < it.p.rhs.length && !g.nonTerminals.has(it.p.rhs[it.dot]))
    .map(it => it.p.rhs[it.dot]))].sort();
  const canEnd = here.some(it => it.p.id === -1 && it.dot === 1);
  const found = w[k];
  const prefix = w.slice(0, k);
  const base = { generated: false as const, matched: k, expected, canEnd, found, unknownSymbol: unknownAt(k) };

  if (expected.length === 0) {
    // Nothing can follow: the prefix is a word of the language and the word goes on
    const tree = testMembership(g, prefix, 1).trees[0]?.tree ?? null;
    return { ...base, reason: 'goes-on', tree, forms: tree ? leftmostForms(tree) : [] };
  }

  // An item that needs a terminal at k, and the chain of items that predicted it (breadth first: the shortest chain)
  const leaf = here.find(it => it.dot < it.p.rhs.length && !g.nonTerminals.has(it.p.rhs[it.dot]))!;
  type Link = { it: Item; parent: Link | null };
  const keyOf = (it: Item) => `${it.p.id}|${it.dot}|${it.origin}`;
  const queue: Link[] = [{ it: leaf, parent: null }];
  const visited = new Set<string>([`${k}|${keyOf(leaf)}`]);
  let top: Link | null = null;
  for (let q = 0; q < queue.length && !top; q++) {
    const link = queue[q];
    for (const y of sets[link.it.origin]) {
      if (y.dot >= y.p.rhs.length || y.p.rhs[y.dot] !== link.it.p.lhs) continue;
      const v = `${link.it.origin}|${keyOf(y)}`;
      if (visited.has(v)) continue;
      visited.add(v);
      const up = { it: y, parent: link };
      if (y.p.id === -1) {
        top = up;
        break;
      }
      queue.push(up);
    }
  }

  // The chain from the start down to the leaf item: every level gets complete subtrees before the dot
  const chain: Item[] = [];
  for (let l: Link | null = top; l; l = l.parent) chain.push(l.it);
  const subtrees = sequenceTrees(g, prefix);
  let ids = 0;
  const leafNode = (symbol: string, mark: DerivationNode['mark']): DerivationNode => ({
    id: `x${ids++}`, symbol, isTerminal: !g.nonTerminals.has(symbol), mark
  });
  const build = (level: number): DerivationNode => {
    const it = chain[level];
    const isLeaf = level === chain.length - 1;
    // the symbols before the dot derive the part up to where the next level was predicted (at the leaf: up to k)
    const end = isLeaf ? k : chain[level + 1].origin;
    const before = subtrees(it.p.rhs.slice(0, it.dot), it.origin, end) ?? [];
    const atDot = isLeaf ? leafNode(it.p.rhs[it.dot], 'mismatch') : build(level + 1);
    const after = it.p.rhs.slice(it.dot + 1).map(s => leafNode(s, 'pending'));
    return { id: `x${ids++}`, symbol: it.p.lhs, isTerminal: false, children: [...before, atDot, ...after] };
  };
  // The top of the chain is the start item S' → • S; the tree starts with S
  const tree = chain.length > 1 ? build(1) : null;
  return { ...base, reason: found === undefined ? 'ends-early' : 'mismatch', tree, forms: tree ? leftmostForms(tree) : [] };
}
