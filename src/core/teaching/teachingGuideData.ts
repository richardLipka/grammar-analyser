/**
 * Pedagogical Teaching Guide for Formal Grammar Transformations.
 *
 * Each technique features:
 * - Direct seminal scientific literature citations (original journal/conference papers where
 *   the technique was first introduced, avoiding university lecture notes).
 * - Theoretical explanation of the grammar defect and the formal mathematical remedy.
 * - Dedicated pedagogical example grammar with the fixable issue clearly presented.
 * - Interactive step-by-step transformation engine with symbol manipulation display.
 * - Language equivalence verification with the Earley-based language comparator.
 */

import { Grammar } from '../ast/grammar';
import {
  TransformationResult,
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  eliminateImmediateLeftRecursionForSymbol,
  leftCornerTransform,
  leftFactorGrammar,
  rightFactorGrammar,
  expandLeadingNonTerminalInSymbol,
  substituteSymbol,
  absorbFollowingSymbol,
  convertToChomsky,
  convertToGreibach
} from '../processor/grammarProcessor';
import { transformToLL1 } from '../processor/ll1Transformer';
import { FormProperty } from '../analyser/equivalence';

export interface LiteratureReference {
  authors: string;
  title: string;
  venue: string;
  year: number;
  url?: string;
  historicalNote: {
    en: string;
    cz: string;
  };
}

export interface TechniqueGuide {
  id: string;
  category: 'clean' | 'll1' | 'normal';
  name: {
    en: string;
    cz: string;
  };
  subtitle: {
    en: string;
    cz: string;
  };
  scheme: string;
  defect: {
    en: string;
    cz: string;
  };
  remedy: {
    en: string;
    cz: string;
  };
  literature: LiteratureReference;
  exampleGrammarText: string;
  exampleIssueNote: {
    en: string;
    cz: string;
  };
  promisedForm: FormProperty[];
  apply: (g: Grammar) => TransformationResult;
}

