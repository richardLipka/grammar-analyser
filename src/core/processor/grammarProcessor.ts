/**
 * Grammar Processor: Performs equivalent grammar transformations
 * - Reduced grammar (remove unproductive & unreachable symbols)
 * - Epsilon-production elimination
 * - Unit-production elimination
 * - Immediate and indirect left-recursion elimination (Paull's algorithm)
 * - Left factorization
 * - Substitution / Expansion
 * - Chomsky Normal Form (CNF)
 * - Greibach Normal Form (GNF)
 *
 * Every transformation preserves L(G) and generates pedagogical step-by-step
 * explanations with full bilingual support (EN/CZ).
 */

import {
  Grammar,
  Production,
  cloneGrammar,
  formatProduction,
  formatRhs,
  freshName,
  normalizeGrammar,
  dedupeProductions
} from '../ast/grammar';
import {
  computeNullable,
  computeEndable,
  computeReachable,
  computeLeftRecursion,
  computeCyclic
} from '../analyser/grammarAnalyser';

export interface TransformationStep {
  title: string;
  titleCz?: string;
  description: string;
  descriptionCz?: string;
  mathExplanation?: string;
  mathExplanationCz?: string;
  addedRules?: string[];
  removedRules?: string[];
  /** Grammar after this step (shown on demand in the proof log). */
  intermediateGrammar?: Grammar;
}

export interface TransformationResult {
  transformedGrammar: Grammar;
  steps: TransformationStep[];
}

export type SymbolTransformationType =
  | 'eliminateImmediateLeftRecursion'
  | 'leftFactor'
  | 'eliminateEpsilon'
  | 'eliminateUnit'
  | 'substitute'
  | 'expandLeadingNT'
  | 'removeUnproductive'
  | 'removeUnreachable';

export interface AvailableSymbolTransformation {
  id: string;
  type: SymbolTransformationType;
  labelEn: string;
  labelCz: string;
  descriptionEn: string;
  descriptionCz: string;
  details?: {
    prefix?: string[];
    leadingNt?: string;
  };
}

/** Safety bound for constructions whose size can grow exponentially (GNF, substitution). */
const MAX_PRODUCTIONS = 5000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Alt = string[];

const altKey = (rhs: Alt) => rhs.join('\u0000');

function dedupeAlts(alts: Alt[]): Alt[] {
  const seen = new Set<string>();
  return alts.filter(a => {
    const k = altKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fmtSet(items: Iterable<string>, none: string): string {
  const arr = [...items];
  return arr.length > 0 ? `{ ${arr.join(', ')} }` : none;
}

function fmtRule(lhs: string, rhs: Alt): string {
  return `${lhs} -> ${formatRhs(rhs)}`;
}

function occursOnRhs(g: Grammar, sym: string): boolean {
  return g.productions.some(p => p.rhs.includes(sym));
}

/**
 * Ordered rule table (one entry per non-terminal, start symbol first) that
 * lets transformations replace a non-terminal's rules in place and insert
 * new non-terminals right after the one they were derived from.
 */
class RuleTable {
  order: string[] = [];
  rules = new Map<string, Alt[]>();
  private taken: Set<string>;

  constructor(private base: Grammar) {
    this.taken = new Set([...base.nonTerminals, ...base.terminals]);
    if (base.productions.some(p => p.lhs === base.startSymbol)) {
      this.ensure(base.startSymbol);
    }
    for (const p of base.productions) {
      this.ensure(p.lhs);
      this.rules.get(p.lhs)!.push([...p.rhs]);
    }
  }

  private ensure(nt: string) {
    if (!this.rules.has(nt)) {
      this.rules.set(nt, []);
      this.order.push(nt);
      this.taken.add(nt);
    }
  }

  get(nt: string): Alt[] {
    return this.rules.get(nt) || [];
  }

  set(nt: string, alts: Alt[]) {
    this.ensure(nt);
    this.rules.set(nt, dedupeAlts(alts));
  }

  /** Creates a fresh non-terminal placed right after `after` in the display order. */
  addAfter(after: string, base: string, alts: Alt[]): string {
    const name = freshName(base, s => this.taken.has(s));
    this.taken.add(name);
    this.rules.set(name, dedupeAlts(alts));
    const idx = this.order.indexOf(after);
    this.order.splice(idx === -1 ? this.order.length : idx + 1, 0, name);
    return name;
  }

  fresh(base: string): string {
    const name = freshName(base, s => this.taken.has(s));
    this.taken.add(name);
    return name;
  }

  size(): number {
    let n = 0;
    for (const alts of this.rules.values()) n += alts.length;
    return n;
  }

  toGrammar(startSymbol: string = this.base.startSymbol): Grammar {
    const productions: Production[] = [];
    for (const nt of this.order) {
      for (const rhs of this.rules.get(nt) || []) {
        productions.push({ id: 0, lhs: nt, rhs: [...rhs] });
      }
    }
    return normalizeGrammar({
      nonTerminals: new Set([...this.base.nonTerminals, ...this.order]),
      terminals: new Set(this.base.terminals),
      startSymbol,
      productions
    });
  }
}

/** Builds a normalized grammar from a list of rules, keeping all rules of a LHS together. */
function buildGrammar(base: Grammar, rules: { lhs: string; rhs: Alt }[], startSymbol: string = base.startSymbol): Grammar {
  const order: string[] = [];
  const byLhs = new Map<string, Alt[]>();
  if (rules.some(r => r.lhs === startSymbol)) {
    order.push(startSymbol);
    byLhs.set(startSymbol, []);
  }
  for (const r of rules) {
    if (!byLhs.has(r.lhs)) {
      byLhs.set(r.lhs, []);
      order.push(r.lhs);
    }
    byLhs.get(r.lhs)!.push(r.rhs);
  }
  const productions: Production[] = [];
  for (const lhs of order) {
    for (const rhs of byLhs.get(lhs)!) productions.push({ id: 0, lhs, rhs: [...rhs] });
  }
  return normalizeGrammar({
    nonTerminals: new Set([...base.nonTerminals, ...order, startSymbol]),
    terminals: new Set(base.terminals),
    startSymbol,
    productions: dedupeProductions(productions)
  });
}

function withSnapshot(steps: TransformationStep[], g: Grammar): TransformationStep[] {
  if (steps.length > 0) {
    steps[steps.length - 1].intermediateGrammar = cloneGrammar(g);
  }
  return steps;
}

function commonPrefix(a: string[], b: string[]): string[] {
  const prefix: string[] = [];
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) break;
    prefix.push(a[i]);
  }
  return prefix;
}

function hasPrefix(arr: string[], prefix: string[]): boolean {
  if (arr.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (arr[i] !== prefix[i]) return false;
  }
  return true;
}

/** True when the grammar has an ε-rule other than S -> ε with S absent from all right-hand sides. */
function hasForbiddenEpsilonRules(g: Grammar): boolean {
  return g.productions.some(
    p => p.rhs.length === 0 && (p.lhs !== g.startSymbol || occursOnRhs(g, g.startSymbol))
  );
}

// ---------------------------------------------------------------------------
// 1. Reduced grammar
// ---------------------------------------------------------------------------

/**
 * Reduce Grammar (remove non-generating, then unreachable symbols).
 * The order matters: removing non-generating symbols first can make further
 * symbols unreachable, but not vice versa.
 */
export function reduceGrammar(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];

  // Phase 1: generating symbols
  const generating = computeEndable(g);
  const genNts = [...g.nonTerminals].filter(nt => generating.has(nt));
  const nonGenerating = [...g.nonTerminals].filter(nt => !generating.has(nt));
  const kept1 = g.productions.filter(p => generating.has(p.lhs) && p.rhs.every(sym => generating.has(sym)));
  const removed1 = g.productions.filter(p => !kept1.includes(p));
  const emptyLanguage = !generating.has(g.startSymbol);

  steps.push({
    title: 'Phase 1: Remove Non-Generating (Unproductive) Symbols',
    titleCz: 'Fáze 1: Odstranění nenormovaných (negenerujících) neterminálů',
    description: `Generating non-terminals N_gen = ${fmtSet(genNts, '∅')}. Non-generating: ${fmtSet(nonGenerating, 'none')}.` +
      (emptyLanguage ? ` The start symbol '${g.startSymbol}' is not generating, hence L(G) = ∅.` : ''),
    descriptionCz: `Normované neterminály N_gen = ${fmtSet(genNts, '∅')}. Nenormované: ${fmtSet(nonGenerating, 'žádné')}.` +
      (emptyLanguage ? ` Počáteční symbol '${g.startSymbol}' je nenormovaný, proto L(G) = ∅.` : ''),
    mathExplanation: 'N_gen is the least fixed point of N_gen = { A | A -> α ∈ P, α ∈ (N_gen ∪ T)* }. Every rule that contains a non-generating symbol is useless.',
    mathExplanationCz: 'N_gen je nejmenší pevný bod N_gen = { A | A -> α ∈ P, α ∈ (N_gen ∪ T)* }. Každé pravidlo obsahující nenormovaný neterminál je zbytečné.',
    removedRules: removed1.map(formatProduction)
  });

  const g1 = buildGrammar(g, kept1);

  // Phase 2: reachable symbols
  const reachable = computeReachable(g1);
  const kept2 = g1.productions.filter(p => reachable.has(p.lhs));
  const removed2 = g1.productions.filter(p => !reachable.has(p.lhs));
  const unreachable = [...g1.nonTerminals, ...g1.terminals].filter(s => !reachable.has(s));

  steps.push({
    title: 'Phase 2: Remove Unreachable Symbols',
    titleCz: 'Fáze 2: Odstranění nedosažitelných symbolů',
    description: `Symbols reachable from '${g.startSymbol}': ${fmtSet(reachable, '∅')}. Unreachable: ${fmtSet(unreachable, 'none')}.`,
    descriptionCz: `Symboly dosažitelné z '${g.startSymbol}': ${fmtSet(reachable, '∅')}. Nedosažitelné: ${fmtSet(unreachable, 'žádné')}.`,
    mathExplanation: 'V_reach is the least set with S ∈ V_reach and A ∈ V_reach, A -> α X β ∈ P ⇒ X ∈ V_reach.',
    mathExplanationCz: 'V_reach je nejmenší množina, pro kterou S ∈ V_reach a A ∈ V_reach, A -> α X β ∈ P ⇒ X ∈ V_reach.',
    removedRules: removed2.map(formatProduction)
  });

  const result = buildGrammar(g1, kept2);
  return { transformedGrammar: result, steps: withSnapshot(steps, result) };
}

