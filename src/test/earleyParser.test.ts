import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import {
  simulateETTPParse,
  buildETTPTable,
  isETTPKernelItem,
  getETTPTransitionReason,
  findPredictionTriggers
} from '../core/earley/ettpParser';
import { checkEarleyCompatibility, checkETTPCompatibility } from '../core/earley/earleyCompatibility';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { generateWords } from '../core/generator/wordGenerator';

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

  it('verifies that the tree leaves match the input word across all preset grammars and sample inputs in Earley and ETTP', () => {
    function extractLeaves(node: { symbol: string; children?: any[] }): string[] {
      if (!node.children || node.children.length === 0) {
        if (node.symbol === 'ε') return [];
        return [node.symbol];
      }
      const leaves: string[] = [];
      for (const child of node.children) {
        leaves.push(...extractLeaves(child));
      }
      return leaves;
    }

    const mismatches: string[] = [];

    for (const p of PRESET_GRAMMARS) {
      const parsed = parseGrammar(p.grammarText);
      if (!parsed.grammar || parsed.errors.length > 0) continue;
      const g = parsed.grammar;

      const wordsToTest: string[][] = [];
      if (p.sampleInput && p.sampleInput.trim() !== '') {
        wordsToTest.push(tokenizeInput(p.sampleInput, g.terminals).tokens);
      }
      for (const w of generateWords(g, 3, 6)) {
        wordsToTest.push(w.tokens);
      }

      for (const tokens of wordsToTest) {
        const expected = tokens.join(' ');

      // 1. Verify Earley
      const earleyRes = simulateEarleyParse(tokens, g);
      if (earleyRes.accepted) {
        if (!earleyRes.trees || earleyRes.trees.length === 0) {
          mismatches.push(`[${p.id}] Earley accepted "${expected}" but returned no trees`);
        } else {
          const actual = extractLeaves(earleyRes.trees[0]).join(' ');
          if (actual !== expected) {
            mismatches.push(`[${p.id}] Earley leaf mismatch: expected "${expected}", got "${actual}"`);
          }
        }
      }

      // 2. Verify ETTP
      const ettpRes = simulateETTPParse(tokens, g);
      if (ettpRes.accepted) {
        if (!ettpRes.trees || ettpRes.trees.length === 0) {
          mismatches.push(`[${p.id}] ETTP accepted "${expected}" but returned no trees`);
        } else {
          const actual = extractLeaves(ettpRes.trees[0]).join(' ');
          if (actual !== expected) {
            mismatches.push(`[${p.id}] ETTP leaf mismatch: expected "${expected}", got "${actual}"`);
          }
        }
      }
    }
  }

  if (mismatches.length > 0) {
      console.error('Earley/ETTP Tree Leaf Mismatches:\n' + mismatches.join('\n'));
    }
    expect(mismatches).toEqual([]);
  });

  describe('Earley / ETTP Automaton Graph: Cores, Remaining Rules, and Transition Reasons', () => {
    it('partitions all states into core and remaining prediction rules across presets', () => {
      for (const preset of PRESET_GRAMMARS.slice(0, 10)) {
        const parsed = parseGrammar(preset.grammarText);
        if (!parsed.grammar) continue;
        const g = parsed.grammar;
        const table = buildETTPTable(g);

        expect(table.states.length).toBeGreaterThan(0);

        // State 0 checks: augmented axiom is kernel, others are prediction closure
        const startState = table.states[table.startStateId];
        const startKernel = startState.items.filter(it => isETTPKernelItem(it, startState.id, table.startStateId));
        const startClosure = startState.items.filter(it => !isETTPKernelItem(it, startState.id, table.startStateId));

        expect(startKernel.length).toBe(1);
        expect(startKernel[0].production.id).toBe(-1); // S' -> . S
        expect(startClosure.length).toBeGreaterThanOrEqual(1);

        for (const s of table.states) {
          const kernel = s.items.filter(it => isETTPKernelItem(it, s.id, table.startStateId));
          const closure = s.items.filter(it => !isETTPKernelItem(it, s.id, table.startStateId));

          expect(kernel.length + closure.length).toBe(s.items.length);
          if (s.id > 0) {
            for (const it of kernel) {
              expect(it.dot).toBeGreaterThan(0);
            }
          }
          for (const it of closure) {
            expect(it.dot).toBe(0);
            const triggers = findPredictionTriggers(s, it);
            expect(triggers.length, `Closure item ${it.production.lhs} in state ${s.id} must be triggered by an item in the state`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });

    it('computes exact derivation reasons and origin semantics for all transitions', () => {
      for (const preset of PRESET_GRAMMARS.slice(0, 8)) {
        const parsed = parseGrammar(preset.grammarText);
        if (!parsed.grammar) continue;
        const g = parsed.grammar;
        const table = buildETTPTable(g);

        for (const fromState of table.states) {
          for (const [sym, tr] of fromState.transitions.entries()) {
            const targetState = table.states[tr.targetStateId];
            expect(targetState).toBeDefined();

            const reason = getETTPTransitionReason(fromState, sym, targetState);
            expect(reason, `Must compute reason for transition on ${sym} from q${fromState.id} to q${targetState.id}`).toBeDefined();
            expect(reason!.triggerItems.length).toBeGreaterThanOrEqual(1);
            expect(reason!.resultingKernelItems.length).toBe(reason!.triggerItems.length);

            // Verify each trigger item in source has symbol after dot
            for (const it of reason!.triggerItems) {
              expect(it.dot).toBeLessThan(it.production.rhs.length);
              expect(it.production.rhs[it.dot]).toBe(sym);
            }

            // Verify each resulting item in target has symbol before dot
            for (const it of reason!.resultingKernelItems) {
              expect(it.dot).toBeGreaterThan(0);
              expect(it.production.rhs[it.dot - 1]).toBe(sym);
              // Target state must contain this item in its kernel
              const foundInTarget = targetState.items.some(
                tgtIt => tgtIt.production.id === it.production.id && tgtIt.dot === it.dot
              );
              expect(foundInTarget).toBe(true);
            }

            // Verify origin kind matches dot position in trigger items
            const anyKernel = reason!.triggerItems.some(it => it.dot > 0);
            const anyPredicted = reason!.triggerItems.some(it => it.dot === 0);
            if (anyKernel && anyPredicted) {
              expect(reason!.originKind).toBe('both');
            } else if (anyKernel) {
              expect(reason!.originKind).toBe('kernel');
            } else {
              expect(reason!.originKind).toBe('predicted');
            }
          }
        }
      }
    });
  });
});
