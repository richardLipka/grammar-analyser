/**
 * LR tables in the layout of the KIV/FJP lectures (Ježek, "11 a 12 LR"):
 * states named by their entry symbols, a table of actions f and a table of
 * transitions g, strict LR(0). The expected rows are copied from the lecture.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable, formatLectureAction, LR0_ACTION_COLUMN, LRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { exportLRTableToLatex } from '../core/export/latexExport';

const G11 = 'S -> B\nB -> a B b | A\nA -> b A | c';
const G12 = 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a';
const G13 = 'S -> S ( A ) | ε\nA -> a';
const G14 = 'S -> L = R | R\nL -> * R | a\nR -> L';

const tables = (text: string) => {
  const g = parseGrammar(text).grammar!;
  const a = analyzeGrammar(g);
  return {
    g,
    lr0: buildLRTable(buildLR0Automaton(g, 'LR(0)'), g, a),
    slr: buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a),
    lalr: buildLRTable(buildLALR1Automaton(g, a), g, a),
    lr1: buildLRTable(buildLR1Automaton(g, a), g, a)
  };
};

const names = (t: LRTable) => t.states.map(s => t.stateNames[s].text);
const byName = (t: LRTable, name: string) => t.states.find(s => t.stateNames[s].text === name)!;

/** Row of the lecture table: f entries (P / R i / A) and g entries (target names), empty cells left out. */
const lectureRow = (t: LRTable, name: string) => {
  const s = byName(t, name);
  const f: Record<string, string> = {};
  for (const col of t.fColumns) {
    const acts = t.fTable.get(s)!.get(col) || [];
    if (acts.length) f[col] = acts.map(a => formatLectureAction(a, 'cz')).join('/');
  }
  const g: Record<string, string> = {};
  for (const [sym, target] of t.gTable.get(s)!) g[sym] = t.stateNames[target].text;
  return { f, g };
};

describe('State names (entry symbol, subscript when repeated, # for the initial state)', () => {
  it('names the states of G12 and G14 as in the lecture', () => {
    expect(names(tables(G12).slr)).toEqual(['#', 'E₁', 'T₁', 'F₁', '(', 'a', '+', '*', 'E₂', 'T₂', 'F₂', ')']);
    expect(names(tables(G14).lalr)).toEqual(['#', 'S', 'L₁', 'R₁', '*', 'a', '=', 'L₂', 'R₂', 'R₃']);
    expect(names(tables(G13).slr)).toEqual(['#', 'S', '(', 'A', 'a', ')']);
  });

  it('gives LALR(1) the names of LR(0) and numbers the extra LR(1) states', () => {
    const t = tables(G14);
    expect(names(t.lalr)).toEqual(names(t.lr0));
    expect(names(t.lr1)).toEqual(['#', 'S', 'L₁', 'R₁', '*₁', 'a₁', '=', 'L₂', 'R₂', 'L₃', 'R₃', '*₂', 'a₂', 'R₄']);
  });

  it('keeps the subscript apart from symbols that end with a digit', () => {
    const t = tables('S -> A1 1 | 1 1\nA1 -> 1').slr;
    expect(names(t)).toContain('1₁');
    expect(names(t)).toContain('A1');
  });
});

describe('Lecture tables f and g', () => {
  it('builds the SLR(1) table of G12 (lecture page 12)', () => {
    const t = tables(G12).slr;
    expect(t.gColumns).toEqual(['+', '*', '(', ')', 'a', 'E', 'T', 'F']);
    expect(lectureRow(t, '#')).toEqual({ f: { '(': 'P', a: 'P' }, g: { E: 'E₁', T: 'T₁', F: 'F₁', '(': '(', a: 'a' } });
    expect(lectureRow(t, 'E₁')).toEqual({ f: { '+': 'P', $: 'A' }, g: { '+': '+' } });
    expect(lectureRow(t, 'T₁')).toEqual({ f: { '+': 'R2', '*': 'P', ')': 'R2', $: 'R2' }, g: { '*': '*' } });
    expect(lectureRow(t, 'E₂')).toEqual({ f: { '+': 'P', ')': 'P' }, g: { '+': '+', ')': ')' } });
    expect(lectureRow(t, 'T₂')).toEqual({ f: { '+': 'R1', '*': 'P', ')': 'R1', $: 'R1' }, g: { '*': '*' } });
    expect(lectureRow(t, ')').f).toEqual({ '+': 'R5', '*': 'R5', ')': 'R5', $: 'R5' });
  });

  it('builds the LALR(1) table of G14 (lecture page 19), where SLR(1) has a conflict', () => {
    const t = tables(G14);
    expect(lectureRow(t.lalr, 'L₁')).toEqual({ f: { '=': 'P', $: 'R5' }, g: { '=': '=' } });
    expect(lectureRow(t.lalr, 'R₂').f).toEqual({ '=': 'R3', $: 'R3' });
    expect(lectureRow(t.lalr, '=').g).toEqual({ L: 'L₂', R: 'R₃', '*': '*', a: 'a' });
    expect(t.slr.fConflicts.map(c => [t.slr.stateNames[c.stateId].text, c.symbol])).toEqual([['L₁', '=']]);
  });

  it('gives LR(0) one action per state (lecture page 8, G11)', () => {
    const t = tables(G11).lr0;
    expect(t.fColumns).toEqual([LR0_ACTION_COLUMN]);
    const f = Object.fromEntries(t.states.map(s => [t.stateNames[s].text, lectureRow(t, t.stateNames[s].text).f[LR0_ACTION_COLUMN]]));
    // The lecture numbers the two b states the other way round (it indexes the occurrences of b in the rules)
    expect(f).toEqual({ '#': 'P', S: 'A', 'B₁': 'R1', 'A₁': 'R3', a: 'P', 'b₁': 'P', c: 'R5', 'B₂': 'P', 'A₂': 'R4', 'b₂': 'R2' });
    expect(t.isConflictFree).toBe(true);
  });
});

