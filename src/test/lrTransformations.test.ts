import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import {
  disambiguateDanglingElse,
  stratifyPrecedence,
  splitNonTerminalLRContext,
  convertLeftLinearToRightLinear,
  attemptResolveLRConflicts
} from '../core/processor/grammarProcessor';
import { compareLanguages } from '../core/analyser/equivalence';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';

describe('Category A LR Transformations & Equivalence', () => {
  describe('Dangling-Else Disambiguation (Aho & Ullman 1972)', () => {
    const raw = `
      S -> "if" "c" "then" S "else" S
        | "if" "c" "then" S
        | "other"
    `;

    it('preserves the language equivalence up to length 8', () => {
      const g = parseGrammar(raw).grammar!;
      const res = disambiguateDanglingElse(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 8);
      expect(comp.kind).toBe('same-up-to');
    });

    it('resolves LR conflict by stratifying into Matched and Open conditionals', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const origTable = buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, analysis);
      expect(origTable.conflicts.length).toBeGreaterThan(0);

      const res = disambiguateDanglingElse(g);
      const resAnalysis = analyzeGrammar(res.transformedGrammar, { k2: false });
      const resTable = buildLRTable(buildLR0Automaton(res.transformedGrammar, 'SLR(1)'), res.transformedGrammar, resAnalysis);
      // SLR(1) conflicts should now be eliminated
      expect(resTable.conflicts.length).toBe(0);
    });

    it('handles realistic multi-production forms including separate if_stmt non-terminal', () => {
      const complexRaw = `
        stmt -> if_stmt | "other"
        if_stmt -> "if" "c" "then" stmt "else" stmt | "if" "c" "then" stmt
      `;
      const g = parseGrammar(complexRaw).grammar!;
      const res = disambiguateDanglingElse(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 8);
      expect(comp.kind).toBe('same-up-to');
      const analysis = analyzeGrammar(res.transformedGrammar, { k2: false });
      const resTable = buildLRTable(buildLR0Automaton(res.transformedGrammar, 'SLR(1)'), res.transformedGrammar, resAnalysis(res));
      expect(resTable.conflicts.length).toBe(0);

      function resAnalysis(r: any) {
        return analyzeGrammar(r.transformedGrammar, { k2: false });
      }
    });

    it('handles C-style parenthesized if conditionals', () => {
      const cStyle = `
        stmt -> "if" "(" "c" ")" stmt "else" stmt | "if" "(" "c" ")" stmt | "other"
      `;
      const g = parseGrammar(cStyle).grammar!;
      const res = disambiguateDanglingElse(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 8);
      expect(comp.kind).toBe('same-up-to');
    });
  });

  describe('Precedence Stratification (Floyd 1963)', () => {
    const raw = `
      E -> E "+" E
        | E "*" E
        | "(" E ")"
        | "id"
    `;

    it('preserves the language equivalence up to length 6', () => {
      const g = parseGrammar(raw).grammar!;
      const res = stratifyPrecedence(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 6);
      expect(comp.kind).toBe('same-up-to');
    });

    it('resolves operator ambiguity and creates stratified levels', () => {
      const g = parseGrammar(raw).grammar!;
      const res = stratifyPrecedence(g);
      const nonTerminals = Array.from(res.transformedGrammar.nonTerminals);
      expect(nonTerminals.length).toBeGreaterThan(1);

      const analysis = analyzeGrammar(res.transformedGrammar, { k2: false });
      const table = buildLRTable(buildLR0Automaton(res.transformedGrammar, 'SLR(1)'), res.transformedGrammar, analysis);
      expect(table.conflicts.length).toBe(0);
    });
  });

  describe('Context Splitting for LR/LALR (Mickunas et al. 1976)', () => {
    const raw = `
      S -> "a" A "d"
        | "b" B "d"
        | "a" B "e"
        | "b" A "e"
      A -> "c"
      B -> "c"
    `;

    it('preserves the language equivalence up to length 6', () => {
      const g = parseGrammar(raw).grammar!;
      const res = splitNonTerminalLRContext(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 6);
      expect(comp.kind).toBe('same-up-to');
    });

    it('eliminates Reduce/Reduce conflict in LALR(1)', () => {
      const g = parseGrammar(raw).grammar!;
      const analysis = analyzeGrammar(g, { k2: false });
      const lalr = buildLALR1Automaton(g, analysis);
      const origTable = buildLRTable(lalr, g, analysis);
      expect(origTable.conflicts.some(c => c.type === 'Reduce/Reduce')).toBe(true);

      const res = splitNonTerminalLRContext(g);
      const resAnalysis = analyzeGrammar(res.transformedGrammar, { k2: false });
      const resLalr = buildLALR1Automaton(res.transformedGrammar, resAnalysis);
      const resTable = buildLRTable(resLalr, res.transformedGrammar, resAnalysis);
      expect(resTable.conflicts.length).toBe(0);
    });
  });

  describe('Left-Linear to Right-Linear Conversion (Chomsky & Miller 1958)', () => {
    const raw = `
      S -> A "b"
      A -> A "a" | "a"
    `;

    it('preserves the language equivalence up to length 8', () => {
      const g = parseGrammar(raw).grammar!;
      const res = convertLeftLinearToRightLinear(g);
      expect(res.steps.length).toBeGreaterThan(0);
      const comp = compareLanguages(g, res.transformedGrammar, 8);
      expect(comp.kind).toBe('same-up-to');
    });

    it('eliminates left recursion so right-linear grammar has no left-linear rules', () => {
      const g = parseGrammar(raw).grammar!;
      const res = convertLeftLinearToRightLinear(g);
      const hasLeftRec = res.transformedGrammar.productions.some(
        p => p.rhs.length > 0 && res.transformedGrammar.nonTerminals.has(p.rhs[0])
      );
      expect(hasLeftRec).toBe(false);
    });
  });

  describe('Unified Automatic LR Conflict Resolution (attemptResolveLRConflicts)', () => {
    it('automatically resolves dangling else', () => {
      const g = parseGrammar(`
        S -> "if" "c" "then" S "else" S | "if" "c" "then" S | "other"
      `).grammar!;
      const res = attemptResolveLRConflicts(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(compareLanguages(g, res.transformedGrammar, 8).kind).toBe('same-up-to');
    });

    it('automatically resolves precedence conflicts', () => {
      const g = parseGrammar(`
        E -> E "+" E | E "*" E | "id"
      `).grammar!;
      const res = attemptResolveLRConflicts(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(compareLanguages(g, res.transformedGrammar, 6).kind).toBe('same-up-to');
    });

    it('automatically resolves context splitting conflicts', () => {
      const g = parseGrammar(`
        S -> "a" A "d" | "b" B "d" | "a" B "e" | "b" A "e"
        A -> "c"
        B -> "c"
      `).grammar!;
      const res = attemptResolveLRConflicts(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(compareLanguages(g, res.transformedGrammar, 6).kind).toBe('same-up-to');
    });

    it('automatically resolves left-linear grammars', () => {
      const g = parseGrammar(`
        S -> A "b"
        A -> A "a" | "a"
      `).grammar!;
      const res = attemptResolveLRConflicts(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(compareLanguages(g, res.transformedGrammar, 8).kind).toBe('same-up-to');
    });
  });
});
