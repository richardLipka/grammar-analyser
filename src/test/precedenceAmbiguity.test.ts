/**
 * Yacc precedence in grammar definitions, its use in the LR tables, the
 * ambiguity search, the tokenizer of simulator input and the LaTeX of symbols.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar, formatGrammarForEditor, transferPrecedence } from '../core/ast/grammar';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { findAmbiguity } from '../core/analyser/ambiguity';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { latexSymbol, exportGrammarToLatex } from '../core/export/latexExport';
import { eliminateImmediateLeftRecursionForSymbol, removeUnitRules, splitFollowForOccurrence } from '../core/processor/grammarProcessor';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { DerivationNode } from '../core/generator/wordGenerator';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

/**
 * Number of derivation trees of a word, saturated at 2 (independent of the
 * search): counts for every non-terminal and span, iterated to a fixpoint so
 * that ε-rules and unit cycles (infinitely many trees) end at 2.
 */
function treeCount(g: Grammar, w: string[]): number {
  const n = w.length;
  const cnt = new Map<string, number>();
  const get = (A: string, i: number, j: number) => cnt.get(`${A}|${i}|${j}`) ?? 0;
  // trees of a symbol sequence over w[i..j)
  const seq = (rhs: string[], i: number, j: number): number => {
    if (rhs.length === 0) return i === j ? 1 : 0;
    const [X, ...rest] = rhs;
    let total = 0;
    for (let k = i; k <= j; k++) {
      const head = g.nonTerminals.has(X) ? get(X, i, k) : k === i + 1 && w[i] === X ? 1 : 0;
      if (head === 0) continue;
      total = Math.min(2, total + head * seq(rest, k, j));
      if (total >= 2) return 2;
    }
    return total;
  };
  for (let len = 0; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len;
      for (let changed = true; changed; ) {
        changed = false;
        for (const A of g.nonTerminals) {
          let c = 0;
          for (const p of g.productions) if (p.lhs === A) c = Math.min(2, c + seq(p.rhs, i, j));
          if (c !== get(A, i, j)) {
            cnt.set(`${A}|${i}|${j}`, c);
            changed = true;
          }
        }
      }
    }
  }
  return get(g.startSymbol, 0, n);
}

/** Bracketed form of a tree: E(E(a) + E(a)) */
const bracket = (n: DerivationNode): string =>
  n.children && n.children.length > 0 ? `${n.symbol}(${n.children.map(bracket).join(' ')})` : n.symbol;

const EXPR = `%left + -
%left * /
%right ^
%right UMINUS
E -> E + E | E - E | E * E | E / E | E ^ E | - E %prec UMINUS | ( E ) | a`;

