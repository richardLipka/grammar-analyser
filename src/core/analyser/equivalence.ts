/**
 * "Is my grammar the same?" — comparing the languages of two grammars on all
 * short words, and checking the form a transformation promises.
 *
 * Equivalence of context-free grammars is undecidable, so the comparison can
 * only find a difference or report that there is none up to some length (a
 * hint, not a proof). The words are generated length by length, so the first
 * difference found is a shortest one. Both grammars are run as incremental
 * Earley recognizers over a tree of prefixes: a prefix that neither grammar
 * can extend to a word of its language is not extended, which makes sparse
 * languages cheap; for a dense language the cost grows like |Σ|^n.
 */

import { Grammar, Production } from '../ast/grammar';
import { Job, JobControl, runJob, runToEnd, ticker } from '../jobs/job';
import { analyzeGrammar, computeEndable, computeLeftRecursion, computeNullable, computeReachable } from './grammarAnalyser';
import { buildLLTable } from '../ll/llTable';
import { cnfViolations } from '../parser/cyk';

type Item = { p: Production; dot: number; origin: number };

/** Earley recognizer that is fed one terminal at a time (the sets of the prefix are kept by the caller). */
class IncrementalEarley {
  private byLhs = new Map<string, Production[]>();
  private nullable = new Set<string>();
  private start: Production;

  constructor(private g: Grammar) {
    // only rules whose symbols all derive some word can be used in a derivation of a word
    const generating = new Set<string>();
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of g.productions) {
        if (!generating.has(p.lhs) && p.rhs.every(s => !g.nonTerminals.has(s) || generating.has(s))) {
          generating.add(p.lhs);
          changed = true;
        }
      }
    }
    for (const p of g.productions) {
      if (!p.rhs.every(s => !g.nonTerminals.has(s) || generating.has(s))) continue;
      if (!this.byLhs.has(p.lhs)) this.byLhs.set(p.lhs, []);
      this.byLhs.get(p.lhs)!.push(p);
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of g.productions) {
        if (!this.nullable.has(p.lhs) && p.rhs.every(s => this.nullable.has(s))) {
          this.nullable.add(p.lhs);
          changed = true;
        }
      }
    }
    this.start = { id: -1, lhs: '\u0000', rhs: generating.has(g.startSymbol) ? [g.startSymbol] : ['\u0001'] };
  }

  /** Predictions and completions at position k (sets[k] holds the scanned items). */
  private close(sets: Item[][], k: number) {
    const set = sets[k];
    const seen = new Set(set.map(it => `${it.p.id}|${it.p.lhs}|${it.dot}|${it.origin}`));
    const add = (it: Item) => {
      const key = `${it.p.id}|${it.p.lhs}|${it.dot}|${it.origin}`;
      if (!seen.has(key)) {
        seen.add(key);
        set.push(it);
      }
    };
    for (let i = 0; i < set.length; i++) {
      const it = set[i];
      if (it.dot < it.p.rhs.length) {
        const B = it.p.rhs[it.dot];
        if (this.g.nonTerminals.has(B)) {
          for (const q of this.byLhs.get(B) || []) add({ p: q, dot: 0, origin: k });
          if (this.nullable.has(B)) add({ p: it.p, dot: it.dot + 1, origin: it.origin });
        }
      } else {
        for (const w of sets[it.origin]) {
          if (w.dot < w.p.rhs.length && w.p.rhs[w.dot] === it.p.lhs) add({ p: w.p, dot: w.dot + 1, origin: w.origin });
        }
      }
    }
  }

  initial(): Item[][] {
    const sets: Item[][] = [[{ p: this.start, dot: 0, origin: 0 }]];
    this.close(sets, 0);
    return sets;
  }

  /** The sets after reading `a` (a new array; the old one is unchanged). */
  advance(sets: Item[][], a: string): Item[][] {
    const k = sets.length;
    const next = [...sets, [] as Item[]];
    for (const it of sets[k - 1]) {
      if (it.dot < it.p.rhs.length && it.p.rhs[it.dot] === a && !this.g.nonTerminals.has(a)) {
        next[k].push({ p: it.p, dot: it.dot + 1, origin: it.origin });
      }
    }
    if (next[k].length > 0) this.close(next, k);
    return next;
  }

  /** Some word of the language starts with the prefix read so far. */
  alive(sets: Item[][]): boolean {
    return sets[sets.length - 1].length > 0;
  }

  accepts(sets: Item[][]): boolean {
    return sets[sets.length - 1].some(it => it.p.id === -1 && it.dot === 1 && it.origin === 0);
  }
}

export type ComparisonResult =
  | {
    kind: 'different';
    /** A shortest word in exactly one of the languages */
    word: string[];
    inFirst: boolean;
    inSecond: boolean;
    /** All shorter words agree */
    checkedLength: number;
    wordsChecked: number;
  }
  | {
    kind: 'same-up-to';
    /** Every word up to this length is in both languages or in neither (-1: not even ε checked) */
    length: number;
    wordsChecked: number;
    /** Stopped by the user or at the maximal length before reaching it */
    stopped: boolean;
  };

