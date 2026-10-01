/**
 * Regression tests for formal correctness: parser edge cases, LL/LR
 * classification of the presets, and language preservation of every
 * transformation (checked with an Earley recognizer on all short words).
 */
import { describe, it, expect } from 'vitest';
import { Grammar, Production, formatGrammarForEditor, END_MARKER } from '../core/ast/grammar';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar, computeNullable, computeLeftRecursion } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import { buildLR0Automaton, buildLR1Automaton, buildLALR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  convertToChomsky,
  convertToGreibach,
  applySymbolTransformation,
  getAvailableTransformationsForSymbol
} from '../core/processor/grammarProcessor';
import { generateWords, generateRandomDerivation } from '../core/generator/wordGenerator';
import { exportSetsToLatex, exportParseTreeToTikz } from '../core/export/latexExport';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

const rules = (g: Grammar) => g.productions.map(p => `${p.lhs} -> ${p.rhs.join(' ')}`.trim());

/** Earley recognizer (with the Aycock–Horspool nullable fix) for any CFG. */
function accepts(g: Grammar, word: string[]): boolean {
  const nullable = computeNullable(g);
  const aug: Production = { id: -1, lhs: '\u0000', rhs: [g.startSymbol] };
  type Item = { p: Production; dot: number; origin: number };
  const chart: Item[][] = Array.from({ length: word.length + 1 }, () => []);
  const keys: Set<string>[] = Array.from({ length: word.length + 1 }, () => new Set());
  const add = (i: number, it: Item) => {
    const key = `${it.p.id}|${it.p.lhs}|${it.dot}|${it.origin}`;
    if (!keys[i].has(key)) {
      keys[i].add(key);
      chart[i].push(it);
    }
  };
  add(0, { p: aug, dot: 0, origin: 0 });
  for (let i = 0; i <= word.length; i++) {
    for (let k = 0; k < chart[i].length; k++) {
      const it = chart[i][k];
      if (it.dot < it.p.rhs.length) {
        const X = it.p.rhs[it.dot];
        if (g.nonTerminals.has(X)) {
          for (const q of g.productions) if (q.lhs === X) add(i, { p: q, dot: 0, origin: i });
          if (nullable.has(X)) add(i, { p: it.p, dot: it.dot + 1, origin: it.origin });
        } else if (i < word.length && word[i] === X) {
          add(i + 1, { p: it.p, dot: it.dot + 1, origin: it.origin });
        }
      } else {
        for (const w of chart[it.origin]) {
          if (w.dot < w.p.rhs.length && w.p.rhs[w.dot] === it.p.lhs) {
            add(i, { p: w.p, dot: w.dot + 1, origin: w.origin });
          }
        }
      }
    }
  }
  return keys[word.length].has(`-1|\u0000|1|0`);
}

function wordsUpTo(alphabet: string[], n: number): string[][] {
  const result: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let len = 1; len <= n; len++) {
    layer = layer.flatMap(w => alphabet.map(a => [...w, a]));
    result.push(...layer);
  }
  return result;
}

function expectEquivalent(g1: Grammar, g2: Grammar, maxLen = 6) {
  const alphabet = [...new Set([...g1.terminals, ...g2.terminals])];
  for (const w of wordsUpTo(alphabet, maxLen)) {
    const a = accepts(g1, w);
    const b = accepts(g2, w);
    if (a !== b) {
      throw new Error(`L(G) and L(G') differ on '${w.join(' ') || 'ε'}': ${a} vs ${b}\n${rules(g2).join('\n')}`);
    }
  }
}

