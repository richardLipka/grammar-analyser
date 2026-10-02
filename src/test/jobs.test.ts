/**
 * Long computations as jobs: run to the end they give the same result as the
 * synchronous functions; stopped, they keep what is finished.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeAllSteps, computeAnalysis } from '../core/analysisJob';
import { transformToLL1, transformToLL1Steps } from '../core/processor/ll1Transformer';
import { analyzeGrammar, computeLeftRecursion, computeNullable } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { JobControl } from '../core/jobs/job';
import { Grammar } from '../core/ast/grammar';
import { convertToGreibach } from '../core/processor/grammarProcessor';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

describe('Analysis as a job', () => {
  it('gives the full analysis when run to the end', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a');
    const r = computeAnalysis(g)!;
    expect(r.stopped).toBeUndefined();
    expect(r.lr1Table!.isConflictFree).toBe(true);
    expect(r.lalr1Automaton.states.every(s => (s.mergedFrom || []).length > 0)).toBe(true);
    expect(r.provenUnambiguous).toBe('LR(1)');
    expect(r.llTable.ll2Complete).toBe(true);
  });

  it('keeps the finished parts when stopped during LR(1)', () => {
    // GNF of this grammar has some 1400 rules and an LR(1) automaton of thousands of states
    const g = convertToGreibach(parse('S -> S a B | B c | A\nA -> A b | S d | e1\nB -> B A | a | S S')).transformedGrammar;
    const control: JobControl = { stop: false };
    const job = analyzeAllSteps(g, control);
    let progress = '';
    for (;;) {
      const r = job.next();
      if (r.done) throw new Error('finished before LR(1)');
      if (r.value) progress = r.value.en;
      if (progress.startsWith('LR(1) automaton')) break;
    }
    control.stop = true;
    let result;
    for (;;) {
      const r = job.next();
      if (r.done) {
        result = r.value;
        break;
      }
    }
    expect(result).not.toBeNull();
    expect(result!.stopped).toEqual(['LR(1)', 'ambiguity']);
    expect(result!.lr1Table).toBeUndefined();
    expect(result!.lalr1Table.states.length).toBeGreaterThan(1000);
  });

  it('reports an ambiguous grammar with a witness, and none for an LL(1) grammar', () => {
    const amb = computeAnalysis(parse('E -> E + E | a'))!;
    expect(amb.ambiguity?.kind).toBe('ambiguous');
    const ll1 = computeAnalysis(parse('S -> a S | b'))!;
    expect(ll1.provenUnambiguous).toBe('LL(1)');
    expect(ll1.ambiguity).toBeUndefined();
  });
});

describe('Automatic LL(1) attempt as a job', () => {
  it('gives the same result as the synchronous attempt', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a');
    const job = transformToLL1Steps(g, { stop: false });
    let r;
    while (!(r = job.next()).done);
    expect(r.value.transformedGrammar.productions).toEqual(transformToLL1(g).transformedGrammar.productions);
  });

  it('stopped, it keeps the best state found so far', () => {
    const g = parse('S -> if c then S | if c then S else S | other');
    const control: JobControl = { stop: false };
    const job = transformToLL1Steps(g, control);
    job.next();
    job.next();
    control.stop = true;
    let r;
    while (!(r = job.next()).done);
    expect(r.value.success).toBe(false);
    expect(r.value.steps[r.value.steps.length - 1].description).toContain('Stopped by the user');
  });
});

describe('Kinds of left recursion', () => {
  it('distinguishes immediate, hidden and indirect left recursion, also together', () => {
    const g = parse('A -> A a | B A c | C b | d\nB -> ε | e1\nC -> A f | g');
    const lr = computeLeftRecursion(g, computeNullable(g));
    expect(lr.kinds.get('A')).toEqual(['immediate', 'hidden', 'indirect']);
    expect(lr.kinds.get('C')).toEqual(['indirect']);
    expect(lr.kinds.has('B')).toBe(false);
    const only = parse('S -> B S a | b\nB -> ε | c');
    expect(computeLeftRecursion(only, computeNullable(only)).kinds.get('S')).toEqual(['hidden']);
  });

  it('LL(1) table without LL(2) gives the same LL(1) verdict', () => {
    for (const text of ['S -> a S | b', 'S -> a S | a', 'E -> E + a | a']) {
      const g = parse(text);
      expect(buildLLTable(g, analyzeGrammar(g, { k2: false }), { ll2: false }).isLL1).toBe(buildLLTable(g, analyzeGrammar(g)).isLL1);
    }
  });
});
