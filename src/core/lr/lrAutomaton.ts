/**
 * Canonical Collection of LR Item Sets and Automaton Construction
 * Builds LR(0), SLR(1), LALR(1), and LR(1) automata.
 *
 * - LR(0)/SLR(1): the canonical collection of LR(0) items.
 * - LR(1): the canonical collection of LR(1) items.
 * - LALR(1): the LR(0) collection with lookaheads found by spontaneous
 *   generation and propagation (Aho, Lam, Sethi, Ullman, 2nd ed., Alg. 4.62
 *   and 4.63). For a grammar without non-generating symbols this is the same
 *   as merging the LR(1) states with equal cores, but it does not need the
 *   (much larger) LR(1) collection; attachMergedLR1States records afterwards
 *   which LR(1) states a state corresponds to.
 *
 * The builders are jobs (see jobs/job.ts): they yield after every state, so the
 * UI can run them in slices and stop them; stopped, they return null.
 */

import { Grammar, Production, END_MARKER, cloneGrammar, EPSILON, toSubscript } from '../ast/grammar';
import { GrammarAnalysis, first1OfString } from '../analyser/grammarAnalyser';
import { Job, JobControl, runJob, runToEnd, ticker } from '../jobs/job';
import { LR0Item, LR1Item, lr0ItemKey, lr1ItemKey, nextSymbolAfterDot } from './lrItem';

export type LRVariant = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'IELR(1)' | 'LR(1)';

export interface LRState {
  id: number;
  items0: LR0Item[];
  items1?: LR1Item[];
  transitions: Map<string, number>; // symbol -> targetStateId
  isAccepting?: boolean;
  /** LALR(1) / IELR(1): ids of the LR(1) states with the same core (set by attachMergedLR1States) */
  mergedFrom?: number[];
  /** IELR(1): true if this state was split from an LALR core to isolate lookaheads and eliminate spurious conflicts */
  isSplit?: boolean;
  /** IELR(1): educational explanation of lookahead isolation */
  ielrAnnotation?: { en: string; cz: string };
}

/**
 * Name of a state as in the KIV/FJP lectures: the symbol that leads into the
 * state (every state except the initial one is entered by exactly one symbol),
 * with a subscript when several states share it (E₁, E₂); the initial state is #.
 */
export interface LRStateName {
  symbol: string;
  index?: number;
  /** symbol + subscript index, e.g. "E₁" */
  text: string;
}

export interface LRAutomaton {
  variant: LRVariant;
  states: LRState[];
  augmentedStartSymbol: string;
  augmentedProduction: Production;
  symbols: string[]; // all non-terminals + terminals
  /** Lecture names of the states, indexed by state id */
  stateNames: LRStateName[];
}

export const INITIAL_STATE_SYMBOL = '#';

/** Names the states by the symbols leading into them, numbering repeated symbols in creation order. */
export function nameStates(states: LRState[]): LRStateName[] {
  const entry = new Map<number, string>();
  for (const s of states) {
    for (const [sym, target] of s.transitions) entry.set(target, sym);
  }
  const total = new Map<string, number>();
  for (const sym of entry.values()) total.set(sym, (total.get(sym) || 0) + 1);
  const used = new Map<string, number>();
  return states.map(s => {
    const symbol = entry.get(s.id);
    if (symbol === undefined) return { symbol: INITIAL_STATE_SYMBOL, text: INITIAL_STATE_SYMBOL };
    // A terminal '#' would read like the initial state, so it is always numbered
    if (total.get(symbol) === 1 && symbol !== INITIAL_STATE_SYMBOL) return { symbol, text: symbol };
    const index = (used.get(symbol) || 0) + 1;
    used.set(symbol, index);
    return { symbol, index, text: symbol + toSubscript(index) };
  });
}

/**
 * Augment grammar with S' -> S
 */
export function augmentGrammar(g: Grammar): { grammar: Grammar; augmentedProd: Production } {
  const augmented = cloneGrammar(g);
  let newStart = `${g.startSymbol}'`;
  while (augmented.nonTerminals.has(newStart)) {
    newStart = `${newStart}'`;
  }
  augmented.nonTerminals.add(newStart);

  const augmentedProd: Production = {
    id: 0,
    lhs: newStart,
    rhs: [g.startSymbol]
  };

  augmented.productions.unshift(augmentedProd);
  augmented.startSymbol = newStart;

  return { grammar: augmented, augmentedProd };
}

