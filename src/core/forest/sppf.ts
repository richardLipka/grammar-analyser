/**
 * Shared packed parse forests (SPPF): all derivation trees of a word in one graph
 * (Tomita 1985/1986, "shared-packed forest"). A node for a symbol over a part of the
 * input is shared by every tree that uses it; its packed nodes are the different
 * ways it is derived, so a node with two or more packed nodes is a place of ambiguity.
 *
 * Two forms:
 * - by rules (Tomita, Rekers): a symbol node (X, i, j) has a packed node for each
 *   rule X ::= x₁ … xₘ and each cut of w[i..j) into the parts of x₁, …, xₘ;
 * - binarised (Scott & Johnstone, "GLL parse-tree generation", SCP 2013): a packed node
 *   (X ::= α ·, k) has at most two children, the prefix over w[i..k) — an intermediate
 *   node (X ::= α' · xₘ, i, k) or the first symbol — and the last symbol over w[k..j).
 *   This is the form the BSR set encodes element by element (Scott, Johnstone &
 *   van Binsbergen 2019, §3.2 extractSPPF).
 *
 * The forest is built top-down from (S, 0, n) out of a BSR set, so it holds only parts
 * that occur in some derivation of the whole word. An Earley chart gives a BSR set
 * (`earleyChartToBSR`); trees found by another parser (GLR) are merged directly
 * (`treesToForest`).
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';
import { BSRSet, bsrAdd, cutsOfRuleElement } from '../gll/bsr';

export type ForestNodeKind = 'symbol' | 'intermediate' | 'packed' | 'terminal' | 'epsilon';

export interface ForestNode {
  id: string;
  kind: ForestNodeKind;
  /** Symbol, slot (intermediate) or rule (packed) */
  label: string;
  i: number;
  j: number;
  children: string[];
  /** packed: the rule; intermediate: the rule of its slot */
  production?: Production;
  /** packed: the pivot k (binarised) */
  pivot?: number;
  /** intermediate: the dot of its slot */
  dot?: number;
}

export interface SharedPackedForest {
  nodes: Map<string, ForestNode>;
  root: string | null;
  binarised: boolean;
  /** Symbol and intermediate nodes with two or more packed nodes */
  ambiguous: string[];
  /** Number of derivation trees in the forest (Infinity with a cycle) */
  treeCount: number;
  /** The node limit was reached; the forest is incomplete */
  truncated: boolean;
}

const symbolId = (x: string, i: number, j: number) => `N|${x}|${i}|${j}`;
const terminalId = (i: number) => `T|${i}`;
const epsilonId = (i: number) => `E|${i}`;

export function formatSlotDot(p: Production, dot: number): string {
  const rhs = [...p.rhs];
  rhs.splice(dot, 0, '·');
  return `${p.lhs} ::= ${rhs.join(' ')}`;
}

export interface ForestOptions {
  binarised?: boolean;
  maxNodes?: number;
}

