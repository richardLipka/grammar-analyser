/**
 * Classic Earley Parser (Jay Earley 1970) with Aycock & Horspool (2002) Nullable Optimization
 * and, as an option, Leo's (1991) transitive items for right recursion
 *
 * Primary Literature:
 * - Earley, J.: An efficient context-free parsing algorithm. Communications of the ACM 13(2), 94–102 (1970).
 *   https://doi.org/10.1145/362007.362035
 * - Aycock, J., Horspool, R.N.: Practical Earley Parsing. The Computer Journal 45(6), 620–630 (2002).
 *   https://doi.org/10.1093/comjnl/45.6.620
 * - Leo, J.M.I.M.: A general context-free parsing algorithm running in linear time on every LR(k)
 *   grammar without using lookahead. Theoretical Computer Science 82(1), 165–176 (1991).
 *   https://doi.org/10.1016/0304-3975(91)90180-A
 * - Kegler, J.: Marpa, a practical general parser: the recognizer (2019), Section 7 (Leo items,
 *   Leo reduction, Leo stack expansion). https://arxiv.org/abs/1910.08129
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
 *
 * Leo (1991): if [A -> alpha . B, j] is the ONLY item of S_k with B after the dot and B is its last
 * symbol, every completion of B from k completes A from j as well — and so on up the
 * "deterministic reduction path" (Marpa: Leo stack). Plain Earley adds every item of that path to
 * S_i, which costs O(n²) items on right recursion (S -> a S | ε on a^n). Leo stores in S_k a
 * transitive item (here written [C -> delta ., B, m] like Marpa's triple: dotted rule, transition
 * symbol, origin) holding the topmost item of the path, and the completer adds only that topmost
 * item. Transitive items are created lazily, when a completion first needs them (as in Leo's paper;
 * Marpa creates them eagerly and only for right-recursive rules). We use Leo's condition with the
 * dot exactly before the last symbol; Marpa also allows a nullable rest. Omitting a transitive item
 * never affects correctness, so a path that runs into a cycle (A -> B, B -> A) gets none.
 * The skipped items are needed for derivation trees only; they are reconstructed after the
 * recognition by walking the transitive items down again (Marpa's "Leo stack expansion").
 */

import { Grammar, Production } from '../ast/grammar';
import { computeNullable } from '../analyser/grammarAnalyser';
import { DerivationNode } from '../generator/wordGenerator';
import { ChartItem, chartTrees, scannedLeafId, withUniqueIds } from './earleyTrees';

export type EarleyOperation = 'init' | 'predict' | 'scan' | 'complete' | 'leo' | 'transitive';

export interface EarleyItem {
  id: string;
  production: Production;
  dot: number;
  origin: number; // j
  /** 'leo' = topmost item added by Leo's completer; 'transitive' = a Leo item (see LeoItem). */
  operation: EarleyOperation;
  // Origin details for educational explanation
  triggerSymbol?: string;
  completedItemOrigin?: number;
}

/**
 * Leo's transitive item stored in S_k for the symbol B: its rule, dot and origin are those of the
 * topmost item [C → δ •, m] that a completion of B with origin k adds to the current set.
 */
export interface LeoItem extends EarleyItem {
  operation: 'transitive';
  /** Transition symbol B. */
  symbol: string;
  /** Index in S_k of the only item with B after the dot (B is its last symbol). */
  waitingIndex: number;
  /** Number of items of the deterministic reduction path it stands for (the topmost included). */
  depth: number;
  /** The transitive item above it on the path (in S_j for the left-hand side of the waiting item). */
  next?: { setIndex: number; leoIndex: number };
}

export interface EarleySet {
  index: number;
  token?: string; // token matched into this set (w_index)
  items: EarleyItem[];
  /** Leo's transitive items (empty without the Leo option). */
  leoItems: LeoItem[];
}

/** An item that caused a step: its set and its position in the set. */
export interface EarleyStepSource {
  setIndex: number;
  /** Index in `items`, or in `leoItems` for the role 'transitive'. */
  itemIndex: number;
  /** parent = item with the dot before the predicted non-terminal; scanned = item before the scan;
   *  completed = the finished rule; waiting = the item in S_j that waited for its non-terminal;
   *  transitive = Leo's transitive item that was used. */
  role: 'parent' | 'scanned' | 'completed' | 'waiting' | 'transitive';
}

