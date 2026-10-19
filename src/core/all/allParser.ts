/**
 * Interactive ALL(*) Parser & Simulator
 *
 * Top-down parsing with adaptive prediction (Function 1 `parse` of
 * Parr, T., Harwell, S., & Fisher, K. (2014). Adaptive LL(*) Parsing:
 * The Power of Dynamic Analysis. ACM OOPSLA '14, §5.2).
 *
 * The parser keeps the call stack γ of ATN return states (the follow state q of
 * every active rule edge p –B→ q). At a non-terminal with several productions it
 * calls adaptivePredict with that stack: SLL prediction with the lookahead DFA
 * first, full LL with γ when SLL reports a conflict.
 */

import { Grammar, Production, formatProduction, EPSILON } from '../ast/grammar';
import { GrammarAnalysis, computeLeftRecursion, computeNullable } from '../analyser/grammarAnalyser';
import { ATN, buildATN, callSiteKey } from './allAtn';
import {
  LookaheadDFA, DFAClock, createLookaheadDFA, adaptivePredict, PredictionResult,
  LookaheadTraceStep, ATNConfig, describeStack
} from './allPredictor';
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
  /** SLL conflict → full LL prediction with the parser stack */
  usedLL?: boolean;
  /** True ambiguity found by LL, resolved to the minimum alternative */
  isAmbiguous?: boolean;
  ambiguousAlts?: number[];
}

export type ALLStepType =
  | 'decision_start' | 'lookahead_scan' | 'decision_resolved' | 'expand' | 'match' | 'error' | 'accept' | 'limit';

export interface ALLParseStep {
  stepIndex: number;
  inputIndex: number;
  currentToken?: string;
  remainingTokens: string[];
  /** Active non-terminals (outermost first) */
  callStack: string[];
  /** ATN call stack γ of return states (top first), readable */
  atnStack?: string;
  action: string;
  actionCz: string;
  decisionEvent?: ALLDecisionEvent;
  derivationTree?: DerivationNode;
  isMatch?: boolean;
  activeDfaStateId?: number;
  activeDecisionNumber?: number;
  /** DFA edge just followed or added (lookahead scan steps) */
  activeEdge?: { from: number; to: number };
  /** LL configurations of a lookahead step (not stored in the DFA) */
  llConfigs?: ATNConfig[];
  predictionMode?: 'SLL' | 'LL';
  lookaheadTokens?: string[];
  viableAlts?: number[];
  /** Value of the DFA clock: the DFA as it was after this step has the states/edges with createdAt ≤ dfaClock */
  dfaClock: number;
  subStepType?: ALLStepType;
}

export interface ALLParseOptions {
  detailedLookaheadSteps?: boolean;
}

/**
 * accepted: w ∈ L(G) (a derivation tree was built);
 * rejected: syntax error, w ∉ L(G) (ALL(*) is exact for non-left-recursive grammars);
 * limit: a safety limit stopped the run, membership is undecided;
 * notApplicable: the grammar is left-recursive, ALL(*) cannot be used.
 */
export type ALLOutcome = 'accepted' | 'rejected' | 'limit' | 'notApplicable';

export type ALLDfaCache = Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>;

export interface ALLSimulationResult {
  accepted: boolean;
  outcome: ALLOutcome;
  steps: ALLParseStep[];
  finalTree?: DerivationNode;
  maxLookaheadDepth: number;
  decisionsMade: number;
  /** Decisions where SLL found a conflict and LL decided */
  llFallbacks: number;
  /** Decisions where LL found a true ambiguity */
  ambiguities: number;
  /** Lookahead DFA cache after the run */
  dfaCache: ALLDfaCache;
  error?: string;
  errorCz?: string;
}

function leftRecursiveRules(grammar: Grammar, analysis?: GrammarAnalysis): string[] {
  const info = analysis?.leftRecursion ?? computeLeftRecursion(grammar, computeNullable(grammar));
  return Array.from(info.kinds.keys()).sort();
}