export const TEACHING_TECHNIQUES: TechniqueGuide[] = [
  {
    id: 'reduce',
    category: 'clean',
    name: {
      en: 'Grammar Reduction (Eliminating Useless Symbols)',
      cz: 'Redukce gramatiky (odstranění zbytečných symbolů)'
    },
    subtitle: {
      en: 'Elimination of non-generating (unproductive) and unreachable symbols',
      cz: 'Odstranění nenormovaných (negenerujících) a nedosažitelných symbolů'
    },
    scheme: 'N_gen = { A | A ⇒* w ∈ T* },  V_reach = { X | S ⇒* α X β }',
    defect: {
      en: 'The grammar contains unproductive non-terminal symbols (symbols that can never derive any terminal string, causing infinite search paths) and unreachable symbols (symbols that can never appear in any sentential form derived from the start symbol).',
      cz: 'Gramatika obsahuje nenormované neterminály (symboly, ze kterých nelze odvodit žádné čistě terminální slovo, což vede k nekonečnému marnému větvení) a nedosažitelné symboly (které se nikdy nevyskytnou v žádné větné formě odvozené z počátečního symbolu).'
    },
    remedy: {
      en: 'Phase 1 computes generating non-terminals N_gen from the bottom up and removes all unproductive symbols and rules referencing them. Phase 2 computes reachable symbols V_reach from the start symbol downwards and removes unreachable symbols. The order is strict: removing unproductive symbols can make other symbols unreachable.',
      cz: 'Fáze 1 zdola nahoru vypočte množinu normovaných neterminálů N_gen a odstraní nenormované symboly a všechna pravidla, která je obsahují. Fáze 2 shora dolů od S vypočte dosažitelné symboly V_reach a odstraní nedosažitelné. Na pořadí záleží: odstranění nenormovaných symbolů může jiné učinit nedosažitelnými.'
    },
    literature: {
      authors: 'Yehoshua Bar-Hillel, Micha A. Perles, Eli Shamir',
      title: 'On formal properties of simple phrase structure grammars',
      venue: 'Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung, Vol. 14, pp. 143–172',
      year: 1961,
      historicalNote: {
        en: 'Seminal paper establishing the formal two-stage reduction theorem for context-free grammars, later popularized in Hopcroft & Ullman (1969).',
        cz: 'Zásadní práce formulující větu o dvoufázové redukci bezkontextových gramatik, později kanonizovaná v Hopcroft & Ullman (1969).'
      }
    },
    exampleGrammarText: 'S -> a A | b\nA -> a A | a\nB -> b B\nC -> d',
    exampleIssueNote: {
      en: 'B is unproductive (only derives b B, never terminates); C is unreachable from S.',
      cz: 'B je nenormovaný (pravidlo B → b B nikdy neukončí odvození); C je nedosažitelný z počátečního symbolu S.'
    },
    promisedForm: ['reduced'],
    apply: (g) => reduceGrammar(g)
  },
  {
    id: 'eps',
    category: 'clean',
    name: {
      en: 'Eliminating ε-Productions',
      cz: 'Odstranění ε-pravidel'
    },
    subtitle: {
      en: 'Construction of an equivalent epsilon-free context-free grammar',
      cz: 'Převod na ekvivalentní gramatiku bez prázdného kroku'
    },
    scheme: 'A ⇒* ε  ⟹  B → α A β becomes B → α A β | α β; remove A → ε',
    defect: {
      en: 'Rules with an empty right-hand side (A → ε) produce non-determinism, obscure left recursion behind nullable prefixes, and cause FIRST/FOLLOW conflicts in top-down parsing.',
      cz: 'Pravidla s prázdnou pravou stranou (A → ε) vnášejí nedeterminismus, skrývají levou rekurzi za nulovatelnými prefixy a způsobují kolize FIRST/FOLLOW v syntaktické analýze shora dolů.'
    },
    remedy: {
      en: 'First compute the nullable set N_ε = { A ∈ N | A ⇒* ε }. For every rule containing nullable non-terminals, generate all non-empty sub-combinations omitting subsets of nullable occurrences. Then delete all A → ε. If ε ∈ L(G), isolate a new start symbol S_0 → S | ε where S_0 does not appear on any RHS.',
      cz: 'Nejprve se určí množina nulovatelných neterminálů N_ε = { A ∈ N | A ⇒* ε }. Pro každé pravidlo se vytvoří všechny neprázdné kombinace vynechávající podmnožiny výskytů nulovatelných symbolů. Následně se odstraní všechna pravidla A → ε. Pokud ε ∈ L(G), přidá se nový počáteční symbol S_0 → S | ε, který se nevyskytuje na pravé straně.'
    },
    literature: {
      authors: 'Yehoshua Bar-Hillel, Micha A. Perles, Eli Shamir',
      title: 'On formal properties of simple phrase structure grammars',
      venue: 'Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung, Vol. 14, pp. 143–172',
      year: 1961,
      historicalNote: {
        en: 'Formal proof that any context-free language can be generated without null rules (modulo the empty string).',
        cz: 'Formální důkaz, že každý bezkontextový jazyk lze generovat bez prázdných pravidel (až na samotné prázdné slovo).'
      }
    },
    exampleGrammarText: 'S -> A b\nA -> a A | B\nB -> c | ε',
    exampleIssueNote: {
      en: 'B → ε makes B nullable, which in turn makes A nullable, allowing S ⇒ A b ⇒ B b ⇒ b.',
      cz: 'Pravidlo B → ε činí B nulovatelným, čímž se nulovatelným stává i A; umožňuje odvození S ⇒ A b ⇒ B b ⇒ b.'
    },
    promisedForm: ['epsFree'],
    apply: (g) => removeEpsilonRules(g)
  },
  {
    id: 'units',
    category: 'clean',
    name: {
      en: 'Eliminating Unit Productions (A → B)',
      cz: 'Odstranění jednoduchých pravidel (A → B)'
    },
    subtitle: {
      en: 'Elimination of single non-terminal chains and cycles',
      cz: 'Odstranění řetězců a cyklů jednoduchých pravidel'
    },
    scheme: 'A ⇒* B (by unit rules), B → α (non-unit)  ⟹  add A → α; remove unit rules',
    defect: {
      en: 'Unit productions A → B (where B is a non-terminal) lengthen derivations without emitting terminals, and unit cycles (A ⇒+ A) introduce infinite structural ambiguity.',
      cz: 'Jednoduchá pravidla A → B (kde B je neterminál) prodlužují odvození bez generování terminálů a cykly jednoduchých pravidel (A ⇒+ A) způsobují nekonečnou nejednoznačnost.'
    },
    remedy: {
      en: 'Compute unit pairs U(A) = { B ∈ N | A ⇒* B via unit productions }. For every non-unit rule B → α of any reachable B ∈ U(A), add A → α. Finally, delete all original unit productions.',
      cz: 'Pro každý neterminál A se spočte množina dosažitelných neterminálů přes jednoduchá pravidla U(A) = { B ∈ N | A ⇒* B }. Pro každé nejednoduché pravidlo B → α se přidá A → α. Původní jednoduchá pravidla se smažou.'
    },
    literature: {
      authors: 'Noam Chomsky',
      title: 'On certain formal properties of grammars',
      venue: 'Information and Control, Vol. 2, No. 2, pp. 137–167',
      year: 1959,
      url: 'https://doi.org/10.1016/S0019-9958(59)90362-6',
      historicalNote: {
        en: 'Chomsky introduced the elimination of single-variable rules as a required prerequisite for normal-form representations.',
        cz: 'Chomsky formuloval eliminaci jednoduchých pravidel jako nezbytný předpoklad pro normální formy bezkontextových gramatik.'
      }
    },
    exampleGrammarText: 'S -> A | b\nA -> B | c\nB -> a',
    exampleIssueNote: {
      en: 'Unit chain S → A → B creates multi-hop delays to reach terminal alternatives a and c.',
      cz: 'Řetězec jednoduchých pravidel S → A → B vytváří nadbytečné derivační kroky k dosažení pravidel B → a a A → c.'
    },
    promisedForm: ['noUnit'],
    apply: (g) => removeUnitRules(g)
  },
  {
    id: 'immediateLeftRec',
    category: 'll1',
    name: {
      en: 'Eliminating Immediate Left Recursion',
      cz: 'Odstranění přímé levé rekurze'
    },
    subtitle: {
      en: 'Rewriting direct left recursion into tail right recursion',
      cz: 'Převod přímé levé rekurze na pravou rekurzi'
    },
    scheme: "A → A α | β  ⟹  A → β A',  A' → α A' | ε",
    defect: {
      en: 'A rule where the LHS non-terminal appears as the first symbol on the RHS (A → A α) traps top-down and recursive-descent parsers in an infinite expansion loop without reading any input token.',
      cz: 'Pravidlo, kde se neterminál z levé strany vyskytuje na prvním místě pravé strany (A → A α), způsobí u analyzátorů shora dolů nekonečný cyklus bez přečtení vstupního symbolu.'
    },
    remedy: {
      en: 'Separate the alternatives into left-recursive A → A α_i and non-left-recursive A → β_j. Transform into: A → β_j A\', and introduce helper A\' → α_i A\' | ε. The generated language β α* remains identical, but is parsed from left to right.',
      cz: 'Alternativy se rozdělí na levorekurzivní A → A α_i a ostatní A → β_j. Nahradí se pravidly: A → β_j A\' a novým A\' → α_i A\' | ε. Jazyk β α* je zachován, ale analyzuje se zleva doprava.'
    },
    literature: {
      authors: 'Donald E. Knuth',
      title: 'On the translation of languages from left to right',
      venue: 'Information and Control, Vol. 8, No. 6, pp. 607–639',
      year: 1965,
      url: 'https://doi.org/10.1016/S0019-9958(65)90426-2',
      historicalNote: {
        en: 'Knuth rigorously established the limitations of top-down parsing on left-recursive grammars and the necessity of right-recursive refactoring.',
        cz: 'Knuth rigorózně doložil omezení analýzy shora dolů na levorekurzivních gramatikách a nutnost jejich pravorekurzivní úpravy.'
      }
    },
    exampleGrammarText: 'E -> E + t | t',
    exampleIssueNote: {
      en: 'E → E + t is directly left-recursive on E, causing an immediate infinite loop in recursive-descent.',
      cz: 'Pravidlo E → E + t je přímo rekurzivní zleva v neterminálu E, což vede k okamžitému zacyklení rekurzivního sestupu.'
    },
    promisedForm: ['noLeftRecursion'],
    apply: (g) => eliminateImmediateLeftRecursionForSymbol(g, 'E', true)
  },
  {
    id: 'leftrec',
    category: 'll1',
    name: {
      en: "Eliminating Indirect Left Recursion (Paull's Algorithm)",
      cz: 'Odstranění nepřímé levé rekurze (Paullův algoritmus)'
    },
    subtitle: {
      en: 'Topological ordering and systematic expansion of cycle-forming non-terminals',
      cz: 'Uspořádání neterminálů a systematické odstranění skrytých cyklů'
    },
    scheme: 'Order A₁…Aₙ;  for i: for j < i: Aᵢ → Aⱼ γ ⟹ substitute Aⱼ; then remove immediate left recursion of Aᵢ',
    defect: {
      en: 'Left recursion spans multiple non-terminals (e.g. S ⇒ A a ⇒ S c a). It is not visible in any single rule, yet still leads to infinite top-down recursion.',
      cz: 'Levá rekurze probíhá přes více neterminálů (např. S ⇒ A a ⇒ S c a). Není patrná v žádném jednotlivém pravidle, přesto způsobuje nekonečné zacyklení.'
    },
    remedy: {
      en: "Impose an ordering A_1, ..., A_n on non-terminals. For each i from 1 to n, substitute previously ordered non-terminals A_j (j < i) appearing at the head of A_i rules, and then eliminate immediate left recursion on A_i. The invariant ensures that no rule starts with A_k for k <= i.",
      cz: 'Zvolí se uspořádání neterminálů A_1, ..., A_n. Vnějším cyklem přes i se pro každé j < i do pravidel A_i → A_j γ dosadí pravé strany A_j, čímž se nepřímá rekurze převede na přímou a ta se na A_i ihned odstraní.'
    },
    literature: {
      authors: 'Marvin C. Paull (cited in Aho & Ullman)',
      title: 'The Theory of Parsing, Translation, and Compiling, Vol. 1: Parsing (Section 2.4, Algorithm 2.8)',
      venue: 'Prentice-Hall',
      year: 1972,
      historicalNote: {
        en: "Paull formulated the ordering algorithm in 1959; it was established as the textbook standard algorithm by Hopcroft & Ullman (1969) and Aho & Ullman (1972).",
        cz: 'Paull formuloval algoritmus uspořádání v roce 1959; jako standardní učebnicový postup jej zakotvili Hopcroft & Ullman (1969) a Aho & Ullman (1972).'
      }
    },
    exampleGrammarText: 'S -> A a | b\nA -> S c | d',
    exampleIssueNote: {
      en: 'S derives A a, which in turn derives S c a, forming an indirect left-recursive cycle S ⇒+ S c a.',
      cz: 'S odvozuje A a, které dále odvozuje S c a, což vytváří skrytý levorekurzivní cyklus S ⇒+ S c a.'
    },
    promisedForm: ['noLeftRecursion'],
    apply: (g) => removeLeftRecursion(g)
  },
  {
    id: 'leftcorner',
    category: 'll1',
    name: {
      en: 'Left-Corner Transformation',
      cz: 'Transformace levého rohu'
    },
    subtitle: {
      en: 'Structural non-recursive rewriting without exponential variable ordering expansion',
      cz: 'Strukturní eliminace levé rekurze bez exponenciálního růstu z uspořádání'
    },
    scheme: 'A → X [A-X]  (for terminal/non-left-recursive X),  [A-X] → β [A-B]  for B → X β,  [A-A] → ε',
    defect: {
      en: "Paull's ordering algorithm can cause combinatorial explosion of rules depending on the chosen permutation of non-terminals. The left-corner transform selectively rewrites only the left-recursive subnetwork.",
      cz: 'Paullův algoritmus může v závislosti na zvoleném pořadí způsobit kombinatorickou explozi pravidel. Transformace levého rohu cíleně přepisuje pouze levorekurzivní komponenty.'
    },
    remedy: {
      en: 'Identify the left-recursive non-terminals N_L. Non-recursive starters X ∉ N_L are generated first, followed by helper non-terminals [A-B] that climb the left spine back up to A.',
      cz: 'Identifikují se levorekurzivní neterminály N_L. Nejprve se vygenerují nelevorekurzivní počátky X ∉ N_L a pomocí pomocných neterminálů [A-B] se odvození vrací po levé páteři zpět k A.'
    },
    literature: {
      authors: 'Daniel J. Rosenkrantz, Philip M. Lewis II',
      title: 'Deterministic left corner parsing',
      venue: 'IEEE 11th Annual Symposium on Switching and Automata Theory (SWAT/FOCS), pp. 139–152',
      year: 1970,
      url: 'https://doi.org/10.1109/SWAT.1970.19',
      historicalNote: {
        en: 'Introduced the left-corner grammar transformation and demonstrated its advantages in avoiding artificial ordering blowups.',
        cz: 'Představili transformaci levého rohu a prokázali její výhody oproti umělému lineárnímu uspořádání neterminálů.'
      }
    },
    exampleGrammarText: 'A -> A a | b',
    exampleIssueNote: {
      en: 'A has left corner b outside the recursive set; helper [A-b] climbs back up generating a*.',
      cz: 'A má levý roh b mimo rekurzivní množinu; pomocný neterminál [A-b] stoupá zpět a generuje a*.'
    },
    promisedForm: ['noLeftRecursion'],
    apply: (g) => leftCornerTransform(g)
  },
  {
    id: 'factor',
    category: 'll1',
    name: {
      en: 'Left Factoring (Prefix Extraction)',
      cz: 'Levá faktorizace (vytýkání prefixu)'
    },
    subtitle: {
      en: 'Elimination of FIRST/FIRST conflicts caused by shared prefixes',
      cz: 'Odstranění kolizí FIRST/FIRST způsobených společným začátkem alternativ'
    },
    scheme: "A → α β₁ | α β₂  ⟹  A → α A',  A' → β₁ | β₂",
    defect: {
      en: 'Two or more alternatives of the same non-terminal start with identical symbol sequences α, producing a FIRST/FIRST clash where a 1-symbol lookahead cannot predict which production to choose.',
      cz: 'Dvě nebo více alternativ téhož neterminálu začínají stejnou posloupností symbolů α, což způsobuje kolizi FIRST/FIRST – analyzátor s jednoznakovým nahlížením nedokáže určit správné pravidlo.'
    },
    remedy: {
      en: 'Extract the longest common prefix α into a single rule A → α A\', and group the remaining suffixes under new non-terminal A\' → β_1 | β_2. The choice is deferred until after α has been read.',
      cz: 'Vytkne se nejdelší společný prefix α do pravidla A → α A\' a zbylé přípony se přesunou do nového neterminálu A\' → β_1 | β_2. Volba pravidla se tím odloží až za přečtení společné části α.'
    },
    literature: {
      authors: 'J. Michael Foster',
      title: 'A syntax improving program',
      venue: 'The Computer Journal, Vol. 11, No. 1, pp. 31–34',
      year: 1968,
      url: 'https://doi.org/10.1093/comjnl/11.1.31',
      historicalNote: {
        en: 'Foster\'s SID system was the first automated program implementing left-factoring to convert non-deterministic grammars into deterministic top-down (LL) form.',
        cz: 'Fosterův systém SID byl prvním automatizovaným programem implementujícím levou faktorizaci pro převod gramatik na deterministický tvar.'
      }
    },
    exampleGrammarText: 'S -> a b | a c | d',
    exampleIssueNote: {
      en: 'Alternatives a b and a c share common prefix a, causing a FIRST/FIRST conflict on lookahead token a.',
      cz: 'Alternativy a b a a c sdílejí společný prefix a, což způsobuje kolizi FIRST/FIRST na vstupním symbolu a.'
    },
    promisedForm: ['leftFactored'],
    apply: (g) => leftFactorGrammar(g)
  },
  {
    id: 'rightfactor',
    category: 'll1',
    name: {
      en: 'Right Factoring (Suffix Extraction)',
      cz: 'Pravá faktorizace (vytýkání přípony)'
    },
    subtitle: {
      en: 'Extraction of common trailing sequences across productions',
      cz: 'Vytýkání společných koncových sekvencí pravidel'
    },
    scheme: "A → α₁ β | α₂ β  ⟹  A → A' β,  A' → α₁ | α₂",
    defect: {
      en: 'Alternatives share common trailing sequences β, causing duplication of suffix parsing actions and grammar bloat.',
      cz: 'Alternativy sdílejí společnou koncovou sekvenci β, což vede k duplicitám v syntaktickém rozkladu a zvětšení gramatiky.'
    },
    remedy: {
      en: 'Extract the shared suffix β to the right of a newly introduced non-terminal: A → A\' β, A\' → α_1 | α_2.',
      cz: 'Společná přípona β se vytkne napravo od nového pomocného neterminálu: A → A\' β, A\' → α_1 | α_2.'
    },
    literature: {
      authors: 'Alfred V. Aho, Jeffrey D. Ullman',
      title: 'The Theory of Parsing, Translation, and Compiling, Vol. 1: Parsing (Section 2.4)',
      venue: 'Prentice-Hall',
      year: 1972,
      historicalNote: {
        en: 'Codified the right-distributive counterpart of left factoring in algebraic grammar transformations.',
        cz: 'Zakotvili pravodistributivní protějšek levé faktorizace v rámci algebraických transformací bezkontextových gramatik.'
      }
    },
    exampleGrammarText: 'S -> a c | b c | d',
    exampleIssueNote: {
      en: 'Alternatives a c and b c share trailing terminal c.',
      cz: 'Alternativy a c a b c sdílejí společný koncový terminál c.'
    },
    promisedForm: [],
    apply: (g) => rightFactorGrammar(g)
  },
  {
    id: 'expandLeading',
    category: 'll1',
    name: {
      en: 'Eliminating Leading Non-Terminals',
      cz: 'Eliminace úvodních neterminálů'
    },
    subtitle: {
      en: 'Unfolding initial non-terminals to expose hidden FIRST/FIRST collisions',
      cz: 'Dosazení počátečního neterminálu pro odkrytí skrytých kolizí'
    },
    scheme: 'A → B γ,  B → δ₁ | δ₂  ⟹  A → δ₁ γ | δ₂ γ',
    defect: {
      en: 'A FIRST/FIRST clash exists between two alternatives, but one alternative begins with a non-terminal B whose expansions start with the conflicting terminal, hiding the common prefix.',
      cz: 'Kolize FIRST/FIRST existuje mezi dvěma alternativami, avšak jedna z nich začíná neterminálem B, jehož rozvoje začínají kolidujícím terminálem, což brání přímému vytknutí.'
    },
    remedy: {
      en: 'Substitute the right-hand sides of B into the leading position of A → B γ. Once unfolded, the conflicting terminal appears at the top level and can be left-factored.',
      cz: 'Do pravidla A → B γ se na úvodní pozici dosadí pravé strany neterminálu B. Po rozvinutí se kolidující terminál ocitne na vnější úrovni a lze provést levou faktorizaci.'
    },
    literature: {
      authors: 'Daniel J. Rosenkrantz, Richard E. Stearns',
      title: 'Properties of deterministic top-down grammars',
      venue: 'Information and Control, Vol. 17, No. 3, pp. 226–256',
      year: 1970,
      url: 'https://doi.org/10.1016/S0019-9958(70)90446-8',
      historicalNote: {
        en: 'Proved the transformation theory of LL(k) grammars and the necessity of unfolding leading non-terminals to reveal lookahead decisions.',
        cz: 'Dokázali teorii transformací LL(k) gramatik a nutnost rozvíjení úvodních neterminálů pro odkrytí rozhodovacích množin nahlížení.'
      }
    },
    exampleGrammarText: 'S -> A b | a c\nA -> a | d',
    exampleIssueNote: {
      en: 'FIRST(A b) contains a because A derives a, colliding with a c, but hidden behind A.',
      cz: 'FIRST(A b) obsahuje a, protože A odvozuje a; dochází ke kolizi s a c, která je však skryta za neterminálem A.'
    },
    promisedForm: [],
    apply: (g) => expandLeadingNonTerminalInSymbol(g, 'S', 'A')
  },
  {
    id: 'substitute',
    category: 'clean',
    name: {
      en: 'Substitution (Rule Inlining)',
      cz: 'Dosazení (eliminace pravidel)'
    },
    subtitle: {
      en: 'Inlining intermediate single-purpose non-terminals',
      cz: 'Dosazení a odstranění pomocných neterminálů'
    },
    scheme: 'C → α B β,  B → γ₁ | … | γₙ  ⟹  C → α γ₁ β | … | α γₙ β; delete B',
    defect: {
      en: 'Intermediate helper non-terminals used in few contexts inflate grammar size and fragment FOLLOW sets.',
      cz: 'Pomocné neterminály použité jen v několika málo kontextech zbytečně zvětšují gramatiku a fragmentují množiny FOLLOW.'
    },
    remedy: {
      en: 'Replace every reference to B with all of B\'s RHS alternatives, then discard B from the grammar.',
      cz: 'Všechny výskyty neterminálu B se nahradí jeho pravými stranami a neterminál B se následně z gramatiky odstraní.'
    },
    literature: {
      authors: 'Daniel J. Rosenkrantz, Richard E. Stearns',
      title: 'Properties of deterministic top-down grammars',
      venue: 'Information and Control, Vol. 17, No. 3, pp. 226–256',
      year: 1970,
      url: 'https://doi.org/10.1016/S0019-9958(70)90446-8',
      historicalNote: {
        en: 'Established the algebraic substitution theorem preserving language equivalence in deterministic top-down grammars.',
        cz: 'Formulovali větu o algebraickém dosazování zachovávajícím jazyk u deterministických bezkontextových gramatik.'
      }
    },
    exampleGrammarText: 'S -> a A b\nA -> c | d | e',
    exampleIssueNote: {
      en: 'A is an intermediate non-terminal with multiple alternatives used inside S → a A b.',
      cz: 'A je pomocný neterminál s několika alternativami použitý v pravidle S → a A b.'
    },
    promisedForm: [],
    apply: (g) => substituteSymbol(g, 'A')
  },
  {
    id: 'absorb',
    category: 'll1',
    name: {
      en: 'Terminal Absorption',
      cz: 'Pohlcení terminálu'
    },
    subtitle: {
      en: 'Converting FIRST/FOLLOW conflicts into factorable FIRST/FIRST conflicts',
      cz: 'Převod kolizí FIRST/FOLLOW na faktorizovatelné kolize FIRST/FIRST'
    },
    scheme: 'A → α B a β,  B → α₁ | … | αₙ  ⟹  A → α [Ba] β,  [Ba] → α₁ a | … | αₙ a',
    defect: {
      en: 'A FIRST/FOLLOW conflict occurs when a nullable or multi-path non-terminal B is followed by a terminal a that also belongs to FIRST(B). The parser cannot decide whether to conclude B or continue inside B.',
      cz: 'Kolize FIRST/FOLLOW nastává, pokud za neterminálem B následuje terminál a, který zároveň náleží do FIRST(B). Analyzátor neví, zda odvozování z B ukončit, či pokračovat.'
    },
    remedy: {
      en: 'Form a composite non-terminal [Ba] generating L(B)·a. Replace the pair B a with [Ba] and multiply its RHS alternatives with terminal a. The conflict is converted into a FIRST/FIRST conflict inside [Ba], which can then be resolved by standard left factoring.',
      cz: 'Vytvoří se složený neterminál [Ba] generující L(B)·a. Dvojice B a se nahradí [Ba] a jeho pravé strany se zakončí symbolem a. Kolize se tím převede na FIRST/FIRST v [Ba], kterou snadno vyřeší levá faktorizace.'
    },
    literature: {
      authors: 'J. Michael Foster',
      title: 'A syntax improving program',
      venue: 'The Computer Journal, Vol. 11, No. 1, pp. 31–34',
      year: 1968,
      url: 'https://doi.org/10.1093/comjnl/11.1.31',
      historicalNote: {
        en: 'Foster introduced the concept of terminal absorption to eliminate lookahead/follow ambiguity in SID.',
        cz: 'Foster zavedl techniku pohlcení terminálu pro řešení nejednoznačností typu lookahead/follow v programu SID.'
      }
    },
    exampleGrammarText: 'S -> A a b\nA -> c | d | e',
    exampleIssueNote: {
      en: 'A is followed by terminal a; absorbing a into [Aa] creates rules [Aa] -> c a | d a | e a.',
      cz: 'Za neterminálem A následuje terminál a; jeho pohlcením vznikne neterminál [Aa] s pravidly c a | d a | e a.'
    },
    promisedForm: [],
    apply: (g) => {
      // Find occurrence of A before a in S
      const prod = g.productions.find(p => p.lhs === 'S' && p.rhs.includes('A'));
      if (!prod) return { transformedGrammar: g, steps: [] };
      const pos = prod.rhs.indexOf('A');
      return absorbFollowingSymbol(g, { productionId: prod.id, position: pos });
    }
  },
  {
    id: 'cnf',
    category: 'normal',
    name: {
      en: 'Chomsky Normal Form (CNF)',
      cz: 'Chomského normální forma (CNF)'
    },
    subtitle: {
      en: 'Binarization and terminal separation for O(n³) CYK dynamic programming',
      cz: 'Binarizace a separace terminálů pro algoritmus CYK'
    },
    scheme: 'A → B C,  A → a,  (S → ε if ε ∈ L(G))',
    defect: {
      en: 'Arbitrary RHS lengths and arbitrary mixtures of terminals and non-terminals prevent dynamic programming parsing (CYK) and complicate mathematical proofs (such as the Pumping Lemma).',
      cz: 'Pravidla libovolné délky a libovolné kombinace terminálů s neterminály brání nasazení algoritmů dynamického programování (CYK) a komplikují formální důkazy.'
    },
    remedy: {
      en: 'Standard 5-step pipeline: 1. Introduce new start symbol S_0. 2. Remove ε-rules. 3. Remove unit rules. 4. Replace terminals in rules of length >= 2 with proxy non-terminals X_a → a. 5. Binarize rules of length >= 3 into cascades of pairs.',
      cz: 'Pětikrokový algoritmus: 1. Nový počáteční symbol S_0. 2. Odstranění ε-pravidel. 3. Odstranění jednoduchých pravidel. 4. Nahrazení terminálů v pravidlech délky >= 2 zástupnými neterminály X_a → a. 5. Binarizace pravidel délky >= 3 kaskádou dvojic.'
    },
    literature: {
      authors: 'Noam Chomsky',
      title: 'On certain formal properties of grammars',
      venue: 'Information and Control, Vol. 2, No. 2, pp. 137–167',
      year: 1959,
      url: 'https://doi.org/10.1016/S0019-9958(59)90362-6',
      historicalNote: {
        en: 'The seminal paper introducing the Chomsky Hierarchy and proving the normal-form theorem for context-free grammars.',
        cz: 'Zásadní práce představující Chomského hierarchii jazyků a dokazující větu o normální formě bezkontextových gramatik.'
      }
    },
    exampleGrammarText: 'S -> a S b | a b',
    exampleIssueNote: {
      en: 'Productions have lengths 2 and 3 with mixed terminals and non-terminals; not in A → B C or A → a form.',
      cz: 'Pravidla mají délku 2 a 3 a míchají terminály s neterminály; nesplňují tvar A → B C ani A → a.'
    },
    promisedForm: ['cnf'],
    apply: (g) => convertToChomsky(g)
  },
  {
    id: 'gnf',
    category: 'normal',
    name: {
      en: 'Greibach Normal Form (GNF)',
      cz: 'Greibachové normální forma (GNF)'
    },
    subtitle: {
      en: 'Leading terminal form for real-time pushdown automata execution',
      cz: 'Pravidla začínající terminálem pro zásobníkové automaty v reálném čase'
    },
    scheme: 'A → a B₁ … Bₖ  (where a ∈ T, Bᵢ ∈ N)',
    defect: {
      en: 'Non-terminal leading symbols allow unbounded null-transitions in pushdown automata before any input symbol is consumed.',
      cz: 'Neterminály na začátku pravidel umožňují neohraničený počet ε-přechodů v zásobníkovém automatu před přečtením vstupního znaku.'
    },
    remedy: {
      en: 'Starting from Chomsky Normal Form: order non-terminals, substitute to achieve A_i → A_j γ with j > i, eliminate immediate left recursion with new non-terminals Z_i, then back-substitute so every production starts with exactly one terminal symbol.',
      cz: 'Vychází se z CNF: neterminály se uspořádají, dosazováním se dosáhne A_i → A_j γ pro j > i, přímá levá rekurze se odstraní novými Z_i a zpětným dosazením začne každé pravidlo právě jedním terminálem.'
    },
    literature: {
      authors: 'Sheila A. Greibach',
      title: 'A new normal-form theorem for context-free phrase structure grammars',
      venue: 'Journal of the ACM (JACM), Vol. 12, No. 1, pp. 42–52',
      year: 1965,
      url: 'https://doi.org/10.1145/321250.321254',
      historicalNote: {
        en: 'Greibach proved that every context-free language can be accepted by a real-time pushdown automaton reading one symbol per transition step.',
        cz: 'Greibachová dokázala, že každý bezkontextový jazyk lze přijímat zásobníkovým automatem v reálném čase, který v každém kroku přečte právě jeden symbol.'
      }
    },
    exampleGrammarText: 'S -> A B | c\nA -> S B | a\nB -> b',
    exampleIssueNote: {
      en: 'Rules start with non-terminals (S → A B, A → S B); GNF systematically orders S, A, B, eliminates forward non-terminals, introduces Z for left recursion, and back-substitutes leading terminals.',
      cz: 'Pravidla začínají neterminály (S → A B, A → S B); GNF systematicky uspořádá S, A, B, dopředně dosadí, odstraní vzniklou levou rekurzi pomocným Z a zpětně dosadí počáteční terminály.'
    },
    promisedForm: ['gnf'],
    apply: (g) => convertToGreibach(g)
  },
  {
    id: 'll1',
    category: 'll1',
    name: {
      en: 'Systematic Transformation to LL(1)',
      cz: 'Systematická transformace na LL(1)'
    },
    subtitle: {
      en: 'Iterative multi-pass conflict resolution pipeline',
      cz: 'Iterativní víceprůchodové řešení rozkladových konfliktů'
    },
    scheme: '1. Left Recursion  2. Expose FIRST Clashes  3. Left Factoring  4. FIRST/FOLLOW Clashes',
    defect: {
      en: 'The grammar has multiple interacting parsing conflicts (e.g. left recursion combined with non-deterministic branching) preventing LL(1) parse table construction.',
      cz: 'Gramatika obsahuje více vzájemně provázaných konfliktů (např. levá rekurze v kombinaci s nerozhodnutelným větvením), které brání sestrojení rozkladové tabulky LL(1).'
    },
    remedy: {
      en: 'Iterative pipeline: Eliminate useless symbols and cycles, eliminate left recursion, then repeatedly select remaining LL(1) conflicts (prioritizing FIRST/FIRST) and apply prefix extraction, leading non-terminal unfolding, terminal absorption, and merging equivalent non-terminals.',
      cz: 'Iterativní postup: Nejprve odstraní zbytečné symboly a levou rekurzi, následně opakovaně vybírá zbývající konflikty (přednostně FIRST/FIRST) a aplikuje vytýkání prefixů, rozvíjení úvodních neterminálů, pohlcení terminálů a sloučení ekvivalentních neterminálů.'
    },
    literature: {
      authors: 'J. Michael Foster',
      title: 'A syntax improving program',
      venue: 'The Computer Journal, Vol. 11, No. 1, pp. 31–34',
      year: 1968,
      url: 'https://doi.org/10.1093/comjnl/11.1.31',
      historicalNote: {
        en: 'Seminal publication of the SID compiler tool establishing iterative deterministic grammar transformation algorithms.',
        cz: 'Klíčová publikace představující systém SID a formulující algoritmy iterativních deterministických transformací gramatik.'
      }
    },
    exampleGrammarText: 'E -> E + T | T\nT -> id',
    exampleIssueNote: {
      en: 'E has left recursion in E + T and conflicts with alternative T; systematic pipeline rewrites it to non-recursive factored form.',
      cz: 'E obsahuje levou rekurzi v E + T kolidující s alternativou T; systematická úprava převede gramatiku na bezkolizní LL(1) tvar.'
    },
    promisedForm: ['ll1'],
    apply: (g) => transformToLL1(g)
  }
];
