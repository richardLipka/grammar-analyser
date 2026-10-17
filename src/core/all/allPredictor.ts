/**
 * Adaptive prediction for ALL(*): SLL simulation with a lookahead DFA cache and
 * fallback to full LL simulation with the parser's call stack.
 *
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14,
 * §3.1–3.2 (SLL vs LL), §4.4 (lookahead DFA), §5.2 (Functions 2–7), §5.3 (conflicts).
 *
 * A configuration (p, i, γ) is an ATN state p, the predicted production i and a
 * call stack γ of return states (top first). SLL prediction starts with the
 * wildcard stack # ("no information about the caller"): at the stop state of a
 * rule with stack # it continues at every call site of the rule. LL prediction
 * starts with the parser's real stack γ0, so it returns only to the actual caller.
 */

import { ATN, ATNDecisionPoint, describeATNState } from './allAtn';

/** Bottom of an SLL stack: the wildcard # of the paper (any caller). */
export const WILDCARD = -1;
/** Internal end-of-input symbol (shown as $). */
export const EOF = '\u0003$';

export const displaySymbol = (s: string) => (s === EOF ? '$' : s);

export interface ATNConfig {
  stateId: number;
  alt: number;
  /** Call stack of return (follow) states, top first; WILDCARD (#) at the bottom in SLL mode */
  stack: number[];
}

export interface DFAState {
  id: number;
  configs: ATNConfig[];
  /** Transitions on terminal symbol (EOF for $) -> target DFAState ID */
  edges: Record<string, number>;
  /** Value of the DFA clock when the state / each edge was added */
  createdAt: number;
  edgeCreatedAt: Record<string, number>;
  /** All configurations predict the same production (accept state f_i of the paper) */
  isAcceptState: boolean;
  predictedAlt?: number;
  /** SLL conflict without a non-conflicting configuration: prediction must switch to LL */
  stackSensitive?: boolean;
}

/** Shared counter of DFA changes; parse steps store its value so a view can show the DFA as it was then. */
export interface DFAClock {
  now: number;
}

export interface LookaheadDFA {
  decisionNumber: number;
  nonTerminal: string;
  startStateId: number;
  states: DFAState[];
  clock: DFAClock;
}

export type LookaheadTraceKind =
  | 'start'        // DFA start state D0 (SLL, stack #)
  | 'sll_cache'    // existing DFA edge followed
  | 'sll_move'     // new DFA state/edge computed by SLL ATN simulation (move + closure)
  | 'sll_conflict' // reached a stack-sensitive state: SLL cannot decide, switch to LL
  | 'll_start'     // LL start configurations with the real parser stack γ0
  | 'll_move'      // LL ATN simulation step (not cached)
  | 'predict'      // unique alternative
  | 'ambiguity'    // LL conflict: true ambiguity, resolved to the minimum alternative
  | 'error'        // no viable alternative: syntax error
  | 'limit';       // safety limit reached

export interface LookaheadTraceStep {
  stepIndex: number;
  kind: LookaheadTraceKind;
  mode: 'SLL' | 'LL';
  /** Lookahead symbol consumed by this step (display form, $ = end of input) */
  token?: string;
  lookaheadIndex: number;
  /** Lookahead symbols consumed so far by this prediction (display form) */
  lookahead: string[];
  /** DFA state reached (SLL steps) */
  dfaStateId?: number;
  /** DFA state the edge starts in (SLL steps that consume a symbol) */
  fromDfaStateId?: number;
  /** Configurations of an LL step (they are not stored in the DFA) */
  configs?: ATNConfig[];
  remainingAlts: number[];
  /** Value of the DFA clock after this step */
  clock: number;
  action: string;
  actionCz: string;
}

export interface PredictionResult {
  predictedAlt: number;
  lookaheadTokens: string[];
  lookaheadDepth: number;
  /** Last DFA state used by SLL prediction */
  dfaStateId: number;
  trace: LookaheadTraceStep[];
  /** SLL found a conflict and full LL prediction decided */
  usedLL?: boolean;
  /** LL found a true ambiguity (alternatives in `ambiguousAlts`) and chose the minimum */
  isAmbiguous?: boolean;
  ambiguousAlts?: number[];
  /** No viable alternative: syntax error at `errorIndex` */
  error?: string;
  errorCz?: string;
  errorIndex?: number;
  /** A safety limit stopped the prediction: the result is undecided */
  limitReached?: boolean;
}