describe('Parser edge cases', () => {
  it('keeps quoted "e" as a terminal (it is not ε)', () => {
    const g = parse('A -> "e" | "x"');
    expect(g.productions.map(p => p.rhs)).toEqual([['e'], ['x']]);
  });

  it('does not create an ε-rule from a Yacc terminator line', () => {
    const g = parse("expr : expr '+' term\n     | term\n     ;\nterm : 'id' ;");
    expect(rules(g)).toEqual(['expr -> expr + term', 'expr -> term', 'term -> id']);
  });

  it('reads # as ε when it forms a whole alternative and as a comment otherwise', () => {
    expect(rules(parse('S -> # | "a" S'))).toEqual(['S ->', 'S -> a S']);
    expect(rules(parse('S -> "a" S | #'))).toEqual(['S -> a S', 'S ->']);
    expect(rules(parse('S -> "a" # trailing comment'))).toEqual(['S -> a']);
  });

  it('does not treat a quoted "=" in a continuation line as a rule operator', () => {
    const g = parse('X -> "a"\n   | "b" "=" "c"');
    expect(rules(g)).toEqual(['X -> a', 'X -> b = c']);
  });

  it('reads a lone < as a terminal and <...> as a non-terminal', () => {
    const g = parse('E -> E < E | <Atom>\n<Atom> -> "id"');
    expect(rules(g)).toEqual(['E -> E < E', 'E -> Atom', 'Atom -> id']);
    expect(g.terminals.has('<')).toBe(true);
  });

  it('supports Unicode identifiers and the → arrow', () => {
    const g = parse('Výraz → Výraz "+" Člen | Člen\nČlen → "č"');
    expect(g.nonTerminals.has('Výraz')).toBe(true);
    expect(g.nonTerminals.has('Člen')).toBe(true);
    expect(g.terminals.has('č')).toBe(true);
  });

  it('reports undefined capitalized symbols, duplicates, $ and quoted/non-terminal clashes', () => {
    const r1 = parseGrammar('S -> A "b" | A "b"');
    expect(r1.errors).toEqual([]);
    expect(r1.warnings.some(w => w.message.includes("'A'"))).toBe(true);
    expect(r1.warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
    expect(r1.grammar!.productions).toHaveLength(1);

    expect(parseGrammar('S -> "a" "$"').errors.length).toBeGreaterThan(0);
    expect(parseGrammar('S -> "S" | "a"').errors.length).toBeGreaterThan(0);
  });

  it('round-trips grammars through the editor format', () => {
    const g = convertToChomsky(parse('S -> "(" S ")" S | "x" ":=" "y" | ε')).transformedGrammar;
    const again = parse(formatGrammarForEditor(g));
    expect(rules(again)).toEqual(rules(g));
    expect(again.startSymbol).toBe(g.startSymbol);
  });
});

describe('Analyser', () => {
  it('detects indirect and hidden left recursion', () => {
    const g = parse('S -> A "a" | "b"\nA -> A "c" | S "d" | ε\nB -> C B "x" | "y"\nC -> ε');
    const lr = computeLeftRecursion(g, computeNullable(g));
    expect([...lr.immediate]).toEqual(['A']);
    expect([...lr.indirect].sort()).toEqual(['B', 'S']);
  });

  it('detects cycles A =>+ A', () => {
    const a = analyzeGrammar(parse('S -> A | "a"\nA -> S'));
    expect([...a.cyclic].sort()).toEqual(['A', 'S']);
  });
});

describe('LL conflicts and LL(2)', () => {
  it('classifies a conflict between two FIRST sets as First/First even when A is nullable', () => {
    const g = parse('S -> A "b"\nA -> "a" "x" | "a" "y" | ε');
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.conflicts).toHaveLength(1);
    expect(t.conflicts[0].conflictType).toBe('First/First');
  });

  it('classifies a FIRST/FOLLOW clash as First/Follow', () => {
    const g = parse('S -> A "a"\nA -> "a" | ε');
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.conflicts[0].conflictType).toBe('First/Follow');
    expect(t.conflicts[0].reasons.find(r => r.production.rhs.length === 0)!.viaFollow).toBe(true);
  });

  it('distinguishes LL(2) from strong LL(2)', () => {
    const g = parse('S -> "a" A "a" "a" | "b" A "b" "a"\nA -> "b" | ε');
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.isLL1).toBe(false);
    expect(t.isStrongLL2).toBe(false);
    expect(t.isLL2).toBe(true);
  });

  it('rejects grammars that are not LL(2)', () => {
    const g = parse('S -> "a" "a" "b" | "a" "a" "c"');
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.isLL2).toBe(false);
    expect(t.ll2Conflicts[0].lookahead).toBe('a a');
  });
});

