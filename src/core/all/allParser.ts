/**
 * Interactive ALL(*) Parser & Simulator
 *
 * Implements the runtime execution and step-by-step top-down simulation
 * with dynamic lookahead analysis:
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14.
 */

import { Grammar, Production, formatProduction, EPSILON } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { ATN, ATNDecisionPoint, buildATN } from './allAtn';
import { LookaheadDFA, createLookaheadDFA, adaptivePredict, PredictionResult, LookaheadTraceStep } from './allPredictor';
import { DerivationNode, cloneTree } from '../generator/wordGenerator';

export interface ALLCompatibilityResult {
  canParse: boolean;
  hasLeftRecursion: boolean;
  leftRecursiveRules: string[];
  reasons: string[];
  reasonsCz: string[];
  atnStateCount: number;
  decisionPointCount: number;
}

export interface ALLDecisionEvent {
  decisionNumber: number;
  nonTerminal: string;
  predictedAlt: number;
  production: Production;
  lookaheadTokens: string[];
  lookaheadDepth: number;
  dfaStateId: number;
  trace?: LookaheadTraceStep[];
  isAmbiguous?: boolean;
}

export interface ALLParseStep {
  stepIndex: number;
  inputIndex: number;
  currentToken?: string;
  remainingTokens: string[];
  callStack: string[];
  action: string;
  actionCz: string;
  decisionEvent?: ALLDecisionEvent;
  derivationTree?: DerivationNode;
  isMatch?: boolean;
  activeDfaStateId?: number;
  activeDecisionNumber?: number;
  lookaheadTokens?: string[];
  viableAlts?: number[];
  subStepType?: 'decision_start' | 'lookahead_scan' | 'decision_resolved' | 'expand' | 'match';
}

export interface ALLParseOptions {
  detailedLookaheadSteps?: boolean;
}

export interface ALLSimulationResult {
  accepted: boolean;
  steps: ALLParseStep[];
  finalTree?: DerivationNode;
  maxLookaheadDepth: number;
  decisionsMade: number;
  error?: string;
  errorCz?: string;
}

/**
 * Checks whether the grammar is compatible with standard ALL(*) top-down parsing.
 * ALL(*) handles all context-free grammars that do not contain direct or indirect left recursion.
 */
export function checkALLCompatibility(grammar: Grammar, analysis: GrammarAnalysis): ALLCompatibilityResult {
  const leftRecursiveRules = analysis.leftRecursion?.kinds
    ? Array.from(analysis.leftRecursion.kinds.keys()).sort()
    : Array.from(new Set(grammar.productions.filter(p => p.rhs.length > 0 && p.rhs[0] === p.lhs).map(p => p.lhs))).sort();

  const reasons: string[] = [];
  const reasonsCz: string[] = [];

  const hasLeftRecursion = leftRecursiveRules.length > 0;
  if (hasLeftRecursion) {
    reasons.push(`Grammar contains left-recursive non-terminals: ${leftRecursiveRules.join(', ')}. Top-down ATN closures require eliminating left recursion first.`);
    reasonsCz.push(`Gramatika obsahuje levě rekurzivní neterminály: ${leftRecursiveRules.join(', ')}. Shora dolů orientovaný uzávěr ATN vyžaduje nejprve odstranit levou rekurzi.`);
  }

  const atn = buildATN(grammar);

  return {
    canParse: !hasLeftRecursion,
    hasLeftRecursion,
    leftRecursiveRules,
    reasons,
    reasonsCz,
    atnStateCount: atn.states.length,
    decisionPointCount: atn.decisionPoints.length
  };
}

/**
 * Simulates ALL(*) parsing on an input token sequence.
 */
