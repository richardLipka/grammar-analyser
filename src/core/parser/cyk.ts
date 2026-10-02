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