// ---------------------------------------------------------------------------
// 2. ε-rule elimination
// ---------------------------------------------------------------------------

export function removeEpsilonRules(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const epsRules = g.productions.filter(p => p.rhs.length === 0);

  if (!hasForbiddenEpsilonRules(g)) {
    const result = normalizeGrammar(cloneGrammar(g));
    return {
      transformedGrammar: result,
      steps: withSnapshot([{
        title: 'Grammar Is Already ε-Free',
        titleCz: 'Gramatika je již bez ε-pravidel',
        description: epsRules.length === 0
          ? 'The grammar has no ε-rules.'
          : `The only ε-rule is ${g.startSymbol} -> ε and '${g.startSymbol}' occurs on no right-hand side, which an ε-free grammar allows.`,
        descriptionCz: epsRules.length === 0
          ? 'Gramatika neobsahuje žádná ε-pravidla.'
          : `Jediné ε-pravidlo je ${g.startSymbol} -> ε a '${g.startSymbol}' se nevyskytuje na žádné pravé straně, což gramatika bez ε-pravidel připouští.`
      }], result)
    };
  }

  const nullable = computeNullable(g);
  steps.push({
    title: 'Identify Nullable Non-Terminals',
    titleCz: 'Výpočet množiny N_ε (neterminály generující ε)',
    description: `N_ε = ${fmtSet(nullable, '∅')}.`,
    descriptionCz: `N_ε = ${fmtSet(nullable, '∅')}.`,
    mathExplanation: 'N_ε is the least fixed point of N_ε = { A | A -> α ∈ P, α ∈ N_ε* }, i.e. the non-terminals with A ⇒* ε.',
    mathExplanationCz: 'N_ε je nejmenší pevný bod N_ε = { A | A -> α ∈ P, α ∈ N_ε* }, tj. neterminály, pro které A ⇒* ε.'
  });

  const originalKeys = new Set(g.productions.map(p => `${p.lhs}\u0001${altKey(p.rhs)}`));
  let rules: { lhs: string; rhs: Alt }[] = [];
  for (const p of g.productions) {
    if (p.rhs.length === 0) continue;
    const nullableIdx = p.rhs.map((s, i) => (nullable.has(s) ? i : -1)).filter(i => i >= 0);
    for (let mask = 0; mask < 1 << nullableIdx.length; mask++) {
      const drop = new Set(nullableIdx.filter((_, bit) => (mask & (1 << bit)) !== 0));
      const rhs = p.rhs.filter((_, i) => !drop.has(i));
      if (rhs.length > 0) rules.push({ lhs: p.lhs, rhs });
    }
  }

  // Non-terminals that derived only ε have lost all their rules: occurrences of them are useless.
  const onlyEps: string[] = [];
  for (;;) {
    const lhsSet = new Set(rules.map(r => r.lhs));
    const dead = [...nullable].filter(nt => !lhsSet.has(nt) && !onlyEps.includes(nt) && rules.some(r => r.rhs.includes(nt)));
    if (dead.length === 0) break;
    onlyEps.push(...dead);
    rules = rules.filter(r => !r.rhs.some(s => dead.includes(s)));
  }

  steps.push({
    title: 'Replace Rules by Their Nullable Variants',
    titleCz: 'Náhrada pravidel variantami s vypuštěnými symboly z N_ε',
    description: 'Every rule A -> X1 … Xn is replaced by all variants obtained by omitting any subset of nullable occurrences Xi ∈ N_ε; empty variants and the ε-rules are dropped.',
    descriptionCz: 'Každé pravidlo A -> X1 … Xn je nahrazeno pravidly vzniklými všemi možnými způsoby vypuštění symbolů z N_ε na jeho pravé straně; vznikající pravidla tvaru A -> ε a původní ε-pravidla se do gramatiky nezařadí.',
    removedRules: epsRules.map(formatProduction),
    addedRules: rules.filter(r => !originalKeys.has(`${r.lhs}\u0001${altKey(r.rhs)}`)).map(r => fmtRule(r.lhs, r.rhs))
  });

  if (onlyEps.length > 0) {
    steps.push({
      title: 'Remove Non-Terminals That Derived Only ε',
      titleCz: 'Odstranění neterminálů, které generovaly pouze ε',
      description: `${fmtSet(onlyEps, '')} generated only the empty word, so no rule remains for them and the variants that still contain them are useless.`,
      descriptionCz: `${fmtSet(onlyEps, '')} generovaly pouze prázdné slovo, nezůstalo pro ně žádné pravidlo a varianty, které je stále obsahují, jsou zbytečné.`
    });
  }

  let start = g.startSymbol;
  if (nullable.has(g.startSymbol)) {
    if (!rules.some(r => r.rhs.includes(g.startSymbol))) {
      rules.unshift({ lhs: start, rhs: [] });
      steps.push({
        title: 'Keep ε in the Language',
        titleCz: 'Zachování ε v jazyce',
        description: `ε ∈ L(G) and '${start}' occurs on no right-hand side, so the rule ${start} -> ε is kept.`,
        descriptionCz: `ε ∈ L(G) a '${start}' se nevyskytuje na žádné pravé straně, proto pravidlo ${start} -> ε zůstává.`
      });
    } else {
      start = freshName(`${g.startSymbol}'`, s => g.nonTerminals.has(s) || g.terminals.has(s));
      rules.unshift({ lhs: start, rhs: [g.startSymbol] }, { lhs: start, rhs: [] });
      steps.push({
        title: 'New Start Symbol Preserving ε',
        titleCz: 'Nový počáteční symbol zachovávající ε',
        description: `ε ∈ L(G) and '${g.startSymbol}' occurs on a right-hand side, so a new start symbol is added: ${start} -> ${g.startSymbol} | ε.`,
        descriptionCz: `ε ∈ L(G) a '${g.startSymbol}' se vyskytuje na pravé straně, proto je přidán nový počáteční symbol: ${start} -> ${g.startSymbol} | ε.`,
        addedRules: [fmtRule(start, [g.startSymbol]), fmtRule(start, [])]
      });
    }
  }

  const result = buildGrammar(g, rules, start);
  return { transformedGrammar: result, steps: withSnapshot(steps, result) };
}

// ---------------------------------------------------------------------------
// 3. Unit-rule elimination
// ---------------------------------------------------------------------------

export function removeUnitRules(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const isUnit = (p: Production) => p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0]);
  const unitRules = g.productions.filter(isUnit);

  if (unitRules.length === 0) {
    const result = normalizeGrammar(cloneGrammar(g));
    return {
      transformedGrammar: result,
      steps: withSnapshot([{
        title: 'No Unit Rules',
        titleCz: 'Žádná jednoduchá pravidla',
        description: 'The grammar has no rules of the form A -> B.',
        descriptionCz: 'Gramatika neobsahuje žádná pravidla tvaru A -> B.'
      }], result)
    };
  }

  // N_A = { B | A ⇒* B using unit rules only }, reflexive and transitive
  const order = new RuleTable(g).order;
  for (const nt of g.nonTerminals) if (!order.includes(nt)) order.push(nt);
  const unitSets = new Map<string, string[]>();
  for (const A of order) {
    const set = [A];
    for (let i = 0; i < set.length; i++) {
      for (const p of unitRules) {
        if (p.lhs === set[i] && !set.includes(p.rhs[0])) set.push(p.rhs[0]);
      }
    }
    unitSets.set(A, set);
  }

  steps.push({
    title: 'Compute the Sets N_A of Unit Derivations',
    titleCz: 'Výpočet množin N_A jednoduchých derivací',
    description: order
      .filter(A => unitSets.get(A)!.length > 1)
      .map(A => `N_${A} = ${fmtSet(unitSets.get(A)!, '')}`)
      .join('; ') + '.',
    descriptionCz: order
      .filter(A => unitSets.get(A)!.length > 1)
      .map(A => `N_${A} = ${fmtSet(unitSets.get(A)!, '')}`)
      .join('; ') + '.',
    mathExplanation: 'N_A = { B | A ⇒* B } using unit rules only (A ∈ N_A). For every B ∈ N_A and every non-unit rule B -> α we add A -> α.',
    mathExplanationCz: 'N_A = { B | A ⇒* B } pouze pomocí jednoduchých pravidel (A ∈ N_A). Pro každé B ∈ N_A a každé nejednoduché pravidlo B -> α přidáme A -> α.'
  });

  const originalKeys = new Set(g.productions.map(p => `${p.lhs}\u0001${altKey(p.rhs)}`));
  const rules: { lhs: string; rhs: Alt }[] = [];
  for (const A of order) {
    for (const B of unitSets.get(A)!) {
      for (const p of g.productions) {
        if (p.lhs === B && !isUnit(p)) rules.push({ lhs: A, rhs: [...p.rhs] });
      }
    }
  }

  steps.push({
    title: 'Replace Unit Chains by Non-Unit Rules',
    titleCz: 'Náhrada řetězců jednoduchých pravidel nejednoduchými pravidly',
    description: `Removed all ${unitRules.length} rule(s) of the form A -> B.`,
    descriptionCz: `Odstraněna jednoduchá pravidla tvaru A -> B (počet: ${unitRules.length}).`,
    removedRules: unitRules.map(formatProduction),
    addedRules: rules.filter(r => !originalKeys.has(`${r.lhs}\u0001${altKey(r.rhs)}`)).map(r => fmtRule(r.lhs, r.rhs))
  });

  const result = buildGrammar(g, rules);
  return { transformedGrammar: result, steps: withSnapshot(steps, result) };
}

