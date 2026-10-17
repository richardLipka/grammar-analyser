/**
 * ALL(*) correctness against the paper (Parr, Harwell, Fisher 2014):
 * - Theorem 6.1: for a non-left-recursive grammar the parser accepts exactly L(G)
 *   (checked against an Earley recognizer on all short words of random grammars);
 * - every accepted word gets a valid derivation tree with the word as its yield;
 * - SLL conflicts fall back to LL with the parser stack (§3.1 example);
 * - true ambiguities are reported and resolved to the minimum alternative;
 * - left recursion is refused as "not applicable", limits give "undecided";
 * - the lookahead trace describes the real steps.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { buildATN, describeATNState } from '../core/all/allAtn';
import { simulateALLParse, createDfaCache } from '../core/all/allParser';
import { adaptivePredict, describeConfig, EOF } from '../core/all/allPredictor';
import { DerivationNode } from '../core/generator/wordGenerator';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';
import { computeLeftRecursion, computeNullable } from '../core/analyser/grammarAnalyser';

const G = (text: string): Grammar => {
  const r = parseGrammar(text);
  expect(r.errors).toEqual([]);
  return r.grammar!;
};

/** null when `node` is a derivation tree of g whose yield is `word` */
function treeError(g: Grammar, node: DerivationNode, word: string[]): string | null {
  const leaves: string[] = [];
  const visit = (n: DerivationNode): string | null => {
    if (n.isTerminal) {
      if (n.symbol !== 'ε') leaves.push(n.symbol);
      return null;
    }
    const syms = (n.children ?? []).map(k => k.symbol);
    const isEps = syms.length === 0 || (syms.length === 1 && syms[0] === 'ε');
    const ok = g.productions.some(p => p.lhs === n.symbol &&
      (p.rhs.length === 0 ? isEps : p.rhs.length === syms.length && p.rhs.every((s, i) => s === syms[i])));
    if (!ok) return `${n.symbol} -> ${syms.join(' ')} is not a production`;
    for (const k of n.children ?? []) {
      const e = visit(k);
      if (e) return e;
    }
    return null;
  };
  const e = visit(node);
  if (e) return e;
  return leaves.join(' ') === word.join(' ') ? null : `yield '${leaves.join(' ')}' ≠ '${word.join(' ')}'`;
}

function parse(text: string, word: string[], detailed = false) {
  const g = G(text);
  const sim = simulateALLParse(word, g, buildATN(g), undefined, { detailedLookaheadSteps: detailed });
  return { g, sim };
}

