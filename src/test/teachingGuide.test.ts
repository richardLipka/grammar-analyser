import { describe, it, expect } from 'vitest';
import { TEACHING_TECHNIQUES } from '../core/teaching/teachingGuideData';
import { parseGrammar } from '../core/parser/grammarParser';
import { checkForm, compareLanguagesSteps } from '../core/analyser/equivalence';
import { runToEnd, runJob } from '../core/jobs/job';
import { analyzeTechniqueOnGrammar, findComparisonWords } from '../core/teaching/techniqueAnalyzer';

describe('Teaching Guide Techniques', () => {
  for (const technique of TEACHING_TECHNIQUES) {
    describe(`Technique: ${technique.id} (${technique.name.en})`, () => {
      it('has valid literature references and defect descriptions', () => {
        expect(technique.literature.authors).toBeTruthy();
        expect(technique.literature.title).toBeTruthy();
        expect(technique.literature.year).toBeGreaterThan(1950);
        expect(technique.defect.en).toBeTruthy();
        expect(technique.defect.cz).toBeTruthy();
        expect(technique.remedy.en).toBeTruthy();
        expect(technique.remedy.cz).toBeTruthy();
      });

      it('parses the example grammar without syntax errors', () => {
        const parsed = parseGrammar(technique.exampleGrammarText);
        expect(parsed.errors).toHaveLength(0);
        expect(parsed.grammar).toBeDefined();
      });

      it('applies the transformation producing steps and a valid grammar', () => {
        const parsed = parseGrammar(technique.exampleGrammarText);
        const original = parsed.grammar!;
        const result = technique.apply(original);

        expect(result.transformedGrammar).toBeDefined();
        expect(result.steps.length).toBeGreaterThan(0);

        // Every step should have a title and description
        for (const step of result.steps) {
          expect(step.title).toBeTruthy();
          expect(step.description).toBeTruthy();
        }
      });

      it('preserves the language (equivalence check up to word length 8)', () => {
        const parsed = parseGrammar(technique.exampleGrammarText);
        const original = parsed.grammar!;
        const result = technique.apply(original);

        const compResult = runJob(compareLanguagesSteps(original, result.transformedGrammar, runToEnd(), 8));
        if (compResult.kind === 'different') {
          console.error(`Difference in ${technique.id}: word "${compResult.word.join(' ')}" inFirst=${compResult.inFirst}`);
        }
        expect(compResult.kind).toBe('same-up-to');
      });

      if (technique.promisedForm.length > 0) {
        it(`satisfies the promised form properties: ${technique.promisedForm.join(', ')}`, () => {
          const parsed = parseGrammar(technique.exampleGrammarText);
          const original = parsed.grammar!;
          const result = technique.apply(original);

          const formChecks = checkForm(result.transformedGrammar, technique.promisedForm);
          for (const check of formChecks) {
            expect(check.ok).toBe(true);
          }
        });
      }

      it('dynamically detects defect and computes sets', () => {
        const parsed = parseGrammar(technique.exampleGrammarText);
        const original = parsed.grammar!;
        const analysis = analyzeTechniqueOnGrammar(original, technique.id, 'en');
        expect(analysis.statusText).toBeTruthy();
        expect(analysis.defectDetail).toBeTruthy();
      });

      it('finds comparison words with derivation trees', () => {
        const parsed = parseGrammar(technique.exampleGrammarText);
        const original = parsed.grammar!;
        const result = technique.apply(original);
        const choices = findComparisonWords(original, result.transformedGrammar, 5);

        // For grammars with multiple words, we should have words
        if (choices.length > 0) {
          expect(choices[0].wordText).toBeDefined();
          expect(choices[0].tokens).toBeDefined();
        }
        // Check how many choices were found
        expect(choices.length).toBeGreaterThanOrEqual(3);
      });
    });
  }

  describe('Custom grammars with arbitrary non-terminal names', () => {
    it('applies immediateLeftRec to custom non-terminals (e.g. Expr)', () => {
      const g = parseGrammar('Expr -> Expr + Term | Term\nTerm -> num').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'immediateLeftRec')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.transformedGrammar.nonTerminals.has("Expr'")).toBe(true);
    });

    it('applies expandLeading to custom non-terminals (e.g. Root, Child)', () => {
      const g = parseGrammar('Root -> Child x | y\nChild -> a | b').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'expandLeading')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.transformedGrammar.productions.some(p => p.lhs === 'Root' && p.rhs[0] === 'a')).toBe(true);
    });

    it('applies substitute to custom non-terminals (e.g. Helper)', () => {
      const g = parseGrammar('Main -> a Helper b\nHelper -> c | d').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'substitute')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.transformedGrammar.productions.some(p => p.lhs === 'Main' && p.rhs.includes('c'))).toBe(true);
    });

    it('applies absorb to custom non-terminals (e.g. Sub)', () => {
      const g = parseGrammar('Main -> Sub x y\nSub -> a | b').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'absorb')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBeGreaterThan(0);
      expect(res.transformedGrammar.productions.some(p => p.lhs.includes('Sub') || p.rhs.some(s => s.includes('Sub')))).toBe(true);
    });

    it('dynamically adapts precedenceStrat mathExplanation and removedRules when grammar changes', () => {
      const g = parseGrammar('Expr -> Expr - Expr | Expr / Expr | num').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'precedenceStrat')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBe(1);
      const step = res.steps[0];
      // Math explanation must use the actual operators '-' and '/' and terminal 'num'
      expect(step.mathExplanation).toContain('-');
      expect(step.mathExplanation).toContain('/');
      expect(step.mathExplanation).toContain('num');
      expect(step.mathExplanation).not.toContain('+');
      expect(step.mathExplanation).not.toContain('*');
      expect(step.mathExplanation).not.toContain('id');
      // Removed rules must include both binary operator rules and base alternative
      expect(step.removedRules).toContain('Expr -> Expr - Expr');
      expect(step.removedRules).toContain('Expr -> Expr / Expr');
      expect(step.removedRules).toContain('Expr -> num');
    });

    it('dynamically adapts danglingElse mathExplanation and removedRules for custom base rules', () => {
      const g = parseGrammar('Stmt -> "if" Cond "then" Stmt "else" Stmt | "if" Cond "then" Stmt | "assign"\nCond -> "c"').grammar!;
      const tech = TEACHING_TECHNIQUES.find(t => t.id === 'danglingElse')!;
      const res = tech.apply(g);
      expect(res.steps.length).toBe(1);
      const step = res.steps[0];
      expect(step.mathExplanation).toContain('assign');
      expect(step.removedRules).toContain('Stmt -> assign');
    });
  });
});


