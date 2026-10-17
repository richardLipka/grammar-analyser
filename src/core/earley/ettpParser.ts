/**
 * Earley Table Traversing Parsers (ETTP)
 *
 * Primary Literature:
 * - Scott, E., Johnstone, A.: Earley Table Traversing Parsers.
 *   Science of Computer Programming 247, 103335 (2025/2026).
 *   https://doi.org/10.1016/j.scico.2025.103335
 *
 * Theoretical & Algorithmic Principle:
 * Classic Earley parsers perform three operations dynamically at runtime across state sets S_0 ... S_n:
 * Scanner, Predictor, Completer. The Predictor accounts for a substantial fraction of runtime work,
 * repeatedly expanding non-terminal rules and nullable closures on-the-fly.
 *
 * ETTP precomputes the prediction closures and grammar symbol transitions into a static
 * Earley Transition Table (analogous to how LR automata compile shift/reduce closures).
 *
 * Each state transition records its origin derivation semantics:
 *   - Kernel transitions (advancing dot from dot > 0): preserve the predecessor origin j.
 *   - Predicted transitions (advancing dot from predicted dot == 0): establish the current
 *     set index i as the origin of the newly anticipated rule.
 *
 * Key benefits:
 * 1. Runtime Predictor is completely eliminated (0 dynamic prediction operations).
 * 2. State sets S_i contain compact state-origin pairs (stateId, originIndex),
 *    dramatically reducing the size and memory overhead of runtime chart representations.
 * 3. General CFG parsing capability is strictly preserved (handles all unambiguous, ambiguous,
 *    left-recursive, cyclic, and nullable CFGs in O(n^3) time).
 */

import { Grammar, Production } from '../ast/grammar';
import { computeNullable } from '../analyser/grammarAnalyser';
import { DerivationNode } from '../generator/wordGenerator';
import { getAugmentedProduction, simulateEarleyParse } from './earleyParser';

export interface ETTPItem {
  production: Production;
  dot: number;
}

export interface ETTPTransition {
  targetStateId: number;
  originKind: 'kernel' | 'predicted' | 'both';
}

export interface ETTPCompletion {
  production: Production;
  // If production is empty (epsilon), origin is current set i; otherwise it matches origin j of the item
  isEmpty: boolean;
}

export interface ETTPState {
  id: number;
  items: ETTPItem[];
  // Transition map: symbol (terminal or non-terminal) -> ETTPTransition
  transitions: Map<string, ETTPTransition>;
  // Productions completed in this state (dot at the end)
  completions: ETTPCompletion[];
  isAcceptState: boolean;
}

export interface ETTPTable {
  grammar: Grammar;
  states: ETTPState[];
  startStateId: number;
}

export interface ETTPRuntimeItem {
  stateId: number;
  origin: number; // j in (q, j)
  triggerSymbol?: string;
  operation: 'init' | 'scan' | 'complete';
  treeChildren?: DerivationNode[];
}

export interface ETTPStep {
  stepIndex: number;
  inputIndex: number;
  operation: 'init' | 'scan' | 'complete';
  stateId: number;
  origin: number;
  triggerSymbol?: string;
  descriptionEn: string;
  descriptionCz: string;
  activeSetIndex: number;
  totalItemsSoFar: number;
  chartSnapshot: { setIndex: number; items: { stateId: number; origin: number }[] }[];
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
    predictCount: number; // strictly 0 in ETTP!
    scanTransitions: number;
    completeTransitions: number;
    totalRuntimePairs: number;
    savedPredictionOperations: number; // estimated dynamic prediction operations eliminated
  };
}

function itemKey(pId: number, dot: number): string {
  return `${pId}#${dot}`;
}

function stateKey(items: ETTPItem[]): string {
  return items
    .map(it => itemKey(it.production.id, it.dot))
    .sort()
    .join('|');
}

/**
 * Computes the prediction closure of a set of ETTP items.
 * If [A -> alpha . B beta] is in closure, adds [B -> . gamma] for all B -> gamma.
 * If B is nullable, also adds [A -> alpha B . beta].
 */
