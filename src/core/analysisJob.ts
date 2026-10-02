/**
 * The whole analysis of a grammar as one job (see jobs/job.ts).
 *
 * The cheap parts come first: the sets, LL(1) and strong LL(2), LR(0)/SLR(1),
 * LALR(1) (from the LR(0) states). The parts that can grow very large come
 * last: the exact LL(2) test, the canonical LR(1) automaton and the search for
 * an ambiguous word. When the user stops the job during them, the result keeps
 * everything finished so far and says what is missing; stopped earlier, there
 * is no result.
 */

import { Grammar } from './ast/grammar';
import { GrammarAnalysis, analyzeGrammarSteps } from './analyser/grammarAnalyser';
import { AmbiguityResult, findAmbiguitySteps } from './analyser/ambiguity';
import { LLTable, buildLLTableSteps } from './ll/llTable';
import {
  LRAutomaton,
  attachMergedLR1States,
  buildLALR1AutomatonSteps,
  buildLR0AutomatonSteps,
  buildLR1AutomatonSteps
} from './lr/lrAutomaton';
import { LRTable, buildLRTable } from './lr/lrTable';
import { Job, JobControl, runJob, runToEnd } from './jobs/job';

export interface AnalysisDataResult {
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Automaton: LRAutomaton;
  slr1Automaton: LRAutomaton;
  lalr1Automaton: LRAutomaton;
  /** Missing when the computation was stopped before the LR(1) automaton was finished */
  lr1Automaton?: LRAutomaton;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table?: LRTable;
  /** The tables without the precedence declarations, only when the grammar declares precedence */
  rawTables?: { 'SLR(1)': LRTable; 'LALR(1)': LRTable; 'LR(1)'?: LRTable };
  /** Search for a word with two derivation trees (only when no LL(1)/LR(1) table proves the grammar unambiguous) */
  ambiguity?: AmbiguityResult;
  /** The grammar is unambiguous because its LL(1) or LR(1) table has no conflict */
  provenUnambiguous?: 'LL(1)' | 'LR(1)';
  /** Parts not computed because the user stopped the computation */
  stopped?: ('LL(2)' | 'LR(1)' | 'ambiguity')[];
}

/** Synchronous analysis (tests, small grammars). */
export function computeAnalysis(grammar: Grammar): AnalysisDataResult | null {
  return runJob(analyzeAllSteps(grammar, runToEnd()));
}

export function* analyzeAllSteps(grammar: Grammar, control: JobControl): Job<AnalysisDataResult | null> {
  const analysis = yield* analyzeGrammarSteps(grammar, control);
  if (!analysis || control.stop) return null;

  // LL(1) and strong LL(2) are cheap; the exact LL(2) test is done later
  const llQuick = yield* buildLLTableSteps(grammar, analysis, control, { exact: false });
  if (control.stop) return null;

  yield { en: 'LR(0) automaton', cz: 'automat LR(0)' };
  const lr0Automaton = yield* buildLR0AutomatonSteps(grammar, 'LR(0)', control);
  if (!lr0Automaton) return null;
  // SLR(1) uses the same canonical collection
  const slr1Automaton: LRAutomaton = { ...lr0Automaton, variant: 'SLR(1)' };
  const lalr1Automaton = yield* buildLALR1AutomatonSteps(grammar, analysis, control, lr0Automaton);
  if (!lalr1Automaton) return null;

  const result: AnalysisDataResult = {
    analysis,
    llTable: llQuick,
    lr0Automaton,
    slr1Automaton,
    lalr1Automaton,
    lr0Table: buildLRTable(lr0Automaton, grammar, analysis),
    slr1Table: buildLRTable(slr1Automaton, grammar, analysis),
    lalr1Table: buildLRTable(lalr1Automaton, grammar, analysis)
  };
  const hasPrecedence = !!grammar.precedence && grammar.precedence.levels.length > 0;
  if (hasPrecedence) {
    result.rawTables = {
      'SLR(1)': buildLRTable(slr1Automaton, grammar, analysis, { usePrecedence: false }),
      'LALR(1)': buildLRTable(lalr1Automaton, grammar, analysis, { usePrecedence: false })
    };
  }
  const stopped = (...parts: NonNullable<AnalysisDataResult['stopped']>) => ({ ...result, stopped: parts });

  // The exact LL(2) test (tables T(A, L)); stopped, it is incomplete (ll2Complete = false)
  result.llTable = yield* buildLLTableSteps(grammar, analysis, control);
  if (control.stop) return stopped('LL(2)', 'LR(1)', 'ambiguity');

  // Canonical LR(1)
  const lr1Automaton = yield* buildLR1AutomatonSteps(grammar, analysis, control);
  if (!lr1Automaton) return stopped('LR(1)', 'ambiguity');
  attachMergedLR1States(lalr1Automaton, lr1Automaton);
  result.lr1Automaton = lr1Automaton;
  result.lr1Table = buildLRTable(lr1Automaton, grammar, analysis);

  // Ambiguity: an LL(1) or LR(1) grammar is unambiguous; otherwise look for a witness
  const lr1Raw = hasPrecedence ? buildLRTable(lr1Automaton, grammar, analysis, { usePrecedence: false }) : result.lr1Table!;
  if (result.rawTables) result.rawTables['LR(1)'] = lr1Raw;
  if (result.llTable.isLL1) {
    result.provenUnambiguous = 'LL(1)';
  } else if (lr1Raw.isConflictFree) {
    result.provenUnambiguous = 'LR(1)';
  } else {
    yield { en: 'looking for an ambiguous word', cz: 'hledání nejednoznačného slova' };
    result.ambiguity = yield* findAmbiguitySteps(grammar, control);
    if (control.stop) return stopped('ambiguity');
  }
  return result;
}
