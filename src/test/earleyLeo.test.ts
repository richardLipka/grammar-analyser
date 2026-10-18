/**
 * Leo's (1991) transitive items in the classic Earley simulator: same language as the oracle,
 * valid trees, the skipped items are exactly the ones plain Earley adds, and right recursion
 * costs a linear number of items.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { simulateEarleyParse, formatItemKey, EarleySimulationResult } from '../core/earley/earleyParser';
import { Grammar } from '../core/ast/grammar';
import { DerivationNode } from '../core/generator/wordGenerator';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const g = (text: string) => parseGrammar(text).grammar!;

const validTree = (gr: Grammar, n: DerivationNode): boolean => {
  if (n.isTerminal) return true;
  const kids = (n.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
  return gr.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === kids.join(' ')) &&
    (n.children ?? []).every(c => validTree(gr, c));
};
const leaves = (n: DerivationNode): string[] =>
  !n.children || n.children.length === 0 ? (n.symbol === 'ε' ? [] : [n.symbol]) : n.children.flatMap(leaves);

/** Item keys per set; with `withReconstructed` the skipped items are added back. */
const chartKeys = (r: EarleySimulationResult, withReconstructed: boolean) =>
  r.sets.map((s, idx) => new Set([
    ...s.items.map(it => formatItemKey(it.production.id, it.dot, it.origin)),
    ...(withReconstructed ? r.reconstructedItems[idx].map(it => formatItemKey(it.production.id, it.dot, it.origin)) : [])
  ]));

const items = (text: string, n: number, leo: boolean) => {
  const r = simulateEarleyParse(Array(n).fill('a'), g(text), { leo, maxSteps: 1e7 });
  expect(r.accepted).toBe(true);
  return r;
};

