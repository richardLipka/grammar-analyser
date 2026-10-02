/**
 * "Is my grammar the same?": language comparison on all short words and the
 * checks of the promised form.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { checkForm, compareLanguages, compareLanguagesSteps } from '../core/analyser/equivalence';
import { convertToChomsky, convertToGreibach, leftFactorGrammar, removeEpsilonRules, removeLeftRecursion, removeUnitRules } from '../core/processor/grammarProcessor';
import { transformToLL1 } from '../core/processor/ll1Transformer';
import { JobControl } from '../core/jobs/job';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

describe('Comparison of languages', () => {
  it('finds no difference between a grammar and its transformations', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a');
    for (const t of [removeLeftRecursion(g), convertToChomsky(g), convertToGreibach(g), transformToLL1(g)]) {
      expect(compareLanguages(g, t.transformedGrammar, 6)).toEqual({ kind: 'same-up-to', length: 6, wordsChecked: expect.any(Number), stopped: false });
    }
  });

  it('gives a shortest counterexample and says which grammar generates it', () => {
    const r = compareLanguages(parse('S -> a S | ε'), parse('S -> a S | a'));
    expect(r).toMatchObject({ kind: 'different', word: [], inFirst: true, inSecond: false, checkedLength: -1 });
    const r2 = compareLanguages(parse('S -> a S b | a b'), parse('S -> a S b | a b | a a b b b'));
    expect(r2).toMatchObject({ kind: 'different', word: ['a', 'a', 'b', 'b', 'b'], inFirst: false, inSecond: true, checkedLength: 4 });
    // a different alphabet
    const r3 = compareLanguages(parse('S -> a'), parse('S -> b'));
    expect(r3).toMatchObject({ kind: 'different', word: ['a'] });
  });

  it('agrees with checking all words by the Earley recognizer on pairs of random grammars', () => {
    for (let s = 1; s <= 120; s++) {
      const g1 = parse(randomGrammarText(s));
      const g2 = parse(randomGrammarText(s + 1000));
      const r = compareLanguages(g1, g2, 4);
      const alphabet = [...new Set([...g1.terminals, ...g2.terminals])];
      const diff = wordsUpTo(alphabet, 4).find(w => accepts(g1, w) !== accepts(g2, w));
      if (!diff) {
        expect(r.kind, `seed ${s}`).toBe('same-up-to');
      } else {
        expect(r.kind, `seed ${s}`).toBe('different');
        if (r.kind === 'different') {
          expect(r.word.length, `seed ${s}`).toBe(diff.length);
          expect(accepts(g1, r.word)).toBe(r.inFirst);
          expect(accepts(g2, r.word)).toBe(r.inSecond);
          expect(r.inFirst).not.toBe(r.inSecond);
        }
      }
      // a grammar and its ε-free version agree
      expect(compareLanguages(g1, removeEpsilonRules(g1).transformedGrammar, 4).kind, `seed ${s}`).toBe('same-up-to');
    }
  });

  it('stops when asked and reports how far it got', () => {
    const g = parse('S -> a S | b S | ε');
    const control: JobControl = { stop: false };
    const job = compareLanguagesSteps(g, g, control, 30);
    for (let i = 0; i < 50; i++) job.next();
    control.stop = true;
    let r;
    while (!(r = job.next()).done);
    expect(r.value.kind).toBe('same-up-to');
    if (r.value.kind === 'same-up-to') {
      expect(r.value.stopped).toBe(true);
      expect(r.value.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Checks of the promised form', () => {
  const ok = (g: Grammar, p: Parameters<typeof checkForm>[1][number]) => checkForm(g, [p])[0];

  it('checks each property and lists the violating rules', () => {
    const g = parse('S -> S a | A | ε\nA -> a A b | B\nB -> b\nC -> c');
    expect(ok(g, 'reduced')).toEqual({ property: 'reduced', ok: false, offending: ['C'] });
    expect(ok(g, 'epsFree').offending).toEqual(['S → ε']); // S is on a right-hand side
    expect(ok(g, 'noUnit').offending).toEqual(['S → A', 'A → B']);
    expect(ok(g, 'noLeftRecursion').offending).toEqual(['S']);
    expect(ok(g, 'll1').ok).toBe(false);
    expect(ok(g, 'cnf').ok).toBe(false);
    expect(ok(g, 'gnf').ok).toBe(false);
    expect(ok(parse('S -> a B | a C\nB -> b\nC -> c'), 'leftFactored').offending).toEqual(['S → a …']);
  });

  it('accepts the results of the transformations that promise the form', () => {
    for (let s = 1; s <= 60; s++) {
      const g = parse(randomGrammarText(s));
      expect(ok(removeEpsilonRules(g).transformedGrammar, 'epsFree').ok, `seed ${s}`).toBe(true);
      expect(ok(removeUnitRules(g).transformedGrammar, 'noUnit').ok, `seed ${s}`).toBe(true);
      expect(ok(removeLeftRecursion(g).transformedGrammar, 'noLeftRecursion').ok, `seed ${s}`).toBe(true);
      expect(ok(leftFactorGrammar(g).transformedGrammar, 'leftFactored').ok, `seed ${s}`).toBe(true);
      expect(ok(convertToChomsky(g).transformedGrammar, 'cnf').ok, `seed ${s}`).toBe(true);
      expect(ok(convertToGreibach(g).transformedGrammar, 'gnf').ok, `seed ${s}`).toBe(true);
    }
  });
});
