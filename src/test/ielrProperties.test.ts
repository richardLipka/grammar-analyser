/**
 * IELR(1) against canonical LR(1) and LALR(1) on random grammars, with and
 * without precedence declarations. Conflicts are resolved as in Yacc/Bison:
 * by precedence where the tables do it, otherwise by the default (shift
 * before reduce, the earlier rule in a reduce/reduce conflict).
 * - every resolved IELR(1) cell equals the resolved cell of each LR(1) state
 *   merged into it, wherever that LR(1) state has an action (shifts go to
 *   the state holding the LR(1) target);
 * - an IELR(1) conflict on t has an LR(1) state merged into it with a
 *   conflict on t, so IELR(1) is conflict-free exactly when LR(1) is;
 * - the default-resolved IELR(1) and LR(1) tables accept the same words (and
 *   conflict-free ones exactly the language, checked by an Earley recognizer);
 * - IELR(1) has the states of LALR(1) when LALR(1) behaves like LR(1), and
 *   LALR(1) ≤ IELR(1) ≤ LR(1) states for grammars without useless symbols;
 * - the states are numbered in construction order (step-by-step view).
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
import { LRAutomaton, attachMergedLR1States, buildIELR1Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { LRAction, LRTable, buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { constructionSteps } from '../core/lr/lrConstruction';
import { prng, randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

/** Bison's default in a conflict the table left: shift, otherwise the earliest rule (accept = rule 0). */
const defaultChoice = (cell: LRAction[]): LRAction[] =>
  cell.length <= 1 ? cell : [cell.find(a => a.type === 'shift') ?? [...cell].sort((a, b) => (a.production?.id ?? 0) - (b.production?.id ?? 0))[0]];
const actionKey = (a: LRAction) => (a.type === 'reduce' ? `r${a.production!.id}` : a.type === 'shift' ? 's' : 'acc');
const resolvedKey = (cell: LRAction[]) => defaultChoice(cell).map(actionKey).join() || 'error';

/** The table with every conflict decided by the default (for the simulator, which would take the first action). */
function defaultResolved(t: LRTable): LRTable {
  const actionTable = new Map([...t.actionTable].map(([s, row]) => [s, new Map([...row].map(([a, cell]) => [a, defaultChoice(cell)]))]));
  return { ...t, actionTable, conflicts: [], isConflictFree: true };
}

function build(g: Grammar, usePrecedence: boolean) {
  const analysis = analyzeGrammar(g, { k2: false });
  const lalr = buildLALR1Automaton(g, analysis);
  const lr1 = buildLR1Automaton(g, analysis);
  attachMergedLR1States(lalr, lr1);
  const ielr = buildIELR1Automaton(g, analysis, lr1, { usePrecedence });
  const table = (a: LRAutomaton) => buildLRTable(a, g, analysis, { usePrecedence });
  const reduced = [...g.nonTerminals].every(n => analysis.endable.has(n) && analysis.reachable.has(n));
  return {
    lalr, lr1, ielr, reduced,
    lalrTable: table(lalr), lr1Table: table(lr1), ielrTable: table(ielr),
    lr1Raw: buildLRTable(lr1, g, analysis, { usePrecedence: false })
  };
}

/**
 * The cells of `merged` (LALR(1) or IELR(1)) whose resolved action differs
 * from that of one of its LR(1) states where the raw LR(1) cell is not empty.
 */
function differences(merged: LRAutomaton, mergedTable: LRTable, lr1Raw: LRTable, lr1Table: LRTable): string[] {
  const diffs: string[] = [];
  for (const st of merged.states) {
    for (const s of st.mergedFrom ?? []) {
      for (const t of lr1Raw.terminals) {
        if (lr1Raw.actionTable.get(s)!.get(t)!.length === 0) continue;
        const l = lr1Table.actionTable.get(s)!.get(t)!;
        const m = mergedTable.actionTable.get(st.id)!.get(t)!;
        if (resolvedKey(l) !== resolvedKey(m)) diffs.push(`state ${st.id} (LR(1) ${s}) on ${t}: LR(1) ${resolvedKey(l)}, merged ${resolvedKey(m)}`);
        const ls = defaultChoice(l).find(a => a.type === 'shift');
        const ms = defaultChoice(m).find(a => a.type === 'shift');
        if (ls && ms && !merged.states[ms.targetState!].mergedFrom!.includes(ls.targetState!)) {
          diffs.push(`state ${st.id} (LR(1) ${s}) shift on ${t} goes elsewhere`);
        }
      }
    }
  }
  return diffs;
}

/** Conflicts of `merged` on a symbol where none of its LR(1) states has a conflict. */
function newConflicts(merged: LRAutomaton, mergedTable: LRTable, lr1Table: LRTable): string[] {
  return mergedTable.conflicts
    .filter(c => !merged.states[c.stateId].mergedFrom!.some(s => lr1Table.conflicts.some(d => d.stateId === s && d.symbol === c.symbol)))
    .map(c => `state ${c.stateId} on ${c.symbol}`);
}

