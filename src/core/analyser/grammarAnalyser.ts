/**
 * Formal Grammar Analyser
 * Computes:
 * - Nullable symbols
 * - Endable (generating / terminating) symbols
 * - Reachable symbols
 * - FIRST_1 and FIRST_2 sets
 * - FOLLOW_1 and FOLLOW_2 sets
 * - Lookahead / Predict / Director sets for productions
 */

import { Grammar, Production, EPSILON, END_MARKER } from '../ast/grammar';
import { Job, JobControl, runJob, runToEnd, ticker } from '../jobs/job';

export interface GrammarAnalysis {
  nullable: Set<string>;
  endable: Set<string>;
  reachable: Set<string>;
  first1: Map<string, Set<string>>;
  follow1: Map<string, Set<string>>;
  predict1: Map<number, Set<string>>; // production id -> Set of lookahead tokens
  first2: Map<string, Set<string>>;
  follow2: Map<string, Set<string>>;
  predict2: Map<number, Set<string>>;
  leftRecursion: LeftRecursionInfo;
  /** Non-terminals A with A ⇒+ A (cyclic grammars are ambiguous and not LR(k)/LL(k)). */
  cyclic: Set<string>;
}

export type LeftRecursionKind = 'immediate' | 'hidden' | 'indirect';

export interface LeftRecursionInfo {
  /** A has a rule A -> A α. */
  immediate: Set<string>;
  /** A ⇒+ A α through other non-terminals or a nullable prefix, without an immediate rule. */
  indirect: Set<string>;
  /**
   * Every left-recursive A with all the ways it is left-recursive: immediate
   * (A → A α), hidden (A → B A α with B ⇒+ ε), indirect (A → B α, B ⇒+ A β).
   */
  kinds: Map<string, LeftRecursionKind[]>;
}

export interface AnalyzeOptions {
  /** Compute FIRST₂/FOLLOW₂ (default true); without them the k = 2 maps are empty. */
  k2?: boolean;
}

export function analyzeGrammar(g: Grammar, options: AnalyzeOptions = {}): GrammarAnalysis {
  return runJob(analyzeGrammarSteps(g, runToEnd(), options))!;
}

/** analyzeGrammar as a job: yields during the FIRST₂/FOLLOW₂ fixpoints; null when stopped. */
export function* analyzeGrammarSteps(g: Grammar, control: JobControl, options: AnalyzeOptions = {}): Job<GrammarAnalysis | null> {
  const nullable = computeNullable(g);
  const endable = computeEndable(g);
  const reachable = computeReachable(g);

  const first1 = computeFirst1(g, nullable);
  const follow1 = computeFollow1(g, first1, nullable);
  const predict1 = computePredict1(g, first1, follow1, nullable);

  let first2 = new Map<string, Set<string>>();
  let follow2 = new Map<string, Set<string>>();
  let predict2 = new Map<number, Set<string>>();
  if (options.k2 !== false) {
    const progress = { en: 'FIRST₂ and FOLLOW₂', cz: 'FIRST₂ a FOLLOW₂' };
    yield progress;
    if (control.stop) return null;
    first2 = yield* firstKSteps(g, 2, control);
    if (control.stop) return null;
    follow2 = yield* followKSteps(g, first2, 2, control);
    if (control.stop) return null;
    predict2 = computePredictK(g, first2, follow2, 2);
  }

  const leftRecursion = computeLeftRecursion(g, nullable);
  const cyclic = computeCyclic(g, nullable);

  return {
    nullable,
    endable,
    reachable,
    first1,
    follow1,
    predict1,
    first2,
    follow2,
    predict2,
    leftRecursion,
    cyclic
  };
}

