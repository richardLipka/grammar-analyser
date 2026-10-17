/**
 * Adaptive Lookahead Predictor (Lookahead DFA & ATN Simulation) for ALL(*).
 *
 * Implements dynamic lookahead analysis and DFA cache construction:
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14.
 */

import { ATN, ATNDecisionPoint, ATNState } from './allAtn';

export interface ATNConfig {
  stateId: number;
  alt: number;
  /** Call stack: follow-up return state IDs */
  context: number[];
  /** Rules entered along current epsilon/rule path without token consumption */
  rulesEntered?: number[];
}

export interface DFAState {
  id: number;
  configs: ATNConfig[];
  /** Transitions on terminal symbol -> target DFAState ID */
  edges: Record<string, number>;
  isAcceptState: boolean;
  predictedAlt?: number;
  isAmbiguous?: boolean;
}

export interface LookaheadDFA {
  decisionNumber: number;
  nonTerminal: string;
  startStateId: number;
  states: DFAState[];
}

export interface LookaheadTraceStep {
  stepIndex: number;
  token?: string;
  lookaheadIndex: number;
  dfaStateId: number;
  remainingAlts: number[];
  action: string;
  actionCz: string;
}

export interface PredictionResult {
  predictedAlt: number;
  lookaheadTokens: string[];
  lookaheadDepth: number;
  dfaStateId: number;
  trace: LookaheadTraceStep[];
  isAmbiguous?: boolean;
  error?: string;
}

function configKey(c: ATNConfig): string {
  return `${c.stateId}:${c.alt}:${c.context.join(',')}`;
}

function stateConfigsKey(configs: ATNConfig[]): string {
  const sorted = [...configs].sort((a, b) => {
    if (a.stateId !== b.stateId) return a.stateId - b.stateId;
    if (a.alt !== b.alt) return a.alt - b.alt;
    return a.context.join(',').localeCompare(b.context.join(','));
  });
  return sorted.map(configKey).join('|');
}

/**
 * Computes epsilon-closure of a set of ATN configurations.
 * Protects against infinite left-recursive cycles and stack explosion.
 */
export function computeClosure(initialConfigs: ATNConfig[], atn: ATN): ATNConfig[] {
  const result: ATNConfig[] = [];
  const visited = new Set<string>();
  const queue = [...initialConfigs];

  for (const c of initialConfigs) {
    const key = configKey(c);
    visited.add(key);
    result.push(c);
  }

  const MAX_CONTEXT_DEPTH = 20;
  const MAX_CLOSURE_STEPS = 5000;
  let steps = 0;

  while (queue.length > 0 && steps++ < MAX_CLOSURE_STEPS) {
    const current = queue.shift()!;
    const state = atn.states[current.stateId];
    if (!state) continue;

    // If state is RULE_STOP, return through context stack if not empty
    if (state.stateType === 'RULE_STOP') {
      if (current.context.length > 0) {
        const returnState = current.context[0];
        const nextContext = current.context.slice(1);
        const nextConfig: ATNConfig = {
          stateId: returnState,
          alt: current.alt,
          context: nextContext,
          rulesEntered: current.rulesEntered
        };
        const key = configKey(nextConfig);
        if (!visited.has(key)) {
          visited.add(key);
          result.push(nextConfig);
          queue.push(nextConfig);
        }
      } else {
        // Empty context: follow caller return states (even for startSymbol if called recursively)
        const callers = atn.ruleFollowers.get(state.ruleName) ?? [];
        for (const retState of callers) {
          const nextConfig: ATNConfig = {
            stateId: retState,
            alt: current.alt,
            context: [],
            rulesEntered: current.rulesEntered
          };
          const key = configKey(nextConfig);
          if (!visited.has(key)) {
            visited.add(key);
            result.push(nextConfig);
            queue.push(nextConfig);
          }
        }
      }
      continue;
    }

    // Traverse epsilon and rule transitions
    for (const trans of state.transitions) {
      if (trans.kind === 'epsilon') {
        const nextConfig: ATNConfig = {
          stateId: trans.target,
          alt: current.alt,
          context: current.context,
          rulesEntered: current.rulesEntered
        };
        const key = configKey(nextConfig);
        if (!visited.has(key)) {
          visited.add(key);
          result.push(nextConfig);
          queue.push(nextConfig);
        }
      } else if (trans.kind === 'rule') {
        // Left recursion & cyclic recursion protection:
        // If this rule start state has already been entered along this epsilon-closure path
        // without consuming any input tokens, further traversal is an infinite loop (e.g. A -> A alpha).
        const rulesEntered = current.rulesEntered ?? [];
        if (rulesEntered.includes(trans.target)) {
          continue;
        }
        if (current.context.length >= MAX_CONTEXT_DEPTH) {
          continue;
        }

        const nextContext = trans.followState !== undefined ? [trans.followState, ...current.context] : current.context;
        const nextConfig: ATNConfig = {
          stateId: trans.target,
          alt: current.alt,
          context: nextContext,
          rulesEntered: [...rulesEntered, trans.target]
        };
        const key = configKey(nextConfig);
        if (!visited.has(key)) {
          visited.add(key);
          result.push(nextConfig);
          queue.push(nextConfig);
        }
      }
    }
  }

  return result;
}

