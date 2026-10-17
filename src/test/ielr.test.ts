import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton, buildIELR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { ielrSplitGroups, constructionSteps, constructedSoFar } from '../core/lr/lrConstruction';
import { computeAnalysis } from '../core/analysisJob';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { LR_PRIMARY_REFERENCES, LR_TECHNIQUE_REFERENCES } from '../ui/views/LRView';
import { LL_PRIMARY_REFERENCES } from '../ui/views/LLView';
import { LR_GRAPH_PRIMARY_REFERENCES } from '../ui/views/AutomatonGraphView';
import { FIRST_FOLLOW_PRIMARY_REFERENCES } from '../ui/views/FirstFollowView';
import { MEMBERSHIP_PRIMARY_REFERENCES } from '../ui/views/MembershipView';
import { RECURSIVE_DESCENT_PRIMARY_REFERENCES } from '../ui/views/RecursiveDescentView';
import { REFERENCES, TRANSFORMATION_INFO } from '../core/processor/transformationInfo';
import { extractTreeLeaves } from './allParsersTreeYield.test';

describe('IELR(1) (Denny & Malloy 2010), computed by merging LR(1) states', () => {
  describe('Preset 1: Symmetric Separating Grammar (Classic Aho & Ullman / Dragon Book)', () => {
    const raw = `
      S -> "a" A "d" | "b" B "d" | "a" B "e" | "b" A "e"
      A -> "c"
      B -> "c"
    `;

    it('demonstrates that the grammar is NOT LALR(1), but IS IELR(1) and LR(1)', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });

      // LALR(1) has Reduce/Reduce conflicts
      const lalr = buildLALR1Automaton(g, analysis);
      const lalrTable = buildLRTable(lalr, g, analysis);
      expect(lalrTable.conflicts.length).toBeGreaterThan(0);
      expect(lalrTable.conflicts.some(c => c.type === 'Reduce/Reduce')).toBe(true);

      // LR(1) is conflict-free, but has 14 states
      const lr1 = buildLR1Automaton(g, analysis);
      const lr1Table = buildLRTable(lr1, g, analysis);
      expect(lr1Table.conflicts.length).toBe(0);
      expect(lr1.states.length).toBe(14);

      // IELR(1) eliminates spurious conflicts
      const ielr = buildIELR1Automaton(g, analysis, lr1);
      const ielrTable = buildLRTable(ielr, g, analysis);
      expect(ielrTable.conflicts.length).toBe(0);
      expect(ielrTable.isConflictFree).toBe(true);
      expect(ielr.states.length).toBe(14);

      // Verify that split state is identified and annotated
      const splitStates = ielr.states.filter(s => s.isSplit);
      expect(splitStates.length).toBeGreaterThan(0);
      expect(splitStates[0].splitReasons?.length).toBeGreaterThan(0);
      expect(splitStates[0].splitReasons![0]).toMatchObject({ kind: 'conflict' });
    });

    it('correctly parses valid words using the IELR(1) table', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lr1 = buildLR1Automaton(g, analysis);
      const ielr = buildIELR1Automaton(g, analysis, lr1);
      const ielrTable = buildLRTable(ielr, g, analysis);

      const sim1 = simulateLRParse(['a', 'c', 'd'], g, ielrTable);
      expect(sim1.accepted).toBe(true);
      expect(extractTreeLeaves(sim1.finalTree)).toEqual(['a', 'c', 'd']);

      const sim2 = simulateLRParse(['b', 'c', 'e'], g, ielrTable);
      expect(sim2.accepted).toBe(true);
      expect(extractTreeLeaves(sim2.finalTree)).toEqual(['b', 'c', 'e']);

      const sim3 = simulateLRParse(['a', 'c', 'e'], g, ielrTable);
      expect(sim3.accepted).toBe(true);
      expect(extractTreeLeaves(sim3.finalTree)).toEqual(['a', 'c', 'e']);

      const sim4 = simulateLRParse(['b', 'c', 'd'], g, ielrTable);
      expect(sim4.accepted).toBe(true);
      expect(extractTreeLeaves(sim4.finalTree)).toEqual(['b', 'c', 'd']);

      // Invalid input should be rejected
      const simFail = simulateLRParse(['a', 'c', 'x'], g, ielrTable);
      expect(simFail.accepted).toBe(false);
    });
  });

  describe('Preset 2: Print vs Expression Statements (Realistic Compiler Grammar)', () => {
    const raw = `
      S -> "print" E ";" | "expr" E "=" | "print" F "=" | "expr" F ";"
      E -> "id"
      F -> "id"
    `;

    it('demonstrates that the grammar is NOT LALR(1), but IS IELR(1) and LR(1)', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });

      // LALR(1) has Reduce/Reduce conflicts on ";" and "="
      const lalr = buildLALR1Automaton(g, analysis);
      const lalrTable = buildLRTable(lalr, g, analysis);
      expect(lalrTable.conflicts.length).toBeGreaterThan(0);
      expect(lalrTable.conflicts.some(c => c.type === 'Reduce/Reduce' && c.symbol === ';')).toBe(true);
      expect(lalrTable.conflicts.some(c => c.type === 'Reduce/Reduce' && c.symbol === '=')).toBe(true);

      // LR(1) is conflict-free
      const lr1 = buildLR1Automaton(g, analysis);
      const lr1Table = buildLRTable(lr1, g, analysis);
      expect(lr1Table.conflicts.length).toBe(0);

      // IELR(1) eliminates the spurious conflicts
      const ielr = buildIELR1Automaton(g, analysis, lr1);
      const ielrTable = buildLRTable(ielr, g, analysis);
      expect(ielrTable.conflicts.length).toBe(0);
      expect(ielrTable.isConflictFree).toBe(true);

      // Verify that ielrSplitGroups groups identical LR(0) cores and detects the split
      const groups = ielrSplitGroups(ielr, lr1, lalr, lalrTable, lr1Table, ielrTable);
      const splitGroup = groups.find(grp => grp.isSplit);
      expect(splitGroup).toBeDefined();
      expect(splitGroup!.ielrStates.length).toBe(2);
      expect(splitGroup!.mergeConflicts.map(c => c.symbol).sort()).toEqual([';', '=']);
      expect(splitGroup!.remainingConflicts).toEqual([]);
      expect(splitGroup!.reasons[0]).toMatchObject({ kind: 'conflict' });

      // Parses all 4 valid statement structures
      const w1 = ['print', 'id', ';'];
      const r1 = simulateLRParse(w1, g, ielrTable);
      expect(r1.accepted).toBe(true);
      expect(extractTreeLeaves(r1.finalTree)).toEqual(w1);

      const w2 = ['expr', 'id', '='];
      const r2 = simulateLRParse(w2, g, ielrTable);
      expect(r2.accepted).toBe(true);
      expect(extractTreeLeaves(r2.finalTree)).toEqual(w2);

      const w3 = ['print', 'id', '='];
      const r3 = simulateLRParse(w3, g, ielrTable);
      expect(r3.accepted).toBe(true);
      expect(extractTreeLeaves(r3.finalTree)).toEqual(w3);

      const w4 = ['expr', 'id', ';'];
      const r4 = simulateLRParse(w4, g, ielrTable);
      expect(r4.accepted).toBe(true);
      expect(extractTreeLeaves(r4.finalTree)).toEqual(w4);

      // Rejects invalid strings
      expect(simulateLRParse(['print', 'id'], g, ielrTable).accepted).toBe(false);
      expect(simulateLRParse(['expr', 'id'], g, ielrTable).accepted).toBe(false);
    });
  });

  describe('LALR(1) Grammars (Arithmetic Expressions)', () => {
    it('produces the exact same number of states as LALR(1) when no spurious conflicts exist', () => {
      const g = parseGrammar(`
        E -> E "+" T | T
        T -> T "*" F | F
        F -> "(" E ")" | "id"
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lalr = buildLALR1Automaton(g, analysis);
      const lr1 = buildLR1Automaton(g, analysis);
      const ielr = buildIELR1Automaton(g, analysis, lr1);

      expect(ielr.states.length).toBe(lalr.states.length);
      const ielrTable = buildLRTable(ielr, g, analysis);
      expect(ielrTable.isConflictFree).toBe(true);
      const arithTokens = ['id', '+', 'id', '*', 'id'];
      const arithRes = simulateLRParse(arithTokens, g, ielrTable);
      expect(arithRes.accepted).toBe(true);
      expect(extractTreeLeaves(arithRes.finalTree)).toEqual(arithTokens);
    });
  });

  describe('Full Analysis Job Integration', () => {
    it('populates ielr1Automaton and ielr1Table in computeAnalysis', () => {
      const preset = PRESET_GRAMMARS.find(p => p.id === 'print_vs_expr_ielr')!;
      expect(preset).toBeDefined();
      const g = parseGrammar(preset.grammarText).grammar!;
      const data = computeAnalysis(g)!;
      expect(data).toBeDefined();
      expect(data.ielr1Automaton).toBeDefined();
      expect(data.ielr1Table).toBeDefined();
      expect(data.ielr1Table!.isConflictFree).toBe(true);
      expect(data.lalr1Table.isConflictFree).toBe(false);

      // Verify that lookaheads are populated for all states and items
      const ielr = data.ielr1Automaton!;
      for (const s of ielr.states) {
        expect(s.items1).toBeDefined();
        expect(s.items1!.length).toBeGreaterThan(0);
        // Verify stateDisplayItems with withLookaheads = true
        const displayItems = s.items0.map(it0 => ({
          production: it0.production,
          dotIndex: it0.dotIndex,
          lookaheads: s.items1?.filter(it1 => it1.production.id === it0.production.id && it1.dotIndex === it0.dotIndex).map(i => i.lookahead)
        }));
        expect(displayItems.some(it => it.lookaheads && it.lookaheads.length > 0)).toBe(true);
      }
    });
  });

  describe('Behaviour of canonical LR(1) (regressions)', () => {
    const build = (text: string) => {
      const g = parseGrammar(text).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lalr = buildLALR1Automaton(g, analysis);
      const lr1 = buildLR1Automaton(g, analysis);
      const ielr = buildIELR1Automaton(g, analysis, lr1);
      return {
        g, lalr, lr1, ielr,
        lalrTable: buildLRTable(lalr, g, analysis),
        lr1Table: buildLRTable(lr1, g, analysis),
        ielrTable: buildLRTable(ielr, g, analysis)
      };
    };

    it('splits a state when precedence would resolve the merged conflict differently (%left c, S → c S c | c)', () => {
      const { g, lalr, lr1, ielr, lalrTable, lr1Table, ielrTable } = build('%left c\nS -> c S c | c');
      // In LR(1) the state after the first c only shifts c, the nested one reduces (%left); LALR(1) merges them
      expect(simulateLRParse(['c', 'c', 'c'], g, lr1Table).accepted).toBe(true);
      expect(simulateLRParse(['c', 'c', 'c'], g, lalrTable).accepted).toBe(false);
      expect(simulateLRParse(['c', 'c', 'c'], g, ielrTable).accepted).toBe(true);
      expect(lalr.states.length).toBeLessThan(ielr.states.length);
      expect(ielr.states.length).toBeLessThan(lr1.states.length);
      const split = ielr.states.find(s => s.isSplit)!;
      expect(split.splitReasons![0]).toMatchObject({ kind: 'conflict', symbol: 'c' });
    });

    it('does not spread a conflict of one LR(1) state into the contexts of another (S → aAd | aBd | bAf | bBd)', () => {
      const { g, ielr, lr1Table, ielrTable } = build('S -> a A d | a B d | b A f | b B d\nA -> c\nB -> c');
      // LR(1) has the reduce-reduce conflict on d only after "a c"
      expect(lr1Table.conflicts.length).toBe(1);
      expect(ielrTable.conflicts.length).toBe(1);
      const conflictState = ielr.states[ielrTable.conflicts[0].stateId];
      expect(conflictState.mergedFrom!.map(id => lr1Table.conflicts.some(c => c.stateId === id))).toEqual([true]);
      // "b c d" is in the language; the merged state would take the first action (A → c) and reject it
      expect(simulateLRParse(['b', 'c', 'd'], g, ielrTable).accepted).toBe(true);
    });

    it('lets a state without an action on the conflict symbol join a part (no needless extra state)', () => {
      const { lalr, lr1, ielr, ielrTable } = build('S -> a A t | a B u | b A u | b B t | x A v | x B w\nA -> c\nB -> c');
      expect(ielrTable.isConflictFree).toBe(true);
      expect(lalr.states.length).toBe(18);
      expect(lr1.states.length).toBe(20);
      expect(ielr.states.length).toBe(19);
    });

    it('splits a predecessor because of its split successor and says so', () => {
      const { lalr, lr1, ielr, lalrTable, lr1Table, ielrTable } = build('S -> a A d | b B d | a B f | b A f\nA -> c x\nB -> c x');
      const groups = ielrSplitGroups(ielr, lr1, lalr, lalrTable, lr1Table, ielrTable).filter(gr => gr.isSplit);
      expect(groups.length).toBe(2);
      const byReason = (kind: string) => groups.find(gr => gr.reasons.every(r => r.kind === kind))!;
      // after "c": no conflict, split only because the states after "c x" are split
      expect(byReason('successor').reasons).toEqual([{ kind: 'successor', symbol: 'x' }]);
      expect(byReason('successor').mergeConflicts).toEqual([]);
      expect(byReason('conflict').mergeConflicts.map(c => c.symbol).sort()).toEqual(['d', 'f']);
    });

    it('lists only conflicts caused by merging as avoided, genuine ones as remaining', () => {
      const { lalr, lr1, ielr, lalrTable, lr1Table, ielrTable } = build('S -> a A d | a B d | b A g | b B d | x A d | x B g\nA -> c\nB -> c');
      const group = ielrSplitGroups(ielr, lr1, lalr, lalrTable, lr1Table, ielrTable).find(gr => gr.isSplit)!;
      expect(group.mergeConflicts.map(c => c.symbol)).toEqual(['g']);
      expect(group.remainingConflicts.map(c => c.symbol)).toEqual(['d']);
    });

    it('resolves the conflicts left like Bison (shift before reduce, earlier rule): ambiguous grammars keep the states of LALR(1)', () => {
      for (const id of ['dangling_else', 'palindromes', 'earley_equal_ab']) {
        const preset = PRESET_GRAMMARS.find(p => p.id === id)!;
        const { lalr, lr1, ielr, lalrTable, lr1Table, ielrTable } = build(preset.grammarText);
        expect(ielr.states.length, id).toBe(lalr.states.length);
        expect(ielr.states.length, id).toBeLessThan(lr1.states.length);
        if (id === 'dangling_else') {
          // the merged state has the shift/reduce conflict on "else" that only one of its LR(1) states has;
          // that one resolves it by shifting, the other one only shifts
          const remaining = ielrSplitGroups(ielr, lr1, lalr, lalrTable, lr1Table, ielrTable).flatMap(gr => gr.remainingConflicts);
          const merged = remaining.find(c => c.lr1WithoutConflict.length > 0)!;
          expect(merged).toBeDefined();
          expect(merged.actions.some(a => a.type === 'shift')).toBe(true);
          for (const s of merged.lr1WithoutConflict) {
            expect(lr1Table.actionTable.get(s)!.get(merged.symbol)!.map(a => a.type)).toEqual(['shift']);
          }
        }
      }
    });

    it('numbers the states in construction order, so the step-by-step construction is valid', () => {
      for (const id of ['lalr1_vs_lr1', 'print_vs_expr_ielr', 'dangling_else', 'palindromes']) {
        const preset = PRESET_GRAMMARS.find(p => p.id === id)!;
        const g = parseGrammar(preset.grammarText).grammar!;
        const ielr = buildIELR1Automaton(g, analyzeGrammar(g, { k2: false }));
        const steps = constructionSteps(ielr);
        expect(steps.filter(st => st.kind === 'goto' && st.isNew).length, id).toBe(ielr.states.length - 1);
        expect(constructedSoFar(steps, steps.length - 1).states, id).toBe(ielr.states.length);
        // every transition goes to a state created before or by this step
        let created = 1;
        for (const st of steps) {
          if (st.kind !== 'goto') continue;
          if (st.isNew) created++;
          expect(st.to, id).toBeLessThan(created);
        }
      }
    });

    it('has the numbering of LALR(1) when no core is split', () => {
      const g = parseGrammar('E -> E "+" T | T\nT -> T "*" F | F\nF -> "(" E ")" | "id"').grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lalr = buildLALR1Automaton(g, analysis);
      const ielr = buildIELR1Automaton(g, analysis);
      expect(ielr.states.map(s => [...s.transitions])).toEqual(lalr.states.map(s => [...s.transitions]));
      expect(ielr.stateNames).toEqual(lalr.stateNames);
    });
  });

  describe('Primary Literature References', () => {
    it('provides primary literature references for all LR variants', () => {
      for (const variant of ['LR(0)', 'SLR(1)', 'LALR(1)', 'IELR(1)', 'LR(1)'] as const) {
        const ref = LR_PRIMARY_REFERENCES[variant];
        expect(ref, `Missing reference for ${variant}`).toBeDefined();
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for LR algorithms and techniques', () => {
      expect(LR_TECHNIQUE_REFERENCES.length).toBeGreaterThanOrEqual(6);
      for (const ref of LR_TECHNIQUE_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
        expect(ref.topicEn).toBeDefined();
        expect(ref.topicCz).toBeDefined();
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for LR automata graphs', () => {
      expect(LR_GRAPH_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(4);
      for (const ref of LR_GRAPH_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for LL parsing', () => {
      expect(LL_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(3);
      for (const ref of LL_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for FIRST and FOLLOW sets', () => {
      expect(FIRST_FOLLOW_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(2);
      for (const ref of FIRST_FOLLOW_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for general CFG parsing and CYK', () => {
      expect(MEMBERSHIP_PRIMARY_REFERENCES.general.length).toBeGreaterThanOrEqual(1);
      expect(MEMBERSHIP_PRIMARY_REFERENCES.cyk.length).toBeGreaterThanOrEqual(3);
      for (const ref of [...MEMBERSHIP_PRIMARY_REFERENCES.general, ...MEMBERSHIP_PRIMARY_REFERENCES.cyk]) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.url).toBeDefined();
      }
    });

    it('provides primary literature references for recursive descent', () => {
      expect(RECURSIVE_DESCENT_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(3);
      for (const ref of RECURSIVE_DESCENT_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
      }
    });

    it('provides primary literature references for grammar transformations', () => {
      expect(REFERENCES.barhillel61).toBeDefined();
      expect(REFERENCES.chomsky59).toBeDefined();
      expect(REFERENCES.greibach65).toBeDefined();
      expect(REFERENCES.foster68).toBeDefined();
      expect(REFERENCES.denny10).toBeDefined();
      expect(REFERENCES.floyd63).toBeDefined();
      expect(TRANSFORMATION_INFO.reduce.refs.some(r => r.ref === 'barhillel61')).toBe(true);
      expect(TRANSFORMATION_INFO.eps.refs.some(r => r.ref === 'chomsky59')).toBe(true);
      expect(TRANSFORMATION_INFO.units.refs.some(r => r.ref === 'barhillel61')).toBe(true);
      expect(TRANSFORMATION_INFO.factor.refs.some(r => r.ref === 'foster68')).toBe(true);
    });
  });
});
