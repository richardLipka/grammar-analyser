/**
 * Why a state and its items exist: the transition that created a state, the
 * items of the predecessor that move over its entry symbol, the items a closure
 * item comes from, and the reason of every lookahead of an LR(1)/LALR(1) item.
 */

import { Production, EPSILON } from '../ast/grammar';
import { GrammarAnalysis, first1OfString } from '../analyser/grammarAnalyser';
import { LRAutomaton, LRState } from './lrAutomaton';
import { LR0Item, lr0ItemKey, lr1ItemKey, nextSymbolAfterDot } from './lrItem';

export interface StateEdge {
  from: number;
  symbol: string;
}

/**
 * The transition that created each state: the construction processes the states
 * in the order of their ids and the symbols in a fixed order, so the creator is
 * the first transition into the state in that order. The initial state has none.
 */
export function stateCreators(a: LRAutomaton): (StateEdge | null)[] {
  const creators: (StateEdge | null)[] = a.states.map(() => null);
  for (const s of a.states) {
    for (const [symbol, target] of s.transitions) {
      if (target !== 0 && creators[target] === null) creators[target] = { from: s.id, symbol };
    }
  }
  return creators;
}

/** All transitions into a state, the creating one first. */
export function incomingEdges(a: LRAutomaton, stateId: number): StateEdge[] {
  const edges: StateEdge[] = [];
  for (const s of a.states) {
    for (const [symbol, target] of s.transitions) {
      if (target === stateId) edges.push({ from: s.id, symbol });
    }
  }
  return edges;
}

/** Items of a state with the dot before `symbol`: GOTO(state, symbol) moves the dot over it in exactly these items. */
export function itemsMovingOver(state: LRState, symbol: string): LR0Item[] {
  return state.items0.filter(it => nextSymbolAfterDot(it) === symbol);
}

/** The state reached from an item by moving the dot (undefined for a complete item). */
export function itemTarget(state: LRState, item: LR0Item): number | undefined {
  const sym = nextSymbolAfterDot(item);
  return sym === null ? undefined : state.transitions.get(sym);
}

export const isKernelItem = (it: LR0Item) => it.dotIndex > 0 || it.production.id === 0;

/** Why an item belongs to a state. */
export type ItemReason =
  | { kind: 'initial' }
  /** kernel item: the dot moved over `symbol` in the item `production`@`dotIndex - 1` of state `from` */
  | { kind: 'goto'; from: number; symbol: string }
  /** closure item: the item `parent` of the same state has the dot before the left-hand side */
  | { kind: 'closure'; parent: LR0Item };

/**
 * Order in which the closure reaches the items of a state from its kernel
 * (kernel items have depth 0). Sorting reasons by this depth puts a reason that
 * does not go round in a circle first.
 */
function closureDepth0(state: LRState): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: LR0Item[] = [];
  for (const it of state.items0) {
    if (isKernelItem(it)) {
      depth.set(lr0ItemKey(it), 0);
      queue.push(it);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i];
    const B = nextSymbolAfterDot(parent);
    if (B === null) continue;
    for (const it of state.items0) {
      if (it.dotIndex === 0 && it.production.lhs === B && !depth.has(lr0ItemKey(it))) {
        depth.set(lr0ItemKey(it), depth.get(lr0ItemKey(parent))! + 1);
        queue.push(it);
      }
    }
  }
  return depth;
}

/** Reasons why an item (core) is in the state; the first one is the one the construction used. */
export function explainItem(a: LRAutomaton, stateId: number, item: LR0Item): ItemReason[] {
  const state = a.states[stateId];
  if (item.production.id === 0 && item.dotIndex === 0) return [{ kind: 'initial' }];
  if (item.dotIndex > 0) {
    const symbol = item.production.rhs[item.dotIndex - 1];
    const key = `${item.production.id}@${item.dotIndex - 1}`;
    return incomingEdges(a, stateId)
      .filter(e => e.symbol === symbol && a.states[e.from].items0.some(it => lr0ItemKey(it) === key))
      .map(e => ({ kind: 'goto' as const, from: e.from, symbol }));
  }
  const depth = closureDepth0(state);
  const self = lr0ItemKey(item);
  return state.items0
    .filter(p => nextSymbolAfterDot(p) === item.production.lhs && lr0ItemKey(p) !== self)
    .sort((x, y) => (depth.get(lr0ItemKey(x)) ?? Infinity) - (depth.get(lr0ItemKey(y)) ?? Infinity))
    .map(parent => ({ kind: 'closure' as const, parent }));
}

