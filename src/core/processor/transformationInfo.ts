/**
 * Reference texts for the grammar transformations: what each one does, why it
 * keeps the language, when to use it, and where it is described in the
 * literature (verified sources only).
 */

import { SymbolTransformationType } from './grammarProcessor';

export type InfoKey =
  | 'reduce' | 'eps' | 'units' | 'leftrec' | 'immediateLeftRec' | 'leftcorner'
  | 'factor' | 'rightfactor' | 'expandLeading' | 'substitute' | 'merge'
  | 'absorb' | 'splitFollow' | 'cnf' | 'gnf' | 'll1';

export interface Reference {
  citation: string;
  url?: string;
}

const KIV = 'https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/P%f8edn%e1%9aky';

export const REFERENCES: Record<string, Reference> = {
  jezek8: {
    citation: 'Ježek, K.: Formální jazyky a překladače, přednáška 8 – Bezkontextové gramatiky. KIV FAV ZČU.',
    url: `${KIV}/8/8%20BKG.DOC.pdf`
  },
  jezek910: {
    citation: 'Ježek, K.: Formální jazyky a překladače, přednáška 9 a 10 – LL(k) gramatiky. KIV FAV ZČU.',
    url: `${KIV}/9a10/9%20a%2010%20%20LLk.pdf`
  },
  vavreckova: {
    citation: 'Vavrečková, Š.: Překladače – LL překlady (prezentace 5). Slezská univerzita v Opavě.',
    url: 'https://vavreckova.zam.slu.cz/obsahy/prekl/prezentace/prekl_05_LL.pdf'
  },
  cockett: {
    citation: 'Cockett, R.: CPSC 411 Compiler Construction I – Transformations to LL(1). University of Calgary.',
    url: 'http://pages.cpsc.ucalgary.ca/~robin/class/411/LL1.3.html'
  },
  dragon: {
    citation: 'Aho, A. V., Lam, M. S., Sethi, R., Ullman, J. D.: Compilers: Principles, Techniques, and Tools. 2nd ed. Addison-Wesley, 2006.'
  },
  hmu: {
    citation: 'Hopcroft, J. E., Motwani, R., Ullman, J. D.: Introduction to Automata Theory, Languages, and Computation. 3rd ed. Addison-Wesley, 2006.'
  },
  au72: {
    citation: 'Aho, A. V., Ullman, J. D.: The Theory of Parsing, Translation, and Compiling. Vol. I: Parsing. Prentice-Hall, 1972.'
  },
  chomsky59: {
    citation: 'Chomsky, N.: On certain formal properties of grammars. Information and Control 2(2), 137–167, 1959.'
  },
  greibach65: {
    citation: 'Greibach, S. A.: A new normal-form theorem for context-free phrase structure grammars. Journal of the ACM 12(1), 42–52, 1965.'
  },
  rl70: {
    citation: 'Rosenkrantz, D. J., Lewis, P. M.: Deterministic left corner parsing. 11th Annual Symposium on Switching and Automata Theory, 139–152, 1970.'
  },
  moore00: {
    citation: 'Moore, R. C.: Removing left recursion from context-free grammars. 1st Meeting of the North American Chapter of the ACL (NAACL), 2000.',
    url: 'https://aclanthology.org/A00-2033/'
  },
  jr00: {
    citation: 'Johnson, M., Roark, B.: Compact non-left-recursive grammars using the selective left-corner transform and factoring. COLING 2000.',
    url: 'https://aclanthology.org/C00-1052/'
  },
  foster68: {
    citation: 'Foster, J. M.: A syntax improving program. The Computer Journal 11(1), 31–34, 1968.',
    url: 'https://academic.oup.com/comjnl/article/11/1/31/424306'
  },
  rs70: {
    citation: 'Rosenkrantz, D. J., Stearns, R. E.: Properties of deterministic top-down grammars. Information and Control 17, 226–256, 1970.',
    url: 'https://www.sciencedirect.com/science/article/pii/S0019995870904468'
  }
};

interface Bi {
  en: string;
  cz: string;
}

