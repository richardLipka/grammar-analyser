# Review of GrammarAnalyser (October 2026)

This review covers the formal correctness of the analyser and of the grammar transformations, the UI, and the educational value of each screen. Everything listed under *Fixed* is part of the same commit and is covered by `src/test/correctness.test.ts`. That suite adds 100 tests to the existing 24, and every transformation is checked for language equivalence: an Earley recognizer compares L(G) and L(G′) on all words up to length 5.

## 1. Formal correctness: bugs found and fixed

### Grammar parser

| Problem | Effect | Fix |
|---|---|---|
| `e` was an ε keyword, and quoted tokens went through the same ε/non-terminal lookup | `A -> "e"` became `A -> ε`. This silently changed the preset "SLR(1) vs LALR(1)" into a different grammar. | Bare `e` is no longer ε. Quoted symbols are always terminals. |
| `#` was both a comment marker and an ε symbol | `S -> # \| "a" S` lost the alternative `a S` | `#` is ε when it forms a whole alternative, otherwise it starts a comment |
| A line holding only `;` (Yacc style) | It produced an extra ε-rule (`expr -> ε`) | A terminator line or a trailing `;`/`.` ends the rule |
| The rule operator was searched inside quotes and after `\|` | `\| "b" "=" "c"` became a rule with the LHS `\| "b" "` | The operator is searched outside quotes only, the LHS must be a single symbol, and lines starting with `\|` are continuations |
| `<` without a closing `>` | `E -> E < E` lost the `<` | `<…>` is a non-terminal only with a closing `>` |
| Non-ASCII letters | `Výraz` was split into `V`, `ý`, `raz` | Unicode identifiers are supported |
| Silent problems | An undefined `A` became a terminal; duplicate rules caused fake LL conflicts; `$` clashed with the end marker | These are reported as warnings or errors (both localized). Errors now block the analysis instead of being ignored. |

### LL analysis

- **First/First vs. First/Follow.** The classification checked whether the *non-terminal* was nullable, not the conflicting alternative. In `A -> a x | a y | ε`, the conflict on `a` was reported as First/Follow. Each cell now records for every rule whether the lookahead came from FIRST₁(α) or from FOLLOW₁(A), and the UI shows that reason.
- **"LL(2)" was strong LL(2).** The check used FOLLOW₂, which for k ≥ 2 is the *strong* LL(k) condition, a strictly smaller class. The exact Aho–Ullman test with local follow sets was added, and both results are shown. The new preset *LL(2) but not strong LL(2)* demonstrates the difference.
- **Step bound.** The simulators stopped after 200 steps, so inputs longer than about 40 tokens were reported as "possible loop". The bound now scales with the input length.

### LR analysis

- **Inconsistent trace.** The simulator recorded the stacks *after* an action but the input *before* it. A shifted token therefore appeared on the stack and in the input at the same time, and the highlighted table row did not match the top of the shown stack. Every step now records the configuration in which the action is taken, as in textbook trace tables.
- **Partial tree.** Only the most recent subtree was shown. The whole parse forest on the stack is shown now.

### Transformations

| Transformation | Problem | Fix |
|---|---|---|
| **GNF** | Not implemented: the "GNF" button returned the CNF grammar, with a step text claiming that all rules start with a terminal | A real construction: CNF, ordering, substitution, ε-free left-recursion removal with new Zᵢ, back-substitution. The tests check the GNF form and language equivalence. |
| ε-elimination | The new start symbol was always `S'` and was never checked for freshness. With an existing `E'` (e.g. after left-recursion removal) both merged, which changed the language. | Fresh names. `S -> ε` is kept directly when S occurs on no right-hand side. Non-terminals that derived only ε are cleaned up. |
| ε-elimination for one symbol | `B -> A` with `A -> ε` lost `B ⇒* ε`, so ε disappeared from L(G) | When a variant becomes empty, `B -> ε` is added |
| Paull's algorithm | `A -> A b` (no non-recursive rule) became `A -> A'`, `A' -> b A' \| ε`. This changed ∅ to b*. The ε/unit preprocessing was done silently. | Non-generating symbols are removed first. Preprocessing runs only when needed and is logged. |
| CNF | Two new start symbols (`S0`, then `S0'`); proxy and chain names were easy to confuse (`T_1` vs `T_plus`) | A new start symbol only when needed; proxies are `X_a`, chains are shared `C_n` |
| Remove unproductive | Offered for the start symbol, which broke the grammar | Not offered for the start symbol |
| All per-symbol transformations | Terminal sets were not recomputed, and rules were reordered | Terminals are recomputed and rules stay in place |
| Apply to editor | Terminals were written unquoted. `:=` became two tokens and `T_+` could not be parsed. | `formatGrammarForEditor` quotes terminals and brackets non-identifier non-terminals (a round-trip is tested) |

