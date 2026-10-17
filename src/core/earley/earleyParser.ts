/**
 * Classic Earley Parser (Jay Earley 1970) with Aycock & Horspool (2002) Nullable Optimization
 *
 * Primary Literature:
 * - Earley, J.: An efficient context-free parsing algorithm. Communications of the ACM 13(2), 94–102 (1970).
 *   https://doi.org/10.1145/362005.362035
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
 */

import { Grammar, Production } from '../ast/grammar';
import { computeNullable } from '../analyser/grammarAnalyser';
import { DerivationNode } from '../generator/wordGenerator';

export interface EarleyItem {
  id: string;
  production: Production;
  dot: number;
  origin: number; // j
  operation: 'init' | 'predict' | 'scan' | 'complete';
  // Origin details for educational explanation
  triggerSymbol?: string;
  completedItemOrigin?: number;
  // Parse tree construction links
  treeChildren?: DerivationNode[];
}

export interface EarleySet {
  index: number;
  token?: string; // token matched into this set (w_index)
  items: EarleyItem[];
}

export interface EarleyStep {
  stepIndex: number;
  inputIndex: number;
  operation: 'init' | 'predict' | 'scan' | 'complete';
  item: EarleyItem;
  descriptionEn: string;
  descriptionCz: string;
  activeSetIndex: number;
  totalItemsSoFar: number;
  chartSnapshot: { setIndex: number; items: EarleyItem[] }[];
  derivationTree?: DerivationNode;
}

