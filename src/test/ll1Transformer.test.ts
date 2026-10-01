/**
 * Automatic attempt to transform a grammar into LL(1): the result always
 * generates the same language, success means the result really is LL(1), and
 * every operation is listed with its reason.
 */
import { describe, it, expect } from 'vitest';
import { Grammar } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { transformToLL1 } from '../core/processor/ll1Transformer';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { rules, expectEquivalent } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const isLL1 = (g: Grammar) => buildLLTable(g, analyzeGrammar(g)).isLL1;

describe('Automatic transformation to LL(1)', () => {
  it('reproduces the lecture result for the expression grammar (KIV/FJP 9 a 10, p. 22)', () => {
    const g = parse("E -> T | T E'\nE' -> + T | + T E'\nT -> F | F T'\nT' -> * F | * F T'\nF -> ( E ) | a");
    const res = transformToLL1(g);
    expect(res.success).toBe(true);
    expect(rules(res.transformedGrammar)).toEqual([
      "E -> T E''", "E'' ->", "E'' -> + T E''", "T -> F T''", "T'' ->", "T'' -> * F T''", 'F -> ( E )', 'F -> a'
    ]);
    expectEquivalent(g, res.transformedGrammar, 6);
  });

  it('removes left recursion first and lists the reasons', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a');
    const res = transformToLL1(g);
    expect(res.success).toBe(true);
    expect(res.steps[0].titleCz).toContain('levé rekurze');
    expect(res.steps[0].descriptionCz).toMatch(/^Důvod: /);
    expect(res.steps[res.steps.length - 1].titleCz).toBe('Výsledek: gramatika je LL(1)');
  });

  it('exposes a FIRST-FIRST clash by substitution, then factors (KIV/FJP 9 a 10, p. 20)', () => {
    const g = parse('A -> a B | C D\nC -> a E | b F\nB -> b\nD -> d\nE -> x\nF -> f');
    const res = transformToLL1(g);
    expect(res.success).toBe(true);
    expect(res.steps.map(s => s.titleCz).join(' | ')).toMatch(/Dosazení C .*Levá faktorizace A/);
    expectEquivalent(g, res.transformedGrammar, 5);
  });

  it('uses absorption for a FIRST-FOLLOW conflict', () => {
    const g = parse('S -> a A a a | b A b a\nA -> b | ε');
    const res = transformToLL1(g);
    expect(res.success).toBe(true);
    expect(res.steps.some(s => s.titleCz?.includes('Pohlcení'))).toBe(true);
    expectEquivalent(g, res.transformedGrammar, 6);
  });

  it('fails on the ambiguous dangling else, keeps the best state and names the conflict', () => {
    const g = parse('S -> if c then S else S | if c then S | a');
    const res = transformToLL1(g);
    expect(res.success).toBe(false);
    expect(rules(res.transformedGrammar)).toContain("S' -> else S");
    expect(res.remaining.map(c => `${c.nonTerminal}:${c.lookahead}`)).toEqual(["S':else"]);
    expect(res.steps.some(s => s.titleCz?.startsWith('Zahozené operace'))).toBe(true);
    expectEquivalent(g, res.transformedGrammar, 7);
  });

  it('keeps every preset equivalent; success always means LL(1)', () => {
    for (const p of PRESET_GRAMMARS) {
      const g = parse(p.grammarText);
      const res = transformToLL1(g);
      expect(res.success, p.id).toBe(isLL1(res.transformedGrammar));
      expectEquivalent(g, res.transformedGrammar, 4);
    }
  });

  it('keeps random grammars equivalent; success always means LL(1)', () => {
    let successes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = parseGrammar(randomGrammarText(seed)).grammar!;
      const res = transformToLL1(g);
      expect(res.success).toBe(isLL1(res.transformedGrammar));
      if (res.success) successes++;
      expectEquivalent(g, res.transformedGrammar, 4);
    }
    expect(successes).toBeGreaterThan(20);
  });
});
