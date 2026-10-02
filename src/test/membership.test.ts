/**
 * Membership for any grammar (all derivation trees) and the CYK table.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { testMembership, viablePrefixLength } from '../core/parser/membership';
import { cnfViolations, cykTable } from '../core/parser/cyk';
import { convertToChomsky } from '../core/processor/grammarProcessor';
import { DerivationNode } from '../core/generator/wordGenerator';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};
const yieldOf = (n: DerivationNode): string[] =>
  n.children && n.children.length > 0 ? n.children.flatMap(yieldOf) : n.isTerminal && n.symbol !== 'ε' ? [n.symbol] : [];
const bracket = (n: DerivationNode): string =>
  n.children && n.children.length > 0 ? `${n.symbol}(${n.children.map(bracket).join(' ')})` : n.symbol;

/** Replays a left parse as a leftmost derivation. */
function leftmost(g: Grammar, parse: number[]): string[] {
  let form = [g.startSymbol];
  for (const id of parse) {
    const p = g.productions.find(q => q.id === id)!;
    const i = form.findIndex(s => g.nonTerminals.has(s));
    expect(form[i]).toBe(p.lhs);
    form = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
  }
  return form;
}

/** Number of derivation trees saturated at 2 (independent counter, see precedenceAmbiguity.test.ts). */
function treeCount2(g: Grammar, w: string[]): number {
  const n = w.length;
  const cnt = new Map<string, number>();
  const get = (A: string, i: number, j: number) => cnt.get(`${A}|${i}|${j}`) ?? 0;
  const seq = (rhs: string[], i: number, j: number): number => {
    if (rhs.length === 0) return i === j ? 1 : 0;
    const [X, ...rest] = rhs;
    let total = 0;
    for (let k = i; k <= j; k++) {
      const head = g.nonTerminals.has(X) ? get(X, i, k) : k === i + 1 && w[i] === X ? 1 : 0;
      if (head === 0) continue;
      total = Math.min(2, total + head * seq(rest, k, j));
      if (total >= 2) return 2;
    }
    return total;
  };
  for (let len = 0; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      for (let changed = true; changed; ) {
        changed = false;
        for (const A of g.nonTerminals) {
          let c = 0;
          for (const p of g.productions) if (p.lhs === A) c = Math.min(2, c + seq(p.rhs, i, i + len));
          if (c !== get(A, i, i + len)) {
            cnt.set(`${A}|${i}|${i + len}`, c);
            changed = true;
          }
        }
      }
    }
  }
  return get(g.startSymbol, 0, n);
}

