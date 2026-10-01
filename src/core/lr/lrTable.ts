/**
 * LR Parsing Tables and Conflict Detection, in two layouts:
 *
 * - Lecture layout (KIV/FJP, default): a table of actions f and a table of
 *   transitions g. f(M, u) is shift (P), reduce by rule i (R i) or accept (A),
 *   without a target state; for LR(0) f(M) depends on the state only. g(M, X)
 *   for every terminal and non-terminal X gives the state pushed after a shift
 *   of X or a reduction to X. States are named by their entry symbols (E₁, #).
 * - Dragon Book layout: ACTION[s, a] holds a shift with its target (s5), a
 *   reduction (r2) or accept (acc); GOTO[s, A] covers the non-terminals only.
 *
 * LR(0) is strict in both layouts: S' → S• is a complete item like any other,
 * so a state holding it together with a shift or another complete item is a
 * conflict (an LR(0) language must be prefix-free).
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { LRAutomaton, LRVariant, LRStateName } from './lrAutomaton';

export type LRActionType = 'shift' | 'reduce' | 'accept';

export type LRLayout = 'lecture' | 'dragon';

/** The single column of an LR(0) table of actions f in the lecture layout. */
export const LR0_ACTION_COLUMN = '';

export interface LRAction {
  type: LRActionType;
  targetState?: number;
  production?: Production;
}

export interface LRConflict {
  stateId: number;
  /** Input symbol of the cell; LR0_ACTION_COLUMN for a whole LR(0) state in the lecture layout. */
  symbol: string;
  actions: LRAction[];
  type: 'Shift/Reduce' | 'Reduce/Reduce';
}

export interface LRTable {
  variant: LRVariant;
  states: number[];
  /** Lecture names of the states, indexed by state id */
  stateNames: LRStateName[];

  // Dragon Book layout
  terminals: string[]; // ACTION columns (terminals and $)
  nonTerminals: string[]; // GOTO columns
  actionTable: Map<number, Map<string, LRAction[]>>; // stateId -> terminal -> actions
  gotoTable: Map<number, Map<string, number>>; // stateId -> nonTerminal -> stateId
  conflicts: LRConflict[];

  // Lecture layout
  /** Columns of f: [LR0_ACTION_COLUMN] for LR(0), otherwise the terminals and $ */
  fColumns: string[];
  fTable: Map<number, Map<string, LRAction[]>>;
  /** Columns of g: the terminals, then the non-terminals */
  gColumns: string[];
  gTable: Map<number, Map<string, number>>;
  fConflicts: LRConflict[];

  isConflictFree: boolean;
}

export interface GrammarLRClassification {
  isLR0: boolean;
  isSLR1: boolean;
  isLALR1: boolean;
  isLR1: boolean;
}

const conflictOf = (stateId: number, symbol: string, actions: LRAction[]): LRConflict => ({
  stateId,
  symbol,
  actions: [...actions],
  type: actions.some(a => a.type === 'shift') && actions.some(a => a.type !== 'shift') ? 'Shift/Reduce' : 'Reduce/Reduce'
});

const addAction = (row: LRAction[] | undefined, action: LRAction) => {
  if (!row) return;
  const same = row.some(a => a.type === action.type &&
    (action.type === 'shift' ? a.targetState === action.targetState : a.production?.id === action.production?.id));
  if (!same) row.push(action);
};

