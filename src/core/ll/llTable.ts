/**
 * LL(1) and LL(2) Table Construction and Conflict Detection
 */

import { Grammar, Production, END_MARKER, EPSILON } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';

export interface LLConflict {
  nonTerminal: string;
  lookahead: string;
  productions: Production[];
  conflictType: 'First/First' | 'First/Follow';
}

export interface LLTable {
  isLL1: boolean;
  isLL2: boolean;
  terminals: string[]; // columns (including $)
  nonTerminals: string[]; // rows
  table1: Map<string, Map<string, Production[]>>; // nt -> terminal -> list of prods
  conflicts: LLConflict[];
  ll2Table?: Map<string, Map<string, Production[]>>; // nt -> 2-token string -> list of prods
  ll2Conflicts: { nonTerminal: string; lookahead: string; productions: Production[] }[];
}

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

  // Check for conflicts in LL(1) table
  for (const [nt, rowMap] of table1.entries()) {
    for (const [t, prods] of rowMap.entries()) {
      if (prods.length > 1) {
        // Determine conflict type
        const firstSets = prods.map(p => analysis.first1.get(p.lhs) || new Set());
        const hasEps = prods.some(p => {
          const pred = analysis.predict1.get(p.id);
          return pred && pred.has(t) && (analysis.first1.get(p.lhs)?.has(EPSILON) ?? false);
        });

        conflicts.push({
          nonTerminal: nt,
          lookahead: t,
          productions: prods,
          conflictType: hasEps ? 'First/Follow' : 'First/First'
        });
      }
    }
  }

  const isLL1 = conflicts.length === 0;

  // Build LL(2) Table and verify if LL(2)
  const ll2Table = new Map<string, Map<string, Production[]>>();
  const ll2Conflicts: { nonTerminal: string; lookahead: string; productions: Production[] }[] = [];

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
        ll2Conflicts.push({
          nonTerminal: nt,
          lookahead: la,
          productions: prods
        });
      }
    }
  }

  const isLL2 = isLL1 || ll2Conflicts.length === 0;

  return {
    isLL1,
    isLL2,
    terminals: columns,
    nonTerminals: rows,
    table1,
    conflicts,
    ll2Table,
    ll2Conflicts
  };
}
