/**
 * Canonical Collection of LR Item Sets and Automaton Construction
 * Builds LR(0), SLR(1), LALR(1), and LR(1) automata.
 */

import { Grammar, Production, END_MARKER, cloneGrammar, EPSILON } from '../ast/grammar';
import { GrammarAnalysis, first1OfString } from '../analyser/grammarAnalyser';
import {
  LR0Item, LR1Item,
  lr0ItemKey, lr1ItemKey,
  formatLR0Item, formatLR1Item,
  nextSymbolAfterDot
} from './lrItem';

export type LRVariant = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

export interface LRState {
  id: number;
  items0: LR0Item[];
  items1?: LR1Item[];
  transitions: Map<string, number>; // symbol -> targetStateId
  isAccepting?: boolean;
}

export interface LRAutomaton {
  variant: LRVariant;
  states: LRState[];
  augmentedStartSymbol: string;
  augmentedProduction: Production;
  symbols: string[]; // all non-terminals + terminals
}

/**
 * Augment grammar with S' -> S
 */
export function augmentGrammar(g: Grammar): { grammar: Grammar; augmentedProd: Production } {
  const augmented = cloneGrammar(g);
  let newStart = `${g.startSymbol}'`;
  while (augmented.nonTerminals.has(newStart)) {
    newStart = `${newStart}'`;
  }
  augmented.nonTerminals.add(newStart);

  const augmentedProd: Production = {
    id: 0,
    lhs: newStart,
    rhs: [g.startSymbol]
  };

  augmented.productions.unshift(augmentedProd);
  augmented.startSymbol = newStart;

  return { grammar: augmented, augmentedProd };
}

/**
 * CLOSURE for LR(0) items
 */