/**
 * Advances configurations on a terminal symbol.
 */
export function computeMove(configs: ATNConfig[], symbol: string, atn: ATN): ATNConfig[] {
  const moved: ATNConfig[] = [];
  for (const c of configs) {
    const state = atn.states[c.stateId];
    if (!state) continue;

    // Match $ on start symbol stop state with empty context
    if (symbol === '$' && state.stateType === 'RULE_STOP' && state.ruleName === atn.startSymbol && c.context.length === 0) {
      moved.push({
        stateId: c.stateId,
        alt: c.alt,
        context: c.context
      });
      continue;
    }

    for (const trans of state.transitions) {
      if (trans.kind === 'atom' && trans.label === symbol) {
        moved.push({
          stateId: trans.target,
          alt: c.alt,
          context: c.context
        });
      }
    }
  }
  return computeClosure(moved, atn);
}

/**
 * Creates or retrieves a DFA state corresponding to a set of ATN configurations.
 */
function getOrCreateDFAState(dfa: LookaheadDFA, configs: ATNConfig[], stateKeyMap: Map<string, number>): DFAState {
  const key = stateConfigsKey(configs);
  const existingId = stateKeyMap.get(key);
  if (existingId !== undefined) {
    return dfa.states[existingId];
  }

  const id = dfa.states.length;
  const uniqueAlts = Array.from(new Set(configs.map(c => c.alt))).sort((a, b) => a - b);
  const isAccept = uniqueAlts.length === 1;
  const predictedAlt = isAccept ? uniqueAlts[0] : undefined;

  const newState: DFAState = {
    id,
    configs,
    edges: {},
    isAcceptState: isAccept,
    predictedAlt
  };

  dfa.states.push(newState);
  stateKeyMap.set(key, id);
  return newState;
}

/**
 * Initializes a Lookahead DFA for a decision point.
 */
export function createLookaheadDFA(decision: ATNDecisionPoint, atn: ATN): { dfa: LookaheadDFA; stateKeyMap: Map<string, number> } {
  const dfa: LookaheadDFA = {
    decisionNumber: decision.decisionNumber,
    nonTerminal: decision.nonTerminal,
    startStateId: 0,
    states: []
  };
  const stateKeyMap = new Map<string, number>();

  // Start configurations: initial state of each alternative with empty context
  const initialConfigs: ATNConfig[] = decision.alternatives.map(alt => ({
    stateId: alt.targetState,
    alt: alt.alt,
    context: []
  }));

  const startConfigs = computeClosure(initialConfigs, atn);
  const startState = getOrCreateDFAState(dfa, startConfigs, stateKeyMap);
  dfa.startStateId = startState.id;

  return { dfa, stateKeyMap };
}

/**
 * Dynamically predicts the production alternative for a decision point given input tokens.
 * Materializes DFA states and edges on-demand (dynamic analysis).
 */
