/**
 * The symbol table of the recursive-descent simulator on the sample grammars: the
 * names come from the input (x read as id), declarations are made when their
 * identifier is read, scopes cover the right parts of the rules, and every other
 * identifier is looked up in the scopes open at that moment.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { scanInput } from '../core/parser/inputTokenizer';
import { simulateRecursiveDescent, RDSimulationResult } from '../core/codegen/rdSimulator';
import { suggestSymbolActions, DEFAULT_KEYWORD_CONFIG, buildScopeTree, ScopeTreeNode, tokenClasses } from '../core/codegen/symbolTable';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';

/** Runs a sample on a program with names; returns the result and the final scope tree as text */
function run(sampleId: string, program?: string, stopOnSemanticErrors = true): { res: RDSimulationResult; tree: string; lookups: string[] } {
  const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === sampleId)!;
  const g = parseGrammar(sample.grammarText).grammar!;
  const analysis = analyzeGrammar(g);
  expect(buildLLTable(g, analysis).isLL1).toBe(true);
  const scanned = scanInput(program ?? sample.namedInput, g.terminals, tokenClasses(g.terminals));
  expect(scanned.unknown).toEqual([]);
  const res = simulateRecursiveDescent(scanned.tokens, g, analysis, {
    ruleActions: suggestSymbolActions(g, DEFAULT_KEYWORD_CONFIG),
    lexemes: scanned.lexemes,
    stopOnSemanticErrors
  });
  const show = (n: ScopeTreeNode, depth: number): string[] => [
    `${'  '.repeat(depth)}${n.scope.name}: ${n.scope.symbols.map(s => `${s.name} ${s.kind}${s.type ? ` ${s.type}` : ''}${s.customData.redeclared ? ' (redeclared)' : ''}`).join(', ')}`,
    ...n.children.flatMap(c => show(c, depth + 1))
  ];
  const last = res.steps[res.steps.length - 1];
  return {
    res,
    tree: buildScopeTree(last.symbolTableSnapshot.allScopes).flatMap(n => show(n, 0)).join('\n'),
    lookups: res.steps.filter(s => s.lookup).map(s => `${s.lookup!.name} -> ${s.lookup!.scopeName ?? 'undeclared'}`)
  };
}

