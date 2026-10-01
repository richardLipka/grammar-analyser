/**
 * LL(1) / LL(2) Top-Down Stack Simulator & Parse Tree Builder
 *
 * The parser actions follow the textbook: expansion (Expanze) by the table
 * entry, comparison (Srovnání) of the terminal on top of the stack with the
 * input, acceptance (Přijetí) and error (Chyba). The sequence of applied rule
 * numbers is the left parse (levý rozklad).
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LLTable, lookaheadK } from './llTable';
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
  /** Lookahead used for the decision (one token, or two tokens for LL(2)). */
  lookupTerminal?: string;
  /** LL(2) with the Aho–Ullman tables: id of the table T(A, L) used. */
  lookupTable?: number;
  /** Tables of the stack symbols (LL(2) tables mode), parallel to `stack`. */
  stackTables?: (number | null)[];
  isError?: boolean;
  isAccepted?: boolean;
  /** Number of productions in the table cell when it holds a conflict (the first one is used). */
  conflictCount?: number;
  /** Rule numbers applied so far, including this step (left parse). */
  leftParse: number[];
  tree: DerivationNode;
}

export interface LLSimulationResult {
  accepted: boolean;
  steps: LLParseStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
}

/** How the expanding rule is chosen. */
export type LLParseMode =
  | { k: 1 }
  | { k: 2; tables: 'strong' }
  | { k: 2; tables: 'contexts' };

interface StackItem {
  symbol: string;
  node: DerivationNode;
  /** LL(2) contexts mode: table T(A, L) of a non-terminal. */
  table: number | null;
}

