/**
 * Recursive Descent Visual Simulator Engine.
 *
 * Simulates step-by-step execution of a recursive-descent parser generated
 * from an LL(1) grammar. At every step, it captures:
 * - The simulated function call stack (activation records, call depths, active functions)
 * - The input streamer (consumed tokens, current lookahead, remaining tokens)
 * - The derivation/parse tree being built (with the active branch and node highlighted)
 * - The active rule/branch being executed
 * - The Symbol Table state ("stack of stacks" with lexical scopes and declarations)
 * - Semantic action hooks executed along the descent
 *
 * Tokens may carry their text (lexemes: the name x read as the terminal id). The
 * actions of a rule are tied to positions of its right-hand side: a name is declared
 * when its identifier has been read, a scope opens before and closes after given
 * symbols, and every other identifier read is looked up in the symbol table.
 * A name that is not found, and a name declared twice in one scope, are semantic
 * errors: they stop the descent (as a compiler would), unless stopOnSemanticErrors
 * is false. Only real names are checked: the terminal id written in the input
 * instead of a name (a word of the grammar) names nothing.
 *
 * It is a demonstration of how a parser builds a symbol table, not a compiler:
 * no types, kinds or numbers of parameters are checked, and no code is made.
 *
 * With `recovery` a syntax error does not stop the descent: panic mode as in
 * Wirth's PL/0 compiler (lecture 3 of KIV/FJP). Every procedure A gets a set of
 * stop symbols, the stop set of its call = FOLLOW(A) ∪ {$} ∪ the stop set of the
 * caller, and it begins with test(start set of A, stop set) and ends with
 * test(stop set, ∅): when the current symbol is not in the first set, input is
 * thrown away until a symbol of the union. At the start, a symbol of the start
 * set (the predict sets of A's rules) resumes A, a stop symbol makes A give up
 * and return; a terminal that does not match is taken as missing (Wirth:
 * if sym = x then getsym else error). An error found before any terminal was
 * read after a recovery belongs to the previous one. Semantic errors still stop.
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { RecoveredError, RecoveryInfo, RecoveryOptions, setText, sortedSymbols } from '../analyser/errorRecovery';
import { DerivationNode } from '../generator/wordGenerator';
import {
  SymbolTable,
  SymbolTableSnapshot,
  SymbolEntry,
  SymbolKind,
  RuleActionDefinition,
  DeclarationKeywordConfig,
  isIdentifierTerminal,
  normalizeKeywordConfig
} from './symbolTable';

export interface RDCallFrame {
  id: string;
  functionName: string;
  rule?: Production;
  rhsIndex: number;
  currentSymbol?: string;
  nodeId: string;
  depth: number;
  openedScopeId?: string;
  /** With recovery: the stop symbols of this call (FOLLOW of the non-terminal ∪ {$} ∪ the caller's), sorted */
  stopSet?: string[];
  /** With recovery: the start set of the procedure (the predict sets of its rules), sorted */
  startSet?: string[];
}

/** The scope where a name read in the input was found; no scope = not declared. */
export interface RDLookup {
  name: string;
  scopeId?: string;
  scopeName?: string;
  level?: number;
  kind?: SymbolKind;
}

export interface RDSimulationStep {
  step: number;
  /** The simulated function call stack (bottom is main/start symbol, top is active call) */
  callStack: RDCallFrame[];
  activeFunction: string;
  activeFrameId: string;
  currentLookahead: string;
  lookaheadIndex: number;
  consumedTokens: string[];
  remainingTokens: string[];
  /** Detailed human-readable action description */
  actionDescription: string;
  actionDescriptionCz: string;
  ruleApplied?: Production;
  matchedToken?: string;
  /** Active decision branch */
  branchChoice?: {
    lhs: string;
    rule: Production;
    lookahead: string;
  };
  /** Derivation tree state at this step */
  parseTree: DerivationNode;
  /** The node in the parse tree currently active */
  activeNodeId: string;
  /** Ancestor node IDs from root to the active node */
  activeBranchPath: string[];
  /** Left parse: sequence of rule numbers applied so far */
  leftParse: number[];
  /** Snapshot of the Symbol Table ("stack of stacks") */
  symbolTableSnapshot: SymbolTableSnapshot;
  /** The name declared in this step */
  declared?: SymbolEntry;
  /** The name looked up in this step (an identifier that is not being declared) */
  lookup?: RDLookup;
  isError?: boolean;
  isAccepted?: boolean;
  errorMessage?: string;
  errorMessageCz?: string;
  /** A step of error recovery (panic mode) */
  recovery?: RecoveryInfo;
  /** Which test of the procedure found the error: at its start, at its end, a terminal, or the main program */
  recoveryTest?: 'entry' | 'exit' | 'terminal' | 'main';
}

export interface RDSimulationResult {
  accepted: boolean;
  steps: RDSimulationStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
  leftParse: number[];
  /** The text of every input token, the end marker included */
  lexemes: string[];
  /** Names used but not declared in any visible scope (with the step) */
  undeclared: { name: string; step: number }[];
  /** Names declared again in a scope that already has them (with the step) */
  redeclared: { name: string; scopeName: string; step: number }[];
  /** Identifiers written as the terminal itself (id instead of x): not checked, as they name nothing */
  unnamedIdentifiers: number;
  /** The simulation stopped at the step limit */
  truncated?: boolean;
  /** The word is rejected because of the symbol table (a name missing or declared twice), not because of its syntax */
  semanticError?: boolean;
  /** With recovery: the syntax errors found (the word is then not accepted) */
  errors?: RecoveredError[];
  /** With recovery: the whole input was read despite the errors */
  completedWithErrors?: boolean;
}

