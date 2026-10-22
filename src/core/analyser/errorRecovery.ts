/**
 * Syntax error recovery in panic mode for the LL and LR simulators.
 *
 * Panic mode (Aho, Lam, Sethi, Ullman: Compilers, 2nd ed., §4.1.4, §4.4.5, §4.8.3; Wirth:
 * Compilerbau / the PL/0 compiler, the "follow symbols" of each procedure — lecture 3 of
 * KIV/FJP): after an error the parser throws input symbols away until one of a set of
 * synchronising symbols ("stop symbols") appears, and then continues in a configuration
 * that can go on with that symbol. The sets come from the analysis of the grammar:
 *
 * - LL: for the non-terminal A on top of the stack, FIRST(A) — A can still start here, so
 *   its analysis is resumed — and FOLLOW(A) ∪ {$} — A is given up (popped) and the parser
 *   goes on with what follows A. A terminal on top that does not match is popped, as if
 *   it had been inserted.
 * - LR: a state s on the stack with a transition g(s, A); the error part is taken for A:
 *   the states above s are popped, input is thrown away until a symbol a ∈ FOLLOW(A) with
 *   an action in the state g(s, A), and g(s, A) is pushed.
 *
 * Panic mode never loops: every recovery step throws away an input symbol or pops the
 * stack. It can report follow-up errors, so an error that comes before any input symbol
 * has been read correctly after a recovery is not counted again (as Yacc and Wirth do).
 */

import { Grammar, EPSILON, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from './grammarAnalyser';

/** The stop symbols of every non-terminal, from FIRST₁ and FOLLOW₁. */
export interface RecoverySets {
  first: Map<string, Set<string>>;
  follow: Map<string, Set<string>>;
}

export function recoverySets(g: Grammar, analysis: GrammarAnalysis): RecoverySets {
  const first = new Map<string, Set<string>>();
  const follow = new Map<string, Set<string>>();
  for (const a of g.nonTerminals) {
    first.set(a, new Set([...(analysis.first1.get(a) ?? [])].filter(x => x !== EPSILON && x !== '')));
    follow.set(a, new Set([...(analysis.follow1.get(a) ?? []), END_MARKER]));
  }
  return { first, follow };
}

/** What a recovery step does. */
export type RecoveryKind =
  /** the error is found and panic mode starts */
  | 'start'
  /** an input symbol is thrown away */
  | 'skip'
  /** LL: the non-terminal on top is given up; LR: states are popped */
  | 'pop'
  /** LL: a missing terminal is taken as inserted */
  | 'insert'
  /** the parser can go on: panic mode ends */
  | 'recovered'
  /** the input has been read to the end with errors */
  | 'end'
  /** no recovery is possible (or too many errors) */
  | 'giveUp';

export interface RecoveryInfo {
  kind: RecoveryKind;
  /** Number of the error the step belongs to (1, 2, …). */
  errorNumber: number;
  /** LL: the non-terminal being recovered; LR: the non-terminal the error part is taken for. */
  nonTerminal?: string;
  /** The symbols that end panic mode (sorted). */
  syncSet?: string[];
  /** LL: the symbols with which the non-terminal is resumed (FIRST). */
  resumeSet?: string[];
  /** The symbol thrown away, or the missing terminal. */
  token?: string;
  /** LR: the states popped from the stack. */
  poppedStates?: number[];
}

export interface RecoveredError {
  number: number;
  /** Index of the input symbol at which the error was found (0-based; = length for $). */
  position: number;
  token: string;
  messageEn: string;
  messageCz: string;
  /** Input symbols thrown away and stack entries given up for this error. */
  skipped: number;
  popped: number;
}

export interface RecoveryOptions {
  /** Stop symbols; without them there is no recovery (the parser stops at the first error). */
  sets: RecoverySets;
  /** Give up after this many errors (default 20). */
  maxErrors?: number;
}

/** A set of symbols as text, for the step descriptions. */
export const setText = (xs: Iterable<string>): string => `{${[...xs].sort(compareSymbols).join(', ')}}`;

/** $ last, otherwise alphabetical. */
export function compareSymbols(a: string, b: string): number {
  if (a === b) return 0;
  if (a === END_MARKER) return 1;
  if (b === END_MARKER) return -1;
  return a.localeCompare(b);
}

export const sortedSymbols = (xs: Iterable<string>): string[] => [...xs].sort(compareSymbols);

/** Summary of a run with errors, for the result box. */
export function errorsSummary(errors: RecoveredError[], cz: boolean): string {
  const n = errors.length;
  if (cz) return `${n} ${n === 1 ? 'chyba' : n < 5 ? 'chyby' : 'chyb'} — slovo nepatří do L(G); analýza po zotavení dokončena`;
  return `${n} error${n === 1 ? '' : 's'} — the word is not in L(G); the analysis went on after recovery`;
}
