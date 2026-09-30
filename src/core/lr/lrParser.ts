/**
 * LR Bottom-Up Shift-Reduce Simulator & Parse Tree Builder
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LRTable, LRAction, formatAction } from './lrTable';
import { DerivationNode } from '../generator/wordGenerator';

export interface LRParseStep {
  step: number;
  stateStack: number[];
  symbolStack: string[];
  remainingInput: string[];
  action: string;
  production?: Production;
  isError?: boolean;
  isAccepted?: boolean;
  tree?: DerivationNode;
}

export interface LRSimulationResult {
  accepted: boolean;
  steps: LRParseStep[];
  errorMessage?: string;
  finalTree?: DerivationNode;
}

export function simulateLRParse(
  inputTokens: string[],
  g: Grammar,
  table: LRTable,
  maxSteps: number = 200
): LRSimulationResult {
  const steps: LRParseStep[] = [];
  const input = [...inputTokens, END_MARKER];

  const stateStack: number[] = [0];
  const symbolStack: string[] = [END_MARKER];
  const treeStack: DerivationNode[] = [];

  let inputPtr = 0;
  let stepIndex = 0;
  let nodeCounter = 1;

  while (stepIndex < maxSteps) {
    const currentState = stateStack[stateStack.length - 1];
    const lookahead = input[inputPtr];
    const remaining = input.slice(inputPtr);

    const availableActions = table.actionTable.get(currentState)?.get(lookahead) || [];

    if (availableActions.length === 0) {
      steps.push({
        step: stepIndex++,
        stateStack: [...stateStack],
        symbolStack: [...symbolStack],
        remainingInput: remaining,
        action: `Error: No action in ACTION[State ${currentState}, '${lookahead}']`,
        isError: true,
        tree: treeStack.length > 0 ? cloneTree(treeStack[treeStack.length - 1]) : undefined
      });
      return {
        accepted: false,
        steps,
        errorMessage: `Syntax error at token '${lookahead}': no valid action in state ${currentState}.`
      };
    }

    const action = availableActions[0]; // pick first action or conflict resolver

    if (action.type === 'shift') {
      const targetState = action.targetState!;
      stateStack.push(targetState);
      symbolStack.push(lookahead);
      inputPtr++;

      const leafNode: DerivationNode = {
        id: `lr_node_${nodeCounter++}`,
        symbol: lookahead,
        isTerminal: true
      };
      treeStack.push(leafNode);

      steps.push({
        step: stepIndex++,
        stateStack: [...stateStack],
        symbolStack: [...symbolStack],
        remainingInput: remaining,
        action: `Shift: push token '${lookahead}', transition to State ${targetState}`,
        tree: cloneTree(leafNode)
      });
      continue;
    }

    if (action.type === 'reduce') {
      const prod = action.production!;
      const rhsLen = prod.rhs.length;

      // Pop rhsLen items from stacks
      const poppedNodes: DerivationNode[] = [];
      for (let i = 0; i < rhsLen; i++) {
        stateStack.pop();
        symbolStack.pop();
        if (treeStack.length > 0) {
          poppedNodes.unshift(treeStack.pop()!);
        }
      }

      // Non-terminal GOTO
      const topState = stateStack[stateStack.length - 1];
      const gotoState = table.gotoTable.get(topState)?.get(prod.lhs);

      if (gotoState === undefined) {
        steps.push({
          step: stepIndex++,
          stateStack: [...stateStack],
          symbolStack: [...symbolStack],
          remainingInput: remaining,
          action: `Error: Missing GOTO[State ${topState}, '${prod.lhs}']`,
          isError: true
        });
        return {
          accepted: false,
          steps,
          errorMessage: `GOTO table missing transition for non-terminal '${prod.lhs}' from state ${topState}.`
        };
      }

      stateStack.push(gotoState);
      symbolStack.push(prod.lhs);

      // Create parent node
      const parentNode: DerivationNode = {
        id: `lr_node_${nodeCounter++}`,
        symbol: prod.lhs,
        isTerminal: false,
        children: rhsLen === 0
          ? [{ id: `lr_node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
          : poppedNodes
      };
      treeStack.push(parentNode);

      steps.push({
        step: stepIndex++,
        stateStack: [...stateStack],
        symbolStack: [...symbolStack],
        remainingInput: remaining,
        action: `Reduce: ${formatProduction(prod)} -> GOTO State ${gotoState}`,
        production: prod,
        tree: cloneTree(parentNode)
      });
      continue;
    }

    if (action.type === 'accept') {
      const finalTree = treeStack.length > 0 ? treeStack[0] : undefined;
      steps.push({
        step: stepIndex++,
        stateStack: [...stateStack],
        symbolStack: [...symbolStack],
        remainingInput: remaining,
        action: 'Accept: Word successfully parsed!',
        isAccepted: true,
        tree: finalTree ? cloneTree(finalTree) : undefined
      });
      return { accepted: true, steps, finalTree };
    }
  }

  return { accepted: false, steps, errorMessage: 'Maximum simulation steps exceeded.' };
}

function cloneTree(node: DerivationNode): DerivationNode {
  return {
    id: node.id,
    symbol: node.symbol,
    isTerminal: node.isTerminal,
    children: node.children ? node.children.map(cloneTree) : undefined
  };
}