describe('ALL(*) accepts exactly L(G) (Theorem 6.1)', () => {
  it('agrees with Earley on all words up to length 5 of random non-left-recursive grammars', async () => {
    let grammars = 0;
    let words = 0;
    let withLL = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      // Let the worker answer vitest's RPC between batches (CI timed out on long synchronous loops).
      if (seed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const r = parseGrammar(randomGrammarText(seed));
      if (!r.grammar || r.errors.length) continue;
      const g = r.grammar;
      if (computeLeftRecursion(g, computeNullable(g)).kinds.size > 0) continue;
      grammars++;
      const atn = buildATN(g);
      const cache = createDfaCache(atn); // the DFA cache is shared by all words, as in ANTLR
      for (const w of wordsUpTo([...g.terminals], 5)) {
        words++;
        const sim = simulateALLParse(w, g, atn, cache);
        const expected = accepts(g, w);
        expect(sim.outcome, `${r.grammar.productions.map(p => `${p.lhs}->${p.rhs.join(' ')}`).join('; ')} on '${w.join(' ')}'`)
          .toBe(expected ? 'accepted' : 'rejected');
        if (sim.accepted) expect(treeError(g, sim.finalTree!, w)).toBeNull();
        if (sim.llFallbacks > 0) withLL++;
      }
    }
    expect(grammars).toBeGreaterThan(700);
    expect(words).toBeGreaterThan(70000);
    expect(withLL).toBeGreaterThan(0); // the SLL → LL fallback is exercised
  });

  it('parses the stack-sensitive grammar of §3.1 (LL(2), not SLL(k)) by falling back to LL', () => {
    const text = 'S -> x B | y C\nB -> A a\nC -> A b a\nA -> b | ε';
    for (const w of [['x', 'b', 'a'], ['y', 'b', 'a'], ['x', 'a'], ['y', 'b', 'b', 'a']]) {
      const { g, sim } = parse(text, w);
      expect(sim.outcome, w.join(' ')).toBe('accepted');
      expect(treeError(g, sim.finalTree!, w)).toBeNull();
    }
    const { sim } = parse(text, ['y', 'b', 'a']);
    const decA = sim.steps.find(s => s.decisionEvent?.nonTerminal === 'A')!.decisionEvent!;
    expect(decA.usedLL).toBe(true);
    expect(decA.isAmbiguous).toBeFalsy();
    expect(decA.production.rhs).toEqual([]); // A → ε under C → A b a
    expect(decA.trace!.map(t => t.kind)).toContain('sll_conflict');
    expect(decA.trace!.map(t => t.kind)).toContain('ll_start');
    expect(sim.llFallbacks).toBeGreaterThan(0);
    expect(parse(text, ['y', 'a']).sim.outcome).toBe('rejected');
  });

  it('accepts the former counterexamples (SLL weakness, nullable rule called twice)', () => {
    const cases: [string, string[]][] = [
      ['S -> A | A a\nA -> ε | a A', ['a']],
      ['S -> b S b | ε', ['b', 'b', 'b', 'b']],
      ['S -> A A a | a\nA -> ε | b', ['b', 'a']],
      ['S -> x A b | y A\nA -> a b | a', ['x', 'a', 'b']],
      ['S -> A c c | A A A\nA -> b | ε', []],
      ['S -> c | A A b\nA -> a | ε', ['b']]
    ];
    for (const [text, w] of cases) {
      const { g, sim } = parse(text, w);
      expect(sim.outcome, `${text} on '${w.join(' ')}'`).toBe('accepted');
      expect(treeError(g, sim.finalTree!, w)).toBeNull();
    }
  });

  it('reports a true ambiguity found by LL and chooses the minimum alternative', () => {
    const { sim } = parse('S -> A | B\nA -> a\nB -> a', ['a']);
    expect(sim.outcome).toBe('accepted');
    const d = sim.steps.find(s => s.decisionEvent)!.decisionEvent!;
    expect(d.isAmbiguous).toBe(true);
    expect(d.ambiguousAlts).toEqual([1, 2]);
    expect(d.predictedAlt).toBe(1);
    expect(d.lookaheadDepth).toBeLessThanOrEqual(2); // stops at $, no runaway lookahead
    expect(d.trace!.length).toBeLessThan(10);
    expect(sim.ambiguities).toBe(1);
  });

  it('long inputs: deep right recursion and long lookahead are not cut by limits', () => {
    const a = parse('S -> a S | ε', Array(300).fill('a'));
    expect(a.sim.outcome).toBe('accepted');
    const w = [...Array(250).fill('a'), 'b', 'y'];
    const b = parse('S -> A x | B y\nA -> a A | b\nB -> a B | b', w);
    expect(b.sim.outcome).toBe('accepted');
    expect(b.sim.maxLookaheadDepth).toBeGreaterThanOrEqual(252);
    const expr = Array.from({ length: 401 }, (_, i) => (i % 2 ? '+' : 'id'));
    expect(parse('E -> T Q\nQ -> "+" T Q | ε\nT -> id', expr).sim.outcome).toBe('accepted');
  });

  it('no viable alternative is a syntax error, not an ambiguity', () => {
    const { sim } = parse('S -> a b | a c', ['a', 'd']);
    expect(sim.outcome).toBe('rejected');
    const last = sim.steps[sim.steps.length - 1];
    expect(last.action).toContain('No viable alternative');
    expect(last.actionCz).toContain('Žádná životaschopná alternativa');
    expect(sim.steps.some(s => s.decisionEvent?.isAmbiguous)).toBe(false);
  });
});

describe('ALL(*) applicability', () => {
  it('refuses immediate, indirect and hidden left recursion as not applicable', () => {
    for (const text of ['E -> E "+" T | T\nT -> id', 'S -> A a | b\nA -> S c | d', 'S -> A S a | b\nA -> ε | c']) {
      const g = G(text);
      const sim = simulateALLParse([...g.terminals].slice(0, 2), g, buildATN(g));
      expect(sim.outcome).toBe('notApplicable');
      expect(sim.accepted).toBe(false);
      expect(sim.steps[0].action).toContain('not applicable');
      expect(sim.steps[0].actionCz).toContain('nelze použít');
    }
  });

  it('handles useless symbols and non-terminals without productions', () => {
    expect(parse('S -> a | B\nB -> b B', ['a']).sim.outcome).toBe('accepted');
    expect(parse('S -> a | B\nB -> b B', ['b']).sim.outcome).toBe('rejected');
  });
});

