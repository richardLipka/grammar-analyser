/**
 * Lookaheads of the LR(1) and LALR(1) automata and their explanations.
 *
 * - LALR(1) lookaheads are compared with an independent implementation of the
 *   Dragon Book algorithm that finds spontaneous and propagated lookaheads on
 *   the LR(0) kernels (Aho, Lam, Sethi, Ullman, 2nd ed., Alg. 4.62/4.63), with
 *   its own FIRST sets and closure.
 * - The LR(1) lookaheads merged by core must give the same sets (for grammars
 *   whose non-terminals all generate a word, see checkGrammar).
 * - Every lookahead must have a reason (explainLookahead), the first reason must
 *   not go round in a circle, and every item must have a reason (explainItem).
 * - A conflict-free LR(1)/LALR(1) table must accept exactly the language
 *   (missing lookaheads would reject words, see the Earley recognizer).
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar, END_MARKER, EPSILON, Production } from '../core/ast/grammar';
import { attachMergedLR1States, augmentGrammar, buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton, LRAutomaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { explainItem, explainLookahead, stateCreators, itemsMovingOver, isKernelItem } from '../core/lr/lrExplain';
import { lr0ItemKey } from '../core/lr/lrItem';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const DUMMY = '\u0000';

/** FIRST of every symbol by the plain fixpoint (independent of the analyser). */
function firstSets(g: Grammar, prods: Production[]) {
  const first = new Map<string, Set<string>>();
  const nullable = new Set<string>();
  for (const nt of g.nonTerminals) first.set(nt, new Set());
  for (const p of prods) if (!first.has(p.lhs)) first.set(p.lhs, new Set());
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prods) {
      const f = first.get(p.lhs)!;
      let allNullable = true;
      for (const s of p.rhs) {
        const fs = first.has(s) ? first.get(s)! : new Set([s]);
        for (const x of fs) if (!f.has(x)) { f.add(x); changed = true; }
        if (!(first.has(s) && nullable.has(s))) { allNullable = false; break; }
      }
      if (allNullable && !nullable.has(p.lhs)) { nullable.add(p.lhs); changed = true; }
    }
  }
  /** FIRST(β a) for a sequence ending with a terminal (or the dummy) */
  return (seq: string[]): Set<string> => {
    const res = new Set<string>();
    for (const s of seq) {
      const fs = first.has(s) ? first.get(s)! : new Set([s]);
      for (const x of fs) res.add(x);
      if (!(first.has(s) && nullable.has(s))) break;
    }
    return res;
  };
}

type Item = { p: Production; dot: number; la: string };
const key = (it: Item) => `${it.p.id}@${it.dot},${it.la}`;

function closure(items: Item[], prods: Production[], firstOf: (seq: string[]) => Set<string>): Item[] {
  const res = [...items];
  const seen = new Set(res.map(key));
  for (let i = 0; i < res.length; i++) {
    const { p, dot, la } = res[i];
    const B = p.rhs[dot];
    if (B === undefined) continue;
    for (const q of prods) {
      if (q.lhs !== B) continue;
      for (const b of firstOf([...p.rhs.slice(dot + 1), la])) {
        const it = { p: q, dot: 0, la: b };
        if (!seen.has(key(it))) { seen.add(key(it)); res.push(it); }
      }
    }
  }
  return res;
}

