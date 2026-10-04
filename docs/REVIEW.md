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

## 9. Check of all grammar-changing methods, references, automatic LL(1)

**Check.** `src/test/fuzzTransformations.test.ts` generates seeded random grammars (2–4 non-terminals, 2–3 terminals, ε-rules included). To every grammar it applies:
- every whole-grammar construction;
- every transformation offered for a non-terminal;
- every transformation offered for an occurrence.

Each result must generate the same words (Earley recognizer, all words up to length 4). It must also have its promised form:
- no useless symbols;
- no ε-rules;
- no unit rules;
- no left recursion (Paull, left corner);
- no common first or last symbols (left and right factoring);
- CNF or GNF.

The test suite runs 100 grammars. In addition, two one-off sweeps ran: 3,000 grammars, and 600 larger grammars (up to 5 non-terminals, right-hand sides up to 4 symbols, words up to length 5). No transformation failed.

**References.** Every transformation has an ⓘ button: in the click menu, next to the whole-grammar buttons, next to the whole-grammar menu (overview of all), and in the LL(1) card. It opens the scheme, what the transformation does, why it keeps the language, when to use it, and the publications with the section where it is described. The texts are in `src/core/processor/transformationInfo.ts`. Only sources that were checked are cited:
- the KIV/FJP lectures *8 BKG* and *9 a 10 LLk*;
- the SLU slides;
- R. Cockett's CPSC 411 notes;
- the Dragon Book; Hopcroft, Motwani, Ullman; Aho & Ullman (1972);
- Chomsky (1959); Greibach (1965);
- Rosenkrantz & Lewis (1970); Moore (2000); Johnson & Roark (2000);
- Foster (1968); Rosenkrantz & Stearns (1970).

No publication dedicated to right factoring was found; the reference text says so.

**Automatic transformation to LL(1)** (`src/core/processor/ll1Transformer.ts`). The order of steps follows R. Cockett's notes *Transformations to LL(1)*: remove left recursion, expose FIRST clashes by substituting leading non-terminals, left factor, attempt to remove FIRST/FOLLOW clashes, and repeat from step 2. The notes also warn that the process need not terminate. The methods are those of the KIV/FJP lecture *9 a 10*. Foster's SID (1968) was an early program of this kind that also reported why it failed.

The procedure:
1. Remove useless symbols and cycles.
2. Remove left recursion: rule by rule when it is only immediate, otherwise with Paull's algorithm.
3. Repeatedly take a conflict, FIRST-FIRST before FIRST-FOLLOW:
   - **FIRST-FIRST:** left factoring of the longest common prefix, otherwise substitution of the leading non-terminal;
   - **FIRST-FOLLOW:** absorption of the symbol that follows, otherwise removal of the ε-rule;
   - on the way, non-terminals with the same rules are merged.
4. After success, non-terminals used only in one unit rule are substituted, if the grammar stays LL(1).

**Stopping.** The attempt stops after 10 rounds without improvement, where a FIRST-FIRST conflict counts twice and a FIRST-FOLLOW conflict once. It also stops when a grammar repeats or the grammar exceeds 400 rules. On failure it returns the best state and lists the discarded operations and the remaining conflicts.

**Logging.** Every operation is listed with its reason (the conflict and the cited step) and the grammar after it. The whole attempt is one undoable step in the editor.

**Results.**
- **Succeeds:**
  - the expression grammars; for KIV p. 22 the result is the lecture's own;
  - the lecture's G13 and G14 and the KIV FIRST-FIRST example;
  - the LALR examples, the strong LL(2) example and indirect left recursion;
  - the Yacc and ANTLR examples.
- **Fails, as it must:**
  - the ambiguous dangling else, which ends in the textbook form `S → if c then S S'`, `S' → else S | ε` with the conflict on `else`;
  - palindromes, whose language is not LL(k).
- **Also fails:** the lecture's absorption example.

`src/test/ll1Transformer.test.ts` checks that the result is always equivalent and that success always means an LL(1) grammar, on the presets and on random grammars.

## 10. The LR automaton explains its construction

