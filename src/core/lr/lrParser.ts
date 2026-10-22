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
 *
 * With `options.recovery` an error does not stop the parser: panic mode
 * (Aho, Lam, Sethi, Ullman §4.8.3, see core/analyser/errorRecovery.ts) pops the
 * stack down to a state s with a transition g(s, A), throws input away until a
 * symbol a ∈ FOLLOW(A) with an action in g(s, A), and pushes A (its subtree is
 * the error part) and g(s, A). Fewest input symbols thrown away first, then
 * fewest states popped.
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LRTable, LRAction, LRLayout, LR0_ACTION_COLUMN, stateLabel } from './lrTable';
import { DerivationNode, cloneTree } from '../generator/wordGenerator';
import { RecoveredError, RecoveryInfo, RecoveryOptions, setText, sortedSymbols } from '../analyser/errorRecovery';

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
  /** Number of actions in the ACTION cell when it holds a conflict (resolved like Bison's default). */
  conflictCount?: number;
  /** Rule numbers of the reductions so far, including this step (right parse). */
  rightParse: number[];
  /** Parse forest after the action (a single tree, or a synthetic root over the stack trees). */
  tree?: DerivationNode;
  /** A step of error recovery (panic mode). */
  recovery?: RecoveryInfo;
}

export interface LRSimulationResult {
  accepted: boolean;
  steps: LRParseStep[];
  errorMessage?: string;
  errorMessageCz?: string;
  finalTree?: DerivationNode;
  /** With recovery: the errors found (the word is then not accepted). */
  errors?: RecoveredError[];
  /** With recovery: the whole input was read despite the errors. */
  completedWithErrors?: boolean;
}

export interface LRParseOptions {
  /** Panic-mode error recovery; without it the parser stops at the first error. */
  recovery?: RecoveryOptions;
}

/** A conflict is resolved like Bison's default: shift before reduce, the earlier rule in a reduce/reduce conflict. */
const rank = (a: LRAction) => (a.type === 'shift' ? -2 : a.type === 'accept' ? -1 : (a.production?.id ?? Number.MAX_SAFE_INTEGER));
const resolve = (actions: LRAction[]): LRAction => actions.reduce((best, a) => (rank(a) < rank(best) ? a : best));

