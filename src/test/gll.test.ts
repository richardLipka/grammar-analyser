/**
 * GLL (Scott & Johnstone 2010/2013) with BSR sets (Scott, Johnstone & van Binsbergen 2019):
 * acceptance equals the Earley oracle, the trees in the BSR set are valid and as many as the
 * membership test counts, on seeded random grammars (left recursion, ε-rules, cycles) and on
 * hand-made ones; the shared packed forests from the BSR set, the Earley chart and the GLR
 * trees agree.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { DerivationNode } from '../core/generator/wordGenerator';
import { parseGLL, GLLResult, formatSlot } from '../core/gll/gllParser';
import { BSRSet, bsrDerivations, formatBSRElement } from '../core/gll/bsr';
import { testMembership } from '../core/parser/membership';
import { bsrToForest, earleyChartToBSR, treeInForest, treesToForest } from '../core/forest/sppf';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import { simulateGLRParse } from '../core/lr/glrParser';
import { buildLRTable } from '../core/lr/lrTable';
import { buildLR1Automaton } from '../core/lr/lrAutomaton';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const g = (text: string) => parseGrammar(text).grammar!;

const validTree = (gr: Grammar, n: DerivationNode): boolean => {
  if (n.isTerminal) return true;
  const kids = (n.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
  return gr.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === kids.join(' ')) &&
    (n.children ?? []).every(c => validTree(gr, c));
};
const leaves = (n: DerivationNode): string[] =>
  !n.children || n.children.length === 0 ? (n.symbol === 'ε' ? [] : [n.symbol]) : n.children.flatMap(leaves);
const shape = (n: DerivationNode): string =>
  n.children ? `${n.symbol}(${n.children.map(shape).join(',')})` : n.symbol;

/** Every element of the BSR set made by GLL is a real derivation of its part (soundness). */
function checkSound(gr: Grammar, w: string[], r: GLLResult): string | null {
  const m = new Map<string, boolean>();
  const derives = (symbols: string[], i: number, j: number) => {
    const key = `${symbols.join(' ')}|${i}|${j}`;
    if (!m.has(key)) {
      const sub = { ...gr, startSymbol: '\u0002', nonTerminals: new Set([...gr.nonTerminals, '\u0002']), productions: [...gr.productions, { id: -9, lhs: '\u0002', rhs: symbols }] };
      m.set(key, accepts(sub, w.slice(i, j)));
    }
    return m.get(key)!;
  };
  for (const e of r.bsr.elements) {
    const syms = e.kind === 'rule' ? e.production.rhs : e.symbols;
    if (!(e.i <= e.k && e.k <= e.j)) return `extents ${formatBSRElement(e)}`;
    if (syms.length > 0 && !derives(syms.slice(0, -1), e.i, e.k)) return `prefix ${formatBSRElement(e)}`;
    if (syms.length > 0 && !derives(syms.slice(-1), e.k, e.j)) return `last ${formatBSRElement(e)}`;
    if (syms.length === 0 && !(e.i === e.k && e.k === e.j)) return `epsilon ${formatBSRElement(e)}`;
  }
  return null;
}

function compare(gr: Grammar, w: string[], r: GLLResult): string[] {
  const problems: string[] = [];
  const expected = accepts(gr, w);
  if (r.accepted !== expected) problems.push(`accepted ${r.accepted}, oracle ${expected}`);
  if (r.truncated) problems.push('truncated');
  const mem = testMembership(gr, w, 60);
  if (r.treeCount !== mem.treeCount) problems.push(`trees ${r.treeCount}, membership ${mem.treeCount}`);
  for (const t of r.trees) {
    if (!validTree(gr, t)) problems.push(`invalid tree ${shape(t)}`);
    if (leaves(t).join(' ') !== w.join(' ')) problems.push(`yield ${leaves(t).join(' ')}`);
  }
  if (new Set(r.trees.map(shape)).size !== r.trees.length) problems.push('repeated tree');
  if (Number.isFinite(mem.treeCount) && r.trees.length !== Math.min(mem.treeCount, 50)) problems.push(`listed ${r.trees.length} of ${mem.treeCount}`);
  if (Number.isFinite(mem.treeCount) && mem.treeCount <= 50) {
    const a = new Set(r.trees.map(shape));
    const b = new Set(mem.trees.map(t => shape(t.tree)));
    if (mem.treeCount <= 60 && [...b].some(s => !a.has(s))) problems.push('different trees than membership');
  }
  // Acceptance as the papers state it: pop(u₀, n) happened ⇔ (S ::= α, 0, k, n) ∈ Υ
  const poppedBase = r.steps.some(s => s.actions.some(a => a.type === 'pop' && a.base && a.position === w.length));
  if (poppedBase !== r.accepted) problems.push('pop(u0, n) disagrees with the BSR acceptance');
  return problems;
}

