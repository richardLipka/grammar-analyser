import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import {
  suggestSymbolActions,
  DEFAULT_KEYWORD_CONFIG,
  buildScopeTree,
  SymbolTable,
  DeclarationKeywordConfig,
  isIdentifierTerminal,
  DEFAULT_ID_SYMBOLS
} from '../core/codegen/symbolTable';
import { RD_SAMPLE_GRAMMARS, RDSampleGrammar } from '../core/presets/rdSampleGrammars';

describe('Recursive Descent Sample Grammars - Comprehensive Suite', () => {
  // Test 1: Global properties of all sample grammars
  describe('All Presets Validation', () => {
    for (const sample of RD_SAMPLE_GRAMMARS) {
      it(`sample grammar '${sample.id}' is valid LL(1) and parses sample input`, () => {
        const parsed = parseGrammar(sample.grammarText);
        expect(parsed.errors, `${sample.id} syntax errors`).toEqual([]);
        expect(parsed.grammar).toBeDefined();

        const grammar = parsed.grammar!;
        expect(grammar.startSymbol).toBeDefined();

        const analysis = analyzeGrammar(grammar);
        const llTable = buildLLTable(grammar, analysis);
        expect(llTable.isLL1, `${sample.id} must be strictly LL(1)`).toBe(true);

        const tokenized = tokenizeInput(sample.sampleInput, grammar.terminals);
        expect(tokenized.unknown, `${sample.id} unknown tokens in sample input`).toEqual([]);
        expect(tokenized.tokens.length).toBeGreaterThan(0);

        const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
        const sim = simulateRecursiveDescent(tokenized.tokens, grammar, analysis, { ruleActions: actions });

        expect(sim.accepted, `${sample.id} parse should succeed on sample input`).toBe(true);
        expect(sim.errorMessage).toBeUndefined();
        expect(sim.steps.length).toBeGreaterThan(5);
        expect(sim.leftParse.length).toBeGreaterThan(0);

        // Derivation parse tree check
        expect(sim.finalTree).toBeDefined();
        expect(sim.finalTree!.symbol).toBe(grammar.startSymbol);

        // Symbol Table & Scope Tree check
        const lastStep = sim.steps[sim.steps.length - 1];
        expect(lastStep.symbolTableSnapshot).toBeDefined();
        expect(lastStep.symbolTableSnapshot.scopeStack.length).toBeGreaterThanOrEqual(1);

        const scopeTree = buildScopeTree(lastStep.symbolTableSnapshot.allScopes);
        expect(scopeTree.length).toBeGreaterThanOrEqual(1);
        expect(scopeTree[0].scope.name).toBe('global');
      });
    }
  });

  // Test 2: Arithmetic Expressions (Pure Syntax / Zero Scopes)
  describe('Sample 1: rd_sample_pure_arithmetic', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pure_arithmetic')!;
    const grammar = parseGrammar(sample.grammarText).grammar!;
    const analysis = analyzeGrammar(grammar);

    it('runs pure recursive descent with zero symbol table actions', () => {
      const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);
      expect(actions.length).toBe(0);

      const validInputs = [
        'id',
        'num',
        'id + num',
        'id - num * id',
        '( id + num ) * id',
        'id / num - ( id + num * id )'
      ];

      for (const inp of validInputs) {
        const tokens = tokenizeInput(inp, grammar.terminals).tokens;
        const res = simulateRecursiveDescent(tokens, grammar, analysis);
        expect(res.accepted, `Failed on: ${inp}`).toBe(true);
        expect(res.errorMessage).toBeUndefined();

        // Symbol table should never register any symbol
        for (const step of res.steps) {
          expect(step.symbolTableSnapshot.totalActiveSymbols).toBe(0);
          expect(step.symbolTableSnapshot.allScopes.length).toBe(1);
        }
      }
    });

    it('detects syntax errors properly on malformed arithmetic expressions', () => {
      const invalidInputs = [
        'id +',
        '( id + num',
        'id + * num',
        '* id',
        ') id ('
      ];

      for (const inp of invalidInputs) {
        const tokens = tokenizeInput(inp, grammar.terminals).tokens;
        const res = simulateRecursiveDescent(tokens, grammar, analysis);
        expect(res.accepted, `Expected rejection on: ${inp}`).toBe(false);
        expect(res.errorMessage).toBeDefined();
        const errStep = res.steps.find(s => s.isError);
        expect(errStep).toBeDefined();
      }
    });
  });

  // Test 3: C-Style Nested Blocks ({ ... }, int/float/char)
  describe('Sample 2: rd_sample_c_blocks', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_c_blocks')!;
    const grammar = parseGrammar(sample.grammarText).grammar!;
    const analysis = analyzeGrammar(grammar);
    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);

    it('detects scope opener and typed declarations correctly', () => {
      const blockAction = actions.find(a => a.actionType === 'enterScope');
      expect(blockAction).toBeDefined();
      expect(blockAction?.scopeName).toBe('scope_Block');

      const addSymActions = actions.filter(a => a.actionType === 'addSymbol');
      expect(addSymActions.length).toBeGreaterThan(0);
    });

    it('handles multiple sibling blocks at the same nesting level', () => {
      // Input: { { int id ; } { float id ; } }
      const tokens = ['{', '{', 'int', 'id', ';', '}', '{', 'float', 'id', ';', '}', '}'];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });

      expect(res.accepted).toBe(true);
      const finalStep = res.steps[res.steps.length - 1];

      // Scopes created: global, outer Block, sibling 1 Block, sibling 2 Block = 4 total
      expect(finalStep.symbolTableSnapshot.allScopes.length).toBe(4);

      // Hierarchical scope tree
      const tree = buildScopeTree(finalStep.symbolTableSnapshot.allScopes);
      expect(tree.length).toBe(1);
      const outerBlock = tree[0].children[0];
      expect(outerBlock.children.length).toBe(2); // Two sibling children
      expect(outerBlock.children[0].scope.symbols[0].type).toBe('int');
      expect(outerBlock.children[1].scope.symbols[0].type).toBe('float');
    });

    it('handles 3-level deep nested blocks with variable shadowing', () => {
      // Input: { int id ; { float id ; { char id ; id = num ; } } }
      const tokens = [
        '{', 'int', 'id', ';',
        '{', 'float', 'id', ';',
        '{', 'char', 'id', ';', 'id', '=', 'num', ';', '}',
        '}',
        '}'
      ];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(true);

      // Verify that inside the innermost block, 4 scopes exist on stack and all 3 variables are active
      const innerDeclStep = res.steps.find(
        s => s.symbolTableSnapshot.scopeStack.length === 4 && s.symbolTableSnapshot.totalActiveSymbols === 3
      );
      expect(innerDeclStep).toBeDefined();

      const stack = innerDeclStep!.symbolTableSnapshot.scopeStack;
      expect(stack[1].symbols[0].type).toBe('int');
      expect(stack[2].symbols[0].type).toBe('float');
      expect(stack[3].symbols[0].type).toBe('char');
    });

    it('flags syntax errors on unclosed block braces or missing tokens', () => {
      const tokens = ['{', 'int', 'id', ';'];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(false);
      expect(res.errorMessage).toBeDefined();
    });
  });

  // Test 4: Pascal / PL/0 Procedures & Scoping
  describe('Sample 3: rd_sample_pascal_pl0', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pascal_pl0')!;
    const grammar = parseGrammar(sample.grammarText).grammar!;
    const analysis = analyzeGrammar(grammar);
    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);

    it('parses empty blocks and procedures correctly', () => {
      // Input: begin end .
      const tokens = ['begin', 'end', '.'];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(true);
    });

    it('handles nested procedures with local variables and call statements', () => {
      // Input: procedure id ; var id ; begin id := num end ; begin call id end .
      const tokens = [
        'procedure', 'id', ';',
        'var', 'id', ';',
        'begin', 'id', ':=', 'num', 'end', ';',
        'begin', 'call', 'id', 'end', '.'
      ];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(true);

      const finalStep = res.steps[res.steps.length - 1];
      expect(finalStep.symbolTableSnapshot.allScopes.length).toBeGreaterThan(1);
    });

    it('rejects programs with missing trailing period', () => {
      const tokens = ['begin', 'end']; // missing '.'
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(false);
    });
  });

  // Test 5: Modern Scripting Declarations (let, const, function)
  describe('Sample 4: rd_sample_modern_script', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_modern_script')!;
    const grammar = parseGrammar(sample.grammarText).grammar!;
    const analysis = analyzeGrammar(grammar);
    const actions = suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG);

    it('correctly discriminates const and let symbol kinds', () => {
      const constAction = actions.find(a => a.symbolKind === 'const');
      const letAction = actions.find(a => a.symbolKind === 'var');

      expect(constAction).toBeDefined();
      expect(constAction?.symbolType).toBe('const');
      expect(letAction).toBeDefined();
      expect(letAction?.symbolType).toBe('var');
    });

    it('parses empty script (epsilon) cleanly', () => {
      const tokens: string[] = [];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(true);
      expect(res.steps.length).toBeGreaterThan(1);
    });

    it('handles functions containing internal nested blocks', () => {
      // Input: function id { let id ; { const id ; } }
      const tokens = [
        'function', 'id', '{',
        'let', 'id', ';',
        '{', 'const', 'id', ';', '}',
        '}'
      ];
      const res = simulateRecursiveDescent(tokens, grammar, analysis, { ruleActions: actions });
      expect(res.accepted).toBe(true);

      const finalStep = res.steps[res.steps.length - 1];
      const tree = buildScopeTree(finalStep.symbolTableSnapshot.allScopes);
      expect(tree.length).toBe(1);

      // Verify function and block scopes exist in tree
      const allNames = finalStep.symbolTableSnapshot.allScopes.map(s => s.name);
      expect(allNames.some(n => n.includes('Func') || n.includes('Block'))).toBe(true);
    });
  });

  // Test 6: Custom Declaration Keywords & Scope API
  describe('Custom Keyword Configuration & SymbolTable API', () => {
    it('supports custom scope openers and type keywords', () => {
      const customConfig: Partial<DeclarationKeywordConfig> = {
        scopeOpeners: ['module', 'sub'],
        declKeywords: ['dim'],
        typeKeywords: ['u32', 'i64']
      };

      const grammarText = `Mod -> "module" "id" Decl .\nDecl -> "dim" "id" "u32" .`;
      const parsed = parseGrammar(grammarText).grammar!;
      const actions = suggestSymbolActions(parsed, customConfig);

      expect(actions.some(a => a.actionType === 'enterScope')).toBe(true);
      expect(actions.some(a => a.actionType === 'addSymbol')).toBe(true);
    });

    it('verifies SymbolTable lookup, lookupLocal, and customData', () => {
      const table = new SymbolTable('global');
      table.addSymbol('x', 'int', { size: 4 }, 'var', 0);
      expect(table.lookup('x')?.entry.type).toBe('int');
      expect(table.lookupLocal('x')?.type).toBe('int');

      // Enter inner scope
      table.enterScope('inner');
      expect(table.lookupLocal('x')).toBeNull(); // not in local scope
      expect(table.lookup('x')?.entry.type).toBe('int'); // visible in outer

      // Shadow x in inner scope
      table.addSymbol('x', 'float', { size: 8 }, 'var', 1);
      expect(table.lookupLocal('x')?.type).toBe('float');
      expect(table.lookup('x')?.entry.type).toBe('float');

      // Update custom data & type
      table.markType('x', 'double');
      table.setCustomData('x', 'author', 'test');
      expect(table.lookupLocal('x')?.type).toBe('double');
      expect(table.lookupLocal('x')?.customData.author).toBe('test');

      // Exit scope
      table.exitScope();
      expect(table.lookup('x')?.entry.type).toBe('int'); // back to outer int
    });

    it('detects identifier terminals across variations (id, ident, identifier, name, varname, etc.)', () => {
      // Direct words in DEFAULT_ID_SYMBOLS
      expect(isIdentifierTerminal('id')).toBe(true);
      expect(isIdentifierTerminal('ident')).toBe(true);
      expect(isIdentifierTerminal('identifier')).toBe(true);
      expect(isIdentifierTerminal('name')).toBe(true);
      expect(isIdentifierTerminal('variable')).toBe(true);
      expect(isIdentifierTerminal('varname')).toBe(true);
      expect(isIdentifierTerminal('var_name')).toBe(true);
      expect(isIdentifierTerminal('symbol')).toBe(true);
      expect(isIdentifierTerminal('sym')).toBe(true);

      // Quoted variations in grammar rules
      expect(isIdentifierTerminal('"id"')).toBe(true);
      expect(isIdentifierTerminal("'name'")).toBe(true);
      expect(isIdentifierTerminal('<identifier>')).toBe(true);

      // Suffix and prefix pattern heuristics (e.g. proc_name, var_id, id1)
      expect(isIdentifierTerminal('var_id')).toBe(true);
      expect(isIdentifierTerminal('proc_name')).toBe(true);
      expect(isIdentifierTerminal('func_name')).toBe(true);
      expect(isIdentifierTerminal('id1')).toBe(true);
      expect(isIdentifierTerminal('ident_2')).toBe(true);

      // Non-identifiers (keywords, operators, punctuation)
      expect(isIdentifierTerminal('int')).toBe(false);
      expect(isIdentifierTerminal('begin')).toBe(false);
      expect(isIdentifierTerminal('+')).toBe(false);
      expect(isIdentifierTerminal(';')).toBe(false);
      expect(isIdentifierTerminal('{')).toBe(false);
    });

    it('correctly extracts declared symbols when grammar uses "identifier" or "name" instead of "id"', () => {
      // 1. Grammar with "identifier"
      const gIdentText = `Decl -> "let" "identifier" ";" .`;
      const gIdent = parseGrammar(gIdentText).grammar!;
      const actionsIdent = suggestSymbolActions(gIdent);

      expect(actionsIdent.length).toBe(1);
      expect(actionsIdent[0].actionType).toBe('addSymbol');
      expect(actionsIdent[0].symbolName).toBe('identifier');

      const simIdent = simulateRecursiveDescent(
        ['let', 'identifier', ';'],
        gIdent,
        analyzeGrammar(gIdent),
        { ruleActions: actionsIdent }
      );
      expect(simIdent.accepted).toBe(true);
      const lastStepIdent = simIdent.steps[simIdent.steps.length - 1];
      expect(lastStepIdent.symbolTableSnapshot.scopeStack[0].symbols[0].name).toBe('identifier');

      // 2. Grammar with "name" and typed declaration
      const gNameText = `Decl -> "float" "name" ";" .`;
      const gName = parseGrammar(gNameText).grammar!;
      const actionsName = suggestSymbolActions(gName);

      expect(actionsName.length).toBe(1);
      expect(actionsName[0].actionType).toBe('addSymbol');
      expect(actionsName[0].symbolName).toBe('name');
      expect(actionsName[0].symbolType).toBe('float');

      const simName = simulateRecursiveDescent(
        ['float', 'name', ';'],
        gName,
        analyzeGrammar(gName),
        { ruleActions: actionsName }
      );
      expect(simName.accepted).toBe(true);
      const lastStepName = simName.steps[simName.steps.length - 1];
      const symEntry = lastStepName.symbolTableSnapshot.scopeStack[0].symbols[0];
      expect(symEntry.name).toBe('name');
      expect(symEntry.type).toBe('float');
    });
  });
});
