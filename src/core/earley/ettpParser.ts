/**
 * Earley Table Traversing Parsers (ETTP)
 *
 * Primary Literature:
 * - Scott, E., Johnstone, A.: Earley Table Traversing Parsers.
 *   Science of Computer Programming 247, 103335 (2026, online 2025).
 *   https://doi.org/10.1016/j.scico.2025.103335
 * - Aycock, J., Horspool, R.N.: Practical Earley Parsing. The Computer Journal 45(6), 620–630 (2002).
 *   https://doi.org/10.1093/comjnl/45.6.620 (the LR(0)ε automaton and its split form used here)
 *
 * Principle:
 * Classic Earley performs Scanner, Predictor and Completer at runtime over sets S_0 … S_n.
 * A table-driven Earley parser precomputes the item sets the Predictor would build into the
 * states of an automaton, and its sets hold pairs (q, j): "all items of state q, with origin j".
 *
 * That only works when all items of q really have the same origin. Items reached by moving
 * the dot (scan or completion) keep the origin j of the item they came from, while predicted
 * items [B → • γ] start at the current position i. So, as in the split automaton of Aycock &
 * Horspool, every closure is split in two states:
 *   - a kernel state: the items after a transition, plus the dot moved over nullable symbols
 *     (same origin j);
 *   - its predicted state: the rules predicted from it, closed under prediction and nullable
 *     moves (origin i = the index of the set). Each kernel state stores the id of its predicted
 *     state, and adding (q, j) to S_i also adds (predicted(q), i) — a table lookup, no rule is
 *     expanded at runtime.
 * Transitions δ(q, X) move the dot over X and lead to kernel states; the origin is copied.
 *   Scanner:   (q, j) ∈ S_i, δ(q, w_{i+1}) = r      ⇒ (r, j) ∈ S_{i+1}
 *   Completer: (q, j) ∈ S_i, j < i, A → γ • ∈ q, (p, k) ∈ S_j, δ(p, A) = r ⇒ (r, k) ∈ S_i
 * A completion with j = i would only repeat a move over a nullable symbol that the closure
 * already made, so it is skipped. Accept: (q, 0) ∈ S_n with S' → S • in q.
 */

import { Grammar, Production } from '../ast/grammar';
import { computeNullable } from '../analyser/grammarAnalyser';
import { DerivationNode } from '../generator/wordGenerator';
import { AUGMENTED_PRODUCTION_ID, getAugmentedProduction, subscript } from './earleyParser';
import { ChartItem, chartTrees, scannedLeafId, withUniqueIds } from './earleyTrees';

export interface ETTPItem {
  production: Production;
  dot: number;
}

export interface ETTPTransition {
  targetStateId: number;
  /** Kind of the state the transition leaves; the origin of the pair is copied in both cases. */
  originKind: 'kernel' | 'predicted';
}

export interface ETTPCompletion {
  production: Production;
  isEmpty: boolean;
}

export interface ETTPState {
  id: number;
  /** kernel = items after a transition (origin j of the pair); predicted = predicted rules (origin = set index). */
  kind: 'kernel' | 'predicted';
  items: ETTPItem[];
  // Transition map: symbol (terminal or non-terminal) -> ETTPTransition
  transitions: Map<string, ETTPTransition>;
  /** For a kernel state: the state of the rules predicted from it (added together with it). */
  predictedStateId?: number;
  // Productions completed in this state (dot at the end)
  completions: ETTPCompletion[];
  isAcceptState: boolean;
}

export interface ETTPTable {
  grammar: Grammar;
  states: ETTPState[];
  startStateId: number;
  /** The added rule S' → S. */
  augmentedProduction: Production;
}

export interface ETTPRuntimeItem {
  stateId: number;
  origin: number; // j in (q, j)
  triggerSymbol?: string;
  operation: 'init' | 'predict' | 'scan' | 'complete';
}

/** A pair that caused a step: its set and its position in the set. */
export interface ETTPStepSource {
  setIndex: number;
  itemIndex: number;
  role: 'parent' | 'scanned' | 'completed' | 'waiting';
}

export interface ETTPStep {
  stepIndex: number;
  inputIndex: number;
  operation: 'init' | 'predict' | 'scan' | 'complete';
  stateId: number;
  origin: number;
  /** Position of the new pair in its set. */
  itemIndex: number;
  triggerSymbol?: string;
  /** Transition used by the step (scan, complete): from this state on triggerSymbol. */
  fromStateId?: number;
  descriptionEn: string;
  descriptionCz: string;
  activeSetIndex: number;
  totalItemsSoFar: number;
  /** Number of pairs in each set after this step (the sets only grow). */
  setSizes: number[];
  sources: ETTPStepSource[];
  derivationTree?: DerivationNode;
}

