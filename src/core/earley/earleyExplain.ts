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
    url: 'https://doi.org/10.1145/362007.362035',
    sections: 'recogniser with Predictor, Scanner and Completer; time bounds: O(n³) in general, O(n²) for unambiguous grammars, O(n) for a large class of grammars (his bounded-state grammars; he used look-ahead)'
  },
  {
    authorYear: 'Leo (1991)',
    citation: 'Leo, J.M.I.M.: A general context-free parsing algorithm running in linear time on every LR(k) grammar without using lookahead. Theoretical Computer Science 82(1), 165–176 (1991).',
    url: 'https://doi.org/10.1016/0304-3975(91)90180-A',
    sections: 'transitive items on deterministic reduction paths: the completer adds only the topmost item; O(n) on every LR(k), even LR-regular grammar'
  },
  {
    authorYear: 'Kegler (2019)',
    citation: 'Kegler, J.: Marpa, a practical general parser: the recognizer. arXiv:1910.08129 (2019).',
    url: 'https://arxiv.org/abs/1910.08129',
    sections: 'Section 7: Leo items as triples (dotted rule, transition symbol, origin), Leo uniqueness, Leo reduction, Leo stack expansion for evaluation'
  },
  {
    authorYear: 'Scott & Johnstone (2025/2026)',
    citation: 'Scott, E., Johnstone, A.: Earley Table Traversing Parsers. Science of Computer Programming 247, 103335 (2026; online 2025).',
    url: 'https://doi.org/10.1016/j.scico.2025.103335',
    sections: 'Earley recogniser driven by a precomputed table, extended to a parser; experiments on Java and ANSI C grammars'
  },
  {
    authorYear: 'Aycock & Horspool (2002)',
    citation: 'Aycock, J., Horspool, R.N.: Practical Earley Parsing. The Computer Journal 45(6), 620–630 (2002).',
    url: 'https://doi.org/10.1093/comjnl/45.6.620',
    sections: 'fix for ε-rules (the predictor moves the dot over nullable non-terminals); Earley parsing with the LR(0)ε automaton and its split form (kernel / predicted states)'
  }
];