### Other

- **Wrong presets.** "LR(0) vs SLR(1)" used `S -> L = R | R`, the classic *not SLR(1)* grammar. "SLR(1) vs LALR(1)" was the LALR-vs-LR(1) grammar with renamed terminals. Both were replaced, and the classification of every preset is now a test.
- **LaTeX.** ε ended up in text mode, which does not compile. `{`, `}` and `$` were not escaped. Forest nodes broke on `,` `[` `]`. Symbols are now typeset in math mode (`\mathtt` for terminals, `\mathit` for non-terminals).
- **FIRST/FOLLOW screen.** The column "FIRST₁(RHS)" showed only the first symbol of the right-hand side. ε in FIRST₂/FOLLOW₂ was shown as an empty string, and the sets were cut after 8 elements.
- **Word generator.** The BFS could explode on recursive grammars, and the random derivations often failed. There is now a bound on explored forms, non-generating forms are pruned, and random derivations use minimal-height rules, which guarantees termination.

## 2. UI fixes

- **Error reports overlapping the menu.** The tab bar was a flex item with `overflow-x: auto`, so it shrank to about 17 px whenever the content was tall, and the cards slid under the clipped tabs. It now keeps its height (`flex-shrink: 0`), wraps instead of hiding tabs, and stays pinned on desktop and phones. Phones use one scrollable row.
- **Light theme contrast.** Borders, text and accent colors are darker. The graphs and trees use dedicated `--graph-*` tokens: dark edges, 2 px outlines, dark labels, and filled nodes for terminals and non-terminals. SVG/PNG exports inline the computed styles, so exported images keep the contrast.
- **Graph.** Several transitions between the same two states were drawn as one edge with overlapping labels. They are merged into one labelled edge now. State labels are localized.
- **Parse trees.** A general graph layout could reorder siblings. A tidy-tree layout now keeps the yield in order, with an optional leaf row.
- **Other.**
  - Wheel zoom no longer scrolls the page, and zooming goes towards the cursor.
  - Fit-to-view on load.
  - The speed slider now speeds up to the right.
  - Keyboard stepping (←/→).
  - The `btn-danger` style was missing.
  - Theme and language are remembered.
  - Presets are grouped by category and show their description.

## 3. Screens: what was improved and further suggestions

**Overview.**
Done:
- explanation of the class hierarchy;
- number of states per method;
- ε ∈ L(G) and L(G) = ∅;
- immediate, indirect and hidden left recursion;
- cycles A ⇒⁺ A.

Suggested:
- an *ambiguity witness*: a bounded search for a word with two leftmost derivations, shown as two trees (e.g. dangling else);
- grammar save/load (sharing through a link is done, see section 5).

**FIRST & FOLLOW.**
Done:
- correct FIRST₁(α);
- LOOKAHEAD₂;
- a definitions hint.

Suggested:
- the fixed-point iteration shown round by round, as in exercises (Nε, FIRST and FOLLOW tables per iteration);
- for every FOLLOW element, the rule that contributed it.

**Transformations.**
Done:
- grammar after every step;
- added and removed rules;
- normal-form checklist;
- explained preprocessing.

Suggested:
- let the student choose the order A₁…Aₙ for Paull and GNF;
- a CYK table for CNF grammars (membership with the triangular table);
- an "exercise mode" that hides the result until the student types their own grammar, then checks equivalence on short words with the same Earley test that the unit tests use.

**LL analyser.**
Done:
- conflict reasons per rule;
- exact LL(2) vs. strong LL(2);
- trace table;
- a warning that a rejection under conflicts proves nothing.

Suggested:
- the LL(2) tables T_{A,L} and an LL(2) simulator;
- panic-mode error recovery with synchronizing sets.

**LR analyser.**
Done:
- textbook trace `$ 0 E 1 + 6 …`;
- parse forest;
- per-variant explanation;
- GOTO lookup highlighted.

Suggested:
- yacc-style precedence/associativity declarations to resolve conflicts (dangling else, ambiguous expressions);
- for each conflict, the items that cause it (and for LALR, which LR(1) states were merged);
- highlight the current state in the automaton graph while simulating.

