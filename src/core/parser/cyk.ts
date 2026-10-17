/**
 * The Cocke–Younger–Kasami algorithm for a grammar in Chomsky normal form
 * (rules A → B C, A → a, and S → ε when S is on no right-hand side).
 *
 * V(i, j) is the set of non-terminals that derive the part w_i … w_j of the
 * word (1-based, inclusive): for one symbol the A with A → w_i, for a longer
 * part the A with A → B C, B ∈ V(i, k), C ∈ V(k+1, j) for some k. The word
 * belongs to the language when S ∈ V(1, n).
 */

import { Grammar, Production } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';

/** Why A is in a cell: a rule A → a, or A → B C with the split point k. */
export interface CykWitness {
  production: Production;
  /** A → B C: B ∈ V(i, k), C ∈ V(k+1, j); absent for A → a */
  k?: number;
}

export interface CykTable {
  n: number;
  /** cells[i][j] for 1 ≤ i ≤ j ≤ n: non-terminal -> its witnesses (in the order of k) */
  cells: Map<string, CykWitness[]>[][];
  accepted: boolean;
}

export interface CykCellCoordinate {
  i: number;
  j: number;
}

/**
 * One step of the computation: the initialisation, one cell of length 1, one
 * split point k of a longer cell, or the final check of V(1, n). What the
 * table holds at a step is given by `cykCellAtStep` (the table is filled in a
 * fixed order, so no copy of it is stored per step).
 */
export interface CYKStep {
  stepIndex: number;
  phase: 'init' | 'base' | 'combine' | 'accept';
  /** Length of the part of the word (j − i + 1) */
  length: number;
  i: number;
  j: number;
  k?: number;
  token?: string;
  /** The cell being filled (absent for the initialisation) */
  targetCell?: CykCellCoordinate;
  leftCell?: CykCellCoordinate;
  rightCell?: CykCellCoordinate;
  /** Non-terminals that enter the target cell in this step */
  addedNonTerminals: string[];
  /** Non-terminals derived again in this step although already in the cell (another derivation of the part) */
  repeatedNonTerminals: string[];
  /** The rules applied in this step */
  activeWitnesses?: CykWitness[];
  descriptionEn: string;
  descriptionCz: string;
  /** Subtrees built in this step (a forest root when there are several); the full tree in the final step */
  derivationTree?: DerivationNode;
}

export interface CYKSimulationResult {
  accepted: boolean;
  totalSteps: number;
  steps: CYKStep[];
  table: CykTable;
  /** The first derivation trees (at most 5) */
  trees: DerivationNode[];
  /** The number of all derivation trees of the word */
  treeCount: bigint;
}

/** Rules that are not in Chomsky normal form (empty for a grammar in CNF). */
export function cnfViolations(g: Grammar): Production[] {
  const startOnRight = g.productions.some(p => p.rhs.includes(g.startSymbol));
  return g.productions.filter(p => {
    if (p.rhs.length === 2) return !(g.nonTerminals.has(p.rhs[0]) && g.nonTerminals.has(p.rhs[1]));
    if (p.rhs.length === 1) return g.nonTerminals.has(p.rhs[0]);
    if (p.rhs.length === 0) return p.lhs !== g.startSymbol || startOnRight;
    return true;
  });
}

const hasStartEpsilon = (g: Grammar) => g.productions.some(p => p.lhs === g.startSymbol && p.rhs.length === 0);

export function cykTable(g: Grammar, w: string[]): CykTable {
  const n = w.length;
  const cells: Map<string, CykWitness[]>[][] = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => new Map()));
  const add = (i: number, j: number, A: string, wit: CykWitness) => {
    const cell = cells[i][j];
    if (!cell.has(A)) cell.set(A, []);
    cell.get(A)!.push(wit);
  };
  for (let i = 1; i <= n; i++) {
    for (const p of g.productions) {
      if (p.rhs.length === 1 && p.rhs[0] === w[i - 1] && !g.nonTerminals.has(p.rhs[0])) add(i, i, p.lhs, { production: p });
    }
  }
  const binary = g.productions.filter(p => p.rhs.length === 2);
  for (let len = 2; len <= n; len++) {
    for (let i = 1; i + len - 1 <= n; i++) {
      const j = i + len - 1;
      for (let k = i; k < j; k++) {
        for (const p of binary) {
          if (cells[i][k].has(p.rhs[0]) && cells[k + 1][j].has(p.rhs[1])) add(i, j, p.lhs, { production: p, k });
        }
      }
    }
  }
  const accepted = n === 0 ? hasStartEpsilon(g) : cells[1][n].has(g.startSymbol);
  return { n, cells, accepted };
}

