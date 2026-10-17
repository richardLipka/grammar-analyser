/**
 * Augmented Transition Network (ATN) for ALL(*) Parsing.
 *
 * Implements the ATN data structure based on:
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14, §4.3.
 *
 * Every non-terminal A gets a submachine p_A → p_{A,i} → … → p'_A: a rule start
 * state, one path per production (one state before every right-hand-side symbol
 * and one for the completed production) and a rule stop state. A terminal is an atom edge, a non-terminal B is a rule
 * edge to p_B that remembers the follow (return) state q.
 */

import { Grammar, Production, EPSILON } from '../ast/grammar';

export type ATNStateType = 'RULE_START' | 'RULE_STOP' | 'BASIC';

export interface ATNTransition {
  kind: 'epsilon' | 'atom' | 'rule';
  target: number;
  /** Terminal symbol matched for 'atom' transitions */
  label?: string;
  /** Rule name invoked for 'rule' transitions */
  ruleName?: string;
  /** Follow state to return to after the invoked rule completes */
  followState?: number;
  /** Which production alternative this branch belongs to (for decision branches) */
  alt?: number;
}

export interface ATNState {
  id: number;
  ruleName: string;
  stateType: ATNStateType;
  transitions: ATNTransition[];
  /** Production rule associated with this state, if applicable */
  production?: Production;
  altIndex?: number;
  /** Position of the "dot" in `production` (the state stands before rhs[dot]; rhs.length = completed) */
  dot?: number;
}

export interface ATNDecisionPoint {
  decisionNumber: number;
  nonTerminal: string;
  blockStartState: number;
  blockEndState: number;
  alternatives: {
    alt: number;
    production: Production;
    targetState: number;
  }[];
}

export interface ATN {
  states: ATNState[];
  startSymbol: string;
  ruleToStartState: Map<string, number>;
  ruleToStopState: Map<string, number>;
  decisionPoints: ATNDecisionPoint[];
  nonTerminalToDecision: Map<string, ATNDecisionPoint>;
  /** For every rule B: the follow states q of all edges p –B→ q (call sites of B) */
  ruleFollowers: Map<string, number[]>;
  /** Follow state of the rule edge for rhs[pos] of the alt-th production of lhs, key `lhs|alt|pos` */
  callFollowState: Map<string, number>;
}

export const callSiteKey = (lhs: string, alt: number, pos: number) => `${lhs}|${alt}|${pos}`;

const isEpsilonRhs = (p: Production) => p.rhs.length === 0 || (p.rhs.length === 1 && p.rhs[0] === EPSILON);

/**
 * Builds an Augmented Transition Network (ATN) from a context-free grammar.
 */