/** LALR(1) item sets by spontaneous generation and propagation of lookaheads on the LR(0) kernels. */
function lalrByPropagation(g: Grammar): Map<string, Set<string>> {
  const { grammar: aug } = augmentGrammar(g);
  const prods = aug.productions;
  const firstOf = firstSets(aug, prods);
  const lr0 = buildLR0Automaton(g, 'LR(0)');
  const kernelKey = (stateId: number, prodId: number, dot: number) => `${stateId}:${prodId}@${dot}`;
  const la = new Map<string, Set<string>>();
  const propagate = new Map<string, string[]>();
  const spontaneous: { from: string; to: string; a: string }[] = [];
  for (const s of lr0.states) {
    for (const k of s.items0.filter(isKernelItem)) la.set(kernelKey(s.id, k.production.id, k.dotIndex), new Set());
  }
  la.get(kernelKey(0, 0, 0))!.add(END_MARKER);
  for (const s of lr0.states) {
    for (const k of s.items0.filter(isKernelItem)) {
      const from = kernelKey(s.id, k.production.id, k.dotIndex);
      for (const it of closure([{ p: k.production, dot: k.dotIndex, la: DUMMY }], prods, firstOf)) {
        const X = it.p.rhs[it.dot];
        if (X === undefined) continue;
        const to = kernelKey(s.transitions.get(X)!, it.p.id, it.dot + 1);
        if (it.la === DUMMY) propagate.set(from, [...(propagate.get(from) || []), to]);
        else spontaneous.push({ from, to, a: it.la });
      }
    }
  }
  // A spontaneous lookahead counts only once its kernel item has a lookahead (this matters only with
  // non-generating symbols, whose kernel items may never get one)
  let changed = true;
  while (changed) {
    changed = false;
    for (const { from, to, a } of spontaneous) if (la.get(from)!.size > 0 && !la.get(to)!.has(a)) { la.get(to)!.add(a); changed = true; }
    for (const [from, tos] of propagate) {
      for (const to of tos) {
        for (const a of la.get(from)!) if (!la.get(to)!.has(a)) { la.get(to)!.add(a); changed = true; }
      }
    }
  }
  // Full item sets (closure of the kernels with their lookaheads), keyed by the LR(0) core of the state
  const result = new Map<string, Set<string>>();
  for (const s of lr0.states) {
    const kernel: Item[] = [];
    for (const k of s.items0.filter(isKernelItem)) {
      for (const a of la.get(kernelKey(s.id, k.production.id, k.dotIndex))!) kernel.push({ p: k.production, dot: k.dotIndex, la: a });
    }
    result.set(kernelCore(lr0, s.id), new Set(closure(kernel, prods, firstOf).map(key)));
  }
  return result;
}

const coreKeyOf = (keys: string[]) => [...new Set(keys)].sort().join('|');

/** Every non-terminal derives some terminal word. */
function allGenerating(g: Grammar): boolean {
  const generating = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      if (!generating.has(p.lhs) && p.rhs.every(s => !g.nonTerminals.has(s) || generating.has(s))) {
        generating.add(p.lhs);
        changed = true;
      }
    }
  }
  return [...g.nonTerminals].every(nt => generating.has(nt));
}
const kernelCore = (a: LRAutomaton, id: number) => coreKeyOf(a.states[id].items0.filter(isKernelItem).map(lr0ItemKey));
const itemKeys = (a: LRAutomaton, id: number) => new Set((a.states[id].items1 || []).map(it => key({ p: it.production, dot: it.dotIndex, la: it.lookahead })));