**Origin of a state.** When a state is selected, the graph highlights:
- the transition that created it in purple; the construction processes the states in the order of their ids and the symbols in a fixed order, so this is the first transition into the state in that order (`stateCreators` in `src/core/lr/lrExplain.ts`);
- the other transitions into the state, dashed;
- in every predecessor, the items with the dot before the entry symbol. GOTO turns exactly these items into the kernel of the selected state.

Below the graph, the state panel says the same in words. For example, "g(#, *) = * from state #: L → • * R ⟶ L → * • R, then the closure adds the items below the line". It also lists the other transitions into the state.

**Navigation.** Clicking an item A → α • X β, in the graph or in the panel, selects GOTO(state, X). The graph pans only when that state is outside the view. Hovering an item shows why it is in the state (kernel: from which item of which predecessor; closure: which item has the dot before its left-hand side) and where it leads. For a complete item it shows when the item reduces: always in LR(0), on FOLLOW(A) in SLR(1), on its lookaheads in LR(1) and LALR(1).

**Lookaheads.** Each lookahead is a separate symbol, and hovering it shows its reasons (`explainLookahead`):
- **the initial item:** [S' → • S, $] is given by the construction;
- **kernel item:** the lookahead is carried over unchanged from [A → α • X β, a] of a predecessor;
- **closure item, FIRST:** a ∈ FIRST(β) for the item [A → α • B β];
- **closure item, passed on:** β ⇒* ε (or β is empty), so the lookahead a of [A → α • B β, a] is passed on.

The reasons are ordered by the order in which the closure reaches the items, so following the first reason never goes round in a circle. For LALR(1), the tooltip also names the merged LR(1) states and which of them has the lookahead (each LALR(1) state records its LR(1) states in `mergedFrom`).

**Verification of the lookaheads** (`src/test/lrLookaheads.test.ts`):
- **Independent LALR(1).** The LALR(1) sets are compared with the Dragon Book construction, which finds spontaneous and propagated lookaheads on the LR(0) kernels (Alg. 4.62/4.63). The comparison uses its own FIRST sets and closure and is made state by state, including the closure items.
- **LR(1) merged by core.** Merging the LR(1) states by core gives the same sets.
- **Every lookahead has a reason** and every item has a reason. The creating transition always comes from an earlier state and moves the dot in at least one item.
- **Acceptance.** Conflict-free LR(1) and LALR(1) tables accept exactly the words the Earley recognizer accepts. A missing lookahead would reject a word.

The tests run on all presets and 150 random grammars. Two one-off sweeps also passed: 4,000 random grammars, and 700 larger grammars (up to 5 non-terminals and 4 terminals, right-hand sides of up to 4 symbols). No lookahead was wrong.

**A finding: non-generating symbols.** With a non-generating non-terminal, FIRST(β a) can be empty. Canonical LR(1) then has no item with an empty lookahead set, so its states need not correspond to the LR(0) states. For example, `S → S A | S`, `A → B S`, `B → c | c S A` gives 8 LR(0) states but only 5 LR(1) and LALR(1) states. Merging LR(1) by core then differs from the propagation algorithm on the LR(0) kernels, but only in states that no word reaches. The automaton screen says so when LALR(1) has fewer states than LR(0). The test compares the two constructions only for grammars whose non-terminals all generate a word.

## 11. Whole-system audit with independent oracles; suggestions

### Method

`src/test/audit.test.ts` compares the core with code written independently of it. It runs on all presets and on 200 + 200 random grammars of two generators. A one-off run used 1,500 + 1,500 grammars.

**The oracles:**
- its own FIRST_k/FOLLOW_k/PREDICT_k for k = 1, 2, on token arrays;
- its own LL(1) and strong LL(2) tests;
- the exact LL(2) test by a bounded search over left-sentential forms w A α. Every context found must also be in the Aho–Ullman tables, and every conflict found must be reported;
- the Earley recognizer for every word up to a length.

**What is checked against them:**
- the acceptance of the LL(1), strong LL(2), LL(2)-tables, LR(0), SLR(1), LALR(1) and LR(1) simulators, in both table layouts;
- the left parse replayed as a leftmost derivation, and the right parse as a rightmost one;
- the yields of all parse trees;
- the class hierarchy: LR(0) ⇒ SLR(1) ⇒ LALR(1) ⇒ LR(1), LL(1) ⇒ LR(1) for reduced grammars, and LL(1) ⇒ strong LL(2) ⇒ LL(2);
- the LR(0) f table against ACTION;
- that a strict LR(0) language is prefix-free;
- the word generator.

**Further probes (not kept):**
- the editor round trip of 400 grammars with awkward symbols;
- 3,000 random texts through the parser and all constructions;
- timings of large grammars and of transformations.

**Result:** no discrepancy on reduced grammars. The parser never threw. The issues below are what remains.

### Issues found

1. **The page can freeze for minutes (high).**
   - **Cause:** `computeAnalysis` runs synchronously in the main thread and builds everything eagerly: four LR automata, LL(1), strong LL(2) and the exact LL(2) tables. LALR(1) is obtained by merging canonical LR(1), so LR(1) is built twice.
   - **Example:** GNF of a 9-rule grammar (`S → S a B | B c | A`, `A → A b | S d | e1`, `B → B A | a | S S`) gives 1,415 rules in 10 ms. The automatic re-analysis then takes LR(0) 1.8 s (2,247 states), LR(1) 165 s (9,272 states) and LALR(1) another 181 s. A synthetic 120-rule grammar: LR(1) 117 s, LALR(1) 101 s, LL tables 29 s (bound of 5,000 contexts reached).
   - **Realistic grammars are fast:** a 25-rule language grammar takes 5–30 ms per step.
   - **Fix:**
     - run the analysis in a Web Worker that can be cancelled;
     - build LALR(1) from LR(0) by propagation (the reference algorithm is already in `lrLookaheads.test.ts`);
     - use a worklist closure;
     - build LR(1) and LL(2) lazily, when their tab is opened;
     - cap the number of states with a message;
     - warn before applying a transformation whose result is much larger.
2. **Simulator input is split only at spaces (medium).** With the compact notation of the lectures (`S → aSb | ab`) a student types `aabb` and gets an error; only `a a b b` works. Fix: split a token that is not a terminal by longest match over the terminals, as the grammar parser does for compact right-hand sides, and show the tokenization.
3. **Grammars with useless symbols (low).**
   - **Two definitions of FIRST.** FIRST₁ follows the sentential-form definition: `A → S A b` with S nullable gives FIRST₁(A) = {b}, although A derives no word. FIRST₂ follows the terminal-word definition (∅).
   - **The verdicts depend on dead rules.** `S → a a | a A | S A`, `A → A S S` is reported not LL(1) only because of rules that never derive a word.
   - **Unreachable non-terminals are treated differently.** The LL(1) and strong LL(2) tests include them; the exact LL(2) test and the LR automata do not.
   - **Fix:** use one definition (FIRST over generating symbols only), or say in the overview that the classification assumes a reduced grammar and offer the reduction.
4. **LaTeX of copied non-terminals (low).** The copy B₂ (reduction of FOLLOW sets) is written as `\mathit{B₂}`; pdfLaTeX cannot typeset the Unicode subscript. Fix: write a trailing subscript as `_{2}`, as the LR state names already are.
5. **A backslash terminal breaks the editor text (low).** `formatGrammarForEditor` writes the terminal `\` as `"\"`, which the tokenizer reads as an escaped quote. After any transformation such a grammar no longer parses. Fix: escape `\` and `"` in `quoteTerminal`. All other symbols round-tripped, including ε keywords, `e`, `|`, `->`, `::=`, `;`, `#`, quotes, `<x>`, comment starters, `(1)`, digits, `λ`, `→` and Czech letters.
6. **The LL(2) badge can claim "yes" without a full check (low).** When the exact test stops at its bound (`ll2Complete = false`), only the LL tab says so; the overview badge still says "yes".
7. **Labels of left recursion (low).**
   - `A → B A` with B ⇒* ε is labelled *indirect*; it is hidden left recursion.
   - A non-terminal with both an immediate rule and an indirect cycle is listed as immediate only.
8. **"Shortest words" (low).** The generator finds the words with the shortest derivations, not the shortest words: `S → A A A A | b b b b b b`, `A → a` gives `b b b b b b` before `a a a a`.
9. **Yacc precedence is not used (low).** `%left`, `%right`, `%nonassoc` and `%prec` are read, but the tables do not use them. The Bison calculator therefore shows conflicts that Bison resolves. An optional resolution, with the resolved cells marked, would show how Bison does it.

### Suggestions for teaching (by expected value)

1. **"Why" for every computed set and cell**, as for the LR lookaheads (section 10):
   - FIRST/FOLLOW computed round by round, as on paper, with the rule that added each symbol;
   - the origin of an LL table entry: a ∈ FIRST(α), or α ⇒* ε and a ∈ FOLLOW(A);
   - the origin of an LR table entry: the item A → α • a β for a shift, A → α • with the FOLLOW set or the lookahead for a reduction;
   - a conflict explained by its two items.
2. **Membership and all parse trees for any grammar.** An Earley (or CYK) parser in the UI answers "w ∈ L(G)?" even when the grammar is neither LL nor LR, and shows all parse trees up to a limit. This demonstrates ambiguity directly. A CYK table for CNF grammars is a classic exam task, and the Earley chart could be shown too.
3. **Ambiguity witness.** A bounded search for the shortest word with two leftmost derivations, with both trees side by side: dangling else, E → E + E. Today only cycles are reported as ambiguity.
4. **Exercise mode.** A seeded random or preset grammar with the results hidden. The student fills in nullable, FIRST/FOLLOW, the LL table, the LR items or the table, and the tool marks the wrong cells. The URL can carry the exercise.
5. **"Check my transformation".** The student enters their own transformed grammar. The tool tests equivalence on all words up to n, gives a counterexample word when they differ, and checks the promised form: no left recursion, LL(1), CNF/GNF. The Earley recognizer of the tests would move into the core.
6. **Derivations next to the parses.** Show the leftmost and rightmost derivation, as sentential forms, next to the left and right parse. In the LR simulation, highlight the handle being reduced and the viable prefix on the stack.
7. **Step-by-step construction.**
   - The canonical collection: the queue of states, then CLOSURE, then GOTO, with "new state" or "already exists".
   - The merging of LR(1) into LALR(1), showing which states merge and where a reduce/reduce conflict appears.
   - The LL table filled rule by rule.
8. **A recursive-descent parser generated from an LL(1) grammar.** Pseudo-code, C, Java or Python procedures, optionally with panic-mode recovery through FOLLOW sets. This connects to the PL/0 compiler of KIV/FJP.
9. **Error recovery in the simulators:** panic mode with synchronizing sets in LL, and the `error` token or phrase-level recovery in LR.
10. **Translation and attribute grammars** (KIV/FJP): output symbols in the rules (infix → postfix), and attributes evaluated during LL parsing.
11. **Regular grammars and finite automata**, if the course needs them in the same tool: RG ↔ NFA ↔ DFA ↔ minimal DFA ↔ regular expression.

## 12. Fixes after the audit; precedence, ambiguity, long computations

**Long computations.** The analysis and the automatic LL(1) attempt are jobs: generators that yield after every state, table or round (`src/core/jobs/job.ts`). `useSteppedJob` runs a job in 40 ms slices, so the page stays responsive and shows the progress. After every 30 s of computation it pauses and asks whether to continue. Stopped, a job returns what it has:
- **The analysis** (`src/core/analysisJob.ts`) computes the cheap parts first: the sets, LL(1) and strong LL(2), LR(0)/SLR(1), LALR(1). The exact LL(2) test, canonical LR(1) and the ambiguity search come last. Stopped during these, the results of the grammar are shown and the missing parts are marked: "not computed" badges, LR(1) disabled, and LALR(1) shown instead with a note. Stopped earlier, the previous results stay, marked as outdated. A stopped grammar is not re-analysed on every key press.
- **The automatic LL(1) attempt** keeps the best state, like a failed attempt.

**Speed.** On the GNF of `S → S a B | B c | A`, `A → A b | S d | e1`, `B → B A | a | S S` (1,415 rules) everything now takes about 12 s instead of 6 minutes:

| Part | Before | Now |
|---|---|---|
| LR(0) | 1.8 s | 0.05 s |
| LR(1), 9,272 states | 165 s | 3–8 s |
| LALR(1) | 181 s | 1.5 s |
| Exact LL(2) | 2.2 s | 0.4 s |

The changes behind this:
- the closure uses a worklist;
- all GOTO kernels of a state are computed in one pass;
- states are identified by their kernels;
- FIRST(β) is cached per item core;
- the suffix FIRST sets of the exact LL(2) test are cached;
- **LALR(1) from LR(0).** LALR(1) is built from the LR(0) states by spontaneous generation and propagation of lookaheads (Dragon Book, Alg. 4.62/4.63), with the closure of [K, #] cached per item. It no longer builds LR(1). `attachMergedLR1States` records the corresponding LR(1) states once LR(1) is known; the lookahead explanations use them.
- **Dead states with non-generating symbols.** A spontaneous lookahead counts only once its kernel item has a lookahead. Otherwise lookaheads would be generated in states no word reaches, and they could not be explained. For grammars whose non-terminals all generate a word this is the textbook algorithm. With non-generating symbols, LALR(1) keeps the LR(0) states, and items without a lookahead are shown with ∅.
- **The automatic LL(1) attempt** uses an LL(1)-only table (no FIRST₂/FOLLOW₂, no LL(2) tables).
- **Large automata and tables.** Automata over 150 states are drawn only on request, because dagre would block the page; the states can be browsed with a selection. LR tables over 300 rows show their first rows.

**Yacc precedence** (optional). Lines `%left`, `%right`, `%nonassoc` and `%precedence`, lowest precedence first, and `%prec X` at the end of an alternative work in the arrow notation and in Yacc files. `Grammar.precedence` holds them. They are written back to the editor and carried across transformations (`transferPrecedence` keeps `%prec` with the rules that are still there).

`buildLRTable` resolves shift/reduce cells of SLR(1), LALR(1) and LR(1) as Bison does:
- the rule takes the precedence of its last terminal, or of `%prec`;
- the higher precedence wins;
- equal precedence: `%left` reduces, `%right` shifts, `%nonassoc` makes the cell an error;
- conflicts without precedence on both sides, reduce/reduce conflicts and LR(0) stay conflicts.

Every resolution is listed with its reason, and the cell is marked in the table. A switch on the LR tab shows the table without precedence. The overview badges distinguish a table that is conflict-free only thanks to precedence (amber) from a grammar of the class.

New preset: ambiguous expressions with `%left + -`, `%left * /`, `%right ^`, `%right UMINUS`. The tests check that the trees are the ones Bison builds: a + (a * a), (a - a) - a, a ^ (a ^ a), (-a) ^ a.

**Ambiguity** (`src/core/analyser/ambiguity.ts`). The search explores the leftmost derivations breadth-first and records the first derivation of every left-sentential form. A second derivation of the same form is a witness: completing the form gives a word with two leftmost derivations, and both trees are shown. Forms whose shortest word is longer than the bound (10) are not expanded. When the search ends within its limits, no word up to the bound has two trees. That is not a proof of unambiguity, and the overview says so.

The analysis runs the search only when neither the LL(1) nor the LR(1) table (without precedence) proves the grammar unambiguous. An ambiguous grammar without precedence declarations gets the suggestion to rewrite it or declare precedence, with an example. With declarations, the overview says how many conflicts they resolved.

A test compares the search with an independent count of derivation trees (a CYK-like table saturated at 2) on 150 random grammars. One bug was found on the way: completing a form by the rule with the shortest yield could pick S → S. The rule that first reached the shortest yield is used instead, and it always ends.

**Other fixes.**
- **Simulator input** is split into terminals by longest match with backtracking when a word is not a terminal (`aabb`, `id+id`), and the split is shown (`tokenizeInput`).
- **The overview** says that the classification assumes a reduced grammar when there are useless symbols, and offers to reduce it.
- **The LL(2) badge** says "unknown" when the exact test did not finish.
- **Left recursion** lists all its kinds for every non-terminal: immediate, hidden (through a prefix that generates ε) and indirect. The automatic LL(1) attempt takes the rule-by-rule removal only when all left recursion is immediate.
- **LaTeX:** subscripts become `_{2}`, accented names use text mode, and arrows and Greek letters become commands. A test checks that a grammar with a copied non-terminal yields ASCII-only LaTeX.
- **A backslash terminal** round-trips through the editor: `quoteTerminal` escapes, and the line scanner honours escapes like the tokenizer.
- **The word generator** is described as giving the words with the shortest derivations.

New tests: `precedenceAmbiguity.test.ts`, `jobs.test.ts` and the oracle audit `audit.test.ts` (section 11).

## 13. Membership and CYK tab

`src/core/parser/membership.ts` decides membership for any grammar. D(A, i, j), "A derives w[i..j)", is computed for the parts of the word by increasing length, over whole right-hand sides cut into consecutive parts; within a part a fixpoint handles rules whose other symbols derive ε. The number of trees is counted the same way. A cycle within a part, where A derives itself over the same part, gives infinitely many trees.

The trees are listed lazily, up to 20, without repeating a cycle. Each tree comes with its left parse. A rejected word is explained by an Earley recognizer: the longest prefix that some word of the language starts with.

`src/core/parser/cyk.ts` checks CNF (S → ε only when S is on no right-hand side) and builds V(i, j) with a witness for every entry (A → a, or A → B C with the split point k).

The tab shows the membership, the tree count, the trees with a pager, and the CYK table, in the triangle of Hopcroft, Motwani and Ullman (length 1 at the bottom). Clicking a cell explains it and marks the two cells of each witness. For a grammar not in CNF, the rules that violate CNF are listed, and the table of `convertToChomsky` can be shown, or the editor grammar converted.

`src/test/membership.test.ts` checks:
- the Catalan numbers 1, 2, 5, 14 for E → E + E | a;
- an infinite count for S → S | a, and ε-rules;
- membership against the Earley recognizer, and the tree count against an independent counter, on 120 random grammars and the presets: every listed tree yields the word, and its left parse replays to the word;
- HMU Example 7.34 cell by cell;
- CYK on the CNF of 80 random grammars against Earley.

## 14. LR automaton construction step by step; LR(1) → LALR(1) merges

`src/core/lr/lrConstruction.ts` reads the construction steps off the finished automaton. The builders take the states in order of their numbers and the symbols in a fixed order; a GOTO gives either the next number (a new state) or an existing state.

`constructionSteps` lists the initial step, then every transition marked new or existing. `constructedSoFar` gives the states and transitions that exist after a step.

The automaton tab has three modes: the finished automaton, the construction step by step, and the merges.

**Construction step by step:**
- player controls;
- the explanation of the step: the items whose dot moves, the kernel, what CLOSURE adds, new or existing state;
- the graph keeps the layout of the finished automaton and draws only what exists so far, with the transition of the step highlighted.

**Merges (for LALR(1), once LR(1) is known).** `mergeSteps` lists each LALR(1) state that merges several LR(1) states, with every item's lookaheads in each LR(1) state and their union. A conflict counts as created by the merge when none of the merged LR(1) states had a conflict on that symbol. The colliding lookaheads are marked in the union.

`src/test/lrConstruction.test.ts` checks the creation order on 60 random grammars (LR(0) and LR(1)), and the classic grammar S → a A d | b B d | a B f | b A f, where the merge of the two c states creates the reduce/reduce conflicts on d and f.

## 15. Recursive-descent parsers in PL/0 and Oberon

`src/core/codegen/recursiveDescent.ts` generates a parser from an LL(1) grammar.

**Input and output.** Every terminal is one input character: its own when it is a single printable ASCII character, otherwise a substitute letter. The input ends with `$`. Every non-terminal procedure chooses its rule by the director set, prints the rule number, and calls or checks the symbols of the right-hand side. The output is the left parse and `OK`, or `ERR` and the symbol where the error was found.

**PL/0** has no `else`, `or` or parameters. The rule is therefore first chosen into a local variable `rule`, the expected terminal is passed in a global variable, and `? x` / `! v` are the character I/O REA/WRI of the course VM.

**Nesting.** Neither PL/0 nor Oberon-07 has forward declarations. The procedures are nested along a depth-first search of the calls, and every call is checked to be visible: the procedure itself, an enclosing procedure, a local one, or an earlier sibling at some enclosing level. When a call is not visible, PL/0 uses one procedure `parse` with the non-terminal in a variable, and Oberon calls through procedure variables. Helper names (`want`, `num`, `rule`, …) are avoided regardless of case, because some student compilers ignore case.

**P-code.** `src/core/codegen/pl0Compiler.ts` is a PL/0 compiler with Wirth's code generation: `JMP` over the nested procedures, `INT 0, 3 + vars`, and the course mnemonics `JMC`/`RET` and OPR 8–13 for the relations. A bug found by the tests: a nested procedure calling its enclosing procedure (factor → expression) was compiled before that procedure's body had an address. As in Wirth's compiler, a procedure's address is now its initial jump until the body is compiled.

`src/core/codegen/pcodeVm.ts` runs the code in the browser and in the tests. The tab shows the PL/0, Oberon and P-code, the token characters, the output of a run, and a link that opens the P-code with its input in the KIV/FJP PL/0 interpreter. The program goes in the hash, `#code_b64=…&input=…`, so the length of the URL does not matter to the server.

`src/test/recursiveDescent.test.ts`:
- compiles and runs the parsers of the LL(1) presets and of random LL(1) grammars on every word up to length 4;
- checks that a parser accepts exactly the words the Earley recognizer accepts, and prints the left parse of the LL(1) simulator;
- covers the dispatching fallback (A → B C, B → C b | x, C → c).

The P-code of the expression parser and of the fallback was also run by the interpreter's own CLI (`npm run cli`), with the same output, and the link was checked to load the program and the input in the deployed interpreter.

## 16. Check my transformation ("Is my grammar the same?")

`src/core/analyser/equivalence.ts`, `compareLanguagesSteps`, compares two languages length by length. Both grammars are incremental Earley recognizers, using only rules whose symbols all generate a word. A depth-first search over the prefixes extends a prefix only while at least one grammar can still complete it. The first word accepted by exactly one grammar is a shortest counterexample, the lexicographically first of its length.

The search is a job, run like the analysis. After every 30 s it asks whether to continue; stopped, it reports the last length checked completely.

When no difference is found, the tab says that this is only a hint: equivalence of context-free grammars is undecidable.

`checkForm` checks the promised form exactly, with the violating rules:
- reduced; ε-free (S → ε only when S is on no right-hand side); no unit rules;
- no left recursion (all its kinds); left-factored; LL(1); CNF; GNF.

The tab shows the original grammar, a field for the student's grammar ("start from the original" copies it), the form checks (updated live), and the comparison. A counterexample comes with its derivation tree in the grammar that generates it. The student's text is kept in App when switching tabs, and a result is marked outdated when either grammar changes.

`src/test/equivalence.test.ts`:
- a grammar against its left-recursion-free, CNF, GNF and LL(1) versions;
- shortest counterexamples, including ε and a different alphabet;
- 120 pairs of random grammars against a brute-force Earley check, and every grammar against its ε-free version;
- stopping;
- every property, also on the outputs of the transformations that promise it.

## 17. Presets: constructs of real languages

A new group of ten presets uses non-terminals named as in real grammars (Statement, WhileStatement, ParameterList, …). Conditions, expressions and statements appear as single terminals (cond, expr, stmt), so that boolean and arithmetic expressions do not hide the construction.

Each preset demonstrates one property:

| Preset | Property |
|---|---|
| if–else as matched/open statements (C) | unambiguous, SLR(1) and LALR(1), not LL(k): an else after an arbitrarily long statement decides; the automatic LL(1) attempt has nothing to do |
| if–then–else with `%nonassoc then`, `%nonassoc else` (Pascal, Bison) | ambiguous; the precedence resolves the shift/reduce conflict on else, and the else goes to the nearest if |
| `if … end if` (Ada, Modula-2) | no dangling else; LL(1) with ε-rules decided by FOLLOW |
| while and for loops (C) | LL(1); FOLLOW(OptionalExpression) = { ;, ) } |
| variable declarations (C) | a left-recursive list as written for Yacc: SLR(1), not LL(1); removing the immediate left recursion gives LL(1) |
| function declaration (C) | a parameter with or without a name: (strong) LL(2), not LL(1); left factoring gives LL(1) |
| a lambda (JavaScript arrow function) called at once | unambiguous on all words up to length 9, but LR(1) has reduce/reduce and shift/reduce conflicts: whether `( id , … )` lists parameters is decided by `=>` after an arbitrarily long list, so it is not LR(k); JavaScript parsers use a cover grammar |
| `a * b ;` in C | ambiguous (pointer declaration or multiplication); C compilers use the symbol table (the lexer hack) |
| assignment or procedure call | FIRST-FIRST on id; left factoring gives LL(1); PL/0 avoids it with `call` |
| S-expressions (Lisp) | LR(0) with a left-recursive list, not LL(1); with a right-recursive list LL(1), not LR(0) |

Terminals that the notation would read otherwise are quoted: `";"` (which would end a rule), `"="`, `":="` and `"=>"` (rule operators).

`src/test/languagePresets.test.ts` checks every property stated in the descriptions. The presets also take part in the suites that run over all presets: the audit, lookaheads, membership, recursive descent and the LL(1) attempt.

## 18. Verification of all algorithms (2026-10-04)

**The test suite** (305 tests in 20 files) passes. Most of its checks compare the implementation with independent code:
- the Earley recognizer;
- FIRST_k/FOLLOW_k/PREDICT_k computed on token arrays;
- a brute-force exact LL(2) test;
- the Dragon Book propagation algorithm for LALR(1);
- tree counts by a CYK-like table saturated at 2;
- the LL(1) simulator for the generated parsers.

**One-off sweeps** ran every oracle-based suite on 5 to 15 times more random grammars than the committed tests:

| Suite | Size of the sweep |
|---|---|
| audit | 1,500 + 1,500 grammars |
| lookaheads | 2,000 grammars |
| transformation fuzz | 1,000 grammars |
| automatic LL(1) attempt | 600 grammars |
| LR construction | 600 grammars |
| membership and CYK | 600 + 400 grammars |
| ambiguity against tree counts | 600 grammars |
| language comparison | 600 pairs + 400 grammars |
| recursive descent | 2,000 grammars |

All passed except one test: GNF of a small cyclic grammar (random seed 162) exceeded the limit of 5,000 rules, so the construction stopped and kept the grammar, as designed and as the transformation fuzz already accepts. The form check in `equivalence.test.ts` now accepts a stopped construction too, and runs on 400 grammars.

**New permanent cross-checks** (`crossChecks.test.ts`):
- CYK and the general membership algorithm give the same number of derivation trees on the CNF of 150 random grammars;
- every ambiguity witness has at least two trees, and "none found" means at most one tree for every short word;
- the analysis stopped at random points returns nothing, or parts equal to the full analysis with the missing parts named;
- the counterexamples of the language comparison are confirmed by the membership algorithm.

**A crash fuzz** (`fuzzEverything.test.ts`) sends 20,000 random texts, built from the special syntax (precedence lines, %prec, quotes, comments, ε forms, rule operators), through the parser. The 451 that are grammars go through every analysis, the membership algorithm, CYK, the comparison, the form checks, the construction steps and merges, the LaTeX export and the parser generator. Nothing throws, and every editor text reads back as the same grammar.

**PL/0 compiler and P-code VM against the course interpreter.** The P-code of the generated parsers of 120 LL(1) grammars, run on 2,214 inputs, plus a general PL/0 program (nested procedures, recursion, odd, truncating division, all relations), was run both by `pcodeVm.ts` and by `runHeadless` of the online-pl0-interpreter. Output and status were identical in all cases.

**The user interface:** every preset on every tab (26 × 11) renders without an error or a console error; the English interface shows no untranslated placeholders.

Not verified automatically: compiling the LaTeX output (no TeX installation here; its symbols are checked to be ASCII), and the Oberon output (no Oberon compiler; it uses the same nesting as the PL/0 output, which compiles and runs).
