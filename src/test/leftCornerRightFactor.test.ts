/**
 * Left-corner transformation (Rosenkrantz & Lewis 1970) and right factoring.
 * Results are checked for language equivalence with the Earley recognizer and
 * for the absence of left recursion.
 */
import { describe, it, expect } from 'vitest';
import { Grammar, formatGrammarForEditor } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar, computeLeftRecursion, computeNullable } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import {
  leftCornerTransform,
  removeLeftRecursion,
  rightFactorGrammar,
  rightFactorSymbol,
  applySymbolTransformation,
  getAvailableTransformationsForSymbol
} from '../core/processor/grammarProcessor';
import { rules, expectEquivalent } from './earley';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const leftRecursive = (g: Grammar) => {
  const lr = computeLeftRecursion(g, computeNullable(g));
  return [...lr.immediate, ...lr.indirect];
};

describe('Left-corner transformation', () => {
  it('transforms the expression grammar into the expected LL(1) grammar', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a');
    const res = leftCornerTransform(g).transformedGrammar;
    expect(rules(res)).toEqual([
      'E -> F [E-T]',
      '[E-E] -> + T [E-E]',
      '[E-E] ->',
      '[E-T] -> [E-E]',
      '[E-T] -> * F [E-T]',
      'T -> F [T-T]',
      '[T-T] -> * F [T-T]',
      '[T-T] ->',
      'F -> ( E )',
      'F -> a'
    ]);
    expect(leftRecursive(res)).toEqual([]);
    expectEquivalent(g, res, 6);
    expect(buildLLTable(res, analyzeGrammar(res)).isLL1).toBe(true);
  });

  it('removes indirect left recursion without an order of the non-terminals', () => {
    const g = parse('S -> A a | b\nA -> S c | A d | e');
    expect(leftRecursive(g).sort()).toEqual(['A', 'S']);
    const res = leftCornerTransform(g).transformedGrammar;
    expect(leftRecursive(res)).toEqual([]);
    expectEquivalent(g, res, 6);
  });

  it('keeps non-terminals outside the left-recursive cycles unchanged', () => {
    const g = parse('S -> x L y | z\nL -> L , a | a\nM -> m');
    const res = leftCornerTransform(g).transformedGrammar;
    expect(rules(res)).toContain('S -> x L y');
    expect(rules(res)).toContain('M -> m');
    expectEquivalent(g, res, 6);
  });

  it('prepares grammars with ε-rules and cycles like Paull\'s algorithm', () => {
    for (const text of ['S -> S a | B\nB -> b | ε', 'S -> A | S a | b\nA -> S']) {
      const g = parse(text);
      const res = leftCornerTransform(g);
      expect(res.steps.some(s => s.title.startsWith('Preprocessing'))).toBe(true);
      expect(leftRecursive(res.transformedGrammar)).toEqual([]);
      expectEquivalent(g, res.transformedGrammar, 6);
    }
  });

  it('agrees with Paull\'s algorithm on the language of mutually recursive grammars', () => {
    const g = parse('A -> B x | y\nB -> C z | A w\nC -> A v | B u | t');
    const lc = leftCornerTransform(g).transformedGrammar;
    const paull = removeLeftRecursion(g).transformedGrammar;
    expect(leftRecursive(lc)).toEqual([]);
    expectEquivalent(lc, paull, 6);
    expectEquivalent(g, lc, 6);
  });

  it('writes names that read back in the editor, also for terminals such as > and #', () => {
    const g = parse('A -> A b | ">" c | "#" d');
    const res = leftCornerTransform(g).transformedGrammar;
    const again = parse(formatGrammarForEditor(res));
    expect(rules(again)).toEqual(rules(res));
    expectEquivalent(g, again, 5);
  });

  it('is offered for every left-recursive non-terminal', () => {
    const g = parse('S -> A a | b\nA -> S c | d');
    expect(getAvailableTransformationsForSymbol(g, 'S').map(t => t.id)).toContain('leftCorner');
    expect(getAvailableTransformationsForSymbol(g, 'A').map(t => t.id)).toContain('leftCorner');
  });
});

describe('Right factoring', () => {
  it('extracts a common suffix', () => {
    const g = parse('S -> a C | b C | d\nC -> c');
    const res = rightFactorSymbol(g, 'S').transformedGrammar;
    expect(rules(res)).toEqual(["S -> S' C", 'S -> d', "S' -> a", "S' -> b", 'C -> c']);
    expectEquivalent(g, res, 5);
  });

  it('creates an ε-alternative when a whole alternative is the suffix', () => {
    const g = parse('S -> x y | y');
    const res = applySymbolTransformation(g, 'S', 'rightFactor:y').transformedGrammar;
    expect(rules(res)).toEqual(["S -> S' y", "S' -> x", "S' ->"]);
    expectEquivalent(g, res, 5);
  });

  it('factors the whole grammar until no common suffix is left', () => {
    const g = parse('S -> i E t S | i E t S e S | a\nE -> b');
    const res = rightFactorGrammar(g).transformedGrammar;
    for (const nt of res.nonTerminals) {
      const alts = res.productions.filter(p => p.lhs === nt).map(p => p.rhs);
      for (let i = 0; i < alts.length; i++) {
        for (let j = i + 1; j < alts.length; j++) {
          const a = alts[i];
          const b = alts[j];
          expect(a.length > 0 && b.length > 0 && a[a.length - 1] === b[b.length - 1]).toBe(false);
        }
      }
    }
    expectEquivalent(g, res, 7);
  });
});
