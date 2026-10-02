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

export type LRVariant = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

export interface LRState {
  id: number;
  items0: LR0Item[];
  items1?: LR1Item[];
  transitions: Map<string, number>; // symbol -> targetStateId
  isAccepting?: boolean;
  /** LALR(1): ids of the LR(1) states with the same core (set by attachMergedLR1States) */
  mergedFrom?: number[];
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
