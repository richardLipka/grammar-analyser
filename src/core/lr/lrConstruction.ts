/**
 * The construction of an LR automaton step by step, and the merging of LR(1)
 * states into LALR(1) states.
 *
 * The builders number the states in the order they are created: they take the
 * states one by one (by number) and for every symbol in a fixed order compute
 * GOTO; the result is either a new state (the next number) or an existing one.
 * The steps are therefore read off the finished automaton: the transitions of
 * the states in order, a target being new when it is the next number.
 */

import { LRAutomaton, LRState } from './lrAutomaton';
import { LRTable, LRAction } from './lrTable';
import { LR0Item, LR1Item, lr0ItemKey, nextSymbolAfterDot } from './lrItem';

export type ConstructionStep =
  /** I₀ = CLOSURE({S' → • S}) */
  | { kind: 'initial' }
  /** GOTO(I_from, symbol) = I_to, a new state or one that already exists */
  | { kind: 'goto'; from: number; symbol: string; to: number; isNew: boolean };

export function constructionSteps(a: LRAutomaton): ConstructionStep[] {
  const steps: ConstructionStep[] = [{ kind: 'initial' }];
  let next = 1;
  for (const s of a.states) {
    for (const [symbol, to] of s.transitions) {
      const isNew = to === next;
      if (isNew) next++;
      steps.push({ kind: 'goto', from: s.id, symbol, to, isNew });
    }
  }
  return steps;
}

/** States and transitions that exist after the step `upTo` (index into the steps). */
export function constructedSoFar(steps: ConstructionStep[], upTo: number): { states: number; edges: Set<string> } {
  let states = 1;
  const edges = new Set<string>();
  for (let i = 1; i <= upTo && i < steps.length; i++) {
    const st = steps[i];
    if (st.kind !== 'goto') continue;
    edges.add(`${st.from}|${st.symbol}`);
    if (st.isNew) states = Math.max(states, st.to + 1);
  }
  return { states, edges };
}

/** The items of `state` whose dot moves over `symbol` (with lookaheads for LR(1)). */
export function movedItems(state: LRState, symbol: string): (LR0Item | LR1Item)[] {
  const items = state.items1 ?? state.items0;
  return items.filter(it => nextSymbolAfterDot(it) === symbol);
}

/** One merge of LR(1) states with the same core into an LALR(1) state. */
export interface MergeStep {
  lalrState: number;
  lr1States: number[];
  /** Per item core: the lookaheads in every merged LR(1) state, and their union */
  rows: { item: LR0Item; perState: string[][]; union: string[] }[];
  /** Conflicts of the LALR(1) state that none of the merged LR(1) states had on that symbol */
  newConflicts: { symbol: string; actions: LRAction[] }[];
}

/**
 * The merges of LR(1) states with equal cores (LALR(1) states with more than
 * one LR(1) state, see attachMergedLR1States), in the order of the LALR(1)
 * states. Conflicts are taken from the tables as given (with precedence if
 * the tables use it).
 */
export function mergeSteps(lalr: LRAutomaton, lr1: LRAutomaton, lalrTable: LRTable, lr1Table: LRTable): MergeStep[] {
  const steps: MergeStep[] = [];
  for (const s of lalr.states) {
    const group = s.mergedFrom || [];
    if (group.length < 2) continue;
    const rows = s.items0.map(item => {
      const key = lr0ItemKey(item);
      const perState = group.map(id => (lr1.states[id].items1 || []).filter(it => lr0ItemKey(it) === key).map(it => it.lookahead).sort());
      return { item, perState, union: [...new Set(perState.flat())].sort() };
    });
    const newConflicts = lalrTable.conflicts
      .filter(c => c.stateId === s.id)
      .filter(c => !lr1Table.conflicts.some(d => group.includes(d.stateId) && d.symbol === c.symbol))
      .map(c => ({ symbol: c.symbol, actions: c.actions }));
    steps.push({ lalrState: s.id, lr1States: group, rows, newConflicts });
  }
  return steps;
}