export function simulateLLParse(
  inputTokens: string[],
  g: Grammar,
  llTable: LLTable,
  maxSteps: number = 500 + 50 * inputTokens.length,
  mode: LLParseMode = { k: 1 }
): LLSimulationResult {
  const steps: LLParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const leftParse: number[] = [];

  if (!g.startSymbol) {
    return {
      accepted: false,
      steps: [],
      errorMessage: 'Grammar has no start symbol.',
      errorMessageCz: 'Gramatika nemá počáteční symbol.'
    };
  }

  let nodeCounter = 1;
  const rootNode: DerivationNode = { id: `ll_node_${nodeCounter++}`, symbol: g.startSymbol, isTerminal: false };
  const stack: StackItem[] = [
    { symbol: END_MARKER, node: { id: `ll_node_${nodeCounter++}`, symbol: END_MARKER, isTerminal: true }, table: null },
    { symbol: g.startSymbol, node: rootNode, table: mode.k === 2 && mode.tables === 'contexts' ? 0 : null }
  ];

  let inputPtr = 0;
  let stepIndex = 0;
  const contexts = mode.k === 2 && mode.tables === 'contexts';

  const snapshot = () => ({
    stack: stack.map(s => s.symbol),
    stackTables: contexts ? stack.map(s => s.table) : undefined,
    remainingInput: input.slice(inputPtr)
  });

  /** Candidate rules for non-terminal `top` and the tables of their RHS symbols. */
  const decide = (top: StackItem, remaining: string[]) => {
    if (mode.k === 1) {
      const la = remaining[0];
      return { lookahead: la, candidates: (llTable.table1.get(top.symbol)?.get(la) || []).map(p => ({ p, rhsTables: null })) };
    }
    const la = lookaheadK(remaining, 2);
    if (mode.tables === 'strong') {
      return { lookahead: la, candidates: (llTable.ll2Table?.get(top.symbol)?.get(la) || []).map(p => ({ p, rhsTables: null })) };
    }
    const table = top.table === null ? undefined : llTable.ll2Tables[top.table];
    const rows = table ? table.rows.filter(r => r.lookahead === la) : [];
    return { lookahead: la, candidates: rows.map(r => ({ p: r.production, rhsTables: r.rhsTables })) };
  };

  while (stepIndex < maxSteps) {
    const before = snapshot();
    const top = stack[stack.length - 1];
    const lookahead = input[inputPtr];

    // Bottom of the stack
    if (top.symbol === END_MARKER) {
      if (lookahead === END_MARKER) {
        steps.push({
          step: stepIndex++,
          ...before,
          action: 'Accept: the input was parsed',
          actionCz: 'Přijetí: vstup byl úspěšně analyzován',
          isAccepted: true,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode)
        });
        return { accepted: true, steps, finalTree: rootNode };
      }
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Error: expected the end of input, found '${lookahead}'`,
        actionCz: `Chyba: očekáván konec vstupu, nalezeno '${lookahead}'`,
        isError: true,
        leftParse: [...leftParse],
        tree: cloneTree(rootNode)
      });
      return {
        accepted: false,
        steps,
        errorMessage: `Expected end of input, found '${lookahead}'`,
        errorMessageCz: `Očekáván konec vstupu, nalezeno '${lookahead}'`
      };
    }

    // Terminal on top: comparison
    if (!g.nonTerminals.has(top.symbol)) {
      if (top.symbol === lookahead) {
        stack.pop();
        inputPtr++;
        steps.push({
          step: stepIndex++,
          ...before,
          action: `Compare: '${top.symbol}' matches the input`,
          actionCz: `Srovnání: '${top.symbol}' souhlasí se vstupem`,
          matchedToken: top.symbol,
          lookupTerminal: lookahead,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode)
        });
        continue;
      }
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Error: expected '${top.symbol}', found '${lookahead}'`,
        actionCz: `Chyba: očekáván terminál '${top.symbol}', nalezeno '${lookahead}'`,
        isError: true,
        leftParse: [...leftParse],
        tree: cloneTree(rootNode)
      });
      return {
        accepted: false,
        steps,
        errorMessage: `Expected '${top.symbol}', found '${lookahead}'`,
        errorMessageCz: `Očekáván terminál '${top.symbol}', nalezeno '${lookahead}'`
      };
    }

    // Non-terminal on top: expansion
    const { lookahead: la, candidates } = decide(top, input.slice(inputPtr));
    const cellName = contexts ? `T${top.table}[${la}]` : `M[${top.symbol}, ${la}]`;

    if (candidates.length === 0) {
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Error: ${cellName} is empty`,
        actionCz: `Chyba: ${cellName} je prázdná položka`,
        isError: true,
        lookupNt: top.symbol,
        lookupTerminal: la,
        lookupTable: contexts ? top.table ?? undefined : undefined,
        leftParse: [...leftParse],
        tree: cloneTree(rootNode)
      });
      return {
        accepted: false,
        steps,
        errorMessage: `No rule in the parse table for '${top.symbol}' with lookahead '${la}'`,
        errorMessageCz: `V rozkladové tabulce není pravidlo pro neterminál '${top.symbol}' a prohlížený řetězec '${la}'`
      };
    }

    const { p: prod, rhsTables } = candidates[0];
    const distinct = new Set(candidates.map(c => c.p.id)).size;
    stack.pop();
    leftParse.push(prod.id);

    if (prod.rhs.length === 0) {
      top.node.children = [{ id: `ll_node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }];
    } else {
      const childNodes: DerivationNode[] = prod.rhs.map(sym => ({
        id: `ll_node_${nodeCounter++}`,
        symbol: sym,
        isTerminal: !g.nonTerminals.has(sym)
      }));
      top.node.children = childNodes;
      for (let i = prod.rhs.length - 1; i >= 0; i--) {
        stack.push({ symbol: prod.rhs[i], node: childNodes[i], table: rhsTables ? rhsTables[i] : null });
      }
    }

    const conflictNote = distinct > 1 ? ` (conflict: ${cellName} holds ${distinct} rules, the first one is used)` : '';
    const conflictNoteCz = distinct > 1 ? ` (kolize: ${cellName} obsahuje ${distinct} pravidla, použije se první)` : '';
    steps.push({
      step: stepIndex++,
      ...before,
      action: `Expand by (${prod.id}) ${formatProduction(prod)}${conflictNote}`,
      actionCz: `Expanze podle (${prod.id}) ${formatProduction(prod)}${conflictNoteCz}`,
      production: prod,
      lookupNt: top.symbol,
      lookupTerminal: la,
      lookupTable: contexts ? top.table ?? undefined : undefined,
      conflictCount: distinct > 1 ? distinct : undefined,
      leftParse: [...leftParse],
      tree: cloneTree(rootNode)
    });
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
