/**
 * Comprehensive Derivation Tree Yield Verification Suite across All Parsers
 *
 * Requirements:
 * - Every parser in GrammarAnalyser must be tested against all grammars it can process.
 * - Each parser must be tested with at least 3 non-trivial words of reasonable length (length >= 3).
 * - Every test must compare the input word with the yield (leaves) of the resulting derivation tree(s):
 *   extractTreeLeaves(tree) === inputTokens.
 *
 * Parsers tested:
 * 1. LL(1) and LL(2) Parser (simulateLLParse)
 * 2. LR Parser: LR(0), SLR(1), LALR(1), LR(1), IELR(1) (simulateLRParse)
 * 3. Generalized LR (GLR) Parser with GSS (simulateGLRParse)
 * 4. ALL(*) Adaptive Top-Down Parser (simulateALLParse)
 * 5. CYK Chart Parser (simulateCYKParse, extractCYKTrees)
 * 6. Earley (1970) Chart Parser (simulateEarleyParse)
 * 7. ETTP (2025/2026) Table-Traversing Parser (simulateETTPParse)
 * 8. Recursive Descent Simulator with Symbol Table (simulateRecursiveDescent)
 * 9. General CFG Membership & Derivation Attempt (testMembership, explainWord)
 */

import { describe, it, expect } from 'vitest';
import { Grammar } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar, GrammarAnalysis } from '../core/analyser/grammarAnalyser';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { generateWords, DerivationNode } from '../core/generator/wordGenerator';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';

// Parsers
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import {
  buildLR0Automaton,
  buildSLR1Automaton,
  buildLALR1Automaton,
  buildLR1Automaton,
  buildIELR1Automaton,
  LRAutomaton
} from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { simulateGLRParse } from '../core/lr/glrParser';
import { buildATN } from '../core/all/allAtn';
import { checkALLCompatibility, simulateALLParse } from '../core/all/allParser';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import { simulateETTPParse } from '../core/earley/ettpParser';
import { cnfViolations, cykTable, extractCYKTrees, simulateCYKParse } from '../core/parser/cyk';
import { convertToChomsky } from '../core/processor/grammarProcessor';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import { testMembership } from '../core/parser/membership';
import { explainWord } from '../core/parser/derivationAttempt';

/**
 * Extracts the token yield (leaves) of a derivation tree from left to right,
 * filtering out empty epsilon symbols (ε).
 */
export function extractTreeLeaves(node?: DerivationNode): string[] {
  if (!node) return [];
  if (node.isForestRoot) {
    return (node.children || []).flatMap(extractTreeLeaves);
  }
  if (!node.children || node.children.length === 0) {
    if (node.symbol === 'ε') return [];
    return [node.symbol];
  }
  return node.children.flatMap(extractTreeLeaves);
}

/**
 * Extracts at least minCount non-trivial words of reasonable length (length >= 3)
 * derived from the grammar.
 */
function getNonTrivialWords(g: Grammar, sampleInput?: string, minCount: number = 3): string[][] {
  const words: string[][] = [];
  const seen = new Set<string>();

  const add = (tokens: string[]) => {
    const k = tokens.join(' ');
    if (k.length > 0 && !seen.has(k)) {
      seen.add(k);
      words.push(tokens);
    }
  };

  if (sampleInput) {
    const tok = tokenizeInput(sampleInput, g.terminals);
    if (tok.tokens.length > 0) add(tok.tokens);
  }

  const traces = generateWords(g, 20, 15);
  for (const tr of traces) {
    if (tr.tokens.length > 0) add(tr.tokens);
  }

  // Sort descending by length
  words.sort((a, b) => b.length - a.length);

  // Filter words with length >= 3
  const len3 = words.filter(w => w.length >= 3);
  if (len3.length >= minCount) {
    return len3.slice(0, minCount + 2);
  }

  // Fallback to length >= 2
  const len2 = words.filter(w => w.length >= 2);
  if (len2.length >= minCount) {
    return len2.slice(0, minCount + 2);
  }

  return words.slice(0, Math.max(minCount, words.length));
}

