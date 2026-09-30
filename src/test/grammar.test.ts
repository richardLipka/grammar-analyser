import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  convertToChomsky
} from '../core/processor/grammarProcessor';
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import {
  buildLR0Automaton,
  buildLR1Automaton,
  buildLALR1Automaton
} from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { generateShortestWords } from '../core/generator/wordGenerator';

describe('Grammar Parser & Syntax Variations', () => {
  it('parses arrow syntax with pipe alternatives', () => {
    const text = `
      E -> E "+" T | T
      T -> T "*" F | F
      F -> "(" E ")" | "id"
    `;
    const res = parseGrammar(text);
    expect(res.errors).toHaveLength(0);
    expect(res.grammar).toBeDefined();
    expect(res.grammar!.nonTerminals.has('E')).toBe(true);
    expect(res.grammar!.nonTerminals.has('T')).toBe(true);
    expect(res.grammar!.nonTerminals.has('F')).toBe(true);
    expect(res.grammar!.terminals.has('+')).toBe(true);
    expect(res.grammar!.terminals.has('*')).toBe(true);
    expect(res.grammar!.terminals.has('id')).toBe(true);
  });

  it('parses ::= and :== and newline alternatives', () => {
    const text = `
      exp :== exp "+" term
              term
      term ::= "id"
    `;
    const res = parseGrammar(text);
    expect(res.errors).toHaveLength(0);
    expect(res.grammar).toBeDefined();
    expect(res.grammar!.productions.length).toBe(3);
  });

  it('parses Yacc-style colon syntax with semicolons', () => {
    const text = `
      expr : expr '+' term
           | term
           ;
      term : 'id' ;
    `;
    const res = parseGrammar(text);
    expect(res.errors).toHaveLength(0);
    expect(res.grammar).toBeDefined();
    expect(res.grammar!.nonTerminals.has('expr')).toBe(true);
  });

  it('handles epsilon keywords and symbols', () => {
    const text = `
      S -> "a" S | eps
      A -> ε
      B -> ""
    `;
    const res = parseGrammar(text);
    expect(res.errors).toHaveLength(0);
    const epsProds = res.grammar!.productions.filter(p => p.rhs.length === 0);
    expect(epsProds.length).toBe(3);
  });

  it('parses angle-bracketed non-terminals and mixed comments', () => {
    const text = `
      // Top-level statement
      <Program> -> <Stmt> ";" <Program> # sequence
                 | <Stmt>
      <Stmt> -> "id" ":=" "num"
    `;
    const res = parseGrammar(text);
    expect(res.errors).toHaveLength(0);
    expect(res.grammar).toBeDefined();
    expect(res.grammar!.nonTerminals.has('Program')).toBe(true);
    expect(res.grammar!.nonTerminals.has('Stmt')).toBe(true);
    expect(res.grammar!.terminals.has(';')).toBe(true);
    expect(res.grammar!.terminals.has(':=')).toBe(true);
  });
});

describe('Grammar Analyser (Nullable, FIRST, FOLLOW)', () => {
  it('computes nullable symbols correctly', () => {
    const text = `
      S -> A B
      A -> "a" | ε
      B -> C
      C -> ε
      D -> "d"
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);
    expect(analysis.nullable.has('A')).toBe(true);
    expect(analysis.nullable.has('C')).toBe(true);
    expect(analysis.nullable.has('B')).toBe(true);
    expect(analysis.nullable.has('S')).toBe(true);
    expect(analysis.nullable.has('D')).toBe(false);
  });

  it('computes FIRST and FOLLOW sets for factored arithmetic grammar', () => {
    const text = `
      E -> T E'
      E' -> "+" T E' | ε
      T -> F T'
      T' -> "*" F T' | ε
      F -> "(" E ")" | "id"
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);

    const firstE = analysis.first1.get('E')!;
    expect(firstE.has('(')).toBe(true);
    expect(firstE.has('id')).toBe(true);

    const followE = analysis.follow1.get('E')!;
    expect(followE.has('$')).toBe(true);
    expect(followE.has(')')).toBe(true);
  });
});

