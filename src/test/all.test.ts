/**
 * Tests for ALL(*) Adaptive Top-Down Parser (Parr, Harwell, Fisher 2014)
 */

import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildATN } from '../core/all/allAtn';
import { createLookaheadDFA, adaptivePredict } from '../core/all/allPredictor';
import { checkALLCompatibility, simulateALLParse } from '../core/all/allParser';
import { ALL_PRIMARY_REFERENCES } from '../ui/views/ALLView';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { extractTreeLeaves } from './allParsersTreeYield.test';

describe('ALL(*) Parsing Algorithm (Parr, Harwell, Fisher 2014)', () => {
  describe('ATN Construction', () => {
    it('constructs ATN states and transitions from a grammar', () => {
      const g = parseGrammar(`
        S -> A "x" | B "y"
        A -> "a" A | "b"
        B -> "a" B | "b"
      `).grammar!;

      const atn = buildATN(g);
      expect(atn.states.length).toBeGreaterThan(0);
      expect(atn.decisionPoints.length).toBe(3); // S, A, and B all have 2 alternatives

      const decisionS = atn.nonTerminalToDecision.get('S');
      expect(decisionS).toBeDefined();
      expect(decisionS!.alternatives.length).toBe(2);
    });
  });

  describe('Adaptive Prediction & Lookahead DFA', () => {
    it('materializes DFA states dynamically and makes correct decisions', () => {
      const g = parseGrammar(`
        S -> A "x" | B "y"
        A -> "a" A | "b"
        B -> "a" B | "b"
      `).grammar!;

      const atn = buildATN(g);
      const decisionS = atn.nonTerminalToDecision.get('S')!;
      const { dfa, stateKeyMap } = createLookaheadDFA(decisionS, atn);

      // Input 1: a a b x -> should predict Alternative 1 (A "x")
      const tokens1 = ['a', 'a', 'b', 'x'];
      const pred1 = adaptivePredict(decisionS, tokens1, 0, atn, dfa, stateKeyMap);
      expect(pred1.predictedAlt).toBe(1);
      expect(pred1.lookaheadDepth).toBeGreaterThanOrEqual(4);

      // Input 2: a a b y -> should predict Alternative 2 (B "y")
      const tokens2 = ['a', 'a', 'b', 'y'];
      const pred2 = adaptivePredict(decisionS, tokens2, 0, atn, dfa, stateKeyMap);
      expect(pred2.predictedAlt).toBe(2);
      expect(pred2.lookaheadDepth).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Arbitrary Lookahead Language (Non-LL(k))', () => {
    const raw = `
      S -> A "x" | B "y"
      A -> "a" A | "b"
      B -> "a" B | "b"
    `;

    it('correctly parses words with arbitrary lookahead length beyond fixed k', () => {
      const g = parseGrammar(raw).grammar!;
      const atn = buildATN(g);

      // Word with prefix length 3
      const sim1 = simulateALLParse(['a', 'a', 'b', 'x'], g, atn);
      expect(sim1.accepted).toBe(true);
      expect(sim1.finalTree).toBeDefined();
      expect(extractTreeLeaves(sim1.finalTree)).toEqual(['a', 'a', 'b', 'x']);

      // Word with prefix length 5
      const sim2 = simulateALLParse(['a', 'a', 'a', 'a', 'b', 'y'], g, atn);
      expect(sim2.accepted).toBe(true);
      expect(sim2.maxLookaheadDepth).toBeGreaterThanOrEqual(6);
      expect(extractTreeLeaves(sim2.finalTree)).toEqual(['a', 'a', 'a', 'a', 'b', 'y']);

      // Invalid word rejected
      const simFail = simulateALLParse(['a', 'a', 'b', 'z'], g, atn);
      expect(simFail.accepted).toBe(false);

      // Verify that decision events include a step-by-step lookahead trace
      const decisionSteps = sim1.steps.filter(s => s.decisionEvent !== undefined);
      expect(decisionSteps.length).toBeGreaterThan(0);
      const firstDecision = decisionSteps[0].decisionEvent!;
      expect(firstDecision.trace).toBeDefined();
      expect(firstDecision.trace!.length).toBeGreaterThanOrEqual(1);
      // The trace shows viable alternatives shrinking as lookahead progresses
      expect(firstDecision.trace![0].remainingAlts.length).toBeGreaterThanOrEqual(1);
    });

    it('emits detailed lookahead DFA transitions when detailedLookaheadSteps is enabled', () => {
      const g = parseGrammar(`
        S -> A "x" | B "y"
        A -> "a" "a" "b"
        B -> "a" "a" "a" "a" "b"
      `).grammar!;

      const atn = buildATN(g);
      const macroSim = simulateALLParse(['a', 'a', 'b', 'x'], g, atn);
      const microSim = simulateALLParse(['a', 'a', 'b', 'x'], g, atn, undefined, { detailedLookaheadSteps: true });

      expect(microSim.accepted).toBe(true);
      expect(microSim.steps.length).toBeGreaterThan(macroSim.steps.length);

      const lookaheadScanSteps = microSim.steps.filter(s => s.subStepType === 'lookahead_scan');
      expect(lookaheadScanSteps.length).toBeGreaterThanOrEqual(1);
      expect(lookaheadScanSteps[0].activeDfaStateId).toBeDefined();
      expect(lookaheadScanSteps[0].activeDecisionNumber).toBeDefined();
    });
  });

  describe('Factored Arithmetic Expressions', () => {
    it('simulates top-down derivation tree construction for arithmetic expressions', () => {
      const g = parseGrammar(`
        E -> T E'
        E' -> "+" T E' | ε
        T -> F T'
        T' -> "*" F T' | ε
        F -> "(" E ")" | "id"
      `).grammar!;

      const atn = buildATN(g);
      const sim = simulateALLParse(['id', '+', 'id', '*', 'id'], g, atn);
      expect(sim.accepted).toBe(true);
      expect(sim.steps.length).toBeGreaterThan(10);
      expect(sim.finalTree).toBeDefined();
      expect(sim.finalTree!.symbol).toBe('E');
      expect(sim.finalTree!.children!.length).toBe(2);
      expect(extractTreeLeaves(sim.finalTree)).toEqual(['id', '+', 'id', '*', 'id']);
    });
  });

  describe('Compatibility & Left Recursion Checks', () => {
    it('identifies left-recursive grammars as incompatible with top-down ALL(*) closures', () => {
      const leftRecGrammar = parseGrammar(`
        E -> E "+" T | T
        T -> "id"
      `).grammar!;
      const analysis1 = analyzeGrammar(leftRecGrammar, { k2: false });
      const comp1 = checkALLCompatibility(leftRecGrammar, analysis1);
      expect(comp1.canParse).toBe(false);
      expect(comp1.hasLeftRecursion).toBe(true);
      expect(comp1.leftRecursiveRules).toContain('E');

      const nonLeftRec = parseGrammar(`
        E -> "id" E'
        E' -> "+" "id" E' | ε
      `).grammar!;
      const analysis2 = analyzeGrammar(nonLeftRec, { k2: false });
      const comp2 = checkALLCompatibility(nonLeftRec, analysis2);
      expect(comp2.canParse).toBe(true);
      expect(comp2.hasLeftRecursion).toBe(false);
    });

    it('safely handles arithmetic expression grammar with left recursion without hanging or freezing', () => {
      const exprGrammar = parseGrammar(`
        E -> E "+" T | T
        T -> T "*" F | F
        F -> "(" E ")" | "id"
      `).grammar!;

      const analysis = analyzeGrammar(exprGrammar, { k2: false });
      const comp = checkALLCompatibility(exprGrammar, analysis);
      expect(comp.canParse).toBe(false);
      expect(comp.hasLeftRecursion).toBe(true);
      expect(comp.leftRecursiveRules).toContain('E');
      expect(comp.leftRecursiveRules).toContain('T');

      const atn = buildATN(exprGrammar);
      expect(atn.states.length).toBeGreaterThan(0);

      // Verify that building DFA / closure on left-recursive grammar does not freeze
      for (const dp of atn.decisionPoints) {
        const { dfa } = createLookaheadDFA(dp, atn);
        expect(dfa.states.length).toBeGreaterThan(0);
      }

      // Verify simulation halts with clean diagnostic step rather than throwing or looping
      const sim = simulateALLParse(['id', '+', 'id'], exprGrammar, atn);
      expect(sim.accepted).toBe(false);
      expect(sim.steps.length).toBeGreaterThan(0);
      expect(sim.steps[0].action).toContain('left-recursive');
    });
  });

  describe('Primary Literature References', () => {
    it('provides primary literature citations for ALL(*)', () => {
      expect(ALL_PRIMARY_REFERENCES.length).toBeGreaterThanOrEqual(2);
      for (const ref of ALL_PRIMARY_REFERENCES) {
        expect(ref.citation.length).toBeGreaterThan(20);
        expect(ref.authorYear).toBeDefined();
        expect(ref.url).toContain('doi.org');
      }
    });
  });
});