/** Non-terminals that can reach themselves in the given successor relation. */
function nodesOnCycles(nodes: Iterable<string>, succ: Map<string, Set<string>>): Set<string> {
  const result = new Set<string>();
  for (const start of nodes) {
    const stack = [...(succ.get(start) || [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (x === start) {
        result.add(start);
        break;
      }
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of succ.get(x) || []) stack.push(y);
    }
  }
  return result;
}

/**
 * Left recursion: A ⇒+ A α. A rule A -> X1 ... Xk B β with X1..Xk nullable
 * gives the edge A → B; A is left-recursive when it lies on a cycle.
 */
export function computeLeftRecursion(g: Grammar, nullable: Set<string>): LeftRecursionInfo {
  const succ = new Map<string, Set<string>>();
  for (const nt of g.nonTerminals) succ.set(nt, new Set());
  for (const p of g.productions) {
    for (const sym of p.rhs) {
      if (!g.nonTerminals.has(sym)) break;
      succ.get(p.lhs)!.add(sym);
      if (!nullable.has(sym)) break;
    }
  }
  const all = nodesOnCycles(g.nonTerminals, succ);
  const immediate = new Set(
    g.productions.filter(p => p.rhs.length > 0 && p.rhs[0] === p.lhs).map(p => p.lhs)
  );
  const indirect = new Set([...all].filter(nt => !immediate.has(nt)));

  // A → X1 … Xk A α with k ≥ 1 and all Xi nullable
  const hidden = new Set<string>();
  for (const p of g.productions) {
    for (let i = 0; i < p.rhs.length && nullable.has(p.rhs[i]); i++) {
      if (p.rhs[i + 1] === p.lhs) hidden.add(p.lhs);
    }
  }
  // A reaches itself through another non-terminal
  const reaches = (from: string, to: string) => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(succ.get(x) || []));
    }
    return false;
  };
  const kinds = new Map<string, LeftRecursionKind[]>();
  for (const nt of all) {
    const list: LeftRecursionKind[] = [];
    if (immediate.has(nt)) list.push('immediate');
    if (hidden.has(nt)) list.push('hidden');
    if ([...(succ.get(nt) || [])].some(b => b !== nt && reaches(b, nt))) list.push('indirect');
    kinds.set(nt, list);
  }
  return { immediate, indirect, kinds };
}

/** Cycles A ⇒+ A: rule A -> α B β with α and β nullable gives the edge A → B. */
export function computeCyclic(g: Grammar, nullable: Set<string>): Set<string> {
  const succ = new Map<string, Set<string>>();
  for (const nt of g.nonTerminals) succ.set(nt, new Set());
  for (const p of g.productions) {
    p.rhs.forEach((sym, i) => {
      if (!g.nonTerminals.has(sym)) return;
      const others = [...p.rhs.slice(0, i), ...p.rhs.slice(i + 1)];
      if (others.every(o => nullable.has(o))) succ.get(p.lhs)!.add(sym);
    });
  }
  return nodesOnCycles(g.nonTerminals, succ);
}

/**
 * Nullable: nonterminals that can derive epsilon
 */
export function computeNullable(g: Grammar): Set<string> {
  const nullable = new Set<string>();

  // Base: A -> ε
  for (const p of g.productions) {
    if (p.rhs.length === 0) {
      nullable.add(p.lhs);
    }
  }

  // Fixed point
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (!nullable.has(p.lhs)) {
        if (p.rhs.length > 0 && p.rhs.every(sym => nullable.has(sym))) {
          nullable.add(p.lhs);
          changed = true;
        }
      }
    }
  }

  return nullable;
}

/**
 * Endable / Terminating / Generating: symbols that can derive a string of terminals
 */
export function computeEndable(g: Grammar): Set<string> {
  const generating = new Set<string>(g.terminals);

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (!generating.has(p.lhs)) {
        // Empty RHS derives ε (which is in T*)
        if (p.rhs.length === 0 || p.rhs.every(sym => generating.has(sym))) {
          generating.add(p.lhs);
          changed = true;
        }
      }
    }
  }

  return generating;
}

/**
 * Reachable: symbols reachable from start symbol
 */
export function computeReachable(g: Grammar): Set<string> {
  const reachable = new Set<string>();
  if (g.startSymbol) {
    reachable.add(g.startSymbol);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (reachable.has(p.lhs)) {
        for (const sym of p.rhs) {
          if (!reachable.has(sym)) {
            reachable.add(sym);
            changed = true;
          }
        }
      }
    }
  }

  return reachable;
}

/**
 * FIRST_1 calculation for all symbols
 */
