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
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
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
  /** The simulation stopped at the step limit */
  truncated?: boolean;
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
  const mark = node.mark === 'mismatch' ? 'mismatch' : isTarget || inPath ? 'current' : node.mark;

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
      undeclared
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

  function parseNonTerminal(nt: string, parentNode: DerivationNode): boolean {
    if (isError || steps.length >= maxSteps) return false;

    const frameId = `frame_${frameCounter++}`;
    const frame: RDCallFrame = {
      id: frameId,
      functionName: nt,
      rhsIndex: 0,
      nodeId: parentNode.id,
      depth: callStack.length
    };
    callStack.push(frame);

    // Hook: onEnter
    actionConfig?.hooks?.onEnter?.(nt, getContext());

    recordStep(
      callStack,
      nt,
      frameId,
      parentNode.id,
      `Call function ${nt}() [lookahead: '${shown(tokenPos)}']`,
      `Volání funkce ${nt}() [aktuální symbol: '${shown(tokenPos)}']`
    );

    // Select rule by lookahead
    const ntRules = g.productions.filter(p => p.lhs === nt);
    const matchingRule = ntRules.find(p => predictMap.get(p.id)?.has(sym));

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
        const success = parseNonTerminal(X, childNode);
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

          // Semantic actions at this symbol: declare the name, or look it up
          let noteEn = '';
          let noteCz = '';
          const extra: Partial<RDSimulationStep> = { matchedToken: matched };
          if (isTypeKeyword(X)) lastType = lexeme;
          const declarations = at('addSymbol', i);
          for (const act of declarations) {
            const kind = act.symbolKind || 'var';
            const type = resolveType(act.symbolType);
            const redeclared = !!symTab.lookupLocal(lexeme);
            const entry = symTab.addSymbol(lexeme, type, act.customData || {}, kind, steps.length);
            lastDeclared = lexeme;
            extra.declared = entry;
            noteEn += `; declare ${kind} '${lexeme}'${type ? ` : ${type}` : ''} in scope '${entry.scopeName}' (level ${entry.scopeLevel})${redeclared ? ' – already declared in this scope!' : ''}`;
            noteCz += `; deklarace: ${KIND_CZ[kind]} '${lexeme}'${type ? ` : ${type}` : ''} v rozsahu '${entry.scopeName}' (úroveň ${entry.scopeLevel})${redeclared ? ' – v tomto rozsahu už je deklarováno!' : ''}`;
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
            } else {
              extra.lookup = { name: lexeme };
              undeclared.push({ name: lexeme, step: steps.length });
              noteEn += `; the name '${lexeme}' is not declared in any visible scope!`;
              noteCz += `; jméno '${lexeme}' není deklarováno v žádném viditelném rozsahu!`;
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

    actionConfig?.hooks?.onExit?.(nt, getContext());
    callStack.pop();

    recordStep(
      callStack,
      callStack.length > 0 ? callStack[callStack.length - 1].functionName : 'main',
      callStack.length > 0 ? callStack[callStack.length - 1].id : 'frame_0',
      parentNode.id,
      `Return from ${nt}()`,
      `Návrat z funkce ${nt}()`
    );

    return true;
  }

  // Run start symbol
  const parseSuccess = parseNonTerminal(g.startSymbol, rootNode);
  const truncated = steps.length >= maxSteps;

  if (parseSuccess && !isError) {
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

  return {
    accepted: isAccepted,
    steps,
    errorMessage: isError || (truncated && !isAccepted) ? errorMsg : undefined,
    errorMessageCz: isError || (truncated && !isAccepted) ? errorMsgCz : undefined,
    finalTree: cloneTreeWithActive(rootNode, new Set(), ''),
    leftParse,
    lexemes,
    undeclared,
    truncated: truncated && !isAccepted ? true : undefined
  };
}