/** Rules indexed by their left-hand side. */
function rulesByLhs(g: Grammar): Map<string, Production[]> {
  const by = new Map<string, Production[]>();
  for (const p of g.productions) {
    if (!by.has(p.lhs)) by.set(p.lhs, []);
    by.get(p.lhs)!.push(p);
  }
  return by;
}

const isKernel = (it: LR0Item) => it.dotIndex > 0 || it.production.id === 0;

/** CLOSURE of LR(0) items (worklist; the rules of a non-terminal are added once). */
function closure0(kernel: LR0Item[], byLhs: Map<string, Production[]>, nonTerminals: Set<string>): LR0Item[] {
  const result = [...kernel];
  const seen = new Set(kernel.map(lr0ItemKey));
  const expanded = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    const B = nextSymbolAfterDot(result[i]);
    if (B === null || !nonTerminals.has(B) || expanded.has(B)) continue;
    expanded.add(B);
    for (const p of byLhs.get(B) || []) {
      const item = { production: p, dotIndex: 0 };
      const key = lr0ItemKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
  }
  return result;
}

/** The kernels GOTO(I, X) for all X at once, in the order of `symbols`. */
function gotoKernels<T extends LR0Item>(items: T[], symbols: string[], move: (it: T) => T): [string, T[]][] {
  const by = new Map<string, T[]>();
  for (const it of items) {
    const X = nextSymbolAfterDot(it);
    if (X === null) continue;
    if (!by.has(X)) by.set(X, []);
    by.get(X)!.push(move(it));
  }
  return symbols.filter(X => by.has(X)).map(X => [X, by.get(X)!]);
}

const isAcceptItem = (it: LR0Item) => it.production.id === 0 && it.dotIndex === it.production.rhs.length;

/**
 * Build LR(0) / SLR(1) Automaton
 */
export function buildLR0Automaton(g: Grammar, variant: 'LR(0)' | 'SLR(1)' = 'LR(0)'): LRAutomaton {
  return runJob(buildLR0AutomatonSteps(g, variant, runToEnd()))!;
}

export function* buildLR0AutomatonSteps(g: Grammar, variant: 'LR(0)' | 'SLR(1)', control: JobControl): Job<LRAutomaton | null> {
  const { grammar: augGrammar, augmentedProd } = augmentGrammar(g);
  const byLhs = rulesByLhs(augGrammar);
  const nts = augGrammar.nonTerminals;
  const allSymbols = [...augGrammar.nonTerminals, ...augGrammar.terminals].filter(s => s !== augGrammar.startSymbol);
  const kernelKey = (items: LR0Item[]) => items.map(lr0ItemKey).sort().join('|');

  const initial = closure0([{ production: augmentedProd, dotIndex: 0 }], byLhs, nts);
  const states: LRState[] = [{ id: 0, items0: initial, transitions: new Map(), isAccepting: initial.some(isAcceptItem) }];
  const ids = new Map<string, number>([[kernelKey(initial.filter(isKernel)), 0]]);
  const tick = ticker(25);

  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    for (const [sym, kernel] of gotoKernels(state.items0, allSymbols, it => ({ production: it.production, dotIndex: it.dotIndex + 1 }))) {
      const key = kernelKey(kernel);
      let target = ids.get(key);
      if (target === undefined) {
        target = states.length;
        ids.set(key, target);
        const items0 = closure0(kernel, byLhs, nts);
        states.push({ id: target, items0, transitions: new Map(), isAccepting: items0.some(isAcceptItem) });
      }
      state.transitions.set(sym, target);
    }
    if (tick()) {
      yield { en: `${variant} automaton: ${states.length} states`, cz: `automat ${variant}: ${states.length} stavů` };
      if (control.stop) return null;
    }
  }

  return {
    variant,
    states,
    augmentedStartSymbol: augGrammar.startSymbol,
    augmentedProduction: augmentedProd,
    symbols: allSymbols,
    stateNames: nameStates(states)
  };
}