export interface ETTPSimulationResult {
  accepted: boolean;
  totalSteps: number;
  steps: ETTPStep[];
  sets: { index: number; token?: string; items: ETTPRuntimeItem[] }[];
  trees: DerivationNode[];
  table: ETTPTable;
  truncated?: boolean;
  errorMessage?: string;
  errorMessageCz?: string;
  stats: {
    statesCount: number;
    /** Rules expanded at runtime: always 0, predictions are states of the table. */
    predictCount: number;
    /** Pairs (predicted(q), i) added by the table link. */
    predictedPairs: number;
    scanTransitions: number;
    completeTransitions: number;
    totalRuntimePairs: number;
    /** Earley items the pairs stand for (Σ |q| over the pairs) — the size of the classic chart. */
    representedItems: number;
  };
}

function itemKey(pId: number, dot: number): string {
  return `${pId}#${dot}`;
}

function stateKey(kind: string, items: ETTPItem[]): string {
  return `${kind}:` + items
    .map(it => itemKey(it.production.id, it.dot))
    .sort()
    .join('|');
}

export function formatETTPItem(it: ETTPItem): string {
  const rhs = [...it.production.rhs];
  rhs.splice(it.dot, 0, '•');
  return `${it.production.lhs} → ${rhs.join(' ')}`;
}

/**
 * Builds the table: kernel states (closed only under moves over nullable symbols) and
 * predicted states (closed under prediction and nullable moves).
 */
export function buildETTPTable(grammar: Grammar): ETTPTable {
  const augProd = getAugmentedProduction(grammar);
  const nullable = computeNullable(grammar);
  const prodsByLhs = new Map<string, Production[]>();
  for (const p of grammar.productions) {
    if (!prodsByLhs.has(p.lhs)) prodsByLhs.set(p.lhs, []);
    prodsByLhs.get(p.lhs)!.push(p);
  }
  const allSymbols = [...grammar.terminals, ...grammar.nonTerminals];

  /** Adds [A → α B • β] for [A → α • B β] with B nullable; with predict, also [B → • γ]. */
  function close(items: ETTPItem[], predict: boolean): ETTPItem[] {
    const result: ETTPItem[] = [...items];
    const seen = new Set<string>(result.map(it => itemKey(it.production.id, it.dot)));
    const add = (it: ETTPItem) => {
      const k = itemKey(it.production.id, it.dot);
      if (!seen.has(k)) {
        seen.add(k);
        result.push(it);
      }
    };
    for (let i = 0; i < result.length; i++) {
      const it = result[i];
      const next = it.production.rhs[it.dot];
      if (next === undefined || !grammar.nonTerminals.has(next)) continue;
      if (predict) for (const prod of prodsByLhs.get(next) ?? []) add({ production: prod, dot: 0 });
      if (nullable.has(next)) add({ production: it.production, dot: it.dot + 1 });
    }
    return result;
  }

  const states: ETTPState[] = [];
  const stateMap = new Map<string, number>();

  function getOrCreateState(kind: 'kernel' | 'predicted', items: ETTPItem[]): number {
    const k = stateKey(kind, items);
    const known = stateMap.get(k);
    if (known !== undefined) return known;
    const id = states.length;
    stateMap.set(k, id);
    states.push({
      id,
      kind,
      items,
      transitions: new Map(),
      completions: items
        .filter(it => it.dot === it.production.rhs.length && it.production.id !== AUGMENTED_PRODUCTION_ID)
        .map(it => ({ production: it.production, isEmpty: it.production.rhs.length === 0 })),
      isAcceptState: items.some(it => it.production.id === AUGMENTED_PRODUCTION_ID && it.dot === 1)
    });
    if (kind === 'kernel') {
      const predicted = new Set<string>();
      for (const it of items) {
        const next = it.production.rhs[it.dot];
        if (next !== undefined && grammar.nonTerminals.has(next)) predicted.add(next);
      }
      const predictedItems = close(
        [...predicted].flatMap(nt => (prodsByLhs.get(nt) ?? []).map(production => ({ production, dot: 0 }))),
        true
      );
      if (predictedItems.length > 0) states[id].predictedStateId = getOrCreateState('predicted', predictedItems);
    }
    return id;
  }

  const startStateId = getOrCreateState('kernel', close([{ production: augProd, dot: 0 }], false));

  for (let processed = 0; processed < states.length; processed++) {
    const state = states[processed];
    for (const sym of allSymbols) {
      const moved = state.items
        .filter(it => it.production.rhs[it.dot] === sym)
        .map(it => ({ production: it.production, dot: it.dot + 1 }));
      if (moved.length === 0) continue;
      state.transitions.set(sym, {
        targetStateId: getOrCreateState('kernel', close(moved, false)),
        originKind: state.kind
      });
    }
  }

  return { grammar, states, startStateId, augmentedProduction: augProd };
}