/** Checks the lookaheads and the explanations of one grammar. */
function checkGrammar(g: Grammar, label: string) {
  const analysis = analyzeGrammar(g);
  const lr1 = buildLR1Automaton(g, analysis);
  const lalr = buildLALR1Automaton(g, analysis);
  attachMergedLR1States(lalr, lr1);
  const reference = lalrByPropagation(g);

  // LALR(1) = the independent propagation algorithm, state by state
  expect(lalr.states.length, label).toBe(reference.size);
  for (const s of lalr.states) {
    expect([...itemKeys(lalr, s.id)].sort(), `${label} LALR state ${s.id}`).toEqual([...reference.get(kernelCore(lalr, s.id))!].sort());
  }

  // With a non-generating non-terminal (A → A A) FIRST(β a) can be empty: canonical LR(1) has no
  // item with an empty lookahead set, so its states need not correspond to the LR(0) states, and
  // merging LR(1) by core differs from propagating on the LR(0) kernels (in states no word reaches).
  // That comparison is therefore made for grammars whose non-terminals all generate a word.
  const generating = allGenerating(g);
  if (generating) {
    // LR(1) states merged by core give the same sets
    const merged = new Map<string, Set<string>>();
    for (const s of lr1.states) {
      const k = kernelCore(lr1, s.id);
      merged.set(k, new Set([...(merged.get(k) || []), ...itemKeys(lr1, s.id)]));
    }
    expect([...merged.keys()].sort(), label).toEqual([...reference.keys()].sort());
    for (const [k, set] of reference) expect([...merged.get(k)!].sort(), `${label} LR(1) merged`).toEqual([...set].sort());
  }

  for (const a of [lr1, lalr]) {
    const creators = stateCreators(a);
    for (const s of a.states) {
      // The creating transition goes from an earlier state and moves the dot in at least one item
      if (s.id === 0) expect(creators[0]).toBeNull();
      else {
        const c = creators[s.id]!;
        expect(c.from, label).toBeLessThan(s.id);
        expect(a.states[c.from].transitions.get(c.symbol)).toBe(s.id);
        expect(itemsMovingOver(a.states[c.from], c.symbol).length).toBeGreaterThan(0);
      }
      for (const it of s.items0) expect(explainItem(a, s.id, it).length, `${label} ${a.variant} item`).toBeGreaterThan(0);

      // Every lookahead has a reason; following first reasons inside a state ends in the kernel
      for (const it of s.items1!) {
        const ex = explainLookahead(a, analysis, s.id, it.production, it.dotIndex, it.lookahead, lr1);
        const where = `${label} ${a.variant} state ${s.id} [${it.production.lhs} -> ${it.production.rhs.join(' ')} @${it.dotIndex}, ${it.lookahead}]`;
        expect(ex.reasons.length, where).toBeGreaterThan(0);
        if (a === lalr && generating) expect(ex.lr1States!.length, where).toBeGreaterThan(0);
        let cur = { production: it.production, dotIndex: it.dotIndex, la: it.lookahead };
        for (let steps = 0; cur.dotIndex === 0 && cur.production.id !== 0; steps++) {
          expect(steps, `${where}: circular first reasons`).toBeLessThan(s.items1!.length);
          const r = explainLookahead(a, analysis, s.id, cur.production, 0, cur.la).reasons[0];
          if (r.kind === 'first') break;
          expect(r.kind, where).toBe('inherit');
          if (r.kind !== 'inherit') break;
          cur = { production: r.parent.production, dotIndex: r.parent.dotIndex, la: cur.la };
        }
        if (it.dotIndex > 0) expect(ex.reasons[0].kind).toBe('goto');
        if (it.production.id === 0 && it.dotIndex === 0) expect(ex.reasons).toEqual([{ kind: 'initial' }]);
      }
    }
  }

  // Conflict-free tables accept exactly the language
  const alphabet = [...g.terminals];
  let maxLen = 0;
  while (maxLen < 5 && alphabet.length ** (maxLen + 1) <= 1500) maxLen++;
  for (const a of [lr1, lalr]) {
    const table = buildLRTable(a, g, analysis);
    if (!table.isConflictFree) continue;
    for (const w of wordsUpTo(alphabet, maxLen)) {
      expect(simulateLRParse(w, g, table).accepted, `${label} ${a.variant} '${w.join(' ')}'`).toBe(accepts(g, w));
    }
  }
}

