/**
 * Symbol Table ("Stack of Stacks") for Compiler Construction & Recursive Descent.
 *
 * Implements classical block-structured lexical scoping (Algol, Pascal, PL/0, C):
 * - The outer stack is the Scope Stack (stack of activation environments).
 * - Each Scope itself holds an inner stack of Symbol entries declared within it.
 * - Supports nested block scopes, lexical lookup, shadowing, type marking,
 *   custom arbitrary metadata, and immutable snapshots for step-by-step simulation.
 */

import { Grammar, Production } from '../ast/grammar';

export type SymbolKind = 'var' | 'const' | 'procedure' | 'function' | 'type' | 'param' | 'custom';

export interface SymbolEntry {
  name: string;
  type: string;
  kind: SymbolKind;
  /** Arbitrary user metadata (memory offset, initial value, source line, etc.) */
  customData: Record<string, unknown>;
  scopeId: string;
  scopeName: string;
  scopeLevel: number;
  /** Simulation step index when this symbol was declared */
  declaredAtStep?: number;
}

export interface Scope {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  /** The inner stack of symbols declared in this lexical scope */
  symbols: SymbolEntry[];
  isOpen: boolean;
}

export interface SymbolTableSnapshot {
  /** The active scope stack from bottom (global, level 0) to top (innermost) */
  scopeStack: Scope[];
  /** All scopes ever created during the parse (including closed ones), keyed by id */
  allScopes: Scope[];
  /** Total number of declared symbols across all active scopes */
  totalActiveSymbols: number;
  /** Most recently declared or modified symbol */
  lastModifiedSymbol?: SymbolEntry;
  /** Most recent log message describing the symbol table action */
  lastActionMessage?: string;
}

export class SymbolTable {
  private scopeStack: Scope[] = [];
  private allScopesList: Scope[] = [];
  private scopeCounter = 0;
  private lastModified?: SymbolEntry;
  private lastAction = 'Initialized global scope';

  constructor(globalScopeName = 'global') {
    this.enterScope(globalScopeName);
  }

  /**
   * Pushes a new lexical scope onto the scope stack.
   * @param name Optional descriptive name (e.g. "procedure fact", "block_2")
   */
  enterScope(name?: string): Scope {
    const level = this.scopeStack.length;
    const parent = level > 0 ? this.scopeStack[level - 1] : null;
    const id = `scope_${++this.scopeCounter}`;
    const scopeName = name || (level === 0 ? 'global' : `block_${this.scopeCounter}`);

    const newScope: Scope = {
      id,
      name: scopeName,
      level,
      parentId: parent ? parent.id : null,
      symbols: [],
      isOpen: true
    };

    this.scopeStack.push(newScope);
    this.allScopesList.push(newScope);
    this.lastAction = `Entered scope: ${scopeName} (level ${level})`;
    return newScope;
  }

  /**
   * Pops the current innermost scope from the active stack.
   * The scope remains in the global history (`allScopes`) for post-mortem analysis and debugging.
   */
  exitScope(): Scope | undefined {
    if (this.scopeStack.length <= 1) {
      // Do not pop the global scope
      return undefined;
    }
    const popped = this.scopeStack.pop()!;
    popped.isOpen = false;
    this.lastAction = `Exited scope: ${popped.name} (level ${popped.level})`;
    return popped;
  }

  /**
   * Gets the currently active scope (top of the scope stack).
   */
  currentScope(): Scope {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  /**
   * Adds a new symbol to the current active scope.
   * If a symbol with the same name already exists in the current scope, it is recorded,
   * but flagged as a redeclaration.
   */
  addSymbol(
    name: string,
    type = 'unknown',
    customData: Record<string, unknown> = {},
    kind: SymbolKind = 'var',
    step?: number
  ): SymbolEntry {
    const scope = this.currentScope();
    const isRedeclaration = scope.symbols.some(s => s.name === name);

    const entry: SymbolEntry = {
      name,
      type,
      kind,
      customData: { ...customData, ...(isRedeclaration ? { redeclared: true } : {}) },
      scopeId: scope.id,
      scopeName: scope.name,
      scopeLevel: scope.level,
      declaredAtStep: step
    };

    scope.symbols.push(entry);
    this.lastModified = entry;
    this.lastAction = `Added symbol '${name}' [${type}] (${kind}) to ${scope.name}`;
    return entry;
  }

  /**
   * Sets or updates the type of an existing symbol in the closest visible scope.
   */
  markType(name: string, type: string): boolean {
    const res = this.lookup(name);
    if (res) {
      res.entry.type = type;
      this.lastModified = res.entry;
      this.lastAction = `Updated type of '${name}' to '${type}' in ${res.scope.name}`;
      return true;
    }
    return false;
  }

  /**
   * Sets arbitrary custom data on an existing symbol in the closest visible scope.
   */
  setCustomData(name: string, key: string, value: unknown): boolean {
    const res = this.lookup(name);
    if (res) {
      res.entry.customData[key] = value;
      this.lastModified = res.entry;
      this.lastAction = `Set ${key} on '${name}' in ${res.scope.name}`;
      return true;
    }
    return false;
  }

  /**
   * Searches for a symbol using lexical scoping (from innermost scope up to global).
   */
  lookup(name: string): { entry: SymbolEntry; scope: Scope } | null {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopeStack[i];
      for (let j = scope.symbols.length - 1; j >= 0; j--) {
        if (scope.symbols[j].name === name) {
          return { entry: scope.symbols[j], scope };
        }
      }
    }
    return null;
  }

