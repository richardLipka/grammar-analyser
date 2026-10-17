/**
 * The CYK trees and the step-by-step simulation: trees are valid derivations
 * in the CNF grammar, distinct and as many as the word has (up to the limit),
 * also for long words; the steps say what happens in every split, and the
 * table at a step is the final table cut at that step.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { DerivationNode } from '../core/generator/wordGenerator';
import { cnfViolations, countCYKTrees, cykCellAtStep, cykTable, extractCYKTrees, simulateCYKParse } from '../core/parser/cyk';
import { testMembership } from '../core/parser/membership';
import { convertToChomsky } from '../core/processor/grammarProcessor';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};
const yieldOf = (n: DerivationNode): string[] =>
  n.children && n.children.length > 0 ? n.children.flatMap(yieldOf) : n.isTerminal && n.symbol !== 'ε' ? [n.symbol] : [];
const bracket = (n: DerivationNode): string =>
  n.children && n.children.length > 0 ? `${n.symbol}(${n.children.map(bracket).join(' ')})` : n.symbol;

/** Every inner node is the left-hand side of a rule whose right-hand side are its children. */
function invalidNode(g: Grammar, n: DerivationNode): string | null {
  if (n.isForestRoot) {
    for (const c of n.children || []) {
      const e = invalidNode(g, c);
      if (e) return e;
    }
    return null;
  }
  if (!n.children || n.children.length === 0) return n.isTerminal ? null : `leaf non-terminal ${n.symbol}`;
  const rhs = n.children.map(c => c.symbol).join(' ');
  if (!g.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === rhs)) return `no rule ${n.symbol} → ${rhs}`;
  for (const c of n.children) {
    if (c.isTerminal === g.nonTerminals.has(c.symbol)) return `wrong terminal flag of ${c.symbol}`;
    const e = invalidNode(g, c);
    if (e) return e;
  }
  return null;
}

/** All ids of a tree are distinct (the visualiser keys the nodes by id). */
function idsUnique(n: DerivationNode): boolean {
  const seen = new Set<string>();
  const walk = (x: DerivationNode): boolean => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return (x.children || []).every(walk);
  };
  return walk(n);
}

describe('CYK derivation trees', () => {
  it('long words still have a tree (no depth limit): a^30 and a^60', () => {
    const g = parse('S -> A S | a\nA -> a');
    for (const n of [27, 30, 60]) {
      const w = Array(n).fill('a');
      const t = cykTable(g, w);
      expect(t.accepted).toBe(true);
      const trees = extractCYKTrees(g, w, t);
      expect(trees.length, `a^${n}`).toBe(1);
      expect(yieldOf(trees[0])).toEqual(w);
      expect(invalidNode(g, trees[0])).toBeNull();
    }
  });

  it('trees are valid in the CNF grammar, distinct, yield the word, and there are min(5, count) of them', () => {
    for (let s = 1; s <= 120; s++) {
      const g = parse(randomGrammarText(s));
      const cnf = convertToChomsky(g).transformedGrammar;
      expect(cnfViolations(cnf)).toEqual([]);
      for (const w of wordsUpTo([...g.terminals], 5)) {
        const t = cykTable(cnf, w);
        expect(t.accepted, `seed ${s} '${w.join(' ')}'`).toBe(accepts(g, w));
        if (!t.accepted) continue;
        const count = testMembership(cnf, w, 1).treeCount;
        expect(countCYKTrees(cnf, t), `seed ${s} '${w.join(' ')}'`).toBe(BigInt(count));
        const trees = extractCYKTrees(cnf, w, t, 5);
        expect(trees.length, `seed ${s} '${w.join(' ')}'`).toBe(Math.min(5, count));
        expect(new Set(trees.map(bracket)).size).toBe(trees.length);
        for (const tree of trees) {
          expect(yieldOf(tree)).toEqual(w);
          if (w.length > 0) expect(invalidNode(cnf, tree), `seed ${s} '${w.join(' ')}' ${bracket(tree)}`).toBeNull();
        }
      }
    }
  });

  it('counts the Catalan number of trees for S → S S | a exactly', () => {
    const g = parse('S -> S S | a');
    const t = cykTable(g, Array(20).fill('a'));
    expect(countCYKTrees(g, t)).toBe(1767263190n); // C(19)
  });
});