describe('Membership for any grammar', () => {
  it('counts the trees of ambiguous words (Catalan numbers for E → E + E | a)', () => {
    const g = parse('E -> E + E | a');
    const count = (w: string) => testMembership(g, w.split(' ')).treeCount;
    expect(count('a')).toBe(1);
    expect(count('a + a + a')).toBe(2);
    expect(count('a + a + a + a')).toBe(5);
    expect(count('a + a + a + a + a')).toBe(14);
    const r = testMembership(g, 'a + a + a'.split(' '));
    expect(r.trees.map(t => bracket(t.tree)).sort()).toEqual([
      'E(E(E(a) + E(a)) + E(a))',
      'E(E(a) + E(E(a) + E(a)))'
    ]);
  });

  it('reports infinitely many trees for a cycle and lists the trees without repeating it', () => {
    const g = parse('S -> S | a');
    const r = testMembership(g, ['a']);
    expect(r.accepted).toBe(true);
    expect(r.treeCount).toBe(Infinity);
    // S(S(a)), S(S(S(a))), … repeat the cycle; only the tree without it is listed
    expect(r.trees.map(t => bracket(t.tree))).toEqual(['S(a)']);
    expect(r.moreTrees).toBe(true);
  });

  it('counts trees with ε-rules', () => {
    const g = parse('S -> A A\nA -> a | ε');
    expect(testMembership(g, ['a']).treeCount).toBe(2);
    expect(testMembership(g, []).treeCount).toBe(1);
    expect(testMembership(g, ['a', 'a']).treeCount).toBe(1);
    expect(testMembership(g, ['a', 'a', 'a']).accepted).toBe(false);
  });

  it('finds where a rejected word goes wrong', () => {
    const g = parse('S -> a S b | ε');
    expect(viablePrefixLength(g, 'a a b a'.split(' '))).toBe(3); // a a b is a prefix of a a b b
    expect(testMembership(g, 'a a b'.split(' ')).viablePrefix).toBe(3); // ends too early
    expect(testMembership(g, ['b']).viablePrefix).toBe(0);
  });

  it('agrees with the Earley recognizer and an independent tree count on random grammars and presets', () => {
    const grammars = [
      ...Array.from({ length: 120 }, (_, s) => parse(randomGrammarText(s + 1))),
      ...PRESET_GRAMMARS.map(p => parse(p.grammarText))
    ];
    for (const g of grammars) {
      const alphabet = [...g.terminals];
      let maxLen = 0;
      while (maxLen < 4 && alphabet.length ** (maxLen + 1) <= 300) maxLen++;
      for (const w of wordsUpTo(alphabet, maxLen)) {
        const r = testMembership(g, w, 6);
        const label = `${g.productions.map(p => `${p.lhs}->${p.rhs.join(' ')}`).join('; ')} '${w.join(' ')}'`;
        expect(r.accepted, label).toBe(accepts(g, w));
        expect(Math.min(r.treeCount, 2), label).toBe(treeCount2(g, w));
        if (Number.isFinite(r.treeCount)) {
          expect(r.trees.length, label).toBe(Math.min(r.treeCount, 6));
        }
        const seen = new Set<string>();
        for (const t of r.trees) {
          expect(yieldOf(t.tree), label).toEqual(w);
          expect(leftmost(g, t.leftParse), label).toEqual(w);
          seen.add(t.leftParse.join(','));
        }
        expect(seen.size, label).toBe(r.trees.length);
        if (!r.accepted) expect(r.viablePrefix).toBeLessThanOrEqual(w.length);
      }
    }
  });
});

describe('CYK', () => {
  it('recognises CNF grammars and lists the rules that are not in CNF', () => {
    expect(cnfViolations(parse('S -> A B | a\nA -> a\nB -> b'))).toEqual([]);
    expect(cnfViolations(parse('S -> a S b | ε')).map(p => p.rhs.join(' '))).toEqual(['a S b', '']);
    // S -> ε is allowed when S is on no right-hand side
    expect(cnfViolations(parse("S' -> S | ε\nS -> a")).map(p => p.rhs.join(' '))).toEqual(['S']);
  });

  it('builds the classic table for a b a a b', () => {
    // Hopcroft, Motwani, Ullman, Example 7.34
    const g = parse('S -> A B | B C\nA -> B A | a\nB -> C C | b\nC -> A B | a');
    const t = cykTable(g, 'b a a b a'.split(' '));
    const cell = (i: number, j: number) => [...t.cells[i][j].keys()].sort().join(',');
    expect(cell(1, 1)).toBe('B');
    expect(cell(2, 2)).toBe('A,C');
    expect(cell(1, 2)).toBe('A,S');
    expect(cell(2, 3)).toBe('B');
    expect(cell(1, 5)).toBe('A,C,S');
    expect(t.accepted).toBe(true);
    const witness = t.cells[1][2].get('S')![0];
    expect(witness.production.rhs).toEqual(['B', 'C']);
    expect(witness.k).toBe(1);
  });

  it('accepts exactly the language of the CNF of random grammars', () => {
    for (let s = 1; s <= 80; s++) {
      const g = parse(randomGrammarText(s));
      const cnf = convertToChomsky(g).transformedGrammar;
      expect(cnfViolations(cnf)).toEqual([]);
      for (const w of wordsUpTo([...g.terminals], 4)) {
        expect(cykTable(cnf, w).accepted, `seed ${s} '${w.join(' ')}'`).toBe(accepts(g, w));
      }
    }
  });
});
