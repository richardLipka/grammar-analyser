/**
 * The Cocke–Younger–Kasami algorithm for a grammar in Chomsky normal form
 * (rules A → B C, A → a, and S → ε when S is on no right-hand side).
 *
 * V(i, j) is the set of non-terminals that derive the part w_i … w_j of the
 * word (1-based, inclusive): for one symbol the A with A → w_i, for a longer
 * part the A with A → B C, B ∈ V(i, k), C ∈ V(k+1, j) for some k. The word
 * belongs to the language when S ∈ V(1, n).
 */

import { Grammar, Production, formatProduction } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';

/** Why A is in a cell: a rule A → a, or A → B C with the split point k. */
export interface CykWitness {
  production: Production;
  /** A → B C: B ∈ V(i, k), C ∈ V(k+1, j); absent for A → a */
  k?: number;
}

export interface CykTable {
  n: number;
  /** cells[i][j] for 1 ≤ i ≤ j ≤ n: non-terminal -> its witnesses */
  cells: Map<string, CykWitness[]>[][];
  accepted: boolean;
}

export interface CykCellCoordinate {
  i: number;
  j: number;
}

export interface CYKStep {
  stepIndex: number;
  phase: 'init' | 'base' | 'combine' | 'accept';
  length: number;
  i: number;
  j: number;
  k?: number;
  token?: string;
  targetCell: CykCellCoordinate;
  leftCell?: CykCellCoordinate;
  rightCell?: CykCellCoordinate;
  addedNonTerminals: string[];
  activeWitnesses?: CykWitness[];
  descriptionEn: string;
  descriptionCz: string;
  tableSnapshot: { [coordKey: string]: string[] };
  derivationTree?: DerivationNode;
}

export interface CYKSimulationResult {
  accepted: boolean;
  totalSteps: number;
  steps: CYKStep[];
  table: CykTable;
  trees: DerivationNode[];
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
  const accepted = n === 0
    ? g.productions.some(p => p.lhs === g.startSymbol && p.rhs.length === 0)
    : cells[1][n].has(g.startSymbol);
  return { n, cells, accepted };
}

/**
 * Extracts derivation parse trees for word w from the computed CYK table.
 * Supports ambiguous grammars by extracting up to maxTrees distinct derivation trees.
 */
export function extractCYKTrees(g: Grammar, w: string[], table: CykTable, maxTrees: number = 5): DerivationNode[] {
  if (w.length === 0) {
    if (table.accepted) {
      return [{
        id: 'cyk_eps_root',
        symbol: g.startSymbol,
        isTerminal: false,
        children: [{ id: 'cyk_eps_leaf', symbol: 'ε', isTerminal: true }]
      }];
    }
    return [];
  }

  let counter = 0;
  function buildTrees(i: number, j: number, A: string, depth: number = 0): DerivationNode[] {
    if (depth > 25) return [];
    const wits = table.cells[i]?.[j]?.get(A);
    if (!wits || wits.length === 0) return [];

    const trees: DerivationNode[] = [];
    for (const wit of wits) {
      if (trees.length >= maxTrees) break;
      if (wit.k === undefined) {
        trees.push({
          id: `cyk_node_${counter++}_${A}_${i}`,
          symbol: A,
          isTerminal: false,
          children: [{
            id: `cyk_tok_${counter++}_${wit.production.rhs[0]}`,
            symbol: wit.production.rhs[0],
            isTerminal: true
          }]
        });
      } else {
        const B = wit.production.rhs[0];
        const C = wit.production.rhs[1];
        const bTrees = buildTrees(i, wit.k, B, depth + 1);
        const cTrees = buildTrees(wit.k + 1, j, C, depth + 1);

        for (const bTree of bTrees) {
          for (const cTree of cTrees) {
            trees.push({
              id: `cyk_node_${counter++}_${A}_${i}_${j}`,
              symbol: A,
              isTerminal: false,
              children: [bTree, cTree]
            });
            if (trees.length >= maxTrees) break;
          }
          if (trees.length >= maxTrees) break;
        }
      }
    }
    return trees;
  }

  return buildTrees(1, table.n, g.startSymbol);
}

/**
 * Simulates the Cocke-Younger-Kasami (CYK) algorithm step-by-step.
 * Generates an interactive trace explaining:
 * 1. Base layer (len = 1): matching terminal rules A → w_i into V(i, i).
 * 2. Higher layers (len = 2 … n): combining V(i, k) and V(k+1, j) across split points k.
 * 3. Final root check at V(1, n) for start symbol S.
 */