/**
 * Checks whether the grammar is compatible with ALL(*) parsing.
 * ALL(*) parses every context-free grammar without left recursion (immediate,
 * indirect or hidden); Parr et al. 2014, §2.2 and Theorem 6.1.
 */
export function checkALLCompatibility(grammar: Grammar, analysis: GrammarAnalysis): ALLCompatibilityResult {
  const lr = leftRecursiveRules(grammar, analysis);
  const reasons: string[] = [];
  const reasonsCz: string[] = [];

  const hasLeftRecursion = lr.length > 0;
  if (hasLeftRecursion) {
    reasons.push(`Grammar contains left-recursive non-terminals: ${lr.join(', ')}. ALL(*) prediction and parsing are top-down; left recursion must be removed first.`);
    reasonsCz.push(`Gramatika obsahuje levě rekurzivní neterminály: ${lr.join(', ')}. Predikce i rozklad ALL(*) postupují shora dolů; levou rekurzi je nutné nejprve odstranit.`);
  }

  const atn = buildATN(grammar);

  return {
    canParse: !hasLeftRecursion,
    hasLeftRecursion,
    leftRecursiveRules: lr,
    reasons,
    reasonsCz,
    atnStateCount: atn.states.length,
    decisionPointCount: atn.decisionPoints.length
  };
}

/** Creates the lookahead DFA (start state D0 only) of every decision, sharing one DFA clock. */
export function createDfaCache(atn: ATN): ALLDfaCache {
  const clock: DFAClock = { now: 0 };
  const cache: ALLDfaCache = new Map();
  for (const dp of atn.decisionPoints) cache.set(dp.decisionNumber, createLookaheadDFA(dp, atn, clock));
  return cache;
}

interface Frame {
  nt: string;
  node: DerivationNode;
  prod: Production;
  alt: number;
  rhs: string[];
  pos: number;
}

/**
 * Simulates ALL(*) parsing of an input token sequence.
 *
 * `dfaCacheMap` may be shared between runs (as in ANTLR, the DFA survives the parse);
 * by default every run starts with fresh DFAs.
 */