// ---------------------------------------------------------------------------
// 4. Left recursion (Paull's algorithm)
// ---------------------------------------------------------------------------

function removeNonGeneratingOnly(g: Grammar): { grammar: Grammar; removed: string[]; removedRules: Production[] } {
  const generating = computeEndable(g);
  const removed = [...g.nonTerminals].filter(nt => !generating.has(nt));
  if (removed.length === 0) return { grammar: g, removed, removedRules: [] };
  const kept = g.productions.filter(p => generating.has(p.lhs) && p.rhs.every(s => generating.has(s)));
  return {
    grammar: buildGrammar(g, kept),
    removed,
    removedRules: g.productions.filter(p => !kept.includes(p))
  };
}

/**
 * Removes all (immediate and indirect) left recursion. Paull's algorithm
 * requires a grammar without ε-rules and cycles A ⇒+ A, so these are removed
 * first when present (each preprocessing step is logged).
 */
export function removeLeftRecursion(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const lr = computeLeftRecursion(g, computeNullable(g));

  if (lr.immediate.size === 0 && lr.indirect.size === 0) {
    const result = normalizeGrammar(cloneGrammar(g));
    return {
      transformedGrammar: result,
      steps: withSnapshot([{
        title: 'No Left Recursion',
        titleCz: 'Žádná levá rekurze',
        description: 'No non-terminal A satisfies A ⇒+ A α; the grammar is unchanged.',
        descriptionCz: 'Žádný neterminál nesplňuje A ⇒+ A α; gramatika zůstává beze změny.'
      }], result)
    };
  }

  let current = normalizeGrammar(cloneGrammar(g));

  // Preprocessing 1: non-generating symbols (A -> A α only) would otherwise turn into A -> A'.
  const ng = removeNonGeneratingOnly(current);
  if (ng.removed.length > 0) {
    current = ng.grammar;
    steps.push({
      title: 'Preprocessing: Remove Non-Generating Symbols',
      titleCz: 'Příprava: odstranění nenormovaných neterminálů',
      description: `${fmtSet(ng.removed, '')} derive no terminal word; their rules are useless and are removed first.`,
      descriptionCz: `${fmtSet(ng.removed, '')} jsou nenormované (negenerují žádné terminální slovo); jejich pravidla jsou zbytečná a odstraní se nejprve.`,
      removedRules: ng.removedRules.map(formatProduction),
      intermediateGrammar: cloneGrammar(current)
    });
  }

  // Preprocessing 2: ε-rules hide left recursion (A -> B A a, B -> ε)
  if (hasForbiddenEpsilonRules(current)) {
    const eps = removeEpsilonRules(current);
    current = eps.transformedGrammar;
    steps.push({
      title: 'Preprocessing: Eliminate ε-Rules',
      titleCz: 'Příprava: odstranění ε-pravidel',
      description: 'Paull\'s algorithm requires an ε-free grammar, otherwise left recursion can hide behind a nullable prefix (A -> B A α with B ⇒* ε).',
      descriptionCz: 'Paullův algoritmus vyžaduje gramatiku bez ε-pravidel, jinak se levá rekurze může skrývat za prefixem, z něhož lze odvodit ε (A -> B A α, kde B ⇒* ε).',
      removedRules: eps.steps.flatMap(s => s.removedRules || []),
      addedRules: eps.steps.flatMap(s => s.addedRules || []),
      intermediateGrammar: cloneGrammar(current)
    });
  }

  // Preprocessing 3: cycles A ⇒+ A (in an ε-free grammar they consist of unit rules)
  if (computeCyclic(current, computeNullable(current)).size > 0) {
    const unit = removeUnitRules(current);
    current = unit.transformedGrammar;
    steps.push({
      title: 'Preprocessing: Eliminate Unit Rules (Cycles)',
      titleCz: 'Příprava: odstranění jednoduchých pravidel (cyklů)',
      description: 'The grammar contains a cycle A ⇒+ A, which Paull\'s algorithm cannot handle; unit rules are eliminated.',
      descriptionCz: 'Gramatika obsahuje cyklus A ⇒+ A, se kterým si Paullův algoritmus neporadí; odstraní se jednoduchá pravidla.',
      removedRules: unit.steps.flatMap(s => s.removedRules || []),
      addedRules: unit.steps.flatMap(s => s.addedRules || []),
      intermediateGrammar: cloneGrammar(current)
    });
  }

  const table = new RuleTable(current);
  const order = [...table.order];

  steps.push({
    title: 'Order the Non-Terminals',
    titleCz: 'Uspořádání neterminálů',
    description: `Paull's algorithm processes the non-terminals in a fixed order A1, …, An = ${order.join(', ')}.`,
    descriptionCz: `Paullův algoritmus zpracovává neterminály v pevném pořadí A1, …, An = ${order.join(', ')}.`,
    mathExplanation: 'Invariant: after processing Ai, every rule Ai -> Aj γ satisfies j > i. Then no left recursion can remain.',
    mathExplanationCz: 'Invariant: po zpracování Ai splňuje každé pravidlo Ai -> Aj γ podmínku j > i. Pak nemůže zůstat žádná levá rekurze.'
  });

  for (let i = 0; i < order.length; i++) {
    const Ai = order[i];

    for (let j = 0; j < i; j++) {
      const Aj = order[j];
      const aiRules = table.get(Ai);
      if (!aiRules.some(r => r[0] === Aj)) continue;

      const removed: string[] = [];
      const added: string[] = [];
      const next: Alt[] = [];
      for (const r of aiRules) {
        if (r[0] !== Aj) {
          next.push(r);
          continue;
        }
        removed.push(fmtRule(Ai, r));
        for (const delta of table.get(Aj)) {
          const nr = [...delta, ...r.slice(1)];
          next.push(nr);
          added.push(fmtRule(Ai, nr));
        }
      }
      table.set(Ai, next);
      steps.push({
        title: `Substitute ${Aj} into the Leading Position of ${Ai}`,
        titleCz: `Dosazení ${Aj} na první pozici pravidel ${Ai}`,
        description: `Rules ${Ai} -> ${Aj} γ are replaced by ${Ai} -> δ γ for every rule ${Aj} -> δ.`,
        descriptionCz: `Pravidla ${Ai} -> ${Aj} γ jsou nahrazena pravidly ${Ai} -> δ γ pro každé pravidlo ${Aj} -> δ.`,
        removedRules: removed,
        addedRules: added
      });
      if (table.size() > MAX_PRODUCTIONS) {
        return abortTooLarge(steps, current);
      }
    }

    const aiRules = table.get(Ai);
    const selfLoops = aiRules.filter(r => r.length === 1 && r[0] === Ai);
    const alphas = aiRules.filter(r => r[0] === Ai && r.length > 1).map(r => r.slice(1));
    const betas = aiRules.filter(r => r[0] !== Ai);

    if (alphas.length === 0) {
      if (selfLoops.length > 0) {
        table.set(Ai, betas);
        steps.push({
          title: `Remove the Rule ${Ai} -> ${Ai}`,
          titleCz: `Odstranění pravidla ${Ai} -> ${Ai}`,
          description: `The rule ${Ai} -> ${Ai} does not change the language and is removed.`,
          descriptionCz: `Pravidlo ${Ai} -> ${Ai} nemění jazyk a je odstraněno.`,
          removedRules: [fmtRule(Ai, [Ai])]
        });
      }
      continue;
    }

    if (betas.length === 0) {
      table.set(Ai, []);
      steps.push({
        title: `${Ai} Generates No Word`,
        titleCz: `${Ai} negeneruje žádné slovo`,
        description: `All rules of ${Ai} begin with ${Ai}, so ${Ai} is not generating and its rules are removed.`,
        descriptionCz: `Všechna pravidla ${Ai} začínají ${Ai}, ${Ai} je tedy nenormovaný a jeho pravidla se odstraní.`,
        removedRules: aiRules.map(r => fmtRule(Ai, r))
      });
      continue;
    }

    const removed = aiRules.map(r => fmtRule(Ai, r));
    const newNt = table.addAfter(Ai, `${Ai}'`, []);
    table.set(Ai, betas.map(b => [...b, newNt]));
    table.set(newNt, [...alphas.map(a => [...a, newNt]), []]);

    steps.push({
      title: `Eliminate Immediate Left Recursion of ${Ai}`,
      titleCz: `Odstranění přímé levé rekurze ${Ai}`,
      description: `${Ai} -> ${alphas.map(a => `${Ai} ${a.join(' ')}`).join(' | ')} | ${betas.map(formatRhs).join(' | ')} is replaced using the new non-terminal ${newNt}.`,
      descriptionCz: `${Ai} -> ${alphas.map(a => `${Ai} ${a.join(' ')}`).join(' | ')} | ${betas.map(formatRhs).join(' | ')} je nahrazeno pomocí nového neterminálu ${newNt}.`,
      mathExplanation: `A -> A α1 | … | A αm | β1 | … | βn  ⟹  A -> β1 A' | … | βn A',  A' -> α1 A' | … | αm A' | ε. Both generate β(α)*.`,
      mathExplanationCz: `A -> A α1 | … | A αm | β1 | … | βn  ⟹  A -> β1 A' | … | βn A',  A' -> α1 A' | … | αm A' | ε. Obě generují β(α)*.`,
      removedRules: removed,
      addedRules: [...table.get(Ai).map(r => fmtRule(Ai, r)), ...table.get(newNt).map(r => fmtRule(newNt, r))]
    });
  }

  const result = table.toGrammar(current.startSymbol);
  return { transformedGrammar: result, steps: withSnapshot(steps, result) };
}

