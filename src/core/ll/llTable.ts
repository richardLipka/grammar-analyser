/**
 * LL(1) and LL(2) Table Construction and Conflict Detection
 *
 * - LL(1): M[A, a] built from the director sets FIRST₁(α · FOLLOW₁(A)).
 * - Strong LL(2): the same construction with FIRST₂/FOLLOW₂ (one row per non-terminal).
 * - LL(2): the exact Aho–Ullman test with local follow sets. For k ≥ 2 the
 *   classes differ: every strong LL(k) grammar is LL(k), but not vice versa.
 */

import { Grammar, Production, END_MARKER, EPSILON } from '../ast/grammar';
import { GrammarAnalysis, first1OfString, firstKOfString } from '../analyser/grammarAnalyser';

export interface LLConflictReason {
  production: Production;
  /** lookahead ∈ FIRST₁(α) */
  viaFirst: boolean;
  /** α ⇒* ε and lookahead ∈ FOLLOW₁(A) */
  viaFollow: boolean;
}

export interface LLConflict {
  nonTerminal: string;
  lookahead: string;
  productions: Production[];
  conflictType: 'First/First' | 'First/Follow';
  reasons: LLConflictReason[];
}

export interface LL2Conflict {
  nonTerminal: string;
  lookahead: string;
  productions: Production[];
  /** Local follow set (right context) in which the alternatives collide; absent for strong LL(2). */
  context?: string[];
}

export interface LLTable {
  isLL1: boolean;
  /** Exact LL(2) property (Aho–Ullman test with local follow sets). */
  isLL2: boolean;
  /** Strong LL(2): the table indexed only by non-terminal and 2-token lookahead is conflict-free. */
  isStrongLL2: boolean;
  /** False when the LL(2) test stopped at its safety bound; isLL2 is then a lower bound. */
  ll2Complete: boolean;
  terminals: string[]; // columns (including $)
  nonTerminals: string[]; // rows
  table1: Map<string, Map<string, Production[]>>; // nt -> terminal -> list of prods
  conflicts: LLConflict[];
  ll2Table?: Map<string, Map<string, Production[]>>; // nt -> 2-token string -> list of prods (strong LL(2))
  strongLL2Conflicts: LL2Conflict[];
  ll2Conflicts: LL2Conflict[];
}

const MAX_LL2_CONTEXTS = 5000;

export function buildLLTable(g: Grammar, analysis: GrammarAnalysis): LLTable {
  const table1 = new Map<string, Map<string, Production[]>>();
  const conflicts: LLConflict[] = [];

  const columns = [...g.terminals, END_MARKER];
  const rows = [...g.nonTerminals];

  for (const nt of rows) {
    const rowMap = new Map<string, Production[]>();
    for (const t of columns) {
      rowMap.set(t, []);
    }
    table1.set(nt, rowMap);
  }

  // Populate LL(1) table
  for (const p of g.productions) {
    const lookaheads = analysis.predict1.get(p.id) || new Set();

    for (const la of lookaheads) {
      if (la === EPSILON) continue;
      const cell = table1.get(p.lhs)?.get(la);
      if (cell) {
        cell.push(p);
      }
    }
  }

  // Check for conflicts in LL(1) table and explain where each entry comes from
  for (const [nt, rowMap] of table1.entries()) {
    const followA = analysis.follow1.get(nt) || new Set<string>();
    for (const [t, prods] of rowMap.entries()) {
      if (prods.length > 1) {
        const reasons: LLConflictReason[] = prods.map(p => {
          const firstAlpha = first1OfString(p.rhs, analysis.first1, analysis.nullable);
          return {
            production: p,
            viaFirst: firstAlpha.has(t),
            viaFollow: firstAlpha.has(EPSILON) && followA.has(t)
          };
        });
        const viaFirstCount = reasons.filter(r => r.viaFirst).length;
        const nullableCount = prods.filter(p => first1OfString(p.rhs, analysis.first1, analysis.nullable).has(EPSILON)).length;

        conflicts.push({
          nonTerminal: nt,
          lookahead: t,
          productions: prods,
          conflictType: viaFirstCount >= 2 || nullableCount >= 2 ? 'First/First' : 'First/Follow',
          reasons
        });
      }
    }
  }

  const isLL1 = conflicts.length === 0;

  // Strong LL(2) table: one row per non-terminal, columns are 2-token lookaheads
  const ll2Table = new Map<string, Map<string, Production[]>>();
  const strongLL2Conflicts: LL2Conflict[] = [];

  for (const nt of rows) {
    ll2Table.set(nt, new Map<string, Production[]>());
  }

  for (const p of g.productions) {
    const lookaheads2 = analysis.predict2.get(p.id) || new Set();
    const rowMap = ll2Table.get(p.lhs)!;

    for (const la of lookaheads2) {
      if (!rowMap.has(la)) {
        rowMap.set(la, []);
      }
      rowMap.get(la)!.push(p);
    }
  }

  for (const [nt, rowMap] of ll2Table.entries()) {
    for (const [la, prods] of rowMap.entries()) {
      if (prods.length > 1) {
        strongLL2Conflicts.push({ nonTerminal: nt, lookahead: la, productions: prods });
      }
    }
  }

  const exact = checkLLk(g, analysis.first2, 2);

  return {
    isLL1,
    isLL2: isLL1 || exact.conflicts.length === 0,
    isStrongLL2: isLL1 || strongLL2Conflicts.length === 0,
    ll2Complete: exact.complete,
    terminals: columns,
    nonTerminals: rows,
    table1,
    conflicts,
    ll2Table,
    strongLL2Conflicts,
    ll2Conflicts: exact.conflicts
  };
}