describe('Recursive-descent symbol table on the sample grammars', () => {
  it('arithmetic expressions: no declarations, no symbol table', () => {
    const { res, tree } = run('rd_sample_pure_arithmetic');
    expect(res.accepted).toBe(true);
    expect(tree).toBe('global: ');
    expect(res.steps.every(s => s.symbolTableSnapshot.scopeStack.length === 1 && !s.lookup)).toBe(true);
    // the call stack holds the procedures of the descent
    const factor = res.steps.find(s => s.activeFunction === 'Factor')!;
    expect(factor.callStack.map(f => f.functionName)).toEqual(['Expr', 'Term', 'Factor']);
  });

  it('C blocks: typed declarations, a block per { }, shadowing, lookups in the open blocks', () => {
    const { res, tree, lookups } = run('rd_sample_c_blocks');
    expect(res.accepted).toBe(true);
    expect(tree).toBe([
      'global: ',
      '  block: x var int',
      '    block: x var float, c var char'
    ].join('\n'));
    // c = 1 inside the inner block, x = 2 after it: the outer x (int)
    expect(lookups).toEqual(['c -> block', 'x -> block']);
    const outerUse = res.steps.find(s => s.lookup?.name === 'x')!;
    expect(outerUse.lookup!.level).toBe(1);
    // the active stack while the inner block is open: global, outer block, inner block
    const inner = res.steps.find(s => s.declared?.name === 'c')!;
    expect(inner.symbolTableSnapshot.scopeStack.map(s => s.level)).toEqual([0, 1, 2]);
    // all blocks are closed at the end, the history keeps them
    const last = res.steps[res.steps.length - 1];
    expect(last.symbolTableSnapshot.scopeStack.length).toBe(1);
    expect(last.symbolTableSnapshot.allScopes.filter(s => !s.isOpen).length).toBe(2);
  });

  it('PL/0-like sample: a list of variables, a procedure in the enclosing scope, its own scope', () => {
    const { res, tree, lookups } = run('rd_sample_pascal_pl0');
    expect(res.accepted).toBe(true);
    expect(tree).toBe([
      'global: a var, b var, p procedure',
      '  procedure p: a var'
    ].join('\n'));
    expect(lookups).toEqual(['a -> procedure p', 'p -> global']);
  });

  it('modern declarations: const and let, a function scope and a block inside it', () => {
    const { res, tree, lookups } = run('rd_sample_modern_script');
    expect(res.accepted).toBe(true);
    expect(tree).toBe([
      'global: k const, v var, f function',
      '  function f: v var',
      '    block: k const'
    ].join('\n'));
    expect(lookups).toEqual(['v -> function f']);
  });

  it('the whole PL/0: constants, variable lists, a procedure with a local variable shadowing a global one', () => {
    const { res, tree, lookups } = run('rd_sample_pl0');
    expect(res.accepted).toBe(true);
    expect(tree).toBe([
      'global: n const, x var, y var, p procedure',
      '  procedure p: x var'
    ].join('\n'));
    // inside p, x is the local one; in the main program the global one
    expect(lookups).toEqual([
      'x -> procedure p', 'n -> global',
      'x -> global', 'y -> global', 'x -> global', 'y -> global', 'p -> global', 'x -> global'
    ]);
    expect(res.undeclared).toEqual([]);
  });

  it('PL/0: begin … end is a compound statement, not a scope', () => {
    const { res, tree } = run('rd_sample_pl0', 'var x ; begin x := 1 ; begin x := 2 end end .');
    expect(res.accepted).toBe(true);
    expect(tree).toBe('global: x var');
  });

  it('PL/0: the second procedure of a list is not nested in the first one', () => {
    const { res, tree } = run('rd_sample_pl0', 'procedure p ; ; procedure q ; call p ; call q .');
    expect(res.accepted).toBe(true);
    expect(tree).toBe([
      'global: p procedure, q procedure',
      '  procedure p: ',
      '  procedure q: '
    ].join('\n'));
  });

  it('a name missing in the symbol table stops the descent although the word is syntactically correct', () => {
    const program = 'var x ; procedure p ; var a ; x := a ; begin x := 1 ; call p ; a := x end .';
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pl0')!;
    const g = parseGrammar(sample.grammarText).grammar!;
    const scanned = scanInput(program, g.terminals, tokenClasses(g.terminals));
    // without the symbol table the word is accepted …
    expect(simulateRecursiveDescent(scanned.tokens, g, analyzeGrammar(g), { lexemes: scanned.lexemes }).accepted).toBe(true);
    // … with it, a (local to p) is not visible in the main program
    const { res, lookups } = run('rd_sample_pl0', program);
    expect(res.accepted).toBe(false);
    expect(res.semanticError).toBe(true);
    expect(res.errorMessage).toContain("Semantic error: the name 'a' is not declared");
    expect(res.errorMessageCz).toContain("Sémantická chyba: jméno 'a' není deklarováno");
    expect(lookups).toEqual(['x -> global', 'a -> procedure p', 'x -> global', 'p -> global', 'a -> undeclared']);
    const last = res.steps[res.steps.length - 1];
    expect(last.isError).toBe(true);
    expect(last.consumedTokens.length).toBe(scanned.tokens.length - 4); // stopped right after reading a, before := x end .
    // a syntax error still comes first when there is one
    const syntax = run('rd_sample_pl0', 'var x ; x := := 1 .');
    expect(syntax.res.semanticError).toBeUndefined();
    expect(syntax.res.errorMessage).toContain('Syntax error');
  });

  it('a name declared twice in one scope stops the descent; in another scope it is shadowing', () => {
    const { res, tree } = run('rd_sample_pl0', 'var x , y ; procedure x ; ; call x .');
    expect(res.accepted).toBe(false);
    expect(res.semanticError).toBe(true);
    expect(res.errorMessage).toContain("Semantic error: the name 'x' is already declared in scope 'global' (level 0)");
    expect(res.errorMessageCz).toContain("Sémantická chyba: jméno 'x' je v rozsahu 'global' (úroveň 0) už deklarováno");
    // the second x is in the table, marked, and the descent stops right after reading it
    expect(tree).toBe('global: x var, y var, x procedure (redeclared)');
    expect(res.redeclared).toEqual([{ name: 'x', scopeName: 'global', step: expect.any(Number) }]);
    const last = res.steps[res.steps.length - 1];
    expect(last.isError).toBe(true);
    expect(last.remainingTokens.slice(0, 2)).toEqual([';', ';']);
    // the same name in an inner scope is fine
    expect(run('rd_sample_pl0', 'var x ; procedure p ; var x ; x := 1 ; call p .').res.accepted).toBe(true);
    expect(run('rd_sample_c_blocks', '{ int x ; char x ; }').res.semanticError).toBe(true);
    expect(run('rd_sample_c_blocks', '{ int x ; { char x ; } }').res.accepted).toBe(true);
  });

  it('does not check the terminal written instead of a name (a word of terminals)', () => {
    // the word of the grammar: ident ident … names nothing, so no semantic error
    const { res, tree } = run('rd_sample_pl0', 'var ident , ident ; ident := 1 .');
    expect(res.accepted).toBe(true);
    expect(res.unnamedIdentifiers).toBe(3);
    expect(res.redeclared).toEqual([]);
    expect(res.undeclared).toEqual([]);
    expect(tree).toBe('global: ident var, ident var (redeclared)');
    // real names next to it are checked
    expect(run('rd_sample_pl0', 'var ident ; y := 1 .').res.semanticError).toBe(true);
    // every sample's own word of terminals passes with the symbol table on
    for (const sample of RD_SAMPLE_GRAMMARS) expect(run(sample.id, sample.sampleInput).res.accepted, sample.id).toBe(true);
  });

  it('only reports undeclared names and names declared twice when they do not stop the descent', () => {
    const { res, tree, lookups } = run('rd_sample_pl0', 'var x , x ; y := 1 .', false);
    expect(res.accepted).toBe(true);
    expect(tree).toBe('global: x var, x var (redeclared)');
    expect(lookups).toEqual(['y -> undeclared']);
    expect(res.undeclared).toEqual([{ name: 'y', step: expect.any(Number) }]);
    expect(res.redeclared).toEqual([{ name: 'x', scopeName: 'global', step: expect.any(Number) }]);
    expect(res.steps[res.steps.length - 1].actionDescription).toContain('Not declared: y');
  });

  it('the scoping presets are the sample grammars', () => {
    for (const [preset, sample] of [
      ['scoping_c_blocks', 'rd_sample_c_blocks'],
      ['scoping_pascal_pl0', 'rd_sample_pascal_pl0'],
      ['scoping_modern_declarations', 'rd_sample_modern_script'],
      ['lang_pl0', 'rd_sample_pl0']
    ]) {
      const p = PRESET_GRAMMARS.find(x => x.id === preset)!;
      const s = RD_SAMPLE_GRAMMARS.find(x => x.id === sample)!;
      expect(p.grammarText, preset).toBe(s.grammarText);
      expect(p.sampleInput, preset).toBe(s.sampleInput);
    }
  });

  it('every sample accepts both its word of terminals and its program with names, with the same left parse', () => {
    for (const s of RD_SAMPLE_GRAMMARS) {
      const g = parseGrammar(s.grammarText).grammar!;
      const analysis = analyzeGrammar(g);
      const plain = simulateRecursiveDescent(s.sampleInput.split(' '), g, analysis);
      const scanned = scanInput(s.namedInput, g.terminals, tokenClasses(g.terminals));
      const named = simulateRecursiveDescent(scanned.tokens, g, analysis, { lexemes: scanned.lexemes });
      expect(plain.accepted, s.id).toBe(true);
      expect(named.accepted, s.id).toBe(true);
      expect(named.lexemes.slice(0, -1), s.id).toEqual(scanned.lexemes);
    }
  });

  it('stops at the step limit with a message instead of hanging in "parsing"', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pure_arithmetic')!;
    const g = parseGrammar(sample.grammarText).grammar!;
    const res = simulateRecursiveDescent(Array(40).fill('id + ').join('').concat('id').split(' ').filter(Boolean), g, analyzeGrammar(g), undefined, 100);
    expect(res.accepted).toBe(false);
    expect(res.truncated).toBe(true);
    expect(res.errorMessage).toContain('stopped after 100 steps');
    expect(res.steps.length).toBe(100);
  });
});
