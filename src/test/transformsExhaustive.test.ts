import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar, formatGrammarForEditor } from '../core/ast/grammar';
import { compareLanguages } from '../core/analyser/equivalence';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';
import { WHOLE_GRAMMAR_TRANSFORMATIONS } from '../ui/wholeGrammarTransformations';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  rightFactorGrammar,
  leftCornerTransform,
  convertToChomsky,
  convertToGreibach,
  disambiguateDanglingElse,
  stratifyPrecedence,
  splitNonTerminalLRContext,
  convertLeftLinearToRightLinear,
  attemptResolveLRConflicts,
  applySymbolTransformation,
  getAvailableTransformationsForOccurrence,
  getAvailableTransformationsForSymbol,
  TransformationResult
} from '../core/processor/grammarProcessor';
import { transformToLL1 } from '../core/processor/ll1Transformer';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  if (res.errors.length > 0) {
    throw new Error(`Parse error: ${res.errors.map(e => e.message).join(', ')}`);
  }
  return res.grammar!;
};

/** Compute appropriate search length based on terminal alphabet size */
const lengthFor = (g1: Grammar, g2: Grammar) => {
  const size = new Set([...g1.terminals, ...g2.terminals]).size;
  return Math.max(3, Math.min(6, Math.floor(Math.log(3000) / Math.log(Math.max(2, size)))));
};

/** Round-trip through editor text representation as experienced in the UI */
const throughText = (source: Grammar, g: Grammar): Grammar => {
  const text = formatGrammarForEditor(g);
  return parse(text);
};

// Combine all preset grammars and RD sample grammars
const ALL_TEST_GRAMMARS = [
  ...PRESET_GRAMMARS.map(p => ({ id: p.id, name: p.nameEn, text: p.grammarText })),
  ...RD_SAMPLE_GRAMMARS.map(p => ({ id: p.id, name: p.nameEn, text: p.grammarText }))
];

