/**
 * Bounded search for an ambiguity witness: a word with two different leftmost
 * derivations (two different derivation trees).
 *
 * Ambiguity is undecidable in general, so the search is bounded by the word
 * length. It explores the leftmost derivations breadth-first and remembers the
 * first derivation of every left-sentential form; when another derivation
 * reaches a form already seen, the form has two leftmost derivations. Any
 * terminal word derived from it then has two leftmost derivations as well
 * (both continued the same way), so the grammar is ambiguous.
 *
 * A form whose shortest derivable word is longer than the bound is not
 * expanded. Every leftmost derivation of a word of length ≤ n passes only
 * through forms whose shortest word is ≤ n, so when the search ends without
 * reaching its limits, no word of length ≤ n has two derivation trees.
 */

import { Grammar, Production } from '../ast/grammar';
import { Job, JobControl, runJob, runToEnd, ticker } from '../jobs/job';
import { DerivationNode } from '../generator/wordGenerator';
import { shortestYields } from '../generator/exampleWord';

export type AmbiguityResult =
  | {
    kind: 'ambiguous';
    /** The witness word */
    word: string[];
    /** Two different left parses (rule numbers) of the word */
    parses: [number[], number[]];
    trees: [DerivationNode, DerivationNode];
  }
  /** No word up to `maxLength` has two derivation trees */
  | { kind: 'none-found'; maxLength: number }
  /** The search reached its limit of sentential forms (or was stopped) before finishing */
  | { kind: 'unknown'; maxLength: number; forms: number };

export interface AmbiguityOptions {
  maxLength?: number;
  maxForms?: number;
}

/** Derivation tree of a left parse. */
export function treeFromLeftParse(g: Grammar, parse: number[]): DerivationNode {
  let id = 0;
  const node = (symbol: string): DerivationNode => ({ id: `amb_${id++}`, symbol, isTerminal: !g.nonTerminals.has(symbol) });
  const root = node(g.startSymbol);
  const open: DerivationNode[] = [root];
  for (const ruleId of parse) {
    const p = g.productions.find(q => q.id === ruleId)!;
    const n = open.shift()!;
    n.children = p.rhs.length === 0 ? [{ id: `amb_${id++}`, symbol: 'ε', isTerminal: true }] : p.rhs.map(node);
    open.unshift(...n.children.filter(c => !c.isTerminal));
  }
  return root;
}

export function findAmbiguity(g: Grammar, options: AmbiguityOptions = {}): AmbiguityResult {
  return runJob(findAmbiguitySteps(g, runToEnd(), options));
}

export function* findAmbiguitySteps(g: Grammar, control: JobControl, options: AmbiguityOptions = {}): Job<AmbiguityResult> {
  const maxLength = options.maxLength ?? 10;
  const maxForms = options.maxForms ?? 200000;
  const { len: shortest, rule: shortestRule } = shortestYields(g);
  const byLhs = new Map<string, Production[]>();
  for (const p of g.productions) {
    // A rule with a non-generating symbol never takes part in deriving a word
    if (p.rhs.some(s => g.nonTerminals.has(s) && !shortest.has(s))) continue;
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p);
  }
  if (!shortest.has(g.startSymbol)) return { kind: 'none-found', maxLength };
  const minYield = (form: string[]) => form.reduce((n, s) => n + (g.nonTerminals.has(s) ? shortest.get(s)! : 1), 0);

  // Forms with their first derivation: parent form index and the rule applied
  const forms: { form: string[]; parent: number; rule: number }[] = [{ form: [g.startSymbol], parent: -1, rule: 0 }];
  const index = new Map<string, number>([[g.startSymbol, 0]]);
  const parseOf = (i: number): number[] => {
    const out: number[] = [];
    for (let k = i; forms[k].parent !== -1; k = forms[k].parent) out.push(forms[k].rule);
    return out.reverse();
  };
  const complete = (form: string[]): { word: string[]; rules: number[] } => {
    const rules: number[] = [];
    let f = form;
    for (let i = f.findIndex(s => g.nonTerminals.has(s)); i !== -1; i = f.findIndex(s => g.nonTerminals.has(s))) {
      const p = shortestRule.get(f[i])!;
      rules.push(p.id);
      f = [...f.slice(0, i), ...p.rhs, ...f.slice(i + 1)];
    }
    return { word: f, rules };
  };
  const tick = ticker(400);
  // Forms cut only for their length (many nullable symbols): the search is then not exhaustive
  let truncated = false;

  for (let head = 0; head < forms.length; head++) {
    const { form } = forms[head];
    const i = form.findIndex(s => g.nonTerminals.has(s));
    if (i === -1) continue;
    for (const p of byLhs.get(form[i]) || []) {
      const next = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
      if (minYield(next) > maxLength) continue;
      if (next.length > 3 * maxLength + 8) {
        truncated = true;
        continue;
      }
      const key = next.join('\u0000');
      const seen = index.get(key);
      if (seen !== undefined) {
        // A second leftmost derivation of the same form
        const first = parseOf(seen);
        const second = [...parseOf(head), p.id];
        const { word, rules } = complete(next);
        const parses: [number[], number[]] = [[...first, ...rules], [...second, ...rules]];
        return { kind: 'ambiguous', word, parses, trees: [treeFromLeftParse(g, parses[0]), treeFromLeftParse(g, parses[1])] };
      }
      index.set(key, forms.length);
      forms.push({ form: next, parent: head, rule: p.id });
      if (forms.length >= maxForms) return { kind: 'unknown', maxLength, forms: forms.length };
    }
    if (tick()) {
      yield { en: `ambiguity search: ${forms.length} sentential forms`, cz: `hledání nejednoznačnosti: ${forms.length} větných forem` };
      if (control.stop) return { kind: 'unknown', maxLength, forms: forms.length };
    }
  }
  return truncated ? { kind: 'unknown', maxLength, forms: forms.length } : { kind: 'none-found', maxLength };
}