export function buildATN(grammar: Grammar): ATN {
  const states: ATNState[] = [];
  const ruleToStartState = new Map<string, number>();
  const ruleToStopState = new Map<string, number>();
  const decisionPoints: ATNDecisionPoint[] = [];
  const nonTerminalToDecision = new Map<string, ATNDecisionPoint>();
  const callFollowState = new Map<string, number>();

  let stateCounter = 0;
  function createState(ruleName: string, stateType: ATNStateType, production?: Production, altIndex?: number, dot?: number): ATNState {
    const s: ATNState = {
      id: stateCounter++,
      ruleName,
      stateType,
      transitions: [],
      production,
      altIndex,
      dot
    };
    states.push(s);
    return s;
  }

  // Pass 1: create rule start and stop states for all non-terminals
  for (const nt of grammar.nonTerminals) {
    const start = createState(nt, 'RULE_START');
    const stop = createState(nt, 'RULE_STOP');
    ruleToStartState.set(nt, start.id);
    ruleToStopState.set(nt, stop.id);
  }

  let decisionCounter = 0;

  /**
   * Path p_{A,i} –X1→ … –Xn→ end_i –ε→ p'_A for production i. Every state on the path
   * stands before one rhs symbol; end_i is the completed item A → X1 … Xn •.
   */
  function buildProductionPath(prod: Production, fromState: ATNState, stopState: ATNState, altNum: number): void {
    fromState.production = prod;
    fromState.altIndex = altNum;
    fromState.dot = 0;
    const rhs = isEpsilonRhs(prod) ? [] : prod.rhs;

    let current = fromState;
    for (let i = 0; i < rhs.length; i++) {
      const sym = rhs[i];
      const nextState = createState(prod.lhs, 'BASIC', prod, altNum, i + 1);

      if (grammar.nonTerminals.has(sym) && ruleToStartState.has(sym)) {
        current.transitions.push({
          kind: 'rule',
          target: ruleToStartState.get(sym)!,
          ruleName: sym,
          followState: nextState.id,
          alt: altNum
        });
        callFollowState.set(callSiteKey(prod.lhs, altNum, i), nextState.id);
      } else {
        // Terminal symbol match (also any symbol that is not a known non-terminal)
        current.transitions.push({ kind: 'atom', target: nextState.id, label: sym, alt: altNum });
      }
      current = nextState;
    }
    current.transitions.push({ kind: 'epsilon', target: stopState.id, alt: altNum });
  }

  // Pass 2: construct networks for each non-terminal
  for (const nt of grammar.nonTerminals) {
    const prods = grammar.productions.filter(p => p.lhs === nt);
    const startState = states[ruleToStartState.get(nt)!];
    const stopState = states[ruleToStopState.get(nt)!];

    if (prods.length === 0) {
      // A non-terminal without productions derives nothing: its submachine has no path to p'_A.
      continue;
    }

    if (prods.length === 1) {
      // The rule start state p_A is also the left edge of its only production.
      buildProductionPath(prods[0], startState, stopState, 1);
      continue;
    }

    // Several productions: decision p_A –ε→ p_{A,i} (Parr et al. 2014, §4.3)
    const decisionInfo: ATNDecisionPoint = {
      decisionNumber: ++decisionCounter,
      nonTerminal: nt,
      blockStartState: startState.id,
      blockEndState: stopState.id,
      alternatives: []
    };
    prods.forEach((prod, idx) => {
      const altNum = idx + 1;
      const altStart = createState(nt, 'BASIC', prod, altNum, 0);
      startState.transitions.push({ kind: 'epsilon', target: altStart.id, alt: altNum });
      decisionInfo.alternatives.push({ alt: altNum, production: prod, targetState: altStart.id });
      buildProductionPath(prod, altStart, stopState, altNum);
    });
    decisionPoints.push(decisionInfo);
    nonTerminalToDecision.set(nt, decisionInfo);
  }

  // Precompute follow-up return states for all rule calls
  const ruleFollowers = new Map<string, number[]>();
  for (const s of states) {
    for (const trans of s.transitions) {
      if (trans.kind === 'rule' && trans.ruleName && trans.followState !== undefined) {
        const list = ruleFollowers.get(trans.ruleName) ?? [];
        if (!list.includes(trans.followState)) list.push(trans.followState);
        ruleFollowers.set(trans.ruleName, list);
      }
    }
  }

  return {
    states,
    startSymbol: grammar.startSymbol,
    ruleToStartState,
    ruleToStopState,
    decisionPoints,
    nonTerminalToDecision,
    ruleFollowers,
    callFollowState
  };
}

/**
 * Readable form of an ATN state as a dotted item (KIV/FJP notation):
 * "A → a • B c" for a state inside a production, p_A for the rule start state
 * (before the choice of a production) and p'_A for the rule stop state.
 */
export function describeATNState(atn: ATN, stateId: number): string {
  const s = atn.states[stateId];
  if (!s) return `#${stateId}`;
  if (s.stateType === 'RULE_STOP') return `p'${s.ruleName}`;
  if (s.production && s.dot !== undefined && !(s.stateType === 'RULE_START' && atn.nonTerminalToDecision.has(s.ruleName))) {
    const rhs = isEpsilonRhs(s.production) ? [] : s.production.rhs;
    const parts = [...rhs.slice(0, s.dot), '•', ...rhs.slice(s.dot)];
    return `${s.production.lhs} → ${parts.join(' ')}`;
  }
  return `p${s.ruleName}`;
}
