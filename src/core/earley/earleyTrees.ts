/**
 * Derivation trees from an Earley chart.
 *
 * The chart is the list of item sets S_0 … S_n with items [A → α • β, j]. Classic
 * Earley builds it directly; ETTP builds pairs (q, j) whose items are the items of
 * state q with origin j, so both parsers hand the same kind of chart to this module.
 *
 * A completed item [A → γ •, k] in S_i says that A ⇒* w_{k+1} … w_i. Its subtree is
 * found backwards from the end of γ: the last symbol X of γ ends at i and starts at
 * some m where [A → γ' • X …, k] is in S_m (γ' the rest of γ); a terminal X needs
 * w_i = X and m = i − 1, a non-terminal X a completed item for X from m to i.
 *
 * Subtrees are found bottom-up by a fixpoint: an item gets a tree only when all its
 * children already have one. That terminates on cyclic grammars (A → B, B → A) and
 * on ε-rules, and every tree uses real rules of the grammar (a nullable non-terminal
 * gets the subtree of one of its ε-derivations, never an invented rule A → ε).
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';

export interface ChartItem {
  production: Production;
  dot: number;
  origin: number;
}

export interface ChartTrees {
  /** Subtree of the completed item [production •, origin] in S_end, if the chart has it. */
  ofItem(production: Production, origin: number, end: number): DerivationNode | undefined;
  /** Some subtree of the non-terminal for the part w_{origin+1} … w_end. */
  ofSymbol(symbol: string, origin: number, end: number): DerivationNode | undefined;
}

export const scannedLeafId = (tokenIndex: number, token: string) => `leaf_tok_${tokenIndex}_${token}`;
export const completedNodeId = (production: Production, origin: number, end: number) =>
  `tree_nt_${production.lhs}_${origin}_${end}_${production.id}`;

export function chartTrees(grammar: Grammar, tokens: string[], sets: ChartItem[][]): ChartTrees {
  const present: Set<string>[] = sets.map(items => new Set(items.map(it => `${it.production.id}#${it.dot}#${it.origin}`)));
  const has = (pos: number, p: Production, dot: number, origin: number) => present[pos]?.has(`${p.id}#${dot}#${origin}`) ?? false;

  const byItem = new Map<string, DerivationNode>();
  const bySymbol = new Map<string, DerivationNode>();
  const itemKey = (p: Production, k: number, end: number) => `${p.id}#${k}#${end}`;
  const symKey = (a: string, k: number, end: number) => `${a}\u0000${k}\u0000${end}`;

  const completed: { production: Production; origin: number; end: number }[] = [];
  sets.forEach((items, end) => {
    for (const it of items) {
      if (it.dot === it.production.rhs.length && it.production.id >= 0) {
        completed.push({ production: it.production, origin: it.origin, end });
      }
    }
  });
  // Shorter parts first, so that most subtrees are ready when they are needed; ties by rule, so
  // that the trees depend only on which items the chart has, not on the order they were added
  // (Earley with Leo's reconstructed items gives the same trees as plain Earley).
  completed.sort((a, b) => a.end - a.origin - (b.end - b.origin) || a.end - b.end || a.production.id - b.production.id);

  // Found decompositions stay valid; a failure may succeed once more subtrees are known.
  const found = new Map<string, DerivationNode[]>();
  let failed = new Set<string>();
  const decompose = (p: Production, dot: number, k: number, pos: number): DerivationNode[] | null => {
    if (dot === 0) return pos === k ? [] : null;
    const key = `${p.id}#${dot}#${k}#${pos}`;
    const known = found.get(key);
    if (known) return known;
    if (failed.has(key)) return null;
    let result: DerivationNode[] | null = null;
    const x = p.rhs[dot - 1];
    if (!grammar.nonTerminals.has(x)) {
      if (pos - 1 >= k && tokens[pos - 1] === x && has(pos - 1, p, dot - 1, k)) {
        const rest = decompose(p, dot - 1, k, pos - 1);
        if (rest) result = [...rest, { id: scannedLeafId(pos - 1, x), symbol: x, isTerminal: true }];
      }
    } else {
      for (let m = pos; m >= k && !result; m--) {
        const sub = bySymbol.get(symKey(x, m, pos));
        if (!sub || !has(m, p, dot - 1, k)) continue;
        const rest = decompose(p, dot - 1, k, m);
        if (rest) result = [...rest, sub];
      }
    }
    if (result) found.set(key, result);
    else failed.add(key);
    return result;
  };

  let changed = true;
  while (changed) {
    changed = false;
    failed = new Set();
    for (const c of completed) {
      const key = itemKey(c.production, c.origin, c.end);
      if (byItem.has(key)) continue;
      const children = decompose(c.production, c.production.rhs.length, c.origin, c.end);
      if (!children) continue;
      const node: DerivationNode = {
        id: completedNodeId(c.production, c.origin, c.end),
        symbol: c.production.lhs,
        isTerminal: false,
        children: children.length > 0 ? children : [{ id: `${completedNodeId(c.production, c.origin, c.end)}_eps`, symbol: 'ε', isTerminal: true }]
      };
      byItem.set(key, node);
      const sk = symKey(c.production.lhs, c.origin, c.end);
      if (!bySymbol.has(sk)) bySymbol.set(sk, node);
      changed = true;
      // A new subtree can complete items tried earlier in this round.
      failed = new Set();
    }
  }

  return {
    ofItem: (p, origin, end) => byItem.get(itemKey(p, origin, end)),
    ofSymbol: (a, origin, end) => bySymbol.get(symKey(a, origin, end))
  };
}

/**
 * A copy of the tree in which every node has its own id: the same ε-subtree can
 * occur twice (S → A A with A ⇒ ε), and the tree view keys nodes by id. The first
 * occurrence keeps its id, so a step's subtree can still be highlighted in it.
 */
export function withUniqueIds(root: DerivationNode): DerivationNode {
  const used = new Map<string, number>();
  const copy = (n: DerivationNode): DerivationNode => {
    const count = used.get(n.id) ?? 0;
    used.set(n.id, count + 1);
    return {
      ...n,
      id: count === 0 ? n.id : `${n.id}~${count}`,
      children: n.children?.map(copy)
    };
  };
  return copy(root);
}