export interface RDContext {
  symTab: SymbolTable;
  currentLookahead: string;
  lookaheadIndex: number;
  consumedTokens: string[];
  leftParse: number[];
  stepIndex: number;
}

export interface CustomActionConfig {
  /** Explicit rule-action definitions */
  ruleActions?: RuleActionDefinition[];
  /** Type keywords ($type) and identifier terminals (names that are looked up) */
  keywords?: Partial<DeclarationKeywordConfig>;
  /** The text of the input tokens (x for the token id); the tokens themselves when absent */
  lexemes?: string[];
  /**
   * A name used but missing in the symbol table, or declared twice in one scope, stops the
   * descent with a semantic error although the word may be correct syntactically (default
   * true); false only reports them
   */
  stopOnSemanticErrors?: boolean;
  /** Panic-mode error recovery (Wirth's stop symbols); without it the descent stops at the first syntax error */
  recovery?: RecoveryOptions;
  /** Custom JavaScript callback hooks */
  hooks?: {
    onEnter?: (nt: string, ctx: RDContext) => void;
    onRule?: (p: Production, ctx: RDContext) => void;
    onMatch?: (terminal: string, char: string, ctx: RDContext) => void;
    onExit?: (nt: string, ctx: RDContext) => void;
  };
}

const KIND_CZ: Record<SymbolKind, string> = {
  var: 'proměnná', const: 'konstanta', procedure: 'procedura', function: 'funkce', type: 'typ', param: 'parametr', custom: 'vlastní'
};

/** Deep clone of a derivation node tree with active node/branch highlighted */
function cloneTreeWithActive(node: DerivationNode, activePathSet: Set<string>, activeNodeId: string): DerivationNode {
  const isTarget = node.id === activeNodeId;
  const inPath = activePathSet.has(node.id);
  const kept = node.mark === 'mismatch' || node.mark === 'error' || node.mark === 'skipped';
  const mark = kept ? node.mark : isTarget || inPath ? 'current' : node.mark;

  return {
    ...node,
    mark,
    children: node.children ? node.children.map(c => cloneTreeWithActive(c, activePathSet, activeNodeId)) : undefined
  };
}

/** Finds the path of node IDs from root to target */
function findPath(root: DerivationNode, targetId: string, path: string[] = []): string[] | null {
  const currentPath = [...path, root.id];
  if (root.id === targetId) return currentPath;
  if (!root.children) return null;
  for (const child of root.children) {
    const p = findPath(child, targetId, currentPath);
    if (p) return p;
  }
  return null;
}

/**
 * Runs the step-by-step Recursive Descent Simulator.
 */