describe('Exhaustive Grammar Transformation & Language Equivalence Suite', () => {
  describe('Individual Whole-Grammar Transformations on All Example Grammars', () => {
    for (const tr of WHOLE_GRAMMAR_TRANSFORMATIONS) {
      it(`applies transformation '${tr.id}' and preserves language across all grammars (direct & round-trip)`, () => {
        const differences: string[] = [];
        let appliedCount = 0;

        for (const gEntry of ALL_TEST_GRAMMARS) {
          const original = parse(gEntry.text);
          let res: TransformationResult;
          try {
            res = tr.fn(original);
          } catch (err: any) {
            differences.push(`[${gEntry.id}] '${tr.id}' threw an exception: ${err.message}`);
            continue;
          }

          // Check if grammar rules were actually modified
          const rulesChanged = formatGrammarForEditor(original) !== formatGrammarForEditor(res.transformedGrammar);
          if (rulesChanged && res.transformedGrammar.productions.length > 0) {
            appliedCount++;
            const transformed = res.transformedGrammar;
            const L = lengthFor(original, transformed);

            // 1. Direct language comparison
            const compDirect = compareLanguages(original, transformed, L);
            if (compDirect.kind === 'different') {
              differences.push(
                `[${gEntry.id}] '${tr.id}' direct mismatch! Differing word: "${compDirect.word.join(' ')}" (inOriginal: ${compDirect.inFirst}, inTransformed: ${compDirect.inSecond})`
              );
            }

            // 2. Editor round-trip language comparison
            try {
              const roundTripped = throughText(original, transformed);
              const compRound = compareLanguages(original, roundTripped, L);
              if (compRound.kind === 'different') {
                differences.push(
                  `[${gEntry.id}] '${tr.id}' editor round-trip mismatch! Differing word: "${compRound.word.join(' ')}" (inOriginal: ${compRound.inFirst}, inRoundTripped: ${compRound.inSecond})`
                );
              }
            } catch (err: any) {
              differences.push(`[${gEntry.id}] '${tr.id}' failed to round-trip through editor text: ${err.message}`);
            }
          }
        }

        expect(appliedCount, `Transformation '${tr.id}' was never applied to any grammar`).toBeGreaterThan(0);
        if (differences.length > 0) {
          console.error(`Differences found for '${tr.id}':\n` + differences.join('\n'));
        }
        expect(differences).toEqual([]);
      });
    }
  });

  describe('Standard Transformation Pipelines (Compositions)', () => {
    const pipelines: { name: string; apply: (g: Grammar) => Grammar }[] = [
      {
        name: 'reduce -> eps',
        apply: (g) => removeEpsilonRules(reduceGrammar(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'reduce -> eps -> units (Clean Grammar)',
        apply: (g) => removeUnitRules(removeEpsilonRules(reduceGrammar(g).transformedGrammar).transformedGrammar).transformedGrammar
      },
      {
        name: 'reduce -> eps -> units -> leftrec',
        apply: (g) => removeLeftRecursion(removeUnitRules(removeEpsilonRules(reduceGrammar(g).transformedGrammar).transformedGrammar).transformedGrammar).transformedGrammar
      },
      {
        name: 'reduce -> eps -> units -> leftrec -> factor (Full LL Prep)',
        apply: (g) => leftFactorGrammar(removeLeftRecursion(removeUnitRules(removeEpsilonRules(reduceGrammar(g).transformedGrammar).transformedGrammar).transformedGrammar).transformedGrammar).transformedGrammar
      },
      {
        name: 'Chomsky Normal Form Pipeline (CNF)',
        apply: (g) => convertToChomsky(g).transformedGrammar
      },
      {
        name: 'Greibach Normal Form Pipeline (GNF)',
        apply: (g) => convertToGreibach(g).transformedGrammar
      },
      {
        name: 'leftcorner -> rightfactor',
        apply: (g) => rightFactorGrammar(leftCornerTransform(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'eps -> units',
        apply: (g) => removeUnitRules(removeEpsilonRules(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'reduce -> eps -> units -> leftrec -> gnf (Full GNF Pipeline)',
        apply: (g) => convertToGreibach(removeLeftRecursion(removeUnitRules(removeEpsilonRules(reduceGrammar(g).transformedGrammar).transformedGrammar).transformedGrammar).transformedGrammar).transformedGrammar
      },
      {
        name: 'factor -> rightfactor',
        apply: (g) => rightFactorGrammar(leftFactorGrammar(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'leftcorner -> factor',
        apply: (g) => leftFactorGrammar(leftCornerTransform(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'reduce -> leftcorner -> leftrec',
        apply: (g) => removeLeftRecursion(leftCornerTransform(reduceGrammar(g).transformedGrammar).transformedGrammar).transformedGrammar
      },
      {
        name: 'leftrec -> factor',
        apply: (g) => leftFactorGrammar(removeLeftRecursion(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'danglingElse -> lr',
        apply: (g) => attemptResolveLRConflicts(disambiguateDanglingElse(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'precedenceStrat -> lr',
        apply: (g) => attemptResolveLRConflicts(stratifyPrecedence(g).transformedGrammar).transformedGrammar
      },
      {
        name: 'Automatic LL(1) Transformer Pipeline',
        apply: (g) => transformToLL1(g).transformedGrammar
      }
    ];

    for (const pipeline of pipelines) {
      it(`pipeline '${pipeline.name}' preserves language across all grammars`, () => {
        const differences: string[] = [];

        for (const gEntry of ALL_TEST_GRAMMARS) {
          const original = parse(gEntry.text);
          let transformed: Grammar;
          try {
            transformed = pipeline.apply(original);
          } catch (err: any) {
            differences.push(`[${gEntry.id}] Pipeline '${pipeline.name}' threw an exception: ${err.message}`);
            continue;
          }

          const rulesChanged = formatGrammarForEditor(original) !== formatGrammarForEditor(transformed);
          if (rulesChanged && transformed.productions.length > 0) {
            const L = lengthFor(original, transformed);
            const comp = compareLanguages(original, transformed, L);
            if (comp.kind === 'different') {
              differences.push(
                `[${gEntry.id}] Pipeline '${pipeline.name}' direct mismatch! Differing word: "${comp.word.join(' ')}" (inOriginal: ${comp.inFirst}, inTransformed: ${comp.inSecond})`
              );
            }
            try {
              const roundTripped = throughText(original, transformed);
              const compRound = compareLanguages(original, roundTripped, L);
              if (compRound.kind === 'different') {
                differences.push(
                  `[${gEntry.id}] Pipeline '${pipeline.name}' round-trip mismatch! Differing word: "${compRound.word.join(' ')}" (inOriginal: ${compRound.inFirst}, inRoundTripped: ${compRound.inSecond})`
                );
              }
            } catch (err: any) {
              differences.push(`[${gEntry.id}] Pipeline '${pipeline.name}' failed to round-trip: ${err.message}`);
            }
          }
        }

        if (differences.length > 0) {
          console.error(`Differences found for '${pipeline.name}':\n` + differences.join('\n'));
        }
        expect(differences).toEqual([]);
      });
    }
  });

  describe('Per-Symbol and Per-Occurrence Interactive Transformations', () => {
    it('applies every available symbol and occurrence transformation preserving language', () => {
      const differences: string[] = [];
      let totalOps = 0;

      for (const gEntry of ALL_TEST_GRAMMARS) {
        const original = parse(gEntry.text);
        const actions = new Map<string, string>();

        for (const nt of original.nonTerminals) {
          for (const a of getAvailableTransformationsForSymbol(original, nt)) {
            actions.set(`${nt}|${a.id}`, nt);
          }
        }

        for (const p of original.productions) {
          p.rhs.forEach((_, position) => {
            for (const a of getAvailableTransformationsForOccurrence(original, { productionId: p.id, position })) {
              actions.set(`${p.rhs[position]}|${a.id}`, p.rhs[position]);
            }
          });
        }

        for (const [key, nt] of actions) {
          totalOps++;
          const transformId = key.slice(nt.length + 1);
          let res: TransformationResult;
          try {
            res = applySymbolTransformation(original, nt, transformId);
          } catch (err: any) {
            differences.push(`[${gEntry.id}] Symbol transform '${key}' threw error: ${err.message}`);
            continue;
          }

          const rulesChanged = formatGrammarForEditor(original) !== formatGrammarForEditor(res.transformedGrammar);
          if (rulesChanged && res.transformedGrammar.productions.length > 0) {
            const transformed = res.transformedGrammar;
            const L = lengthFor(original, transformed);
            const comp = compareLanguages(original, transformed, L);
            if (comp.kind === 'different') {
              differences.push(
                `[${gEntry.id}] Symbol transform '${key}' language mismatch! Differing word: "${comp.word.join(' ')}" (inOriginal: ${comp.inFirst}, inTransformed: ${comp.inSecond})`
              );
            }
            try {
              const roundTripped = throughText(original, transformed);
              const compRound = compareLanguages(original, roundTripped, L);
              if (compRound.kind === 'different') {
                differences.push(
                  `[${gEntry.id}] Symbol transform '${key}' round-trip mismatch! Differing word: "${compRound.word.join(' ')}" (inOriginal: ${compRound.inFirst}, inRoundTripped: ${compRound.inSecond})`
                );
              }
            } catch (err: any) {
              differences.push(`[${gEntry.id}] Symbol transform '${key}' failed round-trip: ${err.message}`);
            }
          }
        }
      }

      if (differences.length > 0) {
        console.error(`Per-symbol differences found:\n` + differences.join('\n'));
      }
      expect(differences).toEqual([]);
      expect(totalOps).toBeGreaterThan(50);
    });
  });
});