export function computeFirst1(g: Grammar, nullable: Set<string>): Map<string, Set<string>> {
  const first = new Map<string, Set<string>>();

  // Terminals: FIRST(a) = {a}
  for (const t of g.terminals) {
    first.set(t, new Set([t]));
  }
  first.set(END_MARKER, new Set([END_MARKER]));

  // Non-terminals initialization
  for (const nt of g.nonTerminals) {
    const set = new Set<string>();
    if (nullable.has(nt)) {
      set.add(EPSILON);
    }
    first.set(nt, set);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      const targetSet = first.get(p.lhs)!;
      const initialSize = targetSet.size;

      if (p.rhs.length === 0) {
        targetSet.add(EPSILON);
      } else {
        let allNullable = true;
        for (const sym of p.rhs) {
          const symFirst = first.get(sym);
          if (symFirst) {
            for (const item of symFirst) {
              if (item !== EPSILON) {
                targetSet.add(item);
              }
            }
          }
          if (!nullable.has(sym)) {
            allNullable = false;
            break;
          }
        }
        if (allNullable) {
          targetSet.add(EPSILON);
        }
      }

      if (targetSet.size > initialSize) {
        changed = true;
      }
    }
  }

  return first;
}

/**
 * FIRST_1 for an arbitrary sequence of symbols
 */
export function first1OfString(
  symbols: string[],
  first1: Map<string, Set<string>>,
  nullable: Set<string>
): Set<string> {
  const result = new Set<string>();
  if (symbols.length === 0) {
    result.add(EPSILON);
    return result;
  }

  let allNullable = true;
  for (const sym of symbols) {
    let symFirst = first1.get(sym);
    if (!symFirst) {
      if (sym === EPSILON) {
        continue;
      }
      symFirst = new Set([sym]);
    }
    for (const item of symFirst) {
      if (item !== EPSILON) {
        result.add(item);
      }
    }
    if (!nullable.has(sym) && !symFirst.has(EPSILON)) {
      allNullable = false;
      break;
    }
  }

  if (allNullable) {
    result.add(EPSILON);
  }

  return result;
}

/**
 * FOLLOW_1 calculation for all non-terminals
 */
export function computeFollow1(
  g: Grammar,
  first1: Map<string, Set<string>>,
  nullable: Set<string>
): Map<string, Set<string>> {
  const follow = new Map<string, Set<string>>();

  for (const nt of g.nonTerminals) {
    follow.set(nt, new Set<string>());
  }

  if (g.startSymbol && follow.has(g.startSymbol)) {
    follow.get(g.startSymbol)!.add(END_MARKER);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      for (let i = 0; i < p.rhs.length; i++) {
        const B = p.rhs[i];
        if (!g.nonTerminals.has(B)) continue;

        const followB = follow.get(B)!;
        const initialSize = followB.size;

        const beta = p.rhs.slice(i + 1);
        const firstBeta = first1OfString(beta, first1, nullable);

        for (const item of firstBeta) {
          if (item !== EPSILON) {
            followB.add(item);
          }
        }

        if (firstBeta.has(EPSILON)) {
          const followA = follow.get(p.lhs)!;
          for (const item of followA) {
            followB.add(item);
          }
        }

        if (followB.size > initialSize) {
          changed = true;
        }
      }
    }
  }

  return follow;
}

/**
 * Predict / Lookahead sets for each production:
 * LOOKAHEAD(A -> α) = FIRST_1(α · FOLLOW_1(A))
 */
export function computePredict1(
  g: Grammar,
  first1: Map<string, Set<string>>,
  follow1: Map<string, Set<string>>,
  nullable: Set<string>
): Map<number, Set<string>> {
  const predict = new Map<number, Set<string>>();

  for (const p of g.productions) {
    const lookahead = new Set<string>();
    const firstRhs = first1OfString(p.rhs, first1, nullable);

    for (const item of firstRhs) {
      if (item !== EPSILON) {
        lookahead.add(item);
      }
    }

    if (firstRhs.has(EPSILON)) {
      const followA = follow1.get(p.lhs) || new Set();
      for (const item of followA) {
        lookahead.add(item);
      }
    }

    predict.set(p.id, lookahead);
  }

  return predict;
}

/**
 * Generalized FIRST_k for strings of length <= k
 */
export function computeFirstK(g: Grammar, k: number): Map<string, Set<string>> {
  return runJob(firstKSteps(g, k, runToEnd()));
}

