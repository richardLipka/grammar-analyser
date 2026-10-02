/**
 * Step-by-step construction of the LR automata and the LR(1) -> LALR(1) merges.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
import { attachMergedLR1States, buildLALR1Automaton, buildLR0Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { constructionSteps, constructedSoFar, mergeSteps, movedItems } from '../core/lr/lrConstruction';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

describe('Construction step by step', () => {
  it('replays the creation order of the states (new states get the next number)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = parse(randomGrammarText(seed));
      const a = analyzeGrammar(g);
      for (const aut of [buildLR0Automaton(g), buildLR1Automaton(g, a)]) {
        const steps = constructionSteps(aut);
        const transitions = aut.states.reduce((n, s) => n + s.transitions.size, 0);
        expect(steps.length).toBe(1 + transitions);
        expect(steps.filter(s => s.kind === 'goto' && s.isNew).length).toBe(aut.states.length - 1);
        // a state is used as a source only after it was created
        let created = 1;
        for (const st of steps) {
          if (st.kind !== 'goto') continue;
          expect(st.from).toBeLessThan(created);
          if (st.isNew) {
            expect(st.to).toBe(created);
            created++;
          } else {
            expect(st.to).toBeLessThan(created);
          }
          expect(movedItems(aut.states[st.from], st.symbol).length).toBeGreaterThan(0);
        }
        const end = constructedSoFar(steps, steps.length - 1);
        expect(end.states).toBe(aut.states.length);
        expect(end.edges.size).toBe(transitions);
        expect(constructedSoFar(steps, 0)).toEqual({ states: 1, edges: new Set() });
      }
    }
  });
});

describe('Merging LR(1) states into LALR(1) states', () => {
  const merged = (text: string) => {
    const g = parse(text);
    const a = analyzeGrammar(g);
    const lr1 = buildLR1Automaton(g, a);
    const lalr = buildLALR1Automaton(g, a);
    attachMergedLR1States(lalr, lr1);
    return mergeSteps(lalr, lr1, buildLRTable(lalr, g, a), buildLRTable(lr1, g, a));
  };

  it('finds the merge that creates a reduce/reduce conflict', () => {
    // (a bare e would be read as ε, the KIV/FJP notation, so the second terminal is f)
    const m = merged('S -> a A d | b B d | a B f | b A f\nA -> c\nB -> c');
    expect(m.length).toBe(1);
    expect(m[0].lr1States.length).toBe(2);
    expect(m[0].newConflicts.map(c => c.symbol).sort()).toEqual(['d', 'f']);
    // A → c • has d in one LR(1) state and f in the other, both in the union
    const rowA = m[0].rows.find(r => r.item.production.lhs === 'A')!;
    expect(rowA.perState.map(x => x.join(''))).toEqual(expect.arrayContaining(['d', 'f']));
    expect(rowA.union).toEqual(['d', 'f']);
  });

  it('merges without a new conflict for an LALR(1) grammar', () => {
    const m = merged('S -> L = R | R\nL -> * R | id\nR -> L');
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.newConflicts.length === 0)).toBe(true);
    for (const x of m) for (const r of x.rows) expect(r.union).toEqual([...new Set(r.perState.flat())].sort());
  });
});