describe('Preset classification matches the descriptions', () => {
  const expected: Record<string, Partial<Record<'LL1' | 'LL2' | 'LR0' | 'SLR' | 'LALR' | 'LR1', boolean>>> = {
    arithmetic_unambiguous: { LL1: false, LR0: false, SLR: true, LALR: true, LR1: true },
    arithmetic_ll1: { LL1: true, SLR: true },
    dangling_else: { LL1: false, SLR: false, LALR: false, LR1: false },
    lr0_vs_slr1: { LR0: false, SLR: true },
    slr1_vs_lalr1: { SLR: false, LALR: true, LR1: true },
    lalr1_vs_lr1: { LALR: false, LR1: true },
    palindromes: { LL1: false, LR1: false },
    ll1_not_slr1: { LL1: true, SLR: false, LALR: true },
    ll2_not_strong: { LL1: false, LL2: true },
    strong_ll2: { LL1: false, LL2: true },
    format_kiv: { LL1: true, SLR: true },
    format_yacc: { LL1: false, SLR: true, LALR: true },
    format_antlr: { LL1: false, LL2: true, LALR: true }
  };

  for (const preset of PRESET_GRAMMARS) {
    it(`${preset.id}`, () => {
      const g = parse(preset.grammarText);
      const a = analyzeGrammar(g);
      const ll = buildLLTable(g, a);
      const actual = {
        LL1: ll.isLL1,
        LL2: ll.isLL2,
        LR0: buildLRTable(buildLR0Automaton(g, 'LR(0)'), g, a).isConflictFree,
        SLR: buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a).isConflictFree,
        LALR: buildLRTable(buildLALR1Automaton(g, a), g, a).isConflictFree,
        LR1: buildLRTable(buildLR1Automaton(g, a), g, a).isConflictFree
      };
      for (const [k, v] of Object.entries(expected[preset.id] || {})) {
        expect({ [k]: actual[k as keyof typeof actual] }).toEqual({ [k]: v });
      }
      // The sample word must belong to the language
      expect(accepts(g, preset.sampleInput.split(/\s+/).filter(Boolean))).toBe(true);
    });
  }
});

describe('Simulators', () => {
  it('records the LR configuration before each action', () => {
    const g = parse('E -> E "+" "id" | "id"');
    const a = analyzeGrammar(g);
    const sim = simulateLRParse(['id', '+', 'id'], g, buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a));
    expect(sim.accepted).toBe(true);
    for (const step of sim.steps) {
      expect(step.stateStack[step.stateStack.length - 1]).toBe(step.lookupState);
      expect(step.remainingInput[0]).toBe(step.lookupSymbol);
    }
    expect(sim.steps[0].stateStack).toEqual([0]);
    expect(sim.steps[0].remainingInput).toEqual(['id', '+', 'id', END_MARKER]);
    // The forest after the second shift holds E and '+'
    expect(sim.steps[2].tree?.isForestRoot).toBe(true);
  });

  it('parses long LL(1) inputs without hitting the step bound', () => {
    const g = parse('L -> "x" L | ε');
    const tokens = Array.from({ length: 150 }, () => 'x');
    const sim = simulateLLParse(tokens, g, buildLLTable(g, analyzeGrammar(g)));
    expect(sim.accepted).toBe(true);
  });
});