describe("Earley with Leo's transitive items (Leo 1991)", () => {
  it('accepts exactly L(G), returns valid trees, and its chart plus the reconstructed items is the plain Earley chart (random grammars, words ≤ 5)', async () => {
    const failures: string[] = [];
    let leoUsed = 0;
    for (let seed = 1; seed <= 300 && failures.length < 5; seed++) {
      if (seed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const text = randomGrammarText(seed);
      const gr = parseGrammar(text).grammar;
      if (!gr) continue;
      for (const w of wordsUpTo([...gr.terminals], 5)) {
        const expected = accepts(gr, w);
        const plain = simulateEarleyParse(w, gr);
        const leo = simulateEarleyParse(w, gr, { leo: true });
        const problems: string[] = [];
        if (leo.accepted !== expected) problems.push(`accepted ${leo.accepted}`);
        if (leo.accepted) {
          const tree = leo.trees[0];
          if (!tree || !validTree(gr, tree) || leaves(tree).join(' ') !== w.join(' ')) problems.push('tree');
        }
        const full = chartKeys(plain, false);
        const withLeo = chartKeys(leo, false);
        const rebuilt = chartKeys(leo, true);
        full.forEach((keys, idx) => {
          for (const k of withLeo[idx]) if (!keys.has(k)) problems.push(`extra item ${k} in S${idx}`);
          if (rebuilt[idx].size !== keys.size || [...keys].some(k => !rebuilt[idx].has(k))) problems.push(`S${idx} not rebuilt`);
        });
        if (leo.stats.totalItems + leo.stats.skippedItems !== plain.stats.totalItems) problems.push('counts');
        if (leo.stats.leoCompletions > 0) leoUsed++;
        if (problems.length) {
          failures.push(`seed ${seed} [${text.replace(/\n/g, '; ')}] "${w.join(' ')}": ${problems.slice(0, 3).join(', ')}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(leoUsed).toBeGreaterThan(100);
  });

  it('right recursion S → a S | ε on aⁿ: linear with Leo, quadratic without', () => {
    const text = 'S -> a S | ε';
    const sizes = [10, 20, 40, 80];
    const plain = sizes.map(n => items(text, n, false));
    const leo = sizes.map(n => items(text, n, true));
    // Plain Earley: S_i holds [S → a S •, j] for every j < i, so Σ ≥ n²/2.
    plain.forEach((r, idx) => expect(r.stats.totalItems).toBeGreaterThanOrEqual(sizes[idx] ** 2 / 2));
    // Leo: every set has a bounded number of items and transitive items, the same for every n.
    const maxSet = (r: EarleySimulationResult) => Math.max(...r.sets.map(s => s.items.length + s.leoItems.length));
    expect(new Set(leo.map(maxSet)).size).toBe(1);
    expect(maxSet(leo[0])).toBeLessThanOrEqual(8);
    // Doubling n doubles the count (up to a constant).
    const total = (r: EarleySimulationResult) => r.stats.totalItems + r.stats.leoItems;
    const d1 = total(leo[1]) - total(leo[0]);
    const d2 = total(leo[2]) - total(leo[1]);
    const d3 = total(leo[3]) - total(leo[2]);
    expect(d2).toBe(2 * d1);
    expect(d3).toBe(2 * d2);
    // The skipped items are exactly the quadratic part.
    leo.forEach((r, idx) => expect(r.stats.totalItems + r.stats.skippedItems).toBe(plain[idx].stats.totalItems));
  });

  it('also for S → a S | a and a right-recursive list E → T + E | T', () => {
    for (const [text, word] of [
      ['S -> a S | a', (n: number) => Array(n).fill('a')],
      ['E -> T "+" E | T\nT -> a', (n: number) => Array.from({ length: 2 * n - 1 }, (_, i) => (i % 2 ? '+' : 'a'))]
    ] as const) {
      const gr = g(text);
      const totals = [20, 40, 80].map(n => {
        const r = simulateEarleyParse(word(n), gr, { leo: true, maxSteps: 1e7 });
        expect(r.accepted).toBe(true);
        expect(leaves(r.trees[0])).toEqual(word(n));
        expect(validTree(gr, r.trees[0])).toBe(true);
        return r.stats.totalItems + r.stats.leoItems;
      });
      expect(totals[2] - totals[1]).toBe(2 * (totals[1] - totals[0]));
      const plain = simulateEarleyParse(word(80), gr).stats.totalItems;
      expect(plain).toBeGreaterThan(3 * totals[2]);
    }
  });

  it('left recursion gets no transitive items worth having, and the counts stay the same', () => {
    const gr = g('S -> S a | a');
    const w = Array(30).fill('a');
    const plain = simulateEarleyParse(w, gr);
    const leo = simulateEarleyParse(w, gr, { leo: true });
    expect(leo.stats.totalItems).toBe(plain.stats.totalItems);
    expect(leo.stats.skippedItems).toBe(0);
  });

  it('steps explain the transitive item and the Leo completion, with valid sources', () => {
    const gr = g('S -> a S | ε');
    const r = simulateEarleyParse(['a', 'a', 'a'], gr, { leo: true });
    const memo = r.steps.find(s => s.operation === 'transitive')!;
    const leoStep = r.steps.find(s => s.operation === 'leo' && s.descriptionEn.includes('skipped'))!;
    expect(memo.descriptionCz).toContain('tranzitivní položka');
    expect(memo.descriptionEn).toContain('deterministic reduction path');
    expect(leoStep.descriptionCz).toContain('Kompletor (Leo)');
    for (const step of r.steps) {
      for (const s of step.sources) {
        const target = s.role === 'transitive' ? r.sets[s.setIndex].leoItems[s.itemIndex] : r.sets[s.setIndex].items[s.itemIndex];
        expect(target).toBeDefined();
      }
      expect(step.leoSizes.length).toBe(r.sets.length);
    }
    // The Leo step's subtree is the topmost item's subtree, built from the reconstructed items.
    expect(leoStep.derivationTree).toBeDefined();
    expect(validTree(gr, leoStep.derivationTree!)).toBe(true);
  });

  it('cyclic unit rules (S → A | a, A → S | b) do not loop and agree with the oracle', () => {
    const gr = g('S -> A | a S | a\nA -> S | b');
    for (const w of wordsUpTo(['a', 'b'], 6)) {
      const r = simulateEarleyParse(w, gr, { leo: true });
      expect(r.accepted).toBe(accepts(gr, w));
      if (r.accepted) expect(leaves(r.trees[0])).toEqual(w);
    }
  });
});
