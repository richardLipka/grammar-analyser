/**
 * Input formats as they are written in practice: Yacc/Bison files, ANTLR 4
 * grammars and textbook arrow notation (including the compact "aSb" style and
 * the KIV/FJP conventions e = ε and E’).
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar, detectDialect, oneRulePerLine } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { buildLALR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';

const rules = (g: Grammar) => g.productions.map(p => `${p.lhs} -> ${p.rhs.join(' ')}`.trim());

const parseOk = (text: string) => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res;
};

describe('Yacc / Bison', () => {
  const bisonCalc = `
/* Reverse-polish and infix calculator, after the Bison manual */
%{
  #include <stdio.h>
  int yylex (void);
  void yyerror (char const *);
%}

%define api.value.type {double}
%token NUM "number"
%left '-' '+'
%left '*' '/'
%precedence NEG   /* negation--unary minus */
%right '^'        /* exponentiation */

%% /* The grammar follows. */
input:
  %empty
| input line
;

line:
  '\\n'
| exp '\\n'  { printf ("\\t%.10g\\n", $1); }
;

exp:
  NUM
| exp '+' exp        { $$ = $1 + $3;      }
| exp '-' exp        { $$ = $1 - $3;      }
| exp '*' exp        { $$ = $1 * $3;      }
| exp '/' exp        { $$ = $1 / $3;      }
| '-' exp  %prec NEG { $$ = -$2;          }
| exp '^' exp        { $$ = pow ($1, $3); }
| '(' exp ')'        { $$ = $2;           }
| "number" "number"
;
%%
int main (void) { return yyparse (); }
`;

  it('detects the dialect and reads declarations, actions, %prec, %empty and aliases', () => {
    expect(detectDialect(bisonCalc)).toBe('yacc');
    const res = parseOk(bisonCalc);
    expect(res.dialect).toBe('yacc');
    const g = res.grammar!;
    expect(g.startSymbol).toBe('input');
    expect(rules(g)).toEqual([
      'input ->',
      'input -> input line',
      'line -> \\n',
      'line -> exp \\n',
      'exp -> NUM',
      'exp -> exp + exp',
      'exp -> exp - exp',
      'exp -> exp * exp',
      'exp -> exp / exp',
      'exp -> - exp',
      'exp -> exp ^ exp',
      'exp -> ( exp )',
      'exp -> NUM NUM'
    ]);
    expect(res.warnings).toEqual([]);
    expect(g.terminals.has('NEG')).toBe(false);
  });

  it('reads GNU style with the left-hand side on its own line and rules without ;', () => {
    const res = parseOk(`
%token ID
%start list
%%
list
    : item
    | list ',' item
item
    : ID
    | /* empty */
    `);
    expect(rules(res.grammar!)).toEqual(['list -> item', 'list -> list , item', 'item -> ID', 'item ->']);
    expect(res.grammar!.startSymbol).toBe('list');
  });

  it('accepts a plain yacc-like grammar without declarations (line mode)', () => {
    const res = parseOk(`
expr
    : expr '+' term
    | term
    ;
term : 'id' ;
opt :
    | 'x'
    ;`);
    expect(res.dialect).toBe('plain');
    expect(rules(res.grammar!)).toEqual(['expr -> expr + term', 'expr -> term', 'term -> id', 'opt ->', 'opt -> x']);
  });

  it('analyses the calculator as an ambiguous LALR(1) grammar with conflicts', () => {
    const g = parseOk(bisonCalc).grammar!;
    const a = analyzeGrammar(g);
    const t = buildLRTable(buildLALR1Automaton(g, a), g, a);
    expect(t.conflicts.some(c => c.type === 'Shift/Reduce')).toBe(true);
  });
});

describe('ANTLR 4', () => {
  const exprG4 = `
grammar Expr;

options { language = Java; }
@header { package demo; }

/** The start rule; begin parsing here. */
prog:   stat+ EOF ;

stat:   expr NEWLINE                # printExpr
    |   ID '=' expr NEWLINE         # assign
    |   NEWLINE                     # blank
    ;

expr:   <assoc=right> expr '^' expr # pow
    |   expr op=('*'|'/') expr      # MulDiv
    |   expr ('+'|'-') expr         # AddSub
    |   INT                         # int
    |   ID                          # id
    |   '(' expr ')'                # parens
    |   ID '(' (args+=expr (',' args+=expr)*)? ')' # call
    ;