/** FIRST(β a) for LR(1) items, with FIRST(β) and "β ⇒* ε" cached per item core. */
function lookaheadFirst(analysis: GrammarAnalysis) {
  const cache = new Map<string, { first: string[]; nullable: boolean }>();
  return (p: Production, dot: number): { first: string[]; nullable: boolean } => {
    const key = `${p.id}@${dot}`;
    let r = cache.get(key);
    if (!r) {
      const f = first1OfString(p.rhs.slice(dot + 1), analysis.first1, analysis.nullable);
      r = { first: [...f].filter(x => x !== EPSILON), nullable: f.has(EPSILON) };
      cache.set(key, r);
    }
    return r;
  };
}

/** CLOSURE of LR(1) items: [A → α • B β, a] adds [B → • γ, b] for b ∈ FIRST(β a). */
function closure1(
  kernel: LR1Item[],
  byLhs: Map<string, Production[]>,
  nonTerminals: Set<string>,
  firstOf: (p: Production, dot: number) => { first: string[]; nullable: boolean }
): LR1Item[] {
  const result = [...kernel];
  const seen = new Set(kernel.map(lr1ItemKey));
  for (let i = 0; i < result.length; i++) {
    const it = result[i];
    const B = nextSymbolAfterDot(it);
    if (B === null || !nonTerminals.has(B)) continue;
    const { first, nullable } = firstOf(it.production, it.dotIndex);
    const lookaheads = nullable ? [...first, it.lookahead] : first;
    for (const p of byLhs.get(B) || []) {
      for (const b of lookaheads) {
        const item = { production: p, dotIndex: 0, lookahead: b };
        const key = lr1ItemKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      }
    }
  }
  return result;
}

function uniqueLR0Items(items1: LR1Item[]): LR0Item[] {
  const seen = new Set<string>();
  const res: LR0Item[] = [];
  for (const it of items1) {
    const key = lr0ItemKey(it);
    if (!seen.has(key)) {
      seen.add(key);
      res.push({ production: it.production, dotIndex: it.dotIndex });
    }
  }
  return res;
}

/**
 * Build Canonical LR(1) Automaton
 */
export function buildLR1Automaton(g: Grammar, analysis: GrammarAnalysis): LRAutomaton {
  return runJob(buildLR1AutomatonSteps(g, analysis, runToEnd()))!;
}

export function* buildLR1AutomatonSteps(g: Grammar, analysis: GrammarAnalysis, control: JobControl): Job<LRAutomaton | null> {
  const { grammar: augGrammar, augmentedProd } = augmentGrammar(g);
  const byLhs = rulesByLhs(augGrammar);
  const nts = augGrammar.nonTerminals;
  const firstOf = lookaheadFirst(analysis);
  const allSymbols = [...augGrammar.nonTerminals, ...augGrammar.terminals].filter(s => s !== augGrammar.startSymbol);
  const kernelKey = (items: LR1Item[]) => items.map(lr1ItemKey).sort().join('|');
  const accepting = (items: LR1Item[]) => items.some(it => isAcceptItem(it) && it.lookahead === END_MARKER);

  const initial = closure1([{ production: augmentedProd, dotIndex: 0, lookahead: END_MARKER }], byLhs, nts, firstOf);
  const states: LRState[] = [{ id: 0, items0: uniqueLR0Items(initial), items1: initial, transitions: new Map(), isAccepting: accepting(initial) }];
  const ids = new Map<string, number>([[kernelKey(initial.filter(isKernel)), 0]]);
  const tick = ticker(10);

  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    for (const [sym, kernel] of gotoKernels(state.items1!, allSymbols, it => ({ production: it.production, dotIndex: it.dotIndex + 1, lookahead: it.lookahead }))) {
      const key = kernelKey(kernel);
      let target = ids.get(key);
      if (target === undefined) {
        target = states.length;
        ids.set(key, target);
        const items1 = closure1(kernel, byLhs, nts, firstOf);
        states.push({ id: target, items0: uniqueLR0Items(items1), items1, transitions: new Map(), isAccepting: accepting(items1) });
      }
      state.transitions.set(sym, target);
    }
    if (tick()) {
      yield { en: `LR(1) automaton: ${states.length} states`, cz: `automat LR(1): ${states.length} stavů` };
      if (control.stop) return null;
    }
  }

  return {
    variant: 'LR(1)',
    states,
    augmentedStartSymbol: augGrammar.startSymbol,
    augmentedProduction: augmentedProd,
    symbols: allSymbols,
    stateNames: nameStates(states)
  };
}