export interface ETTPTransitionReason {
  fromStateId: number;
  symbol: string;
  targetStateId: number;
  originKind: 'kernel' | 'predicted';
  triggerItems: ETTPItem[]; // items in source state with dot before symbol: [A -> alpha . X beta]
  resultingKernelItems: ETTPItem[]; // items in target state with dot after symbol: [A -> alpha X . beta]
}

/**
 * Whether an item is a kernel item (origin j of the pair) or a predicted one (origin = set index).
 * In the split table this is a property of the whole state.
 */
export function isETTPKernelItem(_it: ETTPItem, state: ETTPState): boolean {
  return state.kind === 'kernel';
}

/**
 * Computes detailed derivation reasons for transitions between states.
 */
export function getETTPTransitionReason(
  fromState: ETTPState,
  symbol: string,
  targetState: ETTPState
): ETTPTransitionReason | undefined {
  const tr = fromState.transitions.get(symbol);
  if (!tr || tr.targetStateId !== targetState.id) return undefined;

  const triggerItems = fromState.items.filter(
    it => it.dot < it.production.rhs.length && it.production.rhs[it.dot] === symbol
  );
  const resultingKernelItems = triggerItems.map(it => ({
    production: it.production,
    dot: it.dot + 1
  }));

  return {
    fromStateId: fromState.id,
    symbol,
    targetStateId: targetState.id,
    originKind: tr.originKind,
    triggerItems,
    resultingKernelItems
  };
}

/**
 * Items with the dot before the left-hand side of a predicted item [B → • γ]: in the same
 * predicted state, or in a kernel state whose predicted state this is.
 */
export function findPredictionTriggers(
  table: ETTPTable,
  state: ETTPState,
  item: ETTPItem
): { stateId: number; item: ETTPItem }[] {
  if (item.dot > 0 || state.kind !== 'predicted') return [];
  const lhs = item.production.lhs;
  const sources = [state, ...table.states.filter(s => s.predictedStateId === state.id)];
  return sources.flatMap(s =>
    s.items
      .filter(it => it.production.rhs[it.dot] === lhs)
      .map(it => ({ stateId: s.id, item: it }))
  );
}

/**
 * Simulates ETTP Table Traversal over input tokens with detailed step-by-step traces.
 */