export function closure0(items: LR0Item[], g: Grammar): LR0Item[] {
  const result: LR0Item[] = [...items];
  const seen = new Set<string>(items.map(lr0ItemKey));

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...result]) {
      const nextSym = nextSymbolAfterDot(item);
      if (nextSym && g.nonTerminals.has(nextSym)) {
        for (const p of g.productions) {
          if (p.lhs === nextSym) {
            const newItem: LR0Item = { production: p, dotIndex: 0 };
            const key = lr0ItemKey(newItem);
            if (!seen.has(key)) {
              seen.add(key);
              result.push(newItem);
              changed = true;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * GOTO for LR(0) items
 */
export function goto0(items: LR0Item[], symbol: string, g: Grammar): LR0Item[] {
  const moved: LR0Item[] = [];
  for (const item of items) {
    const nextSym = nextSymbolAfterDot(item);
    if (nextSym === symbol) {
      moved.push({
        production: item.production,
        dotIndex: item.dotIndex + 1
      });
    }
  }
  return closure0(moved, g);
}

/**
 * Build LR(0) / SLR(1) Automaton
 */
export function buildLR0Automaton(g: Grammar, variant: 'LR(0)' | 'SLR(1)' = 'LR(0)'): LRAutomaton {
  const { grammar: augGrammar, augmentedProd } = augmentGrammar(g);
  const initialItem: LR0Item = { production: augmentedProd, dotIndex: 0 };
  const initialClosure = closure0([initialItem], augGrammar);

  const states: LRState[] = [];
  const stateKeyMap = new Map<string, number>();

  function makeStateKey(items: LR0Item[]): string {
    return items.map(lr0ItemKey).sort().join('|');
  }

  const allSymbols = [...augGrammar.nonTerminals, ...augGrammar.terminals].filter(s => s !== augGrammar.startSymbol);

  states.push({
    id: 0,
    items0: initialClosure,
    transitions: new Map()
  });
  stateKeyMap.set(makeStateKey(initialClosure), 0);

  let i = 0;
  while (i < states.length) {
    const currentState = states[i];

    for (const sym of allSymbols) {
      const nextItems = goto0(currentState.items0, sym, augGrammar);
      if (nextItems.length > 0) {
        const key = makeStateKey(nextItems);
        let targetId = stateKeyMap.get(key);

        if (targetId === undefined) {
          targetId = states.length;
          stateKeyMap.set(key, targetId);
          states.push({
            id: targetId,
            items0: nextItems,
            transitions: new Map()
          });
        }

        currentState.transitions.set(sym, targetId);
      }
    }
    i++;
  }

  return {
    variant,
    states,
    augmentedStartSymbol: augGrammar.startSymbol,
    augmentedProduction: augmentedProd,
    symbols: allSymbols
  };
}

/**
 * CLOSURE for LR(1) items
 */
export function closure1(items: LR1Item[], g: Grammar, analysis: GrammarAnalysis): LR1Item[] {
  const result: LR1Item[] = [...items];
  const seen = new Set<string>(items.map(lr1ItemKey));

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...result]) {
      const nextSym = nextSymbolAfterDot(item);
      if (nextSym && g.nonTerminals.has(nextSym)) {
        // Lookaheads for B -> . γ are FIRST_1(β a)
        const beta = item.production.rhs.slice(item.dotIndex + 1);
        const betaA = [...beta, item.lookahead];
        const firstBetaA = first1OfString(betaA, analysis.first1, analysis.nullable);

        for (const p of g.productions) {
          if (p.lhs === nextSym) {
            for (const b of firstBetaA) {
              if (b === EPSILON) continue;
              const newItem: LR1Item = {
                production: p,
                dotIndex: 0,
                lookahead: b
              };
              const key = lr1ItemKey(newItem);
              if (!seen.has(key)) {
                seen.add(key);
                result.push(newItem);
                changed = true;
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * GOTO for LR(1) items
 */
export function goto1(items: LR1Item[], symbol: string, g: Grammar, analysis: GrammarAnalysis): LR1Item[] {
  const moved: LR1Item[] = [];
  for (const item of items) {
    const nextSym = nextSymbolAfterDot(item);
    if (nextSym === symbol) {
      moved.push({
        production: item.production,
        dotIndex: item.dotIndex + 1,
        lookahead: item.lookahead
      });
    }
  }
  return closure1(moved, g, analysis);
}

/**
 * Build Canonical LR(1) Automaton
 */
export function buildLR1Automaton(g: Grammar, analysis: GrammarAnalysis): LRAutomaton {
  const { grammar: augGrammar, augmentedProd } = augmentGrammar(g);
  const initialItem: LR1Item = {
    production: augmentedProd,
    dotIndex: 0,
    lookahead: END_MARKER
  };
  const initialClosure = closure1([initialItem], augGrammar, analysis);

  const states: LRState[] = [];
  const stateKeyMap = new Map<string, number>();

  function makeStateKey(items: LR1Item[]): string {
    return items.map(lr1ItemKey).sort().join('|');
  }

  const allSymbols = [...augGrammar.nonTerminals, ...augGrammar.terminals].filter(s => s !== augGrammar.startSymbol);

  states.push({
    id: 0,
    items0: initialClosure.map(it => ({ production: it.production, dotIndex: it.dotIndex })),
    items1: initialClosure,
    transitions: new Map()
  });
  stateKeyMap.set(makeStateKey(initialClosure), 0);

  let i = 0;
  while (i < states.length) {
    const currentState = states[i];

    for (const sym of allSymbols) {
      const nextItems = goto1(currentState.items1!, sym, augGrammar, analysis);
      if (nextItems.length > 0) {
        const key = makeStateKey(nextItems);
        let targetId = stateKeyMap.get(key);

        if (targetId === undefined) {
          targetId = states.length;
          stateKeyMap.set(key, targetId);
          states.push({
            id: targetId,
            items0: nextItems.map(it => ({ production: it.production, dotIndex: it.dotIndex })),
            items1: nextItems,
            transitions: new Map()
          });
        }

        currentState.transitions.set(sym, targetId);
      }
    }
    i++;
  }

  return {
    variant: 'LR(1)',
    states,
    augmentedStartSymbol: augGrammar.startSymbol,
    augmentedProduction: augmentedProd,
    symbols: allSymbols
  };
}

/**
 * Build LALR(1) Automaton by merging LR(1) states sharing identical LR(0) cores
 */
export function buildLALR1Automaton(g: Grammar, analysis: GrammarAnalysis): LRAutomaton {
  const lr1 = buildLR1Automaton(g, analysis);

  // Group states by LR(0) core
  function getCoreKey(items: LR1Item[]): string {
    return items
      .map(it => `${it.production.id}@${it.dotIndex}`)
      .sort()
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .join('|');
  }

  const coreGroups = new Map<string, number[]>(); // coreKey -> array of state ids
  for (const s of lr1.states) {
    const coreKey = getCoreKey(s.items1!);
    if (!coreGroups.has(coreKey)) {
      coreGroups.set(coreKey, []);
    }
    coreGroups.get(coreKey)!.push(s.id);
  }

  // Create mapping from old state ID to new merged state ID
  const oldToNewMap = new Map<number, number>();
  const mergedStates: LRState[] = [];
  let newId = 0;

  for (const group of coreGroups.values()) {
    const firstState = lr1.states[group[0]];

    // Merge lookaheads for identical cores
    const mergedItemMap = new Map<string, Set<string>>(); // "prodId@dotIndex" -> Set of lookaheads
    for (const oldId of group) {
      oldToNewMap.set(oldId, newId);
      const st = lr1.states[oldId];
      for (const item of st.items1!) {
        const core = `${item.production.id}@${item.dotIndex}`;
        if (!mergedItemMap.has(core)) {
          mergedItemMap.set(core, new Set());
        }
        mergedItemMap.get(core)!.add(item.lookahead);
      }
    }

    const mergedItems1: LR1Item[] = [];
    const mergedItems0: LR0Item[] = [];

    for (const item of firstState.items1!) {
      const core = `${item.production.id}@${item.dotIndex}`;
      const lookaheads = mergedItemMap.get(core)!;
      mergedItems0.push({ production: item.production, dotIndex: item.dotIndex });
      for (const la of lookaheads) {
        mergedItems1.push({
          production: item.production,
          dotIndex: item.dotIndex,
          lookahead: la
        });
      }
    }

    mergedStates.push({
      id: newId,
      items0: mergedItems0,
      items1: mergedItems1,
      transitions: new Map() // will repoint next
    });

    newId++;
  }

  // Repoint transitions to merged IDs
  for (const group of coreGroups.values()) {
    const leaderOldId = group[0];
    const leaderState = lr1.states[leaderOldId];
    const newMergedState = mergedStates[oldToNewMap.get(leaderOldId)!];

    for (const [sym, targetOldId] of leaderState.transitions.entries()) {
      newMergedState.transitions.set(sym, oldToNewMap.get(targetOldId)!);
    }
  }

  return {
    variant: 'LALR(1)',
    states: mergedStates,
    augmentedStartSymbol: lr1.augmentedStartSymbol,
    augmentedProduction: lr1.augmentedProduction,
    symbols: lr1.symbols
  };
}