MUL :   '*' ; // assigns token name to '*' used above in grammar
DIV :   '/' ;
ID  :   [a-zA-Z]+ ;      // match identifiers
INT :   [0-9]+ ;         // match integers
NEWLINE:'\\r'? '\\n' ;     // return newlines to parser (is end-statement signal)
WS  :   [ \\t]+ -> skip ; // toss out whitespace
fragment DIGIT : [0-9] ;
`;

  it('detects ANTLR and expands EBNF into auxiliary non-terminals', () => {
    expect(detectDialect(exprG4)).toBe('antlr');
    const res = parseOk(exprG4);
    const g = res.grammar!;
    expect(g.startSymbol).toBe('prog');
    expect(rules(g)).toEqual([
      'prog -> stat prog_list',
      'prog_list -> stat prog_list',
      'prog_list ->',
      'stat -> expr NEWLINE',
      'stat -> ID = expr NEWLINE',
      'stat -> NEWLINE',
      'expr -> expr ^ expr',
      'expr -> expr expr_grp expr',
      'expr -> expr expr_grp2 expr',
      'expr -> INT',
      'expr -> ID',
      'expr -> ( expr )',
      'expr -> ID ( expr_opt )',
      'expr_grp -> *',
      'expr_grp -> /',
      'expr_grp2 -> +',
      'expr_grp2 -> -',
      'expr_list -> , expr expr_list',
      'expr_list ->',
      'expr_opt -> expr expr_list',
      'expr_opt ->'
    ]);
    // tokens of the lexer rules are terminals, without warnings
    expect(g.terminals.has('NEWLINE')).toBe(true);
    expect(g.terminals.has('INT')).toBe(true);
    expect(res.warnings).toEqual([]);
    expect(g.nonTerminals.has('DIGIT')).toBe(false);
  });

  it('unifies single-literal lexer rules with the literal', () => {
    const g = parseOk(`
grammar Calc;
e : e PLUS t | t ;
t : NUM ;
PLUS : '+' ;
NUM : [0-9]+ ;
`).grammar!;
    expect(rules(g)).toEqual(['e -> e + t', 'e -> t', 't -> NUM']);
    expect(g.terminals.has('+')).toBe(true);
    expect(g.terminals.has('PLUS')).toBe(false);
  });

  it('reads a JSON grammar as written in the grammars-v4 collection', () => {
    const res = parseOk(`
grammar JSON;

json
   : value EOF
   ;

obj
   : '{' pair (',' pair)* '}'
   | '{' '}'
   ;

pair
   : STRING ':' value
   ;

arr
   : '[' value (',' value)* ']'
   | '[' ']'
   ;

value
   : STRING
   | NUMBER
   | obj
   | arr
   | 'true'
   | 'false'
   | 'null'
   ;

STRING
   : '"' (ESC | SAFECODEPOINT)* '"'
   ;

