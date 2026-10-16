import { describe, it, expect } from 'vitest';
import { TEACHING_TECHNIQUES } from '../core/teaching/teachingGuideData';
import { parseGrammar } from '../core/parser/grammarParser';
import { formatGrammarForEditor } from '../core/ast/grammar';

describe('Audit all 17 Teaching Guide examples', () => {
  for (const tech of TEACHING_TECHNIQUES) {
    it(`verifies that technique ${tech.id} parses without errors and transforms its example`, () => {
      const parsed = parseGrammar(tech.exampleGrammarText);
      expect(parsed.errors, `Parse errors for ${tech.id}`).toHaveLength(0);
      const original = parsed.grammar!;
      const origText = formatGrammarForEditor(original);
      const res = tech.apply(original);
      const transText = formatGrammarForEditor(res.transformedGrammar);

      // The example must produce at least one explanation step
      expect(res.steps.length, `Technique ${tech.id} did not produce explanation steps!`).toBeGreaterThan(0);
      // The example MUST actually be transformed (not a no-op)!
      expect(origText !== transText, `Technique ${tech.id} did not change the example grammar!`).toBe(true);
    });
  }
});
