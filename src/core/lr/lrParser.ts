/**
 * LR Bottom-Up Shift-Reduce Simulator & Parse Tree Builder
 *
 * Every step records the configuration (state stack, symbol stack, remaining
 * input) in which the action is taken, as in the textbook trace tables, and
 * the parse forest after the action has been applied.
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LRTable } from './lrTable';
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
  lookupState?: number;
  lookupSymbol?: string;
  gotoState?: number;
  gotoNt?: string;
  /** State on top of the stack after popping |α| entries, i.e. the GOTO row used. */
  gotoFromState?: number;
  isError?: boolean;
  isAccepted?: boolean;
  /** Number of actions in the ACTION cell when it holds a conflict (the first one is used). */
  conflictCount?: number;
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
  maxSteps: number = 500 + 50 * inputTokens.length
): LRSimulationResult {
  const steps: LRParseStep[] = [];
  const input = [...inputTokens, END_MARKER];

  const stateStack: number[] = [0];
  const symbolStack: string[] = [END_MARKER];
  const treeStack: DerivationNode[] = [];

  let inputPtr = 0;
  let stepIndex = 0;
  let nodeCounter = 1;

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

  while (stepIndex < maxSteps) {
    const currentState = stateStack[stateStack.length - 1];
    const lookahead = input[inputPtr];
    const config = {
      stateStack: [...stateStack],
      symbolStack: [...symbolStack],
      remainingInput: input.slice(inputPtr),
      lookupState: currentState,
      lookupSymbol: lookahead
    };

    const availableActions = table.actionTable.get(currentState)?.get(lookahead) || [];

    if (availableActions.length === 0) {
      steps.push({
        step: stepIndex++,
        ...config,
        action: `Error: ACTION[${currentState}, '${lookahead}'] is empty`,
        actionCz: `Chyba: ACTION[${currentState}, '${lookahead}'] je prázdná`,
        isError: true,
        tree: forest()
      });
      return {
        accepted: false,
        steps,
        errorMessage: `Syntax error at token '${lookahead}': no valid action in state ${currentState}.`,
        errorMessageCz: `Syntaktická chyba na symbolu '${lookahead}': ve stavu ${currentState} neexistuje platná akce.`
      };
    }

    const action = availableActions[0];
    const conflictCount = availableActions.length > 1 ? availableActions.length : undefined;
    const conflictNote = conflictCount ? ` (conflict: ${conflictCount} actions in this cell, the first one is used)` : '';
    const conflictNoteCz = conflictCount ? ` (kolize: buňka obsahuje ${conflictCount} akce, použije se první)` : '';

    if (action.type === 'shift') {
      const targetState = action.targetState!;
      stateStack.push(targetState);
      symbolStack.push(lookahead);
      inputPtr++;
      treeStack.push({ id: `lr_node_${nodeCounter++}`, symbol: lookahead, isTerminal: true });

      steps.push({
        step: stepIndex++,
        ...config,
        action: `Shift '${lookahead}', go to state ${targetState}${conflictNote}`,
        actionCz: `Posun (shift) '${lookahead}', přechod do stavu ${targetState}${conflictNoteCz}`,
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
      const gotoState = table.gotoTable.get(topState)?.get(prod.lhs);

      if (gotoState === undefined) {
        steps.push({
          step: stepIndex++,
          ...config,
          action: `Error: GOTO[${topState}, ${prod.lhs}] is empty`,
          actionCz: `Chyba: GOTO[${topState}, ${prod.lhs}] je prázdné`,
          production: prod,
          gotoFromState: topState,
          isError: true,
          tree: forest()
        });
        return {
          accepted: false,
          steps,
          errorMessage: `GOTO table missing transition for non-terminal '${prod.lhs}' from state ${topState}.`,
          errorMessageCz: `V tabulce GOTO chybí přechod pro neterminál '${prod.lhs}' ze stavu ${topState}.`
        };
      }

      stateStack.push(gotoState);
      symbolStack.push(prod.lhs);
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
        action: `Reduce by (${prod.id}) ${formatProduction(prod)}, GOTO[${topState}, ${prod.lhs}] = ${gotoState}${conflictNote}`,
        actionCz: `Redukce podle (${prod.id}) ${formatProduction(prod)}, GOTO[${topState}, ${prod.lhs}] = ${gotoState}${conflictNoteCz}`,
        production: prod,
        gotoState,
        gotoNt: prod.lhs,
        gotoFromState: topState,
        conflictCount,
        tree: forest()
      });
      continue;
    }

    // accept
    const finalTree = treeStack.length > 0 ? treeStack[treeStack.length - 1] : undefined;
    steps.push({
      step: stepIndex++,
      ...config,
      action: 'Accept: the word belongs to L(G)',
      actionCz: 'Přijetí (accept): slovo patří do L(G)',
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
