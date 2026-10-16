import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton, buildIELR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { computeAnalysis } from '../core/analysisJob';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { LR_PRIMARY_REFERENCES } from '../ui/views/LRView';
import { LL_PRIMARY_REFERENCES } from '../ui/views/LLView';

describe('IELR(1) Algorithm (Denny & Malloy 2008, 2010)', () => {
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
      expect(splitStates[0].ielrAnnotation).toBeDefined();
    });

    it('correctly parses valid words using the IELR(1) table', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lr1 = buildLR1Automaton(g, analysis);
      const ielr = buildIELR1Automaton(g, analysis, lr1);
      const ielrTable = buildLRTable(ielr, g, analysis);

      const sim1 = simulateLRParse(['a', 'c', 'd'], g, ielrTable);
      expect(sim1.accepted).toBe(true);

      const sim2 = simulateLRParse(['b', 'c', 'e'], g, ielrTable);
      expect(sim2.accepted).toBe(true);

      const sim3 = simulateLRParse(['a', 'c', 'e'], g, ielrTable);
      expect(sim3.accepted).toBe(true);

      const sim4 = simulateLRParse(['b', 'c', 'd'], g, ielrTable);
      expect(sim4.accepted).toBe(true);

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

      // Parses all 4 valid statement structures
      expect(simulateLRParse(['print', 'id', ';'], g, ielrTable).accepted).toBe(true);
      expect(simulateLRParse(['expr', 'id', '='], g, ielrTable).accepted).toBe(true);
      expect(simulateLRParse(['print', 'id', '='], g, ielrTable).accepted).toBe(true);
      expect(simulateLRParse(['expr', 'id', ';'], g, ielrTable).accepted).toBe(true);

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
      expect(simulateLRParse(['id', '+', 'id', '*', 'id'], g, ielrTable).accepted).toBe(true);
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

    it('provides primary literature references for LL parsing', () => {
      expect(LL_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(3);
      for (const ref of LL_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(15);
        expect(ref.authorYear.length).toBeGreaterThan(5);
        expect(ref.url).toBeDefined();
      }
    });
  });
});