fragment ESC
   : '\\\\' (["\\\\/bfnrt] | UNICODE)
   ;
fragment UNICODE
   : 'u' HEX HEX HEX HEX
   ;
fragment HEX
   : [0-9a-fA-F]
   ;
fragment SAFECODEPOINT
   : ~ ["\\\\\\u0000-\\u001F]
   ;
NUMBER
   : '-'? INT ('.' [0-9] +)? EXP?
   ;
fragment INT
   : '0' | [1-9] [0-9]*
   ;
fragment EXP
   : [Ee] [+\\-]? [0-9]+
   ;
WS
   : [ \\t\\n\\r] + -> skip
   ;
`);
    const g = res.grammar!;
    expect(g.startSymbol).toBe('json');
    expect(rules(g)).toContain('obj -> { pair obj_list }');
    expect(rules(g)).toContain('arr -> [ value arr_list ]');
    const a = analyzeGrammar(g);
    const lalr = buildLRTable(buildLALR1Automaton(g, a), g, a);
    expect(lalr.isConflictFree).toBe(true);
    const sim = simulateLRParse(['{', 'STRING', ':', '[', 'NUMBER', ',', 'true', ']', '}'], g, lalr);
    expect(sim.accepted).toBe(true);
  });

  it('rejects lexer-only grammars and unsupported operators with a message', () => {
    expect(parseGrammar('lexer grammar L;\nID : [a-z]+ ;').errors.length).toBeGreaterThan(0);
    expect(parseGrammar('grammar G;\ns : ~X ;').errors.length).toBeGreaterThan(0);
  });
});

describe('Textbook arrow notation', () => {
  it('reads the compact notation S → aSb | ab', () => {
    const res = parseOk('S → aSb | ab | ε');
    expect(rules(res.grammar!)).toEqual(['S -> a S b', 'S -> a b', 'S ->']);
    expect(res.info.length).toBe(1);
  });

  it('reads KIV/FJP notation: e = ε, E’ with a typographic prime, compact bSA', () => {
    const g = parseOk(`E → T E’
E’ → + T E’ | e
T → F T’
T’ → * F T’ | e
F → ( E ) | a`).grammar!;
    expect(rules(g)).toEqual([
      "E -> T E'", "E' -> + T E'", "E' ->", "T -> F T'", "T' -> * F T'", "T' ->", 'F -> ( E )', 'F -> a'
    ]);
    const g1 = parseOk('S → a A S | b\nA → a | bSA').grammar!;
    expect(rules(g1)).toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
    expect(buildLLTable(g1, analyzeGrammar(g1)).isLL1).toBe(true);
  });

  it('keeps multi-letter words when nothing is glued to a non-terminal', () => {
    const g = parseOk('E -> E + T | T\nT -> id | ( E )').grammar!;
    expect(rules(g)).toEqual(['E -> E + T', 'E -> T', 'T -> id', 'T -> ( E )']);
  });

  it('reads ::=, =, -->, ⟶ and multi-line alternatives', () => {
    expect(rules(parseOk('<S> ::= "a" <S> | "b"').grammar!)).toEqual(['S -> a S', 'S -> b']);
    expect(rules(parseOk('S = a S | b.').grammar!)).toEqual(['S -> a S', 'S -> b']);
    expect(rules(parseOk('S --> a S\n    | b').grammar!)).toEqual(['S -> a S', 'S -> b']);
    expect(rules(parseOk('S ⟶ a S | b').grammar!)).toEqual(['S -> a S', 'S -> b']);
    expect(rules(parseOk('S ->\n   a S\n   b').grammar!)).toEqual(['S -> a S', 'S -> b']);
  });
});

describe('Rules copied from lecture slides', () => {
  it('reads -->, blank lines, compact right-hand sides and rule numbers (1)', () => {
    const res = parseOk(`S --> aAS    (1)

S --> b      (2)

A --> a      (3)

A --> bSA    (4)`);
    expect(rules(res.grammar!)).toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
    expect([...res.grammar!.terminals].sort()).toEqual(['a', 'b']);
    expect(res.warnings).toEqual([]);
    expect(res.bareE).toBe(false);
  });

  it("reads primes on both sides: E' --> +TE', F --> (E), e = ε", () => {
    const res = parseOk(`E  --> TE'     (1)

E' --> +TE'    (2)

E' --> e       (3)

T  --> FT'     (4)

T' --> *FT'    (5)

T' --> e       (6)

F  --> (E)     (7)

F  --> a       (8)`);
    expect(rules(res.grammar!)).toEqual([
      "E -> T E'", "E' -> + T E'", "E' ->", "T -> F T'", "T' -> * F T'", "T' ->", 'F -> ( E )', 'F -> a'
    ]);
    expect([...res.grammar!.nonTerminals]).toEqual(['E', "E'", 'T', "T'", 'F']);
    expect(res.warnings).toEqual([]);
    expect(res.bareE).toBe(true);
    expect(buildLLTable(res.grammar!, analyzeGrammar(res.grammar!)).isLL1).toBe(true);
  });

  const zeroOne = `S --> AB     (1)

A --> 0A1    (2)

A --> e      (3)

B --> 1B     (4)

B --> 1      (5)`;

  it('reads digits as terminals: A --> 0A1 (2), B --> 1 (5)', () => {
    const res = parseOk(zeroOne);
    expect(rules(res.grammar!)).toEqual(['S -> A B', 'A -> 0 A 1', 'A ->', 'B -> 1 B', 'B -> 1']);
    expect([...res.grammar!.terminals].sort()).toEqual(['0', '1']);
  });

  it('reads e as a terminal when the user says so', () => {
    const res = parseGrammar(zeroOne, { eIsEpsilon: false });
    expect(res.errors).toEqual([]);
    expect(res.bareE).toBe(true);
    expect(rules(res.grammar!)).toContain('A -> e');
    expect(res.grammar!.terminals.has('e')).toBe(true);
    // a quoted "e" is always a terminal and raises no question
    expect(parseOk('S -> "e" S | a').bareE).toBe(false);
  });

  it('accepts numbers before the rule: (1) S -> …, 1. S -> …, 1) S -> …', () => {
    const res = parseOk('(1) S -> aAS\n[2] S -> b\n3. A -> a\n4) A -> bSA');
    expect(rules(res.grammar!)).toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
  });

  it('accepts a number after each alternative and keeps (E) and a lone (1) as symbols', () => {
    expect(rules(parseOk('S -> aAS (1) | b (2)\nA -> a (3) | bSA (4)').grammar!))
      .toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
    expect(rules(parseOk('S -> (1)').grammar!)).toEqual(['S -> ( 1 )']);
  });

  it('warns when the written numbers differ from the numbering used by the analyser', () => {
    const res = parseOk('S -> a A (1)\nA -> b (3)\nA -> c (2)');
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0].message).toContain('(3) is rule 2');
  });

  it('separates rules on one line by ; (useful in links)', () => {
    expect(rules(parseOk('S -> aAS | b; A -> a | bSA').grammar!))
      .toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
    // a ; inside a right-hand side that is not followed by a rule stays a symbol
    expect(rules(parseOk('S -> a ; b').grammar!)).toEqual(['S -> a ; b']);
  });

  it('splits compact words into numbered and primed non-terminals by longest match', () => {
    const g = parseOk('A1 -> A2A3 | a\nA2 -> A3A1 | b\nA3 -> A1A2 | c').grammar!;
    expect(rules(g)).toEqual(['A1 -> A2 A3', 'A1 -> a', 'A2 -> A3 A1', 'A2 -> b', 'A3 -> A1 A2', 'A3 -> c']);
    const h = parseOk("S -> AS'A | a\nS' -> b").grammar!;
    expect(rules(h)).toEqual(["S -> A S' A", 'S -> a', "S' -> b"]);
  });
});

describe('One rule per line (grammars from links)', () => {
  it('breaks a one-line grammar at ; and before the next left-hand side', () => {
    expect(oneRulePerLine('S-->aAS|b;A-->a|bSA')).toBe('S-->aAS|b\nA-->a|bSA');
    expect(oneRulePerLine('S -> aAS | b A -> a | bSA')).toBe('S -> aAS | b\nA -> a | bSA');
    expect(oneRulePerLine("E->TE' E'->+TE'|e T->FT'")).toBe("E->TE'\nE'->+TE'|e\nT->FT'");
    expect(oneRulePerLine('S --> aAS (1); (2) S --> b')).toBe('S --> aAS (1)\n(2) S --> b');
    expect(oneRulePerLine('<S> ::= a <A> <A> ::= b')).toBe('<S> ::= a <A>\n<A> ::= b');
    expect(oneRulePerLine('S->a;A->b // note')).toBe('S->a\nA->b // note');
  });

  it('leaves everything else as it is', () => {
    for (const text of [
      'S -> a S\n  | b\nA -> c',
      'E -> E + T | T',
      'S -> a ; b',
      'S -> a | A -> b',
      'S -> "A ->" b',
      '%token NUM\n%%\ne : e \'+\' NUM | NUM ;',
      'grammar G; s : A B ;'
    ]) {
      expect(oneRulePerLine(text)).toBe(text);
    }
  });

  it('parses rules separated by a space like rules on separate lines', () => {
    const res = parseOk('S -> aAS | b A -> a | bSA');
    expect(rules(res.grammar!)).toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
    expect(rules(parseOk("E->TE' E'->+TE'|e T->FT' T'->*FT'|e F->(E)|a").grammar!)).toEqual([
      "E -> T E'", "E' -> + T E'", "E' ->", "T -> F T'", "T' -> * F T'", "T' ->", 'F -> ( E )', 'F -> a'
    ]);
  });
});