/**
 * The number of derivation trees of the word (every witness is one choice of
 * the rule and of k; in CNF a part never depends on itself, so it is finite).
 */
export function countCYKTrees(g: Grammar, table: CykTable): bigint {
  if (table.n === 0) return BigInt(g.productions.filter(p => p.lhs === g.startSymbol && p.rhs.length === 0).length);
  const memo = new Map<string, bigint>();
  const count = (A: string, i: number, j: number): bigint => {
    const key = `${A}\u0000${i}\u0000${j}`;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let total = 0n;
    for (const wit of table.cells[i][j].get(A) || []) {
      total += wit.k === undefined ? 1n : count(wit.production.rhs[0], i, wit.k) * count(wit.production.rhs[1], wit.k + 1, j);
    }
    memo.set(key, total);
    return total;
  };
  return count(g.startSymbol, 1, table.n);
}

/**
 * Derivation trees of w in the CNF grammar read from the witnesses of the
 * table: distinct trees, at most `maxTrees`. The trees of every (A, i, j) are
 * built once (a part is shorter in every child, so there is no cycle and no
 * depth limit is needed).
 */
export function extractCYKTrees(g: Grammar, w: string[], table: CykTable, maxTrees: number = 5): DerivationNode[] {
  if (w.length === 0) {
    if (!table.accepted) return [];
    return [{
      id: 'cyk_eps_root',
      symbol: g.startSymbol,
      isTerminal: false,
      children: [{ id: 'cyk_eps_leaf', symbol: 'ε', isTerminal: true }]
    }];
  }
  let counter = 0;
  const memo = new Map<string, DerivationNode[]>();
  const build = (A: string, i: number, j: number): DerivationNode[] => {
    const key = `${A}\u0000${i}\u0000${j}`;
    const m = memo.get(key);
    if (m) return m;
    const trees: DerivationNode[] = [];
    for (const wit of table.cells[i]?.[j]?.get(A) || []) {
      if (trees.length >= maxTrees) break;
      if (wit.k === undefined) {
        trees.push({
          id: `cyk_${counter++}`,
          symbol: A,
          isTerminal: false,
          children: [{ id: `cyk_${counter++}`, symbol: wit.production.rhs[0], isTerminal: true }]
        });
        continue;
      }
      const left = build(wit.production.rhs[0], i, wit.k);
      const right = build(wit.production.rhs[1], wit.k + 1, j);
      combine: for (const l of left) {
        for (const r of right) {
          trees.push({ id: `cyk_${counter++}`, symbol: A, isTerminal: false, children: [l, r] });
          if (trees.length >= maxTrees) break combine;
        }
      }
    }
    memo.set(key, trees);
    return trees;
  };
  return build(g.startSymbol, 1, table.n);
}

/**
 * The content of cell V(i, j) at a step of the simulation: null when the cell
 * has not been computed yet; for the cell being filled only the witnesses
 * with a split point up to the current k.
 */