/**
 * Build the LALR(1) automaton: the LR(0) collection with lookaheads determined
 * by spontaneous generation and propagation (Dragon Book, Alg. 4.62/4.63).
 * An existing LR(0) automaton of the grammar can be passed in.
 */
export function buildLALR1Automaton(g: Grammar, analysis: GrammarAnalysis, lr0?: LRAutomaton): LRAutomaton {
  return runJob(buildLALR1AutomatonSteps(g, analysis, runToEnd(), lr0))!;
}

export function* buildLALR1AutomatonSteps(
  g: Grammar,
  analysis: GrammarAnalysis,
  control: JobControl,
  lr0Given?: LRAutomaton
): Job<LRAutomaton | null> {
  const lr0 = lr0Given ?? (yield* buildLR0AutomatonSteps(g, 'LR(0)', control));
  if (!lr0) return null;
  const { grammar: augGrammar } = augmentGrammar(g);
  const byLhs = rulesByLhs(augGrammar);
  const nts = augGrammar.nonTerminals;
  const firstOf = lookaheadFirst(analysis);
  const DUMMY = '\u0000#';
  const tick = ticker(25);

  // Lookahead sets of the kernel items, keyed "state:prodId@dot"
  const kkey = (state: number, it: LR0Item) => `${state}:${lr0ItemKey(it)}`;
  const la = new Map<string, Set<string>>();
  for (const s of lr0.states) for (const it of s.items0.filter(isKernel)) la.set(kkey(s.id, it), new Set());
  la.get(kkey(0, { production: lr0.augmentedProduction, dotIndex: 0 }))!.add(END_MARKER);

  // 1. Spontaneous lookaheads and propagation links: CLOSURE({[K, #]}) for every kernel item K
  const propagate = new Map<string, string[]>();
  const spontaneous: { from: string; to: string; a: string }[] = [];
  // CLOSURE({[K, #]}) depends only on the item K, not on its state
  const dummyClosure = new Map<string, LR1Item[]>();
  for (const s of lr0.states) {
    for (const K of s.items0.filter(isKernel)) {
      const from = kkey(s.id, K);
      let closure = dummyClosure.get(lr0ItemKey(K));
      if (!closure) {
        closure = closure1([{ production: K.production, dotIndex: K.dotIndex, lookahead: DUMMY }], byLhs, nts, firstOf);
        dummyClosure.set(lr0ItemKey(K), closure);
      }
      for (const it of closure) {
        const X = nextSymbolAfterDot(it);
        if (X === null) continue;
        const target = s.transitions.get(X);
        if (target === undefined) continue;
        const to = kkey(target, { production: it.production, dotIndex: it.dotIndex + 1 });
        if (it.lookahead === DUMMY) {
          if (!propagate.has(from)) propagate.set(from, []);
          propagate.get(from)!.push(to);
        } else {
          spontaneous.push({ from, to, a: it.lookahead });
        }
      }
    }
    if (tick()) {
      yield { en: `LALR(1) lookaheads: state ${s.id + 1} of ${lr0.states.length}`, cz: `LALR(1) – symboly dopředu: stav ${s.id + 1} z ${lr0.states.length}` };
      if (control.stop) return null;
    }
  }

  // 2. Propagation until nothing changes. A spontaneous lookahead counts once the
  //    kernel item it comes from has a lookahead itself: with a non-generating
  //    symbol some kernel items never get one, and nothing derived from them is
  //    valid (for other grammars every kernel item has a lookahead, so this is
  //    the textbook algorithm)
  for (let changed = true; changed; ) {
    changed = false;
    for (const { from, to, a } of spontaneous) {
      const dst = la.get(to)!;
      if (!dst.has(a) && la.get(from)!.size > 0) {
        dst.add(a);
        changed = true;
      }
    }
    for (const [from, tos] of propagate) {
      const src = la.get(from)!;
      for (const to of tos) {
        const dst = la.get(to)!;
        for (const a of src) {
          if (!dst.has(a)) {
            dst.add(a);
            changed = true;
          }
        }
      }
    }
    yield undefined;
    if (control.stop) return null;
  }

  // 3. Items of every state: the closure of its kernel with the lookaheads found,
  //    in the order of the LR(0) items, lookaheads sorted
  const states: LRState[] = lr0.states.map(s => {
    const kernel: LR1Item[] = [];
    for (const it of s.items0.filter(isKernel)) {
      for (const a of la.get(kkey(s.id, it))!) kernel.push({ production: it.production, dotIndex: it.dotIndex, lookahead: a });
    }
    const byCore = new Map<string, Set<string>>();
    for (const it of closure1(kernel, byLhs, nts, firstOf)) {
      const core = lr0ItemKey(it);
      if (!byCore.has(core)) byCore.set(core, new Set());
      byCore.get(core)!.add(it.lookahead);
    }
    const items1: LR1Item[] = [];
    for (const it of s.items0) {
      for (const a of [...(byCore.get(lr0ItemKey(it)) || [])].sort()) {
        items1.push({ production: it.production, dotIndex: it.dotIndex, lookahead: a });
      }
    }
    return {
      id: s.id,
      items0: s.items0,
      items1,
      transitions: new Map(s.transitions),
      isAccepting: items1.some(it => isAcceptItem(it) && it.lookahead === END_MARKER)
    };
  });

  return {
    variant: 'LALR(1)',
    states,
    augmentedStartSymbol: lr0.augmentedStartSymbol,
    augmentedProduction: lr0.augmentedProduction,
    symbols: lr0.symbols,
    stateNames: lr0.stateNames
  };
}