function abortTooLarge(steps: TransformationStep[], original: Grammar): TransformationResult {
  steps.push({
    title: 'Stopped: Grammar Grows Too Large',
    titleCz: 'Zastaveno: gramatika příliš roste',
    description: `The construction exceeded ${MAX_PRODUCTIONS} rules and was stopped; the grammar before the construction is kept.`,
    descriptionCz: `Konstrukce překročila ${MAX_PRODUCTIONS} pravidel a byla zastavena; ponechána je gramatika před konstrukcí.`
  });
  return { transformedGrammar: normalizeGrammar(cloneGrammar(original)), steps };
}

// ---------------------------------------------------------------------------
// 5. Left factorization
// ---------------------------------------------------------------------------

export function leftFactorGrammar(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const table = new RuleTable(normalizeGrammar(cloneGrammar(g)));

  let changed = true;
  let iteration = 1;
  while (changed && iteration < 500) {
    changed = false;
    for (const A of [...table.order]) {
      const alts = table.get(A);
      let best: string[] = [];
      for (let i = 0; i < alts.length; i++) {
        for (let j = i + 1; j < alts.length; j++) {
          const cp = commonPrefix(alts[i], alts[j]);
          if (cp.length > best.length) best = cp;
        }
      }
      if (best.length === 0) continue;

      const prefix = best;
      const matching = alts.filter(a => hasPrefix(a, prefix));
      const newNt = table.addAfter(A, `${A}'`, matching.map(a => a.slice(prefix.length)));
      const firstIdx = alts.findIndex(a => hasPrefix(a, prefix));
      table.set(A, alts.flatMap((a, idx) => (idx === firstIdx ? [[...prefix, newNt]] : hasPrefix(a, prefix) ? [] : [a])));

      steps.push({
        title: `Factor Non-Terminal '${A}' (Iteration ${iteration})`,
        titleCz: `Faktorizace neterminálu '${A}' (iterace ${iteration})`,
        description: `Longest common prefix '${prefix.join(' ')}' of ${matching.length} alternatives of '${A}' is factored out into '${newNt}'.`,
        descriptionCz: `Nejdelší společný prefix '${prefix.join(' ')}' ${matching.length} alternativ neterminálu '${A}' je vytknut do '${newNt}'.`,
        mathExplanation: 'A -> α β1 | … | α βn | γ  ⟹  A -> α A\' | γ,  A\' -> β1 | … | βn. The choice between the βi is postponed until α has been read.',
        mathExplanationCz: 'A -> α β1 | … | α βn | γ  ⟹  A -> α A\' | γ,  A\' -> β1 | … | βn. Volba mezi βi se odloží až za přečtení α.',
        removedRules: matching.map(a => fmtRule(A, a)),
        addedRules: [fmtRule(A, [...prefix, newNt]), ...table.get(newNt).map(r => fmtRule(newNt, r))]
      });

      iteration++;
      changed = true;
      break;
    }
  }

  if (steps.length === 0) {
    steps.push({
      title: 'Nothing to Factor',
      titleCz: 'Není co faktorizovat',
      description: 'No two alternatives of the same non-terminal share a common prefix.',
      descriptionCz: 'Žádné dvě alternativy téhož neterminálu nemají společný prefix.'
    });
  }

  const result = table.toGrammar();
  return { transformedGrammar: result, steps: withSnapshot(steps, result) };
}

// ---------------------------------------------------------------------------
// 6. Chomsky Normal Form
// ---------------------------------------------------------------------------

const PUNCTUATION_NAMES: Record<string, string> = {
  '+': 'plus', '-': 'minus', '*': 'star', '/': 'slash', '(': 'lpar', ')': 'rpar',
  '[': 'lbrack', ']': 'rbrack', '{': 'lbrace', '}': 'rbrace', ',': 'comma', ';': 'semi',
  ':': 'colon', '=': 'eq', '<': 'lt', '>': 'gt', '.': 'dot', '!': 'excl', '?': 'quest',
  '&': 'amp', '|': 'bar', '^': 'caret', '%': 'percent', '#': 'hash', '@': 'at', '~': 'tilde'
};

/** Name of the stand-in non-terminal X_a -> a used by CNF for terminal a. */
function proxyBaseName(t: string): string {
  if (/^[\p{L}\p{N}_]+$/u.test(t)) return `X_${t}`;
  const mapped = [...t].map(ch => PUNCTUATION_NAMES[ch]);
  return mapped.every(Boolean) ? `X_${mapped.join('_')}` : 'X_sym';
}

