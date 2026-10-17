import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import { simulateETTPParse, buildETTPTable } from '../core/earley/ettpParser';
import { checkEarleyCompatibility, checkETTPCompatibility } from '../core/earley/earleyCompatibility';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';

describe('Earley (1970) and ETTP (2025) Parsers Suite', () => {
  it('correctly parses arithmetic expressions in both Earley and ETTP', () => {
    const text = `E -> E "+" T | T\nT -> T "*" F | F\nF -> "(" E ")" | "id"`;
    const g = parseGrammar(text).grammar!;
    const input = 'id + id * id';
    const tokens = tokenizeInput(input, g.terminals).tokens;

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);
    expect(earleyRes.sets.length).toBe(tokens.length + 1);
    expect(earleyRes.trees.length).toBeGreaterThan(0);
    expect(earleyRes.stats.predictCount).toBeGreaterThan(0);
    expect(earleyRes.stats.scanCount).toBe(tokens.length);
    expect(earleyRes.stats.completeCount).toBeGreaterThan(0);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);
    expect(ettpRes.stats.predictCount).toBe(0); // ETTP has 0 runtime predictions!
    expect(ettpRes.stats.scanTransitions).toBeGreaterThanOrEqual(tokens.length);
    expect(ettpRes.table.states.length).toBeGreaterThan(0);
  });

  it('correctly handles grammars with cycles (S -> S | a) without looping', () => {
    const text = `S -> S | "a"`;
    const g = parseGrammar(text).grammar!;
    const tokens = ['a'];

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);

    const badTokens = ['a', 'a'];
    expect(simulateEarleyParse(badTokens, g).accepted).toBe(false);
    expect(simulateETTPParse(badTokens, g).accepted).toBe(false);
  });

  it('correctly handles empty word (epsilon) and nullable non-terminals', () => {
    const text = `S -> A B "c"\nA -> "a" | ε\nB -> "b" | ε`;
    const g = parseGrammar(text).grammar!;

    // 'c', 'a c', 'b c', 'a b c' are valid
    const validWords = [['c'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']];
    for (const w of validWords) {
      expect(simulateEarleyParse(w, g).accepted).toBe(true);
      expect(simulateETTPParse(w, g).accepted).toBe(true);
    }

    const invalidWords = [[], ['a'], ['b'], ['a', 'b']];
    for (const w of invalidWords) {
      expect(simulateEarleyParse(w, g).accepted).toBe(false);
      expect(simulateETTPParse(w, g).accepted).toBe(false);
    }
  });

  it('parses ambiguous dangling else grammar', () => {
    const text = `S -> "if" "c" "then" S "else" S | "if" "c" "then" S | "other"`;
    const g = parseGrammar(text).grammar!;
    const input = 'if c then if c then other else other';
    const tokens = tokenizeInput(input, g.terminals).tokens;

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);
    expect(earleyRes.trees.length).toBeGreaterThan(0);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);
  });

  it('verifies acceptance across all preset grammars with sampleInput', () => {
    for (const p of PRESET_GRAMMARS) {
      const parsed = parseGrammar(p.grammarText);
      if (!parsed.grammar || parsed.errors.length > 0) continue;
      const g = parsed.grammar;
      const analysis = analyzeGrammar(g);

      // Check compatibility diagnostics
      const earleyComp = checkEarleyCompatibility(g, analysis);
      const ettpComp = checkETTPCompatibility(g, analysis);

      if (analysis.endable.has(g.startSymbol)) {
        expect(earleyComp.canParse).toBe(true);
        expect(ettpComp.canParse).toBe(true);
      }

      if (p.sampleInput && p.sampleInput.trim() !== '') {
        const tokens = tokenizeInput(p.sampleInput, g.terminals).tokens;
        // If sample tokens are valid in the language, both should agree
        const earleyRes = simulateEarleyParse(tokens, g);
        const ettpRes = simulateETTPParse(tokens, g);
        expect(earleyRes.accepted).toBe(ettpRes.accepted);
      }
    }
  });
});