**Automaton graph.**
Done:
- kernel/closure separation;
- complete items highlighted;
- conflict states outlined;
- merged edges;
- localized labels.

Suggested:
- step-by-step construction of the canonical collection (CLOSURE and GOTO animation);
- a TikZ export of the automaton.

**Word generator.**
Done:
- the non-terminal rewritten next and the produced symbols highlighted;
- yield row in the tree;
- reliable random words.

Suggested:
- a membership test of an arbitrary word (Earley) with all its parse trees, which also demonstrates ambiguity;
- rightmost derivations, to connect with LR (reverse rightmost derivation).

**LaTeX & export.**
Done:
- compile-ready math typesetting;
- choice of LR table variant;
- forest trees.

Suggested:
- export of derivation sequences and LR item sets;
- code-split the bundle (the build warns about a 535 kB chunk).

## 4. Follow-up: input formats, LL(2) tables, Czech terminology

- **Input formats.** These are tested in `src/test/formats.test.ts` with:
  - the calculator from the Bison manual;
  - GNU-style Yacc;
  - an ANTLR 4 expression grammar in the style of *The Definitive ANTLR 4 Reference*;
  - the JSON grammar from grammars-v4;
  - textbook notation.
- **ANTLR EBNF.** Groups and repetitions become auxiliary non-terminals, for example `prog_list → stat prog_list | ε`.
- **KIV/FJP conventions.** The KIV/FJP lectures write the empty word as `e` and use compact rules such as `A → bSA`. Both are accepted:
  - Bare `e` is ε again; quoted `"e"` stays a terminal.
  - A compact rule is split into symbols when every left-hand side is a single capital letter.
- **LL(2).**
  - New preset: the strong LL(2) grammar G8 from the lectures.
  - When a grammar is not LL(1), the LL(k) tab shows the strong LL(2) parse table M[A, xy]. When the strong table has conflicts, it also shows the Aho–Ullman tables T(A, L).
  - The simulator switches between LL(1) and LL(2) and shows the left parse; the LR simulator shows the right parse.
- **Czech terminology** now follows the KIV/FJP lectures and the Czech literature:
  - *množina řídicích symbolů* (director set);
  - *rozkladová tabulka*;
  - *kolize FIRST-FIRST / FIRST-FOLLOW*;
  - *Expanze / Srovnání / Přijetí*;
  - *přesun / redukce*;
  - *levý / pravý rozklad*;
  - *silná LL(k)*;
  - *nenormované* and *nedosažitelné* (useless) symbols;
  - *ε-pravidla*, *jednoduchá pravidla*, *vlastní (upravená) gramatika*.
- **Defaults.** The app starts in Czech with the light theme. An explicit choice of language or theme is remembered.

## 5. Follow-up: rules copied from slides, the e question, grammar links