describe('Strict LR(0)', () => {
  it('counts S\' → S• as a complete item: S → S a | b is not LR(0)', () => {
    const t = tables('S -> S a | b').lr0;
    expect(t.isConflictFree).toBe(false);
    expect(t.fConflicts).toHaveLength(1);
    expect(t.stateNames[t.fConflicts[0].stateId].text).toBe('S');
    expect(t.fConflicts[0].actions.map(a => a.type)).toEqual(['shift', 'accept']);
    // The Dragon Book layout shows the same conflict in the cell [S, a]
    expect(t.conflicts.map(c => c.symbol)).toEqual(['a']);
  });

  it('finds the conflicts of G13 and of the expression grammar in the lecture\'s states', () => {
    const g13 = tables(G13).lr0;
    expect(g13.fConflicts.map(c => g13.stateNames[c.stateId].text)).toEqual(['S']);
    const g12 = tables(G12).lr0;
    expect(g12.fConflicts.map(c => g12.stateNames[c.stateId].text)).toEqual(['E₁', 'T₁', 'T₂']);
  });
});

describe('Lecture simulation (f, then g for the pushed symbol)', () => {
  it('parses a + a * a with the SLR(1) table of G12 (lecture page 14)', () => {
    const t = tables(G12).slr;
    const sim = simulateLRParse(['a', '+', 'a', '*', 'a'], tables(G12).g, t, 'lecture');
    expect(sim.accepted).toBe(true);
    const stacks = sim.steps.map(s => s.stateStack.map(id => t.stateNames[id].text).join(''));
    expect(stacks.slice(0, 5)).toEqual(['#', '#a', '#F₁', '#T₁', '#E₁']);
    expect(sim.steps[sim.steps.length - 1].rightParse).toEqual([6, 4, 2, 6, 4, 6, 3, 1]);
    // A shift looks up f, then g on the terminal read
    expect(sim.steps[0]).toMatchObject({ lookupSymbol: 'a', gotoSymbol: 'a', gotoFromState: 0 });
    expect(sim.steps[0].actionCz).toBe('Přesun \'a\', g(#, a) = a');
  });

  it('runs LR(0) by the state alone (lecture page 4, G11, a b c b)', () => {
    const { g, lr0 } = tables(G11);
    const sim = simulateLRParse(['a', 'b', 'c', 'b'], g, lr0, 'lecture');
    expect(sim.accepted).toBe(true);
    expect(sim.steps.every(s => s.lookupSymbol === LR0_ACTION_COLUMN)).toBe(true);
    expect(sim.steps[sim.steps.length - 1].rightParse).toEqual([5, 4, 3, 2, 1]);
    const stacks = sim.steps.map(s => s.stateStack.map(id => lr0.stateNames[id].text).join(' '));
    expect(stacks).toContain('# a b₁ A₂');
    expect(stacks).toContain('# a B₂ b₂');
  });

  it('rejects when accept is reached before the end of the input', () => {
    const { g, lr0 } = tables('S -> a');
    const sim = simulateLRParse(['a', 'a'], g, lr0, 'lecture');
    expect(sim.accepted).toBe(false);
    expect(sim.steps[sim.steps.length - 1].actionCz).toContain('vstup není přečten');
    // the Dragon Book table gives the same verdict
    expect(simulateLRParse(['a', 'a'], g, lr0, 'dragon').accepted).toBe(false);
    expect(simulateLRParse(['a'], g, lr0, 'lecture').accepted).toBe(true);
  });

  it('reports an empty g entry after a shift', () => {
    const { g, lr0 } = tables(G11);
    const sim = simulateLRParse(['b', 'a'], g, lr0, 'lecture');
    expect(sim.accepted).toBe(false);
    expect(sim.steps[sim.steps.length - 1].actionCz).toContain('g(b₁, a) je prázdná položka');
  });
});

describe('LaTeX in the lecture layout', () => {
  it('writes f and g with the state names', () => {
    const latex = exportLRTableToLatex(tables(G12).slr, 'cz', 'lecture');
    expect(latex).toContain('Akce $f$');
    expect(latex).toContain('Přechody $g$');
    expect(latex).toContain('$\\#$');
    expect(latex).toContain('$\\mathit{E}_{1}$');
    expect(latex).toContain('R2');
    const dragon = exportLRTableToLatex(tables(G12).slr, 'en', 'dragon');
    expect(dragon).toContain('ACTION');
    expect(dragon).toContain('s5');
  });
});
