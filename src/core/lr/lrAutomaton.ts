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
import { LRAction, resolveByPrecedence } from './lrTable';

export type LRVariant = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'IELR(1)' | 'LR(1)';

export interface LRState {
  id: number;
  items0: LR0Item[];
  items1?: LR1Item[];
  transitions: Map<string, number>; // symbol -> targetStateId
  isAccepting?: boolean;
  /** LALR(1) / IELR(1): ids of the LR(1) states with the same core (set by attachMergedLR1States) */
  mergedFrom?: number[];
  /** IELR(1): the LR(1) states with this core were not all merged into one state (the core has several IELR(1) states) */
  isSplit?: boolean;
  /** IELR(1): why the LR(1) states of this core were split (in the order of the splits that led to this state) */
  splitReasons?: IELRSplitReason[];
}

/**
 * Why IELR(1) did not merge LR(1) states with the same core:
 * - conflict: on `symbol` the merged state would act differently from some
 *   of the LR(1) states after conflict resolution (see buildIELR1Automaton);
 *   `mergedRaw` is the cell of the merged state, `merged` its resolved
 *   action, `parts` the different resolved actions of the LR(1) states.
 *   With `newConflict` the resolved action would be the same, but the merged
 *   cell would be a conflict that precedence does not resolve while none of
 *   the LR(1) states has such a conflict on `symbol`;
 * - successor: the states the LR(1) states go to over `symbol` were split,
 *   so this state has to be split too (GOTO must stay deterministic).
 */
export type IELRSplitReason =
  | { kind: 'conflict'; symbol: string; mergedRaw: LRCellAction[]; merged: LRCellAction[]; parts: LRCellAction[][]; newConflict: boolean }
  | { kind: 'successor'; symbol: string };

