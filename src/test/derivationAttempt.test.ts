/**
 * The derivation of a word, or the attempt where a grammar does not generate
 * it, checked against independent facts: the prefix agrees with the viable
 * prefix of the membership module, every expected terminal (and only those)
 * extends it, the tree uses only rules of the grammar, and its leaves are the
 * prefix, the marked terminal and the symbols not derived any more.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { explainWord, leftmostForms } from '../core/parser/derivationAttempt';
import { viablePrefixLength } from '../core/parser/membership';
import { DerivationNode } from '../core/generator/wordGenerator';
import { accepts, wordsUpTo } from './earley';
import { prng, randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const leaves = (n: DerivationNode): DerivationNode[] =>
  n.children && n.children.length > 0 ? n.children.flatMap(leaves) : [n];

/** Every inner node is expanded by a rule of the grammar. */
function checkRules(g: Grammar, n: DerivationNode) {
  if (!n.children || n.children.length === 0) return;
  const rhs = n.children.filter(c => !(c.isTerminal && c.symbol === 'ε')).map(c => c.symbol);
  expect(g.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === rhs.join(' ')), `${n.symbol} → ${rhs.join(' ')}`).toBe(true);
  n.children.forEach(c => checkRules(g, c));
}

function check(g: Grammar, w: string[]) {
  const e = explainWord(g, w);
  if (e.generated) {
    expect(accepts(g, w)).toBe(true);
    expect(leaves(e.tree).map(l => l.symbol).filter(s => s !== 'ε')).toEqual(w);
    checkRules(g, e.tree);
    expect(e.forms[0]).toEqual([g.startSymbol]);
    expect(e.forms[e.forms.length - 1]).toEqual(w);
    return e;
  }
  expect(accepts(g, w)).toBe(false);
  expect(e.matched).toBe(viablePrefixLength(g, w));
  const prefix = w.slice(0, e.matched);
  expect(e.found).toBe(w[e.matched]);
  if (e.reason === 'empty-language') {
    expect(e.tree).toBeNull();
    return e;
  }
  // exactly the expected terminals extend the prefix
  for (const t of g.terminals) {
    expect(viablePrefixLength(g, [...prefix, t]) === e.matched + 1, `${prefix.join(' ')} + ${t}`).toBe(e.expected.includes(t));
  }
  expect(e.canEnd).toBe(accepts(g, prefix));
  if (e.found !== undefined) expect(e.expected).not.toContain(e.found);
  expect(e.tree).not.toBeNull();
  checkRules(g, e.tree!);
  const ls = leaves(e.tree!).filter(l => !(l.isTerminal && l.symbol === 'ε' && !l.mark));
  if (e.reason === 'goes-on') {
    expect(e.expected).toEqual([]);
    expect(e.canEnd).toBe(true);
    expect(ls.map(l => l.symbol)).toEqual(prefix);
    expect(ls.every(l => !l.mark)).toBe(true);
  } else {
    expect(e.reason).toBe(e.found === undefined ? 'ends-early' : 'mismatch');
    // the prefix, then the terminal the derivation needs, then what was not derived
    expect(ls.slice(0, e.matched).map(l => l.symbol)).toEqual(prefix);
    expect(ls.slice(0, e.matched).every(l => l.isTerminal && !l.mark)).toBe(true);
    const at = ls[e.matched];
    expect(at.mark).toBe('mismatch');
    expect(e.expected).toContain(at.symbol);
    expect(ls.slice(e.matched + 1).every(l => l.mark === 'pending')).toBe(true);
  }
  // the leftmost derivation ends in the leaves of the tree
  expect(e.forms[0]).toEqual([g.startSymbol]);
  expect(e.forms[e.forms.length - 1]).toEqual(ls.map(l => l.symbol));
  return e;
}

describe('derivation of a word or the attempt', () => {
  const expr = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id');

  it('a word of the language: its tree and leftmost derivation', () => {
    const e = check(expr, ['id', '+', 'id']);
    expect(e.generated).toBe(true);
    if (e.generated) expect(e.forms.map(f => f.join(' '))).toEqual(['E', 'E + T', 'T + T', 'F + T', 'id + T', 'id + F', 'id + id']);
  });

  it('a wrong symbol: the prefix, what may follow, the attempt', () => {
    const e = check(expr, ['id', 'id']);
    expect(e.generated).toBe(false);
    if (!e.generated) {
      expect(e.reason).toBe('mismatch');
      expect(e.matched).toBe(1);
      expect(e.found).toBe('id');
      expect(e.expected).toEqual(['*', '+']);
      expect(e.canEnd).toBe(true);
    }
  });

  it('the word ends too early', () => {
    const e = check(expr, ['(', 'id', '+']);
    if (!e.generated) {
      expect(e.reason).toBe('ends-early');
      expect(e.expected).toEqual(['(', 'id']);
    }
  });

  it('the word goes on after a complete word that nothing can follow', () => {
    const g = parse('S -> a b');
    const e = check(g, ['a', 'b', 'b']);
    if (!e.generated) {
      expect(e.reason).toBe('goes-on');
      expect(e.matched).toBe(2);
      expect(e.found).toBe('b');
    }
  });

  it('a symbol that is no terminal of the grammar', () => {
    const e = check(expr, ['id', 'num']);
    if (!e.generated) expect(e.unknownSymbol).toBe(true);
  });

  it('ε-rules, cycles and left recursion in the chain of predictions', () => {
    const g = parse('S -> A S b | ε\nA -> A A | a | ε');
    for (const w of [['b', 'a'], ['a', 'a', 'b', 'b', 'b'], ['a', 'b', 'a']]) check(g, w);
    check(parse('S -> S | S S | a'), ['a', 'b']);
  });

  it('an empty language', () => {
    const e = check(parse('S -> a S'), ['a']);
    if (!e.generated) expect(e.reason).toBe('empty-language');
  });

  it('leftmost forms of a partial tree keep the unexpanded symbols', () => {
    const tree: DerivationNode = {
      id: '1', symbol: 'S', isTerminal: false, children: [
        { id: '2', symbol: 'a', isTerminal: true },
        { id: '3', symbol: 'S', isTerminal: false, mark: 'pending' }
      ]
    };
    expect(leftmostForms(tree)).toEqual([['S'], ['a', 'S']]);
  });

  it('random grammars and words', () => {
    let attempts = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const g = parse(randomGrammarText(seed));
      const T = [...g.terminals];
      if (T.length === 0) continue;
      const rnd = prng(seed);
      const words = wordsUpTo(T, 3);
      for (let i = 0; i < 4; i++) words.push(Array.from({ length: 4 + Math.floor(rnd() * 4) }, () => T[Math.floor(rnd() * T.length)]));
      for (const w of words) {
        const e = check(g, w);
        if (!e.generated && e.reason !== 'empty-language') attempts++;
      }
    }
    expect(attempts).toBeGreaterThan(1000);
  });
});