/**
 * Records in every LALR(1) state the LR(1) states with the same core
 * (LALR(1) = LR(1) with the states of equal cores merged). LR(1) states whose
 * core is not an LR(0) state (only with non-generating symbols) are skipped.
 */
export function attachMergedLR1States(lalr: LRAutomaton, lr1: LRAutomaton): void {
  const core = (s: LRState) => [...new Set(s.items0.filter(isKernel).map(lr0ItemKey))].sort().join('|');
  const byCore = new Map(lalr.states.map(s => [core(s), s] as const));
  for (const s of lalr.states) s.mergedFrom = [];
  for (const s of lr1.states) byCore.get(core(s))?.mergedFrom!.push(s.id);
}

/**
 * Build the IELR(1) automaton (Inadequacy Elimination LR(1) - Denny & Malloy 2008, 2010).
 *
 * Starts from the canonical LR(1) automaton. Partitions the LR(1) states by their LR(0) core.
 * Detects whether merging the core group introduces any spurious conflicts (inadequacies that do
 * not exist in any constituent LR(1) state).
 * If spurious conflicts exist, splits only the necessary states so that conflicting lookaheads
 * are segregated into distinct sub-states, propagating splits backward only where needed to preserve
 * deterministic transitions.
 *
 * If the grammar has no spurious conflicts, produces the exact same number of states as LALR(1).
 * If the grammar is LR(1) but not LALR(1), eliminates all spurious conflicts without the state explosion
 * of canonical LR(1).
 */
export function buildIELR1Automaton(
  g: Grammar,
  analysis: GrammarAnalysis,
  lr1Given?: LRAutomaton
): LRAutomaton {
  return runJob(buildIELR1AutomatonSteps(g, analysis, runToEnd(), lr1Given))!;
}