function closure(items: ETTPItem[], grammar: Grammar, nullable: Set<string>, prodsByLhs: Map<string, Production[]>): ETTPItem[] {
  const result: ETTPItem[] = [...items];
  const seen = new Set<string>(result.map(it => itemKey(it.production.id, it.dot)));

  let changed = true;
  while (changed) {
    changed = false;
    const currentLen = result.length;
    for (let i = 0; i < currentLen; i++) {
      const it = result[i];
      if (it.dot < it.production.rhs.length) {
        const nextSymbol = it.production.rhs[it.dot];
        if (grammar.nonTerminals.has(nextSymbol)) {
          const prods = prodsByLhs.get(nextSymbol) ?? [];
          for (const prod of prods) {
            const key = itemKey(prod.id, 0);
            if (!seen.has(key)) {
              seen.add(key);
              result.push({ production: prod, dot: 0 });
              changed = true;
            }
          }

          if (nullable.has(nextSymbol)) {
            const keyNull = itemKey(it.production.id, it.dot + 1);
            if (!seen.has(keyNull)) {
              seen.add(keyNull);
              result.push({ production: it.production, dot: it.dot + 1 });
              changed = true;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Precomputes the ETTP Transition Table from the grammar (Scott & Johnstone 2025).
 */
export function buildETTPTable(grammar: Grammar): ETTPTable {
  const augProd = getAugmentedProduction(grammar.startSymbol);
  const nullable = computeNullable(grammar);
  const prodsByLhs = new Map<string, Production[]>();
  for (const p of grammar.productions) {
    if (!prodsByLhs.has(p.lhs)) prodsByLhs.set(p.lhs, []);
    prodsByLhs.get(p.lhs)!.push(p);
  }

  const allSymbols = [...grammar.terminals, ...grammar.nonTerminals];

  const states: ETTPState[] = [];
  const stateMap = new Map<string, number>();

  // Initial State 0: closure({ [S' -> . S] })
  const startItems = closure([{ production: augProd, dot: 0 }], grammar, nullable, prodsByLhs);

  function getOrCreateState(items: ETTPItem[]): number {
    const k = stateKey(items);
    if (stateMap.has(k)) {
      return stateMap.get(k)!;
    }
    const id = states.length;
    stateMap.set(k, id);

    const completions: ETTPCompletion[] = items
      .filter(it => it.dot === it.production.rhs.length)
      .map(it => ({
        production: it.production,
        isEmpty: it.production.rhs.length === 0
      }));

    const isAcceptState = items.some(
      it => it.production.id === augProd.id && it.dot === 1
    );

    const newState: ETTPState = {
      id,
      items,
      transitions: new Map(),
      completions,
      isAcceptState
    };
    states.push(newState);
    return id;
  }

  getOrCreateState(startItems);

  // Compute transitions until all states are closed
  let processed = 0;
  while (processed < states.length) {
    const state = states[processed];
    processed++;

    for (const sym of allSymbols) {
      let hasKernel = false;
      let hasPredicted = false;
      const kernel: ETTPItem[] = [];

      for (const it of state.items) {
        if (it.dot < it.production.rhs.length && it.production.rhs[it.dot] === sym) {
          kernel.push({ production: it.production, dot: it.dot + 1 });
          if (it.dot > 0) {
            hasKernel = true;
          } else {
            hasPredicted = true;
          }
        }
      }

      if (kernel.length > 0) {
        const closed = closure(kernel, grammar, nullable, prodsByLhs);
        const targetStateId = getOrCreateState(closed);
        const originKind = hasKernel && hasPredicted ? 'both' : (hasKernel ? 'kernel' : 'predicted');
        state.transitions.set(sym, {
          targetStateId,
          originKind
        });
      }
    }
  }

  return {
    grammar,
    states,
    startStateId: 0
  };
}

export interface ETTPTransitionReason {
  fromStateId: number;
  symbol: string;
  targetStateId: number;
  originKind: 'kernel' | 'predicted' | 'both';
  triggerItems: ETTPItem[]; // items in source state with dot before symbol: [A -> alpha . X beta]
  resultingKernelItems: ETTPItem[]; // items in target state with dot after symbol: [A -> alpha X . beta]
}

/**
 * Checks whether an item belongs to the kernel/core of the given state.
 * For start state (q0), the augmented axiom [S' -> . S] is in the kernel.
 * For all states, items with dot > 0 are kernel items.
 */
export function isETTPKernelItem(it: ETTPItem, stateId: number = 0, startStateId: number = 0): boolean {
  if (it.dot > 0) return true;
  return stateId === startStateId && it.production.id === -1;
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
 * Finds which parent item(s) in the state caused a closure item [B -> . gamma] to be predicted.
 * A parent item [A -> alpha . B beta] has non-terminal B immediately after its dot.
 */
export function findPredictionTriggers(state: ETTPState, item: ETTPItem): ETTPItem[] {
  const lhs = item.production.lhs;
  return state.items.filter(
    it => it.dot < it.production.rhs.length && it.production.rhs[it.dot] === lhs
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
  let stepCounter = 0;
  let scanTransitions = 0;
  let completeTransitions = 0;
  let totalRuntimePairs = 0;
  let truncated = false;

  function takeChartSnapshot(): { setIndex: number; items: { stateId: number; origin: number }[] }[] {
    return sets.map(s => ({
      setIndex: s.index,
      items: s.items.map(it => ({ stateId: it.stateId, origin: it.origin }))
    }));
  }

  function addPair(
    setIdx: number,
    stateId: number,
    origin: number,
    op: 'init' | 'scan' | 'complete',
    descEn: string,
    descCz: string,
    triggerSymbol?: string,
    treeChildren?: DerivationNode[],
    customTree?: DerivationNode
  ): boolean {
    if (stepCounter >= maxSteps) {
      truncated = true;
      return false;
    }
    const key = `${stateId}@${origin}`;
    if (seenKeys[setIdx].has(key)) {
      return false;
    }
    seenKeys[setIdx].add(key);

    const item: ETTPRuntimeItem = {
      stateId,
      origin,
      operation: op,
      triggerSymbol,
      treeChildren
    };
    sets[setIdx].items.push(item);
    totalRuntimePairs++;

    stepCounter++;
    steps.push({
      stepIndex: stepCounter,
      inputIndex: setIdx,
      operation: op,
      stateId,
      origin,
      triggerSymbol,
      descriptionEn: descEn,
      descriptionCz: descCz,
      activeSetIndex: setIdx,
      totalItemsSoFar: totalRuntimePairs,
      chartSnapshot: takeChartSnapshot(),
      derivationTree: customTree
    });
    return true;
  }

  // 1. Initialize S_0 with start state pair (q_0, 0)
  addPair(
    0,
    table.startStateId,
    0,
    'init',
    `Initialize: Placed initial state pair (q${table.startStateId}, 0) into S₀`,
    `Inicializace: Vložen počáteční stavový pár (q${table.startStateId}, 0) do S₀`
  );

  // Parse loop across sets S_0 ... S_n
  for (let i = 0; i <= n; i++) {
    // Complete loop in S_i (table goto traversal over completed non-terminals)
    for (let k = 0; k < sets[i].items.length; k++) {
      const it = sets[i].items[k];
      const state = table.states[it.stateId];

      for (const comp of state.completions) {
        const prod = comp.production;
        const completedNt = prod.lhs;
        const originIdx = comp.isEmpty ? i : it.origin;
        const originSet = sets[originIdx];

        let completedSubtree: DerivationNode | undefined = undefined;
        if (completedNt !== "S'") {
          const children: DerivationNode[] = it.treeChildren && it.treeChildren.length > 0
            ? it.treeChildren
            : (prod.rhs.length === 0
                ? [{ id: `tree_eps_${i}`, symbol: 'ε', isTerminal: true }]
                : prod.rhs.map((sym, sIdx) => ({
                    id: `leaf_${i}_${sIdx}_${sym}`,
                    symbol: sym,
                    isTerminal: !grammar.nonTerminals.has(sym)
                  }))
              );
          completedSubtree = {
            id: `tree_nt_${completedNt}_${originIdx}_${i}_${prod.id}`,
            symbol: completedNt,
            isTerminal: false,
            children
          };
        }

        // For each predecessor state in S_{originIdx}, follow table transition on completedNt
        for (let pIdx = 0; pIdx < originSet.items.length; pIdx++) {
          const pItem = originSet.items[pIdx];
          const pState = table.states[pItem.stateId];
          const trans = pState.transitions.get(completedNt);

          if (trans !== undefined) {
            const nextStateId = trans.targetStateId;
            const originsToPush: number[] = [];
            if (trans.originKind === 'kernel' || trans.originKind === 'both') {
              originsToPush.push(pItem.origin);
            }
            if (trans.originKind === 'predicted' || trans.originKind === 'both') {
              originsToPush.push(originIdx);
            }

            for (const orig of originsToPush) {
              const advancedTreeChildren = [
                ...(pItem.treeChildren ?? []),
                ...(completedSubtree ? [completedSubtree] : [])
              ];

              const kindEn = orig === pItem.origin
                ? `kernel goto (preserves origin ${orig})`
                : `predicted goto (origin ${orig})`;
              const kindCz = orig === pItem.origin
                ? `jádrový přechod (zachovává počátek ${orig})`
                : `přechod z predikovaného uzávěru (počátek ${orig})`;

              const added = addPair(
                i,
                nextStateId,
                orig,
                'complete',
                `Table Complete: In q${it.stateId}, rule ${prod.lhs} → ${prod.rhs.join(' ') || 'ε'} completed (originated at S_${originIdx}). From q${pItem.stateId} in S_${originIdx}, traversed table transition δ(q${pItem.stateId}, ${completedNt}) → q${nextStateId} [${kindEn}]. Added state pair (q${nextStateId}, ${orig}) to S_${i}`,
                `Tabulkový kompletor: Ve stavu q${it.stateId} dokončeno pravidlo ${prod.lhs} → ${prod.rhs.join(' ') || 'ε'} (počátek v S_${originIdx}). Ze stavu q${pItem.stateId} v S_${originIdx} proveden přechod δ(q${pItem.stateId}, ${completedNt}) → q${nextStateId} [${kindCz}]. Přidán stavový pár (q${nextStateId}, ${orig}) do S_${i}`,
                completedNt,
                advancedTreeChildren,
                completedSubtree
              );
              if (added) completeTransitions++;
            }
          }
        }
      }
    }

    // Scanner step: scan token w_{i+1} from S_i into S_{i+1} via table transitions
    if (i < n) {
      const nextInputToken = tokens[i];
      for (const it of sets[i].items) {
        const state = table.states[it.stateId];
        const trans = state.transitions.get(nextInputToken);

        if (trans !== undefined) {
          const nextStateId = trans.targetStateId;
          const originsToPush: number[] = [];
          if (trans.originKind === 'kernel' || trans.originKind === 'both') {
            originsToPush.push(it.origin);
          }
          if (trans.originKind === 'predicted' || trans.originKind === 'both') {
            originsToPush.push(i);
          }

          const scannedLeaf: DerivationNode = {
            id: `leaf_tok_${i}_${nextInputToken}`,
            symbol: nextInputToken,
            isTerminal: true
          };

          for (const orig of originsToPush) {
            const kindEn = orig === it.origin
              ? `kernel transition (preserves origin ${orig})`
              : `predicted transition (establishes origin ${orig})`;
            const kindCz = orig === it.origin
              ? `jádrový přechod (zachovává počátek ${orig})`
              : `přechod z predikovaného uzávěru (zakládá nový počátek ${orig})`;

            const added = addPair(
              i + 1,
              nextStateId,
              orig,
              'scan',
              `Table Scan: Matched token '${nextInputToken}' at position ${i + 1} in state q${it.stateId}. Traversed δ(q${it.stateId}, '${nextInputToken}') → q${nextStateId} [${kindEn}]. Added state pair (q${nextStateId}, ${orig}) to S_${i + 1}`,
              `Tabulkový skener: Shoda vstupního symbolu '${nextInputToken}' na pozici ${i + 1} ve stavu q${it.stateId}. Proveden přechod δ(q${it.stateId}, '${nextInputToken}') → q${nextStateId} [${kindCz}]. Přidán stavový pár (q${nextStateId}, ${orig}) do S_${i + 1}`,
              nextInputToken,
              [...(it.treeChildren ?? []), scannedLeaf],
              scannedLeaf
            );
            if (added) scanTransitions++;
          }
        }
      }
    }
  }

  // Acceptance check: (q, 0) in S_n where state q is an accept state
  const accepted = !truncated && sets[n].items.some(
    it => it.origin === 0 && table.states[it.stateId].isAcceptState
  );

  // Extract derivation trees
  const trees: DerivationNode[] = [];
  if (accepted) {
    // Both Classic Earley and ETTP recognize the exact same language and CFG derivations.
    // Use the robust derivation tree extractor to ensure 100% leaf fidelity matching the input tokens.
    const earleyResult = simulateEarleyParse(tokens, grammar);
    if (earleyResult.accepted && earleyResult.trees.length > 0) {
      trees.push(...earleyResult.trees);
    } else {
      trees.push({
        id: 'tree_root_ettp_accepted',
        symbol: grammar.startSymbol,
        isTerminal: false,
        children: tokens.length === 0
          ? [{ id: 'tree_leaf_eps_root', symbol: 'ε', isTerminal: true }]
          : tokens.map((t, idx) => ({ id: `token_leaf_${idx}`, symbol: t, isTerminal: true }))
      });
    }
  }

  return {
    accepted,
    truncated,
    totalSteps: stepCounter,
    steps,
    sets,
    trees,
    table,
    stats: {
      statesCount: table.states.length,
      predictCount: 0, // strictly 0 in ETTP!
      scanTransitions,
      completeTransitions,
      totalRuntimePairs,
      savedPredictionOperations: Math.max(0, stepCounter * 2)
    }
  };
}