describe('Precedence declarations in the grammar', () => {
  it('reads %left / %right / %nonassoc lines and %prec in the textbook notation', () => {
    const res = parseGrammar(EXPR);
    expect(res.dialect).toBe('plain');
    expect(res.errors).toEqual([]);
    const g = res.grammar!;
    expect(g.precedence!.levels).toEqual([
      { assoc: 'left', symbols: ['+', '-'] },
      { assoc: 'left', symbols: ['*', '/'] },
      { assoc: 'right', symbols: ['^'] },
      { assoc: 'right', symbols: ['UMINUS'] }
    ]);
    const unary = g.productions.find(p => p.rhs.join(' ') === '- E')!;
    expect(g.precedence!.rulePrec.get(unary.id)).toBe('UMINUS');
    // UMINUS is only a precedence name, not a terminal of the grammar
    expect(g.terminals.has('UMINUS')).toBe(false);
  });

  it('reads quoted symbols, %nonassoc, and warns about %prec without a level', () => {
    const res = parseGrammar(`%nonassoc '<' '='\nS -> S "<" S | S "=" S | a %prec X`);
    expect(res.errors).toEqual([]);
    expect(res.grammar!.precedence!.levels).toEqual([{ assoc: 'nonassoc', symbols: ['<', '='] }]);
    expect(res.warnings.some(w => w.message.includes('%prec X'))).toBe(true);
  });

  it('keeps Yacc grammars with precedence in the Yacc dialect and reads their levels and %prec', () => {
    const res = parseGrammar(`%token NUM\n%left '+' '-'\n%left '*'\n%precedence NEG\n%%\nexp : exp '+' exp | exp '-' exp | exp '*' exp | '-' exp %prec NEG | NUM ;\n%%`);
    expect(res.dialect).toBe('yacc');
    const g = res.grammar!;
    expect(g.precedence!.levels.map(l => l.assoc)).toEqual(['left', 'left', 'precedence']);
    const neg = g.productions.find(p => p.rhs.join(' ') === '- exp')!;
    expect(g.precedence!.rulePrec.get(neg.id)).toBe('NEG');
  });

  it('writes the declarations back to the editor and reads them again', () => {
    const g = parse(EXPR);
    const text = formatGrammarForEditor(g);
    expect(text.split('\n').slice(0, 4)).toEqual(['%left + -', '%left * /', '%right ^', '%right "UMINUS"']);
    expect(text).toContain('- E %prec "UMINUS"');
    const back = parse(text);
    expect(back.precedence).toEqual(g.precedence);
    expect(back.productions).toEqual(g.productions);
  });

  it('keeps the precedence across a transformation (transferPrecedence)', () => {
    const g = parse('%left +\n%right U\nS -> T | - S %prec U | S + S\nT -> a');
    const t = removeUnitRules(g).transformedGrammar;
    const carried = transferPrecedence(g, t);
    expect(carried.precedence!.levels).toEqual(g.precedence!.levels);
    // S -> - S is still there, so it keeps %prec U
    const unary = carried.productions.find(p => p.lhs === 'S' && p.rhs.join(' ') === '- S')!;
    expect(carried.precedence!.rulePrec.get(unary.id)).toBe('U');
    expect(carried.precedence!.rulePrec.size).toBe(1);
    // A rule that changed (E -> - E becomes E -> - E E') loses %prec, the levels stay
    const e = parse(EXPR);
    const changed = transferPrecedence(e, eliminateImmediateLeftRecursionForSymbol(e, 'E').transformedGrammar);
    expect(changed.precedence!.levels.length).toBe(4);
  });
});