export function convertToChomsky(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  let current = normalizeGrammar(cloneGrammar(g));

  // 1. START: the start symbol must not occur on a right-hand side
  if (occursOnRhs(current, current.startSymbol)) {
    const s0 = freshName(`${current.startSymbol}0`, s => current.nonTerminals.has(s) || current.terminals.has(s));
    const old = current.startSymbol;
    current = buildGrammar(current, [{ lhs: s0, rhs: [old] }, ...current.productions], s0);
    steps.push({
      title: 'CNF 1/6: New Start Symbol',
      titleCz: 'CNF 1/6: Nový počáteční symbol',
      description: `'${old}' occurs on a right-hand side, so the new start symbol ${s0} -> ${old} is added.`,
      descriptionCz: `'${old}' se vyskytuje na pravé straně, proto je přidán nový počáteční symbol ${s0} -> ${old}.`,
      addedRules: [fmtRule(s0, [old])],
      intermediateGrammar: cloneGrammar(current)
    });
  } else {
    steps.push({
      title: 'CNF 1/6: Start Symbol',
      titleCz: 'CNF 1/6: Počáteční symbol',
      description: `'${current.startSymbol}' occurs on no right-hand side; no new start symbol is needed.`,
      descriptionCz: `'${current.startSymbol}' se nevyskytuje na žádné pravé straně; nový počáteční symbol není potřeba.`
    });
  }

  // 2. DEL: ε-rules
  const eps = removeEpsilonRules(current);
  current = eps.transformedGrammar;
  steps.push({
    title: 'CNF 2/6: Eliminate ε-Rules',
    titleCz: 'CNF 2/6: Odstranění ε-pravidel',
    description: eps.steps.map(s => s.description).join(' '),
    descriptionCz: eps.steps.map(s => s.descriptionCz || s.description).join(' '),
    removedRules: eps.steps.flatMap(s => s.removedRules || []),
    addedRules: eps.steps.flatMap(s => s.addedRules || []),
    intermediateGrammar: cloneGrammar(current)
  });

  // 3. UNIT: unit rules
  const unit = removeUnitRules(current);
  current = unit.transformedGrammar;
  steps.push({
    title: 'CNF 3/6: Eliminate Unit Rules',
    titleCz: 'CNF 3/6: Odstranění jednoduchých pravidel',
    description: unit.steps.map(s => s.description).join(' '),
    descriptionCz: unit.steps.map(s => s.descriptionCz || s.description).join(' '),
    removedRules: unit.steps.flatMap(s => s.removedRules || []),
    addedRules: unit.steps.flatMap(s => s.addedRules || []),
    intermediateGrammar: cloneGrammar(current)
  });

  // 4. Useless symbols
  const red = reduceGrammar(current);
  current = red.transformedGrammar;
  steps.push({
    title: 'CNF 4/6: Remove Useless Symbols',
    titleCz: 'CNF 4/6: Odstranění zbytečných symbolů',
    description: red.steps.map(s => s.description).join(' '),
    descriptionCz: red.steps.map(s => s.descriptionCz || s.description).join(' '),
    removedRules: red.steps.flatMap(s => s.removedRules || []),
    intermediateGrammar: cloneGrammar(current)
  });

  // 5. TERM: terminals inside rules of length >= 2 get proxy non-terminals
  const table = new RuleTable(current);
  const proxies = new Map<string, string>();
  const termAdded: string[] = [];
  for (const nt of [...table.order]) {
    table.set(nt, table.get(nt).map(rhs => {
      if (rhs.length < 2) return rhs;
      return rhs.map(sym => {
        if (!current.terminals.has(sym)) return sym;
        if (!proxies.has(sym)) {
          const proxy = table.addAfter(table.order[table.order.length - 1], proxyBaseName(sym), [[sym]]);
          proxies.set(sym, proxy);
          termAdded.push(fmtRule(proxy, [sym]));
        }
        return proxies.get(sym)!;
      });
    }));
  }
  steps.push({
    title: 'CNF 5/6: Replace Terminals in Long Rules',
    titleCz: 'CNF 5/6: Náhrada terminálů v dlouhých pravidlech',
    description: proxies.size > 0
      ? `Each terminal a inside a rule of length ≥ 2 is replaced by a new non-terminal X_a with X_a -> a: ${[...proxies.entries()].map(([t, n]) => `${t} ↦ ${n}`).join(', ')}.`
      : 'No terminal occurs inside a rule of length ≥ 2.',
    descriptionCz: proxies.size > 0
      ? `Každý terminál a uvnitř pravidla délky ≥ 2 je nahrazen novým neterminálem X_a s pravidlem X_a -> a: ${[...proxies.entries()].map(([t, n]) => `${t} ↦ ${n}`).join(', ')}.`
      : 'Žádný terminál se nevyskytuje uvnitř pravidla délky ≥ 2.',
    addedRules: termAdded,
    intermediateGrammar: table.toGrammar(current.startSymbol)
  });

  // 6. BIN: split rules longer than 2 into chains A -> X1 C_1, C_1 -> X2 C_2, …
  // A chain non-terminal stands for one suffix X_i … X_n and is shared by all rules with that suffix.
  const binAdded: string[] = [];
  const binRemoved: string[] = [];
  const suffixNt = new Map<string, string>();
  let chainCounter = 1;
  const chainFor = (suffix: Alt): string => {
    const key = altKey(suffix);
    let c = suffixNt.get(key);
    if (c === undefined) {
      c = table.addAfter(table.order[table.order.length - 1], `C_${chainCounter++}`, []);
      suffixNt.set(key, c);
      const r = suffix.length === 2 ? suffix : [suffix[0], chainFor(suffix.slice(1))];
      table.set(c, [r]);
      binAdded.push(fmtRule(c, r));
    }
    return c;
  };
  for (const nt of [...table.order]) {
    const next: Alt[] = [];
    for (const rhs of table.get(nt)) {
      if (rhs.length <= 2) {
        next.push(rhs);
        continue;
      }
      binRemoved.push(fmtRule(nt, rhs));
      const r = [rhs[0], chainFor(rhs.slice(1))];
      next.push(r);
      binAdded.push(fmtRule(nt, r));
    }
    table.set(nt, next);
  }
  current = table.toGrammar(current.startSymbol);
  steps.push({
    title: 'CNF 6/6: Binarize Rules of Length ≥ 3',
    titleCz: 'CNF 6/6: Rozklad pravidel délky ≥ 3 na dvojice',
    description: binRemoved.length > 0
      ? 'A -> X1 X2 … Xn (n ≥ 3) becomes A -> X1 C_1, C_1 -> X2 C_2, …, C_(n-2) -> X(n-1) Xn; rules with the same suffix share the chain.'
      : 'All rules already have length ≤ 2.',
    descriptionCz: binRemoved.length > 0
      ? 'A -> X1 X2 … Xn (n ≥ 3) se rozloží na A -> X1 C_1, C_1 -> X2 C_2, …, C_(n-2) -> X(n-1) Xn; pravidla se stejnou příponou sdílejí řetězec.'
      : 'Všechna pravidla již mají délku nejvýše 2.',
    mathExplanation: 'Result: every rule has the form A -> B C or A -> a, plus S -> ε when ε ∈ L(G) (S then occurs on no right-hand side).',
    mathExplanationCz: 'Výsledek: každé pravidlo má tvar A -> B C nebo A -> a, případně S -> ε, je-li ε ∈ L(G) (S se pak nevyskytuje na žádné pravé straně).',
    removedRules: binRemoved,
    addedRules: binAdded
  });

  return { transformedGrammar: current, steps: withSnapshot(steps, current) };
}

// ---------------------------------------------------------------------------
// 7. Greibach Normal Form
// ---------------------------------------------------------------------------

/**
 * GNF via CNF: order A1..An, make every rule Ai -> Aj γ satisfy j > i
 * (substitution + ε-free elimination of immediate left recursion with new
 * non-terminals Zi), then back-substitute so that every rule starts with a
 * terminal: A -> a α with α ∈ N*.
 */
export function convertToGreibach(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const cnf = convertToChomsky(g);
  let current = cnf.transformedGrammar;

  steps.push({
    title: 'GNF 1/6: Convert to Chomsky Normal Form',
    titleCz: 'GNF 1/6: Převod do Chomského normální formy',
    description: 'GNF is built from an equivalent CNF grammar (ε-free, without unit rules and useless symbols).',
    descriptionCz: 'GNF se konstruuje z ekvivalentní gramatiky v CNF (bez ε-pravidel, jednoduchých pravidel a zbytečných symbolů).',
    intermediateGrammar: cloneGrammar(current)
  });

  const table = new RuleTable(current);
  const order = table.order.filter(nt => table.get(nt).length > 0);
  const index = new Map(order.map((nt, i) => [nt, i]));
  const zOf = new Map<string, string>();

  steps.push({
    title: 'GNF 2/6: Order the Non-Terminals',
    titleCz: 'GNF 2/6: Uspořádání neterminálů',
    description: `A1, …, An = ${order.join(', ')}.`,
    descriptionCz: `A1, …, An = ${order.join(', ')}.`,
    mathExplanation: 'Goal of the forward phase: every rule Ai -> Aj γ satisfies j > i.',
    mathExplanationCz: 'Cíl dopředné fáze: každé pravidlo Ai -> Aj γ splňuje j > i.'
  });

  const substituteLeading = (nt: string, leading: string): number => {
    let count = 0;
    const next: Alt[] = [];
    for (const r of table.get(nt)) {
      if (r[0] !== leading) {
        next.push(r);
        continue;
      }
      count++;
      for (const delta of table.get(leading)) next.push([...delta, ...r.slice(1)]);
    }
    table.set(nt, next);
    return count;
  };

  // Forward phase
  for (let i = 0; i < order.length; i++) {
    const Ai = order[i];
    const substituted: string[] = [];
    for (let j = 0; j < i; j++) {
      if (substituteLeading(Ai, order[j]) > 0) substituted.push(order[j]);
      if (table.size() > MAX_PRODUCTIONS) return abortTooLarge(steps, g);
    }

    const rules = table.get(Ai);
    const alphas = rules.filter(r => r[0] === Ai && r.length > 1).map(r => r.slice(1));
    const betas = rules.filter(r => r[0] !== Ai);
    let zNote = '';
    if (alphas.length > 0) {
      const z = table.addAfter(table.order[table.order.length - 1], `Z_${Ai}`, []);
      zOf.set(Ai, z);
      table.set(Ai, [...betas, ...betas.map(b => [...b, z])]);
      table.set(z, [...alphas, ...alphas.map(a => [...a, z])]);
      zNote = ` Left recursion of ${Ai} removed without ε: ${Ai} -> β | β ${z}, ${z} -> α | α ${z}.`;
    }
    if (substituted.length > 0 || zNote) {
      steps.push({
        title: `GNF 3.${i + 1}: Process ${Ai}`,
        titleCz: `GNF 3.${i + 1}: Zpracování ${Ai}`,
        description: (substituted.length > 0 ? `Substituted ${substituted.join(', ')} into the leading position of ${Ai}.` : '') + zNote,
        descriptionCz: (substituted.length > 0 ? `Dosazeno ${substituted.join(', ')} na první pozici pravidel ${Ai}.` : '') +
          (zNote ? ` Levá rekurze ${Ai} odstraněna bez ε: ${Ai} -> β | β ${zOf.get(Ai)}, ${zOf.get(Ai)} -> α | α ${zOf.get(Ai)}.` : ''),
        addedRules: [
          ...table.get(Ai).map(r => fmtRule(Ai, r)),
          ...(zOf.has(Ai) ? table.get(zOf.get(Ai)!).map(r => fmtRule(zOf.get(Ai)!, r)) : [])
        ]
      });
    }
    if (table.size() > MAX_PRODUCTIONS) return abortTooLarge(steps, g);
  }

  // Backward phase: An's rules start with terminals; substitute downwards
  for (let i = order.length - 2; i >= 0; i--) {
    const Ai = order[i];
    for (;;) {
      const leading = table.get(Ai).map(r => r[0]).find(s => index.has(s) && index.get(s)! > i);
      if (leading === undefined) break;
      substituteLeading(Ai, leading);
      if (table.size() > MAX_PRODUCTIONS) return abortTooLarge(steps, g);
    }
  }
  steps.push({
    title: 'GNF 4/6: Back-Substitution',
    titleCz: 'GNF 4/6: Zpětné dosazení',
    description: `The rules of ${order[order.length - 1] ?? 'An'} already start with a terminal. For i = n-1, …, 1 every leading Aj (j > i) is replaced by its rules, so all rules of A1 … An start with a terminal.`,
    descriptionCz: `Pravidla ${order[order.length - 1] ?? 'An'} již začínají terminálem. Pro i = n-1, …, 1 se každé úvodní Aj (j > i) nahradí jeho pravidly, takže všechna pravidla A1 … An začínají terminálem.`,
    intermediateGrammar: table.toGrammar(current.startSymbol)
  });

  // Z-rules start with some Ak (or a terminal): substitute
  for (const z of zOf.values()) {
    for (;;) {
      const leading = table.get(z).map(r => r[0]).find(s => index.has(s));
      if (leading === undefined) break;
      substituteLeading(z, leading);
      if (table.size() > MAX_PRODUCTIONS) return abortTooLarge(steps, g);
    }
  }
  if (zOf.size > 0) {
    steps.push({
      title: 'GNF 5/6: Substitute into the New Non-Terminals',
      titleCz: 'GNF 5/6: Dosazení do nových neterminálů',
      description: `The leading non-terminals of ${[...zOf.values()].join(', ')} are replaced by their rules, which now start with terminals.`,
      descriptionCz: `Úvodní neterminály v pravidlech ${[...zOf.values()].join(', ')} jsou nahrazeny jejich pravidly, která již začínají terminálem.`
    });
  }

  // Terminals after the first position (cannot occur for CNF input, kept for robustness)
  const proxies = new Map<string, string>();
  for (const nt of [...table.order]) {
    table.set(nt, table.get(nt).map(rhs => rhs.map((sym, pos) => {
      if (pos === 0 || !current.terminals.has(sym)) return sym;
      if (!proxies.has(sym)) {
        proxies.set(sym, table.addAfter(table.order[table.order.length - 1], proxyBaseName(sym), [[sym]]));
      }
      return proxies.get(sym)!;
    })));
  }

  current = table.toGrammar(current.startSymbol);
  const red = reduceGrammar(current);
  current = red.transformedGrammar;
  steps.push({
    title: 'GNF 6/6: Remove Unreachable Symbols',
    titleCz: 'GNF 6/6: Odstranění nedosažitelných symbolů',
    description: 'Non-terminals that are no longer referenced (e.g. CNF stand-ins X_a) are removed.',
    descriptionCz: 'Neterminály, na které již nic neodkazuje (např. zástupné X_a z CNF), se odstraní.',
    mathExplanation: 'Result: every rule has the form A -> a α with a ∈ T and α ∈ N*, plus S -> ε when ε ∈ L(G).',
    mathExplanationCz: 'Výsledek: každé pravidlo má tvar A -> a α, kde a ∈ T a α ∈ N*, případně S -> ε, je-li ε ∈ L(G).',
    removedRules: red.steps.flatMap(s => s.removedRules || [])
  });

  return { transformedGrammar: current, steps: withSnapshot(steps, current) };
}

