/**
 * Augmented Transition Network (ATN) for ALL(*) Parsing.
 *
 * Implements the ATN data structure based on:
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14.
 */

import { Grammar, Production, EPSILON } from '../ast/grammar';

export type ATNStateType = 'RULE_START' | 'RULE_STOP' | 'BLOCK_START' | 'BLOCK_END' | 'BASIC';

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
  ruleFollowers: Map<string, number[]>;
}

/**
 * Builds an Augmented Transition Network (ATN) from a context-free grammar.
 */
export function buildATN(grammar: Grammar): ATN {
  const states: ATNState[] = [];
  const ruleToStartState = new Map<string, number>();
  const ruleToStopState = new Map<string, number>();
  const decisionPoints: ATNDecisionPoint[] = [];
  const nonTerminalToDecision = new Map<string, ATNDecisionPoint>();

  let stateCounter = 0;
  function createState(ruleName: string, stateType: ATNStateType, production?: Production, altIndex?: number): ATNState {
    const s: ATNState = {
      id: stateCounter++,
      ruleName,
      stateType,
      transitions: [],
      production,
      altIndex
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

  // Pass 2: construct networks for each non-terminal
  for (const nt of grammar.nonTerminals) {
    const prods = grammar.productions.filter(p => p.lhs === nt);
    const startState = states[ruleToStartState.get(nt)!];
    const stopState = states[ruleToStopState.get(nt)!];

    if (prods.length === 0) {
      // Empty rule: transition start -> stop via epsilon
      startState.transitions.push({ kind: 'epsilon', target: stopState.id });
      continue;
    }

    if (prods.length === 1) {
      // Single production: direct path from start to stop
      const p = prods[0];
      const endState = buildProductionPath(p, startState, stopState, 1);
      if (endState.id !== stopState.id) {
        endState.transitions.push({ kind: 'epsilon', target: stopState.id });
      }
    } else {
      // Multiple productions: decision block
      const decisionNum = ++decisionCounter;
      const blockStart = createState(nt, 'BLOCK_START');
      const blockEnd = createState(nt, 'BLOCK_END');

      startState.transitions.push({ kind: 'epsilon', target: blockStart.id });

      const decisionInfo: ATNDecisionPoint = {
        decisionNumber: decisionNum,
        nonTerminal: nt,
        blockStartState: blockStart.id,
        blockEndState: blockEnd.id,
        alternatives: []
      };

      prods.forEach((prod, idx) => {
        const altNum = idx + 1;
        const altStart = createState(nt, 'BASIC', prod, altNum);
        blockStart.transitions.push({
          kind: 'epsilon',
          target: altStart.id,
          alt: altNum
        });

        decisionInfo.alternatives.push({
          alt: altNum,
          production: prod,
          targetState: altStart.id
        });

        const altEnd = buildProductionPath(prod, altStart, blockEnd, altNum);
        if (altEnd.id !== blockEnd.id) {
          altEnd.transitions.push({ kind: 'epsilon', target: blockEnd.id, alt: altNum });
        }
      });

      blockEnd.transitions.push({ kind: 'epsilon', target: stopState.id });
      decisionPoints.push(decisionInfo);
      nonTerminalToDecision.set(nt, decisionInfo);
    }
  }

  function buildProductionPath(prod: Production, fromState: ATNState, finalTarget: ATNState, altNum: number): ATNState {
    if (prod.rhs.length === 0 || (prod.rhs.length === 1 && prod.rhs[0] === EPSILON)) {
      // Epsilon production: transition directly to finalTarget
      fromState.transitions.push({ kind: 'epsilon', target: finalTarget.id, alt: altNum });
      return finalTarget;
    }

    let current = fromState;
    for (let i = 0; i < prod.rhs.length; i++) {
      const sym = prod.rhs[i];
      const isLast = i === prod.rhs.length - 1;
      const nextState = isLast ? finalTarget : createState(prod.lhs, 'BASIC', prod, altNum);

      if (grammar.terminals.has(sym)) {
        // Terminal symbol match
        current.transitions.push({
          kind: 'atom',
          target: nextState.id,
          label: sym,
          alt: altNum
        });
      } else if (grammar.nonTerminals.has(sym)) {
        // Rule invocation transition
        const calleeStart = ruleToStartState.get(sym);
        if (calleeStart !== undefined) {
          current.transitions.push({
            kind: 'rule',
            target: calleeStart,
            ruleName: sym,
            followState: nextState.id,
            alt: altNum
          });
        } else {
          current.transitions.push({ kind: 'epsilon', target: nextState.id, alt: altNum });
        }
      } else {
        // Fallback for symbols
        current.transitions.push({
          kind: 'atom',
          target: nextState.id,
          label: sym,
          alt: altNum
        });
      }
      current = nextState;
    }

    return current;
  }

  // Precompute follow-up return states for all rule calls
  const ruleFollowers = new Map<string, number[]>();
  for (const s of states) {
    for (const trans of s.transitions) {
      if (trans.kind === 'rule' && trans.ruleName && trans.followState !== undefined) {
        const list = ruleFollowers.get(trans.ruleName) ?? [];
        list.push(trans.followState);
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
    ruleFollowers
  };
}
