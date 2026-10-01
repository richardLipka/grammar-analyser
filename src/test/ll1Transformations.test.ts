/**
 * LL(1) transformations of the KIV/FJP lectures (Ježek, "9 a 10 LLk" and "8 BKG")
 * and of single occurrences on a right-hand side. Every result is checked for
 * language equivalence with the Earley recognizer.
 */
import { describe, it, expect } from 'vitest';
import { Grammar, formatGrammarForEditor } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import {
  applySymbolTransformation,
  getAvailableTransformationsForSymbol,
  getAvailableTransformationsForOccurrence,
  absorbFollowingSymbol,
  splitFollowForOccurrence
} from '../core/processor/grammarProcessor';
import { rules, expectEquivalent } from './earley';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const conflicts = (g: Grammar) =>
  buildLLTable(g, analyzeGrammar(g)).conflicts.map(c => `${c.nonTerminal}:${c.lookahead}:${c.conflictType}`);

/** The production id and position of the n-th occurrence of sym on a right-hand side of lhs. */
const occurrenceOf = (g: Grammar, lhs: string, sym: string, n = 0) => {
  const found: { productionId: number; position: number }[] = [];
  for (const p of g.productions) {
    if (p.lhs === lhs) p.rhs.forEach((s, i) => s === sym && found.push({ productionId: p.id, position: i }));
  }
  return found[n];
};

describe('Absorption of the following terminal (FIRST-FOLLOW → FIRST-FIRST)', () => {
  // Lecture 9 a 10, p. 21
  const lecture = 'A -> B a C\nB -> e | a b C\nC -> e | c B C';

  it('reproduces the lecture example', () => {
    const g = parse(lecture);
    expect(conflicts(g)).toContain('B:a:First/Follow');
    const res = absorbFollowingSymbol(g, occurrenceOf(g, 'A', 'B')).transformedGrammar;
    expect(rules(res)).toEqual(['A -> [Ba] C', 'B ->', 'B -> a b C', 'C ->', 'C -> c B C', '[Ba] -> a', '[Ba] -> a b C a']);
    expectEquivalent(g, res, 6);
    // The pair B a is gone and [Ba] has a FIRST-FIRST conflict. B keeps a FIRST-FOLLOW
    // conflict on a, unlike the slide says: the new rule [Ba] -> a b C a puts a after C,
    // and C -> c B C passes FOLLOW(C) on to FOLLOW(B) ("removing one conflict may cause another").
    expect(res.productions.some(p => p.rhs.join(' ').includes('B a'))).toBe(false);
    expect(conflicts(res)).toContain('[Ba]:a:First/First');
    expect(conflicts(res)).toContain('B:a:First/Follow');
    // ... which left factoring removes
    const factored = applySymbolTransformation(res, '[Ba]', 'leftFactor:a').transformedGrammar;
    expect(conflicts(factored).some(c => c.startsWith('[Ba]'))).toBe(false);
    expectEquivalent(g, factored, 6);
  });

  it('folds the pair inside the new rules and reuses [Ba] for further occurrences', () => {
    const g = parse('S -> A a b | c A a\nA -> a A | e');
    const once = absorbFollowingSymbol(g, occurrenceOf(g, 'S', 'A')).transformedGrammar;
    // every pair A a is folded, also in [Aa] -> a A a
    expect(rules(once)).toEqual(['S -> [Aa] b', 'S -> c [Aa]', 'A -> a A', 'A ->', '[Aa] -> a [Aa]', '[Aa] -> a']);
    expectEquivalent(g, once, 7);
  });

  it('is offered in the menu of a nullable non-terminal', () => {
    const g = parse(lecture);
    const ids = getAvailableTransformationsForSymbol(g, 'B').map(t => t.id);
    expect(ids.some(id => id.startsWith('absorb:'))).toBe(true);
  });
});