export function buildLRTable(
  automaton: LRAutomaton,
  g: Grammar,
  analysis: GrammarAnalysis
): LRTable {
  const actionTable = new Map<number, Map<string, LRAction[]>>();
  const gotoTable = new Map<number, Map<string, number>>();
  const gTable = new Map<number, Map<string, number>>();
  const conflicts: LRConflict[] = [];

  const terminalCols = [...g.terminals, END_MARKER];
  const nonTerminalCols = [...g.nonTerminals];

  for (const s of automaton.states) {
    const actRow = new Map<string, LRAction[]>();
    for (const t of terminalCols) actRow.set(t, []);
    actionTable.set(s.id, actRow);
    gotoTable.set(s.id, new Map());
    gTable.set(s.id, new Map(s.transitions));
  }

  for (const s of automaton.states) {
    const actRow = actionTable.get(s.id)!;
    const gotoRow = gotoTable.get(s.id)!;

    // 1. Shift and GOTO actions from transitions
    for (const [sym, targetId] of s.transitions.entries()) {
      if (g.terminals.has(sym)) {
        addAction(actRow.get(sym), { type: 'shift', targetState: targetId });
      } else if (g.nonTerminals.has(sym)) {
        gotoRow.set(sym, targetId);
      }
    }

    // 2. Reduce and Accept actions
    if (automaton.variant === 'LR(0)' || automaton.variant === 'SLR(1)') {
      for (const item of s.items0) {
        if (item.dotIndex !== item.production.rhs.length) continue;
        if (automaton.variant === 'LR(0)') {
          // No lookahead: the reduction (or acceptance, the reduction by rule 0) fills every column
          for (const t of terminalCols) {
            addAction(actRow.get(t), item.production.id === 0 ? { type: 'accept' } : { type: 'reduce', production: item.production });
          }
        } else if (item.production.id === 0) {
          addAction(actRow.get(END_MARKER), { type: 'accept' });
        } else {
          // Reduce ONLY on FOLLOW(A)
          for (const t of analysis.follow1.get(item.production.lhs) || new Set<string>()) {
            addAction(actRow.get(t), { type: 'reduce', production: item.production });
          }
        }
      }
    } else {
      // LR(1) and LALR(1)
      for (const item of s.items1 || []) {
        if (item.dotIndex !== item.production.rhs.length) continue;
        if (item.production.id === 0 && item.lookahead === END_MARKER) {
          addAction(actRow.get(END_MARKER), { type: 'accept' });
        } else {
          addAction(actRow.get(item.lookahead), { type: 'reduce', production: item.production });
        }
      }
    }

    // 3. Conflicts in this state
    for (const [t, actions] of actRow.entries()) {
      if (actions.length > 1) conflicts.push(conflictOf(s.id, t, actions));
    }
  }

  // Lecture layout: f equals ACTION without the shift targets, except for LR(0),
  // where f(M) has one column: shift if M has an item with a terminal after the
  // dot (or nothing else to do), reduce/accept for every complete item.
  let fColumns = terminalCols;
  let fTable = actionTable;
  let fConflicts = conflicts;
  if (automaton.variant === 'LR(0)') {
    fColumns = [LR0_ACTION_COLUMN];
    fTable = new Map();
    fConflicts = [];
    for (const s of automaton.states) {
      const actions: LRAction[] = [];
      if (s.items0.some(it => it.dotIndex < it.production.rhs.length && g.terminals.has(it.production.rhs[it.dotIndex]))) {
        actions.push({ type: 'shift' });
      }
      for (const it of s.items0) {
        if (it.dotIndex === it.production.rhs.length) {
          addAction(actions, it.production.id === 0 ? { type: 'accept' } : { type: 'reduce', production: it.production });
        }
      }
      if (actions.length === 0) actions.push({ type: 'shift' });
      fTable.set(s.id, new Map([[LR0_ACTION_COLUMN, actions]]));
      if (actions.length > 1) fConflicts.push(conflictOf(s.id, LR0_ACTION_COLUMN, actions));
    }
  }

  return {
    variant: automaton.variant,
    states: automaton.states.map(s => s.id),
    stateNames: automaton.stateNames,
    terminals: terminalCols,
    nonTerminals: nonTerminalCols,
    actionTable,
    gotoTable,
    conflicts,
    fColumns,
    fTable,
    gColumns: [...g.terminals, ...nonTerminalCols],
    gTable,
    fConflicts,
    isConflictFree: conflicts.length === 0
  };
}

/** Dragon Book cell text: s5, r2, acc */
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

/** Lecture cell text: P / R2 / A in Czech, s / r2 / acc in English (no target state) */
export function formatLectureAction(action: LRAction, lang: 'en' | 'cz'): string {
  switch (action.type) {
    case 'shift':
      return lang === 'cz' ? 'P' : 's';
    case 'reduce':
      return `${lang === 'cz' ? 'R' : 'r'}${action.production?.id ?? 0}`;
    case 'accept':
      return lang === 'cz' ? 'A' : 'acc';
  }
}

/** A state as shown in the given layout: its lecture name or its number. */
export function stateLabel(table: Pick<LRTable, 'stateNames'>, stateId: number, layout: LRLayout): string {
  return layout === 'lecture' ? table.stateNames[stateId]?.text ?? String(stateId) : String(stateId);
}

/** The table cell of an action, written in the given layout. */
export function formatLayoutAction(action: LRAction, layout: LRLayout, lang: 'en' | 'cz'): string {
  return layout === 'lecture' ? formatLectureAction(action, lang) : formatAction(action);
}