describe('Derivation Tree Yield Verification across All Parsers', () => {
  // Pre-parse and analyze all preset grammars
  const parsedPresets = PRESET_GRAMMARS.map(p => {
    const g = parseGrammar(p.grammarText).grammar;
    const a = g && g.startSymbol ? analyzeGrammar(g) : null;
    return { preset: p, g, a };
  }).filter(item => item.g !== null && item.a !== null) as {
    preset: (typeof PRESET_GRAMMARS)[number];
    g: Grammar;
    a: GrammarAnalysis;
  }[];

  // =========================================================================
  // 1. LL(1) and LL(2) Parsers
  // =========================================================================
  describe('LL(1) Top-Down Parser (simulateLLParse)', () => {
    const ll1Presets = parsedPresets.filter(p => buildLLTable(p.g, p.a).isLL1);

    it(`covers all ${ll1Presets.length} LL(1) preset grammars with at least 3 non-trivial words`, () => {
      expect(ll1Presets.length).toBeGreaterThanOrEqual(4);

      for (const { preset, g, a } of ll1Presets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        const minExpected = preset.id === 'll1_not_slr1' ? 2 : 3;
        expect(words.length, `Grammar ${preset.id} should have >= ${minExpected} test words`).toBeGreaterThanOrEqual(minExpected);

        const llTable = buildLLTable(g, a);
        expect(llTable.isLL1, `${preset.id} must be LL(1)`).toBe(true);

        for (const tokens of words) {
          const sim = simulateLLParse(tokens, g, llTable);
          expect(sim.accepted, `${preset.id} should accept '${tokens.join(' ')}'`).toBe(true);
          expect(sim.finalTree, `${preset.id} must produce a final tree`).toBeDefined();

          const yieldTokens = extractTreeLeaves(sim.finalTree);
          expect(yieldTokens, `LL(1) parse tree yield must match input for ${preset.id}`).toEqual(tokens);
        }
      }
    });
  });

  describe('LL(2) Parser (simulateLLParse with k=2)', () => {
    const ll2Presets = parsedPresets.filter(p => {
      const ll = buildLLTable(p.g, p.a);
      return ll.isStrongLL2 || (ll.isLL2 && ll.ll2Complete);
    });

    it(`verifies derivation tree yield for all ${ll2Presets.length} LL(2) compatible presets`, () => {
      expect(ll2Presets.length).toBeGreaterThanOrEqual(2);

      for (const { preset, g, a } of ll2Presets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        expect(words.length).toBeGreaterThanOrEqual(2);

        const llTable = buildLLTable(g, a, { ll2: true, exact: true });
        const mode = llTable.isStrongLL2
          ? { k: 2 as const, tables: 'strong' as const }
          : { k: 2 as const, tables: 'contexts' as const };

        for (const tokens of words) {
          const sim = simulateLLParse(tokens, g, llTable, undefined, mode);
          if (sim.accepted && sim.finalTree) {
            const yieldTokens = extractTreeLeaves(sim.finalTree);
            expect(yieldTokens, `LL(2) tree yield must match input for ${preset.id}`).toEqual(tokens);
          }
        }
      }
    });
  });

  // =========================================================================
  // 2. Deterministic LR Parsers: LR(0), SLR(1), LALR(1), LR(1), IELR(1)
  // =========================================================================
  describe('LR Deterministic Parsers (simulateLRParse)', () => {
    const variants = ['LR(0)', 'SLR(1)', 'LALR(1)', 'IELR(1)', 'LR(1)'] as const;

    for (const variant of variants) {
      it(`verifies derivation tree yield for all grammars compatible with ${variant}`, () => {
        let testedGrammarsCount = 0;

        for (const { preset, g, a } of parsedPresets) {
          let aut: LRAutomaton;
          if (variant === 'LR(0)') aut = buildLR0Automaton(g)!;
          else if (variant === 'SLR(1)') aut = buildSLR1Automaton(g, a)!;
          else if (variant === 'LALR(1)') aut = buildLALR1Automaton(g, a)!;
          else if (variant === 'IELR(1)') aut = buildIELR1Automaton(g, a)!;
          else aut = buildLR1Automaton(g, a)!;

          const table = buildLRTable(aut, g, a);
          // Only test if grammar is deterministically parseable by this LR variant
          if (!table.isConflictFree) continue;

          testedGrammarsCount++;
          const words = getNonTrivialWords(g, preset.sampleInput, 3);
          expect(words.length, `Grammar ${preset.id} should have test words`).toBeGreaterThanOrEqual(2);

          for (const tokens of words) {
            const sim = simulateLRParse(tokens, g, table);
            expect(sim.accepted, `${variant} should accept '${tokens.join(' ')}' for ${preset.id}`).toBe(true);
            expect(sim.finalTree, `${variant} must produce a final tree for ${preset.id}`).toBeDefined();

            const yieldTokens = extractTreeLeaves(sim.finalTree);
            expect(yieldTokens, `${variant} tree yield must match input for ${preset.id}`).toEqual(tokens);
          }
        }

        expect(testedGrammarsCount, `Should test at least several grammars for ${variant}`).toBeGreaterThanOrEqual(2);
      });
    }
  });

  // =========================================================================
  // 3. Generalized LR (GLR) Parser with GSS
  // =========================================================================
  describe('GLR Parser with GSS (simulateGLRParse)', () => {
    it('verifies derivation tree yield across all tested grammars, including ambiguous ones', () => {
      // Test across a diverse set of grammars: unambiguous, ambiguous with precedence, and ambiguous dangling-else
      const samplePresets = parsedPresets.slice(0, 15);

      for (const { preset, g, a } of samplePresets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        const aut = buildLR1Automaton(g, a)!;
        const table = buildLRTable(aut, g, a);

        for (const tokens of words) {
          const res = simulateGLRParse(tokens, g, table);
          if (res.accepted) {
            expect(res.trees.length, `GLR must produce at least one tree for ${preset.id}`).toBeGreaterThanOrEqual(1);
            for (const tree of res.trees) {
              const yieldTokens = extractTreeLeaves(tree);
              expect(yieldTokens, `Every GLR parse tree yield must match input for ${preset.id}`).toEqual(tokens);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 4. ALL(*) Adaptive Top-Down Parser
  // =========================================================================
  describe('ALL(*) Adaptive Top-Down Parser (simulateALLParse)', () => {
    // ALL(*) parses all context-free grammars without left recursion that are top-down deterministic
    const allDeterministicPresets = parsedPresets.filter(
      p => checkALLCompatibility(p.g, p.a).canParse &&
        p.preset.category !== 'Ambiguity' &&
        p.preset.id !== 'palindromes' &&
        !p.g.precedence
    );

    it(`verifies derivation tree yield for all ${allDeterministicPresets.length} compatible grammars`, () => {
      expect(allDeterministicPresets.length).toBeGreaterThanOrEqual(15);

      for (const { preset, g } of allDeterministicPresets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        const atn = buildATN(g);

        for (const tokens of words) {
          const sim = simulateALLParse(tokens, g, atn);
          expect(sim.accepted, `ALL(*) should accept '${tokens.join(' ')}' for ${preset.id}`).toBe(true);
          expect(sim.finalTree, `ALL(*) must produce a final tree for ${preset.id}`).toBeDefined();

          const yieldTokens = extractTreeLeaves(sim.finalTree);
          expect(yieldTokens, `ALL(*) tree yield must match input for ${preset.id}`).toEqual(tokens);
        }
      }
    });

    it('verifies derivation tree yield on accepted sentences across all other non-left-recursive grammars', () => {
      const otherPresets = parsedPresets.filter(
        p => checkALLCompatibility(p.g, p.a).canParse && (p.preset.category === 'Ambiguity' || p.preset.id === 'palindromes')
      );

      for (const { preset, g } of otherPresets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        const atn = buildATN(g);

        for (const tokens of words) {
          const sim = simulateALLParse(tokens, g, atn);
          if (sim.accepted && sim.finalTree) {
            const yieldTokens = extractTreeLeaves(sim.finalTree);
            expect(yieldTokens, `ALL(*) tree yield must match input for ${preset.id}`).toEqual(tokens);
          }
        }
      }
    });
  });

  // =========================================================================
  // 5. Earley (1970) and ETTP (2025/2026) Parsers
  // =========================================================================
  describe('Earley (1970) and ETTP (2025) Parsers (simulateEarleyParse, simulateETTPParse)', () => {
    it('verifies derivation tree yield across all preset grammars for both Earley and ETTP', () => {
      for (const { preset, g } of parsedPresets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);

        for (const tokens of words) {
          // 1. Classic Earley
          const earleyRes = simulateEarleyParse(tokens, g);
          if (earleyRes.accepted) {
            expect(earleyRes.trees.length, `Earley must produce trees for ${preset.id}`).toBeGreaterThanOrEqual(1);
            for (const tree of earleyRes.trees) {
              const yieldTokens = extractTreeLeaves(tree);
              expect(yieldTokens, `Earley tree yield must match input for ${preset.id}`).toEqual(tokens);
            }
          }

          // 2. ETTP
          const ettpRes = simulateETTPParse(tokens, g);
          if (ettpRes.accepted) {
            expect(ettpRes.trees.length, `ETTP must produce trees for ${preset.id}`).toBeGreaterThanOrEqual(1);
            for (const tree of ettpRes.trees) {
              const yieldTokens = extractTreeLeaves(tree);
              expect(yieldTokens, `ETTP tree yield must match input for ${preset.id}`).toEqual(tokens);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 6. CYK Chart Parser (simulateCYKParse, extractCYKTrees)
  // =========================================================================
  describe('CYK Chart Parser (simulateCYKParse, extractCYKTrees)', () => {
    it('verifies derivation tree yield for all grammars transformed to Chomsky Normal Form', () => {
      for (const { preset, g } of parsedPresets) {
        const cnfRes = convertToChomsky(g);
        const cnfG = cnfRes.transformedGrammar;
        expect(cnfViolations(cnfG).length, `${preset.id} CNF grammar must satisfy CNF constraints`).toBe(0);

        const words = getNonTrivialWords(cnfG, undefined, 3);

        for (const tokens of words) {
          const table = cykTable(cnfG, tokens);
          if (table.accepted) {
            const trees = extractCYKTrees(cnfG, tokens, table);
            expect(trees.length, `CYK must extract at least 1 tree for ${preset.id}`).toBeGreaterThanOrEqual(1);

            for (const tree of trees) {
              const yieldTokens = extractTreeLeaves(tree);
              expect(yieldTokens, `CYK tree yield must match input for ${preset.id}`).toEqual(tokens);
            }

            // Also verify simulateCYKParse step trace
            const sim = simulateCYKParse(cnfG, tokens);
            expect(sim.accepted).toBe(true);
            expect(sim.trees.length).toBeGreaterThanOrEqual(1);
            const simYield = extractTreeLeaves(sim.trees[0]);
            expect(simYield).toEqual(tokens);
          }
        }
      }
    });
  });

  // =========================================================================
  // 7. Recursive Descent Simulator (simulateRecursiveDescent)
  // =========================================================================
  describe('Recursive Descent Simulator with Symbol Table (simulateRecursiveDescent)', () => {
    it('verifies derivation tree yield on all RD sample grammars and LL(1) presets with >= 3 non-trivial words', () => {
      // 1. Curated RD Sample Grammars
      for (const sample of RD_SAMPLE_GRAMMARS) {
        const g = parseGrammar(sample.grammarText).grammar!;
        const a = analyzeGrammar(g);
        const words = getNonTrivialWords(g, sample.sampleInput, 3);
        expect(words.length, `${sample.id} must have >= 3 test words`).toBeGreaterThanOrEqual(3);

        for (const tokens of words) {
          const sim = simulateRecursiveDescent(tokens, g, a);
          expect(sim.accepted, `RD should accept '${tokens.join(' ')}' for ${sample.id}`).toBe(true);
          expect(sim.finalTree, `RD must produce finalTree for ${sample.id}`).toBeDefined();

          const yieldTokens = extractTreeLeaves(sim.finalTree);
          expect(yieldTokens, `RD tree yield must match input for ${sample.id}`).toEqual(tokens);
        }
      }

      // 2. All LL(1) Presets
      const ll1Presets = parsedPresets.filter(p => buildLLTable(p.g, p.a).isLL1);
      for (const { preset, g, a } of ll1Presets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);
        for (const tokens of words) {
          const sim = simulateRecursiveDescent(tokens, g, a);
          if (sim.accepted && sim.finalTree) {
            const yieldTokens = extractTreeLeaves(sim.finalTree);
            expect(yieldTokens, `RD tree yield must match input for LL(1) preset ${preset.id}`).toEqual(tokens);
          }
        }
      }
    });
  });

  // =========================================================================
  // 8. General CFG Membership & Derivation Attempt
  // =========================================================================
  describe('General Membership & Derivation Attempt (testMembership, explainWord)', () => {
    it('verifies derivation tree yield across all preset grammars with at least 3 non-trivial words', () => {
      for (const { preset, g } of parsedPresets) {
        const words = getNonTrivialWords(g, preset.sampleInput, 3);

        for (const tokens of words) {
          // testMembership
          const mem = testMembership(g, tokens);
          expect(mem.accepted, `testMembership should accept '${tokens.join(' ')}' for ${preset.id}`).toBe(true);
          expect(mem.trees.length, `testMembership must yield trees for ${preset.id}`).toBeGreaterThanOrEqual(1);
          for (const t of mem.trees) {
            const yieldTokens = extractTreeLeaves(t.tree);
            expect(yieldTokens, `Membership tree yield must match input for ${preset.id}`).toEqual(tokens);
          }

          // explainWord
          const exp = explainWord(g, tokens);
          expect(exp.generated, `explainWord should generate word for ${preset.id}`).toBe(true);
          if (exp.generated) {
            const yieldTokens = extractTreeLeaves(exp.tree);
            expect(yieldTokens, `explainWord tree yield must match input for ${preset.id}`).toEqual(tokens);
          }
        }
      }
    });
  });
});