describe('Precedence in the LR tables', () => {
  const g = parse(EXPR);
  const a = analyzeGrammar(g);
  const tables = {
    SLR: buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a),
    LALR: buildLRTable(buildLALR1Automaton(g, a), g, a),
    LR1: buildLRTable(buildLR1Automaton(g, a), g, a)
  };

  it('resolves every shift/reduce conflict of the ambiguous expression grammar', () => {
    for (const t of Object.values(tables)) {
      expect(t.isConflictFree).toBe(true);
      expect(t.resolvedConflicts.length).toBeGreaterThan(0);
    }
    const raw = buildLRTable(buildLALR1Automaton(g, a), g, a, { usePrecedence: false });
    expect(raw.isConflictFree).toBe(false);
    expect(raw.resolvedConflicts).toEqual([]);
    expect(raw.conflicts.length).toBe(tables.LALR.resolvedConflicts.length);
  });

  it('builds the trees Bison builds: precedence, %left, %right and %prec', () => {
    const tree = (w: string) => {
      const r = simulateLRParse(w.split(' '), g, tables.LALR);
      expect(r.accepted).toBe(true);
      return bracket(r.finalTree!);
    };
    expect(tree('a + a * a')).toBe('E(E(a) + E(E(a) * E(a)))');
    expect(tree('a * a + a')).toBe('E(E(E(a) * E(a)) + E(a))');
    expect(tree('a - a - a')).toBe('E(E(E(a) - E(a)) - E(a))');
    expect(tree('a ^ a ^ a')).toBe('E(E(a) ^ E(E(a) ^ E(a)))');
    expect(tree('- a ^ a')).toBe('E(E(- E(a)) ^ E(a))');
    expect(tree('- a + a')).toBe('E(E(- E(a)) + E(a))');
  });

  it('explains every resolution', () => {
    const r = tables.LALR.resolvedConflicts.find(c => c.symbol === '*' && c.chosen?.type === 'shift')!;
    expect(r.reason.en).toContain("the token binds more strongly, shift");
    expect(r.reason.cz).toContain('přesun');
  });

  it('turns an equal %nonassoc precedence into an error', () => {
    const n = parse('%nonassoc <\nE -> E < E | a');
    const na = analyzeGrammar(n);
    const t = buildLRTable(buildLALR1Automaton(n, na), n, na);
    expect(t.isConflictFree).toBe(true);
    expect(t.resolvedConflicts.some(c => c.chosen === null)).toBe(true);
    expect(simulateLRParse(['a', '<', 'a'], n, t).accepted).toBe(true);
    expect(simulateLRParse(['a', '<', 'a', '<', 'a'], n, t).accepted).toBe(false);
  });

  it('leaves conflicts without precedence and LR(0) unresolved', () => {
    const ga = analyzeGrammar(g);
    expect(buildLRTable(buildLR0Automaton(g, 'LR(0)'), g, ga).resolvedConflicts).toEqual([]);
    const dangling = parse(PRESET_GRAMMARS.find(p => p.id === 'dangling_else')!.grammarText);
    const da = analyzeGrammar(dangling);
    expect(buildLRTable(buildLALR1Automaton(dangling, da), dangling, da).isConflictFree).toBe(false);
  });

  it('accepts exactly the language with the resolved tables (on words of the language)', () => {
    for (const w of ['a', 'a + a', '( a - a ) * a', '- - a ^ a', 'a / a / a']) {
      expect(accepts(g, w.split(' '))).toBe(true);
      for (const t of Object.values(tables)) expect(simulateLRParse(w.split(' '), g, t).accepted).toBe(true);
    }
  });
});

describe('Ambiguity search', () => {
  it('finds a word with two derivation trees', () => {
    const g = parse('E -> E + E | E * E | a');
    const r = findAmbiguity(g);
    expect(r.kind).toBe('ambiguous');
    if (r.kind !== 'ambiguous') return;
    expect(r.parses[0]).not.toEqual(r.parses[1]);
    expect(accepts(g, r.word)).toBe(true);
    // both trees yield the word and differ
    const yieldOf = (n: DerivationNode): string[] => (n.children ? n.children.flatMap(yieldOf) : n.isTerminal && n.symbol !== 'ε' ? [n.symbol] : []);
    expect(yieldOf(r.trees[0])).toEqual(r.word);
    expect(yieldOf(r.trees[1])).toEqual(r.word);
    expect(bracket(r.trees[0])).not.toBe(bracket(r.trees[1]));
  });

  it('finds the dangling else and cycles, and proves short words of unambiguous grammars', () => {
    const dangling = findAmbiguity(parse(PRESET_GRAMMARS.find(p => p.id === 'dangling_else')!.grammarText));
    expect(dangling.kind).toBe('ambiguous');
    expect(findAmbiguity(parse('S -> S | a')).kind).toBe('ambiguous');
    expect(findAmbiguity(parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a'), { maxLength: 7 })).toEqual({ kind: 'none-found', maxLength: 7 });
    expect(findAmbiguity(parse('S -> a S b | ε'), { maxLength: 8 }).kind).toBe('none-found');
  });

  it('agrees with counting parse trees by brute force on random grammars', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const g = parse(randomGrammarText(seed));
      const r = findAmbiguity(g, { maxLength: 4, maxForms: 50000 });
      if (r.kind === 'ambiguous') {
        expect(accepts(g, r.word), `seed ${seed}`).toBe(true);
        expect(r.parses[0], `seed ${seed}`).not.toEqual(r.parses[1]);
        if (r.word.length <= 6) expect(treeCount(g, r.word), `seed ${seed} '${r.word.join(' ')}'`).toBe(2);
      } else if (r.kind === 'none-found') {
        for (const w of wordsUpTo([...g.terminals], 4)) expect(treeCount(g, w), `seed ${seed} '${w.join(' ')}'`).toBeLessThan(2);
      }
      // An LR(1) grammar is unambiguous
      const a = analyzeGrammar(g);
      if (buildLRTable(buildLR1Automaton(g, a), g, a).isConflictFree) expect(r.kind, `seed ${seed}`).not.toBe('ambiguous');
    }
  });
});

