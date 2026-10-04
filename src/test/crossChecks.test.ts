/**
 * Cross-checks between independently implemented parts:
 * - CYK (CNF only, binary splits) against the general membership algorithm
 *   (whole right-hand sides): the same number of derivation trees;
 * - the ambiguity search against the number of trees of its witness;
 * - the analysis stopped at arbitrary points: what it returns equals the
 *   full analysis, and the missing parts are named;
 * - the language comparison against membership of its counterexample.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { cykTable, CykTable } from '../core/parser/cyk';
import { testMembership } from '../core/parser/membership';
import { findAmbiguity } from '../core/analyser/ambiguity';
import { analyzeAllSteps, computeAnalysis } from '../core/analysisJob';
import { compareLanguages } from '../core/analyser/equivalence';
import { convertToChomsky, removeEpsilonRules } from '../core/processor/grammarProcessor';
import { JobControl } from '../core/jobs/job';
import { wordsUpTo } from './earley';
import { prng, randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

/** Number of derivation trees from the CYK witnesses (CNF has no cycles, so it is finite). */
function cykTreeCount(g: Grammar, t: CykTable): number {
  if (t.n === 0) return g.productions.filter(p => p.lhs === g.startSymbol && p.rhs.length === 0).length;
  const memo = new Map<string, number>();
  const count = (A: string, i: number, j: number): number => {
    const key = `${A}|${i}|${j}`;
    if (memo.has(key)) return memo.get(key)!;
    let total = 0;
    for (const w of t.cells[i][j].get(A) || []) {
      total += w.k === undefined ? 1 : count(w.production.rhs[0], i, w.k) * count(w.production.rhs[1], w.k + 1, j);
    }
    memo.set(key, total);
    return total;
  };
  return count(g.startSymbol, 1, t.n);
}

describe('Cross-checks', () => {
  it('CYK and the general membership algorithm count the same trees on CNF grammars', () => {
    for (let s = 1; s <= 150; s++) {
      const cnf = convertToChomsky(parse(randomGrammarText(s))).transformedGrammar;
      for (const w of wordsUpTo([...cnf.terminals], 4)) {
        const cyk = cykTreeCount(cnf, cykTable(cnf, w));
        const general = testMembership(cnf, w, 1).treeCount;
        expect(general, `seed ${s} '${w.join(' ')}'`).toBe(cyk);
      }
    }
  });

  it('every ambiguity witness has at least two trees; "none found" means at most one tree per short word', () => {
    for (let s = 1; s <= 200; s++) {
      const g = parse(randomGrammarText(s));
      const r = findAmbiguity(g, { maxLength: 4, maxForms: 50000 });
      if (r.kind === 'ambiguous') {
        expect(testMembership(g, r.word, 1).treeCount, `seed ${s}`).toBeGreaterThanOrEqual(2);
      } else if (r.kind === 'none-found') {
        for (const w of wordsUpTo([...g.terminals], 4)) expect(testMembership(g, w, 1).treeCount, `seed ${s} '${w.join(' ')}'`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the analysis stopped at any point returns nothing, or parts equal to the full analysis', () => {
    const rand = prng(42);
    for (let s = 1; s <= 60; s++) {
      const g = parse(randomGrammarText(s));
      const full = computeAnalysis(g)!;
      for (let attempt = 0; attempt < 4; attempt++) {
        const stopAfter = Math.floor(rand() * 12);
        const control: JobControl = { stop: false };
        const job = analyzeAllSteps(g, control);
        let r = job.next();
        for (let k = 0; k < stopAfter && !r.done; k++) r = job.next();
        control.stop = true;
        while (!r.done) r = job.next();
        const part = r.value;
        if (!part) continue;
        expect(part.lr0Table.conflicts.length).toBe(full.lr0Table.conflicts.length);
        expect(part.lalr1Table.conflicts.length).toBe(full.lalr1Table.conflicts.length);
        expect(part.lalr1Automaton.states.length).toBe(full.lalr1Automaton.states.length);
        expect(part.llTable.isLL1).toBe(full.llTable.isLL1);
        if (part.stopped) {
          expect(part.stopped.length).toBeGreaterThan(0);
          if (part.stopped.includes('LR(1)')) expect(part.lr1Table).toBeUndefined();
          if (part.stopped.includes('LL(2)')) expect(part.llTable.ll2Complete).toBe(false);
        } else {
          expect(part.lr1Table!.conflicts.length).toBe(full.lr1Table!.conflicts.length);
        }
      }
    }
  });

  it('a counterexample of the language comparison is confirmed by the membership algorithm', () => {
    let differences = 0;
    for (let s = 1; s <= 150; s++) {
      const g1 = parse(randomGrammarText(s));
      const g2 = parse(randomGrammarText(s + 5000));
      const r = compareLanguages(g1, g2, 4);
      if (r.kind === 'different') {
        differences++;
        expect(testMembership(g1, r.word, 1).accepted).toBe(r.inFirst);
        expect(testMembership(g2, r.word, 1).accepted).toBe(r.inSecond);
      }
      // a grammar and its ε-free version never differ
      expect(compareLanguages(g1, removeEpsilonRules(g1).transformedGrammar, 4).kind).toBe('same-up-to');
    }
    expect(differences).toBeGreaterThan(50);
  });
});