  /**
   * Searches for a symbol strictly in the current local scope.
   */
  lookupLocal(name: string): SymbolEntry | null {
    const scope = this.currentScope();
    for (let j = scope.symbols.length - 1; j >= 0; j--) {
      if (scope.symbols[j].name === name) {
        return scope.symbols[j];
      }
    }
    return null;
  }

  /**
   * Returns the current active stack of scopes.
   */
  getActiveStack(): Scope[] {
    return [...this.scopeStack];
  }

  /**
   * Returns all scopes created during execution.
   */
  getAllScopes(): Scope[] {
    return [...this.allScopesList];
  }

  /**
   * Creates an immutable deep copy of the symbol table state for visual replay and step inspection.
   */
  snapshot(): SymbolTableSnapshot {
    const cloneScope = (s: Scope): Scope => ({
      id: s.id,
      name: s.name,
      level: s.level,
      parentId: s.parentId,
      symbols: s.symbols.map(sym => ({ ...sym, customData: { ...sym.customData } })),
      isOpen: s.isOpen
    });

    const activeCloned = this.scopeStack.map(cloneScope);
    const totalSymbols = activeCloned.reduce((acc, s) => acc + s.symbols.length, 0);

    return {
      scopeStack: activeCloned,
      allScopes: this.allScopesList.map(cloneScope),
      totalActiveSymbols: totalSymbols,
      lastModifiedSymbol: this.lastModified ? { ...this.lastModified, customData: { ...this.lastModified.customData } } : undefined,
      lastActionMessage: this.lastAction
    };
  }

  /**
   * Clears the table and re-initializes with global scope.
   */
  reset(globalScopeName = 'global') {
    this.scopeStack = [];
    this.allScopesList = [];
    this.scopeCounter = 0;
    this.lastModified = undefined;
    this.enterScope(globalScopeName);
  }
}

/**
 * Configuration of editable keywords used for automated declaration and scope detection.
 */
export interface DeclarationKeywordConfig {
  /** Keywords indicating a new scope/block opens (e.g. ['procedure', 'function', 'begin', '{', 'proc', 'block']) */
  scopeOpeners: string[];
  /** Keywords indicating a scope/block closes (e.g. ['end', '}']) */
  scopeClosers: string[];
  /** Keywords introducing variable/const declarations (e.g. ['var', 'const', 'let', 'val']) */
  declKeywords: string[];
  /** Keywords representing data types (e.g. ['int', 'real', 'bool', 'char', 'string', 'float', 'double', 'void', 'number']) */
  typeKeywords: string[];
  /** Identifier terminal names in grammar (e.g. ['id', 'ident', 'identifier', 'name']) */
  idSymbols: string[];
}

export const DEFAULT_KEYWORD_CONFIG: DeclarationKeywordConfig = {
  scopeOpeners: ['procedure', 'function', 'begin', '{', 'proc', 'block'],
  scopeClosers: ['end', '}'],
  declKeywords: ['var', 'const', 'let', 'val'],
  typeKeywords: ['int', 'real', 'bool', 'char', 'string', 'float', 'double', 'void', 'number'],
  idSymbols: ['id', 'ident', 'identifier', 'name']
};

/**
 * Definition of a declarative action hook attached to a grammar rule.
 */