export function simulateALLParse(
  tokens: string[],
  grammar: Grammar,
  atn: ATN,
  dfaCacheMap?: ALLDfaCache,
  options?: ALLParseOptions
): ALLSimulationResult {
  // ALL(*) is defined for non-left-recursive grammars only (immediate, indirect or hidden).
  const lr = leftRecursiveRules(grammar);
  if (lr.length > 0) {
    return {
      maxLookaheadDepth: 0,
      decisionsMade: 0,
      llFallbacks: 0,
      ambiguities: 0,
      dfaCache: dfaCacheMap ?? new Map(),
      accepted: false,
      outcome: 'notApplicable',
      steps: [{
        stepIndex: 0,
        inputIndex: 0,
        currentToken: tokens[0],
        remainingTokens: [...tokens],
        callStack: [],
        dfaClock: 0,
        subStepType: 'error',
        action: `ALL(*) is not applicable: the grammar is left-recursive in [${lr.join(', ')}]. Prediction and parsing are top-down, so left recursion must be removed first (Parr, Harwell, Fisher 2014, §2.2). The word was not tested.`,
        actionCz: `ALL(*) nelze použít: gramatika je levě rekurzivní v [${lr.join(', ')}]. Predikce i rozklad postupují shora dolů, levou rekurzi je proto nutné nejprve odstranit (Parr, Harwell, Fisher 2014, §2.2). Slovo nebylo testováno.`
      }],
      error: `Grammar contains left-recursive non-terminals: ${lr.join(', ')}.`,
      errorCz: `Gramatika obsahuje levě rekurzivní neterminály: ${lr.join(', ')}.`
    };
  }

  const dfaCache = dfaCacheMap ?? createDfaCache(atn);
  for (const dp of atn.decisionPoints) {
    if (!dfaCache.has(dp.decisionNumber)) {
      const clock = dfaCache.values().next().value?.dfa.clock ?? { now: 0 };
      dfaCache.set(dp.decisionNumber, createLookaheadDFA(dp, atn, clock));
    }
  }
  const clock: DFAClock = dfaCache.values().next().value?.dfa.clock ?? { now: 0 };

  const base = {
    maxLookaheadDepth: 0,
    decisionsMade: 0,
    llFallbacks: 0,
    ambiguities: 0,
    dfaCache
  };

  const steps: ALLParseStep[] = [];
  let tokenIdx = 0;
  let maxLookahead = 0;
  let decisionsCount = 0;
  let llFallbacks = 0;
  let ambiguities = 0;

  let nodeIdCounter = 0;
  const createTreeNode = (symbol: string, isTerminal: boolean): DerivationNode =>
    ({ id: `all_node_${nodeIdCounter++}`, symbol, isTerminal, children: [] });

  const rootNode = createTreeNode(grammar.startSymbol, false);
  const frames: Frame[] = [];
  /** γ: return states of the active rule calls, top first (the start rule has none) */
  const atnStack: number[] = [];

  // Limits proportional to the input. For a non-left-recursive grammar the nesting
  // depth is at most (n + 1)·|N| (a non-terminal cannot be active twice at the same
  // input position), so the depth limit is never reached by a correct run.
  const n = tokens.length;
  const nts = Math.max(1, grammar.nonTerminals.size);
  const MAX_DEPTH = (n + 1) * nts + 2;
  const MAX_EXPANSIONS = 20000 + 200 * (n + 1) * nts;
  let expansions = 0;

  const snapshot = () => cloneTree(rootNode);
  const callNames = () => frames.map(f => f.nt);
  const gamma = () => describeStack(atn, atnStack);
  const step = (s: Omit<ALLParseStep, 'stepIndex' | 'inputIndex' | 'remainingTokens' | 'callStack' | 'derivationTree' | 'dfaClock' | 'atnStack'> & { dfaClock?: number }) => {
    steps.push({
      stepIndex: steps.length,
      inputIndex: tokenIdx,
      currentToken: tokens[tokenIdx],
      remainingTokens: tokens.slice(tokenIdx),
      callStack: callNames(),
      atnStack: gamma(),
      derivationTree: snapshot(),
      dfaClock: clock.now,
      ...s
    });
  };

  const finish = (outcome: ALLOutcome, error?: string, errorCz?: string): ALLSimulationResult => ({
    ...base,
    accepted: outcome === 'accepted',
    outcome,
    steps,
    finalTree: outcome === 'accepted' ? rootNode : undefined,
    maxLookaheadDepth: maxLookahead,
    decisionsMade: decisionsCount,
    llFallbacks,
    ambiguities,
    error,
    errorCz
  });

  step({
    action: `Initial state: the parser calls the start symbol '${grammar.startSymbol}' with an empty call stack γ = []`,
    actionCz: `Počáteční stav: analyzátor volá startovací symbol '${grammar.startSymbol}' s prázdným zásobníkem volání γ = []`
  });

  /** Chooses and applies a production for `nt`; returns an outcome when the run must stop. */
  function expand(nt: string, node: DerivationNode): { stop?: ALLOutcome; error?: string; errorCz?: string } {
    if (++expansions > MAX_EXPANSIONS || frames.length >= MAX_DEPTH) {
      const what = frames.length >= MAX_DEPTH ? `call depth ${MAX_DEPTH}` : `${MAX_EXPANSIONS} expansions`;
      const whatCz = frames.length >= MAX_DEPTH ? `hloubka volání ${MAX_DEPTH}` : `${MAX_EXPANSIONS} expanzí`;
      step({
        subStepType: 'limit',
        action: `Simulation stopped: safety limit reached (${what}). Membership of the word is undecided.`,
        actionCz: `Simulace zastavena: dosažen bezpečnostní limit (${whatCz}). Příslušnost slova k jazyku není rozhodnuta.`
      });
      return { stop: 'limit', error: `Safety limit reached (${what})`, errorCz: `Dosažen bezpečnostní limit (${whatCz})` };
    }

    const prods = grammar.productions.filter(p => p.lhs === nt);
    if (prods.length === 0) {
      step({
        subStepType: 'error',
        action: `Syntax error: non-terminal '${nt}' has no productions`,
        actionCz: `Syntaktická chyba: neterminál '${nt}' nemá žádná pravidla`
      });
      return { stop: 'rejected', error: `Non-terminal '${nt}' has no productions`, errorCz: `Neterminál '${nt}' nemá žádná pravidla` };
    }

    let alt = 1;
    let decisionEvent: ALLDecisionEvent | undefined;
    const decision = prods.length > 1 ? atn.nonTerminalToDecision.get(nt) : undefined;

    if (decision) {
      decisionsCount++;
      const { dfa, stateKeyMap } = dfaCache.get(decision.decisionNumber)!;
      const pred: PredictionResult = adaptivePredict(decision, tokens, tokenIdx, atn, dfa, stateKeyMap, [...atnStack]);
      maxLookahead = Math.max(maxLookahead, pred.lookaheadDepth);
      if (pred.usedLL) llFallbacks++;
      if (pred.isAmbiguous) ambiguities++;

      if (options?.detailedLookaheadSteps) {
        for (const tr of pred.trace) {
          step({
            subStepType: tr.kind === 'start' ? 'decision_start' : 'lookahead_scan',
            action: `[D${decision.decisionNumber} ${tr.mode}] ${tr.action}`,
            actionCz: `[D${decision.decisionNumber} ${tr.mode}] ${tr.actionCz}`,
            activeDecisionNumber: decision.decisionNumber,
            activeDfaStateId: tr.dfaStateId,
            activeEdge: tr.fromDfaStateId !== undefined && tr.dfaStateId !== undefined ? { from: tr.fromDfaStateId, to: tr.dfaStateId } : undefined,
            llConfigs: tr.configs,
            predictionMode: tr.mode,
            lookaheadTokens: tr.lookahead,
            viableAlts: tr.remainingAlts,
            dfaClock: tr.clock
          });
        }
      }

      if (pred.limitReached) {
        step({
          subStepType: 'limit',
          activeDecisionNumber: decision.decisionNumber,
          action: `Prediction for '${nt}' stopped at a safety limit. Membership of the word is undecided.`,
          actionCz: `Predikce pro '${nt}' zastavena bezpečnostním limitem. Příslušnost slova k jazyku není rozhodnuta.`
        });
        return { stop: 'limit', error: 'Prediction limit reached', errorCz: 'Dosažen limit predikce' };
      }
      if (pred.error) {
        step({
          subStepType: 'error',
          activeDecisionNumber: decision.decisionNumber,
          activeDfaStateId: pred.dfaStateId,
          action: `Syntax error: ${pred.error}`,
          actionCz: `Syntaktická chyba: ${pred.errorCz ?? pred.error}`
        });
        return { stop: 'rejected', error: pred.error, errorCz: pred.errorCz };
      }

      alt = pred.predictedAlt;
      decisionEvent = {
        decisionNumber: decision.decisionNumber,
        nonTerminal: nt,
        predictedAlt: alt,
        production: prods[alt - 1],
        lookaheadTokens: pred.lookaheadTokens,
        lookaheadDepth: pred.lookaheadDepth,
        dfaStateId: pred.dfaStateId,
        trace: pred.trace,
        usedLL: pred.usedLL,
        isAmbiguous: pred.isAmbiguous,
        ambiguousAlts: pred.ambiguousAlts
      };
    }

    const chosenProd = prods[alt - 1];
    const prodStr = formatProduction(chosenProd);
    const rhs = chosenProd.rhs.length === 1 && chosenProd.rhs[0] === EPSILON ? [] : chosenProd.rhs;
    node.children = rhs.length === 0
      ? [createTreeNode(EPSILON, true)]
      : rhs.map(sym => createTreeNode(sym, !grammar.nonTerminals.has(sym)));
    frames.push({ nt, node, prod: chosenProd, alt, rhs, pos: 0 });

    if (decisionEvent) {
      const la = decisionEvent.lookaheadTokens.join(' ');
      const how = decisionEvent.isAmbiguous
        ? { en: `LL found an ambiguity {${decisionEvent.ambiguousAlts?.join(', ')}}, minimum alternative chosen`, cz: `LL našlo nejednoznačnost {${decisionEvent.ambiguousAlts?.join(', ')}}, zvolena nejmenší alternativa` }
        : decisionEvent.usedLL
          ? { en: 'SLL conflict, decided by LL with the call stack', cz: 'konflikt SLL, rozhodlo LL se zásobníkem volání' }
          : { en: 'decided by SLL / lookahead DFA', cz: 'rozhodlo SLL / lookahead DFA' };
      step({
        subStepType: 'decision_resolved',
        decisionEvent,
        activeDecisionNumber: decisionEvent.decisionNumber,
        activeDfaStateId: decisionEvent.dfaStateId,
        predictionMode: decisionEvent.usedLL ? 'LL' : 'SLL',
        action: `Decision D${decisionEvent.decisionNumber} for '${nt}' (lookahead [${la}], ${how.en}) → expand ${prodStr}`,
        actionCz: `Rozhodnutí D${decisionEvent.decisionNumber} pro '${nt}' (pohled dopředu [${la}], ${how.cz}) → expanze ${prodStr}`
      });
    } else {
      step({
        subStepType: 'expand',
        action: `Expand the only production: ${prodStr}`,
        actionCz: `Expanze jediného pravidla: ${prodStr}`
      });
    }
    return {};
  }

  let r = expand(grammar.startSymbol, rootNode);
  if (r.stop) return finish(r.stop, r.error, r.errorCz);

  while (frames.length > 0) {
    const top = frames[frames.length - 1];
    if (top.pos >= top.rhs.length) {
      // p'_B: "return" by popping the follow state (Function 1)
      frames.pop();
      if (frames.length > 0) atnStack.shift();
      continue;
    }
    const sym = top.rhs[top.pos];
    const childNode = top.node.children![top.pos];
    if (!grammar.nonTerminals.has(sym)) {
      const actual = tokenIdx < tokens.length ? tokens[tokenIdx] : undefined;
      if (actual === sym) {
        tokenIdx++;
        top.pos++;
        step({ subStepType: 'match', isMatch: true, action: `Match terminal '${sym}'`, actionCz: `Shoda terminálu '${sym}'` });
      } else {
        step({
          subStepType: 'error',
          action: `Syntax error: expected terminal '${sym}', found '${actual ?? '$'}'`,
          actionCz: `Syntaktická chyba: očekáván terminál '${sym}', nalezen '${actual ?? '$'}'`
        });
        return finish('rejected', `Expected '${sym}', found '${actual ?? '$'}'`, `Očekáván '${sym}', nalezen '${actual ?? '$'}'`);
      }
      continue;
    }
    // Rule edge p –B→ q: push the follow state q and predict a production of B
    const follow = atn.callFollowState.get(callSiteKey(top.nt, top.alt, top.pos));
    top.pos++;
    atnStack.unshift(follow ?? -1);
    r = expand(sym, childNode);
    if (r.stop) return finish(r.stop, r.error, r.errorCz);
  }

  if (tokenIdx < tokens.length) {
    step({
      subStepType: 'error',
      action: `Syntax error: '${grammar.startSymbol}' is complete but the input continues: ${tokens.slice(tokenIdx).join(' ')}`,
      actionCz: `Syntaktická chyba: '${grammar.startSymbol}' je dokončen, ale vstup pokračuje: ${tokens.slice(tokenIdx).join(' ')}`
    });
    return finish('rejected', 'Unexpected tokens after the end of the start symbol', 'Přebývající symboly za koncem startovacího symbolu');
  }

  step({
    subStepType: 'accept',
    action: `Input accepted: the start symbol is complete and the input is read ($). Derivation tree built.`,
    actionCz: `Slovo přijato: startovací symbol je dokončen a vstup přečten ($). Derivační strom je sestaven.`
  });
  return finish('accepted');
}