export interface TransformationInfo {
  title: Bi;
  /** Formal scheme; words are given in both languages */
  scheme: string | Bi;
  what: Bi;
  why: Bi;
  use: Bi;
  refs: { ref: keyof typeof REFERENCES; where: Bi }[];
}

export const TRANSFORMATION_INFO: Record<InfoKey, TransformationInfo> = {
  reduce: {
    title: { en: 'Removing useless symbols (reduced grammar)', cz: 'Odstranění zbytečných symbolů (redukovaná gramatika)' },
    scheme: 'N_gen = { A : A ⇒* w, w ∈ T* },  V_reach = { X : S ⇒* α X β }',
    what: {
      en: 'First the non-generating non-terminals and every rule that contains them are removed, then every symbol that is not reachable from the start symbol.',
      cz: 'Nejprve se odstraní nenormované neterminály (negenerují žádné terminální slovo) a všechna pravidla, která je obsahují, potom všechny symboly nedosažitelné z počátečního symbolu.'
    },
    why: {
      en: 'Useless symbols take part in no derivation of a word, so removing them keeps the language. The order matters: removing non-generating symbols can make others unreachable, not the other way round.',
      cz: 'Zbytečné symboly se neúčastní žádného odvození slova, jejich odstraněním se jazyk nezmění. Na pořadí záleží: odstranění nenormovaných symbolů může jiné učinit nedosažitelnými, ne naopak.'
    },
    use: {
      en: 'The first step before the other transformations; the LL(1) transformations of the lectures assume a grammar without useless symbols.',
      cz: 'První krok před ostatními úpravami; LL(1) transformace v přednáškách předpokládají gramatiku bez zbytečných symbolů.'
    },
    refs: [
      { ref: 'jezek8', where: { en: '"Odstranění zbytečných symbolů"', cz: '„Odstranění zbytečných symbolů“' } },
      { ref: 'hmu', where: { en: '§7.1.1–7.1.2', cz: '§7.1.1–7.1.2' } },
      { ref: 'au72', where: { en: '§2.4', cz: '§2.4' } }
    ]
  },
  eps: {
    title: { en: 'Eliminating ε-rules', cz: 'Odstranění ε-pravidel' },
    scheme: 'B → α A β, A ⇒* ε  ⟹  add B → α β;  remove A → ε',
    what: {
      en: 'For every rule that contains nullable non-terminals, the variants without some of their occurrences are added and the ε-rules are removed. If ε ∈ L(G) and S occurs on a right-hand side, a new start symbol S\' → S | ε keeps ε.',
      cz: 'Ke každému pravidlu s neterminály, z nichž lze odvodit ε, se přidají varianty bez některých jejich výskytů a ε-pravidla se odstraní. Je-li ε ∈ L(G) a S se vyskytuje na pravé straně, zachová ε nový počáteční symbol S\' → S | ε.'
    },
    why: {
      en: 'Every derivation that used A ⇒* ε is replaced by a rule variant that omits A; nothing else changes.',
      cz: 'Každé odvození, které využilo A ⇒* ε, nahradí varianta pravidla bez A; nic jiného se nemění.'
    },
    use: {
      en: 'Needed for CNF/GNF and before removing left recursion (otherwise it hides behind a nullable prefix). For LL(1) it is a last resort: it moves a FIRST-FOLLOW conflict into the rules that use A (Cockett: "epsilon separation").',
      cz: 'Potřebné pro CNF/GNF a před odstraněním levé rekurze (jinak se skrývá za prefixem, z něhož lze odvodit ε). Pro LL(1) je to poslední možnost: přesune kolizi FIRST-FOLLOW do pravidel, která A používají (Cockett: „epsilon separation“).'
    },
    refs: [
      { ref: 'hmu', where: { en: '§7.1.3', cz: '§7.1.3' } },
      { ref: 'jezek8', where: { en: '"Upravená gramatika" (proper grammar)', cz: '„Upravená gramatika“' } },
      { ref: 'cockett', where: { en: 'epsilon separation', cz: 'epsilon separation' } }
    ]
  },
  units: {
    title: { en: 'Eliminating unit rules', cz: 'Odstranění jednoduchých pravidel' },
    scheme: 'A ⇒* B by unit rules, B → α not a unit rule  ⟹  A → α',
    what: {
      en: 'Every unit rule A → B is replaced by the non-unit rules of all non-terminals reachable from A through unit rules.',
      cz: 'Každé jednoduché pravidlo A → B se nahradí nejednoduchými pravidly všech neterminálů dosažitelných z A přes jednoduchá pravidla.'
    },
    why: {
      en: 'A chain of unit steps followed by a non-unit step is shortened to one step; the derived words are the same. Cycles A ⇒+ A disappear.',
      cz: 'Řetězec jednoduchých kroků následovaný nejednoduchým krokem se zkrátí na jeden krok; odvozená slova jsou stejná. Zmizí cykly A ⇒+ A.'
    },
    use: {
      en: 'For CNF and for a proper (upravená) grammar; it removes cycles, which make a grammar ambiguous.',
      cz: 'Pro CNF a pro upravenou (vlastní) gramatiku; odstraní cykly, kvůli nimž je gramatika nejednoznačná.'
    },
    refs: [
      { ref: 'jezek8', where: { en: '"Odstranění jednoduchých pravidel"', cz: '„Odstranění jednoduchých pravidel“' } },
      { ref: 'hmu', where: { en: '§7.1.4', cz: '§7.1.4' } }
    ]
  },
  leftrec: {
    title: { en: "Eliminating left recursion (Paull's algorithm)", cz: 'Odstranění levé rekurze (Paullův algoritmus)' },
    scheme: 'order A₁…Aₙ;  Aᵢ → Aⱼ γ (j < i) ⟹ substitute;  then remove immediate left recursion of Aᵢ',
    what: {
      en: 'The non-terminals are ordered; for each Aᵢ, rules starting with an earlier Aⱼ get Aⱼ\'s right-hand sides substituted, and the remaining immediate left recursion is removed. ε-rules and cycles are removed first.',
      cz: 'Neterminály se uspořádají; u každého Aᵢ se do pravidel začínajících dřívějším Aⱼ dosadí pravé strany Aⱼ a zbývající přímá levá rekurze se odstraní. Napřed se odstraní ε-pravidla a cykly.'
    },
    why: {
      en: 'Substitution and immediate left-recursion removal keep the language; the invariant "Aᵢ → Aⱼ γ only for j > i" excludes any left-recursive cycle.',
      cz: 'Dosazení i odstranění přímé levé rekurze zachovávají jazyk; invariant „Aᵢ → Aⱼ γ jen pro j > i“ vylučuje levorekurzivní cyklus.'
    },
    use: {
      en: 'Top-down (LL) parsing cannot handle left recursion; this is the textbook algorithm. Moore (2000) calls it Paull\'s algorithm and shows that the left-corner transformation often gives smaller grammars.',
      cz: 'Analýza shora dolů (LL) si s levou rekurzí neporadí; toto je učebnicový algoritmus. Moore (2000) jej nazývá Paullovým algoritmem a ukazuje, že transformace levého rohu dává často menší gramatiky.'
    },
    refs: [
      { ref: 'jezek8', where: { en: '"Odstranění levé rekurze (včetně nepřímé rekurze)"', cz: '„Odstranění levé rekurze (včetně nepřímé rekurze)“' } },
      { ref: 'dragon', where: { en: '§4.3.3 Elimination of left recursion', cz: '§4.3.3 Elimination of left recursion' } },
      { ref: 'au72', where: { en: '§2.4', cz: '§2.4' } },
      { ref: 'moore00', where: { en: 'comparison with the left-corner transformation', cz: 'srovnání s transformací levého rohu' } }
    ]
  },
  immediateLeftRec: {
    title: { en: 'Eliminating immediate left recursion', cz: 'Odstranění přímé levé rekurze' },
    scheme: "A → A α | β  ⟹  A → β A',  A' → α A' | ε     or     A → β | β A',  A' → α | α A'",
    what: {
      en: "Left-recursive rules of A are replaced by right-recursive rules of a new A'. The lectures give two variants: with an ε-rule (shorter) and without it.",
      cz: "Levorekurzivní pravidla A se nahradí pravorekurzivními pravidly nového A'. Přednášky uvádějí dvě varianty: s ε-pravidlem (kratší) a bez něj."
    },
    why: { en: 'Both generate β α*.', cz: 'Obě generují β α*.' },
    use: {
      en: 'The ε variant gives the classic LL(1) form (E → T E\', E\' → + T E\' | ε); the ε-free variant needs left factoring afterwards.',
      cz: 'Varianta s ε dává klasický LL(1) tvar (E → T E\', E\' → + T E\' | ε); varianta bez ε potřebuje následnou levou faktorizaci.'
    },
    refs: [
      { ref: 'jezek8', where: { en: '"Odstranění pravidla rekurzivního zleva", both variants', cz: '„Odstranění pravidla rekurzivního zleva“, obě varianty' } },
      { ref: 'vavreckova', where: { en: '"Postup odstranění levé rekurze"', cz: '„Postup odstranění levé rekurze“' } },
      { ref: 'dragon', where: { en: '§4.3.3', cz: '§4.3.3' } }
    ]
  },
  leftcorner: {
    title: { en: 'Left-corner transformation', cz: 'Transformace levého rohu' },
    scheme: 'A → X [A-X]  (X ∉ N_L left corner),   [A-X] → β [A-B]  for B → X β,   [A-A] → ε',
    what: {
      en: 'Only the left-recursive non-terminals N_L are rewritten. A derivation of A goes down its left corners to a symbol X outside N_L; the new grammar generates X first and then climbs back up to A with the helpers [A-B].',
      cz: 'Přepisují se jen levorekurzivní neterminály N_L. Odvození z A sestupuje po levých rozích k symbolu X mimo N_L; nová gramatika vygeneruje nejprve X a pomocnými neterminály [A-B] „stoupá“ zpět k A.'
    },
    why: {
      en: 'Each left spine of a derivation corresponds to exactly one chain of [A-·] rules. A left-recursive cycle in the result would need a left-recursive X ∉ N_L, which is impossible (ε-free, cycle-free grammar).',
      cz: 'Každé levé větvi odvození odpovídá právě jeden řetězec pravidel [A-·]. Levorekurzivní cyklus ve výsledku by vyžadoval levorekurzivní X ∉ N_L, což nelze (gramatika bez ε-pravidel a cyklů).'
    },
    use: {
      en: 'An alternative to Paull\'s algorithm that needs no order of the non-terminals and keeps the other non-terminals; the selective form is from Johnson (1998) and Johnson & Roark (2000).',
      cz: 'Alternativa k Paullovu algoritmu bez uspořádání neterminálů, ostatní neterminály zůstávají; selektivní podoba podle Johnsona (1998) a Johnsona a Roarka (2000).'
    },
    refs: [
      { ref: 'rl70', where: { en: 'the original left-corner construction', cz: 'původní konstrukce levého rohu' } },
      { ref: 'moore00', where: { en: 'left-corner transform restricted to left-recursive non-terminals', cz: 'transformace levého rohu omezená na levorekurzivní neterminály' } },
      { ref: 'jr00', where: { en: 'selective left-corner transform', cz: 'selektivní transformace levého rohu' } }
    ]
  },
  factor: {
    title: { en: 'Left factoring', cz: 'Levá faktorizace (vytýkání)' },
    scheme: "A → α β₁ | α β₂  ⟹  A → α A',  A' → β₁ | β₂",
    what: { en: 'A common prefix α of several alternatives is factored out into a new non-terminal.', cz: 'Společný prefix α několika alternativ se vytkne a jejich zbytky tvoří nový neterminál.' },
    why: { en: 'Distributivity of concatenation over alternation: α β₁ | α β₂ = α (β₁ | β₂).', cz: 'Distributivita zřetězení vůči alternativě: α β₁ | α β₂ = α (β₁ | β₂).' },
    use: {
      en: 'Removes FIRST-FIRST conflicts caused by a common prefix: the choice is postponed until α has been read.',
      cz: 'Odstraní kolize FIRST-FIRST způsobené společným prefixem: volba se odloží až za přečtení α.'
    },
    refs: [
      { ref: 'jezek910', where: { en: 'p. 20, FIRST-FIRST conflict', cz: 's. 20, kolize FIRST-FIRST' } },
      { ref: 'vavreckova', where: { en: '"Postup faktorizace pravidel"', cz: '„Postup faktorizace pravidel“' } },
      { ref: 'dragon', where: { en: '§4.3.4 Left factoring', cz: '§4.3.4 Left factoring' } },
      { ref: 'cockett', where: { en: 'step 3', cz: 'krok 3' } }
    ]
  },
  rightfactor: {
    title: { en: 'Right factoring (common suffixes)', cz: 'Pravá faktorizace (společné přípony)' },
    scheme: "A → α₁ β | α₂ β  ⟹  A → A' β,  A' → α₁ | α₂",
    what: { en: 'The mirror image of left factoring: a common suffix β is factored out.', cz: 'Zrcadlová obdoba levé faktorizace: vytkne se společná přípona β.' },
    why: { en: 'α₁ β | α₂ β = (α₁ | α₂) β.', cz: 'α₁ β | α₂ β = (α₁ | α₂) β.' },
    use: {
      en: 'Makes a grammar shorter; it does not help LL(1) (the alternatives keep their beginnings). No source dedicated to it was found; it is the symmetric counterpart of left factoring.',
      cz: 'Zkrátí gramatiku; pro LL(1) nepomůže (alternativy si ponechají své začátky). Samostatný zdroj se nepodařilo najít; jde o symetrický protějšek levé faktorizace.'
    },
    refs: [{ ref: 'dragon', where: { en: '§4.3.4 (left factoring, the symmetric case)', cz: '§4.3.4 (levá faktorizace, symetrický případ)' } }]
  },
  expandLeading: {
    title: { en: 'Eliminating rules with a leading non-terminal', cz: 'Eliminace pravidel s neterminálem na začátku' },
    scheme: 'A → B γ,  B → δ₁ | δ₂  ⟹  A → δ₁ γ | δ₂ γ',
    what: { en: 'The right-hand sides of B are substituted for B at the beginning of the rules of A.', cz: 'Do pravidel A se na místo úvodního B dosadí pravé strany B.' },
    why: { en: 'Substitution (unfolding) of a non-terminal never changes the language.', cz: 'Dosazení (rozvinutí) neterminálu nikdy nemění jazyk.' },
    use: {
      en: 'Exposes FIRST-FIRST conflicts hidden behind a non-terminal so that left factoring can remove them (Cockett: "expose first set clashes").',
      cz: 'Odkryje kolize FIRST-FIRST skryté za neterminálem, aby je mohla odstranit levá faktorizace (Cockett: „expose first set clashes“).'
    },
    refs: [
      { ref: 'jezek910', where: { en: 'p. 20, "Na faktorizovatelný tvar lze převést eliminací pravidel"', cz: 's. 20, „Na faktorizovatelný tvar lze převést eliminací pravidel“' } },
      { ref: 'jezek8', where: { en: '"Odstranění libovolného pravidla"', cz: '„Odstranění libovolného pravidla“' } },
      { ref: 'vavreckova', where: { en: '"Eliminace pravidel"', cz: '„Eliminace pravidel“' } },
      { ref: 'cockett', where: { en: 'step 2', cz: 'krok 2' } }
    ]
  },
  substitute: {
    title: { en: 'Substitution (rule elimination)', cz: 'Dosazení (eliminace pravidel)' },
    scheme: 'C → α B β,  B → γ₁ | … | γₙ  ⟹  C → α γ₁ β | … | α γₙ β',
    what: {
      en: 'The right-hand sides of B are substituted for an occurrence of B (or for all of them); a non-terminal that nothing refers to any more is removed.',
      cz: 'Za výskyt B (nebo za všechny výskyty) se dosadí pravé strany B; neterminál, na který už nic neodkazuje, se odstraní.'
    },
    why: { en: 'Unfolding a non-terminal keeps the language.', cz: 'Rozvinutí neterminálu zachovává jazyk.' },
    use: {
      en: 'Shortens a grammar (the lecture removes E\' and T\' this way) and changes FOLLOW sets, which can help with FIRST-FOLLOW conflicts.',
      cz: 'Zkrátí gramatiku (přednáška tak vylučuje E\' a T\') a mění množiny FOLLOW, což může pomoci u kolizí FIRST-FOLLOW.'
    },
    refs: [
      { ref: 'jezek910', where: { en: 'p. 22, "Vyloučíme E\' a T\' dosazením"', cz: 's. 22, „Vyloučíme E\' a T\' dosazením“' } },
      { ref: 'jezek8', where: { en: '"Odstranění libovolného pravidla"', cz: '„Odstranění libovolného pravidla“' } },
      { ref: 'vavreckova', where: { en: '"Eliminace pravidel"', cz: '„Eliminace pravidel“' } }
    ]
  },
  merge: {
    title: { en: 'Merging non-terminals with the same rules', cz: 'Sloučení neterminálů se stejnými pravidly' },
    scheme: 'rules(B)[B := A] = rules(A)[B := A]  ⟹  replace B by A',
    what: { en: 'Two non-terminals whose rules are equal up to renaming one to the other are merged.', cz: 'Dva neterminály, jejichž pravidla jsou stejná až na přejmenování jednoho na druhý, se sloučí.' },
    why: { en: 'They generate the same language (the same generative power).', cz: 'Generují tentýž jazyk (mají tutéž generativní schopnost).' },
    use: { en: 'Cleans up after factoring, which often creates copies (E₁ and E₂ in the lecture).', cz: 'Úklid po faktorizaci, která často vytváří kopie (E₁ a E₂ v přednášce).' },
    refs: [{ ref: 'jezek910', where: { en: 'p. 22, "E1 a E2 mají tutéž generační schopnost"', cz: 's. 22, „E1 a E2 mají tutéž generační schopnost“' } }]
  },
  absorb: {
    title: { en: 'Absorbing the following terminal', cz: 'Pohlcení terminálu' },
    scheme: 'A → α B a β,  B → α₁ | … | αₙ  ⟹  A → α [Ba] β,  [Ba] → α₁ a | … | αₙ a',
    what: {
      en: 'A new non-terminal [Ba] generates exactly the words of B followed by a and replaces the pair B a.',
      cz: 'Nový neterminál [Ba] generuje právě slova B následovaná a a nahradí dvojici B a.'
    },
    why: {
      en: 'L([Ba]) = L(B)·a; folding the pair inside the new rules is sound because they arose by unfolding B.',
      cz: 'L([Ba]) = L(B)·a; nahrazení dvojice i v nových pravidlech je korektní, protože vznikla rozvinutím B.'
    },
    use: {
      en: 'Turns a FIRST-FOLLOW conflict of B on a into a FIRST-FIRST conflict of [Ba], which left factoring can remove. It may create other conflicts (the lecture warns that removing one conflict can cause another).',
      cz: 'Změní kolizi FIRST-FOLLOW neterminálu B na a na kolizi FIRST-FIRST v [Ba], kterou odstraní levá faktorizace. Může vytvořit jiné kolize (přednáška upozorňuje, že odstraněním jedné kolize lze způsobit jinou).'
    },
    refs: [
      { ref: 'jezek910', where: { en: 'p. 21, "pohlcení terminálu"', cz: 's. 21, „pohlcení terminálu“' } },
      { ref: 'cockett', where: { en: 'step 4, FIRST/FOLLOW clashes', cz: 'krok 4, kolize FIRST/FOLLOW' } }
    ]
  },
  splitFollow: {
    title: { en: 'Reduction of FOLLOW sets (a copy for one occurrence)', cz: 'Redukce množin FOLLOW (kopie pro jeden výskyt)' },
    scheme: 'C → α B β  ⟹  C → α B₂ β,  B₂ → (rules of B)',
    what: { en: 'One occurrence of B gets a copy B₂ with the same rules.', cz: 'Jeden výskyt B dostane kopii B₂ se stejnými pravidly.' },
    why: { en: 'B₂ generates the same language as B.', cz: 'B₂ generuje tentýž jazyk jako B.' },
    use: {
      en: 'FOLLOW(B₂) contains only what follows this occurrence, so a FIRST-FOLLOW conflict caused elsewhere no longer concerns it.',
      cz: 'FOLLOW(B₂) obsahuje jen to, co následuje za tímto výskytem, takže se ho netýká kolize FIRST-FOLLOW způsobená jinde.'
    },
    refs: [{ ref: 'vavreckova', where: { en: '"Redukce množin FOLLOW"', cz: '„Redukce množin FOLLOW“' } }]
  },
  cnf: {
    title: { en: 'Chomsky normal form', cz: 'Chomského normální forma' },
    scheme: 'A → B C,  A → a,  (S → ε)',
    what: {
      en: 'After removing ε-rules, unit rules and useless symbols, terminals in long rules are replaced by proxies X_a → a and long rules are split into pairs.',
      cz: 'Po odstranění ε-pravidel, jednoduchých pravidel a zbytečných symbolů se terminály v dlouhých pravidlech nahradí zástupci X_a → a a dlouhá pravidla se rozdělí na dvojice.'
    },
    why: { en: 'Each step keeps the language.', cz: 'Každý krok zachovává jazyk.' },
    use: { en: 'For the CYK algorithm and proofs (pumping lemma, decidability).', cz: 'Pro algoritmus CYK a důkazy (lemma o vkládání, rozhodnutelnost).' },
    refs: [
      { ref: 'chomsky59', where: { en: 'original definition', cz: 'původní definice' } },
      { ref: 'jezek8', where: { en: '"Chomského normální forma (CNF)"', cz: '„Chomského normální forma (CNF)“' } },
      { ref: 'hmu', where: { en: '§7.1.5', cz: '§7.1.5' } }
    ]
  },
  gnf: {
    title: { en: 'Greibach normal form', cz: 'Greibachové normální forma' },
    scheme: 'A → a B₁ … Bₖ,  (S → ε)',
    what: {
      en: 'From CNF: order the non-terminals, substitute so that Aᵢ → Aⱼ γ only for j > i, remove immediate left recursion with new Zᵢ, then substitute back so that every rule starts with a terminal.',
      cz: 'Z CNF: neterminály se uspořádají, dosazením se dosáhne Aᵢ → Aⱼ γ jen pro j > i, přímá levá rekurze se odstraní novými Zᵢ a zpětným dosazením začne každé pravidlo terminálem.'
    },
    why: { en: 'Only substitution and left-recursion removal are used, both keep the language.', cz: 'Používá se jen dosazení a odstranění levé rekurze, obojí zachovává jazyk.' },
    use: { en: 'Every derivation step reads one terminal; the basis of real-time pushdown automata.', cz: 'Každý krok odvození přečte jeden terminál; základ zásobníkových automatů pracujících v reálném čase.' },
    refs: [
      { ref: 'greibach65', where: { en: 'original theorem', cz: 'původní věta' } },
      { ref: 'jezek8', where: { en: '"Greibachové normální forma"', cz: '„Greibachové normální forma“' } },
      { ref: 'au72', where: { en: '§2.4', cz: '§2.4' } }
    ]
  },
  ll1: {
    title: { en: 'Automatic attempt to transform to LL(1)', cz: 'Automatický pokus o převod na LL(1)' },
    scheme: {
      en: '1. left recursion  2. expose FIRST clashes  3. left factoring  4. FIRST/FOLLOW clashes  → repeat from 2',
      cz: '1. levá rekurze  2. odkrytí kolizí FIRST  3. levá faktorizace  4. kolize FIRST-FOLLOW  → opakovat od 2'
    },
    what: {
      en: 'Prepares the grammar (useless symbols, cycles), removes left recursion, then repeatedly picks an LL(1) conflict (FIRST-FIRST first) and applies the remedy of the lectures: left factoring of a common prefix, substitution of a leading non-terminal, absorption of the following symbol, removal of an ε-rule as the last resort. Equivalent non-terminals are merged on the way; after success, non-terminals used only in one unit rule are substituted.',
      cz: 'Připraví gramatiku (zbytečné symboly, cykly), odstraní levou rekurzi a pak opakovaně vybírá kolizi LL(1) (nejprve FIRST-FIRST) a použije postup z přednášek: levou faktorizaci společného prefixu, dosazení úvodního neterminálu, pohlcení následujícího symbolu a jako poslední možnost odstranění ε-pravidla. Průběžně slučuje ekvivalentní neterminály; po úspěchu dosadí neterminály použité jen v jednom jednoduchém pravidle.'
    },
    why: {
      en: 'Every operation keeps the language; the result is therefore always equivalent, but it need not be LL(1).',
      cz: 'Každá operace zachovává jazyk; výsledek je proto vždy ekvivalentní, nemusí však být LL(1).'
    },
    use: {
      en: 'Success is not guaranteed: an ambiguous grammar or a language that is not LL(1) cannot be transformed, and the process can grow the grammar without end. The attempt stops after 10 rounds without progress (a FIRST-FIRST conflict counts twice, a FIRST-FOLLOW conflict once) and keeps the best state; every operation is listed with its reason. Foster\'s SID (1968) was an early program of this kind; it, too, reported why it failed.',
      cz: 'Úspěch není zaručen: nejednoznačnou gramatiku ani jazyk, který není LL(1), převést nelze a postup může gramatiku zvětšovat bez konce. Pokus se zastaví po 10 kolech bez zlepšení (kolize FIRST-FIRST se počítá dvakrát, FIRST-FOLLOW jednou) a ponechá nejlepší dosažený stav; každá operace je uvedena se zdůvodněním. Fosterův SID (1968) byl raný program tohoto druhu; i on hlásil, proč selhal.'
    },
    refs: [
      { ref: 'cockett', where: { en: 'the order of the steps', cz: 'pořadí kroků' } },
      { ref: 'jezek910', where: { en: 'pp. 20–22, "Rezultativnost LL(1) transformace se nezaručuje"', cz: 's. 20–22, „Rezultativnost LL(1) transformace se nezaručuje“' } },
      { ref: 'vavreckova', where: { en: 'transformation to LL(1) is a non-deterministic process', cz: 'transformace na LL(1) je nedeterministický postup' } },
      { ref: 'foster68', where: { en: 'SID, automatic transformation to a one-track (LL(1)) grammar', cz: 'SID, automatický převod na „one-track“ (LL(1)) gramatiku' } },
      { ref: 'rs70', where: { en: 'theory of deterministic top-down (LL(k)) grammars', cz: 'teorie deterministických gramatik pro analýzu shora dolů (LL(k))' } },
      { ref: 'dragon', where: { en: '§4.3.3–4.3.4', cz: '§4.3.3–4.3.4' } }
    ]
  }
};