export function simulateETTPParse(
  tokens: string[],
  grammar: Grammar,
  prebuiltTable?: ETTPTable,
  maxSteps: number = 20000 + 100 * tokens.length
): ETTPSimulationResult {
  const table = prebuiltTable ?? buildETTPTable(grammar);
  const n = tokens.length;
  const aug = table.augmentedProduction;

  const sets: { index: number; token?: string; items: ETTPRuntimeItem[] }[] = Array.from(
    { length: n + 1 },
    (_, idx) => ({
      index: idx,
      token: idx > 0 ? tokens[idx - 1] : undefined,
      items: []
    })
  );

  const seenKeys: Set<string>[] = Array.from({ length: n + 1 }, () => new Set());
  const steps: ETTPStep[] = [];
  const stepTrees: ({ kind: 'leaf'; tokenIndex: number } | { kind: 'symbol'; symbol: string; origin: number; end: number } | undefined)[] = [];
  let stepCounter = 0;
  let scanTransitions = 0;
  let completeTransitions = 0;
  let predictedPairs = 0;
  let totalRuntimePairs = 0;
  let representedItems = 0;
  let truncated = false;

  const S = (i: number) => `S${subscript(i)}`;
  const span = (j: number, i: number) => (j === i ? 'ε' : tokens.slice(j, i).join(' '));

  function addPair(
    setIdx: number,
    stateId: number,
    origin: number,
    op: 'init' | 'scan' | 'complete',
    descEn: string,
    descCz: string,
    sources: ETTPStepSource[],
    extra: { triggerSymbol?: string; fromStateId?: number; tree?: (typeof stepTrees)[number] } = {}
  ): boolean {
    if (!push(setIdx, stateId, origin, op, descEn, descCz, sources, extra)) return false;
    // The predicted state comes with the pair, with origin = this set.
    const state = table.states[stateId];
    if (state.predictedStateId !== undefined) {
      const p = state.predictedStateId;
      const parentIndex = sets[setIdx].items.length - 1;
      if (
        push(
          setIdx,
          p,
          setIdx,
          'predict',
          `Prediction from the table: state q${stateId} has the precomputed predicted state q${p} (the rules that may start after the dots of q${stateId}, closed under prediction). Added the pair (q${p}, ${setIdx}) to ${S(setIdx)} — origin ${setIdx}, because these rules start here. No rule is expanded at runtime.`,
          `Predikce z tabulky: stav q${stateId} má předpočítaný predikční stav q${p} (pravidla, která mohou začít za tečkami v q${stateId}, uzavřená predikcí). Do ${S(setIdx)} přidán pár (q${p}, ${setIdx}) — počátek ${setIdx}, protože tato pravidla začínají zde. Za běhu se žádné pravidlo nerozvíjí.`,
          [{ setIndex: setIdx, itemIndex: parentIndex, role: 'parent' }],
          {}
        )
      ) {
        predictedPairs++;
      }
    }
    return true;
  }

  function push(
    setIdx: number,
    stateId: number,
    origin: number,
    op: 'init' | 'predict' | 'scan' | 'complete',
    descEn: string,
    descCz: string,
    sources: ETTPStepSource[],
    extra: { triggerSymbol?: string; fromStateId?: number; tree?: (typeof stepTrees)[number] }
  ): boolean {
    if (stepCounter >= maxSteps) {
      truncated = true;
      return false;
    }
    const key = `${stateId}@${origin}`;
    if (seenKeys[setIdx].has(key)) return false;
    seenKeys[setIdx].add(key);

    sets[setIdx].items.push({ stateId, origin, operation: op, triggerSymbol: extra.triggerSymbol });
    totalRuntimePairs++;
    representedItems += table.states[stateId].items.length;
    stepCounter++;
    steps.push({
      stepIndex: stepCounter,
      inputIndex: setIdx,
      operation: op,
      stateId,
      origin,
      itemIndex: sets[setIdx].items.length - 1,
      triggerSymbol: extra.triggerSymbol,
      fromStateId: extra.fromStateId,
      descriptionEn: descEn,
      descriptionCz: descCz,
      activeSetIndex: setIdx,
      totalItemsSoFar: totalRuntimePairs,
      setSizes: sets.map(s => s.items.length),
      sources
    });
    stepTrees.push(extra.tree);
    return true;
  }

  const q0 = table.states[table.startStateId];
  addPair(
    0,
    table.startStateId,
    0,
    'init',
    `Initialize: ${S(0)} gets the pair (q${table.startStateId}, 0); state q${table.startStateId} holds ${q0.items.map(formatETTPItem).join(', ')}. The word is accepted when ${S(n)} contains a pair (q, 0) whose state has ${aug.lhs} → ${aug.rhs[0]} •.`,
    `Inicializace: do ${S(0)} vložen pár (q${table.startStateId}, 0); stav q${table.startStateId} obsahuje ${q0.items.map(formatETTPItem).join(', ')}. Slovo bude přijato, bude-li v ${S(n)} pár (q, 0), jehož stav obsahuje ${aug.lhs} → ${aug.rhs[0]} •.`,
    []
  );

  for (let i = 0; i <= n; i++) {
    // Completer: S_j for j < i is finished, S_i grows while it is traversed.
    for (let k = 0; k < sets[i].items.length; k++) {
      const it = sets[i].items[k];
      const j = it.origin;
      if (j === i) continue;
      const state = table.states[it.stateId];
      const completedLhs = [...new Set(state.completions.map(c => c.production.lhs))];
      for (const lhs of completedLhs) {
        const rules = state.completions.filter(c => c.production.lhs === lhs).map(c => `${lhs} → ${c.production.rhs.join(' ') || 'ε'} •`).join(', ');
        const originSet = sets[j];
        for (let pIdx = 0; pIdx < originSet.items.length; pIdx++) {
          const pItem = originSet.items[pIdx];
          const trans = table.states[pItem.stateId].transitions.get(lhs);
          if (trans === undefined) continue;
          const r = trans.targetStateId;
          const added = addPair(
            i,
            r,
            pItem.origin,
            'complete',
            `Completer: the pair (q${it.stateId}, ${j}) in ${S(i)} has the finished rule ${rules}, so ${lhs} derives “${span(j, i)}” (positions ${j}–${i}). In ${S(j)} the pair (q${pItem.stateId}, ${pItem.origin}) has the transition δ(q${pItem.stateId}, ${lhs}) = q${r}: added (q${r}, ${pItem.origin}) to ${S(i)} (the origin ${pItem.origin} is copied).`,
            `Kompletor: pár (q${it.stateId}, ${j}) v ${S(i)} má dokončené pravidlo ${rules}, tedy ${lhs} generuje „${span(j, i)}“ (pozice ${j}–${i}). V ${S(j)} má pár (q${pItem.stateId}, ${pItem.origin}) přechod δ(q${pItem.stateId}, ${lhs}) = q${r}: do ${S(i)} přidán (q${r}, ${pItem.origin}) (počátek ${pItem.origin} se kopíruje).`,
            [
              { setIndex: i, itemIndex: k, role: 'completed' },
              { setIndex: j, itemIndex: pIdx, role: 'waiting' }
            ],
            { triggerSymbol: lhs, fromStateId: pItem.stateId, tree: { kind: 'symbol', symbol: lhs, origin: j, end: i } }
          );
          if (added) completeTransitions++;
        }
      }
    }

    // Scanner: w_{i+1} from S_i into S_{i+1}
    if (i < n) {
      const a = tokens[i];
      sets[i].items.forEach((it, k) => {
        const trans = table.states[it.stateId].transitions.get(a);
        if (trans === undefined) return;
        const r = trans.targetStateId;
        const added = addPair(
          i + 1,
          r,
          it.origin,
          'scan',
          `Scanner: the input symbol w${subscript(i + 1)} = '${a}'; the pair (q${it.stateId}, ${it.origin}) in ${S(i)} has the transition δ(q${it.stateId}, '${a}') = q${r}: added (q${r}, ${it.origin}) to ${S(i + 1)} (the origin is copied).`,
          `Skener: vstupní symbol w${subscript(i + 1)} = '${a}'; pár (q${it.stateId}, ${it.origin}) v ${S(i)} má přechod δ(q${it.stateId}, '${a}') = q${r}: do ${S(i + 1)} přidán (q${r}, ${it.origin}) (počátek se kopíruje).`,
          [{ setIndex: i, itemIndex: k, role: 'scanned' }],
          { triggerSymbol: a, fromStateId: it.stateId, tree: { kind: 'leaf', tokenIndex: i } }
        );
        if (added) scanTransitions++;
      });
    }
  }

  const accepted = !truncated && sets[n].items.some(
    it => it.origin === 0 && table.states[it.stateId].isAcceptState
  );

  // Trees from the chart: the pair (q, j) stands for the items of q with origin j.
  const trees: DerivationNode[] = [];
  if (!truncated) {
    const chart: ChartItem[][] = sets.map(s =>
      s.items.flatMap(p => table.states[p.stateId].items.map(it => ({ production: it.production, dot: it.dot, origin: p.origin })))
    );
    const forest = chartTrees(grammar, tokens, chart);
    steps.forEach((step, idx) => {
      const t = stepTrees[idx];
      if (!t) return;
      step.derivationTree =
        t.kind === 'leaf'
          ? { id: scannedLeafId(t.tokenIndex, tokens[t.tokenIndex]), symbol: tokens[t.tokenIndex], isTerminal: true }
          : forest.ofSymbol(t.symbol, t.origin, t.end);
    });
    if (accepted) {
      const root = forest.ofSymbol(grammar.startSymbol, 0, n);
      if (root) trees.push(withUniqueIds(root));
    }
  }

  return {
    accepted,
    truncated,
    errorMessage: truncated ? `Parsing stopped after reaching the limit of ${maxSteps} steps.` : undefined,
    errorMessageCz: truncated ? `Analýza byla zastavena po dosažení limitu ${maxSteps} kroků.` : undefined,
    totalSteps: stepCounter,
    steps,
    sets,
    trees,
    table,
    stats: {
      statesCount: table.states.length,
      predictCount: 0,
      predictedPairs,
      scanTransitions,
      completeTransitions,
      totalRuntimePairs,
      representedItems
    }
  };
}
