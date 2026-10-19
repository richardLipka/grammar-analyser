/**
 * GLL parsing (generalised LL): Scott & Johnstone, "GLL Parsing", LDTA 2009 /
 * ENTCS 253(7), 2010; "GLL parse-tree generation", SCP 78(10), 2013; with the
 * derivations recorded as a BSR set as in Scott, Johnstone & van Binsbergen,
 * "Derivation representation using binary subtree sets", SCP 175, 2019.
 *
 * GLL is recursive descent made general: instead of calling a procedure per
 * non-terminal, the parser keeps descriptors (L, u, i) — a grammar slot L
 * (a dotted rule X ::= α · β), a node u of the graph-structured stack (GSS) and an
 * input position i — and processes them one by one:
 * - R holds the descriptors still to be processed, U all descriptors ever added
 *   (add(L, u, i) puts a descriptor into R only if it is not in U yet);
 * - a GSS node (L, i) stands for a call of a non-terminal at position i that
 *   returns to the slot L; its edges lead to the nodes of the callers;
 * - create(L, u, i) makes (or finds) the node v = (L, i) with an edge v → u and
 *   starts the alternatives of the called non-terminal with v; pop(u, j) returns
 *   from u at position j along every edge of u. The pop set P remembers the
 *   returns (u, j), so that an edge added later to u gets them too ("contingent
 *   returns" in create). This is what makes left recursion terminate: a second
 *   call of the same non-terminal at the same position only adds an edge.
 *
 * The papers generate code with one label per slot; this is the equivalent
 * interpreter over grammar slots. The bottom GSS node u₀ = (L₀, 0) stands for
 * the main loop L₀: pop(u₀, j) does nothing, as in the papers. Descriptors are
 * taken from R last in, first out, so the trace reads like recursive descent;
 * the papers allow any order.
 *
 * The derivations are recorded with bsrAdd (see bsr.ts); the word is accepted
 * when the BSR set has an element (S ::= α, 0, k, n).
 */

import { Grammar, Production, END_MARKER, EPSILON } from '../ast/grammar';
import { computeNullable, computeFirst1, computeFollow1, first1OfString } from '../analyser/grammarAnalyser';
import { BSRSet, BSRElement, bsrAdd, bsrDerivations } from './bsr';
import { DerivationNode } from '../generator/wordGenerator';

/** A grammar slot X ::= α · β */
export interface Slot {
  production: Production;
  dot: number;
}

export const slotKey = (s: Slot) => `${s.production.id}.${s.dot}`;

export function formatSlot(s: Slot): string {
  const rhs = [...s.production.rhs];
  rhs.splice(s.dot, 0, '·');
  return `${s.production.lhs} ::= ${rhs.join(' ')}`;
}

export interface GSSNode {
  id: number;
  /** The return slot L (X ::= α Y · β); null for the bottom node u₀ = (L₀, 0) */
  slot: Slot | null;
  /** The position i where Y was called (the left extent of Y) */
  index: number;
  createdAt: number;
}

/** Edge v → u: the call node v returns to its caller u */
export interface GSSEdge {
  from: number;
  to: number;
  createdAt: number;
}

export interface Descriptor {
  id: number;
  slot: Slot;
  node: number;
  index: number;
  addedAt: number;
  /** Step in which it was taken from R (undefined: never, the run stopped) */
  processedAt?: number;
}

/** (u, j) in the pop set P: the call u returned at position j */
export interface PopEntry {
  node: number;
  index: number;
  createdAt: number;
}

export type AddReason = 'start' | 'call' | 'pop' | 'contingent';

export type GLLAction =
  /** a_i = terminal, the dot moves over it */
  | { type: 'match'; slot: Slot; position: number; terminal: string }
  /** the terminal after the dot is not a_i: the descriptor ends */
  | { type: 'mismatch'; slot: Slot; position: number; expected: string; found: string }
  /** test(a_i, X, β) failed before a call: a_i can neither start β nor follow X */
  | { type: 'testFail'; slot: Slot; position: number; lookahead: string }
  /** an alternative was not started: a_i ∉ FIRST(γ) (and not in FOLLOW(Y) when γ ⇒* ε) */
  | { type: 'selectFail'; slot: Slot; position: number; lookahead: string }
  | { type: 'bsrAdd'; slot: Slot; element: BSRElement; isNew: boolean }
  /** create(L, u, i): node v = (L, i), edge v → u */
  | { type: 'create'; slot: Slot; caller: number; node: number; nodeIsNew: boolean; edgeIsNew: boolean; position: number }
  /** an alternative of the called non-terminal, or a return: add(L, u, i) */
  | { type: 'add'; descriptor: number; isNew: boolean; reason: AddReason }
  /** pop(u, j) */
  | { type: 'pop'; node: number; position: number; inPAlready: boolean; base: boolean }
  /** create found (v, j) in P: the new edge gets the old return */
  | { type: 'contingent'; node: number; caller: number; position: number };

