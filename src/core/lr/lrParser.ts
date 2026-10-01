/**
 * LR Bottom-Up Shift-Reduce Simulator & Parse Tree Builder
 *
 * Every step records the configuration (state stack, symbol stack, remaining
 * input) in which the action is taken, as in the textbook trace tables, and
 * the parse forest after the action has been applied.
 *
 * Two algorithms, matching the two table layouts (see lrTable.ts):
 * - lecture: 1. f(X, u) (f(X) for LR(0)) gives shift, reduce i or accept;
 *   2. the symbol Y to push (the terminal read, or the left-hand side of the
 *   rule) selects the next state g(X', Y). Accept needs the whole input read.
 * - dragon: ACTION[s, a] shifts directly to its target state; after a
 *   reduction GOTO[s', A] gives the next state.
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LRTable, LRLayout, LR0_ACTION_COLUMN, stateLabel } from './lrTable';
import { DerivationNode } from '../generator/wordGenerator';

/** Symbol shown at the root of a parse forest with more than one tree. */
export const FOREST_ROOT_SYMBOL = '⋯';

export interface LRParseStep {
  step: number;
  stateStack: number[];
  symbolStack: string[];
  remainingInput: string[];
  action: string;
  actionCz?: string;
  production?: Production;
  /** Row and column of the action looked up (ACTION or f; LR0_ACTION_COLUMN for f of LR(0)). */
  lookupState?: number;
  lookupSymbol?: string;
  /** The transition used: GOTO (dragon, after a reduction) or g (lecture, after every action). */
  gotoState?: number;
  gotoSymbol?: string;
  /** Row of that transition: the top of the stack after popping |α| entries, or the state that shifted. */
  gotoFromState?: number;
  isError?: boolean;
  isAccepted?: boolean;
  /** Number of actions in the ACTION cell when it holds a conflict (the first one is used). */
  conflictCount?: number;
  /** Rule numbers of the reductions so far, including this step (right parse). */
  rightParse: number[];
  /** Parse forest after the action (a single tree, or a synthetic root over the stack trees). */
  tree?: DerivationNode;
}

export interface LRSimulationResult {
  accepted: boolean;
  steps: LRParseStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
}