// ---------------------------------------------------------------------------
// Direct per-symbol transformations
// ---------------------------------------------------------------------------

/**
 * Detect available transformations for a specific non-terminal symbol
 */
export function getAvailableTransformationsForSymbol(g: Grammar, nt: string): AvailableSymbolTransformation[] {
  if (!g.nonTerminals.has(nt)) return [];
  const available: AvailableSymbolTransformation[] = [];
  const ntProds = g.productions.filter(p => p.lhs === nt);

  // 1. Immediate Left Recursion
  const leftRec = ntProds.filter(p => p.rhs.length > 1 && p.rhs[0] === nt);
  const nonLeftRec = ntProds.filter(p => p.rhs.length === 0 || p.rhs[0] !== nt);
  if (leftRec.length > 0 && nonLeftRec.length > 0) {
    available.push({
      id: 'eliminateImmediateLeftRecursion',
      type: 'eliminateImmediateLeftRecursion',
      labelEn: `Eliminate Immediate Left Recursion (${nt} -> ${nt} α | β)`,
      labelCz: `Odstranit přímou levou rekurzi (${nt} -> ${nt} α | β)`,
      descriptionEn: `Replaces the left-recursive rules of '${nt}' by right-recursive rules of a new non-terminal '${nt}''.`,
      descriptionCz: `Nahradí levorekurzivní pravidla '${nt}' pravorekurzivními pravidly nového neterminálu '${nt}''.`
    });
  }

  // 2. Left Factorization (detect common prefix among alternatives)
  const prefixes = new Map<string, string[]>();
  for (let i = 0; i < ntProds.length; i++) {
    for (let j = i + 1; j < ntProds.length; j++) {
      const cp = commonPrefix(ntProds[i].rhs, ntProds[j].rhs);
      if (cp.length > 0) {
        const key = cp.join(' ');
        if (!prefixes.has(key)) prefixes.set(key, cp);
      }
    }
  }
  for (const [prefixKey, cp] of prefixes.entries()) {
    const matchCount = ntProds.filter(p => hasPrefix(p.rhs, cp)).length;
    if (matchCount >= 2) {
      available.push({
        id: `leftFactor:${prefixKey}`,
        type: 'leftFactor',
        labelEn: `Left Factorize prefix '${prefixKey}' (${matchCount} rules)`,
        labelCz: `Levá faktorizace prefixu '${prefixKey}' (počet pravidel: ${matchCount})`,
        descriptionEn: `Extracts common prefix '${prefixKey}' from ${matchCount} alternatives of '${nt}' into new non-terminal.`,
        descriptionCz: `Vytkne společný prefix '${prefixKey}' alternativ neterminálu '${nt}' (počet: ${matchCount}) a zavede nový neterminál.`,
        details: { prefix: cp }
      });
    }
  }

  // 3. Epsilon-Production Elimination (S -> ε with S absent from right-hand sides is already allowed)
  const epsProds = ntProds.filter(p => p.rhs.length === 0);
  if (epsProds.length > 0 && !(nt === g.startSymbol && !occursOnRhs(g, nt))) {
    available.push({
      id: 'eliminateEpsilon',
      type: 'eliminateEpsilon',
      labelEn: `Eliminate Epsilon Rule (${nt} -> ε)`,
      labelCz: `Odstranit ε-pravidlo (${nt} -> ε)`,
      descriptionEn: `Removes '${nt} -> ε' and adds variants omitting '${nt}' to the rules that reference it.`,
      descriptionCz: `Odstraní '${nt} -> ε' a k pravidlům, která na '${nt}' odkazují, přidá varianty bez '${nt}'.`
    });
  }

  // 4. Unit-Production Elimination
  const unitProds = ntProds.filter(p => p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0]));
  if (unitProds.length > 0) {
    const targets = [...new Set(unitProds.map(p => p.rhs[0]))].join(', ');
    available.push({
      id: 'eliminateUnit',
      type: 'eliminateUnit',
      labelEn: `Eliminate Unit Rules (${nt} -> ${targets})`,
      labelCz: `Odstranit jednoduchá pravidla (${nt} -> ${targets})`,
      descriptionEn: `Replaces unit rules of '${nt}' by the non-unit alternatives of ${targets}.`,
      descriptionCz: `Nahradí jednoduchá pravidla '${nt}' nejednoduchými alternativami ${targets}.`
    });
  }

  // 5. Expand Leading Non-Terminal in nt
  const leadingNts = new Set<string>();
  for (const p of ntProds) {
    const first = p.rhs[0];
    if (first !== undefined && g.nonTerminals.has(first) && first !== nt) leadingNts.add(first);
  }
  for (const leadingNt of leadingNts) {
    available.push({
      id: `expandLeadingNT:${leadingNt}`,
      type: 'expandLeadingNT',
      labelEn: `Eliminate the rules ${nt} -> ${leadingNt} … (substitute ${leadingNt} at the start)`,
      labelCz: `Eliminovat pravidla ${nt} -> ${leadingNt} … (dosadit za úvodní ${leadingNt})`,
      descriptionEn: `Substitutes the rules of '${leadingNt}' into the leading position of '${nt}' rules.`,
      descriptionCz: `Pravidla ${nt} -> ${leadingNt} β nahradí pravidly ${nt} -> γ β pro všechny pravé strany γ pravidel neterminálu '${leadingNt}'.`,
      details: { leadingNt }
    });
  }

  // 6. Substitute / Inline nt into Referencing Rules
  const isReferencedInOthers = g.productions.some(p => p.lhs !== nt && p.rhs.includes(nt));
  if (isReferencedInOthers && ntProds.length > 0) {
    available.push({
      id: 'substitute',
      type: 'substitute',
      labelEn: `Substitute / Inline '${nt}' into Referencing Rules`,
      labelCz: `Dosadit '${nt}' do pravidel, ve kterých se vyskytuje`,
      descriptionEn: `Replaces all occurrences of '${nt}' in other rules with its ${ntProds.length} alternatives.`,
      descriptionCz: `Nahradí každý výskyt '${nt}' v pravidlech ostatních neterminálů každou z jeho pravých stran (počet: ${ntProds.length}).`
    });
  }

  // 7. Remove Unproductive (Non-generating) Symbol; the start symbol is never removed
  if (nt !== g.startSymbol && !computeEndable(g).has(nt)) {
    available.push({
      id: 'removeUnproductive',
      type: 'removeUnproductive',
      labelEn: `Remove the non-generating non-terminal '${nt}'`,
      labelCz: `Odstranit nenormovaný neterminál '${nt}'`,
      descriptionEn: `Symbol '${nt}' cannot derive any terminal word. Removes '${nt}' and all rules containing it.`,
      descriptionCz: `Z neterminálu '${nt}' nelze odvodit žádný terminální řetězec. Odstraní '${nt}' a všechna pravidla, která jej obsahují.`
    });
  }

  // 8. Remove Unreachable Symbol
  if (nt !== g.startSymbol && !computeReachable(g).has(nt)) {
    available.push({
      id: 'removeUnreachable',
      type: 'removeUnreachable',
      labelEn: `Remove Unreachable Symbol '${nt}'`,
      labelCz: `Odstranit nedosažitelný symbol '${nt}'`,
      descriptionEn: `Symbol '${nt}' cannot be reached from start symbol '${g.startSymbol}'. Removes '${nt}' and its rules.`,
      descriptionCz: `Symbol '${nt}' není dosažitelný z počátečního symbolu '${g.startSymbol}'. Odstraní '${nt}' a jeho pravidla.`
    });
  }

  return available;
}