/** Thrown when a closure grows beyond the safety limit (only possible with left recursion). */
export class PredictionLimitError extends Error {}

const MAX_CLOSURE_CONFIGS = 200000;

const stackKey = (stack: number[]) => stack.join(',');
const configKey = (c: ATNConfig) => `${c.stateId}:${c.alt}:${stackKey(c.stack)}`;

function stateConfigsKey(configs: ATNConfig[]): string {
  return configs.map(configKey).sort().join('|');
}

const altsOf = (configs: ATNConfig[]) => Array.from(new Set(configs.map(c => c.alt))).sort((a, b) => a - b);

/**
 * Closure (Function 7): all configurations reachable without consuming input.
 * ε edges keep the stack, a rule edge p –B→ q pushes q and enters p_B, the stop
 * state p'_B pops the return state; with the wildcard # it follows all call sites of B.
 * The busy set on (p, i, γ) is enough for termination in non-left-recursive grammars.
 */
export function computeClosure(initialConfigs: ATNConfig[], atn: ATN): ATNConfig[] {
  const result: ATNConfig[] = [];
  const busy = new Set<string>();
  const work = [...initialConfigs];
  // Without left recursion a rule cannot be entered twice without consuming input,
  // so a closure pushes at most |N| return states on top of the initial stack.
  const maxStack = Math.max(0, ...initialConfigs.map(c => c.stack.length)) + atn.ruleToStartState.size + 1;

  while (work.length > 0) {
    const c = work.pop()!;
    const key = configKey(c);
    if (busy.has(key)) continue;
    busy.add(key);
    if (busy.size > MAX_CLOSURE_CONFIGS) throw new PredictionLimitError('configs');
    result.push(c);

    const state = atn.states[c.stateId];
    if (!state) continue;

    if (state.stateType === 'RULE_STOP') {
      if (c.stack.length === 0) continue; // end of the start rule: only $ may follow
      const top = c.stack[0];
      if (top === WILDCARD) {
        for (const q of atn.ruleFollowers.get(state.ruleName) ?? []) {
          work.push({ stateId: q, alt: c.alt, stack: c.stack });
        }
      } else {
        work.push({ stateId: top, alt: c.alt, stack: c.stack.slice(1) });
      }
      continue;
    }

    for (const t of state.transitions) {
      if (t.kind === 'epsilon') {
        work.push({ stateId: t.target, alt: c.alt, stack: c.stack });
      } else if (t.kind === 'rule' && t.followState !== undefined) {
        if (c.stack.length >= maxStack) throw new PredictionLimitError('stack');
        work.push({ stateId: t.target, alt: c.alt, stack: [t.followState, ...c.stack] });
      }
    }
  }
  // Deterministic order: by alternative, then by state
  result.sort((a, b) => a.alt - b.alt || a.stateId - b.stateId || stackKey(a.stack).localeCompare(stackKey(b.stack)));
  return result;
}

/**
 * move + closure (Function 5 without the DFA bookkeeping): configurations
 * reachable over a terminal edge labelled `symbol`. The end of input EOF is
 * matched by p'_S (stop state of the start rule) with an empty or wildcard stack.
 */
export function computeMove(configs: ATNConfig[], symbol: string, atn: ATN): ATNConfig[] {
  const moved: ATNConfig[] = [];
  for (const c of configs) {
    const state = atn.states[c.stateId];
    if (!state) continue;
    if (symbol === EOF) {
      if (state.stateType === 'RULE_STOP' && state.ruleName === atn.startSymbol &&
        (c.stack.length === 0 || (c.stack.length === 1 && c.stack[0] === WILDCARD))) {
        moved.push({ stateId: c.stateId, alt: c.alt, stack: [] });
      }
      continue;
    }
    for (const t of state.transitions) {
      if (t.kind === 'atom' && t.label === symbol) {
        moved.push({ stateId: t.target, alt: c.alt, stack: c.stack });
      }
    }
  }
  return computeClosure(moved, atn);
}

/** Function 8: for every location (p, γ) the set of predicted alternatives. */
export function getConflictSetsPerLoc(configs: ATNConfig[]): number[][] {
  const m = new Map<string, Set<number>>();
  for (const c of configs) {
    const k = `${c.stateId}:${stackKey(c.stack)}`;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(c.alt);
  }
  return [...m.values()].map(s => [...s].sort((a, b) => a - b));
}

