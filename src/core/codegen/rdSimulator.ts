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
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { LLTable } from '../ll/llTable';
import { DerivationNode } from '../generator/wordGenerator';
import {
  SymbolTable,
  SymbolTableSnapshot,
  RuleActionDefinition,
  isIdentifierTerminal,
  isNonIdentifierLiteral
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
  /** Custom JavaScript callback hooks */
  hooks?: {
    onEnter?: (nt: string, ctx: RDContext) => void;
    onRule?: (p: Production, ctx: RDContext) => void;
    onMatch?: (terminal: string, char: string, ctx: RDContext) => void;
    onExit?: (nt: string, ctx: RDContext) => void;
  };
}

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

/** Finds a node by ID in the tree */
function findNode(root: DerivationNode, id: string): DerivationNode | null {
  if (root.id === id) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
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
  maxSteps = 800
): RDSimulationResult {
  const steps: RDSimulationStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const leftParse: number[] = [];
  const symTab = new SymbolTable('global');

  if (!g.startSymbol) {
    return {
      accepted: false,
      steps: [],
      errorMessage: 'Grammar has no start symbol.',
      errorMessageCz: 'Gramatika nemá počáteční symbol.',
      leftParse: []
    };
  }

  // Pre-index predict sets for rules
  const predictMap = new Map<number, Set<string>>();
  for (const p of g.productions) {
    predictMap.set(p.id, analysis.predict1.get(p.id) || new Set());
  }

  // Pre-index custom rule actions
  const ruleActionMap = new Map<number, RuleActionDefinition[]>();
  if (actionConfig?.ruleActions) {
    for (const a of actionConfig.ruleActions) {
      const list = ruleActionMap.get(a.ruleId) || [];
      list.push(a);
      ruleActionMap.set(a.ruleId, list);
    }
  }

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

  const executeRuleActions = (p: Production): string | undefined => {
    const actions = ruleActionMap.get(p.id);
    if (!actions) return undefined;
    const ctx = getContext();
    let openedScopeId: string | undefined;

    for (const act of actions) {
      if (act.actionType === 'none') continue;
      try {
        if (act.actionType === 'enterScope') {
          const sc = symTab.enterScope(act.scopeName || `scope_${p.lhs}`);
          openedScopeId = sc.id;
        } else if (act.actionType === 'exitScope') {
          symTab.exitScope();
        } else if (act.actionType === 'addSymbol') {
          let symName = act.symbolName || 'id';
          if (isIdentifierTerminal(symName) || symName === '$id' || symName === 'x') {
            const idIdx = p.rhs.findIndex(s => isIdentifierTerminal(s));
            if (idIdx >= 0 && input[tokenPos + idIdx]) {
              const candidate = input[tokenPos + idIdx];
              if (!isNonIdentifierLiteral(candidate)) {
                symName = candidate;
              }
            } else {
              const candidate = input[tokenPos];
              if (candidate && !isNonIdentifierLiteral(candidate) && isIdentifierTerminal(candidate)) {
                symName = candidate;
              } else {
                symName = 'id';
              }
            }
          }
          if (symName && symName !== END_MARKER && !isNonIdentifierLiteral(symName)) {
            symTab.addSymbol(symName, act.symbolType || 'var', act.customData || {}, act.symbolKind || 'var', steps.length);
          }
        } else if (act.actionType === 'markType') {
          let symName = act.symbolName || 'id';
          if (isIdentifierTerminal(symName) || symName === '$id' || symName === 'x') {
            const idIdx = p.rhs.findIndex(s => isIdentifierTerminal(s));
            if (idIdx >= 0 && input[tokenPos + idIdx]) {
              const candidate = input[tokenPos + idIdx];
              if (!isNonIdentifierLiteral(candidate)) {
                symName = candidate;
              }
            } else {
              const candidate = input[tokenPos];
              if (candidate && !isNonIdentifierLiteral(candidate) && isIdentifierTerminal(candidate)) {
                symName = candidate;
              } else {
                symName = 'id';
              }
            }
          }
          if (symName && symName !== END_MARKER && !isNonIdentifierLiteral(symName)) {
            symTab.markType(symName, act.symbolType || 'var');
          }
        } else if (act.actionType === 'custom' && act.jsCode) {
          // Controlled execution of user snippet with ctx
          const fn = new Function('ctx', act.jsCode);
          fn(ctx);
        }
      } catch (err) {
        console.warn(`Error executing custom action for rule ${p.id}:`, err);
      }
    }
    return openedScopeId;
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
    `Starting recursive descent at '${g.startSymbol}' with lookahead '${sym}'`,
    `Zahájení rekurzivního sestupu v '${g.startSymbol}' s řídicím symbolem '${sym}'`
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
      `Call function ${nt}() [lookahead: '${sym}']`,
      `Volání funkce ${nt}() [řídicí symbol: '${sym}']`
    );

    // Select rule by lookahead
    const ntRules = g.productions.filter(p => p.lhs === nt);
    const matchingRule = ntRules.find(p => predictMap.get(p.id)?.has(sym));

    if (!matchingRule) {
      isError = true;
      errorMsg = `Syntax error in ${nt}(): unexpected symbol '${sym}'.`;
      errorMsgCz = `Syntaktická chyba ve funkci ${nt}(): neočekávaný symbol '${sym}'.`;
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
    const openedScopeId = executeRuleActions(matchingRule);
    if (openedScopeId) {
      frame.openedScopeId = openedScopeId;
    }
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
      if (frame.openedScopeId && symTab.currentScope()?.id === frame.openedScopeId) {
        symTab.exitScope();
      }
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

    // Process each RHS symbol
    for (let i = 0; i < matchingRule.rhs.length; i++) {
      if (isError || steps.length >= maxSteps) break;

      const X = matchingRule.rhs[i];
      const childNode = parentNode.children[i];
      frame.rhsIndex = i;
      frame.currentSymbol = X;

      if (g.nonTerminals.has(X)) {
        // Non-terminal: recursive call
        const success = parseNonTerminal(X, childNode);
        if (!success) {
          if (frame.openedScopeId && symTab.currentScope()?.id === frame.openedScopeId) {
            symTab.exitScope();
          }
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
          `Expect terminal '${X}' [current lookahead: '${sym}']`,
          `Očekává se terminál '${X}' [aktuální symbol: '${sym}']`
        );

        if (sym === X) {
          const matched = sym;
          actionConfig?.hooks?.onMatch?.(X, matched, getContext());
          tokenPos++;
          sym = input[tokenPos] ?? END_MARKER;

          recordStep(
            callStack,
            nt,
            frameId,
            childNode.id,
            `Matched terminal '${X}', consume and advance lookahead to '${sym}'`,
            `Úspěšné srovnání terminálu '${X}', posun vstupu na '${sym}'`,
            { matchedToken: matched }
          );
        } else {
          isError = true;
          errorMsg = `Syntax error: expected terminal '${X}', but found '${sym}'.`;
          errorMsgCz = `Syntaktická chyba: očekáván terminál '${X}', ale nalezen '${sym}'.`;
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
          if (frame.openedScopeId && symTab.currentScope()?.id === frame.openedScopeId) {
            symTab.exitScope();
          }
          callStack.pop();
          return false;
        }
      }
    }

    // If this frame entered a scope that hasn't been closed by an explicit closer rule,
    // exit it cleanly upon returning from this non-terminal.
    if (frame.openedScopeId && symTab.currentScope()?.id === frame.openedScopeId) {
      const exited = symTab.exitScope();
      if (exited) {
        recordStep(
          callStack,
          nt,
          frameId,
          parentNode.id,
          `Exited scope '${exited.name}' (level ${exited.level}) upon returning from ${nt}()`,
          `Ukončen blok '${exited.name}' (úroveň ${exited.level}) při návratu z ${nt}()`
        );
      }
    }

    actionConfig?.hooks?.onExit?.(nt, getContext());
    callStack.pop();

    if (!isError) {
      recordStep(
        callStack,
        callStack.length > 0 ? callStack[callStack.length - 1].functionName : 'main',
        callStack.length > 0 ? callStack[callStack.length - 1].id : 'frame_0',
        parentNode.id,
        `Return from ${nt}()`,
        `Návrat z funkce ${nt}()`
      );
    }

    return !isError;
  }

  // Run start symbol
  const parseSuccess = parseNonTerminal(g.startSymbol, rootNode);

  if (parseSuccess && !isError) {
    if (sym === END_MARKER) {
      isAccepted = true;
      recordStep(
        [],
        'main',
        'frame_0',
        rootNode.id,
        `Parsing completed successfully! Input word accepted.`,
        `Syntaktická analýza úspěšně dokončena! Slovo bylo přijato.`,
        { isAccepted: true }
      );
    } else {
      isError = true;
      errorMsg = `End of input expected ('$'), but remaining symbol '${sym}' found.`;
      errorMsgCz = `Očekáván konec vstupu ('$'), ale zbývá symbol '${sym}'.`;
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
  }

  return {
    accepted: isAccepted,
    steps,
    errorMessage: isError ? errorMsg : undefined,
    errorMessageCz: isError ? errorMsgCz : undefined,
    finalTree: cloneTreeWithActive(rootNode, new Set(), ''),
    leftParse
  };
}