/** The forest of the derivations of `symbol` over w[i..j) (default: S over the word) embedded in a BSR set. */
export function bsrToForest(set: BSRSet, grammar: Grammar, tokens: string[], options: ForestOptions = {}): SharedPackedForest {
  const binarised = options.binarised ?? false;
  const maxNodes = options.maxNodes ?? 4000;
  const n = tokens.length;
  const nodes = new Map<string, ForestNode>();
  const work: string[] = [];
  let truncated = false;

  const ensure = (node: Omit<ForestNode, 'children'>): string => {
    if (!nodes.has(node.id)) {
      if (nodes.size >= maxNodes) {
        truncated = true;
        return node.id;
      }
      nodes.set(node.id, { ...node, children: [] });
      work.push(node.id);
    }
    return node.id;
  };
  const symbolNode = (x: string, a: number, b: number): string => {
    if (!grammar.nonTerminals.has(x)) return ensure({ id: terminalId(a), kind: 'terminal', label: x, i: a, j: b });
    return ensure({ id: symbolId(x, a, b), kind: 'symbol', label: x, i: a, j: b });
  };
  const epsilonNode = (a: number) => ensure({ id: epsilonId(a), kind: 'epsilon', label: 'ε', i: a, j: a });
  /** The node of the prefix x₁ … x_len of p over w[a..b): the first symbol, or an intermediate node */
  const prefixNode = (p: Production, len: number, a: number, b: number): string =>
    len === 1
      ? symbolNode(p.rhs[0], a, b)
      : ensure({ id: `I|${p.id}|${len}|${a}|${b}`, kind: 'intermediate', label: formatSlotDot(p, len), i: a, j: b, production: p, dot: len });

  if (set.ruleElements(grammar.startSymbol, 0, n).length === 0) {
    return { nodes, root: null, binarised, ambiguous: [], treeCount: 0, truncated: false };
  }
  const root = symbolNode(grammar.startSymbol, 0, n);

  while (work.length) {
    const id = work.pop()!;
    const node = nodes.get(id)!;
    const packed: string[] = [];
    if (node.kind === 'symbol') {
      for (const e of set.ruleElements(node.label, node.i, node.j)) {
        const p = e.production;
        if (binarised) {
          if (cutsOfRuleElement(set, grammar, tokens, e).length === 0) continue;
          const pid = `BP|${p.id}|${e.i}|${e.k}|${e.j}`;
          const children = p.rhs.length === 0
            ? [epsilonNode(e.i)]
            : p.rhs.length === 1
              ? [symbolNode(p.rhs[0], e.i, e.j)]
              : [prefixNode(p, p.rhs.length - 1, e.i, e.k), symbolNode(p.rhs[p.rhs.length - 1], e.k, e.j)];
          if (!nodes.has(pid)) nodes.set(pid, { id: pid, kind: 'packed', label: formatSlotDot(p, p.rhs.length), i: e.i, j: e.j, production: p, pivot: e.k, children });
          packed.push(pid);
        } else {
          for (const cut of cutsOfRuleElement(set, grammar, tokens, e)) {
            const pid = `P|${p.id}|${e.i}|${e.j}|${cut.map(([, , b]) => b).join(',')}`;
            if (packed.includes(pid)) continue;
            const children = cut.length === 0 ? [epsilonNode(e.i)] : cut.map(([x, a, b]) => symbolNode(x, a, b));
            if (!nodes.has(pid)) nodes.set(pid, { id: pid, kind: 'packed', label: `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`, i: e.i, j: e.j, production: p, children });
            packed.push(pid);
          }
        }
      }
    } else if (node.kind === 'intermediate') {
      const p = node.production!;
      const len = node.dot!;
      for (const s of set.stringElements(p.rhs.slice(0, len), node.i, node.j)) {
        const last = p.rhs[len - 1];
        if (!grammar.nonTerminals.has(last) && !(node.j === s.k + 1 && tokens[s.k] === last)) continue;
        const pid = `IP|${p.id}|${len}|${node.i}|${node.j}|${s.k}`;
        const children = [prefixNode(p, len - 1, node.i, s.k), symbolNode(last, s.k, node.j)];
        if (!nodes.has(pid)) nodes.set(pid, { id: pid, kind: 'packed', label: formatSlotDot(p, len), i: node.i, j: node.j, production: p, pivot: s.k, children });
        packed.push(pid);
      }
    }
    node.children = packed;
  }

  return finish(nodes, root, binarised, truncated);
}

function finish(nodes: Map<string, ForestNode>, root: string, binarised: boolean, truncated: boolean): SharedPackedForest {
  const ambiguous = [...nodes.values()].filter(x => (x.kind === 'symbol' || x.kind === 'intermediate') && x.children.length > 1).map(x => x.id);
  return { nodes, root, binarised, ambiguous, treeCount: truncated ? NaN : forestTreeCount(nodes, root), truncated };
}

/**
 * Number of trees of a forest: a symbol/intermediate node sums its packed nodes, a
 * packed node multiplies its children. A node on a cycle (or depending on one) that has
 * a finite tree has infinitely many.
 */