/** Function 9: for every ATN state p the set of predicted alternatives. */
export function getProdSetsPerState(configs: ATNConfig[]): number[][] {
  const m = new Map<number, Set<number>>();
  for (const c of configs) {
    if (!m.has(c.stateId)) m.set(c.stateId, new Set());
    m.get(c.stateId)!.add(c.alt);
  }
  return [...m.values()].map(s => [...s].sort((a, b) => a - b));
}

/** SLL conflict (Function 5): some (p, γ) predicts several alternatives and no state p predicts just one. */
export function isStackSensitive(configs: ATNConfig[]): boolean {
  const conflict = getConflictSetsPerLoc(configs).some(s => s.length > 1);
  const viableAlt = getProdSetsPerState(configs).some(s => s.length === 1);
  return conflict && !viableAlt;
}

/** LL ambiguity (Function 6): all conflict sets are equal and have more than one alternative. */
export function llAmbiguousAlts(configs: ATNConfig[]): number[] | undefined {
  const sets = getConflictSetsPerLoc(configs);
  if (sets.length === 0) return undefined;
  const first = sets[0].join(',');
  if (sets[0].length > 1 && sets.every(s => s.join(',') === first)) return sets[0];
  return undefined;
}

/** Readable configuration "(A → a • B, 2, [S → x A • b, #])". */
export function describeConfig(atn: ATN, c: ATNConfig): string {
  return `(${describeATNState(atn, c.stateId)}, ${c.alt}, ${describeStack(atn, c.stack)})`;
}

export function describeStack(atn: ATN, stack: number[]): string {
  if (stack.length === 0) return '[]';
  return `[${stack.map(q => (q === WILDCARD ? '#' : describeATNState(atn, q))).join(', ')}]`;
}

function getOrCreateDFAState(
  dfa: LookaheadDFA,
  configs: ATNConfig[],
  stateKeyMap: Map<string, number>,
  isStart = false
): { state: DFAState; created: boolean } {
  const key = stateConfigsKey(configs);
  const existingId = stateKeyMap.get(key);
  if (existingId !== undefined) return { state: dfa.states[existingId], created: false };

  const alts = altsOf(configs);
  const isAccept = alts.length === 1;
  const newState: DFAState = {
    id: dfa.states.length,
    configs,
    edges: {},
    createdAt: isStart ? 0 : ++dfa.clock.now, // D0 exists before any prediction
    edgeCreatedAt: {},
    isAcceptState: isAccept,
    predictedAlt: isAccept ? alts[0] : undefined,
    stackSensitive: !isAccept && isStackSensitive(configs)
  };
  dfa.states.push(newState);
  stateKeyMap.set(key, newState.id);
  return { state: newState, created: true };
}

/**
 * Creates the lookahead DFA of a decision with its start state D0 = closure of
 * (p_{A,i}, i, #) for every production i (Function 3 with γ = #).
 */
export function createLookaheadDFA(
  decision: ATNDecisionPoint,
  atn: ATN,
  clock: DFAClock = { now: 0 }
): { dfa: LookaheadDFA; stateKeyMap: Map<string, number> } {
  const dfa: LookaheadDFA = {
    decisionNumber: decision.decisionNumber,
    nonTerminal: decision.nonTerminal,
    startStateId: 0,
    states: [],
    clock
  };
  const stateKeyMap = new Map<string, number>();
  const initialConfigs: ATNConfig[] = decision.alternatives.map(alt => ({
    stateId: alt.targetState,
    alt: alt.alt,
    stack: [WILDCARD]
  }));
  let d0: ATNConfig[];
  try {
    d0 = computeClosure(initialConfigs, atn);
  } catch (e) {
    if (!(e instanceof PredictionLimitError)) throw e;
    d0 = initialConfigs; // left-recursive grammar: ALL(*) is not applicable, keep D0 minimal
  }
  const { state } = getOrCreateDFAState(dfa, d0, stateKeyMap, true);
  dfa.startStateId = state.id;
  return { dfa, stateKeyMap };
}

const fmtAlts = (alts: number[]) => alts.join(', ');