/** An action of a table cell without the target state (enough to compare cells). */
export interface LRCellAction {
  type: 'shift' | 'reduce' | 'accept';
  production?: Production;
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

export function buildSLR1Automaton(g: Grammar, _analysis?: GrammarAnalysis): LRAutomaton {
  return buildLR0Automaton(g, 'SLR(1)');
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
 * Build the IELR(1) automaton.
 *
 * IELR(1) (Denny & Malloy 2010) looks for an automaton with few states whose
 * parser acts exactly like the canonical LR(1) parser after conflict
 * resolution: precedence and associativity, otherwise the default of Yacc and
 * Bison (shift before reduce, the earlier rule in a reduce/reduce conflict).
 * It starts from LALR(1) and splits a state only where merging the LR(1)
 * states of its core would change a resolved action. Denny & Malloy (and GNU
 * Bison since 2.5, %define lr.type ielr) compute it from the LALR(1)
 * automaton with lookahead annotations, without building LR(1). This tool
 * computes the same kind of result more simply from the canonical LR(1)
 * automaton:
 *
 * 1. The LR(1) states with the same LR(0) core form one group (that is LALR(1)).
 * 2. A group is split when merging it changes an action: on some terminal t,
 *    an LR(1) state that has an action on t would get a different resolved
 *    action, or the merged cell would be a conflict that precedence does not
 *    resolve although none of the LR(1) states has one on t (so a grammar
 *    whose LR(1) table has no conflicts gets none). The parts are the states
 *    with the same resolved action; states without any action on t join a
 *    part (they only report the error after a reduction, as in LALR(1)).
 * 3. A group is split when its states go over some symbol into different groups.
 * 4. Repeat until nothing changes; number the groups in the order of a
 *    breadth-first search like the other automata (the numbering of LALR(1)
 *    when nothing is split).
 *
 * In every state, wherever one of its LR(1) states has an action, the
 * resolved action is that of the LR(1) state: the parser behaves like
 * canonical LR(1) after conflict resolution. The raw table can therefore show
 * a conflict in a merged state where one of the LR(1) states had none (the
 * resolved action is the same), but only on a symbol where another of its
 * LR(1) states has a conflict too. When merging changes no resolved action,
 * the result has the states of LALR(1) (for grammars without non-generating
 * symbols; with them canonical LR(1), and so IELR(1), can have fewer states
 * than LR(0)). The splitting is greedy, so the state count is not guaranteed
 * to be the smallest possible.
 */
export function buildIELR1Automaton(
  g: Grammar,
  analysis: GrammarAnalysis,
  lr1Given?: LRAutomaton,
  options: { usePrecedence?: boolean } = {}
): LRAutomaton {
  return runJob(buildIELR1AutomatonSteps(g, analysis, runToEnd(), lr1Given, options))!;
}

const cellActionKey = (a: LRCellAction) => (a.type === 'reduce' ? `r${a.production!.id}` : a.type === 'shift' ? 's' : 'acc');
const cellKey = (cell: LRCellAction[]) => cell.map(cellActionKey).sort().join(',');
// shift first, then the rules by number (accept is the rule 0)
const cellOrder = (a: LRCellAction) => (a.type === 'shift' ? -1 : a.type === 'accept' ? 0 : a.production!.id);
const sortCell = (cell: LRCellAction[]) => [...cell].sort((a, b) => cellOrder(a) - cellOrder(b));

/** The elements of `xs` grouped by `key`, the groups in the order of their first element. */
function groupBy<T>(xs: T[], key: (x: T) => string): T[][] {
  const by = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(x);
  }
  return [...by.values()];
}

export function* buildIELR1AutomatonSteps(
  g: Grammar,
  analysis: GrammarAnalysis,
  control: JobControl,
  lr1Given?: LRAutomaton,
  options: { usePrecedence?: boolean } = {}
): Job<LRAutomaton | null> {
  const lr1 = lr1Given ?? (yield* buildLR1AutomatonSteps(g, analysis, control));
  if (!lr1) return null;

  yield { en: 'IELR(1): merging the LR(1) states with equal cores', cz: 'IELR(1): slučování stavů LR(1) se stejným jádrem' };
  if (control.stop) return null;

  const precedence = options.usePrecedence !== false && g.precedence && g.precedence.levels.length > 0 ? g.precedence : undefined;
  const terminalCols = [...g.terminals, END_MARKER];
  const coreKeyOf = (s: LRState) => [...new Set(s.items0.filter(isKernel).map(lr0ItemKey))].sort().join('|');

  // The non-empty cells of the action table of every LR(1) state (shift without its target)
  const cells: Map<string, LRCellAction[]>[] = lr1.states.map(s => {
    const row = new Map<string, LRCellAction[]>();
    const add = (t: string, a: LRCellAction) => {
      const cell = row.get(t) ?? [];
      if (!cell.some(b => cellActionKey(b) === cellActionKey(a))) cell.push(a);
      row.set(t, cell);
    };
    for (const sym of s.transitions.keys()) if (g.terminals.has(sym)) add(sym, { type: 'shift' });
    for (const it of s.items1 || []) {
      if (it.dotIndex !== it.production.rhs.length) continue;
      if (it.production.id !== 0) add(it.lookahead, { type: 'reduce', production: it.production });
      else if (it.lookahead === END_MARKER) add(END_MARKER, { type: 'accept' });
    }
    return row;
  });
  /**
   * A cell after conflict resolution: by precedence as in buildLRTable ([] =
   * error by %nonassoc), otherwise Bison's default (shift before reduce, the
   * earlier rule in a reduce/reduce conflict); `byDefault` = a conflict
   * precedence does not resolve.
   */
  const resolveInfo = (t: string, cell: LRCellAction[]): { cell: LRCellAction[]; byDefault: boolean } => {
    if (cell.length <= 1) return { cell, byDefault: false };
    if (precedence) {
      const r = resolveByPrecedence(precedence, g, -1, t, cell as LRAction[]);
      if (r) return { cell: r.chosen ? [r.chosen] : [], byDefault: false };
    }
    return { cell: [sortCell(cell)[0]], byDefault: true };
  };
  const resolve = (t: string, cell: LRCellAction[]) => resolveInfo(t, cell).cell;
  const resolvedKey = (t: string, cell: LRCellAction[]) => {
    const r = resolve(t, cell);
    return r.length > 0 ? cellKey(r) : '!error';
  };
  const own: Map<string, string>[] = cells.map(row => new Map([...row].map(([t, cell]) => [t, resolvedKey(t, cell)] as const)));
  const ownByDefault: Set<string>[] = cells.map(row => new Set([...row].filter(([t, cell]) => resolveInfo(t, cell).byDefault).map(([t]) => t)));
  const union = (members: number[], t: string): LRCellAction[] => {
    const out: LRCellAction[] = [];
    for (const s of members) {
      for (const a of cells[s].get(t) ?? []) if (!out.some(b => cellActionKey(b) === cellActionKey(a))) out.push(a);
    }
    return out;
  };
  /**
   * Merging `members` changes something on t: the resolved action of one of
   * them, or it creates a conflict precedence does not resolve where none of
   * them has one.
   */
  const changesOn = (members: number[], t: string): boolean => {
    const u = union(members, t);
    if (u.length === 0) return false;
    const k = resolvedKey(t, u);
    if (members.some(s => own[s].has(t) && own[s].get(t) !== k)) return true;
    return resolveInfo(t, u).byDefault && !members.some(s => ownByDefault[s].has(t));
  };
  /** The first terminal on which merging `members` changes something, or null. */
  const changedOn = (members: number[]): string | null => terminalCols.find(t => changesOn(members, t)) ?? null;

  interface Group { members: number[]; reasons: IELRSplitReason[] }

  /** Splits a group whose merge changes something on t into parts that do not. */
  const splitByCell = (grp: Group, t: string): Group[] => {
    const withAction = grp.members.filter(s => cells[s].has(t));
    const parts: number[][] = [];
    for (const same of groupBy(withAction, s => own[s].get(t)!)) {
      // Equal resolved actions can still merge into a different one or into a new
      // conflict (two conflicts resolved by precedence give three actions): then by the cell
      if (!changesOn(same, t)) parts.push(same);
      else parts.push(...groupBy(same, s => cellKey(cells[s].get(t)!)));
    }
    // A state without an action on t joins the first part it can be merged with (otherwise the first one)
    for (const s of grp.members.filter(s => !cells[s].has(t))) {
      (parts.find(p => changedOn([...p, s]) === null) ?? parts[0]).push(s);
    }
    for (const p of parts) p.sort((a, b) => a - b);
    const mergedRaw = union(grp.members, t);
    const merged = resolveInfo(t, mergedRaw);
    const partCells = groupBy(parts.map(p => sortCell(resolve(t, union(p, t)))), cell => cellKey(cell) || '!error').map(same => same[0]);
    const newConflict = merged.byDefault && !grp.members.some(s => ownByDefault[s].has(t)) &&
      !grp.members.some(s => own[s].has(t) && own[s].get(t) !== resolvedKey(t, mergedRaw));
    const reason: IELRSplitReason = { kind: 'conflict', symbol: t, mergedRaw: sortCell(mergedRaw), merged: sortCell(merged.cell), parts: partCells, newConflict };
    return parts.map(members => ({ members, reasons: [...grp.reasons, reason] }));
  };

  // 1. One group per LR(0) core (= LALR(1))
  let groups: Group[] = groupBy(lr1.states.map(s => s.id), id => coreKeyOf(lr1.states[id])).map(members => ({ members, reasons: [] }));
  const groupIndex = () => {
    const of = new Array<number>(lr1.states.length);
    groups.forEach((grp, i) => grp.members.forEach(s => (of[s] = i)));
    return of;
  };

  // 2./3. Split until every group keeps the actions of its LR(1) states and the transitions are deterministic
  for (let changed = true; changed; ) {
    changed = false;
    yield undefined;
    if (control.stop) return null;
    const groupOf = groupIndex();
    const successor = (s: number, X: string) => {
      const t = lr1.states[s].transitions.get(X);
      return t === undefined ? 'none' : String(groupOf[t]);
    };
    const next: Group[] = [];
    for (const grp of groups) {
      if (grp.members.length > 1) {
        const t = changedOn(grp.members);
        if (t !== null) {
          next.push(...splitByCell(grp, t));
          changed = true;
          continue;
        }
        const X = lr1.symbols.find(X => new Set(grp.members.map(s => successor(s, X))).size > 1);
        if (X !== undefined) {
          const reason: IELRSplitReason = { kind: 'successor', symbol: X };
          next.push(...groupBy(grp.members, s => successor(s, X)).map(members => ({ members, reasons: [...grp.reasons, reason] })));
          changed = true;
          continue;
        }
      }
      next.push(grp);
    }
    groups = next;
  }

  // 4. Numbering by a breadth-first search from the initial state, symbols in the order of the other builders
  const groupOf = groupIndex();
  const order: number[] = [groupOf[0]];
  const newId = new Map<number, number>([[groupOf[0], 0]]);
  for (let i = 0; i < order.length; i++) {
    const rep = lr1.states[groups[order[i]].members[0]];
    for (const X of lr1.symbols) {
      const t = rep.transitions.get(X);
      if (t === undefined || newId.has(groupOf[t])) continue;
      newId.set(groupOf[t], order.length);
      order.push(groupOf[t]);
    }
  }
  groups.forEach((_, gi) => {
    if (!newId.has(gi)) {
      newId.set(gi, order.length);
      order.push(gi);
    }
  });

  const groupsPerCore = new Map<string, number>();
  for (const grp of groups) {
    const k = coreKeyOf(lr1.states[grp.members[0]]);
    groupsPerCore.set(k, (groupsPerCore.get(k) || 0) + 1);
  }

  const states: LRState[] = order.map((gi, id) => {
    const grp = groups[gi];
    const rep = lr1.states[grp.members[0]];
    const isSplit = (groupsPerCore.get(coreKeyOf(rep)) || 0) > 1;
    // Lookaheads of an item: the union over the merged LR(1) states
    const las = new Map<string, Set<string>>();
    for (const s of grp.members) {
      for (const it of lr1.states[s].items1 || []) {
        const k = lr0ItemKey(it);
        if (!las.has(k)) las.set(k, new Set());
        las.get(k)!.add(it.lookahead);
      }
    }
    const items1: LR1Item[] = [];
    for (const it of rep.items0) {
      for (const la of [...(las.get(lr0ItemKey(it)) || [])].sort()) items1.push({ production: it.production, dotIndex: it.dotIndex, lookahead: la });
    }
    const transitions = new Map<string, number>();
    for (const X of lr1.symbols) {
      const t = rep.transitions.get(X);
      if (t !== undefined) transitions.set(X, newId.get(groupOf[t])!);
    }
    return {
      id,
      items0: rep.items0,
      items1,
      transitions,
      isAccepting: grp.members.some(s => lr1.states[s].isAccepting),
      mergedFrom: grp.members,
      isSplit,
      splitReasons: isSplit ? grp.reasons : undefined
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