describe('Transformations preserve the language', () => {
  const cases: Record<string, string> = {
    arithmetic: 'E -> E "+" T | T\nT -> T "*" F | F\nF -> "(" E ")" | "a"',
    epsilonChains: 'S -> A B C\nA -> "a" A | ε\nB -> "b" B | C\nC -> "c" | ε',
    indirectLR: 'S -> A "a" | "b"\nA -> A "c" | S "d" | ε',
    startOnRhs: 'S -> "a" S "b" | S S | ε',
    primedNames: "E -> T E'\nE' -> \"+\" T E' | ε\nT -> \"a\" | ε",
    onlyLeftRecursive: 'S -> "a" | A\nA -> A "b"',
    useless: 'S -> "a" A | "b"\nA -> "a"\nB -> "b" B\nC -> "c"',
    nullableViaChain: 'S -> A "b" | B\nB -> A\nA -> "a" | ε',
    cycle: 'S -> A | "a"\nA -> S | "b"'
  };

  const constructions = {
    reduceGrammar,
    removeEpsilonRules,
    removeUnitRules,
    removeLeftRecursion,
    leftFactorGrammar,
    convertToChomsky,
    convertToGreibach
  };

  for (const [name, text] of Object.entries(cases)) {
    for (const [cname, fn] of Object.entries(constructions)) {
      it(`${cname} on ${name}`, () => {
        const g = parse(text);
        const res = fn(g);
        expectEquivalent(g, res.transformedGrammar, 5);
      });
    }
  }

  it('ε-elimination never merges the new start symbol with an existing E\'', () => {
    const g = parse(cases.primedNames);
    const res = removeEpsilonRules(g).transformedGrammar;
    expect(res.productions.filter(p => p.rhs.length === 0).every(p => p.lhs === res.startSymbol)).toBe(true);
    expect(res.productions.some(p => p.rhs.includes(res.startSymbol))).toBe(false);
  });

  it('left recursion removal leaves no left recursion', () => {
    for (const text of [cases.arithmetic, cases.indirectLR, cases.startOnRhs, cases.onlyLeftRecursive, cases.cycle]) {
      const res = removeLeftRecursion(parse(text)).transformedGrammar;
      const lr = computeLeftRecursion(res, computeNullable(res));
      expect([...lr.immediate, ...lr.indirect]).toEqual([]);
    }
  });

  it('CNF output has only A -> B C, A -> a and S -> ε rules', () => {
    for (const text of Object.values(cases)) {
      const g = convertToChomsky(parse(text)).transformedGrammar;
      for (const p of g.productions) {
        const ok = (p.rhs.length === 2 && p.rhs.every(s => g.nonTerminals.has(s)))
          || (p.rhs.length === 1 && g.terminals.has(p.rhs[0]))
          || (p.rhs.length === 0 && p.lhs === g.startSymbol && !g.productions.some(q => q.rhs.includes(g.startSymbol)));
        expect(ok, `${p.lhs} -> ${p.rhs.join(' ')}`).toBe(true);
      }
    }
  });

  it('GNF output has only A -> a α (α ∈ N*) and S -> ε rules', () => {
    for (const text of Object.values(cases)) {
      const g = convertToGreibach(parse(text)).transformedGrammar;
      for (const p of g.productions) {
        const ok = (p.rhs.length > 0 && g.terminals.has(p.rhs[0]) && p.rhs.slice(1).every(s => g.nonTerminals.has(s)))
          || (p.rhs.length === 0 && p.lhs === g.startSymbol && !g.productions.some(q => q.rhs.includes(g.startSymbol)));
        expect(ok, `${p.lhs} -> ${p.rhs.join(' ')}`).toBe(true);
      }
    }
  });

  it('every per-symbol transformation preserves the language', () => {
    for (const text of Object.values(cases)) {
      const g = parse(text);
      for (const nt of g.nonTerminals) {
        for (const tr of getAvailableTransformationsForSymbol(g, nt)) {
          const res = applySymbolTransformation(g, nt, tr.id).transformedGrammar;
          expectEquivalent(g, res, 5);
        }
      }
    }
  });

  it('eliminating A -> ε keeps ε derivable through B -> A', () => {
    const g = parse(cases.nullableViaChain);
    const res = applySymbolTransformation(g, 'A', 'eliminateEpsilon').transformedGrammar;
    expect(accepts(res, [])).toBe(true);
    expect(res.productions.some(p => p.lhs === 'A' && p.rhs.length === 0)).toBe(false);
  });

  it('recomputes terminals after removing rules', () => {
    const g = parse('S -> "a"\nU -> "z"');
    const res = applySymbolTransformation(g, 'U', 'removeUnreachable').transformedGrammar;
    expect([...res.terminals]).toEqual(['a']);
  });
});

