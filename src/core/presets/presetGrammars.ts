/**
 * Curated University Textbook Grammar Presets
 */

export interface PresetGrammar {
  id: string;
  nameEn: string;
  nameCz: string;
  descriptionEn: string;
  descriptionCz: string;
  category: 'Arithmetic' | 'LL' | 'LR' | 'Ambiguity' | 'Transformations' | 'Formats';
  grammarText: string;
  sampleInput: string;
}

export const PRESET_GRAMMARS: PresetGrammar[] = [
  {
    id: 'arithmetic_unambiguous',
    nameEn: 'Arithmetic Expressions (Left-Recursive / SLR(1))',
    nameCz: 'Aritmetické výrazy (levorekurzivní / SLR(1))',
    descriptionEn: 'Standard textbook grammar with operator precedence (+, *). Left-recursive (not LL(1)), but ideal for SLR(1) and LALR(1).',
    descriptionCz: 'Standardní učebnicová gramatika s prioritami operátorů (+, *). Levorekurzivní (není LL(1)), ale ideální pro SLR(1) a LALR(1).',
    category: 'Arithmetic',
    grammarText: `E -> E "+" T | T
T -> T "*" F | F
F -> "(" E ")" | "id"`,
    sampleInput: 'id + id * id'
  },
  {
    id: 'arithmetic_ll1',
    nameEn: 'Arithmetic Expressions (Factored LL(1))',
    nameCz: 'Aritmetické výrazy (faktorizovaná LL(1))',
    descriptionEn: 'The classic LL(1) grammar obtained by eliminating left recursion from arithmetic expressions.',
    descriptionCz: 'Klasická LL(1) gramatika vzniklá odstraněním levé rekurze z aritmetických výrazů.',
    category: 'LL',
    grammarText: `E -> T E'
E' -> "+" T E' | ε
T -> F T'
T' -> "*" F T' | ε
F -> "(" E ")" | "id"`,
    sampleInput: 'id + id * id'
  },
  {
    id: 'dangling_else',
    nameEn: 'Dangling Else Ambiguity',
    nameCz: 'Nejednoznačnost if-then-else (dangling else)',
    descriptionEn: 'Famous syntactic ambiguity where an else branch can bind to either inner or outer if. Produces Shift/Reduce conflicts.',
    descriptionCz: 'Známá nejednoznačnost příkazu if-then-else: else lze přiřadit vnitřnímu i vnějšímu if. Vede ke konfliktu přesun-redukce.',
    category: 'Ambiguity',
    grammarText: `S -> "if" "c" "then" S "else" S
   | "if" "c" "then" S
   | "other"`,
    sampleInput: 'if c then if c then other else other'
  },
  {
    id: 'lr0_vs_slr1',
    nameEn: 'Distinguishing LR(0) from SLR(1)',
    nameCz: 'Rozlišení LR(0) a SLR(1)',
    descriptionEn: 'After reading T the LR(0) automaton must choose between shifting "+" and reducing E -> T (shift/reduce conflict). SLR(1) reduces only on FOLLOW(E) = { $ }, which removes the conflict.',
    descriptionCz: 'Po přečtení T musí LR(0) automat volit mezi přesunem "+" a redukcí E -> T (konflikt přesun-redukce). SLR(1) redukuje jen pro symboly z FOLLOW(E) = { $ }, čímž konflikt zmizí.',
    category: 'LR',
    grammarText: `E -> T "+" E | T
T -> "id"`,
    sampleInput: 'id + id + id'
  },
  {
    id: 'slr1_vs_lalr1',
    nameEn: 'Distinguishing SLR(1) from LALR(1)',
    nameCz: 'Rozlišení SLR(1) a LALR(1)',
    descriptionEn: 'Dragon Book example: in the state with S -> L • "=" R and R -> L • the symbol "=" is in FOLLOW(R), so SLR(1) has a shift/reduce conflict. The LALR(1) lookahead of R -> L • is only $, so LALR(1) and LR(1) are conflict-free.',
    descriptionCz: 'Příklad z Dračí knihy: ve stavu s položkami S -> L • "=" R a R -> L • patří "=" do FOLLOW(R), proto má SLR(1) konflikt přesun-redukce. Dopředu prohlížený symbol LALR(1) položky R -> L • je jen $, takže LALR(1) i LR(1) jsou bez konfliktů.',
    category: 'LR',
    grammarText: `S -> L "=" R | R
L -> "*" R | "id"
R -> L`,
    sampleInput: '* id = id'
  },
  {
    id: 'lalr1_vs_lr1',
    nameEn: 'Distinguishing LALR(1) from LR(1)',
    nameCz: 'Rozlišení LALR(1) a LR(1)',
    descriptionEn: 'Grammar that is strictly LR(1), but NOT LALR(1) because merging identical LR(0) cores produces a Reduce/Reduce conflict.',
    descriptionCz: 'Gramatika, která je LR(1), ale není LALR(1): sloučením stavů se stejným jádrem vznikne konflikt redukce-redukce.',
    category: 'LR',
    grammarText: `S -> "a" A "d" | "b" B "d" | "a" B "e" | "b" A "e"
A -> "c"
B -> "c"`,
    sampleInput: 'a c d'
  },
  {
    id: 'palindromes',
    nameEn: 'Even & Odd Palindromes',
    nameCz: 'Palindromy (liché a sudé)',
    descriptionEn: 'Unambiguous linear grammar of palindromes over {a, b}. The language is not deterministic, so no LL(k) or LR(k) table can be conflict-free: a parser cannot know where the middle is.',
    descriptionCz: 'Jednoznačná lineární gramatika palindromů nad {a, b}. Jazyk není deterministický, proto žádná rozkladová tabulka LL(k) ani LR(k) nemůže být bez konfliktů: analyzátor nepozná, kde je střed slova.',
    category: 'Transformations',
    grammarText: `S -> "a" S "a" | "b" S "b" | "a" | "b" | ε`,
    sampleInput: 'a b a'
  },
  {
    id: 'transformation_demo',
    nameEn: 'Transformations Lab (Epsilon & Unit Rules)',
    nameCz: 'Úpravy gramatiky (ε-pravidla a jednoduchá pravidla)',
    descriptionEn: 'Grammar with nullable non-terminals and unit derivation chains, ideal for testing Chomsky and Greibach normal forms.',
    descriptionCz: 'Gramatika s neterminály generujícími ε a s řetězci jednoduchých pravidel, vhodná pro převod do Chomského a Greibachové normální formy.',
    category: 'Transformations',
    grammarText: `S -> A B C
A -> "a" A | ε
B -> "b" B | C
C -> "c" | ε`,
    sampleInput: 'a b c'
  },
  {
    id: 'll1_not_slr1',
    nameEn: 'LL(1) but not SLR(1)',
    nameCz: 'LL(1), ale ne SLR(1)',
    descriptionEn: 'LL(1) does not imply SLR(1): in the initial state the reductions A -> ε and B -> ε both apply on FOLLOW(A) = FOLLOW(B) = { a, b } (reduce/reduce conflict). LALR(1) separates them by the lookaheads a and b.',
    descriptionCz: 'Z LL(1) neplyne SLR(1): v počátečním stavu lze redukovat A -> ε i B -> ε na FOLLOW(A) = FOLLOW(B) = { a, b } (konflikt redukce-redukce). LALR(1) je rozliší dopředu prohlíženými symboly a a b.',
    category: 'LL',
    grammarText: `S -> A "a" A "b" | B "b" B "a"
A -> ε
B -> ε`,
    sampleInput: 'a b'
  },
  {
    id: 'll2_not_strong',
    nameEn: 'LL(2) but not Strong LL(2)',
    nameCz: 'LL(2), ale ne silná LL(2)',
    descriptionEn: 'Classic example of Aho and Ullman: FOLLOW₂(A) = { a a, b a } mixes the two contexts of A, so the strong LL(2) table has a conflict on "b a". With the local follow sets { a a } and { b a } (true LL(2) test) the alternatives of A are always distinguished.',
    descriptionCz: 'Klasický příklad Aha a Ullmana: FOLLOW₂(A) = { a a, b a } směšuje oba kontexty A, proto má rozkladová tabulka silné LL(2) gramatiky kolizi v položce M[A, b a]. S pravými kontexty { a a } a { b a } (přesný test LL(2), tabulky T(A, L)) se alternativy A vždy rozliší.',
    category: 'LL',
    grammarText: `S -> "a" A "a" "a" | "b" A "b" "a"
A -> "b" | ε`,
    sampleInput: 'b b b a'
  },
  {
    id: 'indirect_left_recursion',
    nameEn: 'Indirect Left Recursion (Paull\'s Algorithm)',
    nameCz: 'Nepřímá levá rekurze (Paullův algoritmus)',
    descriptionEn: 'Dragon Book example: A is immediately left-recursive (A -> A c), S only indirectly (S => A a => S d a). Use "Eliminate Left Recursion" in Transformations to follow Paull\'s algorithm step by step.',
    descriptionCz: 'Příklad z Dračí knihy: A je přímo levorekurzivní (A -> A c), S jen nepřímo (S => A a => S d a). Úprava „Odstranit levou rekurzi“ na záložce Úpravy gramatiky ukáže Paullův algoritmus krok za krokem.',
    category: 'Transformations',
    grammarText: `S -> A "a" | "b"
A -> A "c" | S "d" | ε`,
    sampleInput: 'b d a'
  },
  {
    id: 'strong_ll2',
    nameEn: 'Strong LL(2) Grammar (not LL(1))',
    nameCz: 'Silná LL(2) gramatika (není LL(1))',
    descriptionEn: 'Example G8 of the KIV/FJP lectures (notation: e = ε). It is not LL(1): FIRST(a b A) and FOLLOW(S) share "a". Two symbols of lookahead decide every expansion: the strong LL(2) parse table M[A, xy] has no conflict.',
    descriptionCz: 'Příklad G8 z přednášek KIV/FJP (zápis: e = ε). Není LL(1): FIRST(a b A) a FOLLOW(S) obsahují „a“. Dva dopředu prohlížené symboly rozhodnou každou expanzi: rozkladová tabulka silné LL(2) gramatiky M[A, xy] je bez kolizí.',
    category: 'LL',
    grammarText: `S → a b A | e
A → S a a | b`,
    sampleInput: 'a b a b b a a'
  },
  {
    id: 'format_yacc',
    nameEn: 'Yacc / Bison Input (Calculator)',
    nameCz: 'Vstup ve formátu Yacc / Bison (kalkulačka)',
    descriptionEn: 'A grammar file as written for Bison: %token and %left declarations, the %% sections, rules with the left-hand side on its own line and { semantic actions }. Declarations and actions are skipped, character literals are terminals.',
    descriptionCz: 'Soubor gramatiky tak, jak se píše pro Bison: deklarace %token a %left, sekce %%, pravidla s levou stranou na samostatném řádku a { sémantické akce }. Deklarace a akce se přeskočí, znakové literály jsou terminály.',
    category: 'Formats',
    grammarText: `/* Bison: kalkulačka */
%token NUM
%left '+' '-'
%left '*' '/'
%%
exp
    : exp '+' term     { $$ = $1 + $3; }
    | exp '-' term     { $$ = $1 - $3; }
    | term
    ;
term
    : term '*' factor  { $$ = $1 * $3; }
    | term '/' factor  { $$ = $1 / $3; }
    | factor
    ;
factor
    : NUM
    | '(' exp ')'      { $$ = $2; }
    ;
%%`,
    sampleInput: 'NUM + NUM * NUM'
  },
  {
    id: 'format_antlr',
    nameEn: 'ANTLR 4 Input (EBNF, needs LL(2))',
    nameCz: 'Vstup ve formátu ANTLR 4 (EBNF, vyžaduje LL(2))',
    descriptionEn: 'An ANTLR 4 grammar: lexer rules (capitalised) become tokens, EBNF operators ( ) * + are rewritten into auxiliary non-terminals (prog_list, expr_list, ...). The statement rule needs two symbols of lookahead: ID "=" (assignment) or ID followed by an operator (expression).',
    descriptionCz: 'Gramatika ANTLR 4: lexikální pravidla (velkým písmenem) se stanou tokeny, operátory EBNF ( ) * + se přepíší pomocnými neterminály (prog_list, expr_list, ...). Pravidlo pro příkaz potřebuje dva dopředu prohlížené symboly: ID "=" (přiřazení), nebo ID následované operátorem (výraz).',
    category: 'Formats',
    grammarText: `grammar Expr;

prog   : stat+ EOF ;

stat   : ID '=' expr ';'      # assign
       | expr ';'             # print
       ;

expr   : term (('+' | '-') term)* ;
term   : factor (('*' | '/') factor)* ;
factor : INT | ID | '(' expr ')' ;

ID  : [a-zA-Z]+ ;
INT : [0-9]+ ;
WS  : [ \\t\\r\\n]+ -> skip ;`,
    sampleInput: 'ID = INT + INT ; ID * INT ;'
  },
];
