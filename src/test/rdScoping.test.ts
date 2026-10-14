import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import { suggestSymbolActions, DEFAULT_KEYWORD_CONFIG } from '../core/codegen/symbolTable';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';

describe('Recursive Descent Scoping & Pure Syntax Execution', () => {
  it('runs pure recursive descent without symbol table when nothing is recognized', () => {
    const pureSample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pure_arithmetic')!;
    expect(pureSample).toBeDefined();

    const parsed = parseGrammar(pureSample.grammarText);
    expect(parsed.errors).toEqual([]);
    const grammar = parsed.grammar!;
    const analysis = analyzeGrammar(grammar);
    const llTable = buildLLTable(grammar, analysis);
    expect(llTable.isLL1).toBe(true);

    // Auto-detection on pure arithmetic grammar returns 0 rule actions
    const autoActions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
    expect(autoActions.length).toBe(0);

    // Simulate without any actionConfig (completely pure syntactic recursive descent)
    const tokens = ['id', '+', 'num', '*', '(', 'id', '-', 'num', ')'];
    const res = simulateRecursiveDescent(tokens, grammar, analysis, undefined);

    expect(res.accepted).toBe(true);
    expect(res.errorMessage).toBeUndefined();
    expect(res.steps.length).toBeGreaterThan(15);
    expect(res.leftParse.length).toBeGreaterThan(0);

    // Call stack in simulation traces actual recursive function calls
    const intermediateStep = res.steps.find(s => s.activeFunction === 'Factor');
    expect(intermediateStep).toBeDefined();
    expect(intermediateStep!.callStack.map(f => f.functionName)).toContain('Expr');
    expect(intermediateStep!.callStack.map(f => f.functionName)).toContain('Term');
    expect(intermediateStep!.callStack.map(f => f.functionName)).toContain('Factor');

    // Parse tree has valid root and children
    expect(res.finalTree).toBeDefined();
    expect(res.finalTree!.symbol).toBe('Expr');
    expect(res.finalTree!.children!.length).toBeGreaterThan(0);

    // Symbol table remains untouched with 0 symbols throughout pure execution
    for (const step of res.steps) {
      expect(step.symbolTableSnapshot.scopeStack.length).toBe(1);
      expect(step.symbolTableSnapshot.totalActiveSymbols).toBe(0);
    }
  });

  it('correctly handles C-style nested block scoping ({ ... }, int/float/char)', () => {
    const cSample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_c_blocks')!;
    expect(cSample).toBeDefined();

    const parsed = parseGrammar(cSample.grammarText);
    expect(parsed.errors).toEqual([]);
    const grammar = parsed.grammar!;
    const analysis = analyzeGrammar(grammar);
    const llTable = buildLLTable(grammar, analysis);
    expect(llTable.isLL1).toBe(true);

    // Auto-generated actions detect Block scope opener and typed declarations
    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
    expect(actions.length).toBeGreaterThan(0);

    const enterScopeAction = actions.find(a => a.actionType === 'enterScope');
    expect(enterScopeAction).toBeDefined();

    // Input with outer block declaring id, inner block declaring id (shadowing) and id, then exiting
    // Tokens: { int id ; { float id ; char id ; id = num ; } id = num ; }
    const tokens = [
      '{', 'int', 'id', ';',
      '{', 'float', 'id', ';', 'char', 'id', ';', 'id', '=', 'num', ';', '}',
      'id', '=', 'num', ';', '}'
    ];

    const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
    expect(res.accepted).toBe(true);
    expect(res.errorMessage).toBeUndefined();

    // Find step inside the inner block where both inner 'x' and 'y' are declared
    const innerStep = res.steps.find(s =>
      s.symbolTableSnapshot.scopeStack.length === 3 && // global + outer Block + inner Block
      s.symbolTableSnapshot.totalActiveSymbols === 3
    );
    expect(innerStep).toBeDefined();

    const innerScope = innerStep!.symbolTableSnapshot.scopeStack[2];
    expect(innerScope.level).toBe(2);
    expect(innerScope.symbols.length).toBe(2);

    const innerSymbols = innerScope.symbols;
    expect(innerSymbols.some(s => s.type === 'float')).toBe(true);
    expect(innerSymbols.some(s => s.type === 'char')).toBe(true);

    const outerScope = innerStep!.symbolTableSnapshot.scopeStack[1];
    expect(outerScope.level).toBe(1);
    expect(outerScope.symbols[0].type).toBe('int');

    // After inner block returns, scope level 2 is popped, and scopeStack length is back to 2
    const afterInnerBlockStep = res.steps.find(s =>
      s.actionDescription.includes("Exited scope 'scope_Block'")
    );
    expect(afterInnerBlockStep).toBeDefined();

    // Final step: outer block has also returned, scopeStack is back to global
    const lastStep = res.steps[res.steps.length - 1];
    expect(lastStep.symbolTableSnapshot.scopeStack.length).toBe(1);
    expect(lastStep.symbolTableSnapshot.allScopes.length).toBe(3); // global + 2 recorded scopes in history
  });

  it('correctly handles Pascal / PL/0 style procedures and scoping', () => {
    const pl0Sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pascal_pl0')!;
    expect(pl0Sample).toBeDefined();

    const parsed = parseGrammar(pl0Sample.grammarText);
    expect(parsed.errors).toEqual([]);
    const grammar = parsed.grammar!;
    const analysis = analyzeGrammar(grammar);
    const llTable = buildLLTable(grammar, analysis);
    expect(llTable.isLL1).toBe(true);

    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
    expect(actions.some(a => a.actionType === 'enterScope')).toBe(true);
    expect(actions.some(a => a.actionType === 'addSymbol')).toBe(true);

    // Input: var id , id ; procedure id ; var id ; begin id := num end ; begin call id end .
    const tokens = [
      'var', 'id', ',', 'id', ';',
      'procedure', 'id', ';',
      'var', 'id', ';',
      'begin', 'id', ':=', 'num', 'end', ';',
      'begin', 'call', 'id', 'end', '.'
    ];

    const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
    expect(res.accepted).toBe(true);
    expect(res.errorMessage).toBeUndefined();

    // Verify step inside procedure Block where local symbol exists
    const stepWithProc = res.steps.find(s =>
      s.symbolTableSnapshot.scopeStack.some(sc => sc.name === 'scope_ProcDecl' || sc.name === 'scope_Block') &&
      s.symbolTableSnapshot.scopeStack.some(sc => sc.symbols.length > 0)
    );
    expect(stepWithProc).toBeDefined();
  });

  it('correctly handles modern script declarations (const vs let)', () => {
    const modernSample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_modern_script')!;
    expect(modernSample).toBeDefined();

    const parsed = parseGrammar(modernSample.grammarText);
    expect(parsed.errors).toEqual([]);
    const grammar = parsed.grammar!;
    const analysis = analyzeGrammar(grammar);
    const llTable = buildLLTable(grammar, analysis);
    expect(llTable.isLL1).toBe(true);

    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
    const constAction = actions.find(a => a.symbolKind === 'const');
    const letAction = actions.find(a => a.symbolKind === 'var');

    expect(constAction).toBeDefined();
    expect(letAction).toBeDefined();

    // Input: const id ; let id ; function id { let id ; { const id ; id = num ; } }
    const tokens = [
      'const', 'id', ';',
      'let', 'id', ';',
      'function', 'id', '{',
      'let', 'id', ';',
      '{', 'const', 'id', ';', 'id', '=', 'num', ';', '}',
      '}'
    ];

    const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
    expect(res.accepted).toBe(true);
    expect(res.errorMessage).toBeUndefined();

    // Check that at completion, global scope has both const and var symbols
    const finalStep = res.steps[res.steps.length - 1];
    const globalScope = finalStep.symbolTableSnapshot.scopeStack[0];
    expect(globalScope.symbols.some(s => s.kind === 'const')).toBe(true);
    expect(globalScope.symbols.some(s => s.kind === 'var')).toBe(true);

    // Check that nested scopes (function and block) were created during simulation
    const nestedStep = res.steps.find(s => s.symbolTableSnapshot.scopeStack.length >= 2);
    expect(nestedStep).toBeDefined();
  });

  it('verifies visual simulator step records and branch choices', () => {
    const cSample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_c_blocks')!;
    const parsed = parseGrammar(cSample.grammarText);
    const grammar = parsed.grammar!;
    const analysis = analyzeGrammar(grammar);
    const tokens = ['{', 'int', 'id', ';', '}'];

    const res = simulateRecursiveDescent(tokens, grammar, analysis);
    expect(res.accepted).toBe(true);

    // Every step must have valid visual state
    for (const step of res.steps) {
      expect(typeof step.step).toBe('number');
      expect(Array.isArray(step.callStack)).toBe(true);
      expect(typeof step.activeFunction).toBe('string');
      expect(typeof step.activeNodeId).toBe('string');
      expect(step.parseTree).toBeDefined();
      expect(step.parseTree.id).toBeDefined();
      expect(step.activeBranchPath.length).toBeGreaterThan(0);
      expect(step.symbolTableSnapshot).toBeDefined();
      expect(step.consumedTokens.length + step.remainingTokens.length).toBe(tokens.length + 1); // + $
    }

    // Branch choices must be recorded when choosing rules
    const branchSteps = res.steps.filter(s => s.branchChoice !== undefined);
    expect(branchSteps.length).toBeGreaterThan(0);
    for (const bs of branchSteps) {
      expect(bs.branchChoice!.lhs).toBeDefined();
      expect(bs.branchChoice!.rule).toBeDefined();
      expect(bs.branchChoice!.lookahead).toBeDefined();
    }
  });
});
