/**
 * LL(1) Top-Down Stack Simulator & Parse Tree Builder
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LLTable } from './llTable';
import { DerivationNode } from '../generator/wordGenerator';

export interface LLParseStep {
  step: number;
  stack: string[];
  remainingInput: string[];
  action: string;
  actionCz?: string;
  production?: Production;
  matchedToken?: string;
  lookupNt?: string;
  lookupTerminal?: string;
  isError?: boolean;
  isAccepted?: boolean;
  /** Number of productions in the table cell when it holds a conflict (the first one is used). */
  conflictCount?: number;
  tree: DerivationNode;
}

export interface LLSimulationResult {
  accepted: boolean;
  steps: LLParseStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
}

export function simulateLLParse(
  inputTokens: string[],
  g: Grammar,
  llTable: LLTable,
  maxSteps: number = 500 + 50 * inputTokens.length
): LLSimulationResult {
  const steps: LLParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  
  if (!g.startSymbol) {
    return {
      accepted: false,
      steps: [],
      errorMessage: 'Grammar has no start symbol.',
      errorMessageCz: 'Gramatika nemá počáteční symbol.'
    };
  }

  // Tree node management
  let nodeCounter = 1;
  interface TreeStackItem {
    symbol: string;
    node: DerivationNode;
  }

  const rootNode: DerivationNode = {
    id: `ll_node_${nodeCounter++}`,
    symbol: g.startSymbol,
    isTerminal: false
  };

  const stack: TreeStackItem[] = [
    { symbol: END_MARKER, node: { id: `ll_node_${nodeCounter++}`, symbol: END_MARKER, isTerminal: true } },
    { symbol: g.startSymbol, node: rootNode }
  ];

  let inputPtr = 0;
  let stepIndex = 0;

  while (stepIndex < maxSteps) {
    const currentStackSymbols = stack.map(s => s.symbol);
    const currentRemaining = input.slice(inputPtr);
    const top = stack[stack.length - 1];
    const lookahead = input[inputPtr];

    // Case 1: Stack is empty or only $ remains
    if (!top) {
      if (lookahead === END_MARKER) {
        steps.push({
          step: stepIndex++,
          stack: [],
          remainingInput: currentRemaining,
          action: 'Accept: Input successfully parsed!',
          actionCz: 'Přijato: Vstup byl úspěšně analyzován!',
          isAccepted: true,
          tree: cloneTree(rootNode)
        });
        return { accepted: true, steps, finalTree: rootNode };
      } else {
        steps.push({
          step: stepIndex++,
          stack: [],
          remainingInput: currentRemaining,
          action: `Error: Stack empty but unconsumed input '${lookahead}'`,
          actionCz: `Chyba: Zásobník je prázdný, ale zbývá nezpracovaný vstup '${lookahead}'`,
          isError: true,
          tree: cloneTree(rootNode)
        });
        return {
          accepted: false,
          steps,
          errorMessage: `Unconsumed input '${lookahead}'`,
          errorMessageCz: `Nezpracovaný vstup '${lookahead}'`
        };
      }
    }

    // Case 2: Top of stack is $
    if (top.symbol === END_MARKER) {
      if (lookahead === END_MARKER) {
        steps.push({
          step: stepIndex++,
          stack: currentStackSymbols,
          remainingInput: currentRemaining,
          action: 'Accept: Input successfully parsed!',
          actionCz: 'Přijato: Vstup byl úspěšně analyzován!',
          isAccepted: true,
          tree: cloneTree(rootNode)
        });
        return { accepted: true, steps, finalTree: rootNode };
      } else {
        steps.push({
          step: stepIndex++,
          stack: currentStackSymbols,
          remainingInput: currentRemaining,
          action: `Error: Expected end of input, found '${lookahead}'`,
          actionCz: `Chyba: Očekáván konec vstupu, nalezeno '${lookahead}'`,
          isError: true,
          tree: cloneTree(rootNode)
        });
        return {
          accepted: false,
          steps,
          errorMessage: `Expected end of input, found '${lookahead}'`,
          errorMessageCz: `Očekáván konec vstupu, nalezeno '${lookahead}'`
        };
      }
    }

    // Case 3: Top of stack is a Terminal
    if (g.terminals.has(top.symbol)) {
      if (top.symbol === lookahead) {
        // Match!
        const matched = stack.pop()!;
        inputPtr++;
        steps.push({
          step: stepIndex++,
          stack: currentStackSymbols,
          remainingInput: currentRemaining,
          action: `Match terminal '${matched.symbol}'`,
          actionCz: `Shoda s terminálem '${matched.symbol}'`,
          matchedToken: matched.symbol,
          lookupTerminal: lookahead,
          tree: cloneTree(rootNode)
        });
        continue;
      } else {
        steps.push({
          step: stepIndex++,
          stack: currentStackSymbols,
          remainingInput: currentRemaining,
          action: `Error: Expected terminal '${top.symbol}', found '${lookahead}'`,
          actionCz: `Chyba: Očekáván terminál '${top.symbol}', nalezeno '${lookahead}'`,
          isError: true,
          tree: cloneTree(rootNode)
        });
        return {
          accepted: false,
          steps,
          errorMessage: `Expected '${top.symbol}', found '${lookahead}'`,
          errorMessageCz: `Očekáván terminál '${top.symbol}', nalezeno '${lookahead}'`
        };
      }
    }

    // Case 4: Top of stack is a Non-Terminal
    if (g.nonTerminals.has(top.symbol)) {
      const candidates = llTable.table1.get(top.symbol)?.get(lookahead) || [];

      if (candidates.length === 0) {
        steps.push({
          step: stepIndex++,
          stack: currentStackSymbols,
          remainingInput: currentRemaining,
          action: `Error: No production for M[${top.symbol}, ${lookahead}]`,
          actionCz: `Chyba: V tabulce neexistuje pravidlo pro M[${top.symbol}, ${lookahead}]`,
          isError: true,
          tree: cloneTree(rootNode)
        });
        return {
          accepted: false,
          steps,
          errorMessage: `No rule in parse table for non-terminal '${top.symbol}' with lookahead '${lookahead}'`,
          errorMessageCz: `V rozkladové tabulce neexistuje pravidlo pro neterminál '${top.symbol}' se symbolem '${lookahead}'`
        };
      }

      const prod = candidates[0]; // pick first (or deterministic LL1)
      const popped = stack.pop()!;

      // Attach children to tree node
      if (prod.rhs.length === 0) {
        popped.node.children = [{
          id: `ll_node_${nodeCounter++}`,
          symbol: 'ε',
          isTerminal: true
        }];
      } else {
        const childNodes: DerivationNode[] = prod.rhs.map(sym => ({
          id: `ll_node_${nodeCounter++}`,
          symbol: sym,
          isTerminal: !g.nonTerminals.has(sym)
        }));
        popped.node.children = childNodes;

        // Push onto stack in reverse order so leftmost symbol is on top
        for (let i = prod.rhs.length - 1; i >= 0; i--) {
          stack.push({
            symbol: prod.rhs[i],
            node: childNodes[i]
          });
        }
      }

      const conflictNote = candidates.length > 1
        ? ` (conflict: M[${top.symbol}, ${lookahead}] holds ${candidates.length} rules, the first one is used)`
        : '';
      const conflictNoteCz = candidates.length > 1
        ? ` (kolize: M[${top.symbol}, ${lookahead}] obsahuje ${candidates.length} pravidla, použije se první)`
        : '';
      steps.push({
        step: stepIndex++,
        stack: currentStackSymbols,
        remainingInput: currentRemaining,
        action: `Apply: ${formatProduction(prod)}${conflictNote}`,
        actionCz: `Aplikovat pravidlo: ${formatProduction(prod)}${conflictNoteCz}`,
        production: prod,
        conflictCount: candidates.length > 1 ? candidates.length : undefined,
        lookupNt: top.symbol,
        lookupTerminal: lookahead,
        tree: cloneTree(rootNode)
      });
      continue;
    }

    // Unknown symbol
    steps.push({
      step: stepIndex++,
      stack: currentStackSymbols,
      remainingInput: currentRemaining,
      action: `Error: Unknown symbol '${top.symbol}' on stack`,
      actionCz: `Chyba: Neznámý symbol '${top.symbol}' na zásobníku`,
      isError: true,
      tree: cloneTree(rootNode)
    });
    return {
      accepted: false,
      steps,
      errorMessage: `Unknown symbol '${top.symbol}'`,
      errorMessageCz: `Neznámý symbol '${top.symbol}'`
    };
  }

  return {
    accepted: false,
    steps,
    errorMessage: `Stopped after ${maxSteps} steps: the parser loops (a conflict was resolved by a left-recursive rule).`,
    errorMessageCz: `Zastaveno po ${maxSteps} krocích: analyzátor se zacyklil (kolize byla vyřešena levorekurzivním pravidlem).`
  };
}

function cloneTree(node: DerivationNode): DerivationNode {
  return {
    id: node.id,
    symbol: node.symbol,
    isTerminal: node.isTerminal,
    children: node.children ? node.children.map(cloneTree) : undefined
  };
}