export const EARLEY_THEORY_GUIDE = {
  en: {
    title: 'Earley & Earley Table Traversing Parsers (ETTP) Guide',
    overview: 'Earley parsing is a dynamic-programming (chart) method for arbitrary context-free grammars. ETTP replaces the runtime Predictor by an LR-style automaton precomputed from the grammar.',
    sections: [
      {
        heading: '1. The Classic Earley Algorithm (1970)',
        content: `Earley constructs a sequence of item sets S₀, S₁, …, Sₙ where each item is [A → α • β, j].
• Origin j points to the position in the input where matching of non-terminal A began.
• The dot (•) tracks progress through the right-hand side.
At each position, three operations drive the chart:
1. Predictor: for [A → α • B β, j] in Sᵢ (B a non-terminal) adds [B → • γ, i] to Sᵢ for every rule B → γ.
2. Scanner: for [A → α • a β, j] in Sᵢ and the next input symbol wᵢ₊₁ = a adds [A → α a • β, j] to Sᵢ₊₁.
3. Completer: for a finished item [B → γ •, k] in Sᵢ moves the dot over B in every item [A → α • B β, j] of Sₖ, adding [A → α B • β, j] to Sᵢ.
The word w₁ … wₙ is accepted when Sₙ contains [S' → S •, 0]; S' → S is an added rule (with more primes when the grammar already uses S').`
      },
      {
        heading: '2. Earley Table Traversing Parsers (ETTP 2025)',
        content: `The Predictor builds the same item sets again and again. Scott and Johnstone precompute them into a table, in the spirit of the LR(0)ε automaton of Aycock & Horspool:
• A set Sᵢ holds pairs (q, j): all items of state q, each with origin j. This works only if all items of q have the same origin, so every closure is split into two states:
  – a kernel state: items after a transition, plus the dot moved over nullable symbols — they keep the origin j;
  – its predicted state: the predicted rules [B → • γ] (closed under prediction) — origin i, the current set. The kernel state stores a link (ε) to it, and the pair (predicted, i) is added together with (kernel, j).
• Scanner: (q, j) ∈ Sᵢ and δ(q, wᵢ₊₁) = r give (r, j) ∈ Sᵢ₊₁.
• Completer: (q, j) ∈ Sᵢ with a finished rule A → γ • and (p, k) ∈ Sⱼ with δ(p, A) = r give (r, k) ∈ Sᵢ.
• No rule is expanded at runtime; a pair stands for several Earley items, so the sets are smaller.`
      },
      {
        heading: '3. Handling Epsilon (ε) Productions',
        content: `With ε-rules the plain algorithm can miss items: an ε-rule of B finishes in Sᵢ with origin i, and the Completer looks for items waiting for B in Sᵢ — but some of them are added to Sᵢ only later. Aycock & Horspool (2002): when the Predictor meets a non-terminal B that derives ε, it also moves the dot over B ([A → α B • β, j]). Then nothing is missed. In the derivation tree such a B gets the subtree of one of its ε-derivations.`
      },
      {
        heading: '4. Complexity Guarantees',
        content: `• Arbitrary CFG (including ambiguous and cyclic): O(n³) time and O(n²) space.
• Unambiguous CFG: O(n²) time.
• Earley: O(n) on a large class of grammars (his “bounded-state” grammars; his paper uses look-ahead) — but not on every LR(k) grammar. The algorithm simulated here has no look-ahead, and right recursion such as S → a S | ε on aⁿ puts into Sᵢ a completed item [S → a S •, j] for every j < i: Σ |Sᵢ| = Θ(n²).
• With Leo's transitive items (1991): O(n) time and space on every LR(k) grammar, even on every LR-regular grammar, without look-ahead.
ETTP has the same bounds as classic Earley; it saves a constant factor.`
      },
      {
        heading: "5. Leo's Transitive Items (1991)",
        content: `If [A → α • B, j] is the only item of Sₖ with B after the dot and B is its last symbol, then every completion of B with origin k also completes A with origin j — and if A is again such a symbol in Sⱼ, the next one, and so on: a deterministic reduction path. Plain Earley adds all its items to Sᵢ, Leo only the topmost one.
• Transitive item for B in Sₖ, written [C → δ •, B, m] (Marpa's triple: dotted rule, transition symbol, origin): the topmost item of the path. It is created when a completion of B with origin k first needs it (lazily, as in Leo's paper) and stored in Sₖ.
• Completer: [B → γ •, k] in Sᵢ with k < i; if Sₖ has a transitive item for B, only [C → δ •, m] is added to Sᵢ; otherwise the completer works as before.
• The skipped items are needed only for the derivation tree: they are reconstructed by walking the transitive items down again (Marpa's “Leo stack expansion”). The chart plus the reconstructed items is exactly the plain Earley chart (tested).
Here the dot must be exactly before the last symbol (Leo's condition); Marpa also allows a nullable rest and memoizes only right-recursive rules. Left recursion (S → S a | a) gets no benefit — it is already linear.`
      }
    ]
  },
  cz: {
    title: 'Průvodce algoritmy Earley a Earley Table Traversing Parsers (ETTP)',
    overview: 'Earleyův algoritmus je metoda dynamického programování (tabulková analýza) pro libovolné bezkontextové gramatiky. ETTP nahrazuje běhový prediktor automatem ve stylu LR, předpočítaným z gramatiky.',
    sections: [
      {
        heading: '1. Klasický Earleyův algoritmus (1970)',
        content: `Earley vytváří posloupnost množin položek S₀, S₁, …, Sₙ, kde každá položka má tvar [A → α • β, j].
• Počátek j odkazuje na pozici ve vstupu, kde začalo odvozování neterminálu A.
• Tečka (•) značí, kolik symbolů pravé strany již bylo přečteno a ověřeno.
Množiny vytvářejí tři operace:
1. Prediktor: pro [A → α • B β, j] v Sᵢ (B neterminál) přidá do Sᵢ položku [B → • γ, i] pro každé pravidlo B → γ.
2. Skener: pro [A → α • a β, j] v Sᵢ a další vstupní symbol wᵢ₊₁ = a přidá [A → α a • β, j] do Sᵢ₊₁.
3. Kompletor: pro dokončenou položku [B → γ •, k] v Sᵢ posune tečku za B ve všech položkách [A → α • B β, j] množiny Sₖ a přidá [A → α B • β, j] do Sᵢ.
Slovo w₁ … wₙ je přijato, obsahuje-li Sₙ položku [S' → S •, 0]; S' → S je přidané pravidlo (s více čárkami, používá-li gramatika S' sama).`
      },
      {
        heading: '2. Earley Table Traversing Parsers (ETTP 2025)',
        content: `Prediktor vytváří stále znovu tytéž množiny položek. Scott a Johnstone je předpočítají do tabulky, v duchu automatu LR(0)ε podle Aycocka a Horspoola:
• Množina Sᵢ obsahuje páry (q, j): všechny položky stavu q, každá s počátkem j. To jde jen tehdy, mají-li všechny položky q stejný počátek, proto se každý uzávěr dělí na dva stavy:
  – jádrový stav: položky po přechodu a posuny tečky přes neterminály generující ε — zachovávají počátek j;
  – jeho predikční stav: predikovaná pravidla [B → • γ] (uzavřená predikcí) — počátek i, tj. aktuální množina. Jádrový stav má na něj odkaz (ε) a pár (predikční, i) se přidá spolu s (jádrový, j).
• Skener: (q, j) ∈ Sᵢ a δ(q, wᵢ₊₁) = r dávají (r, j) ∈ Sᵢ₊₁.
• Kompletor: (q, j) ∈ Sᵢ s dokončeným pravidlem A → γ • a (p, k) ∈ Sⱼ s δ(p, A) = r dávají (r, k) ∈ Sᵢ.
• Za běhu se nerozvíjí žádné pravidlo; pár zastupuje několik položek, množiny jsou menší.`
      },
      {
        heading: '3. Zpracování prázdného slova (ε-pravidla)',
        content: `S ε-pravidly by základní algoritmus mohl položky vynechat: ε-pravidlo neterminálu B skončí v Sᵢ s počátkem i a kompletor hledá položky čekající na B v Sᵢ — některé z nich však do Sᵢ přibudou až později. Aycock a Horspool (2002): narazí-li prediktor na neterminál B, který generuje ε, posune tečku i za B ([A → α B • β, j]). Pak se nic nevynechá. V derivačním stromu má takové B podstrom jednoho ze svých odvození ε.`
      },
      {
        heading: '4. Časová a prostorová složitost',
        content: `• Libovolná CFG (i víceznačná a s cykly): čas O(n³), paměť O(n²).
• Jednoznačná CFG: čas O(n²).
• Earley: O(n) na velké třídě gramatik (jeho gramatiky „bounded-state“; článek používá výhled) — ne však na každé LR(k) gramatice. Zde simulovaný algoritmus výhled nemá a pravá rekurze jako S → a S | ε na aⁿ vloží do Sᵢ dokončenou položku [S → a S •, j] pro každé j < i: Σ |Sᵢ| = Θ(n²).
• S Leovými tranzitivními položkami (1991): čas i paměť O(n) na každé LR(k) gramatice, dokonce na každé LR-regulární, bez výhledu.
ETTP má stejné meze jako klasický Earley; šetří konstantní faktor.`
      },
      {
        heading: '5. Leovy tranzitivní položky (1991)',
        content: `Je-li [A → α • B, j] jediná položka v Sₖ s B za tečkou a B je její poslední symbol, pak každé dokončení B s počátkem k dokončí i A s počátkem j — a je-li A v Sⱼ opět takový symbol, i další atd.: deterministická redukční cesta. Earley přidá do Sᵢ všechny její položky, Leo jen nejvyšší.
• Tranzitivní položka pro B v Sₖ, psaná [C → δ •, B, m] (trojice jako v Marpě: pravidlo s tečkou, přechodový symbol, počátek): nejvyšší položka cesty. Vytvoří se, až ji dokončení B s počátkem k poprvé potřebuje (líně, jako v Leově článku), a uloží se do Sₖ.
• Kompletor: [B → γ •, k] v Sᵢ, k < i; má-li Sₖ pro B tranzitivní položku, přidá se do Sᵢ jen [C → δ •, m], jinak kompletor pracuje jako dřív.
• Vynechané položky jsou potřeba jen pro derivační strom: rekonstruují se průchodem tranzitivních položek zpět dolů (v Marpě „Leo stack expansion“). Tabulka spolu s rekonstruovanými položkami je přesně tabulka Earleyho algoritmu (ověřeno testy).
Zde musí být tečka přesně před posledním symbolem (Leova podmínka); Marpa připouští i zbytek generující ε a ukládá jen pravidla s pravou rekurzí. Levá rekurze (S → S a | a) nezíská nic — už je lineární.`
      }
    ]
  }
};
