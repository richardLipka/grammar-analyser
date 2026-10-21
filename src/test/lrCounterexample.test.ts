/**
 * Counterexamples for LR conflicts (Isradisaikul & Myers 2015): unifying ones prove ambiguity,
 * non-unifying ones show the two derivations at the conflict point. Every reported derivation
 * is checked independently: real rules, the right frontier, the prefix leads the automaton into
 * the conflict state, the conflict items/actions are where they should be.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar, END_MARKER } from '../core/ast/grammar';
import {
  LRAutomaton, buildLR0Automaton, buildSLR1Automaton, buildLALR1Automaton, buildLR1Automaton, buildIELR1Automaton
} from '../core/lr/lrAutomaton';
import { buildLRTable, LRConflict, LRTable, LR0_ACTION_COLUMN } from '../core/lr/lrTable';
import { createCounterexampleFinder, LRCounterexample, CounterexampleOptions } from '../core/lr/lrCounterexample';
import { DerivationNode } from '../core/generator/wordGenerator';
import { randomGrammarText } from './randomGrammar';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { testMembership } from '../core/parser/membership';
import { accepts, wordsUpTo } from './earley';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

function tables(g: Grammar): { automaton: LRAutomaton; table: LRTable }[] {
  const analysis = analyzeGrammar(g);
  const lr1 = buildLR1Automaton(g, analysis);
  return [buildLR0Automaton(g), buildSLR1Automaton(g, analysis), buildLALR1Automaton(g, analysis), buildIELR1Automaton(g, analysis, lr1), lr1]
    .map(automaton => ({ automaton, table: buildLRTable(automaton, g, analysis, { usePrecedence: false }) }));
}

/** Every non-terminal is reachable from the start symbol and generates a word. */
function isReduced(g: Grammar): boolean {
  const gen = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.productions) {
      if (!gen.has(p.lhs) && p.rhs.every(x => !g.nonTerminals.has(x) || gen.has(x))) { gen.add(p.lhs); changed = true; }
    }
  }
  const reach = new Set([g.startSymbol]);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.productions) {
      if (!reach.has(p.lhs)) continue;
      for (const x of p.rhs) if (g.nonTerminals.has(x) && !reach.has(x)) { reach.add(x); changed = true; }
    }
  }
  return [...g.nonTerminals].every(a => gen.has(a) && reach.has(a));
}

const frontier = (n: DerivationNode): string[] =>
  n.children && n.children.length ? n.children.flatMap(frontier) : n.symbol === 'ε' ? [] : [n.symbol];