describe('ALL(*) trace and DFA', () => {
  const text = 'S -> A x | B y\nA -> a A | b\nB -> a B | b';

  it('lookahead steps describe real moves: no fake $ scans, lookahead grows by one', () => {
    const { sim } = parse(text, ['a', 'b', 'y'], true);
    const scans = sim.steps.filter(s => s.subStepType === 'lookahead_scan' || s.subStepType === 'decision_start');
    const firstDecision = scans.filter(s => s.activeDecisionNumber === 1);
    expect(firstDecision[0].subStepType).toBe('decision_start');
    expect(firstDecision[0].lookaheadTokens).toEqual([]);
    const tokenSteps = firstDecision.filter(s => s.activeEdge);
    expect(tokenSteps.map(s => s.lookaheadTokens)).toEqual([['a'], ['a', 'b'], ['a', 'b', 'y']]);
    for (const s of sim.steps) expect(s.action).not.toMatch(/Scanned token '\$'/);
    const d = sim.steps.find(s => s.decisionEvent?.nonTerminal === 'S')!.decisionEvent!;
    expect(d.lookaheadTokens).toEqual(['a', 'b', 'y']);
    expect(d.usedLL).toBeFalsy();
  });

  it('caches DFA edges: the second identical decision is a cache hit; states carry creation times', () => {
    const g = G(text);
    const atn = buildATN(g);
    const cache = createDfaCache(atn);
    const first = simulateALLParse(['a', 'b', 'y'], g, atn, cache);
    const second = simulateALLParse(['a', 'b', 'y'], g, atn, cache);
    const kinds = (sim: typeof first) => sim.steps.find(s => s.decisionEvent?.nonTerminal === 'S')!.decisionEvent!.trace!.map(t => t.kind);
    expect(kinds(first)).toContain('sll_move');
    expect(kinds(second)).not.toContain('sll_move');
    expect(kinds(second)).toContain('sll_cache');
    const dfa = cache.get(1)!.dfa;
    expect(dfa.states[0].createdAt).toBe(0);
    expect(dfa.states.slice(1).every(s => s.createdAt > 0)).toBe(true);
    // every step knows the DFA clock; it never decreases
    const clocks = first.steps.map(s => s.dfaClock);
    expect(clocks.every((c, i) => i === 0 || c >= clocks[i - 1])).toBe(true);
  });

  it('LL results are not cached and SLL conflict states are marked stack-sensitive', () => {
    const g = G('S -> x B | y C\nB -> A a\nC -> A b a\nA -> b | ε');
    const atn = buildATN(g);
    const cache = createDfaCache(atn);
    simulateALLParse(['y', 'b', 'a'], g, atn, cache);
    const dA = cache.get(atn.nonTerminalToDecision.get('A')!.decisionNumber)!.dfa;
    expect(dA.states.some(s => s.stackSensitive)).toBe(true);
    expect(dA.states.every(s => !(s.stackSensitive && s.isAcceptState))).toBe(true);
  });

  it('describes ATN states and configurations as dotted items with the stack (# = SLL wildcard)', () => {
    const g = G('S -> x A b | y A\nA -> a b | a');
    const atn = buildATN(g);
    const dA = atn.nonTerminalToDecision.get('A')!;
    const cache = createDfaCache(atn);
    const { dfa, stateKeyMap } = cache.get(dA.decisionNumber)!;
    const d0 = dfa.states[0].configs.map(c => describeConfig(atn, c));
    expect(d0).toContain('(A → • a b, 1, [#])');
    expect(d0).toContain('(A → • a, 2, [#])');
    expect(describeATNState(atn, atn.ruleToStopState.get('S')!)).toBe("p'S");
    const p = adaptivePredict(dA, ['x', 'a', 'b'], 1, atn, dfa, stateKeyMap, [atn.callFollowState.get('S|1|1')!]);
    expect(p.predictedAlt).toBe(2);
    expect(p.usedLL).toBe(true);
    const llStart = p.trace.find(t => t.kind === 'll_start')!;
    expect(llStart.action).toContain('S → x A • b');
    expect(dfa.states.some(s => s.edges[EOF] !== undefined)).toBe(true);
  });
});