/** Random precedence lines over the terminals of a random grammar. */
function withPrecedence(base: string, rand: () => number): string {
  const assocs = ['%left', '%right', '%nonassoc'];
  const ts = ['a', 'b', 'c'].filter(t => base.includes(t)).sort(() => rand() - 0.5);
  const lines: string[] = [];
  for (let i = 0; i < ts.length; ) {
    const k = 1 + Math.floor(rand() * 2);
    lines.push(`${assocs[Math.floor(rand() * 3)]} ${ts.slice(i, i + k).join(' ')}`);
    i += k;
  }
  return lines.join('\n') + '\n' + base;
}

const parse = (text: string) => {
  const r = parseGrammar(text);
  return r.grammar && r.errors.length === 0 ? r.grammar : null;
};

/** All properties for one grammar (words up to maxLen); returns the automata and tables. */
function check(text: string, g: Grammar, usePrecedence: boolean, maxLen: number) {
  const built = build(g, usePrecedence);
  const { lalr, lr1, ielr, reduced, lalrTable, lr1Table, ielrTable, lr1Raw } = built;
  expect(differences(ielr, ielrTable, lr1Raw, lr1Table), text).toEqual([]);
  expect(newConflicts(ielr, ielrTable, lr1Table), text).toEqual([]);
  expect(ielrTable.isConflictFree, text).toBe(lr1Table.isConflictFree);
  if (reduced) {
    expect(lalr.states.length, text).toBeLessThanOrEqual(ielr.states.length);
    expect(ielr.states.length, text).toBeLessThanOrEqual(lr1.states.length);
    // LALR(1) acts like LR(1) (and adds no conflict LR(1) does not have): nothing to split
    if (differences(lalr, lalrTable, lr1Raw, lr1Table).length === 0 && newConflicts(lalr, lalrTable, lr1Table).length === 0) {
      expect(ielr.states.length, text).toBe(lalr.states.length);
      expect(ielr.states.some(s => s.isSplit), text).toBe(false);
    }
  }
  const steps = constructionSteps(ielr);
  expect(steps.filter(st => st.kind === 'goto' && st.isNew).length, text).toBe(ielr.states.length - 1);
  for (const s of ielr.states) if (s.isSplit) expect(s.splitReasons!.length, text).toBeGreaterThan(0);
  // the same words as canonical LR(1) after the default resolution
  const ielrDefault = defaultResolved(ielrTable);
  const lr1Default = defaultResolved(lr1Table);
  for (const w of wordsUpTo([...g.terminals], maxLen)) {
    const accepted = simulateLRParse(w, g, ielrDefault).accepted;
    expect(accepted, `${text}\n${w.join(' ')}`).toBe(simulateLRParse(w, g, lr1Default).accepted);
    if (!usePrecedence && ielrTable.isConflictFree) expect(accepted, `${text}\n${w.join(' ')} (Earley)`).toBe(accepts(g, w));
  }
  return built;
}

describe('IELR(1) properties on random grammars', () => {
  it('without precedence: resolved cells, conflicts, state counts, numbering and words of IELR(1)', async () => {
    let tested = 0;
    let split = 0;
    for (let seed = 1; seed <= 1200; seed++) {
      // Let the worker answer vitest's RPC between batches (CI timed out on long synchronous loops).
      if (seed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const text = randomGrammarText(seed);
      const g = parse(text);
      if (!g) continue;
      tested++;
      const { ielr, lalr } = check(text, g, false, g.terminals.size > 2 ? 3 : 4);
      if (ielr.states.length > lalr.states.length) split++;
    }
    expect(tested).toBeGreaterThan(1000);
    expect(split).toBeGreaterThan(10);
  });

  it('with precedence: resolved cells, conflicts and words of IELR(1) are those of canonical LR(1)', async () => {
    const rand = prng(77);
    let tested = 0;
    let lalrDiffers = 0;
    for (let seed = 1; seed <= 1200; seed++) {
      // Let the worker answer vitest's RPC between batches (CI timed out on long synchronous loops).
      if (seed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const text = withPrecedence(randomGrammarText(seed * 7 + 1), rand);
      const g = parse(text);
      if (!g || !g.precedence) continue;
      tested++;
      const { lalr, lalrTable, lr1Table, lr1Raw } = check(text, g, true, g.terminals.size > 2 ? 3 : 4);
      if (lalrTable.isConflictFree && differences(lalr, lalrTable, lr1Raw, lr1Table).length > 0) lalrDiffers++;
    }
    expect(tested).toBeGreaterThan(1000);
    // LALR(1) without conflicts that still acts differently from LR(1): the case IELR(1) is made for
    expect(lalrDiffers).toBeGreaterThan(0);
  });
});