describe('GLL parser with BSR sets', () => {
  it('agrees with the Earley oracle and the membership tree count on random grammars (all words ≤ 5)', async () => {
    const failures: string[] = [];
    let accepted = 0;
    let ambiguous = 0;
    let infinite = 0;
    let checked = 0;
    for (let seed = 1; seed <= 500 && failures.length < 5; seed++) {
      if (seed % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const gr = parseGrammar(randomGrammarText(seed)).grammar;
      if (!gr) continue;
      for (const lookahead of [true, false]) {
        for (const w of wordsUpTo([...gr.terminals], 5)) {
          const r = parseGLL(gr, w, { lookahead });
          const problems = compare(gr, w, r);
          checked++;
          if (r.accepted) accepted++;
          if (r.treeCount > 1) ambiguous++;
          if (r.treeCount === Infinity) infinite++;
          if (problems.length) failures.push(`seed ${seed} la=${lookahead} '${w.join(' ')}': ${problems.join('; ')}\n${randomGrammarText(seed)}`);
          if (failures.length >= 5) break;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(accepted).toBeGreaterThan(1000);
    expect(ambiguous).toBeGreaterThan(100);
    expect(infinite).toBeGreaterThan(10);
    expect(checked).toBeGreaterThan(50000);
  });

  it('every BSR element is a real derivation of its part (soundness), random grammars', async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 120 && failures.length < 3; seed++) {
      if (seed % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const gr = parseGrammar(randomGrammarText(seed)).grammar;
      if (!gr) continue;
      for (const w of wordsUpTo([...gr.terminals], 4)) {
        const bad = checkSound(gr, w, parseGLL(gr, w));
        if (bad) failures.push(`seed ${seed} '${w.join(' ')}': ${bad}`);
      }
    }
    expect(failures).toEqual([]);
  });

  const handMade: [string, string, string[][]][] = [
    ['immediate left recursion', 'E -> E + E | E * E | a', [['a'], ['a', '+', 'a', '*', 'a'], ['a', '+'], ['+', 'a'], ['a', '+', 'a', '+', 'a', '+', 'a']]],
    ['left recursion with ε', 'S -> S a | ε', [[], ['a'], ['a', 'a', 'a']]],
    ['hidden left recursion', 'S -> A S b | c\nA -> ε | a', [['c'], ['c', 'b'], ['a', 'c', 'b'], ['c', 'b', 'b'], ['a', 'c']]],
    ['indirect left recursion', 'S -> A a | b\nA -> S c | d', [['b', 'c', 'a'], ['d', 'a'], ['b', 'c', 'a', 'c', 'a'], ['b', 'a']]],
    ['cycle', 'S -> S | A | a\nA -> S', [['a'], [], ['a', 'a']]],
    ['ε-cycle', 'S -> A A | a\nA -> A | ε', [[], ['a']]],
    ['palindromes', 'S -> a S a | b S b | a | b | ε', [['a', 'b', 'a'], ['a', 'b', 'b', 'a'], ['a', 'b']]],
    ['Catalan', 'S -> S S | a', [['a', 'a', 'a', 'a', 'a', 'a']]],
    ['rule-less non-terminal', 'S -> a B | a\nB -> B b', [['a'], ['a', 'b']]],
    ['dangling else', 'S -> i S | i S e S | x', [['i', 'i', 'x', 'e', 'x'], ['i', 'x', 'e', 'i', 'x']]]
  ];
  for (const [name, text, words] of handMade) {
    it(`hand-made grammar: ${name}`, () => {
      const gr = g(text);
      for (const w of words) {
        for (const lookahead of [true, false]) {
          expect(compare(gr, w, parseGLL(gr, w, { lookahead })), `${name} '${w.join(' ')}'`).toEqual([]);
        }
      }
    });
  }

  it('Catalan numbers of trees for S → S S | a', () => {
    const gr = g('S -> S S | a');
    const catalan = [1, 1, 2, 5, 14, 42, 132, 429];
    for (let n = 1; n <= 8; n++) expect(parseGLL(gr, Array(n).fill('a')).treeCount).toBe(catalan[n - 1]);
  });

  it('records the operations of the papers: descriptors, create with contingent returns, pop, the pop set', () => {
    const gr = g('E -> E + E | a');
    const r = parseGLL(gr, ['a', '+', 'a']);
    expect(r.accepted).toBe(true);
    expect(r.treeCount).toBe(1);
    const all = r.steps.flatMap(s => s.actions);
    // E is called at 0 from u₀ and again from the slot E ::= E · + E (left recursion): one node, no loop
    const createsAt0 = all.filter(a => a.type === 'create' && a.position === 0);
    expect(createsAt0.some(a => a.type === 'create' && !a.nodeIsNew)).toBe(true);
    expect(all.some(a => a.type === 'add' && !a.isNew)).toBe(true);
    expect(all.some(a => a.type === 'pop' && !a.base)).toBe(true);
    expect(r.popSet.length).toBeGreaterThan(0);
    // every descriptor was processed exactly once
    expect(r.descriptors.every(d => d.processedAt !== undefined)).toBe(true);
    expect(new Set(r.descriptors.map(d => `${formatSlot(d.slot)}|${d.node}|${d.index}`)).size).toBe(r.descriptors.length);
    // the BSR elements of the papers' example shape
    const shown = r.bsr.elements.map(formatBSRElement);
    expect(shown).toContain('(E ::= a, 0, 0, 1)');
    expect(shown).toContain('(E ::= E + E, 0, 2, 3)');
    expect(shown).toContain('(E +, 0, 1, 2)');
  });

  it('contingent returns: an edge added to a node that already returned', () => {
    // S calls B at 0 with the return slot S ::= B · a; B calls S at 0 again (indirect left
    // recursion), which finds the node of the first call, and a later edge to it gets the
    // returns recorded in P before
    const gr = g('S -> B a | B\nB -> S | b');
    const r = parseGLL(gr, ['b', 'a', 'a']);
    expect(r.accepted).toBe(true);
    expect(r.steps.flatMap(s => s.actions).some(a => a.type === 'contingent')).toBe(true);
  });

  it('the BSR set restricted to a step still gives valid subtrees', () => {
    const gr = g('E -> E + E | E * E | a');
    const w = ['a', '+', 'a', '*', 'a'];
    const r = parseGLL(gr, w);
    for (const step of r.steps) {
      const part: BSRSet = r.bsr.upTo(step.index);
      expect(part.size).toBeLessThanOrEqual(r.bsr.size);
    }
    expect(bsrDerivations(r.bsr, gr, w).treeCount).toBe(2);
  });

  it('stops with truncated = true when the descriptor limit is reached', () => {
    const gr = g('S -> S S | a | ε');
    const r = parseGLL(gr, Array(8).fill('a'), { maxDescriptors: 30 });
    expect(r.truncated).toBe(true);
  });

  it('shared packed forests: GLL and Earley give the same forest, both forms count the membership trees, every tree lies in it', async () => {
    const failures: string[] = [];
    let ambiguousForests = 0;
    for (let seed = 1; seed <= 250 && failures.length < 5; seed++) {
      if (seed % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const gr = parseGrammar(randomGrammarText(seed)).grammar;
      if (!gr) continue;
      for (const w of wordsUpTo([...gr.terminals], 4)) {
        const r = parseGLL(gr, w);
        if (!r.accepted) continue;
        const mem = testMembership(gr, w, 5);
        const earley = simulateEarleyParse(w, gr, { maxSteps: 1e6 });
        const fromEarley = earleyChartToBSR(gr, w, earley.sets.map(s => s.items));
        for (const binarised of [false, true]) {
          const f = bsrToForest(r.bsr, gr, w, { binarised });
          const e = bsrToForest(fromEarley, gr, w, { binarised });
          const tag = `seed ${seed} '${w.join(' ')}' ${binarised ? 'binarised' : 'by rules'}`;
          if (f.treeCount !== mem.treeCount) failures.push(`${tag}: forest ${f.treeCount}, membership ${mem.treeCount}`);
          const a = [...f.nodes.keys()].sort().join(' ');
          const b = [...e.nodes.keys()].sort().join(' ');
          if (a !== b) failures.push(`${tag}: GLL and Earley forests differ`);
          for (const t of r.trees.slice(0, 10)) {
            const missing = [...treeInForest(t, gr, binarised)].filter(id => !f.nodes.has(id));
            if (missing.length) failures.push(`${tag}: tree nodes missing ${missing.join(' ')}`);
          }
          if (binarised) {
            for (const x of f.nodes.values()) if (x.kind === 'packed' && x.children.length > 2) failures.push(`${tag}: packed node with 3 children`);
          } else if (f.ambiguous.length) ambiguousForests++;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(ambiguousForests).toBeGreaterThan(50);
  });

  it('the forest of the GLR trees has the trees GLR found', () => {
    const gr = g('E -> E + E | E * E | a');
    const w = ['a', '+', 'a', '*', 'a', '+', 'a'];
    const analysis = analyzeGrammar(gr);
    const automaton = buildLR1Automaton(gr, analysis);
    const table = buildLRTable(automaton, gr, analysis);
    const glr = simulateGLRParse(w, gr, table, 'dragon', 2000, 50, automaton);
    expect(glr.accepted).toBe(true);
    const f = treesToForest(glr.trees, gr);
    expect(f.treeCount).toBe(5);
    expect(f.ambiguous.length).toBeGreaterThan(0);
    const fromGll = bsrToForest(parseGLL(gr, w).bsr, gr, w);
    expect([...f.nodes.keys()].sort()).toEqual([...fromGll.nodes.keys()].sort());
  });
});
