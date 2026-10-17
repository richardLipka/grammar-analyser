/**
 * Primary Literature References & Educational Explanations for Earley & ETTP Parsers
 */

export interface ParserLiteratureReference {
  authorYear: string;
  citation: string;
  url: string;
  sections: string;
}

export const EARLEY_PRIMARY_REFERENCES: ParserLiteratureReference[] = [
  {
    authorYear: 'Earley (1970)',
    citation: 'Earley, J.: An efficient context-free parsing algorithm. Communications of the ACM 13(2), 94–102 (1970).',
    url: 'https://doi.org/10.1145/362005.362035',
    sections: '§1 (Introduction), §2 (The Algorithm), §3 (Correctness & Time Bounds: O(n³) general, O(n²) unambiguous, O(n) bounded state)'
  },
  {
    authorYear: 'Scott & Johnstone (2025/2026)',
    citation: 'Scott, E., Johnstone, A.: Earley Table Traversing Parsers. Science of Computer Programming 247, 103335 (2025/2026).',
    url: 'https://doi.org/10.1016/j.scico.2025.103335',
    sections: '§1 (Context & Motivation), §2 (Earley Table Generation & Closures), §3 (Table Traversing Driver), §4 (Empirical Evaluation on Java & C)'
  },
  {
    authorYear: 'Aycock & Horspool (2002)',
    citation: 'Aycock, J., Horspool, R.N.: Practical Earley Parsing. The Computer Journal 45(6), 620–630 (2002).',
    url: 'https://doi.org/10.1093/comjnl/45.6.620',
    sections: '§3 (Nullable symbol handling & speedups), §4 (Split $\\varepsilon$-free transformation)'
  }
];

export const EARLEY_THEORY_GUIDE = {
  en: {
    title: 'Earley & Earley Table Traversing Parsers (ETTP) Guide',
    overview: 'Earley parsing is the foundational dynamic-programming chart parsing method for arbitrary context-free grammars. ETTP (2025/2026) bridges Earley chart parsing with LR-style precomputed automata by eliminating runtime prediction.',
    sections: [
      {
        heading: '1. The Classic Earley Algorithm (1970)',
        content: `Earley constructs a sequence of item sets S₀, S₁, …, Sₙ where each item is [A → α • β, j].
• Origin j points to the position in the input where matching of non-terminal A began.
• The dot (•) tracks progress through the right-hand side.
At each position, three operations drive the chart:
1. Scanner: Reads terminal token wᵢ and moves matching items to Sᵢ with dot incremented.
2. Predictor: Whenever a non-terminal B appears after the dot, all alternative productions for B are instantiated with origin i into Sᵢ.
3. Completer: When an item reaches the end of its rule [B → γ •, k], it looks back at Sₖ to advance all items waiting for B into Sᵢ.`
      },
      {
        heading: '2. Earley Table Traversing Parsers (ETTP 2025)',
        content: `In classic Earley, the Predictor repeatedly queries grammar productions and nullable closures dynamically at runtime.
Elizabeth Scott and Adrian Johnstone (Royal Holloway) observed that the prediction closure and state transitions can be statically precompiled into an Earley Transition Table:
• States q represent prediction-closed item sets without origin indices.
• Transitions δ(q, X) handle both terminal matches (scans) and non-terminal completions (gotos).
• At runtime, the chart stores lightweight integer pairs (q, j) rather than full productions.
• The runtime Predictor is completely eliminated (0 dynamic prediction operations!).`
      },
      {
        heading: '3. Handling Epsilon (ε) Productions',
        content: `Grammars with ε-rules can cause cyclic loops in naive Earley implementations. We incorporate the Aycock & Horspool (2002) nullable optimization: when predicting or creating closures over a nullable non-terminal B, the dot is also immediately bypassed ([A → α B • β, j]), guaranteeing termination on all grammars.`
      },
      {
        heading: '4. Complexity Guarantees',
        content: `• Arbitrary CFG (including ambiguous and cyclic): O(n³) time and O(n²) space.
• Unambiguous CFG: O(n²) time.
• Deterministic grammars (LR-like): O(n) linear time.`
      }
    ]
  },
  cz: {
    title: 'Průvodce algoritmy Earley a Earley Table Traversing Parsers (ETTP)',
    overview: 'Earleyův algoritmus představuje základní metodu dynamického programování (chart parsing) pro libovolné bezkontextové gramatiky. ETTP (2025/2026) spojuje Earleyho s tabulkovými automaty ve stylu LR a zcela eliminuje běhovou fázi predikce.',
    sections: [
      {
        heading: '1. Klasický Earleyův algoritmus (1970)',
        content: `Earley vytváří posloupnost množin položek S₀, S₁, …, Sₙ, kde každá položka má tvar [A → α • β, j].
• Počátek j odkazuje na pozici ve vstupu, kde začalo odvozování neterminálu A.
• Tečka (•) značí, kolik symbolů pravé strany již bylo přečteno a ověřeno.
V každém kroku pracují tři základní operátory:
1. Skener (Scanner): Čte terminální symbol wᵢ a posouvá tečku v odpovídajících položkách do Sᵢ.
2. Prediktor (Predictor): Pokud je za tečkou neterminál B, dynamicky expanduje všechna jeho pravidla s počátkem i do Sᵢ.
3. Kompletor (Completer): Po dokončení pravidla [B → γ •, k] vyhledá v množině Sₖ všechny položky čekající na B a posune v nich tečku do Sᵢ.`
      },
      {
        heading: '2. Earley Table Traversing Parsers (ETTP 2025)',
        content: `V klasickém Earleyově algoritmu spotřebovává prediktor za běhu značné množství času opakovaným vyhledáváním pravidel a uzávěrů v gramatice.
Elizabeth Scott a Adrian Johnstone ukázali, že predikční uzávěry a přechody lze staticky předpočítat do Earleyovy přechodové tabulky:
• Stavy q reprezentují predikčně uzavřené množiny položek bez indexu počátku.
• Přechody δ(q, X) obsluhují jak shody terminálů (sken), tak kompletaci neterminálů (goto).
• Za běhu uchovává tabulka pouze kompaktní dvojice celých čísel (q, j) namísto celých položek.
• Běhový prediktor je zcela eliminován (0 dynamických operací predikce!).`
      },
      {
        heading: '3. Zpracování prázdného slova (ε-pravidla)',
        content: `Gramatiky s ε-pravidly mohou v naivních implementacích způsobit zacyklení. Využíváme optimalizaci podle Aycocka a Horspoola (2002): při predikci neterminálu B schopného generovat ε se tečka rovnou posune i za něj ([A → α B • β, j]), což zaručuje terminaci pro všechny gramatiky.`
      },
      {
        heading: '4. Časová a prostorová složitost',
        content: `• Libovolná CFG (včetně víceznačných a s cykly): čas O(n³), paměť O(n²).
• Jednoznačná CFG: čas O(n²).
• Deterministické gramatiky (LR-like): lineární čas O(n).`
      }
    ]
  }
};