export interface GLLStep {
  /** 0 = initialisation (the start descriptors), then one step per descriptor taken from R */
  index: number;
  descriptor?: number;
  actions: GLLAction[];
}

export interface GLLOptions {
  /** The papers' test(a, X, α) before starting an alternative or calling a non-terminal (default true) */
  lookahead?: boolean;
  /** Stop after this many descriptors (default 20 000) */
  maxDescriptors?: number;
  /** Trees listed at most (default 50) */
  maxTrees?: number;
}

export interface GLLResult {
  tokens: string[];
  accepted: boolean;
  steps: GLLStep[];
  descriptors: Descriptor[];
  gssNodes: GSSNode[];
  gssEdges: GSSEdge[];
  popSet: PopEntry[];
  bsr: BSRSet;
  /** Descriptors in R when the run ended (non-empty only when it was stopped) */
  truncated: boolean;
  treeCount: number;
  trees: DerivationNode[];
  moreTrees: boolean;
  stats: { descriptors: number; gssNodes: number; gssEdges: number; popEntries: number; bsrElements: number; duplicateAdds: number };
}

export const BASE_NODE_ID = 0;

export function parseGLL(grammar: Grammar, tokens: string[], options: GLLOptions = {}): GLLResult {
  const lookahead = options.lookahead ?? true;
  const maxDescriptors = options.maxDescriptors ?? 20000;
  const n = tokens.length;

  const nullable = computeNullable(grammar);
  const first1 = computeFirst1(grammar, nullable);
  const follow1 = computeFollow1(grammar, first1, nullable);
  const isNT = (x: string) => grammar.nonTerminals.has(x);
  const byLhs = new Map<string, Production[]>();
  for (const p of grammar.productions) {
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p);
  }
  const symbolAt = (i: number) => (i < n ? tokens[i] : END_MARKER);
  /** test(a, X, α): a ∈ FIRST(α), or α ⇒* ε and a ∈ FOLLOW(X) */
  const test = (i: number, X: string, alpha: string[]) => {
    if (!lookahead) return true;
    const a = symbolAt(i);
    const f = first1OfString(alpha, first1, nullable);
    if (f.has(a) && a !== EPSILON) return true;
    return f.has(EPSILON) && (follow1.get(X)?.has(a) ?? false);
  };

  const steps: GLLStep[] = [];
  const descriptors: Descriptor[] = [];
  const R: number[] = [];
  const U = new Map<string, number>();
  const gssNodes: GSSNode[] = [];
  const nodeByKey = new Map<string, number>();
  const gssEdges: GSSEdge[] = [];
  const edgeKeys = new Set<string>();
  const edgesFrom = new Map<number, number[]>();
  const popSet: PopEntry[] = [];
  const P = new Map<number, number[]>();
  const pKeys = new Set<string>();
  const bsr = new BSRSet();
  let duplicateAdds = 0;
  let step = 0;
  let actions: GLLAction[] = [];

  gssNodes.push({ id: BASE_NODE_ID, slot: null, index: 0, createdAt: 0 });
  nodeByKey.set(`L0|0`, BASE_NODE_ID);

  const add = (slot: Slot, u: number, i: number, reason: AddReason) => {
    const key = `${slotKey(slot)}|${u}|${i}`;
    const known = U.get(key);
    if (known !== undefined) {
      duplicateAdds++;
      actions.push({ type: 'add', descriptor: known, isNew: false, reason });
      return;
    }
    const d: Descriptor = { id: descriptors.length, slot, node: u, index: i, addedAt: step };
    descriptors.push(d);
    U.set(key, d.id);
    R.push(d.id);
    actions.push({ type: 'add', descriptor: d.id, isNew: true, reason });
  };

  const record = (slot: Slot, i: number, k: number, j: number) => {
    const r = bsrAdd(bsr, slot.production, slot.dot, i, k, j, step);
    if (r.element) actions.push({ type: 'bsrAdd', slot, element: r.element, isNew: r.isNew });
  };

  /** The alternatives of Y at position i with the call node v (the code at label L_Y). */
  const callAlternatives = (Y: string, v: number, i: number, reason: AddReason) => {
    // pushed in reverse, so that R (a stack) gives the first alternative first
    const alts = byLhs.get(Y) ?? [];
    const toAdd: Slot[] = [];
    for (const p of alts) {
      const slot = { production: p, dot: 0 };
      if (test(i, Y, p.rhs)) toAdd.push(slot);
      else actions.push({ type: 'selectFail', slot, position: i, lookahead: symbolAt(i) });
    }
    for (let x = toAdd.length - 1; x >= 0; x--) add(toAdd[x], v, i, reason);
  };

  const create = (L: Slot, u: number, i: number) => {
    const key = `${slotKey(L)}|${i}`;
    let v = nodeByKey.get(key);
    const nodeIsNew = v === undefined;
    if (v === undefined) {
      v = gssNodes.length;
      gssNodes.push({ id: v, slot: L, index: i, createdAt: step });
      nodeByKey.set(key, v);
    }
    const ek = `${v}->${u}`;
    const edgeIsNew = !edgeKeys.has(ek);
    actions.push({ type: 'create', slot: L, caller: u, node: v, nodeIsNew, edgeIsNew, position: i });
    if (edgeIsNew) {
      edgeKeys.add(ek);
      gssEdges.push({ from: v, to: u, createdAt: step });
      if (!edgesFrom.has(v)) edgesFrom.set(v, []);
      edgesFrom.get(v)!.push(u);
      for (const j of P.get(v) ?? []) {
        actions.push({ type: 'contingent', node: v, caller: u, position: j });
        record(L, gssNodes[u].index, i, j);
        add(L, u, j, 'contingent');
      }
    }
    return v;
  };

  const pop = (u: number, j: number) => {
    if (u === BASE_NODE_ID) {
      actions.push({ type: 'pop', node: u, position: j, inPAlready: false, base: true });
      return;
    }
    const pk = `${u}|${j}`;
    const inPAlready = pKeys.has(pk);
    actions.push({ type: 'pop', node: u, position: j, inPAlready, base: false });
    if (!inPAlready) {
      pKeys.add(pk);
      popSet.push({ node: u, index: j, createdAt: step });
      if (!P.has(u)) P.set(u, []);
      P.get(u)!.push(j);
    }
    const L = gssNodes[u].slot!;
    for (const v of edgesFrom.get(u) ?? []) {
      record(L, gssNodes[v].index, gssNodes[u].index, j);
      add(L, v, j, 'pop');
    }
  };

  // Initialisation: the alternatives of S with u₀ at position 0
  callAlternatives(grammar.startSymbol, BASE_NODE_ID, 0, 'start');
  steps.push({ index: 0, actions });

  let truncated = false;
  while (R.length > 0) {
    if (descriptors.length > maxDescriptors) {
      truncated = true;
      break;
    }
    step++;
    actions = [];
    const d = descriptors[R.pop()!];
    d.processedAt = step;
    const u = d.node;
    const h = gssNodes[u].index;
    const p = d.slot.production;
    let dot = d.slot.dot;
    let i = d.index;
    if (p.rhs.length === 0) {
      // X ::= ε: bsrAdd(X ::= ·, h, i, i), then return
      record({ production: p, dot: 0 }, h, i, i);
      pop(u, i);
    } else {
      for (;;) {
        if (dot === p.rhs.length) {
          pop(u, i);
          break;
        }
        const x = p.rhs[dot];
        const slot = { production: p, dot };
        if (!isNT(x)) {
          if (i < n && tokens[i] === x) {
            const after = { production: p, dot: dot + 1 };
            actions.push({ type: 'match', slot: after, position: i, terminal: x });
            record(after, h, i, i + 1);
            i++;
            dot++;
            continue;
          }
          actions.push({ type: 'mismatch', slot, position: i, expected: x, found: symbolAt(i) });
          break;
        }
        // A call of the non-terminal x; after the first symbol the papers test the look-ahead first
        if (dot > 0 && !test(i, p.lhs, p.rhs.slice(dot))) {
          actions.push({ type: 'testFail', slot, position: i, lookahead: symbolAt(i) });
          break;
        }
        const v = create({ production: p, dot: dot + 1 }, u, i);
        callAlternatives(x, v, i, 'call');
        break;
      }
    }
    steps.push({ index: step, descriptor: d.id, actions });
  }

  const deriv = bsrDerivations(bsr, grammar, tokens, options.maxTrees ?? 50);
  return {
    tokens,
    accepted: deriv.accepted,
    steps,
    descriptors,
    gssNodes,
    gssEdges,
    popSet,
    bsr,
    truncated,
    treeCount: deriv.treeCount,
    trees: deriv.trees,
    moreTrees: deriv.moreTrees,
    stats: {
      descriptors: descriptors.length,
      gssNodes: gssNodes.length,
      gssEdges: gssEdges.length,
      popEntries: popSet.length,
      bsrElements: bsr.size,
      duplicateAdds
    }
  };
}

/** (L, u, i) with the GSS node by its name u₀, u₁, … (the graph shows what the node is) */
export function formatDescriptor(d: Descriptor): string {
  return `(${formatSlot(d.slot)}, ${gssNodeName(d.node)}, ${d.index})`;
}

export const gssNodeName = (id: number) => (id === BASE_NODE_ID ? 'u₀' : `u${toSub(id)}`);

function toSub(n: number): string {
  return String(n).split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join('');
}

export function formatGSSNode(u: GSSNode): string {
  return u.slot ? `(${formatSlot(u.slot)}, ${u.index})` : `(L₀, ${u.index})`;
}