export function simulateLRParse(
  inputTokens: string[],
  g: Grammar,
  table: LRTable,
  layout: LRLayout = 'dragon',
  maxSteps: number = 500 + 50 * inputTokens.length,
  options: LRParseOptions = {}
): LRSimulationResult {
  const steps: LRParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const lecture = layout === 'lecture';
  const name = (state: number) => stateLabel(table, state, layout);
  const recovery = options.recovery;
  const maxErrors = recovery?.maxErrors ?? 20;
  if (recovery) maxSteps += 4 * input.length + 50;

  const stateStack: number[] = [0];
  const symbolStack: string[] = [END_MARKER];
  const treeStack: DerivationNode[] = [];

  let inputPtr = 0;
  let stepIndex = 0;
  let nodeCounter = 1;
  const rightParse: number[] = [];

  // Error recovery state
  const errors: RecoveredError[] = [];
  /** A symbol has been shifted since the last recovery (else a new error is the same one). */
  let shiftedSinceRecovery = true;
  /** Input position of the last recovery: an error there again must throw away at least one symbol. */
  let lastRecoveryAt = -1;

  const columnOf = (a: string) => (lecture && table.variant === 'LR(0)' ? LR0_ACTION_COLUMN : a);
  const actionsOf = (state: number, a: string) => (lecture ? table.fTable : table.actionTable).get(state)?.get(columnOf(a)) || [];
  const gotoOf = (state: number, a: string) => (lecture ? table.gTable : table.gotoTable).get(state)?.get(a);

  /**
   * Whether the parser with this state stack really goes on with input symbol a: the
   * reductions it makes on a end with shifting a (or accepting at $), not with an error.
   * An action in the top state alone is not enough: a reduction can lead back to an error.
   */
  const canContinueFrom = (states: number[], a: string): boolean => {
    const st = [...states];
    for (let guard = 0; guard < 4 * (table.states?.length ?? 100) + 50; guard++) {
      const t = st[st.length - 1];
      const actions = actionsOf(t, a);
      if (actions.length === 0) return false;
      const act = resolve(actions);
      if (act.type === 'accept') return a === END_MARKER;
      if (act.type === 'shift') return !lecture || (a !== END_MARKER && table.gTable.get(t)?.get(a) !== undefined);
      const prod = act.production!;
      st.splice(st.length - prod.rhs.length);
      if (st.length === 0) return false;
      const next = gotoOf(st[st.length - 1], prod.lhs);
      if (next === undefined) return false;
      st.push(next);
    }
    return false;
  };
  const canContinue = (t: number, a: string, below: number[]): boolean => canContinueFrom([...below, t], a);

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
    return { accepted: false, steps, errorMessage, errorMessageCz, errors: recovery ? errors : undefined };
  };

  const nonTerminals = [...g.nonTerminals];
  const follow = (a: string) => recovery?.sets.follow.get(a) ?? new Set<string>([END_MARKER]);

  /**
   * Panic mode after an error in the current configuration. Returns a result when the
   * analysis ends (no recovery possible, too many errors), else undefined: go on.
   */
  const recover = (
    config: Omit<LRParseStep, 'step' | 'action' | 'actionCz' | 'tree'>,
    what: [string, string],
    errorMessage: [string, string]
  ): LRSimulationResult | undefined => {
    const lookahead = input[inputPtr];
    const isNew = shiftedSinceRecovery || errors.length === 0;
    if (isNew) {
      errors.push({ number: errors.length + 1, position: inputPtr, token: lookahead, messageEn: errorMessage[0], messageCz: errorMessage[1], skipped: 0, popped: 0 });
      shiftedSinceRecovery = false;
    }
    const err = errors[errors.length - 1];
    const head = isNew ? [`Error ${err.number}`, `Chyba ${err.number}`] : [`Error ${err.number} goes on`, `Pokračuje chyba ${err.number}`];
    if (isNew && errors.length > maxErrors) {
      steps.push({ step: stepIndex++, ...config, action: `${head[0]}: ${what[0]}. Too many errors (${maxErrors}): the analysis stops`, actionCz: `${head[1]}: ${what[1]}. Příliš mnoho chyb (${maxErrors}): analýza končí`, isError: true, tree: forest(), recovery: { kind: 'giveUp', errorNumber: err.number } });
      return { accepted: false, steps, errors, errorMessage: `Too many errors (${maxErrors})`, errorMessageCz: `Příliš mnoho chyb (${maxErrors})` };
    }

    // The nearest way on: fewest input symbols thrown away, then fewest states popped
    const minSkip = lastRecoveryAt === inputPtr ? 1 : 0;
    let found: { skip: number; depth: number; nt: string; target: number } | undefined;
    for (let skip = minSkip; !found && inputPtr + skip < input.length; skip++) {
      const a = input[inputPtr + skip];
      for (let depth = stateStack.length - 1; !found && depth >= 0; depth--) {
        for (const nt of nonTerminals) {
          const target = gotoOf(stateStack[depth], nt);
          if (target === undefined || !follow(nt).has(a) || !canContinue(target, a, stateStack.slice(0, depth + 1))) continue;
          found = { skip, depth, nt, target };
          break;
        }
      }
    }

    if (!found) {
      steps.push({
        step: stepIndex++,
        ...config,
        action: `${head[0]}: ${what[0]}. Panic mode: no state on the stack has a transition g(s, A) after which the parser could go on with a later input symbol a ∈ FOLLOW(A) — the analysis stops`,
        actionCz: `${head[1]}: ${what[1]}. Panický režim: žádný stav na zásobníku nemá přechod g(s, A), po kterém by analyzátor mohl pokračovat některým dalším symbolem vstupu a ∈ FOLLOW(A) — analýza končí`,
        isError: true,
        tree: forest(),
        recovery: { kind: 'giveUp', errorNumber: err.number }
      });
      return { accepted: false, steps, errors, errorMessage: errorMessage[0], errorMessageCz: errorMessage[1] };
    }

    const s = stateStack[found.depth];
    const below = stateStack.slice(0, found.depth + 1);
    const syncSet = sortedSymbols([...follow(found.nt)].filter(a => canContinue(found!.target, a, below)));
    const a = input[inputPtr + found.skip];
    const popCount = stateStack.length - 1 - found.depth;
    const info = { errorNumber: err.number, nonTerminal: found.nt, syncSet };
    steps.push({
      step: stepIndex++,
      ...config,
      action: `${head[0]}: ${what[0]}. Panic mode: the error part is taken for a non-terminal A. The nearest state on the stack with a transition g(s, A) whose state can go on is ${name(s)} with A = ${found.nt}: g(${name(s)}, ${found.nt}) = ${name(found.target)}; the stop symbols are the symbols of FOLLOW(${found.nt}) that the parser then really goes on with (after its reductions it shifts them, or accepts $): ${setText(syncSet)}. Plan: pop ${popCount} state(s), throw away ${found.skip} input symbol(s), push ${found.nt}`,
      actionCz: `${head[1]}: ${what[1]}. Panický režim: chybná část se bude považovat za neterminál A. Nejbližší stav na zásobníku s přechodem g(s, A), jehož stav může pokračovat, je ${name(s)} s A = ${found.nt}: g(${name(s)}, ${found.nt}) = ${name(found.target)}; zastavovací symboly jsou symboly z FOLLOW(${found.nt}), se kterými pak analyzátor skutečně pokračuje (po redukcích je přesune, nebo přijme $): ${setText(syncSet)}. Plán: odebrat ${popCount} stav(ů), zahodit ${found.skip} symbol(ů) vstupu, vložit ${found.nt}`,
      isError: true,
      tree: forest(),
      recovery: { kind: 'start', ...info }
    });

    // 1. Pop the states above s; their subtrees become the error part
    const errorChildren: DerivationNode[] = [];
    if (popCount > 0) {
      const before = { stateStack: [...stateStack], symbolStack: [...symbolStack], remainingInput: input.slice(inputPtr), rightParse: [...rightParse] };
      const popped = stateStack.splice(found.depth + 1);
      const poppedSymbols = symbolStack.splice(found.depth + 1);
      errorChildren.push(...treeStack.splice(treeStack.length - Math.min(popCount, treeStack.length)));
      err.popped += popCount;
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Panic mode: popped ${popCount} state(s) ${popped.map(name).join(' ')} (symbols ${poppedSymbols.join(' ')}); ${name(s)} is on top`,
        actionCz: `Panický režim: odebráno ${popCount} stav(ů) ${popped.map(name).join(' ')} (symboly ${poppedSymbols.join(' ')}); na vrcholu je ${name(s)}`,
        tree: forest(),
        recovery: { kind: 'pop', ...info, poppedStates: popped }
      });
    }

    // 2. Throw input away up to the stop symbol
    for (let i = 0; i < found.skip; i++) {
      const tok = input[inputPtr];
      const before = { stateStack: [...stateStack], symbolStack: [...symbolStack], remainingInput: input.slice(inputPtr), rightParse: [...rightParse] };
      inputPtr++;
      err.skipped++;
      errorChildren.push({ id: `lr_node_${nodeCounter++}`, symbol: tok, isTerminal: true, mark: 'skipped' });
      steps.push({
        step: stepIndex++,
        ...before,
        action: `Panic mode: '${tok}' is not a stop symbol ${setText(syncSet)} — thrown away`,
        actionCz: `Panický režim: '${tok}' není zastavovací symbol ${setText(syncSet)} — zahodí se`,
        tree: forest(),
        recovery: { kind: 'skip', ...info, token: tok }
      });
    }

    // 3. Push A and g(s, A): the parser can go on with a
    const before = { stateStack: [...stateStack], symbolStack: [...symbolStack], remainingInput: input.slice(inputPtr), rightParse: [...rightParse] };
    stateStack.push(found.target);
    symbolStack.push(found.nt);
    treeStack.push({
      id: `lr_node_${nodeCounter++}`,
      symbol: found.nt,
      isTerminal: false,
      mark: 'error',
      children: errorChildren.length > 0 ? errorChildren : [{ id: `lr_node_${nodeCounter++}`, symbol: '⚠', isTerminal: true, mark: 'error' }]
    });
    lastRecoveryAt = inputPtr;
    const gotoCell = lecture ? `g(${name(s)}, ${found.nt})` : `GOTO[${s}, ${found.nt}]`;
    steps.push({
      step: stepIndex++,
      ...before,
      action: `Recovered: '${a}' is a stop symbol; ${found.nt} is pushed for the error part, ${gotoCell} = ${name(found.target)}, which can go on with '${a}'`,
      actionCz: `Zotaveno: '${a}' je zastavovací symbol; za chybnou část se vloží ${found.nt}, ${gotoCell} = ${name(found.target)}, který může pokračovat symbolem '${a}'`,
      gotoFromState: s,
      gotoSymbol: found.nt,
      gotoState: found.target,
      tree: forest(),
      recovery: { kind: 'recovered', ...info, token: a }
    });
    return undefined;
  };

  /** An error: with recovery go on, else stop. */
  const error = (
    config: Omit<LRParseStep, 'step' | 'action' | 'actionCz' | 'tree'>,
    what: [string, string],
    errorMessage: [string, string]
  ): LRSimulationResult | undefined =>
    recovery
      ? recover(config, what, errorMessage)
      : fail({ ...config, action: `Error: ${what[0]}`, actionCz: `Chyba: ${what[1]}` }, errorMessage[0], errorMessage[1]);

  while (stepIndex < maxSteps) {
    const currentState = stateStack[stateStack.length - 1];
    const lookahead = input[inputPtr];
    // LR(0) in the lecture layout decides by the state alone
    const column = columnOf(lookahead);
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

    const availableActions = actionsOf(currentState, lookahead);

    if (availableActions.length === 0) {
      const end = error(config, [`${cell} is empty`, `${cell} je prázdná položka`],
        [`Syntax error at token '${lookahead}': no valid action in state ${name(currentState)}.`,
          `Syntaktická chyba na symbolu '${lookahead}': ve stavu ${name(currentState)} neexistuje platná akce.`]);
      if (end) return end;
      continue;
    }

    const action = resolve(availableActions);
    const conflictCount = availableActions.length > 1 ? availableActions.length : undefined;
    const conflictNote = conflictCount ? ` (conflict: ${conflictCount} actions in this cell; as in Bison, shift wins over reduce and the earlier rule over a later one)` : '';
    const conflictNoteCz = conflictCount ? ` (kolize: buňka obsahuje ${conflictCount} akce; jako v Bisonu má přesun přednost před redukcí a dřívější pravidlo před pozdějším)` : '';

    if (action.type === 'shift') {
      let targetState = action.targetState;
      if (lecture) {
        // f only says "shift": read the symbol, then g(X, a) gives the state to push
        const g0 = `g(${name(currentState)}, ${lookahead})`;
        if (lookahead === END_MARKER) {
          const end = error({ ...config, conflictCount }, ['shift, but the input has been read', 'přesun, ale vstup je již přečten'],
            [`Unexpected end of input in state ${name(currentState)}.`, `Neočekávaný konec vstupu ve stavu ${name(currentState)}.`]);
          if (end) return end;
          continue;
        }
        targetState = table.gTable.get(currentState)?.get(lookahead);
        if (targetState === undefined) {
          const end = error({ ...config, gotoFromState: currentState, gotoSymbol: lookahead, conflictCount }, [`shift '${lookahead}', but ${g0} is empty`, `přesun '${lookahead}', ale ${g0} je prázdná položka`],
            [`Syntax error at token '${lookahead}': state ${name(currentState)} has no transition for it.`,
              `Syntaktická chyba na symbolu '${lookahead}': stav ${name(currentState)} pro něj nemá přechod.`]);
          if (end) return end;
          continue;
        }
      }
      stateStack.push(targetState!);
      symbolStack.push(lookahead);
      inputPtr++;
      shiftedSinceRecovery = true;
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
      const gotoState = gotoOf(topState, prod.lhs);
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
      if (!recovery) {
        return fail({ ...config, action: `Accept, but the input has not been read: reject`, actionCz: `Přijetí, ale vstup není přečten: odmítnutí`, conflictCount },
          `The parser reached the accepting state ${name(currentState)} before the end of the input.`,
          `Analyzátor dosáhl přijímajícího stavu ${name(currentState)} před koncem vstupu.`);
      }
      // The derivation of S is complete: the rest of the input is thrown away
      const isNew = shiftedSinceRecovery || errors.length === 0;
      if (isNew) {
        errors.push({ number: errors.length + 1, position: inputPtr, token: lookahead, messageEn: 'Input after the end of the word', messageCz: 'Vstup za koncem slova', skipped: 0, popped: 0 });
        shiftedSinceRecovery = false;
      }
      const err = errors[errors.length - 1];
      const rest = input.slice(inputPtr, -1);
      steps.push({
        step: stepIndex++,
        ...config,
        action: `Error ${err.number}: ${name(currentState)} accepts, but the input goes on with '${lookahead}'. Panic mode: the only stop symbol is $ — the rest ${rest.join(' ')} is thrown away`,
        actionCz: `Chyba ${err.number}: ${name(currentState)} přijímá, ale vstup pokračuje symbolem '${lookahead}'. Panický režim: jediný zastavovací symbol je $ — zbytek ${rest.join(' ')} se zahodí`,
        isError: true,
        conflictCount,
        tree: forest(),
        recovery: { kind: 'start', errorNumber: err.number, syncSet: [END_MARKER] }
      });
      for (const tok of rest) {
        const before = { stateStack: [...stateStack], symbolStack: [...symbolStack], remainingInput: input.slice(inputPtr), rightParse: [...rightParse] };
        inputPtr++;
        err.skipped++;
        steps.push({
          step: stepIndex++,
          ...before,
          action: `Panic mode: '${tok}' is thrown away`,
          actionCz: `Panický režim: '${tok}' se zahodí`,
          tree: forest(),
          recovery: { kind: 'skip', errorNumber: err.number, token: tok, syncSet: [END_MARKER] }
        });
      }
      continue;
    }
    const finalTree = treeStack.length > 0 ? treeStack[treeStack.length - 1] : undefined;
    if (errors.length > 0) {
      steps.push({
        step: stepIndex++,
        ...config,
        action: `End: the input has been read with ${errors.length} error(s); the word is not in L(G)`,
        actionCz: `Konec: vstup přečten, nalezeno chyb: ${errors.length}; slovo nepatří do L(G)`,
        isError: true,
        conflictCount,
        tree: forest(),
        recovery: { kind: 'end', errorNumber: errors.length }
      });
      return {
        accepted: false,
        steps,
        errors,
        completedWithErrors: true,
        finalTree,
        errorMessage: `${errors.length} syntax error(s); the analysis went on after panic-mode recovery`,
        errorMessageCz: `Syntaktických chyb: ${errors.length}; analýza po zotavení v panickém režimu pokračovala`
      };
    }
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
    errors: recovery ? errors : undefined,
    errorMessage: `Stopped after ${maxSteps} steps: the parser loops (a conflict was resolved by a cycle of reductions).`,
    errorMessageCz: `Zastaveno po ${maxSteps} krocích: analyzátor se zacyklil (kolize byla vyřešena cyklem redukcí).`
  };
}