export function simulateRecursiveDescent(
  inputTokens: string[],
  g: Grammar,
  analysis: GrammarAnalysis,
  actionConfig?: CustomActionConfig,
  maxSteps = 2000
): RDSimulationResult {
  const steps: RDSimulationStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const lexemes = input.map((tok, i) => (i < inputTokens.length ? actionConfig?.lexemes?.[i] ?? tok : tok));
  const leftParse: number[] = [];
  const undeclared: { name: string; step: number }[] = [];
  const redeclared: { name: string; scopeName: string; step: number }[] = [];
  let unnamedIdentifiers = 0;
  const symTab = new SymbolTable('global');
  const keywords = normalizeKeywordConfig(actionConfig?.keywords);

  if (!g.startSymbol) {
    return {
      accepted: false,
      steps: [],
      errorMessage: 'Grammar has no start symbol.',
      errorMessageCz: 'Gramatika nemá počáteční symbol.',
      leftParse: [],
      lexemes,
      undeclared,
      redeclared,
      unnamedIdentifiers
    };
  }

  // Pre-index predict sets for rules
  const predictMap = new Map<number, Set<string>>();
  for (const p of g.productions) {
    predictMap.set(p.id, analysis.predict1.get(p.id) || new Set());
  }

  // Pre-index custom rule actions
  const ruleActionMap = new Map<number, RuleActionDefinition[]>();
  for (const a of actionConfig?.ruleActions ?? []) {
    if (a.actionType === 'none') continue;
    const list = ruleActionMap.get(a.ruleId) || [];
    list.push(a);
    ruleActionMap.set(a.ruleId, list);
  }
  // Names are looked up only when the symbol table is in use
  const tableActive = ruleActionMap.size > 0;
  const isIdentifier = (X: string) => isIdentifierTerminal(X, keywords.idSymbols);
  const isTypeKeyword = (X: string) => keywords.typeKeywords.includes(X.toLowerCase());
  let lastType = '';
  let lastDeclared = '';
  const resolveType = (t: string | undefined) => (t === '$type' ? lastType : t ?? '');

  let nodeIdCounter = 1;
  const rootNode: DerivationNode = {
    id: `rd_node_${nodeIdCounter++}`,
    symbol: g.startSymbol,
    isTerminal: false
  };

  let tokenPos = 0;
  let sym = input[0] ?? END_MARKER;
  let isAccepted = false;
  let isError = false;
  let errorMsg = '';
  let errorMsgCz = '';
  let semanticError = false;
  const stopOnSemanticErrors = actionConfig?.stopOnSemanticErrors ?? true;

  // Error recovery (panic mode with Wirth's stop symbols)
  const recovery = actionConfig?.recovery;
  const maxErrors = recovery?.maxErrors ?? 20;
  // Recovery steps are bounded by the input (every skip reads a symbol) and the calls; leave room for them
  if (recovery) maxSteps += 10 * input.length + 100;
  const errors: RecoveredError[] = [];
  /** A terminal has been read since the last recovery (else a new error is the same one) */
  let readSinceRecovery = true;
  /** The start set of every procedure: the predict sets of its rules */
  const startSets = new Map<string, Set<string>>();
  for (const p of g.productions) {
    const set = startSets.get(p.lhs) ?? new Set<string>();
    for (const a of predictMap.get(p.id) ?? []) set.add(a);
    startSets.set(p.lhs, set);
  }
  const followOf = (nt: string) => recovery?.sets.follow.get(nt) ?? new Set<string>([END_MARKER]);

  const getConsumed = () => input.slice(0, tokenPos);
  const getRemaining = () => input.slice(tokenPos);
  // The current symbol with its text: id (x)
  const shown = (pos: number) => (lexemes[pos] !== input[pos] ? `${input[pos]} (${lexemes[pos]})` : input[pos] ?? END_MARKER);

  const getContext = (): RDContext => ({
    symTab,
    currentLookahead: sym,
    lookaheadIndex: tokenPos,
    consumedTokens: getConsumed(),
    leftParse: [...leftParse],
    stepIndex: steps.length
  });

  const recordStep = (
    callStack: RDCallFrame[],
    activeFunction: string,
    activeFrameId: string,
    activeNodeId: string,
    descEn: string,
    descCz: string,
    extra: Partial<RDSimulationStep> = {}
  ) => {
    if (steps.length >= maxSteps) return;

    const path = findPath(rootNode, activeNodeId) || [activeNodeId];
    const pathSet = new Set(path);
    steps.push({
      step: steps.length,
      callStack: callStack.map(f => ({ ...f })),
      activeFunction,
      activeFrameId,
      currentLookahead: sym,
      lookaheadIndex: tokenPos,
      consumedTokens: getConsumed(),
      remainingTokens: getRemaining(),
      actionDescription: descEn,
      actionDescriptionCz: descCz,
      parseTree: cloneTreeWithActive(rootNode, pathSet, activeNodeId),
      activeNodeId,
      activeBranchPath: path,
      leftParse: [...leftParse],
      symbolTableSnapshot: symTab.snapshot(),
      ...extra
    });
  };

  /** Actions without a position that act when the rule is chosen: custom code, fixed names */
  const executeRuleActions = (p: Production) => {
    for (const act of ruleActionMap.get(p.id) ?? []) {
      try {
        if (act.actionType === 'addSymbol' && act.position === undefined && act.symbolName) {
          symTab.addSymbol(act.symbolName, resolveType(act.symbolType), act.customData || {}, act.symbolKind || 'var', steps.length);
        } else if (act.actionType === 'markType' && act.position === undefined && act.symbolName) {
          symTab.markType(act.symbolName, resolveType(act.symbolType));
        } else if (act.actionType === 'custom' && act.jsCode) {
          // The user's own snippet, run with the context of the simulation
          const fn = new Function('ctx', act.jsCode);
          fn(getContext());
        }
      } catch (err) {
        console.warn(`Error executing custom action for rule ${p.id}:`, err);
      }
    }
  };

  // Stack of active frames
  const callStack: RDCallFrame[] = [];
  let frameCounter = 1;

  // Initial step before descent
  recordStep(
    [],
    'main',
    'frame_0',
    rootNode.id,
    `Starting recursive descent at '${g.startSymbol}' with lookahead '${shown(0)}'`,
    `Zahájení rekurzivního sestupu v '${g.startSymbol}' s aktuálním symbolem '${shown(0)}'`
  );

  /** Registers a syntax error; one found before any terminal was read after a recovery belongs to the previous one */
  const newError = (messageEn: string, messageCz: string): { number: number; isNew: boolean; head: [string, string] } => {
    if (!readSinceRecovery && errors.length > 0) {
      const n = errors[errors.length - 1].number;
      return { number: n, isNew: false, head: [`Error ${n} goes on`, `Pokračuje chyba ${n}`] };
    }
    errors.push({ number: errors.length + 1, position: tokenPos, token: sym, messageEn, messageCz, skipped: 0, popped: 0 });
    readSinceRecovery = false;
    const n = errors.length;
    return { number: n, isNew: true, head: [`Error ${n}`, `Chyba ${n}`] };
  };
  const currentError = () => errors[errors.length - 1];
  /** Too many errors: the descent stops (true when it does) */
  const tooManyErrors = (e: { isNew: boolean; number: number }, frames: RDCallFrame[], fn: string, frameId: string, nodeId: string): boolean => {
    if (!e.isNew || errors.length <= maxErrors) return false;
    isError = true;
    errorMsg = `Too many errors (${maxErrors}): the analysis stops.`;
    errorMsgCz = `Příliš mnoho chyb (${maxErrors}): analýza končí.`;
    recordStep(frames, fn, frameId, nodeId, errorMsg, errorMsgCz, {
      isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz, recovery: { kind: 'giveUp', errorNumber: e.number }
    });
    return true;
  };
  /** Panic mode: input is thrown away (getsym) until a symbol of `until` */
  const skipUntil = (until: (a: string) => boolean, frames: RDCallFrame[], fn: string, frameId: string, nodeId: string, info: Omit<RecoveryInfo, 'kind' | 'errorNumber'>, why: [string, string]) => {
    while (!until(sym)) {
      const tok = sym;
      const text = shown(tokenPos);
      tokenPos++;
      sym = input[tokenPos] ?? END_MARKER;
      currentError().skipped++;
      recordStep(frames, fn, frameId, nodeId,
        `Panic mode: '${text}' is ${why[0]} — thrown away (getsym), the current symbol is now '${shown(tokenPos)}'`,
        `Panický režim: '${text}' ${why[1]} — zahodí se (getsym), aktuální symbol je teď '${shown(tokenPos)}'`,
        { recovery: { kind: 'skip', errorNumber: currentError().number, ...info, token: tok } });
    }
  };
  /** The nearest procedure on the call stack whose FOLLOW holds the symbol: where the parser can go on */
  const followOwner = (a: string): string | undefined => {
    for (let i = callStack.length - 1; i >= 0; i--) if (followOf(callStack[i].functionName).has(a)) return callStack[i].functionName;
    return undefined;
  };

  function parseNonTerminal(nt: string, parentNode: DerivationNode, callerStop: Set<string> = new Set([END_MARKER])): boolean {
    if (isError || steps.length >= maxSteps) return false;

    const frameId = `frame_${frameCounter++}`;
    // Wirth: the stop symbols of this call = FOLLOW(nt) ∪ {$} ∪ the stop symbols of the caller
    const stop = new Set<string>([...followOf(nt), END_MARKER, ...callerStop]);
    const start = startSets.get(nt) ?? new Set<string>();
    const frame: RDCallFrame = {
      id: frameId,
      functionName: nt,
      rhsIndex: 0,
      nodeId: parentNode.id,
      depth: callStack.length,
      ...(recovery ? { stopSet: sortedSymbols(stop), startSet: sortedSymbols(start) } : {})
    };
    callStack.push(frame);
    const caller = () => (callStack.length > 0 ? callStack[callStack.length - 1] : undefined);

    // Hook: onEnter
    actionConfig?.hooks?.onEnter?.(nt, getContext());

    recordStep(
      callStack,
      nt,
      frameId,
      parentNode.id,
      `Call function ${nt}() [lookahead: '${shown(tokenPos)}']${recovery ? `; stop symbols of this call: FOLLOW(${nt}) ∪ {$} ∪ those of the caller = ${setText(stop)}` : ''}`,
      `Volání funkce ${nt}() [aktuální symbol: '${shown(tokenPos)}']${recovery ? `; zastavovací symboly tohoto volání: FOLLOW(${nt}) ∪ {$} ∪ symboly volajícího = ${setText(stop)}` : ''}`
    );

    // Select rule by lookahead
    const ntRules = g.productions.filter(p => p.lhs === nt);
    const findRule = () => ntRules.find(p => predictMap.get(p.id)?.has(sym));
    let matchingRule = findRule();

    if (!matchingRule && recovery) {
      // test(start set, stop set): panic mode at the start of the procedure
      const info = { nonTerminal: nt, syncSet: sortedSymbols(stop), resumeSet: sortedSymbols(start) };
      const e = newError(`${nt}() cannot start with '${shown(tokenPos)}'`, `${nt}() nemůže začínat symbolem '${shown(tokenPos)}'`);
      if (tooManyErrors(e, callStack, nt, frameId, parentNode.id)) {
        callStack.pop();
        return false;
      }
      recordStep(
        callStack,
        nt,
        frameId,
        parentNode.id,
        `${e.head[0]}: ${nt}() cannot start with '${shown(tokenPos)}' — it expects a symbol of its start set ${setText(start)} (the predict sets of its rules). Panic mode — test(start set, stop symbols): input is thrown away until a symbol of the start set (${nt}() goes on) or a stop symbol ${setText(stop)} (${nt}() gives up and returns)`,
        `${e.head[1]}: ${nt}() nemůže začínat symbolem '${shown(tokenPos)}' — očekává symbol ze své množiny začátků ${setText(start)} (množiny řídicích symbolů jejích pravidel). Panický režim — test(začátky, zastavovací symboly): vstup se zahazuje až po symbol z množiny začátků (${nt}() pokračuje) nebo zastavovací symbol ${setText(stop)} (${nt}() se vzdá a vrátí)`,
        { isError: true, recovery: { kind: 'start', errorNumber: e.number, ...info }, recoveryTest: 'entry' }
      );
      skipUntil(a => start.has(a) || stop.has(a), callStack, nt, frameId, parentNode.id, info, [
        `neither in the start set of ${nt} nor a stop symbol`,
        `není v množině začátků ${nt} ani zastavovacím symbolem`
      ]);
      matchingRule = findRule();
      if (matchingRule) {
        recordStep(
          callStack,
          nt,
          frameId,
          parentNode.id,
          `Recovered: '${shown(tokenPos)}' is in the start set of ${nt}: panic mode ends, ${nt}() goes on and chooses its rule`,
          `Zotaveno: '${shown(tokenPos)}' je v množině začátků ${nt}: panický režim končí, ${nt}() pokračuje a vybere pravidlo`,
          { recovery: { kind: 'recovered', errorNumber: currentError().number, ...info, token: sym }, recoveryTest: 'entry' }
        );
      } else {
        // A stop symbol: the procedure gives up and returns, the caller goes on with it
        parentNode.mark = 'error';
        parentNode.children = [{ id: `rd_node_${nodeIdCounter++}`, symbol: '⚠', isTerminal: true, mark: 'error' }];
        currentError().popped++;
        const owner = followOwner(sym);
        callStack.pop();
        const up = caller();
        const where: [string, string] = owner === nt || owner === undefined
          ? [`'${shown(tokenPos)}' ∈ FOLLOW(${nt}) ∪ {$}`, `'${shown(tokenPos)}' ∈ FOLLOW(${nt}) ∪ {$}`]
          : [`'${shown(tokenPos)}' is a stop symbol from the caller ${owner}() ('${shown(tokenPos)}' ∈ FOLLOW(${owner})), so the procedures up to ${owner}() will return as well`,
            `'${shown(tokenPos)}' je zastavovací symbol od volajícího ${owner}() ('${shown(tokenPos)}' ∈ FOLLOW(${owner})), vrátí se tedy i procedury až po ${owner}()`];
        recordStep(
          callStack,
          up?.functionName ?? 'main',
          up?.id ?? 'frame_0',
          parentNode.id,
          `Recovered: ${where[0]} — ${nt}() gives up (its subtree is marked as an error) and returns; ${up ? `${up.functionName}()` : 'the main program'} goes on with '${shown(tokenPos)}'`,
          `Zotaveno: ${where[1]} — ${nt}() se vzdá (její podstrom je označen jako chybný) a vrátí se; ${up ? `${up.functionName}()` : 'hlavní program'} pokračuje symbolem '${shown(tokenPos)}'`,
          { recovery: { kind: 'pop', errorNumber: currentError().number, ...info, token: sym }, recoveryTest: 'entry' }
        );
        return true;
      }
    }

    if (!matchingRule) {
      isError = true;
      errorMsg = `Syntax error in ${nt}(): unexpected symbol '${shown(tokenPos)}'.`;
      errorMsgCz = `Syntaktická chyba ve funkci ${nt}(): neočekávaný symbol '${shown(tokenPos)}'.`;
      parentNode.mark = 'mismatch';

      recordStep(
        callStack,
        nt,
        frameId,
        parentNode.id,
        errorMsg,
        errorMsgCz,
        { isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz }
      );
      callStack.pop();
      return false;
    }

    // Apply rule
    frame.rule = matchingRule;
    leftParse.push(matchingRule.id);

    // Execute semantic rule actions
    executeRuleActions(matchingRule);
    actionConfig?.hooks?.onRule?.(matchingRule, getContext());

    // Populate parse tree children
    if (matchingRule.rhs.length === 0) {
      parentNode.children = [
        {
          id: `rd_node_${nodeIdCounter++}`,
          symbol: 'ε',
          isTerminal: true
        }
      ];
    } else {
      parentNode.children = matchingRule.rhs.map(symbol => ({
        id: `rd_node_${nodeIdCounter++}`,
        symbol,
        isTerminal: g.terminals.has(symbol)
      }));
    }

    recordStep(
      callStack,
      nt,
      frameId,
      parentNode.id,
      `Choose rule ${matchingRule.id}: ${matchingRule.lhs} -> ${matchingRule.rhs.join(' ') || 'ε'}`,
      `Výběr pravidla ${matchingRule.id}: ${matchingRule.lhs} -> ${matchingRule.rhs.join(' ') || 'ε'}`,
      {
        ruleApplied: matchingRule,
        branchChoice: {
          lhs: nt,
          rule: matchingRule,
          lookahead: sym
        }
      }
    );

    // Epsilon rule returns immediately
    if (matchingRule.rhs.length === 0) {
      actionConfig?.hooks?.onExit?.(nt, getContext());
      callStack.pop();
      recordStep(
        callStack,
        callStack.length > 0 ? callStack[callStack.length - 1].functionName : 'main',
        callStack.length > 0 ? callStack[callStack.length - 1].id : 'frame_0',
        parentNode.children[0].id,
        `Derive epsilon (ε) and return from ${nt}()`,
        `Derivace prázdného řetězce (ε) a návrat z ${nt}()`
      );
      return true;
    }

    const last = matchingRule.rhs.length - 1;
    const actions = ruleActionMap.get(matchingRule.id) ?? [];
    const at = (type: RuleActionDefinition['actionType'], i: number, fallback?: number) =>
      actions.filter(a => a.actionType === type && (a.position ?? fallback) === i);
    // Scopes opened by this rule, closed after the symbol closeAfter
    const opened: { id: string; closeAfter: number }[] = [];

    const closeScope = (scopeId: string | undefined, node: DerivationNode) => {
      const active = symTab.getActiveStack();
      if (scopeId !== undefined && !active.some(s => s.id === scopeId)) return;
      // An inner scope that was not closed goes too
      for (;;) {
        const exited = symTab.exitScope();
        if (!exited) return;
        recordStep(
          callStack,
          nt,
          frameId,
          node.id,
          `Exit scope '${exited.name}' (level ${exited.level}); its names are no longer visible`,
          `Konec rozsahu '${exited.name}' (úroveň ${exited.level}); jeho jména už nejsou viditelná`
        );
        if (scopeId === undefined || exited.id === scopeId) return;
      }
    };

    // Process each RHS symbol
    for (let i = 0; i < matchingRule.rhs.length; i++) {
      if (isError || steps.length >= maxSteps) break;

      const X = matchingRule.rhs[i];
      const childNode = parentNode.children[i];
      frame.rhsIndex = i;
      frame.currentSymbol = X;

      for (const act of at('enterScope', i, 0)) {
        const name = (act.scopeName || `scope_${nt}`).replace('$name', lastDeclared).trim() || `scope_${nt}`;
        const sc = symTab.enterScope(name);
        opened.push({ id: sc.id, closeAfter: act.closeAfter ?? last });
        frame.openedScopeId = sc.id;
        recordStep(
          callStack,
          nt,
          frameId,
          childNode.id,
          `Enter scope '${sc.name}' (level ${sc.level}); names declared from now on belong to it`,
          `Vstup do rozsahu '${sc.name}' (úroveň ${sc.level}); jména deklarovaná od teď patří do něj`
        );
      }

      if (g.nonTerminals.has(X)) {
        // Non-terminal: recursive call
        const success = parseNonTerminal(X, childNode, stop);
        if (!success) {
          callStack.pop();
          return false;
        }
      } else {
        // Terminal: expect and match
        recordStep(
          callStack,
          nt,
          frameId,
          childNode.id,
          `Expect terminal '${X}' [current lookahead: '${shown(tokenPos)}']`,
          `Očekává se terminál '${X}' [aktuální symbol: '${shown(tokenPos)}']`
        );

        if (sym === X) {
          const matched = sym;
          const lexeme = lexemes[tokenPos];
          actionConfig?.hooks?.onMatch?.(X, lexeme, getContext());
          tokenPos++;
          sym = input[tokenPos] ?? END_MARKER;
          readSinceRecovery = true;

          // Semantic actions at this symbol: declare the name, or look it up
          let noteEn = '';
          let noteCz = '';
          const extra: Partial<RDSimulationStep> = { matchedToken: matched };
          // A semantic error: the word may be fine syntactically, but a compiler would reject the program
          const semanticFail = (en: string, cz: string) => {
            if (!stopOnSemanticErrors || semanticError) return;
            isError = true;
            semanticError = true;
            errorMsg = `Semantic error: ${en}. The word is correct syntactically so far, but a compiler would reject the program.`;
            errorMsgCz = `Sémantická chyba: ${cz}. Syntakticky je slovo zatím v pořádku, překladač by ale program odmítl.`;
            childNode.mark = 'mismatch';
            Object.assign(extra, { isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz });
          };
          if (isTypeKeyword(X)) lastType = lexeme;
          // id written instead of a name (a word of terminals): it is entered and looked up, but not checked
          const unnamed = lexeme === X;
          const declarations = at('addSymbol', i);
          if (tableActive && unnamed && (declarations.length > 0 || isIdentifier(X))) unnamedIdentifiers++;
          for (const act of declarations) {
            const kind = act.symbolKind || 'var';
            const type = resolveType(act.symbolType);
            const twice = !!symTab.lookupLocal(lexeme);
            // a name declared twice is still entered (marked), so that the table shows both
            const entry = symTab.addSymbol(lexeme, type, act.customData || {}, kind, steps.length);
            lastDeclared = lexeme;
            extra.declared = entry;
            noteEn += `; declare ${kind} '${lexeme}'${type ? ` : ${type}` : ''} in scope '${entry.scopeName}' (level ${entry.scopeLevel})${twice ? ' – already declared in this scope!' : ''}`;
            noteCz += `; deklarace: ${KIND_CZ[kind]} '${lexeme}'${type ? ` : ${type}` : ''} v rozsahu '${entry.scopeName}' (úroveň ${entry.scopeLevel})${twice ? ' – v tomto rozsahu už je deklarováno!' : ''}`;
            if (twice && !unnamed) {
              redeclared.push({ name: lexeme, scopeName: entry.scopeName, step: steps.length });
              semanticFail(
                `the name '${lexeme}' is already declared in scope '${entry.scopeName}' (level ${entry.scopeLevel})`,
                `jméno '${lexeme}' je v rozsahu '${entry.scopeName}' (úroveň ${entry.scopeLevel}) už deklarováno`
              );
            }
          }
          for (const act of at('markType', i)) {
            const type = resolveType(act.symbolType);
            if (symTab.markType(lexeme, type)) {
              noteEn += `; type of '${lexeme}' set to ${type}`;
              noteCz += `; typ '${lexeme}' nastaven na ${type}`;
            }
          }
          if (tableActive && declarations.length === 0 && isIdentifier(X)) {
            const found = symTab.lookup(lexeme);
            if (found) {
              extra.lookup = { name: lexeme, scopeId: found.scope.id, scopeName: found.scope.name, level: found.scope.level, kind: found.entry.kind };
              noteEn += `; the name '${lexeme}' is found: the ${found.entry.kind} of scope '${found.scope.name}' (level ${found.scope.level})`;
              noteCz += `; jméno '${lexeme}' nalezeno: ${KIND_CZ[found.entry.kind]} z rozsahu '${found.scope.name}' (úroveň ${found.scope.level})`;
            } else if (unnamed) {
              extra.lookup = { name: lexeme };
              noteEn += `; '${lexeme}' is the terminal, not a name: it is not checked`;
              noteCz += `; '${lexeme}' je terminál, ne jméno: nekontroluje se`;
            } else {
              extra.lookup = { name: lexeme };
              undeclared.push({ name: lexeme, step: steps.length });
              noteEn += `; the name '${lexeme}' is not declared in any visible scope!`;
              noteCz += `; jméno '${lexeme}' není deklarováno v žádném viditelném rozsahu!`;
              semanticFail(
                `the name '${lexeme}' is not declared in any visible scope`,
                `jméno '${lexeme}' není deklarováno v žádném viditelném rozsahu`
              );
            }
          }

          recordStep(
            callStack,
            nt,
            frameId,
            childNode.id,
            `Matched terminal '${lexeme !== X ? `${X}' (${lexeme})` : `${X}'`}, advance to '${shown(tokenPos)}'${noteEn}`,
            `Úspěšné srovnání terminálu '${lexeme !== X ? `${X}' (${lexeme})` : `${X}'`}, posun vstupu na '${shown(tokenPos)}'${noteCz}`,
            extra
          );
          if (semanticError) {
            callStack.pop();
            return false;
          }
        } else if (recovery) {
          // Wirth: if sym = X then getsym else error — X is taken as missing, the input stays
          const e = newError(`Expected '${X}', found '${shown(tokenPos)}'`, `Očekáván terminál '${X}', nalezeno '${shown(tokenPos)}'`);
          if (tooManyErrors(e, callStack, nt, frameId, childNode.id)) {
            callStack.pop();
            return false;
          }
          childNode.mark = 'error';
          currentError().popped++;
          recordStep(
            callStack,
            nt,
            frameId,
            childNode.id,
            `${e.head[0]}: expected terminal '${X}', found '${shown(tokenPos)}'. Recovery: '${X}' is taken as missing (Wirth: if sym = ${X} then getsym else error) — ${nt}() goes on after it as if it had been read; the input stays at '${shown(tokenPos)}' (recovered)`,
            `${e.head[1]}: očekáván terminál '${X}', nalezeno '${shown(tokenPos)}'. Zotavení: '${X}' se považuje za chybějící (Wirth: if sym = ${X} then getsym else error) — ${nt}() pokračuje za ním, jako by byl přečten; vstup zůstává na '${shown(tokenPos)}' (zotaveno)`,
            { isError: true, recovery: { kind: 'insert', errorNumber: e.number, token: X }, recoveryTest: 'terminal' }
          );
        } else {
          isError = true;
          errorMsg = `Syntax error: expected terminal '${X}', but found '${shown(tokenPos)}'.`;
          errorMsgCz = `Syntaktická chyba: očekáván terminál '${X}', ale nalezen '${shown(tokenPos)}'.`;
          childNode.mark = 'mismatch';

          recordStep(
            callStack,
            nt,
            frameId,
            childNode.id,
            errorMsg,
            errorMsgCz,
            { isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz }
          );
          callStack.pop();
          return false;
        }
      }

      // Scopes that end after this symbol
      for (let k = opened.length - 1; k >= 0; k--) {
        if (opened[k].closeAfter === i) {
          closeScope(opened[k].id, childNode);
          opened.splice(k, 1);
        }
      }
      for (let k = at('exitScope', i, last).length; k > 0; k--) closeScope(undefined, childNode);
    }
    // A scope whose end lies beyond the right-hand side (closeAfter too large) ends with the rule
    for (const o of opened.reverse()) closeScope(o.id, parentNode);

    if (isError || steps.length >= maxSteps) {
      callStack.pop();
      return false;
    }

    // test(stop set, ∅) at the end of the procedure: only a stop symbol may follow it
    let recovered: RecoveryInfo | undefined;
    if (recovery && !stop.has(sym)) {
      const info = { nonTerminal: nt, syncSet: sortedSymbols(stop) };
      const e = newError(`'${shown(tokenPos)}' cannot follow ${nt}`, `'${shown(tokenPos)}' nemůže následovat za ${nt}`);
      if (tooManyErrors(e, callStack, nt, frameId, parentNode.id)) {
        callStack.pop();
        return false;
      }
      recordStep(
        callStack,
        nt,
        frameId,
        parentNode.id,
        `${e.head[0]}: ${nt}() has read its rule, but '${shown(tokenPos)}' cannot follow it — it is not a stop symbol ${setText(stop)} (FOLLOW(${nt}) ∪ {$} ∪ those of the callers). Panic mode — test(stop symbols, ∅) at the end of the procedure: input is thrown away up to a stop symbol`,
        `${e.head[1]}: ${nt}() přečetla své pravidlo, ale '${shown(tokenPos)}' za ní následovat nemůže — není zastavovacím symbolem ${setText(stop)} (FOLLOW(${nt}) ∪ {$} ∪ symboly volajících). Panický režim — test(zastavovací symboly, ∅) na konci procedury: vstup se zahazuje až po zastavovací symbol`,
        { isError: true, recovery: { kind: 'start', errorNumber: e.number, ...info }, recoveryTest: 'exit' }
      );
      skipUntil(a => stop.has(a), callStack, nt, frameId, parentNode.id, info, [`not a stop symbol of ${nt}()`, `není zastavovacím symbolem ${nt}()`]);
      recovered = { kind: 'recovered', errorNumber: currentError().number, ...info, token: sym };
    }

    const owner = recovered ? followOwner(sym) : undefined;
    actionConfig?.hooks?.onExit?.(nt, getContext());
    callStack.pop();

    const goesOn: [string, string] = !recovered ? ['', ''] : owner === undefined || owner === nt
      ? [`Recovered: '${shown(tokenPos)}' ∈ FOLLOW(${nt}) ∪ {$}, panic mode ends. `, `Zotaveno: '${shown(tokenPos)}' ∈ FOLLOW(${nt}) ∪ {$}, panický režim končí. `]
      : [`Recovered: '${shown(tokenPos)}' is a stop symbol from the caller ${owner}() (∈ FOLLOW(${owner})), the procedures up to ${owner}() return. `,
        `Zotaveno: '${shown(tokenPos)}' je zastavovací symbol od volajícího ${owner}() (∈ FOLLOW(${owner})), procedury až po ${owner}() se vrátí. `];
    recordStep(
      callStack,
      callStack.length > 0 ? callStack[callStack.length - 1].functionName : 'main',
      callStack.length > 0 ? callStack[callStack.length - 1].id : 'frame_0',
      parentNode.id,
      `${goesOn[0]}Return from ${nt}()`,
      `${goesOn[1]}Návrat z funkce ${nt}()`,
      recovered ? { recovery: recovered, recoveryTest: 'exit' } : {}
    );

    return true;
  }

  // Run start symbol
  const parseSuccess = parseNonTerminal(g.startSymbol, rootNode);
  const truncated = steps.length >= maxSteps;

  if (parseSuccess && !isError && recovery && sym !== END_MARKER) {
    // main: if sym <> $ then error — the rest of the input is thrown away
    const e = newError(`Expected the end of input, found '${shown(tokenPos)}'`, `Očekáván konec vstupu, nalezeno '${shown(tokenPos)}'`);
    if (!tooManyErrors(e, [], 'main', 'frame_0', rootNode.id)) {
      const info = { syncSet: [END_MARKER] };
      recordStep(
        [],
        'main',
        'frame_0',
        rootNode.id,
        `${e.head[0]}: ${g.startSymbol}() has returned, but the input goes on with '${shown(tokenPos)}' — the main program expects $. Panic mode: the rest of the input is thrown away up to $`,
        `${e.head[1]}: ${g.startSymbol}() se vrátila, ale vstup pokračuje symbolem '${shown(tokenPos)}' — hlavní program očekává $. Panický režim: zbytek vstupu se zahodí až po $`,
        { isError: true, recovery: { kind: 'start', errorNumber: e.number, ...info }, recoveryTest: 'main' }
      );
      skipUntil(a => a === END_MARKER, [], 'main', 'frame_0', rootNode.id, info, ['after the complete word', 'za celým slovem']);
    }
  }

  if (parseSuccess && !isError && errors.length > 0 && sym === END_MARKER) {
    const n = errors.length;
    errorMsg = `${n} syntax error(s); the analysis went on after panic-mode recovery`;
    errorMsgCz = `Syntaktických chyb: ${n}; analýza po zotavení v panickém režimu pokračovala`;
    recordStep(
      [],
      'main',
      'frame_0',
      rootNode.id,
      `End: the input has been read with ${n} error(s); the word is not in L(G)`,
      `Konec: vstup přečten, nalezeno chyb: ${n}; slovo nepatří do L(G)`,
      { isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz, recovery: { kind: 'end', errorNumber: n } }
    );
  } else if (parseSuccess && !isError) {
    if (sym === END_MARKER) {
      isAccepted = true;
      const names = undeclared.length > 0
        ? { en: ` Not declared: ${[...new Set(undeclared.map(u => u.name))].join(', ')}.`, cz: ` Nedeklarováno: ${[...new Set(undeclared.map(u => u.name))].join(', ')}.` }
        : { en: '', cz: '' };
      recordStep(
        [],
        'main',
        'frame_0',
        rootNode.id,
        `Parsing completed successfully! Input word accepted.${names.en}`,
        `Syntaktická analýza úspěšně dokončena! Slovo bylo přijato.${names.cz}`,
        { isAccepted: true }
      );
    } else {
      isError = true;
      errorMsg = `End of input expected ('$'), but remaining symbol '${shown(tokenPos)}' found.`;
      errorMsgCz = `Očekáván konec vstupu ('$'), ale zbývá symbol '${shown(tokenPos)}'.`;
      recordStep(
        [],
        'main',
        'frame_0',
        rootNode.id,
        errorMsg,
        errorMsgCz,
        { isError: true, errorMessage: errorMsg, errorMessageCz: errorMsgCz }
      );
    }
  } else if (truncated && !isError) {
    errorMsg = `The simulation stopped after ${maxSteps} steps; shorten the input.`;
    errorMsgCz = `Simulace se zastavila po ${maxSteps} krocích; zkraťte vstup.`;
  }

  const completedWithErrors = parseSuccess && !isError && errors.length > 0 && sym === END_MARKER;
  return {
    accepted: isAccepted,
    steps,
    errorMessage: isError || completedWithErrors || (truncated && !isAccepted) ? errorMsg : undefined,
    errorMessageCz: isError || completedWithErrors || (truncated && !isAccepted) ? errorMsgCz : undefined,
    finalTree: cloneTreeWithActive(rootNode, new Set(), ''),
    leftParse,
    lexemes,
    undeclared,
    redeclared,
    unnamedIdentifiers,
    truncated: truncated && !isAccepted ? true : undefined,
    semanticError: semanticError || undefined,
    ...(recovery ? { errors, completedWithErrors: completedWithErrors || undefined } : {})
  };
}