export function simulateCYKParse(g: Grammar, w: string[]): CYKSimulationResult {
  const n = w.length;
  const table = cykTable(g, w);
  const trees = extractCYKTrees(g, w, table);
  const steps: CYKStep[] = [];

  const cellsSnapshot: { [key: string]: string[] } = {};
  function getSnap(): { [key: string]: string[] } {
    return { ...cellsSnapshot };
  }

  if (n === 0) {
    const hasEps = g.productions.some(p => p.lhs === g.startSymbol && p.rhs.length === 0);
    steps.push({
      stepIndex: 1,
      phase: 'accept',
      length: 0,
      i: 1,
      j: 0,
      targetCell: { i: 1, j: 0 },
      addedNonTerminals: hasEps ? [g.startSymbol] : [],
      descriptionEn: hasEps
        ? `Empty word: grammar has start production ${g.startSymbol} → ε. Word belongs to language.`
        : `Empty word: grammar lacks start production ${g.startSymbol} → ε. Word rejected.`,
      descriptionCz: hasEps
        ? `Prázdné slovo: gramatika obsahuje pravidlo ${g.startSymbol} → ε. Slovo patří do jazyka.`
        : `Prázdné slovo: gramatika neobsahuje pravidlo ${g.startSymbol} → ε. Slovo nepatří do jazyka.`,
      tableSnapshot: {},
      derivationTree: trees[0]
    });
    return {
      accepted: hasEps,
      totalSteps: steps.length,
      steps,
      table,
      trees
    };
  }

  // Initial Step 0: start CYK matrix
  steps.push({
    stepIndex: 0,
    phase: 'init',
    length: 0,
    i: 1,
    j: n,
    targetCell: { i: 1, j: 1 },
    addedNonTerminals: [],
    descriptionEn: `Initialize CYK table for input of length n = ${n} tokens: [${w.join(', ')}].`,
    descriptionCz: `Inicializace tabulky CYK pro vstup o délce n = ${n} symbolů: [${w.join(', ')}].`,
    tableSnapshot: getSnap()
  });

  // Phase 1: Base layer (length 1: V(i, i))
  for (let i = 1; i <= n; i++) {
    const token = w[i - 1];
    const cellWits = table.cells[i][i];
    const addedNts = [...cellWits.keys()];
    cellsSnapshot[`${i},${i}`] = addedNts;

    let leafTree: DerivationNode | undefined = undefined;
    if (addedNts.length > 0) {
      const firstA = addedNts[0];
      leafTree = {
        id: `cyk_step_leaf_${i}`,
        symbol: firstA,
        isTerminal: false,
        children: [{ id: `cyk_step_tok_${i}`, symbol: token, isTerminal: true }]
      };
    }

    const matchedProds = [...cellWits.values()].flat().map(w => `${w.production.lhs} → '${token}'`);
    const rulesStr = matchedProds.join(', ');

    steps.push({
      stepIndex: steps.length,
      phase: 'base',
      length: 1,
      i,
      j: i,
      token,
      targetCell: { i, j: i },
      addedNonTerminals: addedNts,
      activeWitnesses: [...cellWits.values()].flat(),
      descriptionEn: addedNts.length > 0
        ? `Base layer len=1 at position i=${i} (token '${token}'): matched rule(s) ${rulesStr}. Adding {${addedNts.join(', ')}} to V(${i}, ${i}).`
        : `Base layer len=1 at position i=${i} (token '${token}'): no terminal rule derives '${token}'. V(${i}, ${i}) = ∅.`,
      descriptionCz: addedNts.length > 0
        ? `Základní vrstva délky 1 na pozici i=${i} (token '${token}'): nalezena pravidla ${rulesStr}. Vkládáme {${addedNts.join(', ')}} do V(${i}, ${i}).`
        : `Základní vrstva délky 1 na pozici i=${i} (token '${token}'): žádné terminální pravidlo negeneruje '${token}'. V(${i}, ${i}) = ∅.`,
      tableSnapshot: getSnap(),
      derivationTree: leafTree
    });
  }

  // Helper to extract a single partial tree from current cells
  function buildSubtree(startI: number, endJ: number, A: string): DerivationNode | undefined {
    const cellWits = table.cells[startI]?.[endJ]?.get(A);
    if (!cellWits || cellWits.length === 0) return undefined;
    const wit = cellWits[0];
    if (wit.k === undefined) {
      return {
        id: `cyk_part_${startI}_${A}`,
        symbol: A,
        isTerminal: false,
        children: [{ id: `cyk_tok_${startI}`, symbol: wit.production.rhs[0], isTerminal: true }]
      };
    }
    const B = wit.production.rhs[0];
    const C = wit.production.rhs[1];
    const leftChild = buildSubtree(startI, wit.k, B);
    const rightChild = buildSubtree(wit.k + 1, endJ, C);
    return {
      id: `cyk_part_${startI}_${endJ}_${A}`,
      symbol: A,
      isTerminal: false,
      children: [
        leftChild ?? { id: `dummy_b`, symbol: B, isTerminal: false },
        rightChild ?? { id: `dummy_c`, symbol: C, isTerminal: false }
      ]
    };
  }

  // Phase 2: Higher layers (length 2 … n)
  const binaryProds = g.productions.filter(p => p.rhs.length === 2);
  for (let len = 2; len <= n; len++) {
    for (let i = 1; i + len - 1 <= n; i++) {
      const j = i + len - 1;
      const key = `${i},${j}`;
      const cumulativeAdded: Set<string> = new Set();

      for (let k = i; k < j; k++) {
        const leftKey = `${i},${k}`;
        const rightKey = `${k + 1},${j}`;
        const leftNts = table.cells[i][k];
        const rightNts = table.cells[k + 1][j];

        const matchedAtSplit: CykWitness[] = [];
        const addedThisSplit: string[] = [];

        for (const p of binaryProds) {
          const B = p.rhs[0];
          const C = p.rhs[1];
          if (leftNts.has(B) && rightNts.has(C)) {
            matchedAtSplit.push({ production: p, k });
            if (!cumulativeAdded.has(p.lhs)) {
              cumulativeAdded.add(p.lhs);
              addedThisSplit.push(p.lhs);
            }
          }
        }

        // Update snapshot
        cellsSnapshot[key] = [...cumulativeAdded];

        let activeStepTree: DerivationNode | undefined = undefined;
        if (addedThisSplit.length > 0) {
          activeStepTree = buildSubtree(i, j, addedThisSplit[0]);
        }

        const leftStr = `V(${i}, ${k}) = {${[...leftNts.keys()].join(', ') || '∅'}}`;
        const rightStr = `V(${k + 1}, ${j}) = {${[...rightNts.keys()].join(', ') || '∅'}}`;
        const rulesStr = matchedAtSplit.map(m => `${m.production.lhs} → ${m.production.rhs.join(' ')}`).join(', ');

        steps.push({
          stepIndex: steps.length,
          phase: 'combine',
          length: len,
          i,
          j,
          k,
          targetCell: { i, j },
          leftCell: { i, j: k },
          rightCell: { i: k + 1, j },
          addedNonTerminals: addedThisSplit,
          activeWitnesses: matchedAtSplit,
          descriptionEn: matchedAtSplit.length > 0
            ? `Length ${len}, substring [${i}…${j}] split at k=${k}: ${leftStr} and ${rightStr}. Matched rule(s) ${rulesStr}. Adding {${addedThisSplit.join(', ')}} to V(${i}, ${j}).`
            : `Length ${len}, substring [${i}…${j}] split at k=${k}: ${leftStr} and ${rightStr}. No binary rules A → B C match this split.`,
          descriptionCz: matchedAtSplit.length > 0
            ? `Délka ${len}, úsek [${i}…${j}] dělený v k=${k}: ${leftStr} a ${rightStr}. Nalezena pravidla ${rulesStr}. Vkládáme {${addedThisSplit.join(', ')}} do V(${i}, ${j}).`
            : `Délka ${len}, úsek [${i}…${j}] dělený v k=${k}: ${leftStr} a ${rightStr}. Žádné binární pravidlo A → B C pro toto dělení neodpovídá.`,
          tableSnapshot: getSnap(),
          derivationTree: activeStepTree
        });
      }
    }
  }

  // Phase 3: Final Acceptance check
  const isAccepted = table.cells[1][n].has(g.startSymbol);
  const rootTree = trees.length > 0 ? trees[0] : undefined;

  steps.push({
    stepIndex: steps.length,
    phase: 'accept',
    length: n,
    i: 1,
    j: n,
    targetCell: { i: 1, j: n },
    addedNonTerminals: isAccepted ? [g.startSymbol] : [],
    descriptionEn: isAccepted
      ? `Completed CYK parsing: start symbol '${g.startSymbol}' ∈ V(1, ${n}). The word belongs to the language L(G). Valid derivation tree constructed.`
      : `Completed CYK parsing: start symbol '${g.startSymbol}' ∉ V(1, ${n}). The word does not belong to the language L(G).`,
    descriptionCz: isAccepted
      ? `Dokončen rozklad CYK: startovací symbol '${g.startSymbol}' ∈ V(1, ${n}). Slovo patří do jazyka L(G). Sestrojen platný derivační strom.`
      : `Dokončen rozklad CYK: startovací symbol '${g.startSymbol}' ∉ V(1, ${n}). Slovo nepatří do jazyka L(G).`,
    tableSnapshot: getSnap(),
    derivationTree: rootTree
  });

  return {
    accepted: isAccepted,
    totalSteps: steps.length,
    steps,
    table,
    trees
  };
}