/**
 * Apply a chosen transformation for a specific non-terminal symbol
 */
export function applySymbolTransformation(g: Grammar, nt: string, transId: string): TransformationResult {
  if (transId === 'eliminateImmediateLeftRecursion') return eliminateImmediateLeftRecursionForSymbol(g, nt);
  if (transId.startsWith('leftFactor:')) {
    const prefixKey = transId.substring('leftFactor:'.length);
    return leftFactorSymbol(g, nt, prefixKey ? prefixKey.split(' ') : undefined);
  }
  if (transId === 'eliminateEpsilon') return eliminateEpsilonForSymbol(g, nt);
  if (transId === 'eliminateUnit') return eliminateUnitRulesForSymbol(g, nt);
  if (transId === 'substitute') return substituteSymbol(g, nt);
  if (transId.startsWith('expandLeadingNT:')) {
    return expandLeadingNonTerminalInSymbol(g, nt, transId.substring('expandLeadingNT:'.length));
  }
  if (transId === 'removeUnproductive') return removeUnproductiveSymbol(g, nt);
  if (transId === 'removeUnreachable') return removeUnreachableSymbol(g, nt);
  return { transformedGrammar: cloneGrammar(g), steps: [] };
}

function unchanged(g: Grammar): TransformationResult {
  return { transformedGrammar: cloneGrammar(g), steps: [] };
}

/**
 * 1. Eliminate immediate left recursion for a specific symbol
 */