export interface RuleActionDefinition {
  ruleId: number;
  /** Action type: 'none' | 'enterScope' | 'exitScope' | 'addSymbol' | 'markType' | 'custom' */
  actionType: 'none' | 'enterScope' | 'exitScope' | 'addSymbol' | 'markType' | 'custom';
  /** Scope name or template (e.g. 'scope_Proc', 'block_1') */
  scopeName?: string;
  /** Symbol name to add or lookup (e.g. 'id', '$id', 'x') */
  symbolName?: string;
  /** Symbol type (e.g. 'int', 'var', 'procedure') */
  symbolType?: string;
  /** Symbol kind */
  symbolKind?: SymbolKind;
  /** Arbitrary custom data */
  customData?: Record<string, unknown>;
  /** Custom JavaScript code snippet executed in context */
  jsCode?: string;
  /** User-friendly description shown in the UI */
  description?: string;
}

/**
 * Automated analysis of a grammar to detect declarations and generate declarative rule actions.
 * Inspects production right-hand sides for configured keywords:
 * - Block/scope openers: { ... }, begin ... end, procedure ... ;
 * - Declarations: var ..., const ..., int id, etc.
 *
 * @param g - The grammar
 * @param config - User-editable keyword configuration
 */
export function suggestSymbolActions(
  g: Grammar,
  config?: Partial<DeclarationKeywordConfig>
): RuleActionDefinition[] {
  const cfg: DeclarationKeywordConfig = {
    scopeOpeners: (config?.scopeOpeners ?? DEFAULT_KEYWORD_CONFIG.scopeOpeners).map(s => s.trim().toLowerCase()).filter(Boolean),
    scopeClosers: (config?.scopeClosers ?? DEFAULT_KEYWORD_CONFIG.scopeClosers).map(s => s.trim().toLowerCase()).filter(Boolean),
    declKeywords: (config?.declKeywords ?? DEFAULT_KEYWORD_CONFIG.declKeywords).map(s => s.trim().toLowerCase()).filter(Boolean),
    typeKeywords: (config?.typeKeywords ?? DEFAULT_KEYWORD_CONFIG.typeKeywords).map(s => s.trim().toLowerCase()).filter(Boolean),
    idSymbols: (config?.idSymbols ?? DEFAULT_KEYWORD_CONFIG.idSymbols).map(s => s.trim().toLowerCase()).filter(Boolean)
  };

  const suggestions: RuleActionDefinition[] = [];

  for (const p of g.productions) {
    const rhsLower = p.rhs.map(s => s.toLowerCase());
    const lhsLower = p.lhs.toLowerCase();

    // 1. Scope openers (procedure, function, block, begin, {, etc.)
    const hasOpener = cfg.scopeOpeners.some(k => rhsLower.includes(k) || lhsLower.includes(k));
    if (hasOpener) {
      suggestions.push({
        ruleId: p.id,
        actionType: 'enterScope',
        scopeName: `scope_${p.lhs}`,
        description: `Enter scope for '${p.lhs}'`
      });
      continue;
    }

    // 2. Scope closers (end, }, etc.)
    const hasCloser = cfg.scopeClosers.some(k => rhsLower.includes(k));
    if (hasCloser) {
      suggestions.push({
        ruleId: p.id,
        actionType: 'exitScope',
        description: `Exit scope on '${p.rhs.join(' ')}'`
      });
      continue;
    }

    // 3. Declarations (var, const, let, val)
    const declWord = cfg.declKeywords.find(k => rhsLower.includes(k));
    if (declWord) {
      const isConst = declWord === 'const';
      // Find id symbol if present
      const idTerm = p.rhs.find(s => cfg.idSymbols.includes(s.toLowerCase())) || 'id';
      // Find type if present in same rule
      const typeTerm = p.rhs.find(s => cfg.typeKeywords.includes(s.toLowerCase())) || (isConst ? 'const' : 'var');

      suggestions.push({
        ruleId: p.id,
        actionType: 'addSymbol',
        symbolName: idTerm,
        symbolType: typeTerm,
        symbolKind: isConst ? 'const' : 'var',
        description: `Declare ${isConst ? 'constant' : 'variable'} '${idTerm}' in current scope`
      });
      continue;
    }

    // 4. Typed declaration without var keyword (e.g. "int id;", "real x")
    const matchedType = cfg.typeKeywords.find(k => rhsLower.includes(k));
    if (matchedType) {
      const idTerm = p.rhs.find(s => cfg.idSymbols.includes(s.toLowerCase())) || 'id';
      suggestions.push({
        ruleId: p.id,
        actionType: 'addSymbol',
        symbolName: idTerm,
        symbolType: matchedType,
        symbolKind: 'var',
        description: `Declare variable '${idTerm}' of type '${matchedType}'`
      });
    }
  }

  return suggestions;
}