/**
 * adaptivePredict (Functions 2, 4–6): chooses the production of `decision` for the
 * input from `startIndex`.
 *
 * 1. SLL: walk the lookahead DFA; a missing edge is computed by ATN simulation
 *    (move + closure with the wildcard stack) and added to the DFA (cache).
 *    Stop at an accept state (all configurations predict one production).
 * 2. A stack-sensitive state (SLL conflict) switches to LL: the simulation starts
 *    again from `startIndex` with the parser's real stack `parserStack` (follow
 *    states of the active calls, top first). LL results are not cached in the DFA.
 * 3. An LL conflict is a true ambiguity of the input: the minimum production of
 *    the conflicting set is chosen. No configuration left = no viable alternative.
 *
 * Without `parserStack`, LL falls back to the wildcard stack (only SLL information).
 */
export function adaptivePredict(
  decision: ATNDecisionPoint,
  tokens: string[],
  startIndex: number,
  atn: ATN,
  dfa: LookaheadDFA,
  stateKeyMap: Map<string, number>,
  parserStack?: number[]
): PredictionResult {
  const trace: LookaheadTraceStep[] = [];
  const consumed: string[] = [];
  const nt = decision.nonTerminal;
  const sym = (i: number) => (i < tokens.length ? tokens[i] : EOF);
  const push = (s: Omit<LookaheadTraceStep, 'stepIndex' | 'lookahead' | 'clock'>) =>
    trace.push({ ...s, stepIndex: trace.length, lookahead: [...consumed], clock: dfa.clock.now });

  let D = dfa.states[dfa.startStateId];
  const allAlts = decision.alternatives.map(a => a.alt);
  push({
    kind: 'start',
    mode: 'SLL',
    lookaheadIndex: startIndex,
    dfaStateId: D.id,
    remainingAlts: altsOf(D.configs),
    action: `SLL prediction for ${nt} (decision D${decision.decisionNumber}): start in DFA state s${D.id} = closure of (p${nt},i, i, #) for alternatives ${fmtAlts(allAlts)}`,
    actionCz: `Predikce SLL pro ${nt} (rozhodnutí D${decision.decisionNumber}): začíná ve stavu DFA s${D.id} = uzávěr (p${nt},i, i, #) pro alternativy ${fmtAlts(allAlts)}`
  });

  const base = (): Pick<PredictionResult, 'lookaheadTokens' | 'lookaheadDepth' | 'dfaStateId' | 'trace'> => ({
    lookaheadTokens: [...consumed],
    lookaheadDepth: consumed.length,
    dfaStateId: D.id,
    trace
  });

  const limit = (reason = 'stack'): PredictionResult => {
    const why = reason === 'configs'
      ? {
        en: `more than ${MAX_CLOSURE_CONFIGS} configurations (a highly ambiguous grammar: this simulator keeps every stack separately, the paper merges them into a graph-structured stack, §5.1)`,
        cz: `více než ${MAX_CLOSURE_CONFIGS} konfigurací (silně nejednoznačná gramatika: tento simulátor ukládá každý zásobník zvlášť, článek je slučuje do grafově strukturovaného zásobníku, §5.1)`
      }
      : { en: 'the closure keeps entering rules without reading input (left recursion)', cz: 'uzávěr stále vstupuje do pravidel bez čtení vstupu (levá rekurze)' };
    push({
      kind: 'limit',
      mode: 'LL',
      lookaheadIndex: startIndex + consumed.length,
      remainingAlts: [],
      action: `Prediction stopped at a safety limit: ${why.en}. The result is undecided.`,
      actionCz: `Predikce zastavena bezpečnostním limitem: ${why.cz}. Výsledek není rozhodnut.`
    });
    return { ...base(), predictedAlt: allAlts[0] ?? 1, limitReached: true };
  };

  const noViable = (idx: number, mode: 'SLL' | 'LL', a: string): PredictionResult => {
    const tok = displaySymbol(a);
    push({
      kind: 'error',
      mode,
      token: tok,
      lookaheadIndex: idx,
      remainingAlts: [],
      action: `No viable alternative: no configuration can read '${tok}'. Syntax error at position ${idx + 1}.`,
      actionCz: `Žádná životaschopná alternativa: žádná konfigurace nemůže přečíst '${tok}'. Syntaktická chyba na pozici ${idx + 1}.`
    });
    return {
      ...base(),
      predictedAlt: allAlts[0] ?? 1,
      error: `No viable alternative for ${nt} at '${tok}' (position ${idx + 1})`,
      errorCz: `Žádná životaschopná alternativa pro ${nt} na '${tok}' (pozice ${idx + 1})`,
      errorIndex: idx
    };
  };

  try {
    // ---- Stage 1: SLL with the DFA cache (Function 4) ----
    let idx = startIndex;
    let needLL = false;
    while (true) {
      const a = sym(idx);
      const tok = displaySymbol(a);
      const cached = D.edges[a];
      const from = D;
      if (cached !== undefined) {
        D = dfa.states[cached];
        consumed.push(tok);
        push({
          kind: 'sll_cache',
          mode: 'SLL',
          token: tok,
          lookaheadIndex: idx,
          fromDfaStateId: from.id,
          dfaStateId: D.id,
          remainingAlts: altsOf(D.configs),
          action: `'${tok}': DFA edge s${from.id} –${tok}→ s${D.id} is already in the cache (no ATN simulation)`,
          actionCz: `'${tok}': hrana DFA s${from.id} –${tok}→ s${D.id} už je v mezipaměti (bez simulace ATN)`
        });
      } else {
        const next = computeMove(D.configs, a, atn);
        if (next.length === 0) return noViable(idx, 'SLL', a);
        const { state, created } = getOrCreateDFAState(dfa, next, stateKeyMap);
        D.edges[a] = state.id;
        D.edgeCreatedAt[a] = ++dfa.clock.now;
        D = state;
        consumed.push(tok);
        push({
          kind: 'sll_move',
          mode: 'SLL',
          token: tok,
          lookaheadIndex: idx,
          fromDfaStateId: from.id,
          dfaStateId: D.id,
          remainingAlts: altsOf(D.configs),
          action: created
            ? `'${tok}': SLL simulation of the ATN (move + closure) gives ${next.length} configurations, a new DFA state s${D.id}; edge s${from.id} –${tok}→ s${D.id} added to the cache`
            : `'${tok}': SLL simulation of the ATN gives the configurations of the existing DFA state s${D.id}; edge s${from.id} –${tok}→ s${D.id} added to the cache`,
          actionCz: created
            ? `'${tok}': simulace ATN v režimu SLL (move + uzávěr) dává ${next.length} konfigurací, nový stav DFA s${D.id}; hrana s${from.id} –${tok}→ s${D.id} uložena do mezipaměti`
            : `'${tok}': simulace ATN v režimu SLL dává konfigurace existujícího stavu DFA s${D.id}; hrana s${from.id} –${tok}→ s${D.id} uložena do mezipaměti`
        });
      }

      if (D.isAcceptState && D.predictedAlt !== undefined) {
        push({
          kind: 'predict',
          mode: 'SLL',
          lookaheadIndex: idx,
          dfaStateId: D.id,
          remainingAlts: [D.predictedAlt],
          action: `All configurations of s${D.id} predict alternative ${D.predictedAlt}: SLL predicts ${formatAlt(decision, D.predictedAlt)} after ${consumed.length} lookahead symbol(s)`,
          actionCz: `Všechny konfigurace stavu s${D.id} předpovídají alternativu ${D.predictedAlt}: SLL vybírá ${formatAlt(decision, D.predictedAlt)} po ${consumed.length} symbolech pohledu dopředu`
        });
        return { ...base(), predictedAlt: D.predictedAlt };
      }
      if (D.stackSensitive || a === EOF) {
        needLL = true;
        const sets = getConflictSetsPerLoc(D.configs).filter(s => s.length > 1).map(s => `{${s.join(', ')}}`);
        push({
          kind: 'sll_conflict',
          mode: 'SLL',
          lookaheadIndex: idx,
          dfaStateId: D.id,
          remainingAlts: altsOf(D.configs),
          action: `SLL conflict in s${D.id}: configurations with the same (p, γ) predict different alternatives ${sets.join(' ')} and no state predicts a single one. Without the call stack SLL cannot tell an ambiguity from a stack-sensitive decision → retry with full LL from the start of the lookahead.`,
          actionCz: `Konflikt SLL ve stavu s${D.id}: konfigurace se stejným (p, γ) předpovídají různé alternativy ${sets.join(' ')} a žádný stav nepředpovídá jedinou. Bez zásobníku volání SLL nerozliší nejednoznačnost od rozhodnutí závislého na kontextu volání → nový pokus plným LL od začátku pohledu dopředu.`
        });
        break;
      }
      idx++;
    }

    if (!needLL) return { ...base(), predictedAlt: allAlts[0] ?? 1 };

    // ---- Stage 2: full LL with the parser stack γ0 (Function 6), not cached ----
    const gamma0 = parserStack ?? [WILDCARD];
    const sllDfaState = D.id;
    consumed.length = 0;
    let configs = computeClosure(decision.alternatives.map(alt => ({ stateId: alt.targetState, alt: alt.alt, stack: gamma0 })), atn);
    push({
      kind: 'll_start',
      mode: 'LL',
      lookaheadIndex: startIndex,
      configs,
      remainingAlts: altsOf(configs),
      action: `LL prediction: start configurations (p${nt},i, i, γ0) with the parser's call stack γ0 = ${describeStack(atn, gamma0)}; the input is read again from the start of the lookahead`,
      actionCz: `Predikce LL: počáteční konfigurace (p${nt},i, i, γ0) se skutečným zásobníkem volání γ0 = ${describeStack(atn, gamma0)}; vstup se čte znovu od začátku pohledu dopředu`
    });
    idx = startIndex;
    while (true) {
      const a = sym(idx);
      const tok = displaySymbol(a);
      const next = computeMove(configs, a, atn);
      if (next.length === 0) {
        const r = noViable(idx, 'LL', a);
        return { ...r, dfaStateId: sllDfaState, usedLL: true };
      }
      configs = next;
      consumed.push(tok);
      const alts = altsOf(configs);
      push({
        kind: 'll_move',
        mode: 'LL',
        token: tok,
        lookaheadIndex: idx,
        configs,
        remainingAlts: alts,
        action: `'${tok}': LL simulation (move + closure, exact stacks) gives ${configs.length} configurations, alternatives {${fmtAlts(alts)}} (not stored in the DFA)`,
        actionCz: `'${tok}': simulace LL (move + uzávěr s přesnými zásobníky) dává ${configs.length} konfigurací, alternativy {${fmtAlts(alts)}} (neukládá se do DFA)`
      });
      if (alts.length === 1) {
        push({
          kind: 'predict',
          mode: 'LL',
          lookaheadIndex: idx,
          remainingAlts: alts,
          action: `LL predicts alternative ${alts[0]}: ${formatAlt(decision, alts[0])} (the call stack resolved the SLL conflict)`,
          actionCz: `LL předpovídá alternativu ${alts[0]}: ${formatAlt(decision, alts[0])} (zásobník volání vyřešil konflikt SLL)`
        });
        return { ...base(), dfaStateId: sllDfaState, predictedAlt: alts[0], usedLL: true };
      }
      const amb = llAmbiguousAlts(configs);
      if (amb) {
        push({
          kind: 'ambiguity',
          mode: 'LL',
          lookaheadIndex: idx,
          remainingAlts: [amb[0]],
          action: `LL conflict: every (p, γ) is reached by alternatives {${fmtAlts(amb)}} – the input [${consumed.join(' ')}] is ambiguous for ${nt}. Resolved to the minimum alternative ${amb[0]}: ${formatAlt(decision, amb[0])}`,
          actionCz: `Konflikt LL: každé (p, γ) je dosažitelné z alternativ {${fmtAlts(amb)}} – vstup [${consumed.join(' ')}] je pro ${nt} nejednoznačný. Vyřešeno nejmenší alternativou ${amb[0]}: ${formatAlt(decision, amb[0])}`
        });
        return { ...base(), dfaStateId: sllDfaState, predictedAlt: amb[0], usedLL: true, isAmbiguous: true, ambiguousAlts: amb };
      }
      if (a === EOF) {
        // Cannot happen: after $ all configurations are (p'_S, i, []); kept as a guard.
        return { ...limit(), dfaStateId: sllDfaState, usedLL: true };
      }
      idx++;
    }
  } catch (e) {
    if (e instanceof PredictionLimitError) return limit(e.message);
    throw e;
  }
}

function formatAlt(decision: ATNDecisionPoint, alt: number): string {
  const p = decision.alternatives.find(x => x.alt === alt)?.production;
  if (!p) return `alt ${alt}`;
  return `${p.lhs} → ${p.rhs.length === 0 ? 'ε' : p.rhs.join(' ')}`;
}