export function eliminateImmediateLeftRecursionForSymbol(g: Grammar, nt: string): TransformationResult {
  const table = new RuleTable(g);
  const ntRules = table.get(nt);
  const alphas = ntRules.filter(r => r[0] === nt && r.length > 1).map(r => r.slice(1));
  const betas = ntRules.filter(r => r[0] !== nt);
  if (alphas.length === 0 || betas.length === 0) return unchanged(g);

  const freshNt = table.addAfter(nt, `${nt}'`, []);
  table.set(freshNt, [...alphas.map(a => [...a, freshNt]), []]);
  table.set(nt, betas.map(b => [...b, freshNt]));
  const result = table.toGrammar();

  const selfLoop = ntRules.some(r => r.length === 1 && r[0] === nt);
  return {
    transformedGrammar: result,
    steps: [{
      title: `Eliminate Immediate Left Recursion for ${nt}`,
      titleCz: `Odstranění přímé levé rekurze pro ${nt}`,
      description: `Left-recursive rules of '${nt}' replaced using the fresh non-terminal '${freshNt}'.` +
        (selfLoop ? ` The rule ${nt} -> ${nt} does not change the language and was dropped.` : ''),
      descriptionCz: `Levorekurzivní pravidla '${nt}' nahrazena pomocí nového neterminálu '${freshNt}'.` +
        (selfLoop ? ` Pravidlo ${nt} -> ${nt} nemění jazyk a bylo vypuštěno.` : ''),
      mathExplanation: `${nt} -> ${nt} α | β  ⟹  ${nt} -> β ${freshNt},  ${freshNt} -> α ${freshNt} | ε`,
      mathExplanationCz: `${nt} -> ${nt} α | β  ⟹  ${nt} -> β ${freshNt},  ${freshNt} -> α ${freshNt} | ε`,
      addedRules: [...table.get(nt).map(r => fmtRule(nt, r)), ...table.get(freshNt).map(r => fmtRule(freshNt, r))],
      removedRules: ntRules.map(r => fmtRule(nt, r)),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 2. Left factorize a specific symbol on target prefix (or best common prefix)
 */
export function leftFactorSymbol(g: Grammar, nt: string, targetPrefix?: string[]): TransformationResult {
  const table = new RuleTable(g);
  const alts = table.get(nt);

  let prefix: string[] = targetPrefix || [];
  if (prefix.length === 0) {
    for (let i = 0; i < alts.length; i++) {
      for (let j = i + 1; j < alts.length; j++) {
        const cp = commonPrefix(alts[i], alts[j]);
        if (cp.length > prefix.length) prefix = cp;
      }
    }
  }
  const matching = alts.filter(a => hasPrefix(a, prefix));
  if (prefix.length === 0 || matching.length < 2) return unchanged(g);

  const freshNt = table.addAfter(nt, `${nt}'`, matching.map(a => a.slice(prefix.length)));
  const firstIdx = alts.findIndex(a => hasPrefix(a, prefix));
  table.set(nt, alts.flatMap((a, idx) => (idx === firstIdx ? [[...prefix, freshNt]] : hasPrefix(a, prefix) ? [] : [a])));
  const result = table.toGrammar();

  const prefixStr = prefix.join(' ');
  return {
    transformedGrammar: result,
    steps: [{
      title: `Left Factorize ${nt} on prefix '${prefixStr}'`,
      titleCz: `Levá faktorizace ${nt} podle předpony '${prefixStr}'`,
      description: `Extracted common prefix '${prefixStr}' across ${matching.length} alternatives of '${nt}' into new non-terminal '${freshNt}'.`,
      descriptionCz: `Vytknuta společná předpona '${prefixStr}' z ${matching.length} alternativ '${nt}' do nového neterminálu '${freshNt}'.`,
      mathExplanation: `${nt} -> α β₁ | α β₂  ⟹  ${nt} -> α ${freshNt},  ${freshNt} -> β₁ | β₂`,
      mathExplanationCz: `${nt} -> α β₁ | α β₂  ⟹  ${nt} -> α ${freshNt},  ${freshNt} -> β₁ | β₂`,
      addedRules: [fmtRule(nt, [...prefix, freshNt]), ...table.get(freshNt).map(r => fmtRule(freshNt, r))],
      removedRules: matching.map(a => fmtRule(nt, a)),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 3. Eliminate the ε-rule of a specific symbol.
 * For each rule B -> … nt … all variants omitting occurrences of nt are added.
 * When a variant becomes empty, B -> ε is added (B can still derive ε), so the
 * language is preserved; such new ε-rules can be eliminated in further steps.
 */
export function eliminateEpsilonForSymbol(g: Grammar, nt: string): TransformationResult {
  const table = new RuleTable(g);
  if (!table.get(nt).some(r => r.length === 0)) return unchanged(g);

  const added: string[] = [];
  const newEpsFor: string[] = [];
  for (const lhs of [...table.order]) {
    const next: Alt[] = [];
    for (const rhs of table.get(lhs)) {
      if (lhs === nt && rhs.length === 0) continue; // the removed rule
      next.push(rhs);
      const idx = rhs.map((s, i) => (s === nt ? i : -1)).filter(i => i >= 0);
      for (let mask = 1; mask < 1 << idx.length; mask++) {
        const drop = new Set(idx.filter((_, bit) => (mask & (1 << bit)) !== 0));
        const variant = rhs.filter((_, i) => !drop.has(i));
        if (lhs === nt && (variant.length === 0 || (variant.length === 1 && variant[0] === nt))) {
          continue; // nt -> nt…nt: no new ε-rule for nt and no useless rule nt -> nt
        }
        if (variant.length === 0) {
          if (!newEpsFor.includes(lhs)) newEpsFor.push(lhs);
        }
        next.push(variant);
        added.push(fmtRule(lhs, variant));
      }
    }
    table.set(lhs, next);
  }

  let start = g.startSymbol;
  let startNote = '';
  let startNoteCz = '';
  if (nt === g.startSymbol) {
    start = table.fresh(`${g.startSymbol}'`);
    table.order.unshift(start);
    table.rules.set(start, [[g.startSymbol], []]);
    added.unshift(fmtRule(start, [g.startSymbol]), fmtRule(start, []));
    startNote = ` Since ε ∈ L(G) and '${nt}' occurs on a right-hand side, the new start symbol ${start} -> ${nt} | ε keeps ε in the language.`;
    startNoteCz = ` Protože ε ∈ L(G) a '${nt}' se vyskytuje na pravé straně, nový počáteční symbol ${start} -> ${nt} | ε zachová ε v jazyce.`;
  }

  const result = table.toGrammar(start);
  const epsNote = newEpsFor.length > 0
    ? ` ${newEpsFor.map(b => `${b} -> ε`).join(', ')} added, because ${newEpsFor.join(', ')} could derive ε through '${nt}'.`
    : '';
  const epsNoteCz = newEpsFor.length > 0
    ? ` Přidáno ${newEpsFor.map(b => `${b} -> ε`).join(', ')}, protože ${newEpsFor.join(', ')} mohly odvodit ε přes '${nt}'.`
    : '';

  return {
    transformedGrammar: result,
    steps: [{
      title: `Eliminate Epsilon Rule ${nt} -> ε`,
      titleCz: `Odstranění ε-pravidla ${nt} -> ε`,
      description: `Removed '${nt} -> ε' and added, for every rule containing '${nt}', the variants that omit some of its occurrences.${epsNote}${startNote}`,
      descriptionCz: `Odstraněno '${nt} -> ε' a ke každému pravidlu obsahujícímu '${nt}' přidány varianty, které některé jeho výskyty vynechávají.${epsNoteCz}${startNoteCz}`,
      mathExplanation: `For every rule B -> α ${nt} β add B -> α β (for all combinations of occurrences).`,
      mathExplanationCz: `Ke každému pravidlu B -> α ${nt} β přidáme B -> α β (pro všechny kombinace výskytů).`,
      removedRules: [fmtRule(nt, [])],
      addedRules: added,
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 4. Eliminate unit productions for a specific symbol
 */
export function eliminateUnitRulesForSymbol(g: Grammar, nt: string): TransformationResult {
  const table = new RuleTable(g);
  const isUnit = (r: Alt) => r.length === 1 && g.nonTerminals.has(r[0]);
  const unitRules = table.get(nt).filter(isUnit);
  if (unitRules.length === 0) return unchanged(g);

  // Non-terminals reachable from nt by unit rules
  const reach = [nt];
  for (let i = 0; i < reach.length; i++) {
    for (const r of table.get(reach[i])) {
      if (isUnit(r) && !reach.includes(r[0])) reach.push(r[0]);
    }
  }

  const next: Alt[] = [];
  for (const B of reach) {
    for (const r of table.get(B)) {
      if (!isUnit(r)) next.push(r);
    }
  }
  const before = table.get(nt).filter(r => !isUnit(r)).map(altKey);
  table.set(nt, next);
  const result = table.toGrammar();

  return {
    transformedGrammar: result,
    steps: [{
      title: `Eliminate Unit Productions for ${nt}`,
      titleCz: `Odstranění jednoduchých pravidel pro ${nt}`,
      description: `Replaced the unit rules ${unitRules.map(r => fmtRule(nt, r)).join(', ')} by the non-unit rules of ${fmtSet(reach.slice(1), '∅')}.`,
      descriptionCz: `Jednoduchá pravidla ${unitRules.map(r => fmtRule(nt, r)).join(', ')} nahrazena nejednoduchými pravidly ${fmtSet(reach.slice(1), '∅')}.`,
      mathExplanation: `${nt} ⇒* B by unit rules and B -> α (non-unit)  ⟹  ${nt} -> α`,
      mathExplanationCz: `${nt} ⇒* B jednoduchými pravidly a B -> α (nejednoduché)  ⟹  ${nt} -> α`,
      addedRules: table.get(nt).filter(r => !before.includes(altKey(r))).map(r => fmtRule(nt, r)),
      removedRules: unitRules.map(r => fmtRule(nt, r)),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 5. Substitute / Inline a specific symbol into referencing rules
 */
export function substituteSymbol(g: Grammar, nt: string): TransformationResult {
  const table = new RuleTable(g);
  const ntRules = table.get(nt);
  if (ntRules.length === 0) return unchanged(g);

  const removed: string[] = [];
  const added: string[] = [];
  for (const lhs of [...table.order]) {
    if (lhs === nt) continue;
    const next: Alt[] = [];
    for (const rhs of table.get(lhs)) {
      if (!rhs.includes(nt)) {
        next.push(rhs);
        continue;
      }
      removed.push(fmtRule(lhs, rhs));
      let expansions: Alt[] = [[]];
      for (const sym of rhs) {
        expansions = sym === nt
          ? expansions.flatMap(e => ntRules.map(rep => [...e, ...rep]))
          : expansions.map(e => [...e, sym]);
        if (expansions.length > MAX_PRODUCTIONS) return unchanged(g);
      }
      for (const e of expansions) {
        next.push(e);
        added.push(fmtRule(lhs, e));
      }
    }
    table.set(lhs, next);
  }
  if (removed.length === 0) return unchanged(g);
  const result = table.toGrammar();

  return {
    transformedGrammar: result,
    steps: [{
      title: `Substitute / Inline ${nt} into referencing rules`,
      titleCz: `Dosazení ${nt} do pravidel, ve kterých se vyskytuje`,
      description: `Every occurrence of '${nt}' in the rules of other non-terminals was replaced by each of its ${ntRules.length} alternative(s).`,
      descriptionCz: `Každý výskyt '${nt}' v pravidlech ostatních neterminálů byl nahrazen každou z jeho pravých stran (počet: ${ntRules.length}).`,
      mathExplanation: `For any rule B -> α ${nt} β, substitute ${nt} with each right-hand side of ${nt}.`,
      mathExplanationCz: `Pro každé pravidlo B -> α ${nt} β dosadíme za ${nt} každou pravou stranu ${nt}.`,
      removedRules: removed,
      addedRules: added,
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 6. Expand leading non-terminal in a specific symbol
 */
export function expandLeadingNonTerminalInSymbol(g: Grammar, nt: string, targetLeadingNt?: string): TransformationResult {
  const table = new RuleTable(g);
  const matches = (r: Alt) =>
    r.length > 0 && g.nonTerminals.has(r[0]) && r[0] !== nt && (!targetLeadingNt || r[0] === targetLeadingNt);
  const ntRules = table.get(nt);
  const matching = ntRules.filter(matches);
  if (matching.length === 0) return unchanged(g);

  const added: string[] = [];
  const next: Alt[] = [];
  for (const r of ntRules) {
    if (!matches(r)) {
      next.push(r);
      continue;
    }
    for (const delta of table.get(r[0])) {
      const nr = [...delta, ...r.slice(1)];
      next.push(nr);
      added.push(fmtRule(nt, nr));
    }
  }
  table.set(nt, next);
  const result = table.toGrammar();

  const targetNtStr = targetLeadingNt || [...new Set(matching.map(r => r[0]))].join(', ');
  return {
    transformedGrammar: result,
    steps: [{
      title: `Eliminate the rules ${nt} -> ${targetNtStr} …`,
      titleCz: `Eliminace pravidel ${nt} -> ${targetNtStr} …`,
      description: `Expanded the leading occurrence of '${targetNtStr}' in the rules of '${nt}'.`,
      descriptionCz: `Za úvodní '${targetNtStr}' v pravidlech neterminálu '${nt}' byly dosazeny všechny pravé strany pravidel '${targetNtStr}'.`,
      mathExplanation: `${nt} -> ${targetNtStr} α, where ${targetNtStr} -> β₁ | β₂  ⟹  ${nt} -> β₁ α | β₂ α`,
      mathExplanationCz: `${nt} -> ${targetNtStr} α, kde ${targetNtStr} -> β₁ | β₂  ⟹  ${nt} -> β₁ α | β₂ α`,
      addedRules: added,
      removedRules: matching.map(r => fmtRule(nt, r)),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 7. Remove unproductive symbol
 */
export function removeUnproductiveSymbol(g: Grammar, nt: string): TransformationResult {
  if (nt === g.startSymbol) return unchanged(g);
  const removedRules = g.productions.filter(p => p.lhs === nt || p.rhs.includes(nt));
  const result = buildGrammar(g, g.productions.filter(p => !removedRules.includes(p)));

  return {
    transformedGrammar: result,
    steps: [{
      title: `Remove the non-generating non-terminal '${nt}'`,
      titleCz: `Odstranění nenormovaného neterminálu '${nt}'`,
      description: `Removed non-generating symbol '${nt}' and ${removedRules.length} rule(s) containing it.`,
      descriptionCz: `Odstraněn nenormovaný neterminál '${nt}' a pravidla, která jej obsahovala (počet: ${removedRules.length}).`,
      mathExplanation: `A non-terminal is unproductive if it cannot derive any string of terminals: A ∉ N_gen.`,
      mathExplanationCz: `Neterminál A je nenormovaný, pokud z něj nelze odvodit žádný terminální řetězec: A ∉ N_gen.`,
      removedRules: removedRules.map(formatProduction),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}

/**
 * 8. Remove unreachable symbol
 */
export function removeUnreachableSymbol(g: Grammar, nt: string): TransformationResult {
  if (nt === g.startSymbol) return unchanged(g);
  const removedRules = g.productions.filter(p => p.lhs === nt || p.rhs.includes(nt));
  const result = buildGrammar(g, g.productions.filter(p => !removedRules.includes(p)));

  return {
    transformedGrammar: result,
    steps: [{
      title: `Remove Unreachable Symbol '${nt}'`,
      titleCz: `Odstranění nedosažitelného symbolu '${nt}'`,
      description: `Removed unreachable symbol '${nt}' and ${removedRules.length} rule(s) containing it.`,
      descriptionCz: `Odstraněn nedosažitelný symbol '${nt}' a pravidla, která jej obsahovala (počet: ${removedRules.length}).`,
      mathExplanation: `A symbol is unreachable if it cannot appear in any sentential form derived from S: A ∉ V_reach.`,
      mathExplanationCz: `Symbol je nedosažitelný, pokud se nemůže vyskytnout v žádné větné formě odvozené z S: A ∉ V_reach.`,
      removedRules: removedRules.map(formatProduction),
      intermediateGrammar: cloneGrammar(result)
    }]
  };
}