export interface EarleySimulationResult {
  accepted: boolean;
  totalSteps: number;
  steps: EarleyStep[];
  sets: EarleySet[];
  trees: DerivationNode[];
  totalTrees: number;
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

export function formatEarleyItem(item: EarleyItem): string {
  const rhs = [...item.production.rhs];
  rhs.splice(item.dot, 0, '•');
  return `[${item.production.lhs} → ${rhs.join(' ') || '•'}, ${item.origin}]`;
}

export function formatItemKey(pId: number, dot: number, origin: number): string {
  return `${pId}#${dot}#${origin}`;
}

/**
 * Creates an augmented production S' -> S
 */
export function getAugmentedProduction(startSymbol: string): Production {
  return {
    id: -1,
    lhs: "S'",
    rhs: [startSymbol]
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
  const augProd = getAugmentedProduction(grammar.startSymbol);
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
  let stepCounter = 0;
  let predictCount = 0;
  let scanCount = 0;
  let completeCount = 0;
  let totalItemsCount = 0;
  let truncated = false;

  function takeChartSnapshot(): { setIndex: number; items: EarleyItem[] }[] {
    return sets.map(s => ({
      setIndex: s.index,
      items: [...s.items]
    }));
  }

  function addItem(
    setIdx: number,
    item: EarleyItem,
    descEn: string,
    descCz: string,
    currentTree?: DerivationNode
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
      descriptionEn: descEn,
      descriptionCz: descCz,
      activeSetIndex: setIdx,
      totalItemsSoFar: totalItemsCount,
      chartSnapshot: takeChartSnapshot(),
      derivationTree: currentTree
    });
    return true;
  }

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
    `Initialize: Added start item [S' → • ${grammar.startSymbol}, 0] into S₀`,
    `Inicializace: Přidána počáteční položka [S' → • ${grammar.startSymbol}, 0] do S₀`
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
            const rhsStr = prod.rhs.length > 0 ? prod.rhs.join(' ') : 'ε';
            const added = addItem(
              i,
              predItem,
              `Predictor: Next symbol in ${formatEarleyItem(it)} is non-terminal '${nextSymbol}'. Expanded rule ${prod.lhs} → • ${rhsStr} with origin ${i} in S_${i}`,
              `Prediktor: Následující symbol v ${formatEarleyItem(it)} je neterminál '${nextSymbol}'. Expandováno pravidlo ${prod.lhs} → • ${rhsStr} s počátkem ${i} do S_${i}`
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
              triggerSymbol: nextSymbol,
              treeChildren: [
                ...(it.treeChildren ?? []),
                {
                  id: `tree_node_null_${i}_${nextSymbol}`,
                  symbol: nextSymbol,
                  isTerminal: false,
                  children: [{ id: `tree_node_eps_${i}`, symbol: 'ε', isTerminal: true }]
                }
              ]
            };
            const added = addItem(
              i,
              nullItem,
              `Predictor (Nullable): '${nextSymbol}' in ${formatEarleyItem(it)} derives ε. Advanced dot past '${nextSymbol}' to yield ${formatEarleyItem(nullItem)} in S_${i}`,
              `Prediktor (Nullable): '${nextSymbol}' v ${formatEarleyItem(it)} generuje ε. Posunuta tečka přes '${nextSymbol}' na novou položku ${formatEarleyItem(nullItem)} v S_${i}`
            );
            if (added) predictCount++;
          }
        }
      } else {
        // --- COMPLETER ---
        const completedNt = it.production.lhs;
        const originIdx = it.origin;
        const originSet = sets[originIdx];

        // Construct tree node for the completed non-terminal (if not augmented)
        let completedSubtree: DerivationNode | undefined = undefined;
        if (completedNt !== "S'") {
          const children: DerivationNode[] = it.treeChildren && it.treeChildren.length > 0
            ? [...it.treeChildren]
            : (it.production.rhs.length === 0
                ? [{ id: `tree_eps_${i}_${it.id}`, symbol: 'ε', isTerminal: true }]
                : it.production.rhs.map((sym, sIdx) => ({
                    id: `leaf_${i}_${sIdx}_${sym}`,
                    symbol: sym,
                    isTerminal: !grammar.nonTerminals.has(sym)
                  }))
              );
          completedSubtree = {
            id: `tree_nt_${completedNt}_${originIdx}_${i}_${it.production.id}`,
            symbol: completedNt,
            isTerminal: false,
            children
          };
        }

        for (let originItemIdx = 0; originItemIdx < originSet.items.length; originItemIdx++) {
          const originItem = originSet.items[originItemIdx];
          if (
            originItem.dot < originItem.production.rhs.length &&
            originItem.production.rhs[originItem.dot] === completedNt
          ) {
            const advancedTreeChildren = [
              ...(originItem.treeChildren ?? []),
              ...(completedSubtree ? [completedSubtree] : [])
            ];

            const completedAdvItem: EarleyItem = {
              id: `item_${i}_${sets[i].items.length}`,
              production: originItem.production,
              dot: originItem.dot + 1,
              origin: originItem.origin,
              operation: 'complete',
              triggerSymbol: completedNt,
              completedItemOrigin: originIdx,
              treeChildren: advancedTreeChildren
            };

            const completedRuleStr = `${it.production.lhs} → ${it.production.rhs.join(' ') || 'ε'}`;
            const added = addItem(
              i,
              completedAdvItem,
              `Completer: Completed ${completedRuleStr} in S_${i} (originated at S_${originIdx}). Advanced ${formatEarleyItem(originItem)} from S_${originIdx} over '${completedNt}' to ${formatEarleyItem(completedAdvItem)} in S_${i}`,
              `Kompletor: V S_${i} bylo dokončeno pravidlo ${completedRuleStr} (počátek v S_${originIdx}). Nalezena položka ${formatEarleyItem(originItem)} v S_${originIdx}; posunuta tečka přes '${completedNt}' na ${formatEarleyItem(completedAdvItem)} v S_${i}`,
              completedSubtree
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
      for (const it of sets[i].items) {
        if (
          it.dot < it.production.rhs.length &&
          it.production.rhs[it.dot] === nextInputToken
        ) {
          const scannedLeaf: DerivationNode = {
            id: `leaf_tok_${i}_${nextInputToken}`,
            symbol: nextInputToken,
            isTerminal: true
          };

          const scannedItem: EarleyItem = {
            id: `item_${i + 1}_${sets[i + 1].items.length}`,
            production: it.production,
            dot: it.dot + 1,
            origin: it.origin,
            operation: 'scan',
            triggerSymbol: nextInputToken,
            treeChildren: [...(it.treeChildren ?? []), scannedLeaf]
          };

          const added = addItem(
            i + 1,
            scannedItem,
            `Scanner: Matched token '${nextInputToken}' at position ${i + 1} with ${formatEarleyItem(it)} in S_${i}. Advanced dot to ${formatEarleyItem(scannedItem)} in S_${i + 1}`,
            `Skener: Nalezena shoda vstupního symbolu '${nextInputToken}' na pozici ${i + 1} s položkou ${formatEarleyItem(it)} v S_${i}. Posunuta tečka na ${formatEarleyItem(scannedItem)} v S_${i + 1}`
          );
          if (added) scanCount++;
        }
      }
    }
  }

  // Acceptance check: [S' -> S ., 0] in S_n
  const acceptKey = formatItemKey(augProd.id, 1, 0);
  const accepted = !truncated && (itemKeyMap[n]?.has(acceptKey) ?? false);

  // Extract derivation trees
  const trees: DerivationNode[] = [];
  if (accepted) {
    const acceptItems = sets[n].items.filter(
      it => it.production.id === augProd.id && it.dot === 1 && it.origin === 0
    );
    for (const it of acceptItems) {
      if (it.treeChildren && it.treeChildren.length > 0) {
        trees.push(it.treeChildren[0]);
      }
    }
    // If tree reconstruction didn't link, create a root
    if (trees.length === 0) {
      trees.push({
        id: 'tree_root_accepted',
        symbol: grammar.startSymbol,
        isTerminal: false,
        children: tokens.map((t, idx) => ({ id: `token_leaf_${idx}`, symbol: t, isTerminal: true }))
      });
    }
  }

  return {
    accepted,
    totalSteps: stepCounter,
    steps,
    sets,
    trees,
    totalTrees: trees.length,
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