export function simulateALLParse(
  tokens: string[],
  grammar: Grammar,
  atn: ATN,
  dfaCacheMap?: Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>,
  options?: ALLParseOptions
): ALLSimulationResult {
  const dfaCache = dfaCacheMap ?? new Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>();

  // Guard against direct left recursion in top-down simulation
  const directLeftRecRules = Array.from(new Set(
    grammar.productions.filter(p => p.rhs.length > 0 && p.rhs[0] === p.lhs).map(p => p.lhs)
  ));
  if (directLeftRecRules.length > 0) {
    return {
      accepted: false,
      steps: [{
        stepIndex: 0,
        inputIndex: 0,
        currentToken: tokens[0],
        remainingTokens: [...tokens],
        callStack: [grammar.startSymbol],
        action: `Parsing halted: Grammar contains left-recursive rule(s) on [${directLeftRecRules.join(', ')}]. ALL(*) is a top-down parsing algorithm and requires eliminating left recursion (Parr, Harwell, Fisher 2014, §3).`,
        actionCz: `Rozklad zastaven: Gramatika obsahuje levě rekurzivní pravidla v neterminálech [${directLeftRecRules.join(', ')}]. ALL(*) je algoritmus shora dolů a vyžaduje předchozí odstranění levé rekurze (Parr, Harwell, Fisher 2014, §3).`,
        derivationTree: undefined
      }],
      maxLookaheadDepth: 0,
      decisionsMade: 0,
      error: `Grammar contains left-recursive non-terminals: ${directLeftRecRules.join(', ')}.`,
      errorCz: `Gramatika obsahuje levě rekurzivní neterminály: ${directLeftRecRules.join(', ')}.`
    };
  }

  // Ensure DFA caches exist for all decision points
  for (const dp of atn.decisionPoints) {
    if (!dfaCache.has(dp.decisionNumber)) {
      dfaCache.set(dp.decisionNumber, createLookaheadDFA(dp, atn));
    }
  }

  const steps: ALLParseStep[] = [];
  let tokenIdx = 0;
  let maxLookahead = 0;
  let decisionsCount = 0;

  let nodeIdCounter = 0;
  function createTreeNode(symbol: string, isTerminal: boolean): DerivationNode {
    return {
      id: `all_node_${nodeIdCounter++}`,
      symbol,
      isTerminal,
      children: []
    };
  }

  const rootNode = createTreeNode(grammar.startSymbol, false);
  const callStack: string[] = [grammar.startSymbol];

  steps.push({
    stepIndex: 0,
    inputIndex: 0,
    currentToken: tokens[0],
    remainingTokens: [...tokens],
    callStack: [...callStack],
    action: `Initial state: ready to parse start symbol '${grammar.startSymbol}'`,
    actionCz: `Počáteční stav: připraveno k rozkladu startovacího symbolu '${grammar.startSymbol}'`,
    derivationTree: cloneTree(rootNode)
  });

  const MAX_PARSE_STEPS = 500;
  let stepCounter = 0;
  const activeCallsAtPos = new Set<string>();

  function parseNonTerminal(nt: string, treeNode: DerivationNode): boolean {
    if (stepCounter++ > MAX_PARSE_STEPS) {
      steps.push({
        stepIndex: steps.length,
        inputIndex: tokenIdx,
        remainingTokens: tokens.slice(tokenIdx),
        callStack: [...callStack],
        action: `Parsing terminated: step limit exceeded (${MAX_PARSE_STEPS})`,
        actionCz: `Rozklad ukončen: překročen limit počtu kroků (${MAX_PARSE_STEPS})`,
        derivationTree: cloneTree(rootNode)
      });
      return false;
    }

    const callKey = `${nt}@${tokenIdx}`;
    if (activeCallsAtPos.has(callKey)) {
      steps.push({
        stepIndex: steps.length,
        inputIndex: tokenIdx,
        remainingTokens: tokens.slice(tokenIdx),
        callStack: [...callStack],
        action: `Parsing halted: recursive depth exceeded for '${nt}' without consuming input (left recursion cycle detected)`,
        actionCz: `Rozklad zastaven: překročena hloubka rekurze pro '${nt}' bez přečtení vstupu (detekován cyklus levé rekurze)`,
        derivationTree: cloneTree(rootNode)
      });
      return false;
    }

    if (callStack.length > 50) {
      steps.push({
        stepIndex: steps.length,
        inputIndex: tokenIdx,
        remainingTokens: tokens.slice(tokenIdx),
        callStack: [...callStack],
        action: `Parsing halted: maximum call stack depth exceeded (50)`,
        actionCz: `Rozklad zastaven: překročena maximální hloubka zásobníku volání (50)`,
        derivationTree: cloneTree(rootNode)
      });
      return false;
    }

    activeCallsAtPos.add(callKey);
    try {
      return doParseNonTerminal(nt, treeNode);
    } finally {
      activeCallsAtPos.delete(callKey);
    }
  }

  function doParseNonTerminal(nt: string, treeNode: DerivationNode): boolean {

    const prods = grammar.productions.filter(p => p.lhs === nt);
    if (prods.length === 0) {
      steps.push({
        stepIndex: steps.length,
        inputIndex: tokenIdx,
        remainingTokens: tokens.slice(tokenIdx),
        callStack: [...callStack],
        action: `Syntax error: non-terminal '${nt}' has no productions`,
        actionCz: `Syntaktická chyba: neterminál '${nt}' nemá žádná pravidla`,
        derivationTree: cloneTree(rootNode)
      });
      return false;
    }

    let chosenProd: Production;
    let decisionEvent: ALLDecisionEvent | undefined;

    if (prods.length === 1) {
      chosenProd = prods[0];
    } else {
      // Multiple productions: adaptive lookahead prediction
      const decision = atn.nonTerminalToDecision.get(nt);
      if (!decision) {
        chosenProd = prods[0];
      } else {
        decisionsCount++;
        const { dfa, stateKeyMap } = dfaCache.get(decision.decisionNumber)!;
        const pred: PredictionResult = adaptivePredict(decision, tokens, tokenIdx, atn, dfa, stateKeyMap);

        if (pred.lookaheadDepth > maxLookahead) {
          maxLookahead = pred.lookaheadDepth;
        }

        const altIndex = pred.predictedAlt - 1;
        chosenProd = prods[altIndex] ?? prods[0];

        decisionEvent = {
          decisionNumber: decision.decisionNumber,
          nonTerminal: nt,
          predictedAlt: pred.predictedAlt,
          production: chosenProd,
          lookaheadTokens: pred.lookaheadTokens,
          lookaheadDepth: pred.lookaheadDepth,
          dfaStateId: pred.dfaStateId,
          trace: pred.trace,
          isAmbiguous: pred.isAmbiguous
        };

        // If detailed lookahead stepping is enabled, emit step-by-step lookahead transitions
        if (options?.detailedLookaheadSteps) {
          steps.push({
            stepIndex: steps.length,
            inputIndex: tokenIdx,
            currentToken: tokens[tokenIdx],
            remainingTokens: tokens.slice(tokenIdx),
            callStack: [...callStack],
            action: `[Lookahead D${decision.decisionNumber}] Start adaptive prediction for '${nt}' in Lookahead DFA at state s0. Viable alternatives: [${prods.map((_, i) => i + 1).join(', ')}]`,
            actionCz: `[Dopředný pohled D${decision.decisionNumber}] Zahájení adaptivní predikce pro '${nt}' v automatu Lookahead DFA ze stavu s0. Živé alternativy: [${prods.map((_, i) => i + 1).join(', ')}]`,
            activeDfaStateId: 0,
            activeDecisionNumber: decision.decisionNumber,
            lookaheadTokens: [],
            viableAlts: prods.map((_, i) => i + 1),
            subStepType: 'decision_start',
            derivationTree: cloneTree(rootNode)
          });

          if (pred.trace && pred.trace.length > 0) {
            for (let tIdx = 0; tIdx < pred.trace.length; tIdx++) {
              const tr = pred.trace[tIdx];
              steps.push({
                stepIndex: steps.length,
                inputIndex: tokenIdx,
                currentToken: tr.token ?? tokens[tokenIdx],
                remainingTokens: tokens.slice(tokenIdx),
                callStack: [...callStack],
                action: `[Lookahead D${decision.decisionNumber}] Scanned token '${tr.token ?? '$'}' -> reached Lookahead DFA state s${tr.dfaStateId}. Viable alternatives: [${tr.remainingAlts.join(', ')}] (${tr.action})`,
                actionCz: `[Dopředný pohled D${decision.decisionNumber}] Přečten token '${tr.token ?? '$'}' -> dosažen stav DFA s${tr.dfaStateId}. Živé alternativy: [${tr.remainingAlts.join(', ')}] (${tr.actionCz})`,
                activeDfaStateId: tr.dfaStateId,
                activeDecisionNumber: decision.decisionNumber,
                lookaheadTokens: pred.lookaheadTokens.slice(0, tIdx + 1),
                viableAlts: tr.remainingAlts,
                subStepType: 'lookahead_scan',
                derivationTree: cloneTree(rootNode)
              });
            }
          }
        }
      }
    }

    const prodStr = formatProduction(chosenProd);

    // Apply production expansion
    if (chosenProd.rhs.length === 0 || (chosenProd.rhs.length === 1 && chosenProd.rhs[0] === EPSILON)) {
      const epsNode = createTreeNode(EPSILON, true);
      treeNode.children = [epsNode];

      steps.push({
        stepIndex: steps.length,
        inputIndex: tokenIdx,
        currentToken: tokens[tokenIdx],
        remainingTokens: tokens.slice(tokenIdx),
        callStack: [...callStack],
        action: decisionEvent
          ? `Adaptive decision D${decisionEvent.decisionNumber}: scanned lookahead [${decisionEvent.lookaheadTokens.join(', ')}] (depth: ${decisionEvent.lookaheadDepth}) -> expand ${prodStr}`
          : `Expand single alternative: ${prodStr}`,
        actionCz: decisionEvent
          ? `Adaptivní rozhodnutí D${decisionEvent.decisionNumber}: přečten dopředný pohled [${decisionEvent.lookaheadTokens.join(', ')}] (hloubka: ${decisionEvent.lookaheadDepth}) -> expanze ${prodStr}`
          : `Expanze jediné alternativy: ${prodStr}`,
        decisionEvent,
        activeDfaStateId: decisionEvent?.dfaStateId,
        activeDecisionNumber: decisionEvent?.decisionNumber,
        subStepType: decisionEvent ? 'decision_resolved' : 'expand',
        derivationTree: cloneTree(rootNode)
      });
      return true;
    }

    // Create child tree nodes
    const childNodes: DerivationNode[] = chosenProd.rhs.map(sym =>
      createTreeNode(sym, grammar.terminals.has(sym))
    );
    treeNode.children = childNodes;

    steps.push({
      stepIndex: steps.length,
      inputIndex: tokenIdx,
      currentToken: tokens[tokenIdx],
      remainingTokens: tokens.slice(tokenIdx),
      callStack: [...callStack],
      action: decisionEvent
        ? `Adaptive decision D${decisionEvent.decisionNumber}: scanned lookahead [${decisionEvent.lookaheadTokens.join(', ')}] (depth: ${decisionEvent.lookaheadDepth}) -> expand ${prodStr}`
        : `Expand single alternative: ${prodStr}`,
      actionCz: decisionEvent
        ? `Adaptivní rozhodnutí D${decisionEvent.decisionNumber}: přečten dopředný pohled [${decisionEvent.lookaheadTokens.join(', ')}] (hloubka: ${decisionEvent.lookaheadDepth}) -> expanze ${prodStr}`
        : `Expanze jediné alternativy: ${prodStr}`,
      decisionEvent,
      activeDfaStateId: decisionEvent?.dfaStateId,
      activeDecisionNumber: decisionEvent?.decisionNumber,
      subStepType: decisionEvent ? 'decision_resolved' : 'expand',
      derivationTree: cloneTree(rootNode)
    });

    // Traverse each symbol on RHS
    for (let i = 0; i < chosenProd.rhs.length; i++) {
      const sym = chosenProd.rhs[i];
      const childNode = childNodes[i];

      if (grammar.terminals.has(sym)) {
        const expected = sym;
        const actual = tokenIdx < tokens.length ? tokens[tokenIdx] : undefined;

        if (actual === expected) {
          tokenIdx++;
          steps.push({
            stepIndex: steps.length,
            inputIndex: tokenIdx,
            currentToken: tokens[tokenIdx],
            remainingTokens: tokens.slice(tokenIdx),
            callStack: [...callStack],
            action: `Match terminal '${expected}'`,
            actionCz: `Shoda terminálu '${expected}'`,
            isMatch: true,
            derivationTree: cloneTree(rootNode)
          });
        } else {
          steps.push({
            stepIndex: steps.length,
            inputIndex: tokenIdx,
            currentToken: actual,
            remainingTokens: tokens.slice(tokenIdx),
            callStack: [...callStack],
            action: `Syntax error: expected terminal '${expected}', found '${actual ?? '$'}'`,
            actionCz: `Syntaktická chyba: očekáván terminál '${expected}', nalezen '${actual ?? '$'}'`,
            derivationTree: cloneTree(rootNode)
          });
          return false;
        }
      } else if (grammar.nonTerminals.has(sym)) {
        callStack.push(sym);
        const ok = parseNonTerminal(sym, childNode);
        callStack.pop();
        if (!ok) return false;
      }
    }

    return true;
  }

  const success = parseNonTerminal(grammar.startSymbol, rootNode);
  const fullyConsumed = tokenIdx === tokens.length;
  const accepted = success && fullyConsumed;

  if (success && !fullyConsumed) {
    steps.push({
      stepIndex: steps.length,
      inputIndex: tokenIdx,
      remainingTokens: tokens.slice(tokenIdx),
      callStack: [],
      action: `Syntax error: unexpected extra tokens after parsing '${grammar.startSymbol}': ${tokens.slice(tokenIdx).join(' ')}`,
      actionCz: `Syntaktická chyba: neočekávané přebývající tokeny za rozkladem '${grammar.startSymbol}': ${tokens.slice(tokenIdx).join(' ')}`,
      derivationTree: cloneTree(rootNode)
    });
  } else if (accepted) {
    steps.push({
      stepIndex: steps.length,
      inputIndex: tokenIdx,
      remainingTokens: [],
      callStack: [],
      action: `Input accepted! Full parse tree successfully constructed via ALL(*) dynamic lookahead.`,
      actionCz: `Slovo přijato! Kompletní derivační strom úspěšně zkonstruován pomocí dynamického pohledu ALL(*).`,
      derivationTree: cloneTree(rootNode)
    });
  }

  return {
    accepted,
    steps,
    finalTree: accepted ? rootNode : undefined,
    maxLookaheadDepth: maxLookahead,
    decisionsMade: decisionsCount,
    error: accepted ? undefined : 'Input was rejected by ALL(*) parser'
  };
}