describe('Word generator', () => {
  it('only produces words of the language and terminates on recursive grammars', () => {
    const g = parse('S -> S S | "(" S ")" | ε');
    for (const trace of generateWords(g, 6, 12)) {
      expect(accepts(g, trace.tokens)).toBe(true);
    }
    for (let i = 0; i < 20; i++) {
      const trace = generateRandomDerivation(g, 30);
      expect(trace).not.toBeNull();
      expect(accepts(g, trace!.tokens)).toBe(true);
    }
  });

  it('returns no words for an empty language', () => {
    expect(generateWords(parse('S -> "a" S'), 3)).toEqual([]);
  });
});

describe('LaTeX export', () => {
  it('typesets ε in math mode and braces forest nodes', () => {
    const g = parse('S -> "a" S | ε');
    const sets = exportSetsToLatex(g, analyzeGrammar(g));
    // FIRST₁(S) = { ε, a }: ε must be inside math mode
    expect(sets).toContain('$\\{\\varepsilon,\\ \\mathtt{a}\\}$');
    const tree = exportParseTreeToTikz({
      id: 'r', symbol: 'S', isTerminal: false,
      children: [{ id: 'c', symbol: ',', isTerminal: true }, { id: 'e', symbol: 'ε', isTerminal: true }]
    });
    expect(tree).toContain('[{$\\mathtt{,}$}]');
    expect(tree).toContain('[{$\\varepsilon$}]');
  });
});

describe('LL(2) parsing', () => {
  it('parses the strong LL(2) grammar G8 (KIV/FJP) with the table M[A, xy]', () => {
    const preset = PRESET_GRAMMARS.find(p => p.id === 'strong_ll2')!;
    const g = parse(preset.grammarText);
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.isStrongLL2).toBe(true);
    expect(t.ll2Table!.get('S')!.get('a b')!.map(p => p.rhs.join(' '))).toEqual(['a b A']);
    expect(t.ll2Table!.get('S')!.get('a a')!.map(p => p.rhs.length)).toEqual([0]);
    const sim = simulateLLParse(['a', 'b', 'a', 'b', 'b', 'a', 'a'], g, t, undefined, { k: 2, tables: 'strong' });
    expect(sim.accepted).toBe(true);
    // left parse as in the lecture: (ababbaa, S#) |- (ababbaa, abA#, 2) ...
    expect(sim.steps[sim.steps.length - 1].leftParse[0]).toBe(g.productions.find(p => p.rhs.join(' ') === 'a b A')!.id);
    expect(simulateLLParse(['a', 'b', 'a'], g, t, undefined, { k: 2, tables: 'strong' }).accepted).toBe(false);
  });

  it('parses a non-strong LL(2) grammar with the tables T(A, L)', () => {
    const g = parse('S -> "a" A "a" "a" | "b" A "b" "a"\nA -> "b" | ε');
    const t = buildLLTable(g, analyzeGrammar(g));
    expect(t.isStrongLL2).toBe(false);
    expect(t.ll2Tables.length).toBe(3);
    for (const [w, ok] of [['a b a a', true], ['a a a', true], ['b b b a', true], ['b b a', true], ['b a a', false]] as const) {
      const sim = simulateLLParse(w.split(' '), g, t, undefined, { k: 2, tables: 'contexts' });
      expect(sim.accepted, w).toBe(ok);
      expect(sim.steps.some(s => s.conflictCount)).toBe(false);
    }
  });

  it('records the right parse of the LR simulation', () => {
    const g = parse('E -> E "+" "id" | "id"');
    const a = analyzeGrammar(g);
    const sim = simulateLRParse(['id', '+', 'id'], g, buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a));
    expect(sim.steps[sim.steps.length - 1].rightParse).toEqual([2, 1]);
  });
});
