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
import { LookaheadDFA, createLookaheadDFA, adaptivePredict, PredictionResult } from './allPredictor';
import { DerivationNode } from '../generator/wordGenerator';

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
  const leftRecursiveRules: string[] = [];
  const reasons: string[] = [];
  const reasonsCz: string[] = [];

  // Check direct left recursion: A -> A alpha
  for (const p of grammar.productions) {
    if (p.rhs.length > 0 && p.rhs[0] === p.lhs) {
      if (!leftRecursiveRules.includes(p.lhs)) {
        leftRecursiveRules.push(p.lhs);
      }
    }
  }

  // Check indirect left recursion via First-sets and nullable paths: A =>+ A alpha
  for (const nt of grammar.nonTerminals) {
    if (leftRecursiveRules.includes(nt)) continue;
    const visited = new Set<string>();
    const stack = [nt];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const prods = grammar.productions.filter(p => p.lhs === current);
      for (const p of prods) {
        for (const sym of p.rhs) {
          if (sym === nt && current !== nt) {
            leftRecursiveRules.push(nt);
            break;
          }
          if (grammar.nonTerminals.has(sym)) {
            stack.push(sym);
            if (!analysis.nullable.has(sym)) break;
          } else {
            break;
          }
        }
      }
    }
  }

  const hasLeftRecursion = leftRecursiveRules.length > 0;
  if (hasLeftRecursion) {
    reasons.push(`Grammar contains left-recursive non-terminals: ${leftRecursiveRules.join(', ')}. Top-down ATN closures require eliminating left recursion first.`);
    reasonsCz.push(`Grammar obsahuje levě rekurzivní neterminály: ${leftRecursiveRules.join(', ')}. Shora dolů orientovaný uzávěr ATN vyžaduje nejprve odstranit levou rekurzi.`);
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
  dfaCacheMap?: Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>
): ALLSimulationResult {
  const dfaCache = dfaCacheMap ?? new Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>();

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

  function cloneTree(node?: DerivationNode): DerivationNode | undefined {
    if (!node) return undefined;
    return {
      ...node,
      children: node.children ? node.children.map(cloneTree).filter((c): c is DerivationNode => !!c) : []
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
          isAmbiguous: pred.isAmbiguous
        };
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