describe('Occurrence transformations', () => {
  const grammars = [
    'A -> B a C\nB -> e | a b C\nC -> e | c B C',
    'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a',
    'S -> A B A | a\nA -> a A | e\nB -> b | A',
    'S -> a S b S | a S | c'
  ];

  it('every offered occurrence transformation preserves the language', () => {
    for (const text of grammars) {
      const g = parse(text);
      for (const p of g.productions) {
        p.rhs.forEach((_, position) => {
          for (const tr of getAvailableTransformationsForOccurrence(g, { productionId: p.id, position })) {
            expectEquivalent(g, applySymbolTransformation(g, '', tr.id).transformedGrammar, 5);
          }
        });
      }
    }
  });

  it('substitutes the right-hand sides for one occurrence only', () => {
    const g = parse('S -> A x A\nA -> a | b');
    const occ = occurrenceOf(g, 'S', 'A', 1);
    const res = applySymbolTransformation(g, '', `expandOccurrence:${occ.productionId}:${occ.position}`).transformedGrammar;
    expect(rules(res)).toEqual(['S -> A x a', 'S -> A x b', 'A -> a', 'A -> b']);
  });

  it('copies a non-terminal for one occurrence (reduction of FOLLOW sets)', () => {
    const g = parse('S -> A a | b A c\nA -> a | e');
    expect(conflicts(g)).toContain('A:a:First/Follow');
    const res = splitFollowForOccurrence(g, occurrenceOf(g, 'S', 'A', 1)).transformedGrammar;
    expect(rules(res)).toContain('S -> b A₂ c');
    expect(rules(res)).toContain('A₂ -> a');
    expect(analyzeGrammar(res).follow1.get('A₂')).toEqual(new Set(['c']));
    expectEquivalent(g, res, 6);
  });
});

describe('Lecture transformations of whole non-terminals', () => {
  it('removes immediate left recursion without ε-rules (8 BKG, variant a)', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | i');
    const res = applySymbolTransformation(g, 'E', 'eliminateImmediateLeftRecursionEpsFree').transformedGrammar;
    expect(rules(res).filter(r => r.startsWith('E'))).toEqual(["E -> T", "E -> T E'", "E' -> + T", "E' -> + T E'"]);
    expectEquivalent(g, res, 5);
  });

  it('merges non-terminals with the same rules and inlines the rest (9 a 10, p. 22)', () => {
    let g = parse(`E -> T E1
E1 -> E' | ε
E' -> + T E2
E2 -> E' | ε
T -> F T1
T1 -> T' | ε
T' -> * F T2
T2 -> T' | ε
F -> ( E ) | a`);
    const original = g;
    expect(getAvailableTransformationsForSymbol(g, 'E1').map(t => t.id)).toContain('mergeEquivalent:E2');
    g = applySymbolTransformation(g, 'E1', 'mergeEquivalent:E2').transformedGrammar;
    g = applySymbolTransformation(g, 'T1', 'mergeEquivalent:T2').transformedGrammar;
    g = applySymbolTransformation(g, "E'", 'substitute').transformedGrammar;
    g = applySymbolTransformation(g, "T'", 'substitute').transformedGrammar;
    // the lecture's result
    expect(rules(g)).toEqual(['E -> T E1', 'E1 -> + T E1', 'E1 ->', 'T -> F T1', 'T1 -> * F T1', 'T1 ->', 'F -> ( E )', 'F -> a']);
    expectEquivalent(original, g, 6);
    expect(conflicts(g)).toEqual([]);
  });
});

describe('Editor text after a transformation', () => {
  it('writes terminals without quotes where that reads back the same', () => {
    const g = parse('S -> a S b | "e" | "if" S | "A" | ":=" | ( S ) | 1 S\nB -> ε');
    const text = formatGrammarForEditor(g);
    expect(text).toContain('S → a S b | "e" | if S | "A" | ":=" | ( S ) | 1 S');
    const again = parse(text);
    expect(rules(again)).toEqual(rules(g));
  });

  it('brackets non-terminals that are not identifiers or have no rules', () => {
    const g = parseGrammar('S -> <[Ba]> <C>\n<[Ba]> -> a').grammar!;
    expect(formatGrammarForEditor(g)).toContain('S → <[Ba]> <C>');
    expect(rules(parse(formatGrammarForEditor(g)))).toEqual(rules(g));
  });
});
