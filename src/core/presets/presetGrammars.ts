/**
 * Curated University Textbook Grammar Presets
 */

export interface PresetGrammar {
  id: string;
  nameEn: string;
  nameCz: string;
  descriptionEn: string;
  descriptionCz: string;
  category: 'Arithmetic' | 'LL' | 'LR' | 'Ambiguity' | 'Transformations';
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
    nameCz: 'Dangling Else (nejednoznačnost if-else)',
    descriptionEn: 'Famous syntactic ambiguity where an else branch can bind to either inner or outer if. Produces Shift/Reduce conflicts.',
    descriptionCz: 'Slavná syntaktická nejednoznačnost větvení if-then-else. Vytváří konflikt posun/redukce.',
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
    descriptionEn: 'Classic grammar separating LR(0) and SLR(1). Has a Shift/Reduce conflict in LR(0) that is completely resolved by FOLLOW sets in SLR(1).',
    descriptionCz: 'Klasická gramatika oddělující LR(0) a SLR(1). V LR(0) vykazuje konflikt posun/redukce, který množiny FOLLOW v SLR(1) zcela vyřeší.',
    category: 'LR',
    grammarText: `S -> L "=" R | R
L -> "*" R | "id"
R -> L`,
    sampleInput: '* id = id'
  },
  {
    id: 'slr1_vs_lalr1',
    nameEn: 'Distinguishing SLR(1) from LALR(1)',
    nameCz: 'Rozlišení SLR(1) a LALR(1)',
    descriptionEn: 'Grammar that is NOT SLR(1) due to a Reduce/Reduce conflict, but is conflict-free in LALR(1) and LR(1).',
    descriptionCz: 'Gramatika, která není SLR(1) kvůli konfliktu redukce/redukce, ale v LALR(1) a LR(1) je zcela bez konfliktů.',
    category: 'LR',
    grammarText: `S -> "a" A "c" | "b" B "c" | "a" B "d" | "b" A "d"
A -> "e"
B -> "e"`,
    sampleInput: 'a e c'
  },
  {
    id: 'lalr1_vs_lr1',
    nameEn: 'Distinguishing LALR(1) from LR(1)',
    nameCz: 'Rozlišení LALR(1) a LR(1)',
    descriptionEn: 'Grammar that is strictly LR(1), but NOT LALR(1) because merging identical LR(0) cores produces a Reduce/Reduce conflict.',
    descriptionCz: 'Gramatika, která je striktně LR(1), ale není LALR(1), protože sloučení jader položek vygeneruje konflikt redukce/redukce.',
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
    descriptionEn: 'Linear context-free grammar generating palindromic strings over {a, b}.',
    descriptionCz: 'Lineární bezkontextová gramatika generující palindromy nad abecedou {a, b}.',
    category: 'Transformations',
    grammarText: `S -> "a" S "a" | "b" S "b" | "a" | "b" | ε`,
    sampleInput: 'a b a'
  },
  {
    id: 'transformation_demo',
    nameEn: 'Transformations Lab (Epsilon & Unit Rules)',
    nameCz: 'Laboratoř transformací (epsilon a jednoduchá pravidla)',
    descriptionEn: 'Grammar with nullable non-terminals and unit derivation chains, ideal for testing Chomsky and Greibach normal forms.',
    descriptionCz: 'Gramatika s nulovatelnými neterminály a řetězci jednoduchých pravidel pro testování Chomského a Greibachové normální formy.',
    category: 'Transformations',
    grammarText: `S -> A B C
A -> "a" A | ε
B -> "b" B | C
C -> "c" | ε`,
    sampleInput: 'a b c'
  }
];