/** The reference entry for a transformation offered in the menus. */
export function infoKeyForType(type: SymbolTransformationType): InfoKey {
  switch (type) {
    case 'eliminateImmediateLeftRecursion':
    case 'eliminateImmediateLeftRecursionEpsFree':
      return 'immediateLeftRec';
    case 'leftCorner': return 'leftcorner';
    case 'leftFactor': return 'factor';
    case 'rightFactor': return 'rightfactor';
    case 'eliminateEpsilon': return 'eps';
    case 'eliminateUnit': return 'units';
    case 'substitute':
    case 'expandOccurrence':
      return 'substitute';
    case 'expandLeadingNT': return 'expandLeading';
    case 'mergeEquivalent': return 'merge';
    case 'removeUnproductive':
    case 'removeUnreachable':
      return 'reduce';
    case 'absorbFollowing': return 'absorb';
    case 'splitFollow': return 'splitFollow';
  }
}

/** The reference entry for a whole-grammar transformation (ids of WHOLE_GRAMMAR_TRANSFORMATIONS). */
export const WHOLE_GRAMMAR_INFO: Record<string, InfoKey> = {
  reduce: 'reduce', eps: 'eps', units: 'units', leftrec: 'leftrec', leftcorner: 'leftcorner',
  factor: 'factor', rightfactor: 'rightfactor', cnf: 'cnf', gnf: 'gnf', ll1: 'll1'
};