describe('CYK step by step', () => {
  it('the steps describe every split; no "{}" or "{∅}"; the table at a step is the final table cut there', () => {
    for (let s = 1; s <= 80; s++) {
      const g = parse(randomGrammarText(s));
      const cnf = convertToChomsky(g).transformedGrammar;
      for (const w of wordsUpTo([...g.terminals], 4)) {
        if (w.length === 0) continue;
        const sim = simulateCYKParse(cnf, w, { converted: true });
        const t = sim.table;
        const n = w.length;
        expect(sim.accepted).toBe(t.accepted);
        expect(sim.steps.map(x => x.stepIndex)).toEqual(sim.steps.map((_, idx) => idx));
        // init, n base steps, one step per (i, j, k), the final check
        expect(sim.totalSteps).toBe(1 + n + ((n + 1) * n * (n - 1)) / 6 + 1);
        for (const st of sim.steps) {
          for (const text of [st.descriptionEn, st.descriptionCz]) {
            expect(text, text).not.toMatch(/\{\}|\{∅\}/);
          }
          if (st.derivationTree) {
            expect(invalidNode(cnf, st.derivationTree), st.descriptionEn).toBeNull();
            expect(idsUnique(st.derivationTree)).toBe(true);
          }
          if (st.phase === 'combine') {
            const k = st.k!;
            expect(st.leftCell).toEqual({ i: st.i, j: k });
            expect(st.rightCell).toEqual({ i: k + 1, j: st.j });
            // every applied rule is named with its operands
            for (const wit of st.activeWitnesses!) {
              const [B, C] = wit.production.rhs;
              expect(st.descriptionEn).toContain(`(${B} ∈ V(${st.i}, ${k}), ${C} ∈ V(${k + 1}, ${st.j}))`);
              expect(st.descriptionCz).toContain(`(${B} ∈ V(${st.i}, ${k}), ${C} ∈ V(${k + 1}, ${st.j}))`);
            }
            if (st.derivationTree) {
              const roots = st.derivationTree.isForestRoot ? st.derivationTree.children! : [st.derivationTree];
              for (const r of roots) {
                expect(yieldOf(r)).toEqual(w.slice(st.i - 1, st.j));
                expect(yieldOf(r.children![0]).length).toBe(k - st.i + 1);
              }
            }
          }
          // the cell being filled holds exactly the witnesses up to this k
          for (let i = 1; i <= n; i++) {
            for (let j = i; j <= n; j++) {
              const cell = cykCellAtStep(t, st, i, j);
              if (!cell) continue;
              for (const [A, wits] of cell) {
                expect(t.cells[i][j].has(A)).toBe(true);
                for (const wit of wits) if (wit.k !== undefined && st.phase === 'combine' && i === st.i && j === st.j) expect(wit.k).toBeLessThanOrEqual(st.k!);
              }
            }
          }
        }
        const last = sim.steps[sim.steps.length - 1];
        for (let i = 1; i <= n; i++) for (let j = i; j <= n; j++) expect(cykCellAtStep(t, last, i, j)).toBe(t.cells[i][j]);
        expect(cykCellAtStep(t, sim.steps[0], 1, 1)).toBeNull();
      }
    }
  });

  it('a rule for a non-terminal already in the cell is explained as another derivation', () => {
    const g = parse('S -> S S | a');
    const sim = simulateCYKParse(g, ['a', 'a', 'a']);
    const st = sim.steps.find(x => x.phase === 'combine' && x.i === 1 && x.j === 3 && x.k === 2)!;
    expect(st.addedNonTerminals).toEqual([]);
    expect(st.repeatedNonTerminals).toEqual(['S']);
    expect(st.descriptionEn).toContain('S is already in V(1, 3) (from k = 1)');
    expect(st.descriptionEn).toContain('more than one derivation tree');
    expect(st.descriptionCz).toContain('S už ve V(1, 3) je (z k = 1)');
    expect(st.derivationTree).toBeDefined();
  });

  it('names the parts of the word, writes ∅ without braces and lists all non-terminals of a symbol', () => {
    const g = parse('S -> A B | B A\nA -> a\nB -> a | b');
    const sim = simulateCYKParse(g, ['b', 'a', 'b']);
    const base = sim.steps.find(x => x.phase === 'base' && x.i === 2)!;
    expect(base.descriptionEn).toBe('Length 1, w₂ = a. Rules with the right-hand side a: A → a, B → a. So V(2, 2) = {A, B}.');
    expect(base.derivationTree!.isForestRoot).toBe(true);
    expect(base.derivationTree!.children!.map(bracket)).toEqual(['A(a)', 'B(a)']);
    const split = sim.steps.find(x => x.phase === 'combine' && x.i === 1 && x.j === 3 && x.k === 2)!;
    expect(split.descriptionEn).toContain('part w₁…w₃ = b a b, split k = 2: w₁…w₂ = b a | w₃ = b.');
    const empty = sim.steps.find(x => x.phase === 'combine' && x.i === 1 && x.j === 2)!;
    expect(empty.descriptionEn).toContain('V(1, 2) = {S}');
    const none = simulateCYKParse(parse('S -> A B\nA -> a\nB -> b'), ['b', 'a', 'b']);
    const st = none.steps.find(x => x.phase === 'combine' && x.i === 1 && x.j === 3 && x.k === 2)!;
    expect(st.descriptionEn).toContain('V(1, 2) = ∅, V(3, 3) = {B}. The left cell is empty, so no rule A → B C applies for this k.');
    expect(st.descriptionCz).toContain('V(1, 2) = ∅, V(3, 3) = {B}. Levá buňka je prázdná, pro toto k proto nelze použít žádné pravidlo A → B C.');
    expect(st.derivationTree).toBeUndefined();
  });

  it('the final step: acceptance with the number of trees, rejection with the content of V(1, n)', () => {
    const g = parse('S -> S S | a');
    const acc = simulateCYKParse(g, Array(4).fill('a'));
    const last = acc.steps[acc.steps.length - 1];
    expect(last.descriptionEn).toBe('The table is complete. V(1, 4) = {S} contains the start symbol S, so w = a a a a ∈ L(G). Number of derivation trees in G: 5.');
    expect(last.descriptionCz).toContain('Výpočet tabulky CYK dokončen.');
    expect(acc.treeCount).toBe(5n);
    const rej = simulateCYKParse(parse('S -> A B\nA -> a\nB -> b'), ['a', 'a']);
    const r = rej.steps[rej.steps.length - 1];
    expect(r.descriptionEn).toBe('The table is complete. V(1, 2) = ∅ does not contain the start symbol S, so w = a a ∉ L(G).');
    const conv = simulateCYKParse(parse('S -> A B\nA -> a\nB -> b'), ['a', 'b'], { converted: true });
    expect(conv.steps[conv.steps.length - 1].descriptionEn).toContain('∈ L(G′) = L(G)');
    const eps = simulateCYKParse(convertToChomsky(parse('S -> a S b | ε')).transformedGrammar, [], { converted: true });
    expect(eps.accepted).toBe(true);
    expect(eps.steps[0].descriptionEn).toContain('ε ∈ L(G′) = L(G)');
  });

  it('simulates a word of 60 symbols quickly (no table copies per step)', () => {
    for (const text of ['S -> S S | a', 'S -> A S | a\nA -> a']) {
      const g = parse(text);
      const w = Array(60).fill('a');
      const t0 = performance.now();
      const sim = simulateCYKParse(g, w);
      const ms = performance.now() - t0;
      expect(sim.totalSteps).toBe(1 + 60 + (61 * 60 * 59) / 6 + 1);
      expect(sim.trees.length).toBeGreaterThan(0);
      expect(ms, `${text}: ${ms.toFixed(0)} ms`).toBeLessThan(1500);
    }
  });
});