export function compareLanguages(g1: Grammar, g2: Grammar, maxLength = 8): ComparisonResult {
  return runJob(compareLanguagesSteps(g1, g2, runToEnd(), maxLength));
}

export function* compareLanguagesSteps(g1: Grammar, g2: Grammar, control: JobControl, maxLength = 30): Job<ComparisonResult> {
  const e1 = new IncrementalEarley(g1);
  const e2 = new IncrementalEarley(g2);
  const alphabet = [...new Set([...g1.terminals, ...g2.terminals])].sort();
  const tick = ticker(200);
  let wordsChecked = 0;
  let found: { word: string[]; inFirst: boolean; inSecond: boolean } | null = null;

  // All words of length L whose prefixes some grammar can extend; stops at the first difference
  const dfs = function* (prefix: string[], s1: Item[][] | null, s2: Item[][] | null, L: number): Generator<{ en: string; cz: string } | undefined, void, void> {
    if (prefix.length === L) {
      wordsChecked++;
      const a1 = !!s1 && e1.accepts(s1);
      const a2 = !!s2 && e2.accepts(s2);
      if (a1 !== a2) found = { word: [...prefix], inFirst: a1, inSecond: a2 };
      if (tick()) yield { en: `length ${L}: ${wordsChecked} words checked`, cz: `délka ${L}: zkontrolováno ${wordsChecked} slov` };
      return;
    }
    for (const a of alphabet) {
      const n1 = s1 && e1.alive(s1) ? e1.advance(s1, a) : null;
      const n2 = s2 && e2.alive(s2) ? e2.advance(s2, a) : null;
      const alive1 = !!n1 && e1.alive(n1);
      const alive2 = !!n2 && e2.alive(n2);
      if (!alive1 && !alive2) continue;
      yield* dfs([...prefix, a], alive1 ? n1 : null, alive2 ? n2 : null, L);
      if (found || control.stop) return;
    }
  };

  for (let L = 0; L <= maxLength; L++) {
    yield { en: `length ${L}`, cz: `délka ${L}` };
    if (control.stop) return { kind: 'same-up-to', length: L - 1, wordsChecked, stopped: true };
    yield* dfs([], e1.initial(), e2.initial(), L);
    const f = found as { word: string[]; inFirst: boolean; inSecond: boolean } | null;
    if (f) return { kind: 'different', ...f, checkedLength: L - 1, wordsChecked };
    if (control.stop) return { kind: 'same-up-to', length: L - 1, wordsChecked, stopped: true };
  }
  return { kind: 'same-up-to', length: maxLength, wordsChecked, stopped: false };
}

// ---------------------------------------------------------------------------
// The form promised by a transformation
// ---------------------------------------------------------------------------

export type FormProperty = 'reduced' | 'epsFree' | 'noUnit' | 'noLeftRecursion' | 'leftFactored' | 'll1' | 'cnf' | 'gnf';

export interface FormCheck {
  property: FormProperty;
  ok: boolean;
  /** Rules (or non-terminals) that violate the property */
  offending: string[];
}

const fmt = (p: Production) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;

/** Whether the grammar has the properties a transformation promises, with the rules that violate them. */
export function checkForm(g: Grammar, properties: FormProperty[]): FormCheck[] {
  const startOnRight = g.productions.some(p => p.rhs.includes(g.startSymbol));
  const allowedEps = (p: Production) => p.lhs === g.startSymbol && !startOnRight;
  const result: FormCheck[] = [];
  for (const property of properties) {
    let offending: string[] = [];
    switch (property) {
      case 'reduced': {
        const gen = computeEndable(g);
        const reach = computeReachable(g);
        offending = [...g.nonTerminals].filter(nt => !gen.has(nt) || !reach.has(nt));
        break;
      }
      case 'epsFree':
        offending = g.productions.filter(p => p.rhs.length === 0 && !allowedEps(p)).map(fmt);
        break;
      case 'noUnit':
        offending = g.productions.filter(p => p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0])).map(fmt);
        break;
      case 'noLeftRecursion':
        offending = [...computeLeftRecursion(g, computeNullable(g)).kinds.keys()];
        break;
      case 'leftFactored':
        for (const A of g.nonTerminals) {
          const firsts = new Map<string, number>();
          for (const p of g.productions) if (p.lhs === A && p.rhs.length > 0) firsts.set(p.rhs[0], (firsts.get(p.rhs[0]) || 0) + 1);
          for (const [X, n] of firsts) if (n > 1) offending.push(`${A} → ${X} …`);
        }
        break;
      case 'll1': {
        const table = buildLLTable(g, analyzeGrammar(g, { k2: false }), { ll2: false });
        offending = table.conflicts.map(c => `${c.nonTerminal} / ${c.lookahead}`);
        break;
      }
      case 'cnf':
        offending = cnfViolations(g).map(fmt);
        break;
      case 'gnf':
        offending = g.productions
          .filter(p => (p.rhs.length === 0 ? !allowedEps(p) : g.nonTerminals.has(p.rhs[0]) || p.rhs.slice(1).some(s => !g.nonTerminals.has(s))))
          .map(fmt);
        break;
    }
    result.push({ property, ok: offending.length === 0, offending });
  }
  return result;
}