export function* buildIELR1AutomatonSteps(
  g: Grammar,
  analysis: GrammarAnalysis,
  control: JobControl,
  lr1Given?: LRAutomaton
): Job<LRAutomaton | null> {
  const lr1 = lr1Given ?? (yield* buildLR1AutomatonSteps(g, analysis, control));
  if (!lr1) return null;

  yield { en: 'IELR(1): analyzing spurious conflicts and state partitioning', cz: 'IELR(1): analýza parazitních kolizí a dělení stavů' };
  if (control.stop) return null;

  const coreKeyOf = (s: LRState) => [...new Set(s.items0.filter(isKernel).map(lr0ItemKey))].sort().join('|');

  // 1. Initial partition: group LR(1) states by LR(0) core
  const coreMap = new Map<string, number[]>();
  for (const s of lr1.states) {
    const k = coreKeyOf(s);
    if (!coreMap.has(k)) coreMap.set(k, []);
    coreMap.get(k)!.push(s.id);
  }

  // A partition is a list of blocks, where each block is an array of LR(1) state IDs
  let partition: number[][] = Array.from(coreMap.values());

  // Helper: actions of an individual LR(1) state
  const stateActions = (sId: number): Map<string, Set<string>> => {
    const s = lr1.states[sId];
    const acts = new Map<string, Set<string>>();
    const addAct = (sym: string, desc: string) => {
      if (!acts.has(sym)) acts.set(sym, new Set());
      acts.get(sym)!.add(desc);
    };
    if (s.items1) {
      for (const it of s.items1) {
        if (it.dotIndex === it.production.rhs.length) {
          if (it.production.id === 0 && it.lookahead === END_MARKER) {
            addAct(END_MARKER, 'accept');
          } else if (it.production.id !== 0) {
            addAct(it.lookahead, `r${it.production.id}`);
          }
        } else {
          const X = it.production.rhs[it.dotIndex];
          if (g.terminals.has(X)) {
            addAct(X, 'shift');
          }
        }
      }
    }
    return acts;
  };

  // Precompute actions of individual canonical LR(1) states
  const individualActions = new Map<number, Map<string, Set<string>>>();
  for (const s of lr1.states) {
    individualActions.set(s.id, stateActions(s.id));
  }

  const hasIndividualConflict = (sId: number, t: string, actA: string, actB: string) => {
    const acts = individualActions.get(sId)?.get(t);
    return acts ? acts.has(actA) && acts.has(actB) : false;
  };

  // Partition refinement loop:
  // Iterate until no block has spurious conflicts, and transitions between blocks are deterministic.
  let changed = true;
  while (changed) {
    changed = false;
    yield undefined;
    if (control.stop) return null;

    // Map each LR(1) state ID to its current block index
    const stateToBlock = new Map<number, number>();
    for (let bIdx = 0; bIdx < partition.length; bIdx++) {
      for (const sId of partition[bIdx]) stateToBlock.set(sId, bIdx);
    }

    const nextPartition: number[][] = [];

    for (const block of partition) {
      if (block.length <= 1) {
        nextPartition.push(block);
        continue;
      }

      // Check for spurious conflicts within block
      const blockActions = new Map<string, Set<string>>();
      for (const sId of block) {
        const sActs = individualActions.get(sId)!;
        for (const [t, acts] of sActs.entries()) {
          if (!blockActions.has(t)) blockActions.set(t, new Set());
          for (const a of acts) blockActions.get(t)!.add(a);
        }
      }

      let spuriousToken: string | null = null;
      for (const [t, acts] of blockActions.entries()) {
        if (acts.size > 1) {
          const actArr = Array.from(acts);
          for (let i = 0; i < actArr.length; i++) {
            for (let j = i + 1; j < actArr.length; j++) {
              const a1 = actArr[i];
              const a2 = actArr[j];
              const genuine = block.some(sId => hasIndividualConflict(sId, t, a1, a2));
              if (!genuine) {
                spuriousToken = t;
                break;
              }
            }
            if (spuriousToken) break;
          }
        }
        if (spuriousToken) break;
      }

      if (spuriousToken) {
        // Split block by action on spuriousToken
        const subBlocks = new Map<string, number[]>();
        for (const sId of block) {
          const sActs = individualActions.get(sId)?.get(spuriousToken) || new Set();
          const key = Array.from(sActs).sort().join(',') || '<none>';
          if (!subBlocks.has(key)) subBlocks.set(key, []);
          subBlocks.get(key)!.push(sId);
        }
        for (const sub of subBlocks.values()) nextPartition.push(sub);
        changed = true;
        continue;
      }

      // Transition consistency check
      let transitionSplitSymbol: string | null = null;
      for (const sym of lr1.symbols) {
        const targetBlocks = new Set<number>();
        for (const sId of block) {
          const s = lr1.states[sId];
          const tgt = s.transitions.get(sym);
          if (tgt !== undefined) targetBlocks.add(stateToBlock.get(tgt)!);
        }
        if (targetBlocks.size > 1) {
          transitionSplitSymbol = sym;
          break;
        }
      }

      if (transitionSplitSymbol) {
        const sym = transitionSplitSymbol;
        const subBlocks = new Map<string, number[]>();
        for (const sId of block) {
          const s = lr1.states[sId];
          const tgt = s.transitions.get(sym);
          const key = tgt !== undefined ? String(stateToBlock.get(tgt)!) : 'none';
          if (!subBlocks.has(key)) subBlocks.set(key, []);
          subBlocks.get(key)!.push(sId);
        }
        for (const sub of subBlocks.values()) nextPartition.push(sub);
        changed = true;
        continue;
      }

      nextPartition.push(block);
    }

    partition = nextPartition;
  }

  // Ensure block containing initial state (0) is at index 0
  const initBlockIdx = partition.findIndex(b => b.includes(0));
  if (initBlockIdx > 0) {
    const initBlock = partition.splice(initBlockIdx, 1)[0];
    partition.unshift(initBlock);
  }

  const stateToFinalBlock = new Map<number, number>();
  for (let bIdx = 0; bIdx < partition.length; bIdx++) {
    for (const sId of partition[bIdx]) stateToFinalBlock.set(sId, bIdx);
  }

  const coreSplitCounts = new Map<string, number>();
  for (const block of partition) {
    const k = coreKeyOf(lr1.states[block[0]]);
    coreSplitCounts.set(k, (coreSplitCounts.get(k) || 0) + 1);
  }

  const states: LRState[] = partition.map((block, id) => {
    const repState = lr1.states[block[0]];
    const coreKey = coreKeyOf(repState);
    const isSplit = (coreSplitCounts.get(coreKey) || 0) > 1;

    const itemsByCore = new Map<string, { prod: Production; dot: number; lookaheads: Set<string> }>();
    for (const sId of block) {
      const s = lr1.states[sId];
      if (s.items1) {
        for (const it of s.items1) {
          const k = lr0ItemKey(it);
          if (!itemsByCore.has(k)) {
            itemsByCore.set(k, { prod: it.production, dot: it.dotIndex, lookaheads: new Set() });
          }
          itemsByCore.get(k)!.lookaheads.add(it.lookahead);
        }
      }
    }

    const items1: LR1Item[] = [];
    for (const it0 of repState.items0) {
      const entry = itemsByCore.get(lr0ItemKey(it0));
      if (entry) {
        for (const la of Array.from(entry.lookaheads).sort()) {
          items1.push({ production: entry.prod, dotIndex: entry.dot, lookahead: la });
        }
      }
    }

    const transitions = new Map<string, number>();
    for (const sId of block) {
      const s = lr1.states[sId];
      for (const [sym, tgt] of s.transitions.entries()) {
        const finalTgt = stateToFinalBlock.get(tgt)!;
        transitions.set(sym, finalTgt);
      }
    }

    const isAccepting = block.some(sId => lr1.states[sId].isAccepting);

    let ielrAnnotation: { en: string; cz: string } | undefined = undefined;
    if (isSplit) {
      ielrAnnotation = {
        en: `IELR(1) split state (from LR(1) states: ${block.join(', ')}). Lookaheads are segregated to eliminate spurious LALR(1) conflicts while maintaining minimal state count.`,
        cz: `IELR(1) rozdělený stav (z LR(1) stavů: ${block.join(', ')}). Symboly dopředu jsou izolovány, aby eliminovaly parazitní LALR(1) kolize při zachování minimálního počtu stavů.`
      };
    }

    return {
      id,
      items0: repState.items0,
      items1,
      transitions,
      isAccepting,
      mergedFrom: block,
      isSplit,
      ielrAnnotation
    };
  });

  return {
    variant: 'IELR(1)',
    states,
    augmentedStartSymbol: lr1.augmentedStartSymbol,
    augmentedProduction: lr1.augmentedProduction,
    symbols: lr1.symbols,
    stateNames: nameStates(states)
  };
}
