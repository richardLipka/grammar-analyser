/**
 * Classic Earley Parser (Jay Earley 1970) with Aycock & Horspool (2002) Nullable Optimization
 *
 * Primary Literature:
 * - Earley, J.: An efficient context-free parsing algorithm. Communications of the ACM 13(2), 94–102 (1970).
 *   https://doi.org/10.1145/362007.362035
 * - Aycock, J., Horspool, R.N.: Practical Earley Parsing. The Computer Journal 45(6), 620–630 (2002).
 *   https://doi.org/10.1093/comjnl/45.6.620
 *
 * Algorithm Overview:
 * For input tokens w_1 ... w_n, Earley computes state sets S_0, S_1, ..., S_n.
 * An item is [A -> alpha . beta, j], where:
 *   - A -> alpha beta is a production in grammar G.
 *   - The dot (.) marks how much of the right-hand side has been matched.
 *   - j is the origin index in the input where recognition of A began.
 *
 * The three fundamental operations:
 *   1. Predictor: For [A -> alpha . B beta, j] in S_i, adds [B -> . gamma, i] for all B -> gamma.
 *      (With Aycock-Horspool: if B is nullable, also immediately adds [A -> alpha B . beta, j] to S_i).
 *   2. Scanner: For [A -> alpha . a beta, j] in S_{i-1} matching input token a = w_i, adds [A -> alpha a . beta, j] to S_i.
 *   3. Completer: For [B -> gamma ., k] in S_i, finds all [A -> alpha . B beta, j] in S_k and adds [A -> alpha B . beta, j] to S_i.
 *
 * Without the Aycock–Horspool step the completer misses items: an ε-rule of B completes in S_i
 * (origin i) before all items of S_i waiting for B are there. Advancing the dot over a nullable
 * B in the predictor is their fix; a completion with origin i then adds nothing new.
 */

import { Grammar, Production } from '../ast/grammar';
import { computeNullable } from '../analyser/grammarAnalyser';
import { DerivationNode } from '../generator/wordGenerator';
import { chartTrees, scannedLeafId, withUniqueIds } from './earleyTrees';

export interface EarleyItem {
  id: string;
  production: Production;
  dot: number;
  origin: number; // j
  operation: 'init' | 'predict' | 'scan' | 'complete';
  // Origin details for educational explanation
  triggerSymbol?: string;
  completedItemOrigin?: number;
}

export interface EarleySet {
  index: number;
  token?: string; // token matched into this set (w_index)
  items: EarleyItem[];
}

/** An item that caused a step: its set and its position in the set. */
export interface EarleyStepSource {
  setIndex: number;
  itemIndex: number;
  /** parent = item with the dot before the predicted non-terminal; scanned = item before the scan;
   *  completed = the finished rule; waiting = the item in S_j that waited for its non-terminal. */
  role: 'parent' | 'scanned' | 'completed' | 'waiting';
}

export interface EarleyStep {
  stepIndex: number;
  inputIndex: number;
  operation: 'init' | 'predict' | 'scan' | 'complete';
  item: EarleyItem;
  /** Position of the new item in its set. */
  itemIndex: number;
  descriptionEn: string;
  descriptionCz: string;
  activeSetIndex: number;
  totalItemsSoFar: number;
  /** Number of items in each set after this step (the sets only grow). */
  setSizes: number[];
  /** Items that caused this step. */
  sources: EarleyStepSource[];
  /** Subtree the step adds: the scanned leaf, or the subtree of the completed / ε-derived non-terminal. */
  derivationTree?: DerivationNode;
}

export interface EarleySimulationResult {
  accepted: boolean;
  totalSteps: number;
  steps: EarleyStep[];
  sets: EarleySet[];
  trees: DerivationNode[];
  totalTrees: number;
  /** Name of the added start symbol S' (more primes when the grammar uses S' itself). */
  augmentedStart: string;
  truncated?: boolean;
  errorMessage?: string;
  errorMessageCz?: string;
  stats: {
    predictCount: number;
    scanCount: number;
    completeCount: number;
    totalItems: number;
  };
}

