/**
 * Grammars copied from the KIV/FJP lectures and exercises: [Ba] names of absorbed
 * symbols, arrows that end up in a right-hand side, words such as bxc in the course
 * notation (one terminal or b x c?), capitals without rules, and the links to the
 * PL/0 interpreter.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar, oneRulePerLine, ParseOptions } from '../core/parser/grammarParser';
import { Grammar, formatGrammarForEditor } from '../core/ast/grammar';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { readUrlState, buildShareUrl } from '../ui/urlState';
import { PL0_INTERPRETER_URL, interpreterLink, pl0InterpreterUrl } from '../ui/views/RecursiveDescentView';

const rules = (g: Grammar) => g.productions.map(p => `${p.lhs} -> ${p.rhs.join(' ')}`.trimEnd());

function parseOk(text: string, options: ParseOptions = {}) {
  const res = parseGrammar(text, options);
  expect(res.errors).toEqual([]);
  expect(res.grammar).toBeDefined();
  return res;
}

const isLL1 = (g: Grammar) => buildLLTable(g, analyzeGrammar(g)).isLL1;

describe('Bracketed names of the lectures: [Ba]', () => {
  const absorbed = 'A --> [Ba]C | b\n[Ba] --> a | abCa\nC --> c';

  it('reads [Ba] --> … as a rule and [Ba] on a right-hand side as its non-terminal', () => {
    const res = parseOk(absorbed);
    expect(rules(res.grammar!)).toEqual(['A -> [Ba] C', 'A -> b', '[Ba] -> a', '[Ba] -> a b C a', 'C -> c']);
    expect([...res.grammar!.nonTerminals]).toEqual(['A', '[Ba]', 'C']);
    expect([...res.grammar!.terminals].sort()).toEqual(['a', 'b', 'c']);
    expect(res.warnings).toEqual([]);
  });

  it('no longer merges a [Ba] line into the previous rule', () => {
    const res = parseOk('B --> aBb | c\n[Ba] --> a | abCa\nC --> c');
    expect(rules(res.grammar!)).toEqual(['B -> a B b', 'B -> c', '[Ba] -> a', '[Ba] -> a b C a', 'C -> c']);
    expect(res.grammar!.terminals.has('-')).toBe(false);
    expect(res.grammar!.terminals.has('>')).toBe(false);
  });

  it('reads <[Ba]> (the analyser\'s own output) and [Ba] the same way', () => {
    const bracketed = parseOk('A --> <[Ba]> C | b\n<[Ba]> --> a | a b C a\nC --> c').grammar!;
    expect(rules(bracketed)).toEqual(rules(parseOk(absorbed).grammar!));
    const again = parseOk(formatGrammarForEditor(bracketed)).grammar!;
    expect(rules(again)).toEqual(rules(bracketed));
  });

  it('accepts nested and left-corner names, a [Ba] on its own line and several rules on one line', () => {
    expect(rules(parseOk('S -> [[Ba]b] | c\n[[Ba]b] -> x').grammar!)).toEqual(['S -> [[Ba]b]', 'S -> c', '[[Ba]b] -> x']);
    expect(rules(parseOk('E -> a [E-a]\n[E-a] -> + a [E-a] | ε').grammar!))
      .toEqual(['E -> a [E-a]', '[E-a] -> + a [E-a]', '[E-a] ->']);
    expect(rules(parseOk('S -> [B:] | c\n[B:]\n  --> d').grammar!)).toEqual(['S -> [B:]', 'S -> c', '[B:] -> d']);
    expect(oneRulePerLine('A --> [Ba]C | b [Ba] --> a | abCa')).toBe('A --> [Ba]C | b\n[Ba] --> a | abCa');
    expect(rules(parseOk('A --> [Ba]C | b; [Ba] --> a | abCa\nC --> c').grammar!)).toEqual(rules(parseOk(absorbed).grammar!));
  });

  it('keeps [ and ] as terminals when the bracketed word has no rules, and [1] as a rule number', () => {
    expect(rules(parseOk('Expr -> id[Expr] | x').grammar!)).toEqual(['Expr -> id [ Expr ]', 'Expr -> x']);
    expect(rules(parseOk('S -> a [ S ] | b').grammar!)).toEqual(['S -> a [ S ]', 'S -> b']);
    expect(rules(parseOk('[1] S -> a\n[2] S -> b').grammar!)).toEqual(['S -> a', 'S -> b']);
  });

  it('treats a word glued to [Ba] as compact notation', () => {
    expect(rules(parseOk('S -> ab[Ba]\n[Ba] -> a').grammar!)).toEqual(['S -> a b [Ba]', '[Ba] -> a']);
  });
});

describe('An arrow inside a right-hand side', () => {
  it('is an error when the left-hand side of a line was not recognised', () => {
    const res = parseGrammar('S --> aS | b\nA B --> c');
    expect(res.errors.length).toBe(1);
    expect(res.errors[0].line).toBe(2);
    expect(res.errors[0].message).toContain("'-->' inside a right-hand side");
    expect(res.errors[0].message).toContain('alternatives of S');
    expect(res.errors[0].messageCz).toContain('uvnitř pravé strany');
  });

  it('is an error when two rules share a line without a separator', () => {
    for (const text of ['S -> a -> b', 'S -> a | A -> b', 'S → a → b', 'S -> a => b', 'S ::= a ::= b']) {
      const res = parseGrammar(text);
      expect(res.errors.length, text).toBe(1);
      expect(res.errors[0].message, text).toContain('inside the right-hand side of S');
    }
  });

  it('is fine when quoted, and := : = - > stay ordinary terminals', () => {
    expect(rules(parseOk('S -> a "->" b').grammar!)).toEqual(['S -> a -> b']);
    expect(rules(parseOk("S -> a '=>' S | b").grammar!)).toEqual(['S -> a => S', 'S -> b']);
    expect(rules(parseOk('Stmt -> id := Expr\nExpr -> num').grammar!)).toEqual(['Stmt -> id : = Expr', 'Expr -> num']);
    expect(rules(parseOk('S -> - > S | =').grammar!)).toEqual(['S -> - > S', 'S -> =']);
  });
});

describe('Words such as bxc in the course notation', () => {
  const exercise = 'A --> bxc | yc | bxzd | yzd';

  it('keeps them whole until the user decides, and lists them for the question', () => {
    const res = parseOk(exercise);
    expect(rules(res.grammar!)).toEqual(['A -> bxc', 'A -> yc', 'A -> bxzd', 'A -> yzd']);
    expect(res.multiLetterWords.map(w => w.word)).toEqual(['bxc', 'yc', 'bxzd', 'yzd']);
    expect(res.multiLetterWords[0].symbols).toEqual(['b', 'x', 'c']);
    expect(res.spacedSymbols).toBe(false);
    expect(isLL1(res.grammar!)).toBe(true);
  });

  it('splits them when the user says so: the FIRST-FIRST conflict of the exercise appears', () => {
    const res = parseOk(exercise, { splitWords: true });
    expect(rules(res.grammar!)).toEqual(['A -> b x c', 'A -> y c', 'A -> b x z d', 'A -> y z d']);
    expect(isLL1(res.grammar!)).toBe(false);
    expect(res.info.some(n => n.message.startsWith('Compact notation'))).toBe(true);
    expect(rules(parseOk('S --> ab', { splitWords: true }).grammar!)).toEqual(['S -> a b']);
  });

  it('notes spaced notation, where a word is most likely one terminal', () => {
    const res = parseOk('E -> E + T | T\nT -> id | ( E )');
    expect(rules(res.grammar!)).toEqual(['E -> E + T', 'E -> T', 'T -> id', 'T -> ( E )']);
    expect(res.multiLetterWords.map(w => w.word)).toEqual(['id']);
    expect(res.spacedSymbols).toBe(true);
  });

  it('asks nothing when the reading is clear', () => {
    // a non-terminal glued into a word: compact notation
    expect(parseOk('S -> aSb | ab').multiLetterWords).toEqual([]);
    // quoted words, single characters, ε keywords
    expect(parseOk('S -> "bxc" S | a | eps').multiLetterWords).toEqual([]);
    // not the course notation: Expr, Term
    expect(parseOk('Expr -> Expr + Term | Term\nTerm -> id | num').multiLetterWords).toEqual([]);
    // the option changes nothing there
    expect(rules(parseOk('Expr -> id', { splitWords: true }).grammar!)).toEqual(['Expr -> id']);
  });
});

describe('Capitals without rules in the course notation', () => {
  it('are non-terminals that generate nothing', () => {
    const res = parseOk('S -> A | D\nA -> a');
    expect(res.grammar!.nonTerminals.has('D')).toBe(true);
    expect(res.grammar!.terminals.has('D')).toBe(false);
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0].message).toContain("'D' has no rules");
    expect(analyzeGrammar(res.grammar!).endable.has('D')).toBe(false);
    expect(analyzeGrammar(res.grammar!).endable.has('S')).toBe(true);
  });

  it('also inside compact words, with digits and primes', () => {
    const g = parseOk("S -> aSb | aDb | A2 | B' | c").grammar!;
    expect(rules(g)).toEqual(['S -> a S b', 'S -> a D b', 'S -> A2', "S -> B'", 'S -> c']);
    expect([...g.nonTerminals].sort()).toEqual(['A2', "B'", 'D', 'S']);
    expect(rules(parseOk('S -> aA3b | c\nA2 -> c', { splitWords: true }).grammar!)).toContain('S -> a A3 b');
  });

  it('read back the same from the editor text, and stay terminals outside the course notation', () => {
    const g = parseOk('S -> aSb | aDb | c').grammar!;
    expect(rules(parseOk(formatGrammarForEditor(g)).grammar!)).toEqual(rules(g));
    const quoted = parseOk('S -> "D" S | c').grammar!;
    expect(quoted.terminals.has('D')).toBe(true);
    const res = parseOk('Expr -> Term | ID\nTerm -> x');
    expect(res.grammar!.terminals.has('ID')).toBe(true);
    expect(res.warnings[0].message).toContain('looks like a non-terminal');
  });
});

describe('Links', () => {
  it('carry the answer to the words question (split=1 / split=0)', () => {
    expect(readUrlState('?g=A-->bxc|yc&split=1', '').words).toBe('split');
    expect(readUrlState('', '#split=0').words).toBe('whole');
    expect(readUrlState('?split=maybe', '').words).toBeUndefined();
    expect(buildShareUrl('https://x/', { grammar: 'A-->bxc', words: 'split' })).toBe('https://x/?g=A--%3Ebxc&split=1');
    expect(buildShareUrl('https://x/', { grammar: 'A-->bxc', words: 'whole' })).toContain('split=0');
  });

  it('open the PL/0 interpreter next to the analyser on home.zcu.cz, otherwise the GitHub copy', () => {
    const home = 'https://home.zcu.cz/~lipka/fjp/grammar-analyser/?g=S-%3Ea&tab=rd#x';
    expect(pl0InterpreterUrl(home)).toBe('https://home.zcu.cz/~lipka/fjp/pl0/');
    expect(pl0InterpreterUrl('https://home.zcu.cz/~lipka/fjp/grammar-analyser/index.html')).toBe('https://home.zcu.cz/~lipka/fjp/pl0/');
    expect(pl0InterpreterUrl('https://richardlipka.github.io/grammar-analyser/')).toBe(PL0_INTERPRETER_URL);
    expect(pl0InterpreterUrl('http://localhost:5201/')).toBe(PL0_INTERPRETER_URL);
    expect(interpreterLink('INT 0 3', 'ab$', home)).toBe('https://home.zcu.cz/~lipka/fjp/pl0/#code_b64=SU5UIDAgMw&input=ab%24');
  });
});