/** FIRST_k fixpoint as a job (yields after every round over the rules). */
function* firstKSteps(g: Grammar, k: number, control: JobControl): Job<Map<string, Set<string>>> {
  const firstK = new Map<string, Set<string>>();

  // Terminals
  for (const t of g.terminals) {
    firstK.set(t, new Set([t]));
  }

  // Non-terminals
  for (const nt of g.nonTerminals) {
    firstK.set(nt, new Set());
  }

  const tick = ticker(40);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      const target = firstK.get(p.lhs)!;
      const initialSize = target.size;

      const rhsPrefixes = firstKOfString(p.rhs, firstK, k);
      for (const prefix of rhsPrefixes) {
        target.add(prefix);
      }

      if (target.size > initialSize) {
        changed = true;
      }
      if (tick()) {
        yield undefined;
        if (control.stop) return firstK;
      }
    }
  }

  return firstK;
}

export function firstKOfString(
  symbols: string[],
  firstK: Map<string, Set<string>>,
  k: number
): Set<string> {
  let result = new Set<string>(['']);

  for (const sym of symbols) {
    const symFirst = firstK.get(sym) || new Set([sym]);
    const nextResult = new Set<string>();

    for (const prefix of result) {
      for (const next of symFirst) {
        const combined = prefix.length === 0 ? next : (next === '' ? prefix : `${prefix} ${next}`);
        const words = combined.split(' ').filter(Boolean);
        const truncated = words.slice(0, k).join(' ');
        nextResult.add(truncated);
      }
    }
    result = nextResult;
  }

  return result;
}

/**
 * Generalized FOLLOW_k
 */
export function computeFollowK(
  g: Grammar,
  firstK: Map<string, Set<string>>,
  k: number
): Map<string, Set<string>> {
  return runJob(followKSteps(g, firstK, k, runToEnd()));
}

/** FOLLOW_k fixpoint as a job. */
function* followKSteps(
  g: Grammar,
  firstK: Map<string, Set<string>>,
  k: number,
  control: JobControl
): Job<Map<string, Set<string>>> {
  const tick = ticker(40);
  const follow = new Map<string, Set<string>>();

  for (const nt of g.nonTerminals) {
    follow.set(nt, new Set());
  }

  if (g.startSymbol && follow.has(g.startSymbol)) {
    follow.get(g.startSymbol)!.add(END_MARKER);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      for (let i = 0; i < p.rhs.length; i++) {
        const B = p.rhs[i];
        if (!g.nonTerminals.has(B)) continue;

        const followB = follow.get(B)!;
        const initialSize = followB.size;

        const beta = p.rhs.slice(i + 1);
        const firstBeta = firstKOfString(beta, firstK, k);
        const followA = follow.get(p.lhs)!;

        for (const prefix of firstBeta) {
          if (prefix.split(' ').filter(Boolean).length >= k) {
            followB.add(prefix);
          } else {
            for (const fol of followA) {
              const combined = prefix.length === 0 ? fol : (fol.length === 0 ? prefix : `${prefix} ${fol}`);
              const words = combined.split(' ').filter(Boolean).slice(0, k).join(' ');
              followB.add(words);
            }
          }
        }

        if (followB.size > initialSize) {
          changed = true;
        }
      }
      if (tick()) {
        yield undefined;
        if (control.stop) return follow;
      }
    }
  }

  return follow;
}

export function computePredictK(
  g: Grammar,
  firstK: Map<string, Set<string>>,
  followK: Map<string, Set<string>>,
  k: number
): Map<number, Set<string>> {
  const predict = new Map<number, Set<string>>();

  for (const p of g.productions) {
    const lookahead = new Set<string>();
    const firstRhs = firstKOfString(p.rhs, firstK, k);
    const followA = followK.get(p.lhs) || new Set(['']);

    for (const prefix of firstRhs) {
      const words = prefix.split(' ').filter(Boolean);
      if (words.length >= k) {
        lookahead.add(prefix);
      } else {
        for (const fol of followA) {
          const combined = prefix.length === 0 ? fol : (fol.length === 0 ? prefix : `${prefix} ${fol}`);
          const truncated = combined.split(' ').filter(Boolean).slice(0, k).join(' ');
          lookahead.add(truncated);
        }
      }
    }

    predict.set(p.id, lookahead);
  }

  return predict;
}
