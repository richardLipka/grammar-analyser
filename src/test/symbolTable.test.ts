import { describe, it, expect } from 'vitest';
import { SymbolTable, suggestSymbolActions } from '../core/codegen/symbolTable';
import { parseGrammar } from '../core/parser/grammarParser';

describe('SymbolTable ("Stack of Stacks")', () => {
  it('manages scopes as a stack of stacks', () => {
    const st = new SymbolTable('global');
    expect(st.getActiveStack().length).toBe(1);
    expect(st.currentScope().name).toBe('global');
    expect(st.currentScope().level).toBe(0);

    // Add global symbol
    const x = st.addSymbol('x', 'int', { offset: 0 }, 'var');
    expect(x.name).toBe('x');
    expect(x.scopeLevel).toBe(0);
    expect(st.lookup('x')?.entry).toBe(x);
    expect(st.lookupLocal('x')).toBe(x);

    // Enter procedure scope
    const procScope = st.enterScope('procedure_foo');
    expect(st.getActiveStack().length).toBe(2);
    expect(procScope.level).toBe(1);
    expect(procScope.parentId).toBe('scope_1');

    // Add local symbol y
    const y = st.addSymbol('y', 'real', { offset: 4 }, 'var');
    expect(st.lookupLocal('y')).toBe(y);
    expect(st.lookup('x')?.entry).toBe(x); // lexical lookup reaches global
    expect(st.lookup('x')?.scope.name).toBe('global');

    // Shadowing: declare x locally
    const localX = st.addSymbol('x', 'boolean', { offset: 8 }, 'var');
    expect(st.lookup('x')?.entry).toBe(localX);
    expect(st.lookup('x')?.entry.type).toBe('boolean');

    // Enter block scope
    const blockScope = st.enterScope('block_inner');
    expect(st.getActiveStack().length).toBe(3);
    const z = st.addSymbol('z', 'char');
    expect(st.lookup('z')?.entry).toBe(z);
    expect(st.lookup('y')?.entry).toBe(y);
    expect(st.lookup('x')?.entry).toBe(localX);

    // Mark type and custom data
    expect(st.markType('z', 'string')).toBe(true);
    expect(st.lookup('z')?.entry.type).toBe('string');
    expect(st.setCustomData('z', 'constant', true)).toBe(true);
    expect(st.lookup('z')?.entry.customData.constant).toBe(true);

    // Exit block scope
    const poppedBlock = st.exitScope();
    expect(poppedBlock).toBe(blockScope);
    expect(poppedBlock?.isOpen).toBe(false);
    expect(st.getActiveStack().length).toBe(2);
    expect(st.lookup('z')).toBeNull(); // z is no longer in active scope stack

    // Exit procedure scope
    const poppedProc = st.exitScope();
    expect(poppedProc).toBe(procScope);
    expect(st.getActiveStack().length).toBe(1);
    expect(st.lookup('x')?.entry).toBe(x); // back to global x

    // Snapshot retains history
    const snap = st.snapshot();
    expect(snap.scopeStack.length).toBe(1);
    expect(snap.allScopes.length).toBe(3);
  });

  it('suggests symbol actions from grammar productions', () => {
    const g = parseGrammar(`
      Prog -> "var" Decls Proc
      Decls -> "int" id ";"
      Proc -> "procedure" id "begin" Stmt "end"
      Stmt -> id "=" "1"
    `).grammar!;

    const suggestions = suggestSymbolActions(g);
    expect(suggestions.length).toBeGreaterThan(0);
    const enterProc = suggestions.find(s => s.actionType === 'enterScope');
    expect(enterProc).toBeDefined();
    const declVar = suggestions.find(s => s.actionType === 'addSymbol');
    expect(declVar).toBeDefined();
  });
});