export function cykCellAtStep(table: CykTable, step: CYKStep, i: number, j: number): Map<string, CykWitness[]> | null {
  const full = table.cells[i]?.[j];
  if (!full) return null;
  const len = j - i + 1;
  switch (step.phase) {
    case 'init':
      return null;
    case 'accept':
      return full;
    case 'base':
      return len === 1 && i <= step.i ? full : null;
    case 'combine': {
      if (len < step.length || (len === step.length && i < step.i)) return full;
      if (i !== step.i || j !== step.j) return null;
      const partial = new Map<string, CykWitness[]>();
      for (const [A, wits] of full) {
        const upTo = wits.filter(wit => wit.k !== undefined && wit.k <= step.k!);
        if (upTo.length > 0) partial.set(A, upTo);
      }
      return partial;
    }
  }
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const sub = (x: number) => String(x).replace(/\d/g, d => SUBSCRIPT[Number(d)]);
/** w₁ or w₂…w₄ */
const partName = (i: number, j: number) => (i === j ? `w${sub(i)}` : `w${sub(i)}…w${sub(j)}`);
const V = (i: number, j: number) => `V(${i}, ${j})`;
const setText = (xs: Iterable<string>) => {
  const a = [...xs];
  return a.length === 0 ? '∅' : `{${a.join(', ')}}`;
};
const rule = (p: Production) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;

/** A copy of a tree with fresh ids (subtrees are shared between the trees of the steps). */
function cloneTree(n: DerivationNode, prefix: string, ids: { next: number }): DerivationNode {
  return {
    ...n,
    id: `${prefix}_${ids.next++}`,
    children: n.children?.map(c => cloneTree(c, prefix, ids))
  };
}

/** One tree, or a forest root grouping several. */
function forest(trees: DerivationNode[], id: string): DerivationNode | undefined {
  if (trees.length === 0) return undefined;
  if (trees.length === 1) return trees[0];
  return { id, symbol: '', isTerminal: false, isForestRoot: true, children: trees };
}

/** At most this many subtrees are shown for one step. */
const MAX_STEP_TREES = 6;

/** A step whose texts and subtrees are computed on first access (and then kept). */
function lazyStep(
  base: Omit<CYKStep, 'descriptionEn' | 'descriptionCz' | 'derivationTree'>,
  en: () => string,
  cz: () => string,
  tree: () => DerivationNode | undefined
): CYKStep {
  const cache: { en?: string; cz?: string; tree?: DerivationNode; treeDone?: boolean } = {};
  return Object.defineProperties(base as CYKStep, {
    descriptionEn: { enumerable: true, get: () => (cache.en ??= en()) },
    descriptionCz: { enumerable: true, get: () => (cache.cz ??= cz()) },
    derivationTree: {
      enumerable: true,
      get: () => {
        if (!cache.treeDone) {
          cache.tree = tree();
          cache.treeDone = true;
        }
        return cache.tree;
      }
    }
  });
}

/**
 * Simulates the Cocke–Younger–Kasami (CYK) algorithm step by step:
 * 1. length 1: the rules A → w_i give V(i, i);
 * 2. lengths 2 … n: for every part w_i … w_j and every split k = i … j−1 the
 *    rules A → B C with B ∈ V(i, k), C ∈ V(k+1, j);
 * 3. the check S ∈ V(1, n).
 * `converted` says that g is the CNF G′ of the user's grammar G (texts then say L(G′) = L(G)).
 */
export function simulateCYKParse(g: Grammar, w: string[], opts: { converted?: boolean } = {}): CYKSimulationResult {
  const n = w.length;
  const table = cykTable(g, w);
  const trees = extractCYKTrees(g, w, table);
  const treeCount = countCYKTrees(g, table);
  const steps: CYKStep[] = [];
  const S = g.startSymbol;
  const G = opts.converted ? 'G′' : 'G';
  const LG = opts.converted ? 'L(G′) = L(G)' : 'L(G)';
  const word = (i: number, j: number) => w.slice(i - 1, j).join(' ');

  if (n === 0) {
    const hasEps = table.accepted;
    steps.push({
      stepIndex: 0,
      phase: 'accept',
      length: 0,
      i: 1,
      j: 0,
      addedNonTerminals: hasEps ? [S] : [],
      repeatedNonTerminals: [],
      descriptionEn: `The empty word w = ε has no cells in the table: ε ∈ ${LG} iff ${G} has the rule ${S} → ε (in CNF allowed only for the start symbol, which then occurs on no right-hand side). ${hasEps ? `${G} has it, so ε ∈ ${LG}.` : `${G} does not have it, so ε ∉ ${LG}.`}`,
      descriptionCz: `Prázdné slovo w = ε nemá v tabulce žádné buňky: ε ∈ ${LG}, právě když ${G} obsahuje pravidlo ${S} → ε (v CNF povolené jen pro počáteční symbol, který se pak nevyskytuje na žádné pravé straně). ${hasEps ? `${G} je obsahuje, proto ε ∈ ${LG}.` : `${G} je neobsahuje, proto ε ∉ ${LG}.`}`,
      derivationTree: trees[0]
    });
    return { accepted: hasEps, totalSteps: steps.length, steps, table, trees, treeCount };
  }

  // One derivation tree for every (A, i, j), from its first witness; built once and shared by the steps
  // (within one tree a part occurs once, so the ids stay unique; in a forest of several trees the others are copied)
  const firstMemo = new Map<string, DerivationNode>();
  let firstId = 0;
  const firstTree = (A: string, i: number, j: number): DerivationNode => {
    const key = `${A}\u0000${i}\u0000${j}`;
    const m = firstMemo.get(key);
    if (m) return m;
    const wit = table.cells[i][j].get(A)![0];
    const node: DerivationNode = {
      id: `cyk_f${firstId++}`,
      symbol: A,
      isTerminal: false,
      children: wit.k === undefined
        ? [{ id: `cyk_f${firstId++}`, symbol: wit.production.rhs[0], isTerminal: true }]
        : [firstTree(wit.production.rhs[0], i, wit.k), firstTree(wit.production.rhs[1], wit.k + 1, j)]
    };
    firstMemo.set(key, node);
    return node;
  };

  steps.push({
    stepIndex: 0,
    phase: 'init',
    length: 0,
    i: 1,
    j: n,
    addedNonTerminals: [],
    repeatedNonTerminals: [],
    descriptionEn: `The CYK table for w = ${w.join(' ')} (n = ${n}) in the grammar ${G} in Chomsky normal form. V(i, j) will hold the non-terminals that derive the part wᵢ…wⱼ. The table is filled by the length of the part: first length 1 (rules A → a), then lengths 2 … ${n} (rules A → B C over all splits k = i … j−1).`,
    descriptionCz: `Tabulka CYK pro slovo w = ${w.join(' ')} (n = ${n}) v gramatice ${G} v Chomského normální formě. V(i, j) bude obsahovat neterminály, které generují úsek wᵢ…wⱼ. Tabulka se plní podle délky úseku: nejprve délka 1 (pravidla A → a), pak délky 2 … ${n} (pravidla A → B C přes všechna dělení k = i … j−1).`
  });

  // Length 1: V(i, i)
  for (let i = 1; i <= n; i++) {
    const token = w[i - 1];
    const cell = table.cells[i][i];
    const nts = [...cell.keys()];
    const wits = [...cell.values()].flat();
    const stepTrees = nts.slice(0, MAX_STEP_TREES).map(A => firstTree(A, i, i));
    const rules = wits.map(x => rule(x.production)).join(', ');
    steps.push({
      stepIndex: steps.length,
      phase: 'base',
      length: 1,
      i,
      j: i,
      token,
      targetCell: { i, j: i },
      addedNonTerminals: nts,
      repeatedNonTerminals: [],
      activeWitnesses: wits,
      descriptionEn: nts.length > 0
        ? `Length 1, ${partName(i, i)} = ${token}. Rules with the right-hand side ${token}: ${rules}. So ${V(i, i)} = ${setText(nts)}.`
        : `Length 1, ${partName(i, i)} = ${token}. There is no rule A → ${token}, so ${V(i, i)} = ∅.`,
      descriptionCz: nts.length > 0
        ? `Délka 1, ${partName(i, i)} = ${token}. Pravidla s pravou stranou ${token}: ${rules}. Proto ${V(i, i)} = ${setText(nts)}.`
        : `Délka 1, ${partName(i, i)} = ${token}. Neexistuje pravidlo A → ${token}, proto ${V(i, i)} = ∅.`,
      derivationTree: forest(stepTrees, `cyk_b${i}_forest`)
    });
  }

  // Lengths 2 … n: V(i, j) over the splits k
  const binary = g.productions.filter(p => p.rhs.length === 2);
  for (let len = 2; len <= n; len++) {
    for (let i = 1; i + len - 1 <= n; i++) {
      const j = i + len - 1;
      const inCell = new Set<string>();
      for (let k = i; k < j; k++) {
        const left = table.cells[i][k];
        const right = table.cells[k + 1][j];
        const matched: CykWitness[] = [];
        const added: string[] = [];
        const repeated: string[] = [];
        /** for every matched rule: whether its left-hand side was new in the cell */
        const isNew: boolean[] = [];
        for (const p of binary) {
          if (!left.has(p.rhs[0]) || !right.has(p.rhs[1])) continue;
          matched.push({ production: p, k });
          isNew.push(!inCell.has(p.lhs));
          if (!inCell.has(p.lhs)) {
            inCell.add(p.lhs);
            added.push(p.lhs);
          } else if (!repeated.includes(p.lhs)) {
            repeated.push(p.lhs);
          }
        }
        const soFar = [...inCell];

        // The texts and the subtrees are built when the step is shown (a word of 60 symbols has 36 000 steps)
        const describe = (en: boolean): string => {
          const head =
            `${en ? 'Length' : 'Délka'} ${len}, ${en ? 'part' : 'úsek'} ${partName(i, j)} = ${word(i, j)}, ${en ? 'split' : 'dělení'} k = ${k}: ` +
            `${partName(i, k)} = ${word(i, k)} | ${partName(k + 1, j)} = ${word(k + 1, j)}. ` +
            `${V(i, k)} = ${setText(left.keys())}, ${V(k + 1, j)} = ${setText(right.keys())}.`;
          let body: string;
          if (left.size === 0 || right.size === 0) {
            const both = left.size === 0 && right.size === 0;
            body = en
              ? `${both ? 'Both cells are' : left.size === 0 ? 'The left cell is' : 'The right cell is'} empty, so no rule A → B C applies for this k.`
              : `${both ? 'Obě buňky jsou prázdné' : left.size === 0 ? 'Levá buňka je prázdná' : 'Pravá buňka je prázdná'}, pro toto k proto nelze použít žádné pravidlo A → B C.`;
          } else if (matched.length === 0) {
            body = en
              ? `There is no rule A → B C with B ∈ ${V(i, k)} and C ∈ ${V(k + 1, j)}.`
              : `Neexistuje pravidlo A → B C s B ∈ ${V(i, k)} a C ∈ ${V(k + 1, j)}.`;
          } else {
            body = matched.map(({ production: p }, idx) => {
              const [B, C] = p.rhs;
              const A = p.lhs;
              const why = `${rule(p)} (${B} ∈ ${V(i, k)}, ${C} ∈ ${V(k + 1, j)})`;
              if (isNew[idx]) return en ? `${why}: ${A} is added to ${V(i, j)}.` : `${why}: ${A} přidáme do ${V(i, j)}.`;
              const first = table.cells[i][j].get(A)![0];
              const from = first.k! < k
                ? (en ? `from k = ${first.k}` : `z k = ${first.k}`)
                : (en ? `from the rule ${rule(first.production)} at this k` : `z pravidla ${rule(first.production)} při tomto k`);
              return en
                ? `${why}: ${A} is already in ${V(i, j)} (${from}). This is another derivation of ${partName(i, j)} from ${A}, so ${A} derives this part by more than one derivation tree.`
                : `${why}: ${A} už ve ${V(i, j)} je (${from}). Jde o další derivaci úseku ${partName(i, j)} z ${A}, ${A} tedy generuje tento úsek více derivačními stromy.`;
            }).join(' ');
          }
          const tail = k === j - 1
            ? (en ? `This was the last split: ${V(i, j)} = ${setText(soFar)}.` : `Toto bylo poslední dělení: ${V(i, j)} = ${setText(soFar)}.`)
            : (en ? `So far ${V(i, j)} = ${setText(soFar)}.` : `Zatím ${V(i, j)} = ${setText(soFar)}.`);
          return `${head} ${body} ${tail}`;
        };
        const subtrees = (): DerivationNode | undefined => {
          const prefix = `cyk_c${i}_${j}_${k}`;
          const ids = { next: 0 };
          const roots = matched.slice(0, MAX_STEP_TREES).map(({ production: p }) => ({
            id: `${prefix}_${ids.next++}`,
            symbol: p.lhs,
            isTerminal: false,
            children: [firstTree(p.rhs[0], i, k), firstTree(p.rhs[1], k + 1, j)]
          }));
          return forest(roots.map((t, idx) => (idx === 0 ? t : cloneTree(t, prefix, ids))), `${prefix}_forest`);
        };

        steps.push(lazyStep({
          stepIndex: steps.length,
          phase: 'combine',
          length: len,
          i,
          j,
          k,
          targetCell: { i, j },
          leftCell: { i, j: k },
          rightCell: { i: k + 1, j },
          addedNonTerminals: added,
          repeatedNonTerminals: repeated,
          activeWitnesses: matched
        }, () => describe(true), () => describe(false), subtrees));
      }
    }
  }

  // The final check: S ∈ V(1, n)
  const accepted = table.accepted;
  const top = setText(table.cells[1][n].keys());
  const countText = treeCount.toString();
  const partial = trees.length > 0 && BigInt(trees.length) < treeCount;
  const shownEn = partial ? ` The first ${trees.length} are shown.` : '';
  const shownCz = partial ? ` Zobrazeno je prvních ${trees.length}.` : '';
  steps.push({
    stepIndex: steps.length,
    phase: 'accept',
    length: n,
    i: 1,
    j: n,
    targetCell: { i: 1, j: n },
    addedNonTerminals: accepted ? [S] : [],
    repeatedNonTerminals: [],
    descriptionEn: accepted
      ? `The table is complete. ${V(1, n)} = ${top} contains the start symbol ${S}, so w = ${w.join(' ')} ∈ ${LG}. Number of derivation trees in ${G}: ${countText}.${shownEn}`
      : `The table is complete. ${V(1, n)} = ${top} does not contain the start symbol ${S}, so w = ${w.join(' ')} ∉ ${LG}.`,
    descriptionCz: accepted
      ? `Výpočet tabulky CYK dokončen. ${V(1, n)} = ${top} obsahuje počáteční symbol ${S}, proto w = ${w.join(' ')} ∈ ${LG}. Počet derivačních stromů v ${G}: ${countText}.${shownCz}`
      : `Výpočet tabulky CYK dokončen. ${V(1, n)} = ${top} neobsahuje počáteční symbol ${S}, proto w = ${w.join(' ')} ∉ ${LG}.`,
    derivationTree: trees[0]
  });

  return { accepted, totalSteps: steps.length, steps, table, trees, treeCount };
}