export interface EarleyStep {
  stepIndex: number;
  inputIndex: number;
  operation: EarleyOperation;
  /** The new item; for 'transitive' the new Leo item (in `leoItems` of its set). */
  item: EarleyItem;
  /** Position of the new item in its set (in `leoItems` for 'transitive'). */
  itemIndex: number;
  descriptionEn: string;
  descriptionCz: string;
  activeSetIndex: number;
  totalItemsSoFar: number;
  /** Number of items in each set after this step (the sets only grow). */
  setSizes: number[];
  /** Number of Leo transitive items in each set after this step. */
  leoSizes: number[];
  /** Items that caused this step. */
  sources: EarleyStepSource[];
  /** Subtree the step adds: the scanned leaf, or the subtree of the completed / ε-derived non-terminal. */
  derivationTree?: DerivationNode;
}

export interface EarleyOptions {
  /** Leo's (1991) transitive items in the completer. */
  leo?: boolean;
  maxSteps?: number;
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
  /** The run used Leo's transitive items. */
  leo: boolean;
  /**
   * With Leo: the items of the deterministic reduction paths that the completer skipped, per set,
   * reconstructed from the transitive items for the derivation trees. Chart ∪ these = plain Earley chart.
   */
  reconstructedItems: ChartItem[][];
  truncated?: boolean;
  errorMessage?: string;
  errorMessageCz?: string;
  stats: {
    predictCount: number;
    scanCount: number;
    completeCount: number;
    /** Earley items in the sets (without transitive items). */
    totalItems: number;
    /** Leo's transitive items. */
    leoItems: number;
    /** Completions done by Leo's completer (one topmost item each). */
    leoCompletions: number;
    /** Items skipped thanks to Leo (= reconstructed items). */
    skippedItems: number;
  };
}

export function formatEarleyItem(item: { production: Production; dot: number; origin: number }): string {
  const rhs = [...item.production.rhs];
  rhs.splice(item.dot, 0, '•');
  return `[${item.production.lhs} → ${rhs.join(' ') || '•'}, ${item.origin}]`;
}

