/**
 * The construction of an LR automaton step by step, the merging of LR(1)
 * states into LALR(1) states, and the cores of IELR(1) (merged or split).
 *
 * The builders number the states in the order they are created: they take the
 * states one by one (by number) and for every symbol in a fixed order compute
 * GOTO; the result is either a new state (the next number) or an existing one.
 * The steps are therefore read off the finished automaton: the transitions of
 * the states in order, a target being new when it is the next number.
 */

import { LRAutomaton, LRState, IELRSplitReason } from './lrAutomaton';
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


/** One LR(0) core in IELR(1): its LR(1) states, how IELR(1) grouped them, and why. */
export interface IELRSplitGroup {
  coreKey: string;
  items: LR0Item[];
  /** The IELR(1) states with this core */
  ielrStates: number[];
  /** The LR(1) states merged into each of the IELR(1) states */
  lr1States: number[][];
  /** The core has more than one IELR(1) state */
  isSplit: boolean;
  /** The LALR(1) state with this core (missing only with non-generating symbols) */
  lalrState?: number;
  /** Lookaheads per item in each IELR(1) state, and in the LALR(1) state */
  rows: { item: LR0Item; perIelrState: string[][]; lalrUnion: string[] }[];
  /** Why the LR(1) states of the core were not all merged (distinct reasons, in the order of the splits) */
  reasons: IELRSplitReason[];
  /** Conflicts of the LALR(1) state that no LR(1) state of this core has on that symbol: caused by merging, IELR(1) avoids them */
  mergeConflicts: { symbol: string; actions: LRAction[] }[];
  /**
   * Conflicts left in the IELR(1) states of this core, with the merged LR(1)
   * states that have a conflict on that symbol too, and those that have a
   * single action there (the same one the conflict is resolved to)
   */
  remainingConflicts: { state: number; symbol: string; actions: LRAction[]; lr1WithConflict: number[]; lr1WithoutConflict: number[] }[];
}

/**
 * The cores of the IELR(1) automaton (see buildIELR1Automaton), split ones
 * first. Conflicts are taken from the tables as given (with precedence if the
 * tables use it), all three tables built the same way.
 */
export function ielrSplitGroups(
  ielr: LRAutomaton,
  lr1: LRAutomaton,
  lalr: LRAutomaton,
  lalrTable: LRTable,
  lr1Table: LRTable,
  ielrTable?: LRTable
): IELRSplitGroup[] {
  const isKernel = (it: LR0Item) => it.dotIndex > 0 || it.production.id === 0;
  const coreKey = (items: LR0Item[]) => [...new Set(items.filter(isKernel).map(lr0ItemKey))].sort().join('|');
  const lookaheads = (s: LRState, key: string) => (s.items1 || []).filter(it => lr0ItemKey(it) === key).map(it => it.lookahead).sort();
  const reasonKey = (r: IELRSplitReason) =>
    r.kind === 'successor' ? `succ|${r.symbol}` : `conf|${r.symbol}|${r.merged.map(a => a.type + (a.production?.id ?? '')).join(',')}`;

  const lalrByCore = new Map(lalr.states.map(s => [coreKey(s.items0), s] as const));
  const ielrByCore = new Map<string, LRState[]>();
  for (const s of ielr.states) {
    const k = coreKey(s.items0);
    if (!ielrByCore.has(k)) ielrByCore.set(k, []);
    ielrByCore.get(k)!.push(s);
  }

  const result: IELRSplitGroup[] = [];
  for (const [k, states] of ielrByCore) {
    const lalrState = lalrByCore.get(k);
    const lr1States = states.map(s => s.mergedFrom ?? []);
    const allLr1 = lr1States.flat();
    const rows = states[0].items0.map(item => {
      const key = lr0ItemKey(item);
      const perIelrState = states.map(st => lookaheads(st, key));
      const lalrUnion = lalrState ? lookaheads(lalrState, key) : [...new Set(perIelrState.flat())].sort();
      return { item, perIelrState, lalrUnion };
    });
    const seen = new Set<string>();
    const reasons: IELRSplitReason[] = [];
    for (const s of states) {
      for (const r of s.splitReasons ?? []) {
        if (seen.has(reasonKey(r))) continue;
        seen.add(reasonKey(r));
        reasons.push(r);
      }
    }
    const mergeConflicts = lalrState
      ? lalrTable.conflicts
          .filter(c => c.stateId === lalrState.id)
          .filter(c => !lr1Table.conflicts.some(d => allLr1.includes(d.stateId) && d.symbol === c.symbol))
          .map(c => ({ symbol: c.symbol, actions: c.actions }))
      : [];
    const ids = states.map(s => s.id);
    const remainingConflicts = (ielrTable?.conflicts ?? [])
      .filter(c => ids.includes(c.stateId))
      .map(c => {
        const merged = ielr.states[c.stateId].mergedFrom ?? [];
        const withConflict = merged.filter(id => lr1Table.conflicts.some(d => d.stateId === id && d.symbol === c.symbol));
        const withoutConflict = merged.filter(id => !withConflict.includes(id) && (lr1Table.actionTable.get(id)?.get(c.symbol)?.length ?? 0) > 0);
        return { state: c.stateId, symbol: c.symbol, actions: c.actions, lr1WithConflict: withConflict, lr1WithoutConflict: withoutConflict };
      });
    result.push({ coreKey: k, items: states[0].items0, ielrStates: ids, lr1States, isSplit: states.length > 1, lalrState: lalrState?.id, rows, reasons, mergeConflicts, remainingConflicts });
  }

  return result.sort((a, b) => (a.isSplit !== b.isSplit ? (a.isSplit ? -1 : 1) : a.ielrStates[0] - b.ielrStates[0]));
}
