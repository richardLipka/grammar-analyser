/**
 * Tests for Generalized LR (GLR) Parser with Graph-Structured Stack (Tomita 1985, Scott & Johnstone 2006)
 */

import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLR0Automaton, buildSLR1Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateGLRParse } from '../core/lr/glrParser';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { extractTreeLeaves } from './allParsersTreeYield.test';

describe('Generalized LR (GLR) Parser & GSS Simulation', () => {
  describe('Unambiguous Grammars (Consistency with Standard LR)', () => {
    it('successfully parses arithmetic expressions with single parse tree', () => {
      const g = parseGrammar(`
        E -> E "+" T | T
        T -> T "*" F | F
        F -> "(" E ")" | "id"
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lr1 = buildLR1Automaton(g, analysis);
      const table = buildLRTable(lr1, g, analysis);

      const tokens = ['id', '+', 'id', '*', 'id'];
      const res = simulateGLRParse(tokens, g, table, 'dragon');

      expect(res.accepted).toBe(true);
      expect(res.totalTrees).toBe(1);
      expect(res.trees.length).toBe(1);
      expect(res.trees[0].symbol).toBe('E');
      expect(res.steps.length).toBeGreaterThan(5);
      expect(extractTreeLeaves(res.trees[0])).toEqual(tokens);
    });
  });

  describe('Ambiguous Grammars & Local Ambiguity Resolution', () => {
    it('parses classic Dangling-Else ambiguity and finds BOTH parse trees', () => {
      const g = parseGrammar(`
        S -> "if" "c" "then" S "else" S
           | "if" "c" "then" S
           | "other"
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      // LALR(1) has a shift/reduce conflict on 'else'
      const lalr = buildLALR1Automaton(g, analysis);
      const table = buildLRTable(lalr, g, analysis, { usePrecedence: false });

      expect(table.conflicts.length).toBeGreaterThan(0);

      // 'if c then if c then other else other' can bind else to inner or outer if
      const tokens = ['if', 'c', 'then', 'if', 'c', 'then', 'other', 'else', 'other'];
      const res = simulateGLRParse(tokens, g, table, 'dragon');

      expect(res.accepted).toBe(true);
      expect(res.totalTrees).toBe(2);
      expect(res.trees.length).toBe(2);
      expect(res.conflictsEncountered).toBeGreaterThan(0);
      expect(res.maxSimultaneousHeads).toBeGreaterThan(1);
      for (const t of res.trees) {
        expect(extractTreeLeaves(t)).toEqual(tokens);
      }
    });

    it('parses unprioritized ambiguous arithmetic expressions and finds 2 trees for "id + id * id"', () => {
      const g = parseGrammar(`
        E -> E "+" E | E "*" E | "id"
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const slr = buildSLR1Automaton(g, analysis);
      const table = buildLRTable(slr, g, analysis, { usePrecedence: false });

      expect(table.conflicts.length).toBeGreaterThan(0);

      const tokens = ['id', '+', 'id', '*', 'id'];
      const res = simulateGLRParse(tokens, g, table, 'dragon');

      expect(res.accepted).toBe(true);
      // Both (id + id) * id and id + (id * id) are valid derivations
      expect(res.totalTrees).toBe(2);
      expect(res.trees.length).toBe(2);
      for (const t of res.trees) {
        expect(extractTreeLeaves(t)).toEqual(tokens);
      }
    });
  });

  describe('Handling Non-LALR Grammars via Branching & Merging', () => {
    it('parses Dragon Book separating grammar with Reduce/Reduce conflict on LALR(1)', () => {
      const g = parseGrammar(`
        S -> "a" A "d" | "b" B "d" | "a" B "e" | "b" A "e"
        A -> "c"
        B -> "c"
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lalr = buildLALR1Automaton(g, analysis);
      const table = buildLRTable(lalr, g, analysis);

      // table has R/R conflict on 'c' when merging A and B
      expect(table.conflicts.some(c => c.type === 'Reduce/Reduce')).toBe(true);

      // Parse 'a c d'
      const res1 = simulateGLRParse(['a', 'c', 'd'], g, table, 'dragon');
      expect(res1.accepted).toBe(true);
      expect(res1.totalTrees).toBe(1);
      expect(extractTreeLeaves(res1.trees[0])).toEqual(['a', 'c', 'd']);

      // Parse 'b c d'
      const res2 = simulateGLRParse(['b', 'c', 'd'], g, table, 'dragon');
      expect(res2.accepted).toBe(true);
      expect(res2.totalTrees).toBe(1);
      expect(extractTreeLeaves(res2.trees[0])).toEqual(['b', 'c', 'd']);
    });
  });

  describe('Non-deterministic Palindromes', () => {
    it('parses non-deterministic palindromes where center is unknown', () => {
      const g = parseGrammar(`
        S -> "a" S "a" | "b" S "b" | "a" | "b" | ε
      `).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const slr = buildSLR1Automaton(g, analysis);
      const table = buildLRTable(slr, g, analysis);

      // Palindrome 'a b b a'
      const tokens = ['a', 'b', 'b', 'a'];
      const res = simulateGLRParse(tokens, g, table, 'dragon');
      expect(res.accepted).toBe(true);
      expect(res.totalTrees).toBeGreaterThanOrEqual(1);
      for (const t of res.trees) {
        expect(extractTreeLeaves(t)).toEqual(tokens);
      }
    });
  });

  describe('Verification across Curated Presets', () => {
    it('executes GLR simulation across preset grammars without crashing', () => {
      for (const preset of PRESET_GRAMMARS.slice(0, 8)) {
        const parsed = parseGrammar(preset.grammarText);
        if (!parsed.grammar) continue;
        const g = parsed.grammar;
        const analysis = analyzeGrammar(g, { k2: false });
        const auto = buildSLR1Automaton(g, analysis);
        const table = buildLRTable(auto, g, analysis);

        const sampleWords = preset.sampleInput ? preset.sampleInput.split(/\s+/).filter(Boolean) : [];
        if (sampleWords.length > 0 && sampleWords.length <= 10) {
          const res = simulateGLRParse(sampleWords, g, table, 'dragon');
          expect(res.steps).toBeDefined();
          expect(res.steps.length).toBeGreaterThan(0);
          if (res.accepted) {
            for (const t of res.trees) {
              expect(extractTreeLeaves(t)).toEqual(sampleWords);
            }
          }
        }
      }
    });
  });
});