describe('LR(1) and LALR(1) lookaheads', () => {
  it('match the propagation algorithm on the dragon-book grammar 4.55 (S → L = R | R)', () => {
    const g = parse('S -> L = R | R\nL -> * R | id\nR -> L');
    checkGrammar(g, 'G4.55');
    const analysis = analyzeGrammar(g);
    const lalr = buildLALR1Automaton(g, analysis);
    // The state after L from the initial state: [S → L • = R, $] and [R → L •, $ / =]
    const L = lalr.states[0].transitions.get('L')!;
    const reduce = lalr.states[L].items1!.filter(it => it.production.lhs === 'R').map(it => it.lookahead).sort();
    expect(reduce).toEqual(['$']);
    const fromStar = lalr.states[lalr.states[0].transitions.get('*')!].transitions.get('L')!;
    expect(lalr.states[fromStar].items1!.map(it => it.lookahead).sort()).toEqual(['$', '=']);
  });

  it('explain closure lookaheads by FIRST(β) and by passing on through a nullable β', () => {
    const g = parse('S -> A B c\nA -> a\nB -> b | ε');
    const analysis = analyzeGrammar(g);
    const lr1 = buildLR1Automaton(g, analysis);
    const s0 = lr1.states[0];
    const itemA = s0.items1!.find(it => it.production.lhs === 'A')!;
    // [A → • a, b] comes from FIRST(B c) ∋ b, [A → • a, c] too (B is nullable, so c ∈ FIRST(B c))
    expect(s0.items1!.filter(it => it.production.lhs === 'A').map(it => it.lookahead).sort()).toEqual(['b', 'c']);
    const ex = explainLookahead(lr1, analysis, 0, itemA.production, 0, 'b');
    expect(ex.reasons[0]).toMatchObject({ kind: 'first', beta: ['B', 'c'] });

    // S → X ; X → Y d ; Y → Z ; Z → z: d is passed on from Y to Z (β empty)
    const g2 = parse('S -> X\nX -> Y d\nY -> Z\nZ -> z');
    const a2 = analyzeGrammar(g2);
    const lr1b = buildLR1Automaton(g2, a2);
    const z = lr1b.states[0].items1!.find(it => it.production.lhs === 'Z')!;
    expect(z.lookahead).toBe('d');
    expect(explainLookahead(lr1b, a2, 0, z.production, 0, 'd').reasons[0]).toMatchObject({ kind: 'inherit', beta: [] });
    const s = lr1b.states[0].items1!.find(it => it.production.lhs === 'X')!;
    expect(explainLookahead(lr1b, a2, 0, s.production, 0, END_MARKER).reasons[0]).toMatchObject({ kind: 'inherit' });
    expect(EPSILON).toBe('ε');
  });

  it('records the merged LR(1) states of an LALR(1) state', () => {
    const g = parse('S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c');
    const analysis = analyzeGrammar(g);
    const lr1 = buildLR1Automaton(g, analysis);
    const lalr = buildLALR1Automaton(g, analysis);
    expect(lalr.states.every(s => s.mergedFrom === undefined)).toBe(true);
    attachMergedLR1States(lalr, lr1);
    const merged = lalr.states.filter(s => (s.mergedFrom || []).length > 1);
    expect(merged.length).toBe(1);
    const st = merged[0];
    const itemA = st.items1!.find(it => it.production.lhs === 'A' && it.lookahead === 'd')!;
    const ex = explainLookahead(lalr, analysis, st.id, itemA.production, itemA.dotIndex, 'd', lr1);
    expect(ex.mergedFrom!.length).toBe(2);
    expect(ex.lr1States!.length).toBe(1);
    checkGrammar(g, 'reduce-reduce LALR');
  });

  it('hold for every preset grammar', () => {
    for (const p of PRESET_GRAMMARS) checkGrammar(parse(p.grammarText), p.id);
  });

  it('compare with the propagation algorithm only when every non-terminal generates a word', () => {
    // A is non-generating: the LR(1) states after A differ from the LR(0) ones (nothing is ever reduced there)
    const g = parse('S -> ε | A b | a\nA -> A A A');
    expect(allGenerating(g)).toBe(false);
    checkGrammar(g, 'non-generating A');
    // S is non-generating, so FIRST(S $) = ∅ and B → • c never gets a lookahead: LALR(1) keeps the
    // LR(0) states (some items without lookaheads), canonical LR(1) has fewer states
    const g2 = parse('S -> S A | S\nA -> B S\nB -> c | c S A');
    const a2 = analyzeGrammar(g2);
    expect(buildLALR1Automaton(g2, a2).states.length).toBe(buildLR0Automaton(g2).states.length);
    expect(buildLR1Automaton(g2, a2).states.length).toBeLessThan(buildLR0Automaton(g2).states.length);
    checkGrammar(g2, 'non-generating S');
    expect(allGenerating(parse('S -> a S | b'))).toBe(true);
  });

  it('hold for random grammars', () => {
    for (let seed = 1; seed <= 150; seed++) checkGrammar(parse(randomGrammarText(seed)), `seed ${seed}`);
  });
});
