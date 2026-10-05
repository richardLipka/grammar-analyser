/**
 * Curated University Textbook Grammar Presets
 */

export interface PresetGrammar {
  id: string;
  nameEn: string;
  nameCz: string;
  descriptionEn: string;
  descriptionCz: string;
  category: 'Arithmetic' | 'LL' | 'LR' | 'Ambiguity' | 'Languages' | 'Transformations' | 'Formats';
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
    id: 'ambiguous_expr_precedence',
    nameEn: 'Ambiguous Expressions with Precedence (%left, %right)',
    nameCz: 'Nejednoznačné výrazy s prioritami (%left, %right)',
    descriptionEn: 'E → E + E | E * E | … is ambiguous: a + a * a has two derivation trees, so every LR table has shift/reduce conflicts. As in Yacc/Bison, the precedence lines (lowest first) and the associativity decide them: * binds more strongly than +, a - a - a is (a - a) - a (%left), a ^ a ^ a is a ^ (a ^ a) (%right), the unary minus takes the precedence of UMINUS (%prec). Switch the precedence off in the LR tab to see the conflicts.',
    descriptionCz: 'E → E + E | E * E | … je nejednoznačná: a + a * a má dva derivační stromy, takže každá LR tabulka obsahuje konflikty přesun/redukce. Stejně jako v Yaccu/Bisonu je rozhodnou řádky priorit (nejnižší první) a asociativita: * váže silněji než +, a - a - a je (a - a) - a (%left), a ^ a ^ a je a ^ (a ^ a) (%right), unární minus má prioritu UMINUS (%prec). V záložce LR analyzátory lze priority vypnout a konflikty zobrazit.',
    category: 'Ambiguity',
    grammarText: `%left + -
%left * /
%right ^
%right UMINUS
E → E + E | E - E | E * E | E / E | E ^ E | - E %prec UMINUS | ( E ) | a`,
    sampleInput: 'a - a - a * a ^ a ^ a'
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
    descriptionEn: 'Example G8 of the KIV/FJP lectures (which write e for ε). It is not LL(1): FIRST(a b A) and FOLLOW(S) share "a". Two symbols of lookahead decide every expansion: the strong LL(2) parse table M[A, xy] has no conflict.',
    descriptionCz: 'Příklad G8 z přednášek KIV/FJP (kde se ε zapisuje jako e). Není LL(1): FIRST(a b A) a FOLLOW(S) obsahují „a“. Dva dopředu prohlížené symboly rozhodnou každou expanzi: rozkladová tabulka silné LL(2) gramatiky M[A, xy] je bez kolizí.',
    category: 'LL',
    grammarText: `S → a b A | ε
A → S a a | b`,
    sampleInput: 'a b a b b a a'
  },
  {
    id: 'lang_if_matched',
    nameEn: 'if–else without ambiguity (C, matched/open statements)',
    nameCz: 'if–else bez nejednoznačnosti (C, uzavřené/otevřené příkazy)',
    descriptionEn: 'The if statement of C with an optional else; the condition is the single terminal cond. Splitting statements into closed ones (MatchedStatement: every if has its else) and open ones (OpenStatement) attaches each else to the nearest if, so the grammar is unambiguous, SLR(1) and LALR(1). It is not LL(k) for any k: whether a statement is closed is decided only by an else after an arbitrarily long nested statement (Dragon Book, 4.3.2); the automatic transformation to LL(1) finds nothing to do.',
    descriptionCz: 'Příkaz if jazyka C s volitelnou větví else; podmínka je jediný terminál cond. Rozdělení příkazů na uzavřené (MatchedStatement: každé if má svoje else) a otevřené (OpenStatement) přiřadí každé else nejbližšímu if, takže gramatika je jednoznačná, SLR(1) i LALR(1). LL(k) není pro žádné k: zda je příkaz uzavřený, rozhodne až else za libovolně dlouhým vnořeným příkazem (Dragon Book, 4.3.2); automatický převod na LL(1) nemá co udělat.',
    category: 'Languages',
    grammarText: `Statement → MatchedStatement | OpenStatement
MatchedStatement → if ( cond ) MatchedStatement else MatchedStatement | other ";"
OpenStatement → if ( cond ) Statement | if ( cond ) MatchedStatement else OpenStatement`,
    sampleInput: 'if ( cond ) if ( cond ) other ; else other ;'
  },
  {
    id: 'lang_if_precedence',
    nameEn: 'if–then–else resolved by precedence (Pascal, Bison %nonassoc)',
    nameCz: 'if–then–else s prioritami (Pascal, %nonassoc v Bisonu)',
    descriptionEn: 'The short grammar of Pascal\'s if statement is ambiguous: in if cond then if cond then other else other the else may belong to either if. Yacc and Bison keep the grammar and resolve the shift/reduce conflict on else by precedence: the rule if cond then Statement takes the precedence of then, the token else has a higher one, so else is shifted and belongs to the nearest if. Switch the precedence off on the LR tab to see the conflict; the overview shows both derivation trees.',
    descriptionCz: 'Krátká gramatika příkazu if z Pascalu je nejednoznačná: v if cond then if cond then other else other může else patřit kterémukoli if. Yacc a Bison gramatiku ponechávají a konflikt přesun/redukce na else řeší prioritou: pravidlo if cond then Statement má prioritu then, token else vyšší, takže se else přesune a patří nejbližšímu if. V záložce LR analyzátory lze priority vypnout a konflikt zobrazit; Přehled ukáže oba derivační stromy.',
    category: 'Languages',
    grammarText: `%nonassoc then
%nonassoc else
Statement → if cond then Statement | if cond then Statement else Statement | other`,
    sampleInput: 'if cond then if cond then other else other'
  },
  {
    id: 'lang_if_end',
    nameEn: 'if … end if without a dangling else (Ada, Modula-2)',
    nameCz: 'if … end if bez visícího else (Ada, Modula-2)',
    descriptionEn: 'A closing end if removes the dangling-else problem: every else belongs to the if of its block, the grammar is unambiguous and LL(1). The else part and the statement sequences are optional (ε-rules); the FOLLOW sets (end, else) decide when they end.',
    descriptionCz: 'Uzavírací end if odstraní problém visícího else: každé else patří k if svého bloku, gramatika je jednoznačná a LL(1). Větev else i posloupnosti příkazů jsou volitelné (ε-pravidla); kdy končí, rozhodují množiny FOLLOW (end, else).',
    category: 'Languages',
    grammarText: `Statement → if cond then StatementSequence ElsePart end if ";" | other ";"
ElsePart → else StatementSequence | ε
StatementSequence → Statement StatementSequence | ε`,
    sampleInput: 'if cond then if cond then other ; end if ; else other ; end if ;'
  },
  {
    id: 'lang_loops',
    nameEn: 'while and for loops (C)',
    nameCz: 'Cykly while a for (C)',
    descriptionEn: 'A for loop with three optional expressions, a while loop, a block and an expression statement; expressions are the terminal expr. The grammar is LL(1): the optional parts are ε-rules decided by FOLLOW(OptionalExpression) = { ;, ) }. Try the Recursive descent tab: the generated parser in PL/0 or Oberon also runs in the PL/0 interpreter.',
    descriptionCz: 'Cyklus for se třemi volitelnými výrazy, cyklus while, blok a výrazový příkaz; výrazy jsou terminál expr. Gramatika je LL(1): volitelné části jsou ε-pravidla, o kterých rozhoduje FOLLOW(OptionalExpression) = { ;, ) }. Vyzkoušejte záložku Rekurzivní sestup: vygenerovaný analyzátor v PL/0 nebo Oberonu běží i v interpretu PL/0.',
    category: 'Languages',
    grammarText: `Statement → WhileStatement | ForStatement | Block | ExpressionStatement
WhileStatement → while ( expr ) Statement
ForStatement → for ( OptionalExpression ";" OptionalExpression ";" OptionalExpression ) Statement
OptionalExpression → expr | ε
Block → { StatementList }
StatementList → Statement StatementList | ε
ExpressionStatement → expr ";"`,
    sampleInput: 'for ( ; expr ; ) { while ( expr ) expr ; expr ; }'
  },
  {
    id: 'lang_var_decl',
    nameEn: 'Variable declarations (C)',
    nameCz: 'Deklarace proměnných (C)',
    descriptionEn: 'A type and a list of declarators separated by commas, each with an optional array size and initializer. The list is left-recursive, as written for Yacc: the grammar is SLR(1) but not LL(1). Removing the immediate left recursion (or the automatic transformation) gives an LL(1) grammar.',
    descriptionCz: 'Typ a seznam deklarátorů oddělených čárkou, každý s volitelnou velikostí pole a inicializací. Seznam je levorekurzivní, jak se píše pro Yacc: gramatika je SLR(1), ale ne LL(1). Odstraněním přímé levé rekurze (nebo automatickým převodem) vznikne LL(1) gramatika.',
    category: 'Languages',
    grammarText: `Declaration → Type DeclaratorList ";"
Type → int | char | double
DeclaratorList → DeclaratorList , Declarator | Declarator
Declarator → id ArraySuffix Initializer
ArraySuffix → [ num ] | ε
Initializer → "=" expr | ε`,
    sampleInput: 'int id [ num ] , id = expr , id ;'
  },
  {
    id: 'lang_func_decl',
    nameEn: 'Function declaration (C): LL(2), not LL(1)',
    nameCz: 'Deklarace funkce (C): LL(2), ne LL(1)',
    descriptionEn: 'A return type, a name, parameters and a body; statements are the terminal stmt. A parameter has a name (int x) or only a type (int), as in a prototype: both rules start with the type, so the grammar is not LL(1), but it is (strong) LL(2) – the second symbol decides. Left factoring makes it LL(1). ParameterList → void covers f(void).',
    descriptionCz: 'Návratový typ, jméno, parametry a tělo; příkazy jsou terminál stmt. Parametr má jméno (int x), nebo jen typ (int) jako v prototypu: obě pravidla začínají typem, takže gramatika není LL(1), ale je (silná) LL(2) – rozhodne druhý symbol. Levá faktorizace z ní udělá LL(1). ParameterList → void pokrývá f(void).',
    category: 'Languages',
    grammarText: `FunctionDeclaration → ReturnType id ( ParameterList ) Body
ReturnType → Type | void
ParameterList → Parameter MoreParameters | void | ε
MoreParameters → , Parameter MoreParameters | ε
Parameter → Type id | Type
Type → int | char
Body → { Statements }
Statements → stmt Statements | ε`,
    sampleInput: 'int id ( int id , char ) { stmt stmt }'
  },
  {
    id: 'lang_lambda_call',
    nameEn: 'Calling a lambda expression (arrow function, JavaScript): not LR(k)',
    nameCz: 'Volání lambda výrazu (šipková funkce, JavaScript): není LR(k)',
    descriptionEn: '( ( a , b ) => a ) ( 1 , x ): an arrow function in parentheses called at once. The grammar is unambiguous but not LR(k) for any k: whether id in ( id , id , … ) is a parameter or an expression is decided only by => after an arbitrarily long list – the LR(1) tables have reduce/reduce and shift/reduce conflicts. JavaScript parsers therefore read the parenthesis as an expression and reinterpret it as parameters after => (a cover grammar).',
    descriptionCz: '( ( a , b ) => a ) ( 1 , x ): šipková funkce v závorkách je hned zavolána. Gramatika je jednoznačná, ale není LR(k) pro žádné k: zda je id v ( id , id , … ) parametrem, nebo výrazem, rozhodne až => za libovolně dlouhým seznamem – tabulky LR(1) mají konflikty redukce/redukce i přesun/redukce. Parsery JavaScriptu proto čtou závorku jako výraz a na parametry ji převedou až po => (tzv. cover grammar).',
    category: 'Languages',
    grammarText: `Expression → ArrowFunction | CallExpression
ArrowFunction → ArrowParameters "=>" Expression
ArrowParameters → id | ( Parameters )
Parameters → id | id , Parameters | ε
CallExpression → Primary Calls
Calls → ( Arguments ) Calls | ε
Arguments → ExpressionList | ε
ExpressionList → Expression | Expression , ExpressionList
Primary → id | num | ( ExpressionList )`,
    sampleInput: '( ( id , id ) => id ) ( num , id )'
  },
  {
    id: 'lang_c_typedef',
    nameEn: 'Declaration or multiplication? (C: a * b ;)',
    nameCz: 'Deklarace, nebo násobení? (C: a * b ;)',
    descriptionEn: 'In C, id * id ; is either the declaration of a pointer (when the first id is a type name from typedef) or a multiplication. A context-free grammar cannot tell them apart – it is ambiguous, the overview shows both trees. C compilers decide with the symbol table: the lexer returns a different token for type names (the "lexer hack").',
    descriptionCz: 'V C je id * id ; buď deklarace ukazatele (je-li první id jméno typu z typedef), nebo násobení. Bezkontextová gramatika je nerozliší – je nejednoznačná, Přehled ukáže oba stromy. Překladače C rozhodují podle tabulky symbolů: lexikální analyzátor vrací pro jména typů jiný token („lexer hack“).',
    category: 'Languages',
    grammarText: `Statement → Declaration | ExpressionStatement
Declaration → TypeName Declarator ";"
Declarator → * Declarator | id
TypeName → int | id
ExpressionStatement → Expression ";"
Expression → Expression * Factor | Factor
Factor → id | num`,
    sampleInput: 'id * id ;'
  },
  {
    id: 'lang_assign_call',
    nameEn: 'Assignment or procedure call?',
    nameCz: 'Přiřazení, nebo volání procedury?',
    descriptionEn: 'A statement starting with an identifier is an assignment id := expression or a call id ( arguments ). Both rules start with id, so the grammar is not LL(1) (FIRST-FIRST conflicts, also in the lists); left factoring makes it LL(1). PL/0 avoids the problem with the keyword call: call p.',
    descriptionCz: 'Příkaz začínající identifikátorem je přiřazení id := výraz, nebo volání id ( argumenty ). Obě pravidla začínají id, takže gramatika není LL(1) (kolize FIRST-FIRST, i v seznamech); levá faktorizace ji převede na LL(1). PL/0 se problému vyhýbá klíčovým slovem call: call p.',
    category: 'Languages',
    grammarText: `Statement → id ":=" Expression | id ( Arguments ) | begin Statements end
Statements → Statement | Statement ";" Statements
Arguments → Expression | Expression , Arguments
Expression → id | num`,
    sampleInput: 'begin id := num ; id ( id , num ) end'
  },
  {
    id: 'lang_sexpr',
    nameEn: 'S-expressions (Lisp): an LR(0) grammar',
    nameCz: 'S-výrazy (Lisp): LR(0) gramatika',
    descriptionEn: 'An atom or a list in parentheses. With a left-recursive list the grammar is LR(0): no state needs to look at the input, every state either only shifts or only reduces. It is not LL(1) because of the left recursion; conversely, with the right-recursive list List → SExpression List | ε it is LL(1) but not LR(0).',
    descriptionCz: 'Atom, nebo seznam v závorkách. S levorekurzivním seznamem je gramatika LR(0): žádný stav nepotřebuje hledět na vstup, každý buď jen přesouvá, nebo jen redukuje. LL(1) kvůli levé rekurzi není; naopak s pravorekurzivním seznamem List → SExpression List | ε je LL(1), ale ne LR(0).',
    category: 'Languages',
    grammarText: `SExpression → atom | ( List )
List → List SExpression | ε`,
    sampleInput: '( atom ( atom atom ) ( ) )'
  },
  {
    id: 'lang_pl0',
    nameEn: 'PL/0 (Wirth): a whole language, LL(1)',
    nameCz: 'PL/0 (Wirth): celý jazyk, LL(1)',
    descriptionEn: 'Wirth\'s PL/0 (Algorithms + Data Structures = Programs), the language of the KIV/FJP compiler, with ? x and ! e for input and output; identifiers and numbers are the terminals ident and number. The repetitions { … } of Wirth\'s EBNF are right-recursive lists (…Rest) and the optional parts [ … ] ε-alternatives, so the grammar is LL(1): the Recursive descent tab generates from it a parser of PL/0, in PL/0 itself with the procedures nested as in Wirth\'s compiler (Block inside Program, Factor inside Term inside Expression). It is also SLR(1), but not LR(0): the ε-alternatives need a look at the next symbol.',
    descriptionCz: 'Wirthův PL/0 (Algorithms + Data Structures = Programs), jazyk překladače z KIV/FJP, s ? x a ! e pro vstup a výstup; identifikátory a čísla jsou terminály ident a number. Opakování { … } z Wirthovy EBNF jsou pravě rekurzivní seznamy (…Rest) a nepovinné části [ … ] ε-alternativy, takže gramatika je LL(1): záložka Rekurzivní sestup z ní vygeneruje analyzátor PL/0, v PL/0 samotném s procedurami vnořenými jako ve Wirthově překladači (Block uvnitř Program, Factor uvnitř Term uvnitř Expression). Je také SLR(1), ale ne LR(0): ε-alternativy potřebují nahlédnout na další symbol.',
    category: 'Languages',
    grammarText: `Program → Block "."
Block → ConstPart VarPart ProcPart Statement
ConstPart → const ConstDef ConstRest ";" | ε
ConstDef → ident "=" number
ConstRest → "," ConstDef ConstRest | ε
VarPart → var ident VarRest ";" | ε
VarRest → "," ident VarRest | ε
ProcPart → procedure ident ";" Block ";" ProcPart | ε
Statement → ident ":=" Expression | call ident | "?" ident | "!" Expression
  | begin Statement StatementRest end | if Condition then Statement
  | while Condition do Statement | ε
StatementRest → ";" Statement StatementRest | ε
Condition → odd Expression | Expression RelOp Expression
RelOp → "=" | "#" | "<" | "<=" | ">" | ">="
Expression → Sign Term ExpressionRest
Sign → "+" | "-" | ε
ExpressionRest → AddOp Term ExpressionRest | ε
AddOp → "+" | "-"
Term → Factor TermRest
TermRest → MulOp Factor TermRest | ε
MulOp → "*" | "/"
Factor → ident | number | "(" Expression ")"`,
    sampleInput: 'var ident ; procedure ident ; ident := ident - number ; begin ? ident ; while ident > number do call ident ; ! ident end .'
  },
  {
    id: 'format_kiv',
    nameEn: 'Lecture Notation (numbered rules)',
    nameCz: 'Zápis z přednášek (číslovaná pravidla)',
    descriptionEn: 'Rules copied from lecture slides: the arrow -->, compact right-hand sides (aAS = a A S) and rule numbers (1) at the ends of the lines, which are labels, not symbols. Primes (E\'), digits (0A1) and e for ε are read the same way.',
    descriptionCz: 'Pravidla zkopírovaná z přednášek: šipka -->, kompaktní pravé strany (aAS = a A S) a čísla pravidel (1) na koncích řádků, která jsou označením, ne symboly. Stejně se čtou čárky (E\'), číslice (0A1) i e pro ε.',
    category: 'Formats',
    grammarText: `S --> aAS    (1)

S --> b      (2)

A --> a      (3)

A --> bSA    (4)`,
    sampleInput: 'a b b a b'
  },
  {
    id: 'format_yacc',
    nameEn: 'Yacc / Bison Input (Calculator)',
    nameCz: 'Vstup ve formátu Yacc / Bison (kalkulačka)',
    descriptionEn: 'A grammar file as written for Bison: %token and %left declarations, the %% sections, rules with the left-hand side on its own line and { semantic actions }. Actions are skipped, character literals are terminals; %left / %right / %nonassoc / %prec are used to resolve shift/reduce conflicts of the LR tables (this grammar has none).',
    descriptionCz: 'Soubor gramatiky tak, jak se píše pro Bison: deklarace %token a %left, sekce %%, pravidla s levou stranou na samostatném řádku a { sémantické akce }. Akce se přeskočí, znakové literály jsou terminály; %left / %right / %nonassoc / %prec řeší konflikty přesun/redukce v LR tabulkách (tato gramatika žádné nemá).',
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