export function adaptivePredict(
  decision: ATNDecisionPoint,
  tokens: string[],
  startIndex: number,
  atn: ATN,
  dfa: LookaheadDFA,
  stateKeyMap: Map<string, number>
): PredictionResult {
  const trace: LookaheadTraceStep[] = [];
  const lookaheadTokens: string[] = [];

  let currentState = dfa.states[dfa.startStateId];
  let lookaheadIdx = startIndex;

  trace.push({
    stepIndex: 0,
    lookaheadIndex: lookaheadIdx,
    dfaStateId: currentState.id,
    remainingAlts: Array.from(new Set(currentState.configs.map(c => c.alt))).sort((a, b) => a - b),
    action: `Initial decision state D${decision.decisionNumber} (${decision.nonTerminal}) with ${decision.alternatives.length} alternatives`,
    actionCz: `Výchozí stav rozhodnutí D${decision.decisionNumber} (${decision.nonTerminal}) s ${decision.alternatives.length} alternativami`
  });

  // If initial state is already unambiguous (e.g. only 1 active alt)
  if (currentState.isAcceptState && currentState.predictedAlt !== undefined) {
    return {
      predictedAlt: currentState.predictedAlt,
      lookaheadTokens: [],
      lookaheadDepth: 0,
      dfaStateId: currentState.id,
      trace
    };
  }

  const maxLookahead = 200; // Safety guard against runaway loops
  let depth = 0;

  while (depth < maxLookahead) {
    const symbol = lookaheadIdx < tokens.length ? tokens[lookaheadIdx] : '$';
    lookaheadTokens.push(symbol);
    depth++;

    // Check if transition is already cached in DFA
    let nextStateId = currentState.edges[symbol];
    let nextState: DFAState;

    if (nextStateId !== undefined) {
      nextState = dfa.states[nextStateId];
      trace.push({
        stepIndex: trace.length,
        token: symbol,
        lookaheadIndex: lookaheadIdx,
        dfaStateId: nextState.id,
        remainingAlts: Array.from(new Set(nextState.configs.map(c => c.alt))).sort((a, b) => a - b),
        action: `DFA cache hit on '${symbol}' -> state s${nextState.id}`,
        actionCz: `Nalezen přechod v mezipaměti DFA pro symbol '${symbol}' -> stav s${nextState.id}`
      });
    } else {
      // Simulate ATN configurations
      const nextConfigs = computeMove(currentState.configs, symbol, atn);

      if (nextConfigs.length === 0) {
        // No transitions viable on this symbol
        // Attempt disambiguation by rule priority if viable
        const currentAlts = Array.from(new Set(currentState.configs.map(c => c.alt))).sort((a, b) => a - b);
        if (currentAlts.length > 0) {
          const fallbackAlt = currentAlts[0];
          trace.push({
            stepIndex: trace.length,
            token: symbol,
            lookaheadIndex: lookaheadIdx,
            dfaStateId: currentState.id,
            remainingAlts: [fallbackAlt],
            action: `Lookahead stopped on '${symbol}'. Resolved by alternative priority to alternative ${fallbackAlt}`,
            actionCz: `Pohled dopředu zastaven na '${symbol}'. Vyřešeno prioritou pravidel ve prospěch alternativy ${fallbackAlt}`
          });
          return {
            predictedAlt: fallbackAlt,
            lookaheadTokens,
            lookaheadDepth: depth,
            dfaStateId: currentState.id,
            trace,
            isAmbiguous: true
          };
        }

        trace.push({
          stepIndex: trace.length,
          token: symbol,
          lookaheadIndex: lookaheadIdx,
          dfaStateId: currentState.id,
          remainingAlts: [],
          action: `No viable alternative on lookahead symbol '${symbol}'`,
          actionCz: `Žádná alternativa neodpovídá symbolu dopředu '${symbol}'`
        });
        return {
          predictedAlt: decision.alternatives[0]?.alt ?? 1,
          lookaheadTokens,
          lookaheadDepth: depth,
          dfaStateId: currentState.id,
          trace,
          error: `No viable alternative on lookahead token '${symbol}'`
        };
      }

      nextState = getOrCreateDFAState(dfa, nextConfigs, stateKeyMap);
      currentState.edges[symbol] = nextState.id;

      trace.push({
        stepIndex: trace.length,
        token: symbol,
        lookaheadIndex: lookaheadIdx,
        dfaStateId: nextState.id,
        remainingAlts: Array.from(new Set(nextState.configs.map(c => c.alt))).sort((a, b) => a - b),
        action: `Dynamic simulation on '${symbol}' materialized DFA state s${nextState.id} with ${nextConfigs.length} ATN configurations`,
        actionCz: `Dynamická simulace na '${symbol}' vytvořila stav DFA s${nextState.id} s ${nextConfigs.length} konfiguracemi ATN`
      });
    }

    currentState = nextState;
    lookaheadIdx++;

    // Check if accept state reached
    if (currentState.isAcceptState && currentState.predictedAlt !== undefined) {
      trace.push({
        stepIndex: trace.length,
        lookaheadIndex: lookaheadIdx,
        dfaStateId: currentState.id,
        remainingAlts: [currentState.predictedAlt],
        action: `Unambiguous decision: predicted alternative ${currentState.predictedAlt} (depth: ${depth} token(s))`,
        actionCz: `Jednoznačné rozhodnutí: předpovězena alternativa ${currentState.predictedAlt} (hloubka: ${depth} symbol(ů))`
      });
      return {
        predictedAlt: currentState.predictedAlt,
        lookaheadTokens,
        lookaheadDepth: depth,
        dfaStateId: currentState.id,
        trace
      };
    }

    // Check if all remaining configurations agree on the same production alt
    const remainingAlts = Array.from(new Set(currentState.configs.map(c => c.alt))).sort((a, b) => a - b);
    if (remainingAlts.length === 1) {
      currentState.isAcceptState = true;
      currentState.predictedAlt = remainingAlts[0];
      trace.push({
        stepIndex: trace.length,
        lookaheadIndex: lookaheadIdx,
        dfaStateId: currentState.id,
        remainingAlts: [remainingAlts[0]],
        action: `Resolved to single alternative ${remainingAlts[0]} at lookahead depth ${depth}`,
        actionCz: `Zúženo na jedinou alternativu ${remainingAlts[0]} při hloubce pohledu ${depth}`
      });
      return {
        predictedAlt: remainingAlts[0],
        lookaheadTokens,
        lookaheadDepth: depth,
        dfaStateId: currentState.id,
        trace
      };
    }
  }

  // Precedence fallback if lookahead depth exceeded
  const fallbackAlts = Array.from(new Set(currentState.configs.map(c => c.alt))).sort((a, b) => a - b);
  const chosenAlt = fallbackAlts[0] ?? 1;
  return {
    predictedAlt: chosenAlt,
    lookaheadTokens,
    lookaheadDepth: depth,
    dfaStateId: currentState.id,
    trace,
    isAmbiguous: true
  };
}
