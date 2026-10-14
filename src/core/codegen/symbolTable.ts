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

/**
 * Tree node representing a scope and all its nested lexical child scopes.
 */
export interface ScopeTreeNode {
  scope: Scope;
  children: ScopeTreeNode[];
}

/**
 * Transforms a flat list of scopes with parentId references into a hierarchical tree.
 */
export function buildScopeTree(scopes: Scope[]): ScopeTreeNode[] {
  const nodeMap = new Map<string, ScopeTreeNode>();
  for (const s of scopes) {
    nodeMap.set(s.id, { scope: s, children: [] });
  }
  const roots: ScopeTreeNode[] = [];
  for (const s of scopes) {
    const node = nodeMap.get(s.id)!;
    if (s.parentId && nodeMap.has(s.parentId)) {
      nodeMap.get(s.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
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
  /** Keywords followed by the name of a procedure or function with its own scope (procedure p; function f) */
  procKeywords: string[];
  /** Keywords opening a block ({, begin); the block is a scope only when declarations can occur inside it */
  scopeOpeners: string[];
  /** Keywords closing a block (}, end) */
  scopeClosers: string[];
  /** Keywords introducing variable/const declarations (e.g. ['var', 'const', 'let', 'val']) */
  declKeywords: string[];
  /** Keywords representing data types (e.g. ['int', 'real', 'bool', 'char']) */
  typeKeywords: string[];
  /** Identifier terminal names in grammar (e.g. ['id', 'ident', 'identifier', 'name', 'variable', 'varname', 'symbol']) */
  idSymbols: string[];
}

/**
 * Common terminal names and patterns representing identifiers in typical programming languages
 * (e.g. 'id', 'ident', 'identifier', 'name', 'variable', 'varname')
 */
export const DEFAULT_ID_SYMBOLS: string[] = [
  'id',
  'ident',
  'identifier',
  'name',
  'variable',
  'varname',
  'var_name',
  'var_id',
  'id_name',
  'ident_name'
];

/**
 * Literal tokens, numeric values, operators and keywords in typical programming languages
 * that must NEVER be treated as identifier symbols (e.g. 'num', numbers, literals).
 */
export const NON_IDENTIFIER_LITERALS = new Set([
  'num',
  'number',
  'digit',
  'digits',
  'int_lit',
  'float_lit',
  'integer_literal',
  'float_literal',
  'literal',
  'val',
  'value',
  'const_val',
  'numeric',
  'str',
  'string_lit',
  'char_lit',
  'text',
  'true',
  'false',
  'bool_lit',
  'null',
  'nil',
  'undefined',
  'eof',
  'epsilon',
  'eps',
  '$'
]);

/**
 * Checks whether a token represents a non-identifier literal (e.g. 'num', numbers, string/boolean constants).
 */
export function isNonIdentifierLiteral(symbol: string): boolean {
  if (!symbol) return true;
  const clean = symbol.replace(/^["'<]|["'>]$/g, '').trim().toLowerCase();
  if (!clean) return true;
  if (NON_IDENTIFIER_LITERALS.has(clean)) return true;
  // Match integer or floating point numbers (e.g. 10, 42, 3.14)
  if (/^\d+(\.\d+)?$/.test(clean)) return true;
  // Match numeric literal variants (e.g. num1, digit_0, num_lit)
  if (/^(num|digit|digits|int_lit|float_lit)[0-9_]*$/i.test(clean)) return true;
  return false;
}

/**
 * Regex pattern recognizing terminals that denote identifiers or variable names in typical languages.
 * Matches:
 * - Direct names: id, ident, identifier, name, varname, variable
 * - Suffix variants: id1, id2, ident_1, name_var, identifier_list
 * - Prefix variants: var_id, proc_name, func_name, var_name
 */
export const IDENTIFIER_TERMINAL_REGEX =
  /^(id|ident|identifier|name|varname|variable)([0-9_].*)?$|^.*(_id|_ident|_name|_var)$/i;

/**
 * Checks whether a grammar terminal symbol represents an identifier token.
 * Trims surrounding quotes or brackets if present, checks the configured list,
 * strictly excludes numeric and literal keywords (like 'num'), and falls back
 * to regex pattern matching for variations like 'proc_name', 'var_id', 'id2', etc.
 */
export function isIdentifierTerminal(symbol: string, customList?: string[]): boolean {
  if (!symbol) return false;
  // Clean surrounding quotes or angle brackets: "id" -> id, <name> -> name
  const clean = symbol.replace(/^["'<]|["'>]$/g, '').trim().toLowerCase();
  if (!clean) return false;

  // Strictly exclude non-identifier literals such as 'num', digits, booleans, string literals
  if (isNonIdentifierLiteral(clean)) {
    return false;
  }

  const targetList = customList && customList.length > 0 ? customList : DEFAULT_ID_SYMBOLS;
  if (targetList.some(k => k.toLowerCase() === clean)) {
    return true;
  }

  return IDENTIFIER_TERMINAL_REGEX.test(clean);
}

/** Terminals that stand for a number in the input (num, number, digit, int_lit, …) */
const NUMBER_TERMINAL_RE = /^(num|number|numeral|digit|digits|int_lit|float_lit|integer_literal|float_literal|intconst|numconst)$/i;

/**
 * The terminals of the grammar that a name (x, count) and a number (42) in the input stand for:
 * the first identifier terminal (one of `idSymbols` first) and the first number terminal.
 */
export function tokenClasses(terminals: Iterable<string>, idSymbols: string[] = DEFAULT_ID_SYMBOLS): { identifier?: string; number?: string } {
  const list = [...terminals];
  const listed = idSymbols.map(s => s.toLowerCase());
  const identifier = list.find(t => listed.includes(t.toLowerCase()) && !isNonIdentifierLiteral(t)) ?? list.find(t => isIdentifierTerminal(t, idSymbols));
  const number = list.find(t => NUMBER_TERMINAL_RE.test(t));
  return { identifier, number };
}

export const DEFAULT_KEYWORD_CONFIG: DeclarationKeywordConfig = {
  procKeywords: ['procedure', 'function', 'proc', 'func', 'fn', 'def', 'method'],
  scopeOpeners: ['{', 'begin'],
  scopeClosers: ['}', 'end'],
  declKeywords: ['var', 'const', 'let', 'val'],
  // Not 'number': in PL/0 and many textbook grammars it is the literal token, not a type
  typeKeywords: ['int', 'integer', 'real', 'bool', 'boolean', 'char', 'string', 'float', 'double', 'long', 'short', 'void'],
  idSymbols: [...DEFAULT_ID_SYMBOLS]
};

/**
 * Definition of a declarative action hook attached to a grammar rule.
 *
 * Positions are indices into the right-hand side of the rule, so an action happens
 * at the right moment of the procedure of the rule: a name is declared when its
 * identifier has been read (and the name is the one in the input), and a scope
 * opens and closes around a part of the right-hand side.
 */
export interface RuleActionDefinition {
  ruleId: number;
  /** Action type: 'none' | 'enterScope' | 'exitScope' | 'addSymbol' | 'markType' | 'custom' */
  actionType: 'none' | 'enterScope' | 'exitScope' | 'addSymbol' | 'markType' | 'custom';
  /**
   * addSymbol / markType: the identifier of the right-hand side whose name (read from the
   * input) is declared or typed, right after it is read.
   * enterScope: the scope opens before this symbol (default 0, the start of the rule).
   * exitScope: the innermost scope closes after this symbol (default: the last symbol).
   */
  position?: number;
  /** enterScope: the scope closes after this symbol (default: the last symbol of the rule) */
  closeAfter?: number;
  /** Scope name; $name stands for the name declared last (procedure p) */
  scopeName?: string;
  /** addSymbol / markType without a position: this name */
  symbolName?: string;
  /** Symbol type; $type stands for the type keyword read last (int, float) */
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

/** Terminals after which a name is not declared any more (x = 5, x : integer, x := 1) */
const ASSIGN_TERMINALS = new Set(['=', ':=', ':', '<-', '←']);

/** The keyword configuration with defaults for missing lists, trimmed and in lower case. */
export function normalizeKeywordConfig(config?: Partial<DeclarationKeywordConfig>): DeclarationKeywordConfig {
  const list = (key: keyof DeclarationKeywordConfig) =>
    (config?.[key] ?? DEFAULT_KEYWORD_CONFIG[key]).map(s => s.trim().toLowerCase()).filter(Boolean);
  return {
    procKeywords: list('procKeywords'),
    scopeOpeners: list('scopeOpeners'),
    scopeClosers: list('scopeClosers'),
    declKeywords: list('declKeywords'),
    typeKeywords: list('typeKeywords'),
    idSymbols: list('idSymbols')
  };
}

/**
 * Automated analysis of a grammar to detect declarations and generate declarative rule actions.
 *
 * - procedure p / function f (a procedure keyword followed by an identifier): p is declared in the
 *   enclosing scope, and a scope "procedure p" covers the rest of the rule (parameters, body), but
 *   not a trailing call of the rule itself (ProcPart -> procedure id ; Block ; ProcPart);
 * - var x, const c = 5, let y (a declaration keyword): the first identifier before = or : is
 *   declared; so are the identifiers of the non-terminals that follow it and occur only there
 *   (VarRest -> , id VarRest; ConstDef -> id = number);
 * - int x, Type x (a type keyword, or a non-terminal deriving only type keywords, before an
 *   identifier): x is declared with the type read last ($type); int f ( … ) declares a function
 *   with a scope for its parameters and body;
 * - { … }, begin … end: a scope, when declarations can occur inside (C blocks), but not for a
 *   compound statement without declarations (PL/0's begin … end);
 * - an identifier read anywhere else is a use: the simulator looks the name up.
 *
 * @param g - The grammar
 * @param config - User-editable keyword configuration
 */
export function suggestSymbolActions(
  g: Grammar,
  config?: Partial<DeclarationKeywordConfig>
): RuleActionDefinition[] {
  const cfg = normalizeKeywordConfig(config);
  const isT = (s: string) => g.terminals.has(s);
  const inList = (list: string[], s: string) => isT(s) && list.includes(s.toLowerCase());
  const isId = (s: string) => isT(s) && isIdentifierTerminal(s, cfg.idSymbols);
  const rulesOf = (A: string) => g.productions.filter(p => p.lhs === A);

  // Type -> int | float | char: a non-terminal that derives just one type keyword
  const typeNts = new Set([...g.nonTerminals].filter(A => {
    const rs = rulesOf(A);
    return rs.length > 0 && rs.every(p => p.rhs.length === 1 && inList(cfg.typeKeywords, p.rhs[0]));
  }));
  const isType = (s: string) => inList(cfg.typeKeywords, s) || typeNts.has(s);
  // The last symbol of a rule that belongs to the declaration (not a trailing call of the rule itself)
  const lastOwn = (p: Production) => {
    let k = p.rhs.length - 1;
    while (k > 0 && p.rhs[k] === p.lhs) k--;
    return k;
  };
  // Where the declared names end: before =, :=, :
  const stopFrom = (p: Production, from: number) => {
    const k = p.rhs.findIndex((s, i) => i >= from && isT(s) && ASSIGN_TERMINALS.has(s));
    return k < 0 ? p.rhs.length : k;
  };
  const closing = (p: Production, from: number) => {
    const k = p.rhs.indexOf(')', from);
    return k < 0 ? p.rhs.length : k;
  };

  const out: RuleActionDefinition[] = [];
  const declaredAt = new Set<string>(); // "rule:position" of declared identifiers
  const declare = (p: Production, position: number, kind: SymbolKind, type: string, description: string) => {
    const key = `${p.id}:${position}`;
    if (declaredAt.has(key)) return;
    declaredAt.add(key);
    out.push({ ruleId: p.id, actionType: 'addSymbol', position, symbolKind: kind, symbolType: type, description });
  };
  const openScope = (p: Production, position: number, closeAfter: number, scopeName: string, description: string) => {
    if (position > closeAfter || out.some(a => a.ruleId === p.id && a.actionType === 'enterScope')) return;
    out.push({ ruleId: p.id, actionType: 'enterScope', position, closeAfter, scopeName, description });
  };
  // Parts of right-hand sides whose non-terminals declare names: [rule, from, to) with the kind and type
  const contexts: { p: Production; from: number; to: number; kind: SymbolKind; type: string }[] = [];

  for (const p of g.productions) {
    const r = p.rhs;
    // 1. procedure p ; … / function f ( … ) …
    const k = r.findIndex((s, i) => inList(cfg.procKeywords, s) && i + 1 < r.length && isId(r[i + 1]));
    if (k >= 0) {
      const kind: SymbolKind = /fun|fn|def|method/i.test(r[k]) ? 'function' : 'procedure';
      declare(p, k + 1, kind, '', `${r[k]} ${r[k + 1]}: declares the ${kind} name`);
      openScope(p, k + 2, lastOwn(p), `${r[k]} $name`, `scope of the ${kind}`);
      if (r[k + 2] === '(') contexts.push({ p, from: k + 3, to: closing(p, k + 3), kind: 'param', type: '$type' });
    }
    // 2. int x ; Type x ; int f ( … ) { … }
    r.forEach((s, i) => {
      if (i === 0 || !isId(s) || !isType(r[i - 1]) || declaredAt.has(`${p.id}:${i}`)) return;
      const fn = r[i + 1] === '(';
      declare(p, i, fn ? 'function' : 'var', '$type', `${r[i - 1]} ${s}: typed declaration`);
      if (fn) {
        openScope(p, i + 1, lastOwn(p), 'function $name', 'scope of the function');
        contexts.push({ p, from: i + 2, to: closing(p, i + 2), kind: 'param', type: '$type' });
      } else {
        contexts.push({ p, from: i + 1, to: stopFrom(p, i + 1), kind: 'var', type: '$type' });
      }
    });
    // 3. var x … ; const c = … ; let y
    const d = r.findIndex(s => inList(cfg.declKeywords, s));
    if (d >= 0) {
      const kind: SymbolKind = ['const', 'val'].includes(r[d].toLowerCase()) ? 'const' : 'var';
      const type = r.some(isType) ? '$type' : '';
      const to = stopFrom(p, d + 1);
      const j = r.findIndex((s, i) => i > d && i < to && isId(s));
      if (j >= 0) declare(p, j, kind, type, `${r[d]} ${r[j]}: declaration`);
      contexts.push({ p, from: d + 1, to, kind, type });
    }
  }

  // 4. Non-terminals that continue a declaration (VarRest, ConstDef, ParamList) and occur nowhere else
  const ctxOf = new Map<string, { kind: SymbolKind; type: string }>();
  const ambiguous = new Set<string>();
  const ruleContexts = () => [
    ...contexts,
    ...g.productions
      .filter(q => ctxOf.has(q.lhs) && !ambiguous.has(q.lhs))
      .map(q => ({ p: q, from: 0, to: stopFrom(q, 0), ...ctxOf.get(q.lhs)! }))
  ];
  for (let changed = true; changed;) {
    changed = false;
    for (const c of ruleContexts()) {
      for (let i = c.from; i < c.to; i++) {
        const X = c.p.rhs[i];
        if (!g.nonTerminals.has(X) || typeNts.has(X) || X === g.startSymbol || ambiguous.has(X)) continue;
        const known = ctxOf.get(X);
        if (!known) {
          ctxOf.set(X, { kind: c.kind, type: c.type });
          changed = true;
        } else if (known.kind !== c.kind) {
          ambiguous.add(X);
          changed = true;
        }
      }
    }
  }
  // Drop the non-terminals that also occur outside declarations (an expression, a statement)
  for (let changed = true; changed;) {
    changed = false;
    const allowed = new Set(ruleContexts().flatMap(c =>
      Array.from({ length: Math.max(0, c.to - c.from) }, (_, i) => `${c.p.id}:${c.from + i}`)));
    for (const A of ctxOf.keys()) {
      if (ambiguous.has(A)) continue;
      const elsewhere = g.productions.some(q => q.rhs.some((s, i) => s === A && !allowed.has(`${q.id}:${i}`)));
      if (elsewhere) {
        ambiguous.add(A);
        changed = true;
      }
    }
  }
  for (const [A, c] of ctxOf) {
    if (ambiguous.has(A)) continue;
    for (const q of rulesOf(A)) {
      const to = stopFrom(q, 0);
      const j = q.rhs.findIndex((s, i) => i < to && isId(s));
      if (j >= 0) declare(q, j, c.kind, c.type, `${q.rhs[j]} in ${A}: continues a declaration`);
      // int x in a parameter list is a parameter
      if (c.kind === 'param') {
        for (const a of out) if (a.ruleId === q.id && a.actionType === 'addSymbol' && a.symbolKind === 'var') a.symbolKind = 'param';
      }
    }
  }

  // 5. Blocks { … } and begin … end that can contain declarations
  const declaring = new Set(out.filter(a => a.actionType === 'addSymbol').map(a => g.productions.find(p => p.id === a.ruleId)!.lhs));
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.productions) {
      if (!declaring.has(p.lhs) && p.rhs.some(s => declaring.has(s))) {
        declaring.add(p.lhs);
        changed = true;
      }
    }
  }
  for (const p of g.productions) {
    const r = p.rhs;
    const k = r.findIndex(s => inList(cfg.scopeOpeners, s));
    if (k < 0) continue;
    const j = r.findIndex((s, i) => i > k && inList(cfg.scopeClosers, s));
    const closeAfter = j >= 0 ? j : lastOwn(p);
    const inside = r.slice(k + 1, closeAfter + 1);
    const declares = inside.some(s => declaring.has(s)) ||
      out.some(a => a.ruleId === p.id && a.actionType === 'addSymbol' && a.position! > k && a.position! <= closeAfter);
    if (declares) openScope(p, k + 1, closeAfter, 'block', `${r[k]} … ${j >= 0 ? r[j] : ''}: a block with declarations`);
  }

  return out.sort((a, b) => a.ruleId - b.ruleId || (a.position ?? 0) - (b.position ?? 0));
}