export function forestTreeCount(nodes: Map<string, ForestNode>, root: string | null): number {
  if (!root || !nodes.has(root)) return 0;
  const leaf = (x: ForestNode) => x.kind === 'terminal' || x.kind === 'epsilon';
  const ok = (c: string) => hasTree.has(c);
  // least fixpoint: nodes with a finite tree
  const hasTree = new Set<string>();
  for (const x of nodes.values()) if (leaf(x)) hasTree.add(x.id);
  for (let changed = true; changed; ) {
    changed = false;
    for (const x of nodes.values()) {
      if (hasTree.has(x.id)) continue;
      const good = x.kind === 'packed' ? x.children.every(ok) : x.children.some(ok);
      if (good) {
        hasTree.add(x.id);
        changed = true;
      }
    }
  }
  if (!hasTree.has(root)) return 0;
  // edges that can occur in a tree: into nodes with a tree, from packed nodes whose children all have one
  const deps = (x: ForestNode) => (x.kind === 'packed' && !x.children.every(ok) ? [] : x.children.filter(ok));
  const onCycle = new Set<string>();
  // Tarjan's strongly connected components
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const strong = (v: string) => {
    // iterative to stay safe on deep forests
    const call: { v: string; it: number; kids: string[] }[] = [{ v, it: 0, kids: deps(nodes.get(v)!) }];
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    while (call.length) {
      const top = call[call.length - 1];
      if (top.it < top.kids.length) {
        const w = top.kids[top.it++];
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index++);
          stack.push(w);
          onStack.add(w);
          call.push({ v: w, it: 0, kids: deps(nodes.get(w)!) });
        } else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, idx.get(w)!));
        continue;
      }
      call.pop();
      if (call.length) low.set(call[call.length - 1].v, Math.min(low.get(call[call.length - 1].v)!, low.get(top.v)!));
      if (low.get(top.v) === idx.get(top.v)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== top.v);
        const self = deps(nodes.get(top.v)!).includes(top.v);
        if (comp.length > 1 || self) for (const c of comp) onCycle.add(c);
      }
    }
  };
  for (const v of hasTree) if (!idx.has(v)) strong(v);
  const memo = new Map<string, number>();
  const count = (v: string): number => {
    const m = memo.get(v);
    if (m !== undefined) return m;
    if (onCycle.has(v)) {
      memo.set(v, Infinity);
      return Infinity;
    }
    const x = nodes.get(v)!;
    memo.set(v, 0); // never read: the remaining graph is acyclic
    let c: number;
    if (leaf(x)) c = 1;
    else if (x.kind === 'packed') c = x.children.every(ok) ? x.children.reduce((acc, k) => acc * count(k), 1) : 0;
    else c = x.children.filter(ok).reduce((acc, k) => acc + count(k), 0);
    memo.set(v, c);
    return c;
  };
  return count(root);
}

/**
 * BSR set of an Earley chart: [A → α X • β, k] in Sⱼ with [A → α • X β, k] in Sₘ and X
 * deriving w[m..j) (a terminal: m = j − 1; a non-terminal: a completed item [X → γ •, m] in Sⱼ)
 * gives bsrAdd(A ::= α X · β, k, m, j); [A → •, k] in Sₖ gives (A ::= ε, k, k, k).
 */
export function earleyChartToBSR(grammar: Grammar, tokens: string[], sets: { production: Production; dot: number; origin: number }[][]): BSRSet {
  const set = new BSRSet();
  const has = sets.map(items => new Set(items.map(it => `${it.production.id}#${it.dot}#${it.origin}`)));
  const completed = sets.map(items => new Set(items.filter(it => it.dot === it.production.rhs.length).map(it => `${it.production.lhs}\u0001${it.origin}`)));
  sets.forEach((items, j) => {
    for (const it of items) {
      const p = it.production;
      if (p.id < 0) continue; // the added start rule
      if (p.rhs.length === 0) {
        bsrAdd(set, p, 0, it.origin, it.origin, j, 0);
        continue;
      }
      if (it.dot === 0) continue;
      const x = p.rhs[it.dot - 1];
      const before = (m: number) => has[m]?.has(`${p.id}#${it.dot - 1}#${it.origin}`) ?? false;
      if (!grammar.nonTerminals.has(x)) {
        if (j >= 1 && tokens[j - 1] === x && before(j - 1)) bsrAdd(set, p, it.dot, it.origin, j - 1, j, 0);
        continue;
      }
      for (let m = it.origin; m <= j; m++) {
        if (before(m) && completed[j].has(`${x}\u0001${m}`)) bsrAdd(set, p, it.dot, it.origin, m, j, 0);
      }
    }
  });
  return set;
}