describe('Simulator input', () => {
  it('splits words into terminals by longest match and reports what cannot be split', () => {
    expect(tokenizeInput('aabb', ['a', 'b'])).toEqual({ tokens: ['a', 'a', 'b', 'b'], split: true, unknown: [] });
    expect(tokenizeInput('id+id*id', ['id', '+', '*'])).toEqual({ tokens: ['id', '+', 'id', '*', 'id'], split: true, unknown: [] });
    expect(tokenizeInput('a a b', ['a', 'b'])).toEqual({ tokens: ['a', 'a', 'b'], split: false, unknown: [] });
    // longest match first, with backtracking: ab + c fails, a + bc works
    expect(tokenizeInput('abc', ['a', 'ab', 'bc']).tokens).toEqual(['a', 'bc']);
    expect(tokenizeInput('if x', ['if', 'then'])).toEqual({ tokens: ['if', 'x'], split: false, unknown: ['x'] });
    expect(tokenizeInput('', ['a']).tokens).toEqual([]);
  });
});

describe('LaTeX of symbols', () => {
  it('typesets subscripts, primes, accented names, arrows and special characters for pdfLaTeX', () => {
    expect(latexSymbol('B₂', false)).toBe('\\mathit{B}_{2}');
    expect(latexSymbol("E'", false)).toBe("\\mathit{E}'");
    expect(latexSymbol("A₁₀''", false)).toBe("\\mathit{A}_{10}''");
    expect(latexSymbol('Výraz', false)).toBe('\\text{\\textit{Výraz}}');
    expect(latexSymbol('→', true)).toBe('\\rightarrow{}');
    expect(latexSymbol('λx', true)).toBe('\\lambda{}\\mathtt{x}');
    expect(latexSymbol('a_b', true)).toBe('\\mathtt{a\\_b}');
    expect(latexSymbol('#', true)).toBe('\\mathtt{\\#}');
  });

  it('leaves no character pdfLaTeX cannot typeset in a grammar with a copied non-terminal', () => {
    const g = parse('S -> A a | b A c | d c\nA -> d');
    const occ = { productionId: g.productions[0].id, position: 0 };
    const copied = splitFollowForOccurrence(g, occ).transformedGrammar;
    expect([...copied.nonTerminals].some(n => n.includes('₂'))).toBe(true);
    const tex = exportGrammarToLatex(copied);
    expect([...tex].filter(c => c.charCodeAt(0) > 127)).toEqual([]);
  });
});

describe('Editor text', () => {
  it('round-trips terminals with backslashes and quotes', () => {
    for (const sym of ['\\', '\\"', '"', "'", 'a\\b', '"\'']) {
      const g: Grammar = { nonTerminals: new Set(['S']), terminals: new Set([sym]), startSymbol: 'S', productions: [{ id: 1, lhs: 'S', rhs: [sym, 'S'] }, { id: 2, lhs: 'S', rhs: [] }] };
      const back = parseGrammar(formatGrammarForEditor(g));
      expect(back.errors, JSON.stringify(sym)).toEqual([]);
      expect(back.grammar!.productions[0].rhs, JSON.stringify(sym)).toEqual([sym, 'S']);
    }
  });
});