describe('Grammar Processor (Transformations)', () => {
  it('eliminates left recursion', () => {
    const text = `
      E -> E "+" T | T
      T -> "id"
    `;
    const g = parseGrammar(text).grammar!;
    const res = removeLeftRecursion(g);

    // Result should not have E -> E ...
    const hasLeftRec = res.transformedGrammar.productions.some(
      p => p.rhs.length > 0 && p.rhs[0] === p.lhs
    );
    expect(hasLeftRec).toBe(false);
  });

  it('left factors common prefixes', () => {
    const text = `
      S -> "if" "c" "then" S "else" S | "if" "c" "then" S | "other"
    `;
    const g = parseGrammar(text).grammar!;
    const res = leftFactorGrammar(g);

    const sProds = res.transformedGrammar.productions.filter(p => p.lhs === 'S');
    expect(sProds.length).toBeLessThan(3);
  });

  it('removes unit rules', () => {
    const text = `
      E -> T
      T -> F
      F -> "id"
    `;
    const g = parseGrammar(text).grammar!;
    const res = removeUnitRules(g);

    const hasUnit = res.transformedGrammar.productions.some(
      p => p.rhs.length === 1 && res.transformedGrammar.nonTerminals.has(p.rhs[0])
    );
    expect(hasUnit).toBe(false);
  });

  it('converts to Chomsky Normal Form (CNF)', () => {
    const text = `
      S -> "a" S "b" | "a" "b"
    `;
    const g = parseGrammar(text).grammar!;
    const res = convertToChomsky(g);

    // In CNF, all rules are either A -> B C or A -> a (or S0 -> eps)
    for (const p of res.transformedGrammar.productions) {
      if (p.rhs.length === 1) {
        expect(res.transformedGrammar.terminals.has(p.rhs[0])).toBe(true);
      } else if (p.rhs.length === 2) {
        expect(res.transformedGrammar.nonTerminals.has(p.rhs[0])).toBe(true);
        expect(res.transformedGrammar.nonTerminals.has(p.rhs[1])).toBe(true);
      } else if (p.rhs.length === 0) {
        expect(p.lhs).toBe(res.transformedGrammar.startSymbol);
      } else {
        throw new Error(`Production ${p.lhs} -> ${p.rhs.join(' ')} violates CNF length`);
      }
    }
  });

  it('reduces grammar by removing unreachable and unproductive symbols', () => {
    const text = `
      S -> "a" A
      A -> "a"
      B -> "b" B // non-terminating
      C -> "c"   // unreachable
    `;
    const g = parseGrammar(text).grammar!;
    const res = reduceGrammar(g);

    expect(res.transformedGrammar.nonTerminals.has('B')).toBe(false);
    expect(res.transformedGrammar.nonTerminals.has('C')).toBe(false);
    expect(res.transformedGrammar.nonTerminals.has('S')).toBe(true);
    expect(res.transformedGrammar.nonTerminals.has('A')).toBe(true);
  });
});

describe('LL(1) Parser Simulation', () => {
  it('correctly validates and parses a word in LL(1)', () => {
    const text = `
      E -> T E'
      E' -> "+" T E' | ε
      T -> F T'
      T' -> "*" F T' | ε
      F -> "(" E ")" | "id"
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);
    const table = buildLLTable(g, analysis);

    expect(table.isLL1).toBe(true);

    const sim = simulateLLParse(['id', '+', 'id', '*', 'id'], g, table);
    expect(sim.accepted).toBe(true);
  });

  it('rejects an invalid word in LL(1)', () => {
    const text = `
      S -> "a" S "b" | ε
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);
    const table = buildLLTable(g, analysis);

    const sim = simulateLLParse(['a', 'a', 'b'], g, table);
    expect(sim.accepted).toBe(false);
  });
});

describe('LR(k) Automata and Parser', () => {
  it('constructs SLR(1) table and successfully parses input', () => {
    const text = `
      E -> E "+" T | T
      T -> T "*" F | F
      F -> "id"
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);
    const automaton = buildLR0Automaton(g, 'SLR(1)');
    const table = buildLRTable(automaton, g, analysis);

    expect(table.isConflictFree).toBe(true);

    const sim = simulateLRParse(['id', '+', 'id', '*', 'id'], g, table);
    expect(sim.accepted).toBe(true);
  });

  it('distinguishes SLR(1) from LALR(1) conflict resolution', () => {
    const text = `
      S -> L "=" R | R
      L -> "*" R | "id"
      R -> L
    `;
    const g = parseGrammar(text).grammar!;
    const analysis = analyzeGrammar(g);

    const slr1Aut = buildLR0Automaton(g, 'SLR(1)');
    const slr1Tab = buildLRTable(slr1Aut, g, analysis);
    expect(slr1Tab.isConflictFree).toBe(false); // Has S/R conflict in SLR(1) on '='

    const lalr1Aut = buildLALR1Automaton(g, analysis);
    const lalr1Tab = buildLRTable(lalr1Aut, g, analysis);
    expect(lalr1Tab.isConflictFree).toBe(true); // Resolved in LALR(1)!
  });
});

describe('Word Generator', () => {
  it('generates shortest valid words in language', () => {
    const text = `
      S -> "a" S "b" | "c"
    `;
    const g = parseGrammar(text).grammar!;
    const words = generateShortestWords(g, 3);

    expect(words.length).toBeGreaterThan(0);
    expect(words[0].word).toBe('c');
  });
});
