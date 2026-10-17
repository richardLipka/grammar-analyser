import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { generateRecursiveDescent } from '../core/codegen/recursiveDescent';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { extractTreeLeaves } from './allParsersTreeYield.test';

describe('Recursive Descent in JavaScript', () => {
  it('generates valid, runnable JavaScript parser code matching LL(1) left parse', () => {
    const p = PRESET_GRAMMARS.find(g => g.id === 'arithmetic_ll1')!;
    const g = parseGrammar(p.grammarText).grammar!;
    const a = analyzeGrammar(g);
    const ll = buildLLTable(g, a);
    expect(ll.isLL1).toBe(true);

    const gen = generateRecursiveDescent(g, a);
    expect(gen.js).toContain('export function parse(');
    expect(gen.js).toContain('const tend = \'$\';');

    // Run the generated JS code dynamically via Function constructor
    // Export function is converted to return object
    const code = gen.js.replace('export function parse', 'function parse') + '\nreturn parse;';
    const parseFn = new Function(code)();

    // Test on valid arithmetic word "id + id $"
    const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
    const sampleTokens = p.sampleInput.split(' ');
    const inputStr = `${sampleTokens.map(t => charOf.get(t) ?? t).join('')}$`;

    const res = parseFn(inputStr);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('OK');
    expect(res.leftParse.length).toBeGreaterThan(0);

    // Test on invalid word
    const resBad = parseFn('+$');
    expect(resBad.ok).toBe(false);
    expect(resBad.output).toContain('ERR');
  });

  it('simulates step-by-step recursive descent with call stack, tree, and symbol table', () => {
    const p = PRESET_GRAMMARS.find(g => g.id === 'arithmetic_ll1')!;
    const g = parseGrammar(p.grammarText).grammar!;
    const a = analyzeGrammar(g);
    const sampleTokens = p.sampleInput.split(' ');

    const sim = simulateRecursiveDescent(sampleTokens, g, a, {
      hooks: {
        onEnter: (nt, ctx) => {
          if (nt === 'E') ctx.symTab.enterScope('expr_scope');
        },
        onExit: (nt, ctx) => {
          if (nt === 'E') ctx.symTab.exitScope();
        },
        onMatch: (term, char, ctx) => {
          if (term === 'id') {
            ctx.symTab.addSymbol(`id_${ctx.consumedTokens.length}`, 'number', { char });
          }
        }
      }
    });

    expect(sim.accepted).toBe(true);
    expect(sim.steps.length).toBeGreaterThan(5);
    expect(extractTreeLeaves(sim.finalTree)).toEqual(sampleTokens);

    // Check step 0
    expect(sim.steps[0].actionDescription).toContain('Starting recursive descent');
    expect(sim.steps[0].currentLookahead).toBe(sampleTokens[0]);

    // Check intermediate step with call stack
    const midStep = sim.steps.find(s => s.callStack.length >= 2);
    expect(midStep).toBeDefined();
    expect(midStep?.callStack[0].functionName).toBe(g.startSymbol);
    expect(midStep?.parseTree).toBeDefined();
    expect(midStep?.activeBranchPath.length).toBeGreaterThan(0);

    // Final step accepted
    const lastStep = sim.steps[sim.steps.length - 1];
    expect(lastStep.isAccepted).toBe(true);
    expect(lastStep.remainingTokens).toEqual(['$']);
  });

  it('handles syntax errors with mismatch markings', () => {
    const p = PRESET_GRAMMARS.find(g => g.id === 'arithmetic_ll1')!;
    const g = parseGrammar(p.grammarText).grammar!;
    const a = analyzeGrammar(g);

    // Provide invalid word: starting with "+" which is not in FIRST(E)
    const sim = simulateRecursiveDescent(['+'], g, a);
    expect(sim.accepted).toBe(false);
    expect(sim.errorMessage).toContain('Syntax error');

    // Look for error step
    const errStep = sim.steps.find(s => s.isError);
    expect(errStep).toBeDefined();
    expect(errStep?.parseTree.mark).toBe('mismatch');
  });
});
