/**
 * LR Parsing Table Construction (ACTION & GOTO) and Conflict Detection
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { LRAutomaton, LRVariant, LRState } from './lrAutomaton';
import { LR0Item, LR1Item } from './lrItem';

export type LRActionType = 'shift' | 'reduce' | 'accept';

export interface LRAction {
  type: LRActionType;
  targetState?: number;
  production?: Production;
}

export interface LRConflict {
  stateId: number;
  symbol: string;
  actions: LRAction[];
  type: 'Shift/Reduce' | 'Reduce/Reduce';
}

export interface LRTable {
  variant: LRVariant;
  states: number[];
  terminals: string[]; // ACTION columns
  nonTerminals: string[]; // GOTO columns
  actionTable: Map<number, Map<string, LRAction[]>>; // stateId -> terminal -> actions
  gotoTable: Map<number, Map<string, number>>; // stateId -> nonTerminal -> stateId
  conflicts: LRConflict[];
  isConflictFree: boolean;
}

export interface GrammarLRClassification {
  isLR0: boolean;
  isSLR1: boolean;
  isLALR1: boolean;
  isLR1: boolean;
}

export function buildLRTable(
  automaton: LRAutomaton,
  g: Grammar,
  analysis: GrammarAnalysis
): LRTable {
  const actionTable = new Map<number, Map<string, LRAction[]>>();
  const gotoTable = new Map<number, Map<string, number>>();
  const conflicts: LRConflict[] = [];

  const terminalCols = [...g.terminals, END_MARKER];
  const nonTerminalCols = [...g.nonTerminals];

  for (const s of automaton.states) {
    const actRow = new Map<string, LRAction[]>();
    for (const t of terminalCols) {
      actRow.set(t, []);
    }
    actionTable.set(s.id, actRow);

    const gotoRow = new Map<string, number>();
    gotoTable.set(s.id, gotoRow);
  }

  for (const s of automaton.states) {
    const actRow = actionTable.get(s.id)!;
    const gotoRow = gotoTable.get(s.id)!;

    // 1. Shift and GOTO actions from transitions
    for (const [sym, targetId] of s.transitions.entries()) {
      if (g.terminals.has(sym)) {
        const row = actRow.get(sym);
        if (row && !row.some(a => a.type === 'shift' && a.targetState === targetId)) {
          row.push({
            type: 'shift',
            targetState: targetId
          });
        }
      } else if (g.nonTerminals.has(sym)) {
        gotoRow.set(sym, targetId);
      }
    }

    // 2. Reduce and Accept actions
    if (automaton.variant === 'LR(0)') {
      for (const item of s.items0) {
        if (item.dotIndex === item.production.rhs.length) {
          if (item.production.id === 0) {
            // S' -> S •
            const row = actRow.get(END_MARKER);
            if (row && !row.some(a => a.type === 'accept')) {
              row.push({ type: 'accept' });
            }
          } else {
            // Reduce on ALL terminals and $
            for (const t of terminalCols) {
              const row = actRow.get(t);
              if (row && !row.some(a => a.type === 'reduce' && a.production?.id === item.production.id)) {
                row.push({
                  type: 'reduce',
                  production: item.production
                });
              }
            }
          }
        }
      }
    } else if (automaton.variant === 'SLR(1)') {
      for (const item of s.items0) {
        if (item.dotIndex === item.production.rhs.length) {
          if (item.production.id === 0) {
            const row = actRow.get(END_MARKER);
            if (row && !row.some(a => a.type === 'accept')) {
              row.push({ type: 'accept' });
            }
          } else {
            // Reduce ONLY on FOLLOW(A)
            const followA = analysis.follow1.get(item.production.lhs) || new Set();
            for (const t of followA) {
              const row = actRow.get(t);
              if (row && !row.some(a => a.type === 'reduce' && a.production?.id === item.production.id)) {
                row.push({
                  type: 'reduce',
                  production: item.production
                });
              }
            }
          }
        }
      }
    } else {
      // LR(1) and LALR(1)
      for (const item of s.items1 || []) {
        if (item.dotIndex === item.production.rhs.length) {
          if (item.production.id === 0 && item.lookahead === END_MARKER) {
            const row = actRow.get(END_MARKER);
            if (row && !row.some(a => a.type === 'accept')) {
              row.push({ type: 'accept' });
            }
          } else {
            // Reduce on item.lookahead
            const row = actRow.get(item.lookahead);
            if (row && !row.some(a => a.type === 'reduce' && a.production?.id === item.production.id)) {
              row.push({
                type: 'reduce',
                production: item.production
              });
            }
          }
        }
      }
    }

    // 3. Check for conflicts in this state
    for (const [t, actions] of actRow.entries()) {
      if (actions.length > 1) {
        const hasShift = actions.some(a => a.type === 'shift');
        const hasReduce = actions.some(a => a.type === 'reduce');

        conflicts.push({
          stateId: s.id,
          symbol: t,
          actions: [...actions],
          type: (hasShift && hasReduce) ? 'Shift/Reduce' : 'Reduce/Reduce'
        });
      }
    }
  }

  return {
    variant: automaton.variant,
    states: automaton.states.map(s => s.id),
    terminals: terminalCols,
    nonTerminals: nonTerminalCols,
    actionTable,
    gotoTable,
    conflicts,
    isConflictFree: conflicts.length === 0
  };
}

export function formatAction(action: LRAction): string {
  switch (action.type) {
    case 'shift':
      return `s${action.targetState}`;
    case 'reduce':
      return `r${action.production?.id ?? 0}`;
    case 'accept':
      return 'acc';
  }
}