/** Rule of an inner node (by its children), or undefined when no rule fits. */
const ruleOf = (g: Grammar, a: LRAutomaton, n: DerivationNode) => {
  const kids = (n.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
  return [a.augmentedProduction, ...g.productions].find(p => p.lhs === n.symbol && p.rhs.join(' ') === kids.join(' '));
};
const validTree = (g: Grammar, a: LRAutomaton, n: DerivationNode): boolean =>
  !n.children || n.children.length === 0
    ? n.symbol !== 'ε' || true
    : !!ruleOf(g, a, n) && n.children.every(c => validTree(g, a, c));

const run = (a: LRAutomaton, symbols: string[]): number | undefined => {
  let s: number | undefined = 0;
  for (const x of symbols) s = s === undefined ? undefined : a.states[s].transitions.get(x);
  return s;
};

/** Inner nodes with the [start, end) of their frontier. */
function spans(n: DerivationNode, from = 0, out: { node: DerivationNode; from: number; to: number }[] = []) {
  if (!n.children || n.children.length === 0) return { to: from + (n.symbol === 'ε' ? 0 : 1), out };
  let pos = from;
  for (const c of n.children) pos = spans(c, pos, out).to;
  out.push({ node: n, from, to: pos });
  return { to: pos, out };
}

/** Shift/reduce sequence of a left parse (postorder of its tree), with rule ids. */
function actions(g: Grammar, parse: number[]): string[] {
  const out: string[] = [];
  let pos = 0;
  const node = (): void => {
    const p = g.productions.find(q => q.id === parse[pos])!;
    pos++;
    for (const x of p.rhs) {
      if (g.nonTerminals.has(x)) node();
      else out.push(`s:${x}`);
    }
    out.push(`r${p.id}`);
  };
  node();
  expect(pos).toBe(parse.length);
  out.push('acc');
  return out;
}

/** Checks a counterexample against its conflict; returns the problems found. */
function check(g: Grammar, a: LRAutomaton, c: LRConflict, cx: LRCounterexample): string[] {
  const problems: string[] = [];
  const t = c.symbol === LR0_ACTION_COLUMN ? null : c.symbol;
  const key = (x: { type: string; production?: { id: number } }) => (x.type === 'reduce' ? `r${x.production!.id}` : x.type === 'accept' ? 'acc' : 's');
  const wanted = new Set(c.actions.map(key));
  if (cx.kind === 'unifying') {
    for (const tree of cx.trees) {
      if (!validTree(g, a, tree)) problems.push('invalid tree');
      if (tree.symbol !== g.startSymbol) problems.push('root');
      if (frontier(tree).join(' ') !== cx.word.join(' ')) problems.push('frontier');
      if (frontier(tree).some(s => g.nonTerminals.has(s))) problems.push('not a word');
    }
    // Independently: replay both parses, they must part in the conflict cell with the two actions.
    const s1 = actions(g, cx.parses[0]);
    const s2 = actions(g, cx.parses[1]);
    if (s1.join() === s2.join()) return ['the two parses are the same'];
    let i = 0;
    while (s1[i] === s2[i]) i++;
    const stack = [0];
    let read = 0;
    for (const act of s1.slice(0, i)) {
      if (act.startsWith('s:')) {
        stack.push(a.states[stack[stack.length - 1]].transitions.get(act.slice(2))!);
        read++;
      } else {
        const p = g.productions.find(q => `r${q.id}` === act)!;
        stack.length -= p.rhs.length;
        stack.push(a.states[stack[stack.length - 1]].transitions.get(p.lhs)!);
      }
    }
    if (stack[stack.length - 1] !== c.stateId) problems.push(`parts in state ${stack[stack.length - 1]}, not ${c.stateId}`);
    const la = read < cx.word.length ? cx.word[read] : END_MARKER;
    // LR(0) reduces whatever follows: a reduce/reduce conflict is the same in every column of the state
    const stateWide = a.variant === 'LR(0)' && c.actions.every(x => x.type === 'reduce');
    if (t !== null && la !== t && !stateWide) problems.push(`lookahead ${la}`);
    if (read !== cx.dot) problems.push('dot');
    for (const act of [s1[i], s2[i]]) {
      const k = act.startsWith('s:') ? 's' : act;
      if (!wanted.has(k)) problems.push(`action ${act} not in the conflict`);
    }
    return problems;
  }
  for (const d of cx.derivations) {
    if (!validTree(g, a, d.tree)) problems.push('invalid tree');
    if (frontier(d.tree).join(' ') !== d.form.join(' ')) problems.push('frontier');
    if (run(a, d.form.slice(0, d.dot)) !== c.stateId) problems.push(`prefix ${d.form.slice(0, d.dot).join(' ')} does not lead to the conflict state`);
    if (!wanted.has(key(d.action))) problems.push('action');
    if (d.action.type === 'reduce' || d.action.type === 'accept') {
      const p = d.action.type === 'accept' ? a.augmentedProduction : d.action.production!;
      const handle = spans(d.tree).out.some(s => s.to === d.dot && ruleOf(g, a, s.node)?.id === p.id);
      if (!handle) problems.push(`no handle of rule ${p.id} ending at •`);
      if (t !== null && a.variant !== 'LR(0)') {
        const next = d.dot < d.form.length ? d.form[d.dot] : END_MARKER;
        if (d.lookaheadInContext && next !== t) problems.push(`after • comes ${next}, not ${t}`);
        if (!d.lookaheadInContext) {
          const fw = d.followWitness;
          // Without a reduced grammar FOLLOW can come from rules no derivation of a word uses.
          if (!fw) { if (isReduced(g)) problems.push('no FOLLOW witness'); }
          else {
            const after = fw.dot < fw.form.length ? fw.form[fw.dot] : END_MARKER;
            if (after !== t || !validTree(g, a, fw.tree) || !spans(fw.tree).out.some(s => s.to === fw.dot && ruleOf(g, a, s.node)?.id === p.id)) problems.push('bad FOLLOW witness');
          }
        }
      }
    } else if (t !== null && d.form[d.dot] !== t) problems.push('shift symbol not after •');
  }
  return problems;
}

const counterexamples = (text: string, options?: CounterexampleOptions) => {
  const g = parse(text);
  return tables(g).map(({ automaton, table }) => {
    const finder = createCounterexampleFinder(g, automaton, options);
    return {
      variant: automaton.variant,
      automaton,
      table,
      g,
      results: table.conflicts.map(c => ({ c, cx: finder.forConflict(c)! })),
      lecture: table.fConflicts.map(c => ({ c, cx: finder.forConflict(c)! }))
    };
  });
};

describe('LR conflict counterexamples (Isradisaikul & Myers 2015)', () => {
  it('dangling else: a unifying counterexample — one word, two trees, parting at the else conflict', () => {
    const all = counterexamples('S -> if c then S | if c then S else S | other');
    for (const v of all.filter(v => v.variant !== 'LR(0)')) {
      const elseConflicts = v.results.filter(r => r.c.symbol === 'else');
      expect(elseConflicts.length, v.variant).toBe(1);
      const { c, cx } = elseConflicts[0];
      expect(c.type).toBe('Shift/Reduce');
      expect(cx.kind, v.variant).toBe('unifying');
      if (cx.kind !== 'unifying') continue;
      expect(cx.word.join(' ')).toBe('if c then if c then other else other');
      expect(cx.word[cx.dot]).toBe('else');
      expect(check(v.g, v.automaton, c, cx)).toEqual([]);
    }
  });

  it('E → E + E | E * E | a: every conflict of every table has a valid unifying counterexample', () => {
    for (const v of counterexamples('E -> E "+" E | E "*" E | a')) {
      for (const { c, cx } of [...v.results, ...v.lecture]) {
        // LR(0) also conflicts in E' → E • (accept) with the shifts of + and *: not an ambiguity.
        if (!c.actions.some(x => x.type === 'accept')) expect(cx.kind, `${v.variant} ${c.stateId} ${c.symbol}`).toBe('unifying');
        expect(check(v.g, v.automaton, c, cx)).toEqual([]);
      }
    }
  });

  it('an LR(1) grammar that is not LALR(1): non-unifying, two different prefixes into the merged state', () => {
    const all = counterexamples('S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c');
    const lr1 = all.find(v => v.variant === 'LR(1)')!;
    expect(lr1.results).toEqual([]);
    const lalr = all.find(v => v.variant === 'LALR(1)')!;
    expect(lalr.results.length).toBe(2);
    for (const { c, cx } of lalr.results) {
      expect(c.type).toBe('Reduce/Reduce');
      expect(cx.kind).toBe('nonunifying');
      if (cx.kind !== 'nonunifying') continue;
      expect(cx.samePrefix).toBe(false);
      expect(cx.derivations.every(d => d.lookaheadInContext)).toBe(true);
      expect(cx.derivations.map(d => d.form.slice(0, d.dot).join(' ')).sort()).toEqual(['a c', 'b c']);
      expect(check(lalr.g, lalr.automaton, c, cx)).toEqual([]);
    }
  });

  it('an LALR(1) grammar that is not SLR(1): the reduce lookahead is only in FOLLOW, not in the context', () => {
    const all = counterexamples('S -> L "=" R | R\nL -> "*" R | id\nR -> L');
    const slr = all.find(v => v.variant === 'SLR(1)')!;
    expect(all.find(v => v.variant === 'LALR(1)')!.results).toEqual([]);
    expect(slr.results.length).toBe(1);
    const { c, cx } = slr.results[0];
    expect(cx.kind).toBe('nonunifying');
    if (cx.kind !== 'nonunifying') return;
    const reduce = cx.derivations.find(d => d.action.type === 'reduce')!;
    const shift = cx.derivations.find(d => d.action.type === 'shift')!;
    expect(reduce.lookaheadInContext).toBe(false);
    expect(reduce.followWitness).toBeDefined();
    expect(shift.form.slice(0, shift.dot)).toEqual(['L']);
    expect(cx.samePrefix).toBe(true);
    expect(check(slr.g, slr.automaton, c, cx)).toEqual([]);
  });

  it('every reported derivation is valid (random grammars, all five tables, both layouts)', async () => {
    const failures: string[] = [];
    let unifying = 0;
    let nonunifying = 0;
    for (let seed = 1; seed <= 400 && failures.length < 5; seed++) {
      if (seed % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const text = randomGrammarText(seed);
      const g = parseGrammar(text).grammar;
      if (!g) continue;
      for (const v of counterexamples(text, { maxLength: 6, maxForms: 4000 })) {
        for (const { c, cx } of [...v.results, ...v.lecture]) {
          if (!cx) {
            // Only symbols that generate no word can keep the conflict items out of every derivation.
            if (isReduced(g)) failures.push(`seed ${seed} ${v.variant} ${c.stateId}/${c.symbol}: none`);
            continue;
          }
          if (cx.kind === 'unifying') unifying++;
          else nonunifying++;
          const problems = check(g, v.automaton, c, cx);
          if (problems.length) failures.push(`seed ${seed} [${text.replace(/\n/g, '; ')}] ${v.variant} ${c.stateId}/${c.symbol} ${cx.kind}: ${problems.slice(0, 3).join(', ')}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(unifying).toBeGreaterThan(50);
    expect(nonunifying).toBeGreaterThan(50);
  });

  it('preset grammars: every conflict of the LR(0), SLR(1) and LALR(1) tables gets a valid counterexample with the default bounds', async () => {
    const failures: string[] = [];
    for (const preset of PRESET_GRAMMARS) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const parsed = parseGrammar(preset.grammarText);
      if (!parsed.grammar || parsed.errors.length) continue;
      const g = parsed.grammar;
      const analysis = analyzeGrammar(g);
      for (const automaton of [buildLR0Automaton(g), buildLALR1Automaton(g, analysis)]) {
        const variants = automaton.variant === 'LR(0)' ? [automaton, buildSLR1Automaton(g, analysis)] : [automaton];
        for (const a of variants) {
          const table = buildLRTable(a, g, analysis, { usePrecedence: false });
          const finder = createCounterexampleFinder(g, a);
          const started = Date.now();
          for (const c of [...table.conflicts.slice(0, 12), ...table.fConflicts.slice(0, 12)]) {
            const cx = finder.forConflict(c);
            if (!cx) {
              if (isReduced(g)) failures.push(`${preset.id} ${a.variant} ${c.stateId}/${c.symbol}: none`);
              continue;
            }
            const problems = check(g, a, c, cx);
            if (problems.length) failures.push(`${preset.id} ${a.variant} ${c.stateId}/${c.symbol} ${cx.kind}: ${problems.slice(0, 3).join(', ')}`);
          }
          if (Date.now() - started > 8000) failures.push(`${preset.id} ${a.variant}: ${Date.now() - started} ms`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/** Where the LR parses of two trees of the same word part: (state, lookahead, the two actions), replayed independently. */
function partingCell(g: Grammar, a: LRAutomaton, word: string[], p1: number[], p2: number[]) {
  const s1 = actions(g, p1);
  const s2 = actions(g, p2);
  let i = 0;
  while (i < s1.length && i < s2.length && s1[i] === s2[i]) i++;
  if (i >= s1.length || i >= s2.length) return null;
  const stack = [0];
  let read = 0;
  for (const act of s1.slice(0, i)) {
    let to: number | undefined;
    if (act.startsWith('s:')) to = a.states[stack[stack.length - 1]].transitions.get(word[read++]);
    else {
      const p = g.productions.find(q => `r${q.id}` === act)!;
      stack.length -= p.rhs.length;
      to = a.states[stack[stack.length - 1]].transitions.get(p.lhs);
    }
    if (to === undefined) return null;
    stack.push(to);
  }
  const key = (x: string) => (x.startsWith('s:') ? 's' : x);
  return { state: stack[stack.length - 1], la: read < word.length ? word[read] : END_MARKER, acts: [key(s1[i]), key(s2[i])] };
}

describe('LR conflict counterexamples: review §34', () => {
  it('a conflict reached only by another pair of trees of a witness word is unifying (S → c A A, A → A A | A c | a)', () => {
    for (const v of counterexamples('S -> c A A\nA -> A A | A c | a')) {
      // LR(0) and SLR(1) also have conflicts that only their approximation causes
      if (v.variant === 'LR(0)' || v.variant === 'SLR(1)') continue;
      expect(v.results.length, v.variant).toBeGreaterThan(0);
      for (const { c, cx } of v.results) {
        expect(cx.kind, `${v.variant} ${c.stateId}/${c.symbol}`).toBe('unifying');
        expect(check(v.g, v.automaton, c, cx)).toEqual([]);
        if (cx.kind === 'unifying') expect(testMembership(v.g, cx.word).treeCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('preset earley_equal_ab: every LALR(1) conflict is unifying', () => {
    const preset = PRESET_GRAMMARS.find(p => p.id === 'earley_equal_ab')!;
    const lalr = counterexamples(preset.grammarText).find(v => v.variant === 'LALR(1)')!;
    expect(lalr.results.length).toBeGreaterThan(0);
    for (const { c, cx } of lalr.results) {
      expect(cx.kind, `${c.stateId}/${c.symbol}`).toBe('unifying');
      expect(check(lalr.g, lalr.automaton, c, cx)).toEqual([]);
    }
  });

  it('LR(0) in the Dragon layout: a reduce/reduce conflict is unifying in every column of the state', () => {
    const lr0 = counterexamples('S -> A | B\nA -> a\nB -> a').find(v => v.variant === 'LR(0)')!;
    expect(lr0.results.map(r => r.c.symbol).sort()).toEqual([END_MARKER, 'a'].sort());
    for (const { c, cx } of [...lr0.results, ...lr0.lecture]) {
      expect(cx.kind, `${c.stateId}/${c.symbol}`).toBe('unifying');
      expect(check(lr0.g, lr0.automaton, c, cx)).toEqual([]);
    }
    // an unambiguous grammar stays non-unifying in every column
    const other = counterexamples('S -> A x | B y\nA -> a\nB -> a').find(v => v.variant === 'LR(0)')!;
    expect(other.results.length).toBeGreaterThan(0);
    for (const { c, cx } of other.results) {
      expect(cx.kind).toBe('nonunifying');
      expect(check(other.g, other.automaton, c, cx)).toEqual([]);
    }
  });

  it('a non-unifying counterexample of a finished search: no ambiguous word up to the bound parts at the conflict (brute force, random grammars)', async () => {
    const L = 5;
    const failures: string[] = [];
    let checked = 0;
    for (let seed = 1; seed <= 150 && failures.length < 5; seed++) {
      if (seed % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const text = randomGrammarText(seed);
      const g = parseGrammar(text).grammar;
      if (!g) continue;
      let ambiguous: { w: string[]; parses: number[][] }[] | undefined;
      for (const v of counterexamples(text, { maxLength: L, maxForms: 60000 })) {
        for (const { c, cx } of [...v.results, ...v.lecture]) {
          if (!cx || cx.kind !== 'nonunifying' || cx.searchExhausted) continue;
          if (!ambiguous) {
            ambiguous = [];
            for (const w of wordsUpTo([...g.terminals], L)) {
              if (!accepts(g, w)) continue;
              const m = testMembership(g, w, 30);
              if (m.treeCount >= 2) ambiguous.push({ w, parses: m.trees.map(t => t.leftParse) });
            }
          }
          checked++;
          const wanted = new Set(c.actions.map(x => (x.type === 'reduce' ? `r${x.production!.id}` : x.type === 'accept' ? 'acc' : 's')));
          const anyColumn = c.symbol === LR0_ACTION_COLUMN || (v.variant === 'LR(0)' && c.actions.every(x => x.type === 'reduce'));
          for (const { w, parses } of ambiguous) {
            let hit = false;
            for (let x = 0; x < parses.length && !hit; x++) {
              for (let y = x + 1; y < parses.length && !hit; y++) {
                const cell = partingCell(g, v.automaton, w, parses[x], parses[y]);
                hit = !!cell && cell.state === c.stateId && (anyColumn || cell.la === c.symbol) && cell.acts.every(z => wanted.has(z));
              }
            }
            if (hit) {
              failures.push(`seed ${seed} [${text.replace(/\n/g, '; ')}] ${v.variant} ${c.stateId}/${c.symbol}: '${w.join(' ')}' parts there`);
              break;
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  }, 120000);
});