/** Leo's transitive item as Marpa's triple (dotted rule, transition symbol, origin). */
export function formatLeoItem(item: LeoItem): string {
  const rhs = [...item.production.rhs];
  rhs.splice(item.dot, 0, '•');
  return `[${item.production.lhs} → ${rhs.join(' ') || '•'}, ${item.symbol}, ${item.origin}]`;
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
  options: EarleyOptions = {}
): EarleySimulationResult {
  const useLeo = options.leo ?? false;
  const maxSteps = options.maxSteps ?? 20000 + 100 * tokens.length;
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
    items: [],
    leoItems: []
  }));

  const itemKeyMap: Set<string>[] = Array.from({ length: n + 1 }, () => new Set());
  const steps: EarleyStep[] = [];
  /** Per step: what its subtree is, filled in once the chart is complete. */
  const stepTrees: ({ kind: 'leaf'; tokenIndex: number } | { kind: 'item'; production: Production; origin: number; end: number } | { kind: 'symbol'; symbol: string; from: number; to: number } | undefined)[] = [];
  let stepCounter = 0;
  let predictCount = 0;
  let scanCount = 0;
  let completeCount = 0;
  let totalItemsCount = 0;
  let truncated = false;

  function pushStep(
    setIdx: number,
    item: EarleyItem,
    itemIndex: number,
    descEn: string,
    descCz: string,
    sources: EarleyStepSource[],
    tree?: (typeof stepTrees)[number]
  ) {
    stepCounter++;
    steps.push({
      stepIndex: stepCounter,
      inputIndex: setIdx,
      operation: item.operation,
      item,
      itemIndex,
      descriptionEn: descEn,
      descriptionCz: descCz,
      activeSetIndex: setIdx,
      totalItemsSoFar: totalItemsCount,
      setSizes: sets.map(s => s.items.length),
      leoSizes: sets.map(s => s.leoItems.length),
      sources
    });
    stepTrees.push(tree);
  }

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
    pushStep(setIdx, item, sets[setIdx].items.length - 1, descEn, descCz, sources, tree);
    return true;
  }

  const ruleText = (p: Production) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;

  // --- Leo's transitive items ---
  /** Per set: symbol → index of its transitive item, or null when the symbol has none. */
  const leoMemo: Map<string, number | null>[] = Array.from({ length: n + 1 }, () => new Map());
  /** Per finished set: postdot symbol → indices of the items with that symbol after the dot. */
  const postdotIndex: (Map<string, number[]> | undefined)[] = [];
  const postdotOf = (k: number) => {
    let m = postdotIndex[k];
    if (!m) {
      m = new Map();
      sets[k].items.forEach((it, idx) => {
        if (it.dot < it.production.rhs.length) {
          const x = it.production.rhs[it.dot];
          if (!m!.has(x)) m!.set(x, []);
          m!.get(x)!.push(idx);
        }
      });
      postdotIndex[k] = m;
    }
    return m;
  };
  /** Leo completions (set i, completed symbol, origin k, transitive item in S_k) for the tree reconstruction. */
  const leoCompletions: { end: number; origin: number; leoIndex: number }[] = [];

  /**
   * The transitive item for `symbol` in the finished set S_k, created (lazily, as in Leo 1991)
   * together with the ones above it on the deterministic reduction path. Null when the symbol
   * is not Leo-unique in S_k, i.e. the ordinary completer has to run.
   */
  function transitiveItem(symbol: string, k: number): number | null {
    const path: { symbol: string; set: number; waitingIndex: number }[] = [];
    const onPath = new Set<string>();
    let cur = { symbol, set: k };
    let above: { setIndex: number; leoIndex: number } | null = null;
    for (;;) {
      const memo = leoMemo[cur.set].get(cur.symbol);
      if (memo !== undefined) {
        above = memo === null ? null : { setIndex: cur.set, leoIndex: memo };
        break;
      }
      const waiting = postdotOf(cur.set).get(cur.symbol) ?? [];
      const w = waiting.length === 1 ? sets[cur.set].items[waiting[0]] : undefined;
      if (!w || w.dot !== w.production.rhs.length - 1) {
        leoMemo[cur.set].set(cur.symbol, null);
        above = null;
        break;
      }
      const key = `${cur.symbol}\u0000${cur.set}`;
      if (onPath.has(key)) {
        // A cycle of unit-like rules (A → B, B → A) in one set: no transitive items on it.
        for (const e of path) leoMemo[e.set].set(e.symbol, null);
        return null;
      }
      onPath.add(key);
      path.push({ symbol: cur.symbol, set: cur.set, waitingIndex: waiting[0] });
      cur = { symbol: w.production.lhs, set: w.origin };
    }
    if (path.length === 0) return null;

    // Create the transitive items from the top of the path down.
    const last = path[path.length - 1];
    const lastW = sets[last.set].items[last.waitingIndex];
    let top: { production: Production; origin: number } = above
      ? sets[above.setIndex].leoItems[above.leoIndex]
      : { production: lastW.production, origin: lastW.origin };
    let depth = above ? sets[above.setIndex].leoItems[above.leoIndex].depth + 1 : 1;
    for (let p = path.length - 1; p >= 0; p--) {
      const e = path[p];
      if (stepCounter >= maxSteps) {
        truncated = true;
        return null;
      }
      const w = sets[e.set].items[e.waitingIndex];
      const leo: LeoItem = {
        id: `leo_${e.set}_${sets[e.set].leoItems.length}`,
        production: top.production,
        dot: top.production.rhs.length,
        origin: top.origin,
        operation: 'transitive',
        triggerSymbol: e.symbol,
        symbol: e.symbol,
        waitingIndex: e.waitingIndex,
        depth,
        next: above ?? undefined
      };
      sets[e.set].leoItems.push(leo);
      const leoIndex = sets[e.set].leoItems.length - 1;
      leoMemo[e.set].set(e.symbol, leoIndex);
      const aboveItem = above ? sets[above.setIndex].leoItems[above.leoIndex] : undefined;
      const topText = formatEarleyItem(leo);
      pushStep(
        e.set,
        leo,
        leoIndex,
        `Leo: in S${subscript(e.set)} the only item with ${e.symbol} after the dot is ${formatEarleyItem(w)}, and ${e.symbol} is its last symbol. So whenever ${e.symbol} is completed with origin ${e.set}, ${w.production.lhs} is completed with origin ${w.origin} too — ` +
          (aboveItem
            ? `and S${subscript(above!.setIndex)} already has the transitive item ${formatLeoItem(aboveItem)} for ${w.production.lhs}, so the path goes on to its topmost item ${topText}.`
            : `and there the path ends (${w.production.lhs} is not Leo-unique in S${subscript(w.origin)}), so its topmost item is ${topText}.`) +
          ` Transitive item ${formatLeoItem(leo)} stored in S${subscript(e.set)}: it stands for ${depth} item${depth === 1 ? '' : 's'} of the deterministic reduction path.`,
        `Leo: v S${subscript(e.set)} je jediná položka s ${e.symbol} za tečkou ${formatEarleyItem(w)} a ${e.symbol} je její poslední symbol. Kdykoli se tedy dokončí ${e.symbol} s počátkem ${e.set}, dokončí se i ${w.production.lhs} s počátkem ${w.origin} — ` +
          (aboveItem
            ? `a S${subscript(above!.setIndex)} už má pro ${w.production.lhs} tranzitivní položku ${formatLeoItem(aboveItem)}, cesta tedy pokračuje až k její nejvyšší položce ${topText}.`
            : `a tam cesta končí (${w.production.lhs} v S${subscript(w.origin)} jednoznačné není), nejvyšší položka je tedy ${topText}.`) +
          ` Do S${subscript(e.set)} uložena tranzitivní položka ${formatLeoItem(leo)}: zastupuje ${depth} ${depth === 1 ? 'položku' : depth < 5 ? 'položky' : 'položek'} deterministické redukční cesty.`,
        [
          { setIndex: e.set, itemIndex: e.waitingIndex, role: 'waiting' },
          ...(above ? [{ setIndex: above.setIndex, itemIndex: above.leoIndex, role: 'transitive' as const }] : [])
        ]
      );
      above = { setIndex: e.set, leoIndex };
      top = leo;
      depth++;
    }
    return above!.leoIndex;
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
              { kind: 'symbol', symbol: nextSymbol, from: i, to: i }
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
        const span = originIdx === i ? 'ε' : tokens.slice(originIdx, i).join(' ');

        // Leo: only for an earlier, finished set (a completion with origin i adds nothing new, see above).
        const leoIndex = useLeo && originIdx < i ? transitiveItem(completedNt, originIdx) : null;
        if (truncated) break;
        if (leoIndex !== null) {
          const leo = originSet.leoItems[leoIndex];
          const w = originSet.items[leo.waitingIndex];
          const topItem: EarleyItem = {
            id: `item_${i}_${sets[i].items.length}`,
            production: leo.production,
            dot: leo.dot,
            origin: leo.origin,
            operation: 'leo',
            triggerSymbol: completedNt,
            completedItemOrigin: originIdx
          };
          const skipped = leo.depth - 1;
          const added = addItem(
            i,
            topItem,
            `Completer (Leo): ${formatEarleyItem(it)} is complete — ${completedNt} derives “${span}” (from position ${originIdx} to ${i}). S${subscript(originIdx)} has the transitive item ${formatLeoItem(leo)} for ${completedNt}: instead of moving the dot over ${completedNt} in ${formatEarleyItem(w)} and completing the deterministic reduction path item by item, only its topmost item ${formatEarleyItem(topItem)} is added to S${subscript(i)}` +
              (skipped > 0 ? ` (${skipped} item${skipped === 1 ? '' : 's'} skipped; they are reconstructed only for the derivation tree).` : ' (the path has just this one item).'),
            `Kompletor (Leo): ${formatEarleyItem(it)} je dokončená — ${completedNt} generuje „${span}“ (od pozice ${originIdx} do ${i}). S${subscript(originIdx)} má pro ${completedNt} tranzitivní položku ${formatLeoItem(leo)}: místo posunu tečky za ${completedNt} v ${formatEarleyItem(w)} a dokončování deterministické redukční cesty položku po položce se do S${subscript(i)} přidá jen její nejvyšší položka ${formatEarleyItem(topItem)}` +
              (skipped > 0 ? ` (vynecháno ${skipped} ${skipped === 1 ? 'položka' : skipped < 5 ? 'položky' : 'položek'}; rekonstruují se jen pro derivační strom).` : ' (cesta má jen tuto jednu položku).'),
            [
              { setIndex: i, itemIndex: k, role: 'completed' },
              { setIndex: originIdx, itemIndex: leoIndex, role: 'transitive' }
            ],
            // The added rule S' → S has no node of its own: its step shows the tree of S.
            leo.production.id === AUGMENTED_PRODUCTION_ID
              ? { kind: 'symbol', symbol: grammar.startSymbol, from: leo.origin, to: i }
              : { kind: 'item', production: leo.production, origin: leo.origin, end: i }
          );
          if (added) completeCount++;
          leoCompletions.push({ end: i, origin: originIdx, leoIndex });
          continue;
        }

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

  // Leo stack expansion: the items of the deterministic reduction paths that the completer skipped.
  // Going down from a transitive item, each waiting item [A → α • B, j] gives [A → α B •, j]; once an
  // item is already reconstructed, the rest of the path above it is too (the path is deterministic).
  const reconstructedItems: ChartItem[][] = sets.map(() => []);
  if (!truncated) {
    const seen: Set<string>[] = sets.map(() => new Set());
    for (const c of leoCompletions) {
      let ref: { setIndex: number; leoIndex: number } | undefined = { setIndex: c.origin, leoIndex: c.leoIndex };
      while (ref) {
        const leo: LeoItem = sets[ref.setIndex].leoItems[ref.leoIndex];
        const w = sets[ref.setIndex].items[leo.waitingIndex];
        const key = formatItemKey(w.production.id, w.dot + 1, w.origin);
        if (seen[c.end].has(key)) break;
        seen[c.end].add(key);
        if (!itemKeyMap[c.end].has(key)) {
          reconstructedItems[c.end].push({ production: w.production, dot: w.dot + 1, origin: w.origin });
        }
        ref = leo.next;
      }
    }
  }

  // Derivation trees from the finished chart (also the subtrees shown by the steps).
  const trees: DerivationNode[] = [];
  if (!truncated) {
    const forest = chartTrees(grammar, tokens, sets.map((s, idx) => [...s.items, ...reconstructedItems[idx]]));
    steps.forEach((step, idx) => {
      const t = stepTrees[idx];
      if (!t) return;
      step.derivationTree =
        t.kind === 'leaf'
          ? { id: scannedLeafId(t.tokenIndex, tokens[t.tokenIndex]), symbol: tokens[t.tokenIndex], isTerminal: true }
          : t.kind === 'item'
          ? forest.ofItem(t.production, t.origin, t.end)
          : forest.ofSymbol(t.symbol, t.from, t.to);
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
    leo: useLeo,
    reconstructedItems,
    truncated,
    errorMessage: truncated ? `Parsing stopped after reaching the limit of ${maxSteps} steps.` : undefined,
    errorMessageCz: truncated ? `Analýza byla zastavena po dosažení limitu ${maxSteps} kroků.` : undefined,
    stats: {
      predictCount,
      scanCount,
      completeCount,
      totalItems: totalItemsCount,
      leoItems: sets.reduce((sum, s) => sum + s.leoItems.length, 0),
      leoCompletions: leoCompletions.length,
      skippedItems: reconstructedItems.reduce((sum, r) => sum + r.length, 0)
    }
  };
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** S₁₂ instead of S_12 in the step texts. */
export function subscript(n: number): string {
  return String(n).replace(/\d/g, d => SUBSCRIPT_DIGITS[Number(d)]);
}