export function simulateLRParse(
  inputTokens: string[],
  g: Grammar,
  table: LRTable,
  layout: LRLayout = 'dragon',
  maxSteps: number = 500 + 50 * inputTokens.length
): LRSimulationResult {
  const steps: LRParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const lecture = layout === 'lecture';
  const name = (state: number) => stateLabel(table, state, layout);

  const stateStack: number[] = [0];
  const symbolStack: string[] = [END_MARKER];
  const treeStack: DerivationNode[] = [];

  let inputPtr = 0;
  let stepIndex = 0;
  let nodeCounter = 1;
  const rightParse: number[] = [];

  const forest = (): DerivationNode | undefined => {
    if (treeStack.length === 0) return undefined;
    if (treeStack.length === 1) return cloneTree(treeStack[0]);
    return {
      id: 'lr_forest_root',
      symbol: FOREST_ROOT_SYMBOL,
      isTerminal: false,
      isForestRoot: true,
      children: treeStack.map(cloneTree)
    };
  };

  const fail = (step: Omit<LRParseStep, 'step' | 'isError' | 'tree'>, errorMessage: string, errorMessageCz: string): LRSimulationResult => {
    steps.push({ step: stepIndex++, ...step, isError: true, tree: forest() });
    return { accepted: false, steps, errorMessage, errorMessageCz };
  };

  while (stepIndex < maxSteps) {
    const currentState = stateStack[stateStack.length - 1];
    const lookahead = input[inputPtr];
    // LR(0) in the lecture layout decides by the state alone
    const column = lecture && table.variant === 'LR(0)' ? LR0_ACTION_COLUMN : lookahead;
    const config = {
      stateStack: [...stateStack],
      symbolStack: [...symbolStack],
      remainingInput: input.slice(inputPtr),
      lookupState: currentState,
      lookupSymbol: column,
      rightParse: [...rightParse]
    };
    const cell = column === LR0_ACTION_COLUMN ? `f(${name(currentState)})` : lecture
      ? `f(${name(currentState)}, ${lookahead})`
      : `ACTION[${currentState}, '${lookahead}']`;

    const availableActions = (lecture ? table.fTable : table.actionTable).get(currentState)?.get(column) || [];

    if (availableActions.length === 0) {
      return fail({ ...config, action: `Error: ${cell} is empty`, actionCz: `Chyba: ${cell} je prázdná položka` },
        `Syntax error at token '${lookahead}': no valid action in state ${name(currentState)}.`,
        `Syntaktická chyba na symbolu '${lookahead}': ve stavu ${name(currentState)} neexistuje platná akce.`);
    }

    const action = availableActions[0];
    const conflictCount = availableActions.length > 1 ? availableActions.length : undefined;
    const conflictNote = conflictCount ? ` (conflict: ${conflictCount} actions in this cell, the first one is used)` : '';
    const conflictNoteCz = conflictCount ? ` (kolize: buňka obsahuje ${conflictCount} akce, použije se první)` : '';

    if (action.type === 'shift') {
      let targetState = action.targetState;
      if (lecture) {
        // f only says "shift": read the symbol, then g(X, a) gives the state to push
        const g0 = `g(${name(currentState)}, ${lookahead})`;
        if (lookahead === END_MARKER) {
          return fail({ ...config, action: `Error: shift, but the input has been read`, actionCz: `Chyba: přesun, ale vstup je již přečten`, conflictCount },
            `Unexpected end of input in state ${name(currentState)}.`,
            `Neočekávaný konec vstupu ve stavu ${name(currentState)}.`);
        }
        targetState = table.gTable.get(currentState)?.get(lookahead);
        if (targetState === undefined) {
          return fail({ ...config, action: `Shift '${lookahead}'; error: ${g0} is empty`, actionCz: `Přesun '${lookahead}'; chyba: ${g0} je prázdná položka`, gotoFromState: currentState, gotoSymbol: lookahead, conflictCount },
            `Syntax error at token '${lookahead}': state ${name(currentState)} has no transition for it.`,
            `Syntaktická chyba na symbolu '${lookahead}': stav ${name(currentState)} pro něj nemá přechod.`);
        }
      }
      stateStack.push(targetState!);
      symbolStack.push(lookahead);
      inputPtr++;
      treeStack.push({ id: `lr_node_${nodeCounter++}`, symbol: lookahead, isTerminal: true });

      steps.push({
        step: stepIndex++,
        ...config,
        action: lecture
          ? `Shift '${lookahead}', g(${name(currentState)}, ${lookahead}) = ${name(targetState!)}${conflictNote}`
          : `Shift '${lookahead}', go to state ${targetState}${conflictNote}`,
        actionCz: lecture
          ? `Přesun '${lookahead}', g(${name(currentState)}, ${lookahead}) = ${name(targetState!)}${conflictNoteCz}`
          : `Přesun '${lookahead}', přechod do stavu ${targetState}${conflictNoteCz}`,
        ...(lecture ? { gotoFromState: currentState, gotoSymbol: lookahead, gotoState: targetState } : {}),
        conflictCount,
        tree: forest()
      });
      continue;
    }

    if (action.type === 'reduce') {
      const prod = action.production!;
      const rhsLen = prod.rhs.length;

      const poppedNodes: DerivationNode[] = [];
      for (let i = 0; i < rhsLen; i++) {
        stateStack.pop();
        symbolStack.pop();
        if (treeStack.length > 0) {
          poppedNodes.unshift(treeStack.pop()!);
        }
      }

      const topState = stateStack[stateStack.length - 1];
      const gotoState = (lecture ? table.gTable : table.gotoTable).get(topState)?.get(prod.lhs);
      const gotoCell = lecture ? `g(${name(topState)}, ${prod.lhs})` : `GOTO[${topState}, ${prod.lhs}]`;

      if (gotoState === undefined) {
        return fail({ ...config, action: `Error: ${gotoCell} is empty`, actionCz: `Chyba: ${gotoCell} je prázdné`, production: prod, gotoFromState: topState, gotoSymbol: prod.lhs },
          `The transition table has no entry for non-terminal '${prod.lhs}' in state ${name(topState)}.`,
          `V tabulce přechodů chybí položka pro neterminál '${prod.lhs}' ve stavu ${name(topState)}.`);
      }

      stateStack.push(gotoState);
      symbolStack.push(prod.lhs);
      rightParse.push(prod.id);
      treeStack.push({
        id: `lr_node_${nodeCounter++}`,
        symbol: prod.lhs,
        isTerminal: false,
        children: rhsLen === 0
          ? [{ id: `lr_node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
          : poppedNodes
      });

      steps.push({
        step: stepIndex++,
        ...config,
        action: `Reduce by (${prod.id}) ${formatProduction(prod)}, ${gotoCell} = ${name(gotoState)}${conflictNote}`,
        actionCz: `Redukce podle (${prod.id}) ${formatProduction(prod)}, ${lecture ? '' : 'přechod '}${gotoCell} = ${name(gotoState)}${conflictNoteCz}`,
        production: prod,
        gotoState,
        gotoSymbol: prod.lhs,
        gotoFromState: topState,
        conflictCount,
        rightParse: [...rightParse],
        tree: forest()
      });
      continue;
    }

    // accept: only when the whole input has been read (LR(0) decides without looking at it)
    if (lookahead !== END_MARKER) {
      return fail({ ...config, action: `Accept, but the input has not been read: reject`, actionCz: `Přijetí, ale vstup není přečten: odmítnutí`, conflictCount },
        `The parser reached the accepting state ${name(currentState)} before the end of the input.`,
        `Analyzátor dosáhl přijímajícího stavu ${name(currentState)} před koncem vstupu.`);
    }
    const finalTree = treeStack.length > 0 ? treeStack[treeStack.length - 1] : undefined;
    steps.push({
      step: stepIndex++,
      ...config,
      action: 'Accept: the word belongs to L(G)',
      actionCz: 'Přijetí: slovo patří do L(G)',
      isAccepted: true,
      conflictCount,
      tree: forest()
    });
    return { accepted: true, steps, finalTree };
  }

  return {
    accepted: false,
    steps,
    errorMessage: `Stopped after ${maxSteps} steps: the parser loops (a conflict was resolved by a cycle of reductions).`,
    errorMessageCz: `Zastaveno po ${maxSteps} krocích: analyzátor se zacyklil (kolize byla vyřešena cyklem redukcí).`
  };
}

function cloneTree(node: DerivationNode): DerivationNode {
  return {
    id: node.id,
    symbol: node.symbol,
    isTerminal: node.isTerminal,
    isForestRoot: node.isForestRoot,
    children: node.children ? node.children.map(cloneTree) : undefined
  };
}