- **Rules as written on the KIV/FJP slides** are read without editing, for example `S --> aAS    (1)` or `E' --> +TE'    (2)`, with blank lines between the rules:
  - Rule numbers `(1)` or `[1]` after a right-hand side, and `(1)`, `1.` or `1)` before a rule, are labels. Before this change, `(1)` became three terminals. A warning appears when the written numbers differ from the numbering used in the tables (the start symbol's rules come first).
  - Compact right-hand sides are split by the longest match against the defined non-terminals, so primes and digits stay part of a non-terminal (`E'`, `A1`, `A2A3`) while `0A1` is `0 A 1` when `A1` is not defined.
  - `;` followed by a new rule separates rules on one line (`S -> aAS | b; A -> a | bSA`), which helps in links.
- **The e question.** A standalone `e` is ambiguous: it is ε in the KIV/FJP lectures but an ordinary terminal elsewhere. The editor now asks *Znamená e prázdné slovo?* The grammar is read as ε until the user answers, the answer re-runs the analysis at once, and it can be changed later. A quoted `"e"` is always a terminal and never triggers the question. The built-in examples use `ε`, so they never ask.
- **Grammar links.** `?g=<grammar>&w=<word>&tab=ll&e=eps` opens and analyses a grammar immediately; `preset`, `lang` and `theme` are also accepted, both in the query and after `#`. The *Odkaz* (Link) button copies the link for the current grammar, input word and tab. If copying is not allowed, it puts the link in the address bar. Tests: `src/test/urlState.test.ts`, and the slide notation in `src/test/formats.test.ts`.
- **One rule per line.** A grammar from a link is shown in the editor with every rule on its own line; alternatives stay together. The rules may be separated by `;` or by a space before the next `A ->`, as in `S->aAS|b A->a|bSA`. The parser accepts both separators when they are typed in the editor too.
- **Author credit.** The header shows the FAV mark (linking to KIV), © 2026 Richard Lipka (linking to home.zcu.cz/~lipka), the e-mail, the MIT licence and GitHub, as in the author's other teaching tools. The mark uses the theme's text colour. `LICENSE` excludes the university mark from the MIT terms.

## 6. LR tables as in the KIV/FJP lectures

I checked the tables against *11 a 12 LR.pdf*: the SLR(1) tables of G12 and G13, the LALR(1) table of G14 and the SLR(1) conflict of G14 matched the lecture entry by entry. The LR(1) automata had the textbook sizes (22 and 14 states). There was one classification bug and one difference of presentation:

- **Strict LR(0).** The accept action was placed only in the `$` column. A state such as {S' → S•, S → S•a} therefore did not count as a conflict. The app called `S → S a | b` and the lecture's G13 `S → S(A) | e` LR(0), although by the lecture's definition neither is LR(0): S' → S• is a complete item, and an LR(0) language must be prefix-free. For the expression grammar the conflict in E₁ was missed. Accept is now an action of the state (in the Dragon Book layout it fills the whole row like the reductions), and the simulator rejects an accept with unread input.
- **The lecture layout** is now the default:
  - States are named by the symbol that leads into them, with subscripts for repeated symbols. The initial state is `#`. For G12–G14 the names are the lecture's own.
  - The table of actions f contains P / R*i* / A, without target states. For LR(0) it has one column, decided by the state alone.
  - The table of transitions g covers all terminals and non-terminals.
  - The simulator runs the lecture's two steps (f, then g for the symbol pushed), and its stack reads `# E₁ + T₂`.
- **The Dragon Book layout** (numbered states, `s5` / `r2` / `acc`, GOTO for non-terminals) stays available. A switch at the top of the LR, automaton and LaTeX screens selects the layout, and the choice is remembered.

The tests in `src/test/lrLecture.test.ts` use the lecture's examples G11–G14 and its traces. G11 is the only difference: the lecture numbers the two `b` states the other way round, because it indexes the occurrences of `b` in the rules rather than the item sets.

## 7. Transformations applied directly to the grammar; LL(1) transformations in the literature

**Interface.** The editor has two modes, *Text* and *Úpravy kliknutím* (transform by clicking).
- In click mode, a click on a non-terminal opens its transformations. On a left-hand side they apply to the whole non-terminal; on a right-hand side they apply to that occurrence. The chosen transformation is applied to the grammar in the editor at once.
- LL(1) conflicts are marked FF and FFL, and the actions that address them are tagged *řeší kolizi*.
- Undo and redo (also Ctrl+Z and Ctrl+Y) cover transformations, loaded examples and typing. Typing becomes one step after a short pause.
- The Transformations tab is now the protocol of all steps with their explanations, and any earlier state can be restored from it. It also keeps the transformations of the whole grammar and the normal-form checklist.
- The grammar is written back to the editor without quotes where that is unambiguous (`S → a A S | b`), so text in lecture notation stays readable.

**Sources read:**
- **Ježek, KIV/FJP, *9 a 10 LLk*, pp. 20–22.** The lecture distinguishes FIRST-FIRST and FIRST-FOLLOW conflicts.
  - FF: removed by left factoring, after rules have been eliminated if necessary.
  - FFL: removed by *pohlcení terminálu*. `A → α B a β` becomes `A → α [Ba] β`, `[Ba] → α₁ a | … | αₙ a`, which turns the conflict into an FF conflict of `[Ba]`.
  - It replaces non-terminals with the same generative power (E₁ and E₂) by one of them, and eliminates E′ and T′ by substitution.
  - It warns that removing an FF conflict can create an FFL conflict and vice versa, and that the transformation to LL(1) is not guaranteed to succeed.
- **Ježek, KIV/FJP, *8 BKG*.** Two forms of left-recursion removal: without ε (`A → βᵢ | βᵢA'`, `A' → αᵢ | αᵢA'`) and the shorter one with ε.
- **Vavrečková, SLU, *prekl_05_LL*.** Lists the basic LL(1) transformations: left-recursion removal, factoring, elimination of rules, and *redukce množin FOLLOW*. The last introduces a new non-terminal that takes over part of the FOLLOW set of the conflicting one. The slides call the whole process non-deterministic, with no method guaranteed to succeed.
- **Standard textbooks.** The Dragon Book (Aho, Lam, Sethi, Ullman, §4.3) covers left-recursion elimination and left factoring as the preparation for predictive parsing. The left-corner transformation (Rosenkrantz & Lewis, 1970) is another way of removing left recursion.

**Implemented:**
- absorption of the following symbol (`absorbFollowingSymbol`);
- substitution at one occurrence (`expandOccurrence`);
- a copy of a non-terminal for one occurrence, which reduces FOLLOW sets (`splitFollowForOccurrence`);
- merging non-terminals with the same rules (`mergeEquivalentNonTerminal`);
- left-recursion removal without ε;
- substitution that also removes a non-terminal nothing refers to any more.

`src/test/ll1Transformations.test.ts` reproduces the lecture examples. Every offered transformation is checked for language equivalence.

**A remark on the lecture's absorption example** (`A → B a C`, `B → e | a b C`, `C → e | c B C`). After the absorption B still has a FIRST-FOLLOW conflict on `a`. The slide says the conflict is gone, but the new rule `[Ba] → a b C a` puts `a` after C, and `C → c B C` passes FOLLOW(C) on to FOLLOW(B). The transformation is correct, and the example illustrates the lecture's own warning that removing one conflict can cause another. C has an FFL conflict on `c` both before and after.

**Not implemented (candidates):**
- removing ambiguity by operator precedence and associativity, which needs the user's decision on the intended meaning;
- an automatic search for an LL(1) form, which may not terminate and is not guaranteed to succeed.

## 8. Left-corner transformation and right factoring

**Left-corner transformation** (Rosenkrantz & Lewis, 1970). This is the selective form used by Johnson (1998) and Moore (2000): only the left-recursive non-terminals N_L are rewritten, and the others keep their rules.

For A ∈ N_L, let R(A) be the non-terminals of N_L that are left corners of A through N_L, A included. A's rules are replaced by:
- `A → X [A-X]` for every left corner X ∉ N_L of a B ∈ R(A);
- `[A-X] → β [A-B]` for every rule `B → X β` with B ∈ R(A);
- `[A-A] → ε`.

**Why it is correct.** The leftmost spine of a derivation from A goes down through N_L until the first symbol X ∉ N_L. In an ε-free grammar the spine ends at a terminal, so such an X always exists. The new grammar generates X first and then climbs back up the spine with the `[A-·]` helpers.

**Why no left recursion remains.** A left-recursive cycle among the new left corners would map back to a cycle in the original grammar through some X ∉ N_L, which would make X left-recursive.

**Preparation.** The grammar is first made ε-free and cycle-free, with the same logged preparation as Paull's algorithm (now shared code).

**Simplification.** Afterwards, helpers with a single unit rule are merged into their target, and useless helpers are removed.

**Example.** The expression grammar becomes:
- `E → F [E-T]`
- `[E-T] → * F [E-T] | [E-E]`
- `[E-E] → + T [E-E] | ε`
- `T → F [T-T]`
- `[T-T] → * F [T-T] | ε`

The result is LL(1). Unlike Paull's algorithm, no order of the non-terminals is needed. Characters that would break a bracketed name in the editor (`< > # | "`) are replaced in helper names by look-alikes, so the result reads back unchanged.

**Right factoring**, the mirror image of left factoring: `A → α₁ β | α₂ β` becomes `A → A' β`, `A' → α₁ | α₂`. It is offered for each non-terminal (one suffix at a time) and for the whole grammar (the longest suffix first, until none is left).

**Where to find them.**
- In the click menu: the left-corner transformation is offered on every left-recursive non-terminal and is tagged as helping with the conflict. Right factoring appears next to left factoring.
- In the "Celá gramatika…" menu and on the Transformations tab: both whole-grammar versions.

**Tests** (`src/test/leftCornerRightFactor.test.ts`, plus both constructions in the equivalence loop of `correctness.test.ts`):
- language equivalence on all test grammars;
- no left recursion afterwards, including indirect and mutual recursion, ε-rules and cycles;
- agreement with Paull's algorithm on the language;
- the LL(1) result for the expression grammar;
- an editor round trip with `>` and `#` as left corners.