/** Spans of the nodes of a tree: [i, j) of each node by its yield. */
function spans(tree: DerivationNode): Map<DerivationNode, [number, number]> {
  const out = new Map<DerivationNode, [number, number]>();
  let pos = 0;
  const walk = (x: DerivationNode) => {
    const start = pos;
    if (!x.children || x.children.length === 0) {
      if (x.symbol !== 'ε') pos++;
    } else x.children.forEach(walk);
    out.set(x, [start, pos]);
  };
  walk(tree);
  return out;
}

const findRule = (grammar: Grammar, x: DerivationNode) => {
  const kids = (x.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
  return grammar.productions.find(p => p.lhs === x.symbol && p.rhs.length === kids.length && p.rhs.every((s, k) => s === kids[k]));
};

/** The ids of the forest nodes a tree uses (to highlight one tree in the forest). */
export function treeInForest(tree: DerivationNode, grammar: Grammar, binarised: boolean): Set<string> {
  const ids = new Set<string>();
  const sp = spans(tree);
  const visit = (x: DerivationNode) => {
    const [i, j] = sp.get(x)!;
    if (!x.children || x.children.length === 0) {
      ids.add(x.symbol === 'ε' ? epsilonId(i) : grammar.nonTerminals.has(x.symbol) ? symbolId(x.symbol, i, j) : terminalId(i));
      return;
    }
    ids.add(symbolId(x.symbol, i, j));
    const p = findRule(grammar, x);
    const kids = x.children.filter(c => c.symbol !== 'ε');
    if (p) {
      if (!binarised) {
        ids.add(`P|${p.id}|${i}|${j}|${kids.map(c => sp.get(c)![1]).join(',')}`);
      } else if (kids.length <= 1) {
        ids.add(`BP|${p.id}|${i}|${i}|${j}`);
      } else {
        const m = kids.length;
        ids.add(`BP|${p.id}|${i}|${sp.get(kids[m - 1])![0]}|${j}`);
        for (let len = m - 1; len >= 2; len--) {
          const end = sp.get(kids[len - 1])![1];
          ids.add(`I|${p.id}|${len}|${i}|${end}`);
          ids.add(`IP|${p.id}|${len}|${i}|${end}|${sp.get(kids[len - 1])![0]}`);
        }
      }
    }
    if (x.children.length === 1 && x.children[0].symbol === 'ε') ids.add(epsilonId(i));
    kids.forEach(visit);
  };
  visit(tree);
  return ids;
}

/**
 * A forest merged from separate trees (e.g. the trees GLR found): nodes with the same
 * symbol and part are shared, the same rule with the same cut is one packed node. It holds
 * only the trees given (a parser that lists trees up to a limit may have missed some).
 */
export function treesToForest(trees: DerivationNode[], grammar: Grammar, options: ForestOptions = {}): SharedPackedForest {
  // Through BSR: every tree gives its elements, the forest is then built as for GLL.
  const set = new BSRSet();
  let tokens: string[] = [];
  for (const tree of trees) {
    const sp = spans(tree);
    const leaves: string[] = [];
    const walk = (x: DerivationNode) => {
      if (!x.children || x.children.length === 0) {
        if (x.symbol !== 'ε' && !grammar.nonTerminals.has(x.symbol)) leaves.push(x.symbol);
        return;
      }
      const p = findRule(grammar, x);
      const kids = x.children.filter(c => c.symbol !== 'ε');
      const [i, j] = sp.get(x)!;
      if (p) {
        if (kids.length === 0) bsrAdd(set, p, 0, i, i, i, 0);
        for (let len = 1; len <= kids.length; len++) {
          const [k, end] = sp.get(kids[len - 1])!;
          bsrAdd(set, p, len, i, len === 1 ? i : k, len === kids.length ? j : end, 0);
        }
      }
      x.children.forEach(walk);
    };
    walk(tree);
    tokens = leaves;
  }
  return bsrToForest(set, grammar, tokens, options);
}
