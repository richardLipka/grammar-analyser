/**
 * Curated University Textbook Grammar Presets
 */

export interface PresetGrammar {
  id: string;
  nameEn: string;
  nameCz: string;
  descriptionEn: string;
  descriptionCz: string;
  category: 'Arithmetic' | 'LL' | 'LR' | 'Ambiguity' | 'Languages' | 'Transformations' | 'Formats' | 'Scoping';
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
    id: 'allstar_arbitrary_lookahead',
    nameEn: 'Arbitrary Lookahead (Separating LL(k) from ALL(*))',
    nameCz: 'Libovolná hloubka pohledu (rozlišení LL(k) od ALL(*))',
    descriptionEn: 'Classic grammar requiring arbitrary lookahead tokens: S -> A "x" | B "y", where both A and B derive arbitrary sequences of "a" followed by "b". For any fixed k, static LL(k) cannot decide between A and B when reading an input longer than k. The adaptive ALL(*) algorithm (ANTLR v4) dynamically explores the ATN and constructs a Lookahead DFA of depth proportional to input length.',
    descriptionCz: 'Klasická gramatika vyžadující neomezenou hloubku pohledu dopředu: S -> A "x" | B "y", kde A i B generují libovolně dlouhé posloupnosti "a" zakončené "b". Pro žádné pevné k nedokáže statický analyzátor LL(k) rozhodnout mezi A a B, pokud je slovo delší než k. Adaptivní algoritmus ALL(*) (ANTLR v4) dynamicky prochází síť ATN a staví Lookahead DFA s hloubkou úměrnou délce vstupu.',
    category: 'LL',
    grammarText: `S -> A "x" | B "y"
A -> "a" A | "b"
B -> "a" B | "b"`,
    sampleInput: 'a a a b x'
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
    nameEn: 'Distinguishing LALR(1) from IELR(1) and LR(1) (Symmetric)',
    nameCz: 'Rozlišení LALR(1) od IELR(1) a LR(1) (symetrická)',
    descriptionEn: 'Classic Dragon Book grammar that is LR(1) but NOT LALR(1). After "a c" and after "b c" the LR(1) states have the same core {A → c•, B → c•} with the lookaheads A: d, B: e and A: e, B: d; LALR(1) merges them and gets a Reduce/Reduce conflict on both "d" and "e". IELR(1) keeps exactly this core split (its other states are those of LALR(1)), so its table is conflict-free; here it has 14 states like canonical LR(1), because LR(1) differs from LALR(1) only in this core.',
    descriptionCz: 'Klasická gramatika z Dračí knihy, která je LR(1), ale NENÍ LALR(1). Po „a c“ a po „b c“ mají stavy LR(1) stejné jádro {A → c•, B → c•} s dopředu prohlíženými symboly A: d, B: e a A: e, B: d; LALR(1) je sloučí a vznikne kolize redukce-redukce na symbolech „d“ i „e“. IELR(1) ponechá rozdělené právě toto jádro (ostatní stavy má stejné jako LALR(1)), takže jeho tabulka je bez kolizí; zde má 14 stavů jako kanonický LR(1), protože LR(1) se od LALR(1) liší jen v tomto jádru.',
    category: 'LR',
    grammarText: `S -> "a" A "d" | "b" B "d" | "a" B "e" | "b" A "e"
A -> "c"
B -> "c"`,
    sampleInput: 'a c d'
  },
  {
    id: 'print_vs_expr_ielr',
    nameEn: 'Distinguishing LALR(1) from IELR(1) (Print vs Expression Statements)',
    nameCz: 'Rozlišení LALR(1) od IELR(1) (příkazy print a výrazy)',
    descriptionEn: 'Realistic compiler construct that is LR(1) but NOT LALR(1). After "print id" and after "expr id" the LR(1) states have the same core {E → id•, F → id•}, but E is followed by ";" in one context and by "=" in the other (and F the other way round). LALR(1) merges them and gets Reduce/Reduce conflicts on both ";" and "=", caused only by the merge. IELR(1) keeps this core split into two states, so its table is conflict-free like canonical LR(1).',
    descriptionCz: 'Realistická konstrukce překladače, která je LR(1), ale NENÍ LALR(1). Po „print id“ a po „expr id“ mají stavy LR(1) stejné jádro {E → id•, F → id•}, ale za E následuje v jednom kontextu „;“ a ve druhém „=“ (a za F naopak). LALR(1) je sloučí a vzniknou kolize redukce-redukce na symbolech „;“ i „=“, způsobené jen sloučením. IELR(1) ponechá toto jádro rozdělené do dvou stavů, takže jeho tabulka je bez kolizí jako u kanonického LR(1).',
    category: 'LR',
    grammarText: `S -> "print" E ";" | "expr" E "=" | "print" F "=" | "expr" F ";"
E -> "id"
F -> "id"`,
    sampleInput: 'print id ;'
  },
  {
    id: 'glr_ambiguous_arithmetic',
    nameEn: 'Ambiguous Arithmetic Expressions (GLR / GSS Demo)',
    nameCz: 'Nejednoznačné aritmetické výrazy (demonstrace GLR / GSS)',
    descriptionEn: 'Classic ambiguous expression grammar without precedence declarations. Standard deterministic LR fails with Shift/Reduce conflicts on operators. Generalized LR (GLR / Tomita) forks parsing branches using a Graph-Structured Stack (GSS) and discovers both left-associative and right-associative derivation trees for inputs like "id + id * id".',
    descriptionCz: 'Klasická nejednoznačná gramatika výrazů bez deklarací priorit. Standardní deterministický LR analyzátor selže na konfliktech přesun/redukce. Zobecněný analyzátor GLR (Tomita) větví zásobník pomocí Graph-Structured Stack (GSS) a pro vstup "id + id * id" nalezne oba derivační stromy (levou i pravou asociativitu).',
    category: 'LR',
    grammarText: `E -> E "+" E | E "*" E | "id" | "(" E ")"`,
    sampleInput: 'id + id * id'
  },
  {
    id: 'glr_natural_language_pp',
    nameEn: 'Natural Language PP-Attachment (GLR / GSS Demo)',
    nameCz: 'Nejednoznačnost vazby předložky v přirozeném jazyce (GLR / GSS)',
    descriptionEn: 'The famous "I saw the man with the telescope" ambiguity in natural language syntax. The prepositional phrase (PP) can attach either to the verb phrase (VP) or the noun phrase (NP). GLR parses both interpretations concurrently via GSS branching and yields two distinct syntax trees.',
    descriptionCz: 'Slavná nejednoznačnost vazby předložkové fráze ("Viděl jsem muže s dalekohledem"). Předložková fráze (PP) se může vázat na sloveso (VP) nebo na podstatné jméno (NP). Analyzátor GLR rozloží obě interpretace současně pomocí GSS a vytvoří dva derivační stromy.',
    category: 'LR',
    grammarText: `S -> NP VP
VP -> VP PP | "verb" NP
NP -> "det" "noun" | NP PP
PP -> "prep" NP`,
    sampleInput: 'det noun verb det noun prep det noun'
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
    id: 'left_linear_regular',
    nameEn: 'Left-Linear Regular Grammar (a⁺ b)',
    nameCz: 'Levolineární regulární gramatika (a⁺ b)',
    descriptionEn: 'Textbook left-linear regular grammar: S → A "b", A → A "a" | "a". Ideal for demonstrating the dual NFA construction converting left-linear to right-linear form (Chomsky & Miller 1958).',
    descriptionCz: 'Učebnicová levolineární regulární gramatika: S → A "b", A → A "a" | "a". Ideální pro demonstraci převodu levolineární gramatiky na ekvivalentní pravolineární tvar pomocí duálního NKA (Chomsky & Miller 1958).',
    category: 'Transformations',
    grammarText: `S -> A "b"
A -> A "a" | "a"`,
    sampleInput: 'a a a b'
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
  {
    id: 'scoping_c_blocks',
    nameEn: 'C-Style Block Scoping ({ ... }, int/float/char)',
    nameCz: 'C-bloky a vnořené rozsahy ({ ... }, int/float/char)',
    descriptionEn: 'Nested lexical blocks with curly braces and typed variable declarations. Demonstrates scope stacking, variable declaration, shadowing, and scope popping.',
    descriptionCz: 'Vnořené lexikální bloky ve složených závorkách s typovanými proměnnými. Demonstruje vrstvení zásobníků rozsahů, deklarace, stínění (shadowing) a rušení bloků.',
    category: 'Scoping',
    grammarText: `Program -> Block
Block -> "{" Decls Stmts "}"
Decls -> Decl Decls | ε
Decl -> Type "id" ";"
Type -> "int" | "float" | "char"
Stmts -> Stmt Stmts | ε
Stmt -> Block | "id" "=" "num" ";"`,
    sampleInput: '{ int id ; { float id ; char id ; id = num ; } id = num ; }'
  },
  {
    id: 'scoping_pascal_pl0',
    nameEn: 'Pascal / PL/0 Procedures & Variables (var, procedure, begin..end)',
    nameCz: 'PL/0 procedury a proměnné (var, procedure, begin..end)',
    descriptionEn: 'Classic Pascal/PL/0 structure with global variables, nested procedure declarations, local scopes, and compound statements (begin ... end).',
    descriptionCz: 'Klasická Pascal/PL/0 struktura s globálními proměnnými, deklaracemi procedur, lokálními rozsahy a složenými příkazy (begin ... end).',
    category: 'Scoping',
    grammarText: `Program -> Block "."
Block -> VarPart ProcPart Statement
VarPart -> "var" "id" VarRest ";" | ε
VarRest -> "," "id" VarRest | ε
ProcPart -> "procedure" "id" ";" Block ";" ProcPart | ε
Statement -> "begin" Stmts "end" | "id" ":=" "num" | "call" "id" | ε
Stmts -> Statement StmtRest
StmtRest -> ";" Statement StmtRest | ε`,
    sampleInput: 'var id , id ; procedure id ; var id ; begin id := num end ; begin call id end .'
  },
  {
    id: 'scoping_modern_declarations',
    nameEn: 'Modern Scripting Declarations (let, const, function, { ... })',
    nameCz: 'Moderní skriptovací deklarace (let, const, function, { ... })',
    descriptionEn: 'Modern language syntax distinguishing immutable constants (const) and mutable variables (let) within functions and block scopes.',
    descriptionCz: 'Moderní syntaxe rozlišující neměnné konstanty (const) a proměnné (let) v tělech funkcí a lexikálních blocích.',
    category: 'Scoping',
    grammarText: `Script -> ItemList
ItemList -> Item ItemList | ε
Item -> VarDecl | FuncDecl | Block | Stmt
VarDecl -> "let" "id" ";" | "const" "id" ";"
FuncDecl -> "function" "id" "{" ItemList "}"
Block -> "{" ItemList "}"
Stmt -> "id" "=" "num" ";"`,
    sampleInput: 'const id ; let id ; function id { let id ; { const id ; id = num ; } }'
  },
  {
    id: 'earley_cycles',
    nameEn: 'Derivation Cycles (A ⇒⁺ A, Unbounded Earley)',
    nameCz: 'Derivační cykly (A ⇒⁺ A, Earley & ETTP)',
    descriptionEn: 'Grammar containing an explicit derivation cycle S -> S. Top-down recursive descent and ALL(*) fail on left recursion or loop infinitely. LR automata experience conflicts. Earley (1970) and ETTP (2025) handle cyclic derivation graphs natively in linear O(n) time without infinite loops.',
    descriptionCz: 'Gramatika obsahující explicitní derivační cyklus S -> S. Klasický rekurzivní sestup i ALL(*) selžou na levé rekurzi nebo se zacyklí. LR automaty vykazují konflikty. Earley (1970) i ETTP (2025) zpracují cyklus přímo v lineárním čase O(n) bez uváznutí v nekonečné smyčce.',
    category: 'Ambiguity',
    grammarText: `S -> S "a" | S | "a"`,
    sampleInput: 'a a a a a a'
  },
  {
    id: 'earley_inherently_ambiguous',
    nameEn: 'Non-LL & Non-LR Ambiguous Language (aⁿ bᵐ, n ≤ m ≤ 2n)',
    nameCz: 'Nejednoznačný jazyk mimo LL a LR (aⁿ bᵐ, n ≤ m ≤ 2n)',
    descriptionEn: 'Classic context-free language { aⁿ bᵐ | n ≤ m ≤ 2n }. The grammar is not LL(k) or LR(k) for any k because the ratio of terminal b\'s cannot be determined by bounded lookahead. Earley and ETTP parse all words in polynomial time and build all alternative derivation trees.',
    descriptionCz: 'Klasický bezkontextový jazyk { aⁿ bᵐ | n ≤ m ≤ 2n }. Gramatika není LL(k) ani LR(k) pro žádné k, protože poměr koncových b nelze rozhodnout omezeným pohledem dopředu. Earley i ETTP analyzují všechna slova v polynomiálním čase a naleznou všechny derivační stromy.',
    category: 'Ambiguity',
    grammarText: `S -> "a" S "b" | "a" S "b" "b" | ε`,
    sampleInput: 'a a b b b'
  },
  {
    id: 'earley_equal_ab',
    nameEn: 'Equal Count of a\'s and b\'s (Heavily Ambiguous CFG)',
    nameCz: 'Jazyk se shodným počtem a a b (silně víceznačný)',
    descriptionEn: 'Generates all strings containing an equal number of a\'s and b\'s in arbitrary order. Highly ambiguous and non-deterministic; LL(k), LR(k), and ALL(*) cannot parse it deterministically. Earley and ETTP parse it natively and extract valid derivation trees.',
    descriptionCz: 'Generuje všechna slova obsahující shodný počet symbolů a a b v libovolném pořadí. Silně víceznačný jazyk, který nelze deterministicky rozložit pomocí LL(k), LR(k) ani ALL(*). Earley i ETTP jej přímo analyzují a sestaví platné derivační stromy.',
    category: 'Ambiguity',
    grammarText: `S -> "a" S "b" S | "b" S "a" S | ε`,
    sampleInput: 'a b b a a b'
  }
];