/** Why a lookahead belongs to an LR(1) item of a state. */
export type LookaheadReason =
  /** [S' → • S, $]: the end marker follows the whole input */
  | { kind: 'initial' }
  /** kernel item: carried over unchanged from [A → α • X β, a] of state `from` by the transition over X */
  | { kind: 'goto'; from: number; symbol: string }
  /** closure item: a ∈ FIRST(β) for the item [A → α • B β] of the same state */
  | { kind: 'first'; parent: LR0Item; beta: string[] }
  /** closure item: β ⇒* ε, so the lookahead a of [A → α • B β, a] is passed on */
  | { kind: 'inherit'; parent: LR0Item; beta: string[] };

export interface LookaheadExplanation {
  reasons: LookaheadReason[];
  /** LALR(1): the merged LR(1) states whose item has this lookahead (all merged states in `mergedFrom`) */
  lr1States?: number[];
  mergedFrom?: number[];
}

/** Depth of every LR(1) item (core + lookahead) in the closure of the kernel, see closureDepth0. */
function closureDepth1(state: LRState, analysis: GrammarAnalysis): Map<string, number> {
  const items = state.items1 || [];
  const depth = new Map<string, number>();
  const queue = items.filter(isKernelItem);
  for (const it of queue) depth.set(lr1ItemKey(it), 0);
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i];
    const B = nextSymbolAfterDot(parent);
    if (B === null) continue;
    const first = first1OfString([...parent.production.rhs.slice(parent.dotIndex + 1), parent.lookahead], analysis.first1, analysis.nullable);
    for (const it of items) {
      if (it.dotIndex === 0 && it.production.lhs === B && first.has(it.lookahead) && !depth.has(lr1ItemKey(it))) {
        depth.set(lr1ItemKey(it), depth.get(lr1ItemKey(parent))! + 1);
        queue.push(it);
      }
    }
  }
  return depth;
}

/**
 * Reasons why `lookahead` is in the lookahead set of the item production@dotIndex
 * of a state of an LR(1) or LALR(1) automaton. The first reason is the one the
 * closure reaches first, so following first reasons never goes round in a circle.
 * An empty list would mean the lookahead has no justification (a bug).
 */
export function explainLookahead(
  a: LRAutomaton,
  analysis: GrammarAnalysis,
  stateId: number,
  production: Production,
  dotIndex: number,
  lookahead: string,
  lr1?: LRAutomaton
): LookaheadExplanation {
  const state = a.states[stateId];
  const items = state.items1 || [];
  const has = (s: LRState, prodId: number, dot: number, la: string) =>
    (s.items1 || []).some(it => it.production.id === prodId && it.dotIndex === dot && it.lookahead === la);
  const result: LookaheadExplanation = { reasons: [] };

  if (state.mergedFrom && lr1) {
    result.mergedFrom = state.mergedFrom;
    result.lr1States = state.mergedFrom.filter(id => has(lr1.states[id], production.id, dotIndex, lookahead));
  }

  if (production.id === 0 && dotIndex === 0) {
    result.reasons.push({ kind: 'initial' });
  } else if (dotIndex > 0) {
    const symbol = production.rhs[dotIndex - 1];
    for (const e of incomingEdges(a, stateId)) {
      if (e.symbol === symbol && has(a.states[e.from], production.id, dotIndex - 1, lookahead)) {
        result.reasons.push({ kind: 'goto', from: e.from, symbol });
      }
    }
  } else {
    const depth = closureDepth1(state, analysis);
    const self = `${production.id}@0`;
    const found: { reason: LookaheadReason; depth: number }[] = [];
    const seen = new Set<string>();
    for (const parent of items) {
      if (nextSymbolAfterDot(parent) !== production.lhs) continue;
      const core = lr0ItemKey(parent);
      if (seen.has(core)) continue;
      seen.add(core);
      const beta = parent.production.rhs.slice(parent.dotIndex + 1);
      const first = first1OfString(beta, analysis.first1, analysis.nullable);
      const parentItem = { production: parent.production, dotIndex: parent.dotIndex };
      const coreItems = items.filter(it => lr0ItemKey(it) === core);
      const minDepth = Math.min(...coreItems.map(it => depth.get(lr1ItemKey(it)) ?? Infinity));
      if (first.has(lookahead)) {
        found.push({ reason: { kind: 'first', parent: parentItem, beta }, depth: minDepth });
      }
      // β ⇒* ε: the parent's own lookahead is passed on (not from the item itself, that would be a circle)
      if (first.has(EPSILON) && core !== self && coreItems.some(it => it.lookahead === lookahead)) {
        const d = depth.get(lr1ItemKey({ ...parentItem, lookahead })) ?? Infinity;
        found.push({ reason: { kind: 'inherit', parent: parentItem, beta }, depth: d });
      }
    }
    found.sort((x, y) => x.depth - y.depth);
    result.reasons = found.map(f => f.reason);
  }
  return result;
}