/** k-bounded concatenation of two sets of terminal strings (space separated, '' = ε). */
export function concatK(left: Set<string>, right: Set<string>, k: number): Set<string> {
  const result = new Set<string>();
  for (const x of left) {
    const xs = x.split(' ').filter(Boolean);
    if (xs.length >= k) {
      result.add(xs.slice(0, k).join(' '));
      continue;
    }
    for (const y of right) {
      result.add([...xs, ...y.split(' ').filter(Boolean)].slice(0, k).join(' '));
    }
  }
  return result;
}

/**
 * Aho–Ullman LL(k) test. For every reachable pair (A, L), where L is a local
 * follow set FIRST_k(α) of a left-sentential form w A α, the sets
 * FIRST_k(β) ⊕_k L of the alternatives A → β must be pairwise disjoint.
 */
export function checkLLk(
  g: Grammar,
  firstK: Map<string, Set<string>>,
  k: number
): { conflicts: LL2Conflict[]; complete: boolean } {
  const conflicts: LL2Conflict[] = [];
  const reported = new Set<string>();
  const visited = new Set<string>();
  const queue: { nt: string; follow: Set<string> }[] = [{ nt: g.startSymbol, follow: new Set([END_MARKER]) }];
  visited.add(`${g.startSymbol}|${END_MARKER}`);
  let head = 0;

  while (head < queue.length) {
    if (head >= MAX_LL2_CONTEXTS) {
      return { conflicts, complete: false };
    }
    const { nt, follow } = queue[head++];
    const prods = g.productions.filter(p => p.lhs === nt);

    // Disjointness of the lookahead sets of the alternatives in this context
    const owner = new Map<string, Production[]>();
    for (const p of prods) {
      for (const la of concatK(firstKOfString(p.rhs, firstK, k), follow, k)) {
        if (!owner.has(la)) owner.set(la, []);
        owner.get(la)!.push(p);
      }
    }
    for (const [la, ps] of owner.entries()) {
      if (ps.length > 1) {
        const key = `${nt}|${la}|${ps.map(p => p.id).join(',')}`;
        if (!reported.has(key)) {
          reported.add(key);
          conflicts.push({ nonTerminal: nt, lookahead: la, productions: ps, context: [...follow].sort() });
        }
      }
    }

    // Local follow sets of the non-terminals on the right-hand sides
    for (const p of prods) {
      for (let i = 0; i < p.rhs.length; i++) {
        const B = p.rhs[i];
        if (!g.nonTerminals.has(B)) continue;
        const localFollow = concatK(firstKOfString(p.rhs.slice(i + 1), firstK, k), follow, k);
        const key = `${B}|${[...localFollow].sort().join(',')}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ nt: B, follow: localFollow });
        }
      }
    }
  }

  return { conflicts, complete: true };
}
