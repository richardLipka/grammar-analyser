/**
 * Randomised check of every grammar-changing method: small random grammars
 * (seeded, reproducible) are transformed by every whole-grammar construction,
 * every transformation offered for a non-terminal and every transformation
 * offered for an occurrence. Each result must generate the same words (Earley,
 * all words up to a length) and must have the form the construction promises.
 */
import { describe, it, expect } from 'vitest';
import { Grammar } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import {
  computeEndable,
  computeReachable,
  computeNullable,
  computeLeftRecursion
} from '../core/analyser/grammarAnalyser';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftCornerTransform,
  leftFactorGrammar,
  rightFactorGrammar,
  convertToChomsky,
  convertToGreibach,
  getAvailableTransformationsForSymbol,
  getAvailableTransformationsForOccurrence,
  applySymbolTransformation,
  TransformationResult
} from '../core/processor/grammarProcessor';
import { accepts, wordsUpTo, rules } from './earley';
import { randomGrammarText } from './randomGrammar';

const MAX_LEN = 4;

/** Compares against precomputed membership of the original grammar. */
function sameLanguage(original: Map<string, boolean>, words: string[][], g: Grammar): string | null {
  for (const w of words) {
    if (accepts(g, w) !== original.get(w.join(' '))) return w.join(' ') || 'ε';
  }
  return null;
}

const allowedEps = (g: Grammar, lhs: string, len: number) =>
  len > 0 || (lhs === g.startSymbol && !g.productions.some(p => p.rhs.includes(g.startSymbol)));

/** The form each whole-grammar construction promises (null = fine). */
const postconditions: Record<string, (g: Grammar, res: TransformationResult) => string | null> = {
  reduceGrammar: g => {
    const e = computeEndable(g);
    const r = computeReachable(g);
    // an empty language leaves only the start symbol
    return [...g.nonTerminals].every(nt => (e.has(nt) && r.has(nt)) || nt === g.startSymbol) ? null : 'useless symbol left';
  },
  removeEpsilonRules: g => (g.productions.every(p => allowedEps(g, p.lhs, p.rhs.length)) ? null : 'ε-rule left'),
  removeUnitRules: g => (g.productions.every(p => !(p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0]))) ? null : 'unit rule left'),
  removeLeftRecursion: (g, res) => noLeftRecursion(g, res),
  leftCornerTransform: (g, res) => noLeftRecursion(g, res),
  leftFactorGrammar: g => noCommonEnds(g, a => a[0]),
  rightFactorGrammar: g => noCommonEnds(g, a => a[a.length - 1]),
  convertToChomsky: g => g.productions.every(p =>
    (p.rhs.length === 2 && p.rhs.every(s => g.nonTerminals.has(s))) ||
    (p.rhs.length === 1 && g.terminals.has(p.rhs[0])) ||
    (p.rhs.length === 0 && allowedEps(g, p.lhs, 0))) ? null : 'not CNF',
  convertToGreibach: (g, res) => res.steps.some(s => s.title.startsWith('Stopped')) || g.productions.every(p =>
    (p.rhs.length > 0 && g.terminals.has(p.rhs[0]) && p.rhs.slice(1).every(s => g.nonTerminals.has(s))) ||
    (p.rhs.length === 0 && allowedEps(g, p.lhs, 0))) ? null : 'not GNF'
};

function noLeftRecursion(g: Grammar, res: TransformationResult): string | null {
  if (res.steps.some(s => s.title.startsWith('Stopped'))) return null;
  const lr = computeLeftRecursion(g, computeNullable(g));
  return lr.immediate.size + lr.indirect.size === 0 ? null : `left recursion left in ${[...lr.immediate, ...lr.indirect].join(', ')}`;
}

function noCommonEnds(g: Grammar, end: (a: string[]) => string): string | null {
  for (const nt of g.nonTerminals) {
    const ends = g.productions.filter(p => p.lhs === nt && p.rhs.length > 0).map(p => end(p.rhs));
    if (new Set(ends).size !== ends.length) return `common ${end === undefined ? '' : 'end'} in ${nt}`;
  }
  return null;
}

const constructions = {
  reduceGrammar, removeEpsilonRules, removeUnitRules, removeLeftRecursion, leftCornerTransform,
  leftFactorGrammar, rightFactorGrammar, convertToChomsky, convertToGreibach
};

function checkGrammar(text: string): string[] {
  const problems: string[] = [];
  const res0 = parseGrammar(text);
  if (!res0.grammar || res0.errors.length > 0) return problems;
  const g = res0.grammar;
  const words = wordsUpTo([...g.terminals], MAX_LEN);
  const original = new Map(words.map(w => [w.join(' '), accepts(g, w)]));
  const check = (label: string, res: TransformationResult, post?: (h: Grammar, r: TransformationResult) => string | null) => {
    const diff = sameLanguage(original, words, res.transformedGrammar);
    if (diff !== null) problems.push(`${label}: language differs on '${diff}'\n${rules(res.transformedGrammar).join('\n')}`);
    const bad = post?.(res.transformedGrammar, res);
    if (bad) problems.push(`${label}: ${bad}\n${rules(res.transformedGrammar).join('\n')}`);
  };
  for (const [name, fn] of Object.entries(constructions)) check(name, fn(g), postconditions[name]);
  for (const nt of g.nonTerminals) {
    for (const tr of getAvailableTransformationsForSymbol(g, nt)) check(`${nt}:${tr.id}`, applySymbolTransformation(g, nt, tr.id));
  }
  for (const p of g.productions) {
    p.rhs.forEach((_, position) => {
      for (const tr of getAvailableTransformationsForOccurrence(g, { productionId: p.id, position })) {
        check(`occ ${tr.id}`, applySymbolTransformation(g, '', tr.id));
      }
    });
  }
  return problems;
}

describe('Random grammars: every transformation keeps the language and its promised form', () => {
  for (let batch = 0; batch < 4; batch++) {
    it(`batch ${batch + 1}`, () => {
      const failures: string[] = [];
      for (let seed = batch * 25 + 1; seed <= batch * 25 + 25; seed++) {
        const text = randomGrammarText(seed);
        for (const p of checkGrammar(text)) failures.push(`seed ${seed}\n${text}\n--> ${p}`);
      }
      expect(failures.slice(0, 3)).toEqual([]);
    });
  }
});