export function formatEarleyItem(item: { production: Production; dot: number; origin: number }): string {
  const rhs = [...item.production.rhs];
  rhs.splice(item.dot, 0, '•');
  return `[${item.production.lhs} → ${rhs.join(' ') || '•'}, ${item.origin}]`;
}

export function formatItemKey(pId: number, dot: number, origin: number): string {
  return `${pId}#${dot}#${origin}`;
}

/** Id of the added production S' → S; grammar productions have ids ≥ 0. */
export const AUGMENTED_PRODUCTION_ID = -1;

/**
 * Creates the augmented production S' → S. The new start symbol must not be a symbol of the
 * grammar: with a user's own S' the completer would advance the user's items over it.
 */
export function getAugmentedProduction(grammar: Grammar): Production {
  let lhs = `${grammar.startSymbol}'`;
  while (grammar.nonTerminals.has(lhs) || grammar.terminals.has(lhs)) lhs += "'";
  return {
    id: AUGMENTED_PRODUCTION_ID,
    lhs,
    rhs: [grammar.startSymbol]
  };
}

/**
 * Simulates the classic Earley parser over input tokens with detailed step-by-step traces.
 */
export function simulateEarleyParse(
  tokens: string[],
  grammar: Grammar,
  maxSteps: number = 20000 + 100 * tokens.length
): EarleySimulationResult {
  const nullable = computeNullable(grammar);
  const augProd = getAugmentedProduction(grammar);
  const productionsByLhs = new Map<string, Production[]>();
  for (const p of grammar.productions) {
    if (!productionsByLhs.has(p.lhs)) productionsByLhs.set(p.lhs, []);
    productionsByLhs.get(p.lhs)!.push(p);
  }

  const n = tokens.length;
  const sets: EarleySet[] = Array.from({ length: n + 1 }, (_, idx) => ({
    index: idx,
    token: idx > 0 ? tokens[idx - 1] : undefined,
    items: []
  }));

  const itemKeyMap: Set<string>[] = Array.from({ length: n + 1 }, () => new Set());
  const steps: EarleyStep[] = [];
  /** Per step: what its subtree is, filled in once the chart is complete. */
  const stepTrees: ({ kind: 'leaf'; tokenIndex: number } | { kind: 'item'; production: Production; origin: number; end: number } | { kind: 'symbol'; symbol: string; at: number } | undefined)[] = [];
  let stepCounter = 0;
  let predictCount = 0;
  let scanCount = 0;
  let completeCount = 0;
  let totalItemsCount = 0;
  let truncated = false;

  function addItem(
    setIdx: number,
    item: EarleyItem,
    descEn: string,
    descCz: string,
    sources: EarleyStepSource[],
    tree?: (typeof stepTrees)[number]
  ): boolean {
    if (stepCounter >= maxSteps) {
      truncated = true;
      return false;
    }
    const key = formatItemKey(item.production.id, item.dot, item.origin);
    if (itemKeyMap[setIdx].has(key)) {
      return false;
    }
    itemKeyMap[setIdx].add(key);
    sets[setIdx].items.push(item);
    totalItemsCount++;

    stepCounter++;
    steps.push({
      stepIndex: stepCounter,
      inputIndex: setIdx,
      operation: item.operation,
      item,
      itemIndex: sets[setIdx].items.length - 1,
      descriptionEn: descEn,
      descriptionCz: descCz,
      activeSetIndex: setIdx,
      totalItemsSoFar: totalItemsCount,
      setSizes: sets.map(s => s.items.length),
      sources
    });
    stepTrees.push(tree);
    return true;
  }

  const ruleText = (p: Production) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;

  // 1. Initialize S_0 with augmented rule [S' -> . S, 0]
  const initItem: EarleyItem = {
    id: `item_init`,
    production: augProd,
    dot: 0,
    origin: 0,
    operation: 'init'
  };
  addItem(
    0,
    initItem,
    `Initialize: S₀ gets the start item [${augProd.lhs} → • ${grammar.startSymbol}, 0] of the added rule ${augProd.lhs} → ${grammar.startSymbol}. The word is accepted when S${subscript(n)} contains [${augProd.lhs} → ${grammar.startSymbol} •, 0].`,
    `Inicializace: do S₀ vložena počáteční položka [${augProd.lhs} → • ${grammar.startSymbol}, 0] přidaného pravidla ${augProd.lhs} → ${grammar.startSymbol}. Slovo bude přijato, bude-li v S${subscript(n)} položka [${augProd.lhs} → ${grammar.startSymbol} •, 0].`,
    []
  );

  // Parse loop across sets S_0 ... S_n
  for (let i = 0; i <= n; i++) {
    // Note: S_i grows dynamically during this loop as Predictor and Completer add items
    for (let k = 0; k < sets[i].items.length; k++) {
      const it = sets[i].items[k];

      if (it.dot < it.production.rhs.length) {
        const nextSymbol = it.production.rhs[it.dot];

        if (grammar.nonTerminals.has(nextSymbol)) {
          // --- PREDICTOR ---
          const prods = productionsByLhs.get(nextSymbol) ?? [];
          for (const prod of prods) {
            const predItem: EarleyItem = {
              id: `item_${i}_${sets[i].items.length}`,
              production: prod,
              dot: 0,
              origin: i,
              operation: 'predict',
              triggerSymbol: nextSymbol
            };
            const added = addItem(
              i,
              predItem,
              `Predictor: in ${formatEarleyItem(it)} the dot is before the non-terminal ${nextSymbol}, so every rule of ${nextSymbol} may start here. Added ${formatEarleyItem(predItem)} to S${subscript(i)} (origin ${i} = this set).`,
              `Prediktor: v ${formatEarleyItem(it)} je za tečkou neterminál ${nextSymbol}, zde tedy může začít každé jeho pravidlo. Do S${subscript(i)} přidána ${formatEarleyItem(predItem)} (počátek ${i} = tato množina).`,
              [{ setIndex: i, itemIndex: k, role: 'parent' }]
            );
            if (added) predictCount++;
          }

          // Aycock-Horspool optimization for nullable symbols
          if (nullable.has(nextSymbol)) {
            const nullItem: EarleyItem = {
              id: `item_${i}_${sets[i].items.length}`,
              production: it.production,
              dot: it.dot + 1,
              origin: it.origin,
              operation: 'predict',
              triggerSymbol: nextSymbol
            };
            const added = addItem(
              i,
              nullItem,
              `Predictor (nullable, Aycock & Horspool): ${nextSymbol} ⇒* ε, so in ${formatEarleyItem(it)} the dot can also skip ${nextSymbol} without reading input. Added ${formatEarleyItem(nullItem)} to S${subscript(i)}.`,
              `Prediktor (ε, Aycock & Horspool): ${nextSymbol} ⇒* ε, proto v ${formatEarleyItem(it)} může tečka ${nextSymbol} i přeskočit bez čtení vstupu. Do S${subscript(i)} přidána ${formatEarleyItem(nullItem)}.`,
              [{ setIndex: i, itemIndex: k, role: 'parent' }],
              { kind: 'symbol', symbol: nextSymbol, at: i }
            );
            if (added) predictCount++;
          }
        }
      } else {
        // --- COMPLETER ---
        const completedNt = it.production.lhs;
        const originIdx = it.origin;
        if (it.production.id === AUGMENTED_PRODUCTION_ID) continue;
        const originSet = sets[originIdx];

        for (let originItemIdx = 0; originItemIdx < originSet.items.length; originItemIdx++) {
          const originItem = originSet.items[originItemIdx];
          if (
            originItem.dot < originItem.production.rhs.length &&
            originItem.production.rhs[originItem.dot] === completedNt
          ) {
            const completedAdvItem: EarleyItem = {
              id: `item_${i}_${sets[i].items.length}`,
              production: originItem.production,
              dot: originItem.dot + 1,
              origin: originItem.origin,
              operation: 'complete',
              triggerSymbol: completedNt,
              completedItemOrigin: originIdx
            };

            const span = originIdx === i ? 'ε' : tokens.slice(originIdx, i).join(' ');
            const added = addItem(
              i,
              completedAdvItem,
              `Completer: ${formatEarleyItem(it)} is complete — ${completedNt} derives “${span}” (from position ${originIdx} to ${i}). In S${subscript(originIdx)} the item ${formatEarleyItem(originItem)} waited for ${completedNt}; its dot moves over ${completedNt}: ${formatEarleyItem(completedAdvItem)} added to S${subscript(i)}.`,
              `Kompletor: ${formatEarleyItem(it)} je dokončená — ${completedNt} generuje „${span}“ (od pozice ${originIdx} do ${i}). V S${subscript(originIdx)} na ${completedNt} čekala položka ${formatEarleyItem(originItem)}; tečka se posune za ${completedNt}: do S${subscript(i)} přidána ${formatEarleyItem(completedAdvItem)}.`,
              [
                { setIndex: i, itemIndex: k, role: 'completed' },
                { setIndex: originIdx, itemIndex: originItemIdx, role: 'waiting' }
              ],
              { kind: 'item', production: it.production, origin: originIdx, end: i }
            );
            if (added) completeCount++;
          }
        }
      }
    }

    // --- SCANNER ---
    // If not at the end of input, scan token w_{i+1} from items in S_i into S_{i+1}
    if (i < n) {
      const nextInputToken = tokens[i];
      sets[i].items.forEach((it, k) => {
        if (
          it.dot < it.production.rhs.length &&
          it.production.rhs[it.dot] === nextInputToken
        ) {
          const scannedItem: EarleyItem = {
            id: `item_${i + 1}_${sets[i + 1].items.length}`,
            production: it.production,
            dot: it.dot + 1,
            origin: it.origin,
            operation: 'scan',
            triggerSymbol: nextInputToken
          };

          const added = addItem(
            i + 1,
            scannedItem,
            `Scanner: the next input symbol w${subscript(i + 1)} = '${nextInputToken}' is the terminal after the dot in ${formatEarleyItem(it)} (S${subscript(i)}). The dot moves over it: ${formatEarleyItem(scannedItem)} added to S${subscript(i + 1)}.`,
            `Skener: další vstupní symbol w${subscript(i + 1)} = '${nextInputToken}' je terminál za tečkou v ${formatEarleyItem(it)} (S${subscript(i)}). Tečka se posune za něj: do S${subscript(i + 1)} přidána ${formatEarleyItem(scannedItem)}.`,
            [{ setIndex: i, itemIndex: k, role: 'scanned' }],
            { kind: 'leaf', tokenIndex: i }
          );
          if (added) scanCount++;
        }
      });
    }
  }

  // Acceptance check: [S' -> S ., 0] in S_n
  const acceptKey = formatItemKey(augProd.id, 1, 0);
  const accepted = !truncated && (itemKeyMap[n]?.has(acceptKey) ?? false);

  // Derivation trees from the finished chart (also the subtrees shown by the steps).
  const trees: DerivationNode[] = [];
  if (!truncated) {
    const forest = chartTrees(grammar, tokens, sets.map(s => s.items));
    steps.forEach((step, idx) => {
      const t = stepTrees[idx];
      if (!t) return;
      step.derivationTree =
        t.kind === 'leaf'
          ? { id: scannedLeafId(t.tokenIndex, tokens[t.tokenIndex]), symbol: tokens[t.tokenIndex], isTerminal: true }
          : t.kind === 'item'
          ? forest.ofItem(t.production, t.origin, t.end)
          : forest.ofSymbol(t.symbol, t.at, t.at);
    });
    if (accepted) {
      const root = forest.ofSymbol(grammar.startSymbol, 0, n);
      if (root) trees.push(withUniqueIds(root));
    }
  }

  return {
    accepted,
    totalSteps: stepCounter,
    steps,
    sets,
    trees,
    totalTrees: trees.length,
    augmentedStart: augProd.lhs,
    truncated,
    errorMessage: truncated ? `Parsing stopped after reaching the limit of ${maxSteps} steps.` : undefined,
    errorMessageCz: truncated ? `Analýza byla zastavena po dosažení limitu ${maxSteps} kroků.` : undefined,
    stats: {
      predictCount,
      scanCount,
      completeCount,
      totalItems: totalItemsCount
    }
  };
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** S₁₂ instead of S_12 in the step texts. */
export function subscript(n: number): string {
  return String(n).replace(/\d/g, d => SUBSCRIPT_DIGITS[Number(d)]);
}
