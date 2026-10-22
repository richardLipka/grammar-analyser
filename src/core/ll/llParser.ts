/**
 * LL(1) / LL(2) Top-Down Stack Simulator & Parse Tree Builder
 *
 * The parser actions follow the textbook: expansion (Expanze) by the table
 * entry, comparison (Srovnání) of the terminal on top of the stack with the
 * input, acceptance (Přijetí) and error (Chyba). The sequence of applied rule
 * numbers is the left parse (levý rozklad).
 *
 * With `options.recovery` the parser does not stop at an error but recovers in
 * panic mode (see core/analyser/errorRecovery.ts): an empty cell M[A, a] throws
 * input away until a ∈ FIRST(A) (A is resumed) or a ∈ FOLLOW(A) ∪ {$} (A is
 * given up); a terminal on top that does not match is taken as missing; input
 * after the end of the derivation is thrown away.
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LLTable, lookaheadK } from './llTable';
import { DerivationNode, cloneTree } from '../generator/wordGenerator';
import { RecoveredError, RecoveryInfo, RecoveryOptions, setText, sortedSymbols } from '../analyser/errorRecovery';

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
  /** A step of error recovery (panic mode). */
  recovery?: RecoveryInfo;
}

export interface LLSimulationResult {
  accepted: boolean;
  steps: LLParseStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
  /** With recovery: the errors found (the word is then not accepted). */
  errors?: RecoveredError[];
  /** With recovery: the whole input was read despite the errors. */
  completedWithErrors?: boolean;
}

/** How the expanding rule is chosen. */
export type LLParseMode =
  | { k: 1 }
  | { k: 2; tables: 'strong' }
  | { k: 2; tables: 'contexts' };

