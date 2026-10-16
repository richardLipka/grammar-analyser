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
});