export interface LLParseOptions {
  /** Panic-mode error recovery; without it the parser stops at the first error. */
  recovery?: RecoveryOptions;
}

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
  mode: LLParseMode = { k: 1 },
  options: LLParseOptions = {}
): LLSimulationResult {
  const steps: LLParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const leftParse: number[] = [];
  const recovery = options.recovery;
  const maxErrors = recovery?.maxErrors ?? 20;
  // Recovery steps are bounded by the input and the stack; leave room for them
  if (recovery) maxSteps += 4 * input.length + 50;

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

  // Error recovery state
  const errors: RecoveredError[] = [];
  /** A terminal has been read correctly since the last recovery (else a new error is the same one). */
  let readSinceRecovery = true;
  /** The non-terminal whose panic mode is running (skipping input), if any. */
  let panicFor: StackItem | null = null;

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

  /** Registers an error; a follow-up error before any input was read belongs to the previous one. */
  const newError = (token: string, messageEn: string, messageCz: string): { number: number; isNew: boolean } => {
    if (!readSinceRecovery && errors.length > 0) return { number: errors[errors.length - 1].number, isNew: false };
    errors.push({ number: errors.length + 1, position: inputPtr, token, messageEn, messageCz, skipped: 0, popped: 0 });
    readSinceRecovery = false;
    return { number: errors.length, isNew: true };
  };
  const current = () => errors[errors.length - 1];

  const giveUp = (before: ReturnType<typeof snapshot>, en: string, cz: string): LLSimulationResult => {
    steps.push({
      step: stepIndex++,
      ...before,
      action: en,
      actionCz: cz,
      isError: true,
      leftParse: [...leftParse],
      tree: cloneTree(rootNode),
      recovery: { kind: 'giveUp', errorNumber: errors.length }
    });
    return { accepted: false, steps, errors, errorMessage: en, errorMessageCz: cz };
  };

  const errorLeaf = (): DerivationNode => ({ id: `ll_node_${nodeCounter++}`, symbol: '⚠', isTerminal: true, mark: 'error' });

  while (stepIndex < maxSteps) {
    const before = snapshot();
    const top = stack[stack.length - 1];
    const lookahead = input[inputPtr];

    // Bottom of the stack
    if (top.symbol === END_MARKER) {
      if (lookahead === END_MARKER) {
        if (errors.length > 0) {
          steps.push({
            step: stepIndex++,
            ...before,
            action: `End: the input has been read with ${errors.length} error(s); the word is not in L(G)`,
            actionCz: `Konec: vstup přečten, nalezeno chyb: ${errors.length}; slovo nepatří do L(G)`,
            isError: true,
            leftParse: [...leftParse],
            tree: cloneTree(rootNode),
            recovery: { kind: 'end', errorNumber: errors.length }
          });
          return {
            accepted: false,
            steps,
            errors,
            completedWithErrors: true,
            finalTree: rootNode,
            errorMessage: `${errors.length} syntax error(s); the analysis went on after panic-mode recovery`,
            errorMessageCz: `Syntaktických chyb: ${errors.length}; analýza po zotavení v panickém režimu pokračovala`
          };
        }
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
      if (recovery) {
        // The derivation is complete: the rest of the input cannot be used
        const started = panicFor !== top;
        if (started) {
          panicFor = top;
          const e = newError(lookahead, `Expected the end of input, found '${lookahead}'`, `Očekáván konec vstupu, nalezeno '${lookahead}'`);
          if (e.isNew && errors.length > maxErrors) return giveUp(before, `Too many errors (${maxErrors}): the analysis stops`, `Příliš mnoho chyb (${maxErrors}): analýza končí`);
          steps.push({
            step: stepIndex++,
            ...before,
            action: `${e.isNew ? `Error ${e.number}` : `Error ${e.number} goes on`}: the derivation is complete, but the input goes on with '${lookahead}'. Panic mode: the rest of the input is thrown away up to $`,
            actionCz: `${e.isNew ? `Chyba ${e.number}` : `Pokračuje chyba ${e.number}`}: derivace je hotová, ale vstup pokračuje symbolem '${lookahead}'. Panický režim: zbytek vstupu se zahodí až po $`,
            isError: true,
            leftParse: [...leftParse],
            tree: cloneTree(rootNode),
            recovery: { kind: 'start', errorNumber: e.number, syncSet: [END_MARKER] }
          });
          continue;
        }
        inputPtr++;
        current().skipped++;
        steps.push({
          step: stepIndex++,
          ...before,
          action: `Panic mode: '${lookahead}' is thrown away (only $ can follow the complete derivation)`,
          actionCz: `Panický režim: '${lookahead}' se zahodí (za hotovou derivací smí být jen $)`,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode),
          recovery: { kind: 'skip', errorNumber: current().number, token: lookahead, syncSet: [END_MARKER] }
        });
        continue;
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
        readSinceRecovery = true;
        panicFor = null;
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
      if (recovery) {
        // The terminal is taken as missing (inserted): popped, the input stays
        const e = newError(lookahead, `Expected '${top.symbol}', found '${lookahead}'`, `Očekáván terminál '${top.symbol}', nalezeno '${lookahead}'`);
        if (e.isNew && errors.length > maxErrors) return giveUp(before, `Too many errors (${maxErrors}): the analysis stops`, `Příliš mnoho chyb (${maxErrors}): analýza končí`);
        stack.pop();
        top.node.mark = 'error';
        current().popped++;
        panicFor = null;
        steps.push({
          step: stepIndex++,
          ...before,
          action: `${e.isNew ? `Error ${e.number}` : `Error ${e.number} goes on`}: expected '${top.symbol}', found '${lookahead}'. Recovery: '${top.symbol}' is taken as missing — popped as if it had been inserted; the input stays at '${lookahead}' (recovered)`,
          actionCz: `${e.isNew ? `Chyba ${e.number}` : `Pokračuje chyba ${e.number}`}: očekáván terminál '${top.symbol}', nalezeno '${lookahead}'. Zotavení: '${top.symbol}' se považuje za chybějící — vyjme se ze zásobníku, jako by byl doplněn; vstup zůstává na '${lookahead}' (zotaveno)`,
          isError: true,
          lookupTerminal: lookahead,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode),
          recovery: { kind: 'insert', errorNumber: e.number, token: top.symbol }
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

    if (candidates.length === 0 && recovery) {
      const first = recovery.sets.first.get(top.symbol) ?? new Set<string>();
      const follow = recovery.sets.follow.get(top.symbol) ?? new Set<string>([END_MARKER]);
      const info = { nonTerminal: top.symbol, syncSet: sortedSymbols(follow), resumeSet: sortedSymbols(first) };
      if (panicFor !== top) {
        // Panic mode starts for A: say which symbols end it
        panicFor = top;
        const e = newError(lookahead, `No rule for '${top.symbol}' with '${la}'`, `Není pravidlo pro '${top.symbol}' se symbolem '${la}'`);
        if (e.isNew && errors.length > maxErrors) return giveUp(before, `Too many errors (${maxErrors}): the analysis stops`, `Příliš mnoho chyb (${maxErrors}): analýza končí`);
        steps.push({
          step: stepIndex++,
          ...before,
          action: `${e.isNew ? `Error ${e.number}` : `Error ${e.number} goes on`}: ${cellName} is empty — '${top.symbol}' cannot start with '${la}'. Panic mode for ${top.symbol}: input is thrown away until a symbol of FIRST(${top.symbol}) = ${setText(first)} (${top.symbol} is analysed again) or of FOLLOW(${top.symbol}) ∪ {$} = ${setText(follow)} (${top.symbol} is given up)`,
          actionCz: `${e.isNew ? `Chyba ${e.number}` : `Pokračuje chyba ${e.number}`}: ${cellName} je prázdná položka — '${top.symbol}' nemůže začínat symbolem '${la}'. Panický režim pro ${top.symbol}: vstup se zahazuje až po symbol z FIRST(${top.symbol}) = ${setText(first)} (${top.symbol} se analyzuje znovu) nebo z FOLLOW(${top.symbol}) ∪ {$} = ${setText(follow)} (${top.symbol} se vzdá)`,
          isError: true,
          lookupNt: top.symbol,
          lookupTerminal: la,
          lookupTable: contexts ? top.table ?? undefined : undefined,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode),
          recovery: { kind: 'start', errorNumber: e.number, ...info }
        });
        continue;
      }
      if (lookahead === END_MARKER || follow.has(lookahead)) {
        // A is given up: popped with an error leaf; the parser goes on with what follows A
        stack.pop();
        top.node.mark = 'error';
        top.node.children = [errorLeaf()];
        current().popped++;
        panicFor = null;
        const why = lookahead === END_MARKER && !follow.has(lookahead)
          ? (['the input has ended', 'vstup skončil'] as const)
          : ([`'${lookahead}' ∈ FOLLOW(${top.symbol})`, `'${lookahead}' ∈ FOLLOW(${top.symbol})`] as const);
        steps.push({
          step: stepIndex++,
          ...before,
          action: `Recovered: ${why[0]} — ${top.symbol} is given up (popped, its subtree marked as an error); the parser goes on after ${top.symbol} with '${lookahead}'`,
          actionCz: `Zotaveno: ${why[1]} — ${top.symbol} se vzdá (vyjme ze zásobníku, jeho podstrom je označen jako chybný); analýza pokračuje za ${top.symbol} symbolem '${lookahead}'`,
          lookupNt: top.symbol,
          lookupTerminal: lookahead,
          leftParse: [...leftParse],
          tree: cloneTree(rootNode),
          recovery: { kind: 'pop', errorNumber: current().number, ...info, token: lookahead }
        });
        continue;
      }
      inputPtr++;
      current().skipped++;
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Panic mode: '${lookahead}' is neither in FIRST(${top.symbol}) nor in FOLLOW(${top.symbol}) ∪ {$} — thrown away`,
        actionCz: `Panický režim: '${lookahead}' není ve FIRST(${top.symbol}) ani ve FOLLOW(${top.symbol}) ∪ {$} — zahodí se`,
        lookupNt: top.symbol,
        leftParse: [...leftParse],
        tree: cloneTree(rootNode),
        recovery: { kind: 'skip', errorNumber: current().number, ...info, token: lookahead }
      });
      continue;
    }

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

    // Panic mode for A ends: A can start with the input symbol (it is in FIRST(A))
    const resumed = panicFor === top;
    panicFor = null;

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
    // Why A can go on: the symbol starts A, or A ⇒* ε and the symbol follows A
    const inFirst = recovery?.sets.first.get(top.symbol)?.has(lookahead) ?? false;
    const resumedNote = !resumed ? '' : inFirst
      ? `Recovered: '${lookahead}' ∈ FIRST(${top.symbol}), ${top.symbol} is analysed again. `
      : `Recovered: ${cellName} holds a rule ('${lookahead}' ∈ FOLLOW(${top.symbol}) and ${top.symbol} ⇒* ε), ${top.symbol} goes on. `;
    const resumedNoteCz = !resumed ? '' : inFirst
      ? `Zotaveno: '${lookahead}' ∈ FIRST(${top.symbol}), ${top.symbol} se analyzuje znovu. `
      : `Zotaveno: ${cellName} obsahuje pravidlo ('${lookahead}' ∈ FOLLOW(${top.symbol}) a ${top.symbol} ⇒* ε), ${top.symbol} pokračuje. `;
    steps.push({
      step: stepIndex++,
      ...before,
      action: `${resumedNote}Expand by (${prod.id}) ${formatProduction(prod)}${conflictNote}`,
      actionCz: `${resumedNoteCz}Expanze podle (${prod.id}) ${formatProduction(prod)}${conflictNoteCz}`,
      production: prod,
      lookupNt: top.symbol,
      lookupTerminal: la,
      lookupTable: contexts ? top.table ?? undefined : undefined,
      conflictCount: distinct > 1 ? distinct : undefined,
      leftParse: [...leftParse],
      tree: cloneTree(rootNode),
      recovery: resumed && errors.length > 0 ? { kind: 'recovered', errorNumber: current().number, nonTerminal: top.symbol } : undefined
    });
  }

  return {
    accepted: false,
    steps,
    errors: recovery ? errors : undefined,
    errorMessage: `Stopped after ${maxSteps} steps: the parser loops (a conflict was resolved by a left-recursive rule).`,
    errorMessageCz: `Zastaveno po ${maxSteps} krocích: analyzátor se zacyklil (kolize byla vyřešena levorekurzivním pravidlem).`
  };
}
