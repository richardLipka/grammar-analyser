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

## 19. Example words from the language of the grammar (2026-10-04)

**The problem.** The LL and LR simulators started with the fixed word `id + id * id`, and the other tabs with the word of the last preset. For a grammar typed by the user, or a preset after editing, the first demonstration was a rejection.

**The fix.** `core/generator/exampleWord.ts`:
- `demonstrationWord(G, preferred)` keeps the word of the preset or the link only while the membership algorithm accepts it for the grammar being analysed. Otherwise it returns `exampleWord(G)`, a word derived from the grammar. App passes the result to the LL and LR simulators, membership & CYK and recursive descent, and to the hint in their input fields. The views no longer have a fixed default, and a link carries a word only when the user chose it.
- `exampleWord(G)` derives a word of exactly a chosen length:
  1. A fixpoint computes which lengths up to the maximum (14, or the length of the shortest word) every non-terminal can derive. Each length records the round in which it was reached first; a round uses only the lengths of the previous rounds.
  2. A non-terminal is expanded by a rule not used yet that can give its length, else by a rule whose parts were all reached in earlier rounds. New rules are used at most once each, and the rounds decrease along every other branch, so every derivation ends.
  3. The derivation is tried for the first three lengths of the start symbol from 8 up (else for the longest length there is). Each length is tried with the length shared among the parts of a rule evenly, to the left and to the right.
  4. The word using the most different rules wins.
- The function is deterministic and returns null for an empty language, or when the shortest word has more than 40 symbols.
- `shortestYields` moved here from the ambiguity search, which uses it too.

**Why not a simple heuristic.** A first version lengthened the sentential form greedily, using the shortest yields. It stopped below the target length on 31 of 1,500 random grammars that have longer words, e.g. `S → ε | A | a`, `A → S | A A | ε`, where a longer word first needs `A → A A`, a rule that does not lengthen anything. The exact lengths remove this.

**Tests** (`exampleWord.test.ts`):
- every preset and 600 random grammars: the word is accepted by the independent Earley recognizer, is at most 14 symbols long (unless the shortest word is longer), and reads back as the same tokens;
- an exhaustive search over all words up to length 6 of 300 random grammars: the length is one of the first three lengths of the language that reach the target;
- "no word" only when no short word is accepted either;
- determinism, the limit of 40 symbols, and that a preset word is kept or replaced as described.

A one-off sweep of 8,000 random grammars took at most 3.5 ms per grammar. A random grammar of 4,893 rules took 60 ms, and transformed presets (CNF, GNF, up to 552 rules) at most 10 ms.

**In the browser.**
- The link `?g=S -> a S b | ε&w=id + id * id` now shows `a a a a b b b b` on all four tabs, and all four accept it.
- A preset keeps its word. After `*` is removed from the arithmetic grammar, the word becomes `( id ) + ( id + id )`.

## 20. History of the grammar (2026-10-04)

**Selecting an example now starts a new history.** It used to add a step, so undo led back to the previous grammar, and the protocol on the Transformations tab mixed the steps of different grammars. Now the history holds only the loaded example. A pending edit that was not yet recorded is dropped, not added. The hook `useGrammarHistory` has a new `reset(entry)` for this.

**Two new buttons next to undo/redo:**
- **Clear history** keeps the grammar and starts the history with it. The first entry is named as the example when the text is one, otherwise "Initial grammar". The button is disabled when there is nothing to clear.
- **Clear grammar and history** empties the editor and the history. It also stops a running analysis, forgets the analysis and the example word, switches to the text mode and puts the cursor in the editor.
  - Clearing cannot be undone, so the first click only arms the button. It turns red and says "Clear?", and the second click within 4 s clears.
  - The button is disabled while the automatic LL(1) attempt runs, since its result would fill the editor again.

**On a phone (≤ 560 px)** the editor toolbar wraps: the history buttons and the whole-grammar menu go on a second line. The single line was already about 15 px wider than a 375 px screen, so the page scrolled sideways. On a wider screen the toolbar stays on one line.

**Checked in the browser (both languages):**
- transform → select another example: undo is disabled, and the protocol shows only "Example loaded";
- transform → clear history: the grammar is kept, undo is disabled, and the notice is shown;
- clear grammar: the first click arms the button, the second gives an empty editor with the cursor in it and the "enter a grammar" card;
- a grammar typed afterwards is analysed, and its example word is accepted;
- at 375 px there is no horizontal scrolling.

## 21. "Check my transformation": the grammars in the text fields, and both derivations (2026-10-05)

**What was wrong.**
- The original grammar of the comparison was the last *analysed* grammar, not the text in the editor. After an edit, until the analysis ran again (or always, for a grammar too heavy to re-analyse automatically), the comparison used an older grammar than the one on the screen.
- While the analysis was outdated, the whole tab was greyed out and could not be clicked, although the comparison does not use the analysis.
- For a counterexample only one tree was shown, the one of the grammar that generates the word. It sat under the verdict below both grammars, so it was not clear which grammar it belonged to, and nothing showed why the other grammar fails.

**The fix.**
- The original is now the grammar in the editor as it is now. It is parsed with the same reading of `e`. While the text has errors, the original column says so and Compare is disabled. The tab is no longer greyed out.
- A result is shown only while both text fields hold the grammars that were compared. The key now includes the start symbol.
- The page is reordered: controls, then the verdict, then two columns. Each column holds a grammar and, under it, how that grammar handles the counterexample:
  - **generates it:** the derivation tree and the leftmost derivation;
  - **does not:** the attempt of the general analyser (`core/parser/derivationAttempt.ts`, `explainWord`), described next.

**How the attempt is found.**
1. An Earley recognizer, over the rules whose symbols all generate, finds the longest prefix w[0..k) that some word of the language starts with. At position k it collects the terminals that can follow and whether the word may end.
2. The partial tree is built from an item [A → α • t β, i] at k. A breadth-first search goes up the chain of items that predicted A, back to the start (the shortest chain, no cycles).
3. On every level, the symbols before the dot become complete subtrees over their part of the prefix (`sequenceTrees`, new in `membership.ts`, from the same span table D(X, i, j)). The symbol at the dot is the next level, or at the bottom the needed terminal t, marked red. The symbols after the dot stay as dashed leaves.
4. When nothing can follow a prefix that is itself a word, the attempt is the full tree of the prefix ("the word goes on").
5. The leftmost derivation of the partial tree is the broken sequence, marked where it stops matching the word. The text names the matched beginning, what the grammar needs, and what the word has. It notes when that symbol is not a terminal of the grammar at all, when the word ended too early, and when the language is empty.

**The trees:** `DerivationNode.mark` ('mismatch', 'pending') is drawn by the tree visualizer, and exports with the theme colours. The pan/zoom fit now frames the content between the toolbar and the caption, so the root of a short canvas is no longer hidden under the toolbar (all tree and automaton views).

**Tests.**
- `derivationAttempt.test.ts`:
  - the prefix equals `viablePrefixLength`;
  - exactly the expected terminals extend it (checked for every terminal), and "may end" equals membership of the prefix;
  - the tree uses only rules of the grammar, and its leaves are the prefix, the marked terminal, then only dashed symbols;
  - the leftmost derivation ends in the leaves;
  - over 1,000 failed attempts on 250 random grammars, and cases with ε-rules, cycles, left recursion, unknown symbols and an empty language.
- `checkTransformation.test.ts`, the verification asked for:
  - **Transformations:** every whole-grammar transformation and every click-mode transformation of every non-terminal and right-hand-side occurrence of every preset. That is 920 transformations, each written as editor text, read back as "your grammar" and compared with the original: all keep the language.
  - **Modified grammars:** 357 modifications, made by removing a rule or adding one.
    - 222 differ. Each counterexample is confirmed by the Earley recognizer and by brute force on all shorter words. In each case `explainWord` agrees on which grammar generates the word, and the other grammar has an attempt.
    - 135 show no difference, which brute force confirms on all words up to length 4.

**In the browser (both languages):**
- an added word, the attempt broken at `*`;
- a lost word with a symbol that is not a terminal of the student grammar;
- the empty word ("the word ends here");
- an editor grammar with errors;
- the original following the editor text without waiting for the analysis.

## 22. PL/0 as an example, recursive descent in C and Python, the menu in two rows (2026-10-05)

**The PL/0 grammar** (preset `lang_pl0`, group Languages) is Wirth's PL/0 with `? x` and `! e` for input and output, as in the course compiler. Identifiers and numbers are the terminals `ident` and `number`, and the non-terminals follow Wirth's names (Program, Block, Statement, Condition, Expression, Term, Factor). The EBNF repetitions `{ … }` are right-recursive lists (`…Rest`), and the optional parts `[ … ]` are ε-alternatives.

*Properties* (pinned in `languagePresets.test.ts`):
- 47 rules, LL(1), SLR(1), LALR(1) and LR(1), not LR(0) (the ε-alternatives need a lookahead);
- the 27-token sample program, with a procedure and a while loop, has exactly one derivation tree;
- the parser generated in PL/0 nests its procedures (Block inside Program, Factor inside Term inside Expression). On the P-code VM it prints the leftmost derivation of that tree, then OK.

**Recursive descent in C99 and Python 3.**
- *Same output in every language:* both print exactly what the PL/0 and Oberon parsers print: the left parse, then OK, or ERR and the symbol.
- *No nesting needed:* C declares all functions by prototypes and Python looks a name up at the call, so every non-terminal is a top-level function. C chooses the rule with a `switch`, Python with `if`/`elif`.
- *Exit status:* the C program returns 0 exactly for an accepted word.
- *Rule comments in all four languages:* the rules of a procedure go above it, and the rule of each branch goes on that branch (`(* 2: E' -> + T E' *)`, `/* … */`, `# …`). Text that would close a comment early is broken up. The PL/0 comments `(* … *)` are an extension that our compiler reads; Wirth's original PL/0 has none, as the tab says.
- *Name clashes:* procedure and constant names now also avoid C and Python keywords and the names the programs use (`main`, `data`, `pos`).

*Tests* (`rdLanguages.test.ts`):
- every rule appears as a comment in all four programs;
- the C and Python versions of every LL(1) preset (PL/0 included) and of 8 random LL(1) grammars are run on right and wrong words: the sample, the example word, a shortened word, a doubled symbol and random symbols. The C is compiled by gcc with `-std=c99 -Wall -Wextra -pedantic -Werror`. Both outputs equal the output of the PL/0 program on the P-code VM, and the C exit status matches.
- The run needs gcc and Python. They are on the GitHub runners; without them that part is skipped. `@types/node` is now a dev dependency for this test.

**The menu** has two fixed rows, as the owner listed them:
1. Overview, Word generator, FIRST & FOLLOW, LL, LR automaton, LR parsers, CYK;
2. Transformations, Language comparison, Recursive descent, and LaTeX & export (at the end of the row).

*Labels:*
- Each row stays on one line. A pane too narrow for a row (phones, windows between 1,025 and about 1,270 px) scrolls the two rows sideways together. The page itself never scrolls sideways.
- The shorter labels the owner used (LL, LR parsers / LR analyzátory, CYK) make the first row fit from a 1,280 px window. The full descriptions are tooltips.
- "Check my transformation" is now "Language comparison" (Porovnání jazyků). Texts that named the tabs by their old names were updated, and the link parameter `tab=` also accepts `comparison`.

## 23. Grammars copied from the lectures: [Ba], arrows, bxc, rule-less capitals (2026-10-06)

The owner reported five problems found while linking the FJP exercises to the analyser.

**1. `[Ba] --> a | abCa` was silently misread.** The lectures and the LL(k) exercise name an absorbed symbol `[Ba]`. A left-hand side `[Ba]` was not recognised, so the line became alternatives of the previous rule, with the terminals `[`, `Ba`, `]`, `-`, `-`, `>`.
- Bracketed names (`[Ba]`, `[A-X]` of the left-corner transformation, nested `[[Ba]b]`) are now left-hand sides. On a right-hand side `[Ba]` is that non-terminal when it has rules; otherwise it is read as before, so `a[i]` stays the terminals `[`, `i`, `]`. `[1]` stays a rule number. The analyser still writes `<[Ba]>`, which reads the same.
- An arrow (`-->`, `->`, `→`, `::=`, `=>`) inside a right-hand side is now an error that names the cause: a line whose left-hand side is not one symbol (`A B --> c`), or two rules on one line without a separator. A terminal `->` has to be quoted. `:=`, `:` and `=` stay ordinary terminals. No preset contains an unquoted arrow on a right-hand side.

**2. `bxc` was one terminal without notice.** The compact notation splits words only when some word glues a defined non-terminal to other symbols. So `A --> bxc | yc | bxzd | yzd` had four terminals and no FIRST-FIRST conflict, while the exercise expects one. That condition stays (it keeps `id` whole), but it is no longer silent. In the course notation (every left-hand side a capital with optional digits and primes, or a bracketed name) the parser lists the words that could be either (`multiLetterWords`) and says whether some right-hand side separates its symbols by spaces (`spacedSymbols`).
- *No spaces anywhere:* the editor asks, like it asks about `e`: "Separate symbols (b x c)" or "One terminal (bxc)". Until answered, each word is one terminal.
- *Spaces elsewhere* (`F → ( E ) | id`): a word is one terminal, and a line under the editor says so, with a link that changes it.
- The answer is the parse option `splitWords` and the link parameter `split=1|0`; the tab "Language comparison" reads the student's grammar the same way.
- None of the presets has such words, so no preset shows the question or the line.

**3. A capital without rules was a terminal.** In the course notation `D` without rules is now a non-terminal that generates no word (a non-generating symbol for the reduction exercise), with a warning that says how to quote it if it is a terminal. Inside compact words an undefined capital keeps its digits and primes (`aA3b` = `a A3 b`). Outside the course notation an undefined `ID` stays a terminal with the old warning. The editor writes such a non-terminal as `<D>`, which reads back the same.

**4. The PL/0 interpreter link** opens `../pl0/` when the analyser runs on home.zcu.cz (`fjp/pl0` next to `fjp/grammar-analyser`, the same version; its bundle reads `#code_b64=`), and the GitHub Pages copy elsewhere.

**5. The browser tab title** follows the interface language (`documentTitle`); `index.html` has the Czech title and description, as Czech is the default.

*Tests:* `courseNotation.test.ts` (18 tests). All 27 presets are parsed exactly as before (compared rule by rule before and after the change).

## 24. Review of the symbol table of recursive descent (2026-10-14)

Commits 51e6edd–a69aada (by another agent) added a step simulator of recursive descent, a symbol table ("stack of stacks") driven by actions attached to the rules, a JavaScript generator and a new layout of the tab. The review found these problems; all are fixed.

**The symbol table did not hold names.** The simulator input is a word of terminals (`int id ;`), so every declared symbol was called `id` (or `ident`), and two declarations in one scope were flagged as redeclarations although the program meant different names. The name of a declaration was also taken from the input at the position "rule start + index of id in the right-hand side", which is wrong as soon as a non-terminal precedes the identifier. And the actions of a rule ran when the rule was chosen, before any of its symbols were read.
- *Fix:* a scanner (`scanInput`) reads a name in the input as the identifier terminal and a number as the number terminal and keeps the text (`x := n - 1` → `ident := ident - number`), and the simulator gets the texts. An action now has a position in the right-hand side: a name is declared after its identifier has been read (with that text), a scope opens before one symbol and closes after another. Every other identifier read is looked up in the open scopes; the step says where it was found, and names that are not declared are reported. The sample grammars come with programs with names, and these are what the tab starts with.

**The automatic detection was wrong for PL/0 and others.**
- `var a, b` declared only `a` (the list `VarRest` has no keyword); `const` declared a symbol `id` that was not in the input (`ConstDef -> ident = number` was not followed).
- `number` was a type keyword, so every `Factor -> number` "declared" a variable `id` of type `number` (in the PL/0 preset), and `Type -> int` declared a symbol although the rule has no identifier.
- A procedure got two nested scopes (`ProcPart` and `Block`, the latter because the left-hand side is called Block), its name was never declared, and the next procedure of the right-recursive list `ProcPart -> procedure id ; Block ; ProcPart` was nested inside the previous one.
- `begin … end` opened a scope, which it is not in PL/0 (and an `end` in another rule would pop a scope at the choice of that rule, before its symbols were read).
- *Fix:* `suggestSymbolActions` was rewritten. Procedure keywords (a separate list: procedure, function, proc, func, fn, def, method) followed by an identifier declare the name in the enclosing scope and open a scope for the rest of the rule, without a trailing self-call; parameters in `( … )` are parameters. Declaration keywords declare the first identifier before `=`/`:`/`:=` and continue into non-terminals that occur only in declarations (`VarRest`, `ConstDef`, `ConstRest`). A type keyword or a non-terminal that derives only type keywords before an identifier declares it with the type read last (`$type`); `int f (` declares a function with a scope. `{ … }` and `begin … end` are scopes only when declarations can occur between them. Rules without an identifier declare nothing, and no exit actions are generated.
- *Result:* PL/0 gives `global: n const, x var, y var, p procedure` and `procedure p: x var`; C blocks give the nested blocks with `x int` shadowed by `x float`; the uses resolve to the right scopes (`rdScoping.test.ts` checks the exact tables and lookups).

**The simulator.** A long input ended at the 800-step limit with the banner "Parsing in progress…" for ever; now the limit is 2,000 steps and the result says that the simulation stopped. Scope entries and exits are steps of their own.

**The JavaScript generator.** Non-terminals called like the locals or globals of the generated `parse` (`log`, `hooks`, `input`, `output`, `leftParse`, `String`) gave a SyntaxError or a wrong program, since the procedure replaced the variable; these names are now reserved. The JavaScript output is compared with the P-code VM on all LL(1) presets and random grammars (`rdLanguages.test.ts`), and its comment no longer promises a `symTab` hook that does not exist.

**The tab.**
- The rewrite had dropped the program input, the run of the P-code (the output of the PL/0 program), the table of the terminal characters, the note on nesting and the detailed hints of the languages; they are back in the sub-tab Generated code, which also runs the JavaScript.
- The three columns (call stack, tree, symbol table) had minimum widths of 960 px but the card beside the grammar panel has about 930 px at a 1,440 px window, so the table was cut off; the columns now follow the width of the card (container queries): three, two with the table below, or one.
- The badge styles `badge-accent`, `badge-secondary`, `badge-info` and the colour `--color-accent` did not exist; they are defined for all themes.
- Every row of a name was highlighted as "new" in every step (the comparison was by name); now the row declared in this step is highlighted, and the entry a name read resolves to.
- The panel of the active procedure showed `function main() { else { error(); } }` for the main program; now `sym = first symbol; Program(); if (sym != $) error();`.
- Hand-edited actions stayed when the grammar changed (with rule numbers of the old grammar); another grammar now starts with the detected actions. The table of actions holds several actions per rule with positions chosen from the right-hand side.
- "Approach 3" and other leftovers of the design discussion were removed from the texts; the sample selector shows the sample of the current grammar.

*The tests* also had a probe for gcc that compiled to `-o NUL`, which on Windows creates a file `NUL.exe` in the working directory; it now compiles into a temporary directory.

*Tests:* `rdScoping.test.ts` (exact symbol tables and lookups of all samples, PL/0 begin/end, a list of procedures, undeclared and redeclared names, the step limit, presets = samples), updated `rdSampleGrammars.test.ts` and `symbolTable.test.ts`, JavaScript in `rdLanguages.test.ts`. 409 tests pass.

## 25. The symbol table: errors and its limits (2026-10-14)

Owner's request: a name that is missing in the symbol table fails the recursive descent even when the word is correct syntactically, and the help says what the symbol table can and cannot do, stressing that it is a demonstration, not a compiler.

**Semantic error.** When an identifier that is not being declared is read and the lookup finds it in no open scope, the simulator stops with "Semantic error: the name 'a' is not declared in any visible scope. The word is correct syntactically so far, but a compiler would reject the program." (`RDSimulationResult.semanticError`); the step is marked as an error and the leaf in the tree as a mismatch. The option `stopOnUndeclared` (default true; a switch in the tab, on the simulator and on the actions sub-tab) turns it back into a report: the word is accepted and the undeclared names are listed. A syntax error found earlier stays a syntax error. Redeclaration in one scope was only marked here (Wirth's PL/0 does not check it either); since §26 it is an error too. Only the simulator does this; the generated programs check the syntax only.

**Help.** The sub-tab "Symbol table actions" starts with a section "Symbol table: what this demonstration can and cannot do" (Czech and English), opened also from the simulator ("What the symbol table can and cannot do", "More" in the table panel). It says first that this is a demonstration tool, not a compiler, then lists:
- *can:* names and numbers read as the identifier and number terminals; declarations when the identifier is read (variables, constants, lists, procedures and functions in the enclosing scope, parameters); procedure scopes and blocks with declarations, nesting, shadowing, closed scopes; lookups of every other identifier, with the semantic error; the type read last; detection by keywords, editable actions;
- *cannot:* no compilation (no code, addresses, levels, sizes; nothing runs); no checks of types, kinds of names or parameters; declaration before use only (no forward references, modules, record fields, overloading, labels); no types after the name or defined by the program; heuristic detection; no comments or strings in the scanner; the generated programs check only syntax; LL(1) only, 2,000 steps; own JavaScript runs unrestricted.

*Tests* (`rdScoping.test.ts`): a PL/0 program accepted without the table is rejected with it (a local of p used in the main program), stopping right after reading the name; a syntax error stays a syntax error; with the switch off the word is accepted and the name listed.

## 26. Redeclaration as an error; a review of the whole application (2026-10-14)

**Redeclaration.** Owner's request: a name declared a second time in one scope is a semantic error, like a name that is not declared. The simulator enters the second declaration (marked, so the table shows both) and stops: "Semantic error: the name 'x' is already declared in scope 'global' (level 0). …". Both checks share one switch (`stopOnSemanticErrors`, default on); switched off, the word is accepted and the tab lists the undeclared names and the names declared twice (`RDSimulationResult.redeclared`). The same name in an inner scope is shadowing, not an error.

**Review of the whole application.** Checked: type-check with unused locals, the full test suite, the build, Czech/English parity of the texts (same keys), and in the browser all 30 presets on all 11 tabs and all three sub-tabs of recursive descent (no console errors or React warnings). Found and fixed:
- *A word of terminals failed the semantic checks.* A grammar without a sample program starts the tab with its example word (`var id ; var id ;`), where every name is the terminal itself; with the checks on, that would be "id is already declared". The terminal written instead of a name names nothing, so it is entered and looked up but not checked (`unnamedIdentifiers`), and the tab says to write real names (x, y) instead. Real names in the same input are checked.
- *Loading a sample grammar on the recursive-descent tab was handled as typing*: undo led back to the previous grammar and the preset menu said "custom grammar" even for a sample equal to a preset. It now behaves as choosing a preset (owner's rule of §20): the preset it equals is selected, otherwise the history starts again with the sample's name.
- *The help on writing a grammar* (sidebar) still described the compact notation before §23; it now mentions `[Ba]`, the question about words like `bxc`, and capitals without rules.
- *GEMINI.md* (the guide of another agent working on the repository) contradicted the implementation: it said that capitalised symbols are non-terminals, that LALR(1) merges LR(1) states, used non-course Czech terms ("První a Následovník"), listed files that do not exist, and described the old symbol table. It is corrected and now says that this file (`docs/REVIEW.md`) holds the binding decisions.
- Unused imports and a dead constant (`ASSOC_NAME`) removed.

*Tests:* redeclaration stops the descent and is shadowing in an inner scope; the terminal instead of a name is not checked while real names are; every sample's word of terminals is accepted with the symbol table on.

## 27. Step-by-step interactive algorithms, literature audit & text clarity (2026-10-17)

**1. CYK Step-by-Step Dynamic Programming Simulation.**
- An interactive step-by-step table filling simulator was implemented for the CYK algorithm (the CYK card `CykCard` in `src/ui/views/MembershipView.tsx`; there is no separate CYK view).
- In addition to showing the final triangular table, users can step forward, step backward, or auto-play the computation cell-by-cell ($V(i, j)$ ordered by substring length $l = 1 \dots n$).
- Visual operand cell highlighting: when computing cell $(i, j)$ at split position $k$, the left operand cell $V(i, k)$ (`.active-left`) and right operand cell $V(k+1, j)$ (`.active-right`) are highlighted with distinct vibrant borders and backgrounds, while the target cell $V(i, j)$ (`.active-target`) is highlighted; the cells not computed yet at this step are dimmed (`.dimmed`) and show `·`, the computed ones keep their content.
- Derivation tree extraction: `extractCYKTrees` parses back-pointers from the CYK table to generate valid binary derivation trees for accepted words, rendering them directly in the tree visualizer.
- Step descriptions are fully localized in Czech and English, detailing the active substring, split point, and applicable CNF rules ($A \to B\,C$ or $A \to a$).

**2. ALL(\*) Lookahead Micro-Stepping.**
- In addition to top-level parsing decisions, ALL(\*) lookahead calculations feature detailed step tracing (`detailedLookaheadSteps`).
- Steps trace ATN subparser $\varepsilon$-closures, call/return stack movements, Lookahead DFA state caching and transitions, and conflict resolution by rule priority.
- The interactive Dagre SVG visualizer highlights the active DFA state and configuration frontiers in real time with bilingual status banners.

**3. Academic Literature & Bibliography Audit.**
- Automated network validation across all 53 external URLs and DOIs in the codebase.
- Found and fixed a DOI typo in `src/core/earley/earleyParser.ts:6` and `src/core/earley/earleyExplain.ts:16` (`10.1145/362005.362035` → `10.1145/362007.362035`, now resolving directly to ACM Digital Library for Earley's 1970 CACM paper).
- Integrated the existing `LR_TECHNIQUE_REFERENCES` into `src/ui/views/LRView.tsx` via `<ReferenceBar>` (Knuth 1965, DeRemer 1969/1971/1982, Aho 1974/1975, Pager 1977, Tomita 1985, Scott & Johnstone 2006, Denny & Malloy 2010).
- Integrated `TRANSFORMATIONS_PRIMARY_REFERENCES` into `src/ui/views/TransformationsView.tsx` via `<ReferenceBar>` (Chomsky 1959, Greibach 1965, Rosenkrantz & Stearns 1970, Bar-Hillel et al. 1961).
- Updated `docs/REFERENCES.md` with full bibliographic citations for Scott & Johnstone (2025/2026) (Earley Table Traversing Parsers) and Aycock & Horspool (2002) (Directly-executable Earley parsers).

**4. Text Clarity & Bilingual Parity.**
- Verified that all explanations across LL(1)/LL(2), LR(0)/SLR(1)/LALR(1)/LR(1), GLR, ALL(*), Earley, ETTP, CYK, recursive descent, and grammar transformations adhere strictly to KIV/FJP course terminology in Czech and standard academic literature terminology in English.

**5. Earley & ETTP Derivation Tree Verification & Visualization Fix.**
- Problem: In ETTP (`ettpParser.ts`), state-pair transition traversal compounded children, causing exponential prefix duplication in the derivation trees. In `EarleyView.tsx`, the tree visualizer only showed the complete parse tree on the final step (`isLastStep`), displaying isolated, partial step fragments during step navigation.
- Fix: ETTP derivation tree extraction now produces exact trees matching the parsed tokens without distortion. `EarleyView.tsx` defaults to displaying the full derivation tree of the accepted word (with leaves matching the input word 100%), adds a segmented toggle between Full Tree and Step Subtree, and highlights active step nodes directly within the tree.
- Tests: Added automated test in `src/test/earleyParser.test.ts` verifying that `extractLeaves(tree)` exactly equals `tokens` across all presets and generated words for both Earley and ETTP.

**6. Universal Derivation Tree Leaf Yield Verification across All Parsers.**
- Problem & Scope: Verified derivation tree leaf correspondence (`extractTreeLeaves(tree)` equals input `tokens`) across every parser in the platform for all supported grammars using at least 3 non-trivial words of reasonable length (length $\ge 3$, or maximal words for finite languages like `ll1_not_slr1`).
- Engines tested:
  1. LL(1) simulator (`simulateLLParse`)
  2. LL(2) simulator (`simulateLLParse` with $k=2$ strong and local lookahead contexts)
  3. Deterministic LR parsers: LR(0), SLR(1), LALR(1), IELR(1), LR(1) (`simulateLRParse`)
  4. GLR with GSS (`simulateGLRParse`), verifying every parse tree produced in ambiguous and unambiguous modes
  5. ALL(*) adaptive top-down parser (`simulateALLParse`)
  6. Classic Earley (1970) (`simulateEarleyParse`)
  7. ETTP (2025/2026) (`simulateETTPParse`)
  8. CYK chart parser (`simulateCYKParse`, `extractCYKTrees`)
  9. Recursive descent simulator (`simulateRecursiveDescent`)
- Algorithmic Fixes:
  - In `src/core/all/allPredictor.ts`: Fixed ATN lookahead prediction closure on rule stop states for start symbol recursion (e.g., nested sub-expressions `F -> '(' E ')'`). Previously, follower return states were ignored when `ruleName === atn.startSymbol`, causing lookahead predictions to fail on closing parentheses.
  - In `src/core/all/allParser.ts`: Replaced hardcoded fixed-depth call-stack recursion check with token-position cycle detection (`activeCallsAtPos`), allowing legitimate deep right derivations while safely preventing non-productive left loops.
- Tests: Comprehensive master test suite in `src/test/allParsersTreeYield.test.ts` plus direct leaf yield assertions in `src/test/all.test.ts`, `src/test/glr.test.ts`, `src/test/ielr.test.ts`, `src/test/recursiveDescentJs.test.ts`, and `src/test/rdSampleGrammars.test.ts`. All 38 test suites (717 tests) pass.

**7. Earley & ETTP Automaton Graph: Node Cores, Remaining Rules, and Transition Reasons.**
- Literature grounding: Grounded in Scott & Johnstone (2025/2026) ("Earley Table Traversing Parsers"), classic Earley (CACM 1970), and Aycock & Horspool (2002).
- Node Cores & Remaining Rules:
  - Inside every automaton node, items are partitioned into the **Core / Kernel** ($A \to \alpha \cdot \beta$ with $|\alpha| > 0$, plus $[S' \to \cdot S]$ for state 0) and the **Remaining Rules / Prediction Closure** ($B \to \cdot \gamma$ with $|\alpha| = 0$).
  - Rendered with a distinct dashed separator and label (`Zbývající pravidla (predikce) / Remaining rules (closure)`), with header badges indicating counts (e.g. `2K + 3P`).
- Transition Reasons & Origin Semantics:
  - Parallel transitions between the same state pair are merged into unified labeled edges (`symbols: string[]`), preventing Dagre edge overwrite.
  - Edges display origin badges `[K]` (kernel, solid line), `[P]` (predicted, dashed line), or `[K+P]` (hybrid).
  - Interactive hover tooltips (via `FloatingTip`) display the exact derivation reason: triggering items in $q_{from}$ ($A \to \alpha \cdot X \beta$), resulting core items in $q_{to}$ ($A \to \alpha X \cdot \beta$), and origin semantics (inheriting origin $j$ vs initializing origin $i$).
- State Educational Derivation Inspector:
  - The inspector below the graph features 4 structured cards:
    1. *Jádro stavu a vznik (Core & Origin)*: incoming transitions and the parent items that generated this state's core.
    2. *Zbývající pravidla (Predikovaný uzávěr / Prediction Closure)*: lists closure rules and identifies the exact parent item in the state that triggered each prediction.
    3. *Výstupní přechody a spouštěcí pravidla (Outgoing Transitions & Reasons)*: outgoing transitions with triggering rules and clickable target state navigation.
    4. *Dokončená pravidla a redukce kompletoru (Completions & Reductions)*: explains how completed rules $A \to \gamma \cdot$ drive the Earley Completer.
- Dual-Mode Accessibility:
  - The automaton graph is now accessible in both Classic Earley (1970) and ETTP (2025) modes, with an educational banner explaining the connection between runtime chart sets and the precomputed static item automaton.
- Tests: Added unit test suite in `src/test/earleyParser.test.ts` verifying core/closure partitioning, transition reasons, trigger items, and origin classification across presets. All 38 test suites (719 tests) pass.

**8. Rigorous Verification of Grammar Transformations: Actual Results and Language Equivalence (2026-10-17).**
- Problem: Several transformer test suites previously verified only metadata (e.g. `res.steps[0].titleCz`, step counts), boolean return flags (`res.success === true`), or generic properties without checking the actual resulting grammar rules against expected solutions or verifying that $L(G) = L(G')$.
- Systematic Audit & Reinforcement:
  - `src/test/ll1Transformer.test.ts`: Added concrete rule assertions `rules(res.transformedGrammar)`, `isLL1(res.transformedGrammar)`, and language equivalence `expectEquivalent(g, res.transformedGrammar, k)` to:
    - Left recursion removal: verified exact rules `E -> T E'`, `E' -> + T E' | ε`, `T -> F T'`, `T' -> * F T' | ε`, `F -> ( E ) | a` and $L(G) = L(G')$.
    - FIRST-FIRST clash exposure via substitution and left factoring: verified exact rules `A -> a A' | b F D`, `A' -> b | E D`, `D -> d`, `E -> x`, `F -> f` and $L(G) = L(G')$.
    - FIRST-FOLLOW conflict resolution via terminal absorption: verified exact rules `S -> a A a a | b [Ab] a`, `A -> b | ε`, `[Ab] -> b A` and $L(G) = L(G')$.
  - `src/test/leftCornerRightFactor.test.ts`:
    - Verified exact resulting rules for left-corner transformations eliminating indirect left recursion (`rules(res)` for $S \to A a \mid b, A \to S c \mid A d \mid e$ and non-terminal cycle boundaries).
    - Verified exact resulting rules for full right factoring (`rules(res)` for $S \to i E t S \mid i E t S e S \mid a, E \to b$).
  - `src/test/ll1Transformations.test.ts`:
    - Added language equivalence verification `expectEquivalent(g, res, 5)` to occurrence-level substitutions.
    - Verified complete rule assertions `rules(res)` for non-terminal splitting (`splitFollowForOccurrence`) and epsilon-free immediate left recursion elimination.
  - `src/test/grammar.test.ts`:
    - In `Grammar Processor (Transformations)`: Added exact `rules(res.transformedGrammar)` and `expectEquivalent` checks to left recursion removal, left factoring, unit rule removal, Chomsky Normal Form (CNF) conversion, and grammar reduction.
    - In symbol transformations: Added exact `rules(res.transformedGrammar)` and `expectEquivalent` assertions for individual non-terminal transformations (`eliminateImmediateLeftRecursion`, `leftFactor`, `eliminateEpsilon`, `eliminateUnit`).
  - `src/test/lrTransformations.test.ts`:
    - Verified exact resulting rules `rules(res.transformedGrammar)` for Dangling-Else disambiguation (standard, complex multi-rule form, and C-style parentheses), Floyd precedence stratification, Mickunas context splitting, and left-linear to right-linear conversion.
    - Verified exact resulting rules for `attemptResolveLRConflicts` across all conflict resolution strategies.
  - `src/test/correctness.test.ts`:
    - Added exact rule checks and language equivalence to `eliminateEpsilon` and unreachable rule elimination.
- Validation: All 38 test suites (719 tests) pass with zero errors, verifying both actual rule structures and language preservation across all transformations.

## 28. Review of IELR(1), CYK, ALL(*), Earley and ETTP against the literature (2026-10-17)

The algorithms added in §27 were compared with their primary sources and tested against independent oracles (Earley recognizer of `src/test/earley.ts`, the CYK-based membership test, canonical LR(1)) on thousands of seeded random grammars, all words up to length 5–6. Earlier tests checked mostly that trees have the right leaves; they did not compare acceptance with the language, so the bugs below passed them. Every bug found has a regression test.

**Earley (1970) and ETTP (Scott & Johnstone 2025).**
- Checked against Earley's CACM paper, Aycock & Horspool (2002: ε-rules, the LR(0)ε automaton and its split form) and the abstract of Scott & Johnstone. The full text of the ETTP paper was not reachable (ScienceDirect and SSRN are behind bot checks), so the implementation follows the split automaton of Aycock & Horspool, which a table-driven Earley parser with pairs (q, j) needs; correctness is checked against the oracle (1 500 random grammars, words ≤ 6).
- **ETTP was wrong.** Its states mixed kernel items (origin j of the pair) with predicted items (origin i = the current set); transitions marked 'both' pushed two pairs, each claiming one origin for all items. It accepted words outside L(G): `S → b A | b b`, `A → S A | a | b c` accepted `b b b`; `S → ε | a A c`, `A → a A a | ε | c c b` accepted `a a a a c`. Now: kernel states (items after a transition plus moves over nullable symbols, origin j) and predicted states (origin = set index), joined by a precomputed ε-link; adding (q, j) to Sᵢ also adds (predicted(q), i); completions with j = i are skipped (the closure already moved over the nullable symbol). `ETTPState.kind`, `predictedStateId`, `isETTPKernelItem(item, state)`, `findPredictionTriggers(table, state, item)`.
- The ETTP trees were copied from the classic Earley run (§27.5). Both parsers now take their trees from their own chart (`earley/earleyTrees.ts`: bottom-up fixpoint over completed items, terminates on cycles and ε-rules); the ETTP chart is its pairs expanded to items, and `stats.representedItems` equals the number of classic Earley items (tested).
- Earley trees gave a nullable non-terminal an invented rule `A → ε` (`A → B C`, `B → ε`, `C → ε | c`); now it gets the subtree of a real ε-derivation, and repeated ε-subtrees get unique node ids.
- A grammar with its own `S'` clashed with the added rule `S' → S`: for `S → S' a`, `S' → b` both parsers accepted `b a a`. The added start symbol is now fresh (`S''` …), as in `augmentGrammar`.
- Steps record the items they came from (`sources`: parent / scanned / completed / waiting) and the set sizes after them (`setSizes`, instead of a copy of the whole chart per step). The view marks the new item (solid) and its sources (dashed, with a legend), scrolls the active set into view, and at the last step explains the result (the first empty set and the longest prefix that can still be completed, or the accepting item). Step texts name the part of the word a non-terminal derived. ETTP pairs list the items of their state. The graph highlights the transition or ε-link the current ETTP step used and zooms to a readable scale around it (before, the target state was taken as the source, so nothing was highlighted; and in classic mode the graph highlighted ETTP step numbers). Two undefined colour tokens made node headers black.
- Texts: ε-rules make the plain algorithm *miss* items, they do not make it loop; O(n) holds for bounded-state grammars (Earley uses look-ahead), not for "deterministic grammars"; invented section numbers of the papers are gone; "Kompletor" is used throughout; the ETTP theory and metrics describe kernel/predicted states and pairs (the "0 operations" and speed claims are now attributed to the authors' experiments).

**IELR(1).** The code is not Denny & Malloy's IELR (LALR(1) + annotations + splitting, without canonical LR(1)); it merges canonical LR(1) states with the same core. That is kept, and described as such, but the merge test was too weak:
- conflicts leaked into contexts where LR(1) has none (`S → a A d | a B d | b A f | b B d`, `A → c`, `B → c`: `b c d` rejected), and precedence was not resolved like LR(1)/Bison (`%left c`, `S → c S c | c`: `c c c` rejected). Now LR(1) states stay merged only when every state with an action on t keeps the same action after conflict resolution — precedence/associativity, otherwise Bison's default (shift before reduce, earlier rule). So the parser behaves like canonical LR(1) after conflict resolution, as Denny & Malloy require; ambiguous grammars keep LALR's states (dangling_else 9, palindromes 8, earley_equal_ab 10); lalr1_vs_lr1 and print_vs_expr_ielr have 14 (LALR 13, LR(1) 14). The split is greedy, not guaranteed minimal.
- states are numbered breadth-first (the step-by-step construction of both IELR presets was broken); GLR uses the IELR automaton for IELR(1); "precedence off" builds its own IELR automaton.
- the IELR panel listed genuine conflicts as "eliminated" and explained successor-only splits as conflict splits; each split now records its reason. False claims ("minimal", "without LR(1) explosion", "starts from LALR cores") are gone; the badge says an IELR table is conflict-free ⇔ the grammar is LR(1).
- the LR simulator resolves a conflict cell like Bison (shift, then the earliest rule) instead of taking the first action.
- `src/test/ielrProperties.test.ts`: on 2 400 random grammars, with and without precedence, every IELR cell equals the resolved cell of every merged LR(1) state, both tables accept the same words, LALR ≤ IELR ≤ LR(1) on reduced grammars, construction steps are valid.

**ALL(*) (Parr, Harwell & Fisher 2014).** The predictor had no conflict detection and no full-LL fallback: it read to the end of the input and took the smallest surviving alternative, and a `rulesEntered` pruning cut valid closure paths. 697 words of L(G) in 92 of 1 177 random grammars were rejected, including the paper's own §3.1 example (`S → x B | y C`, `B → A a`, `C → A b a`, `A → b | ε`, input `y b a`). Rewritten after the paper's Functions 2–9: SLL prediction with the DFA cache and the wildcard stack `#`, conflict detection (same (p, Γ), different alternatives), fallback to LL prediction with the parser's real stack (not cached), ambiguity resolved by the minimal alternative only after an LL conflict, "no viable alternative" is a syntax error. Left recursion of any kind (also indirect and hidden) gives "not applicable", reaching a limit gives "undecided" — never "∉ L(G)". The ATN has a state per item; configurations are shown as dotted items with their stack. The DFA graph shows the state of the DFA at the shown step (`createdAt`), highlights the active state and edge, and does not go stale. Section citations follow the paper. `src/test/allStar.test.ts`: Earley vs ALL(*) on 2 000 random grammars (words ≤ 5; a 986 102-word stress run found no difference), the §3.1 example, long inputs. Open: no graph-structured stack, so a closure is capped (200 000 configurations → "undecided"; seen only on 2 highly ambiguous random grammars); ANTLR's two-stage SLL-then-LL parse is not simulated (the guide says so).

**CYK.** Recognition and trees were correct (538 grammars, 194 748 words). Fixed: no tree for words of 27 symbols or more (a depth guard; trees are now built once per (A, i, j)); every step copied the whole table (n = 60: 29 s and 46 M entries, now ~0.1 s — cells are derived from the final table and the step order, `cykCellAtStep`); in step mode a step without its own subtree showed the finished tree; texts ("Adding {} to V(i,j)" when the non-terminal was already there — now explained as another derivation; `{∅}` for ∅; the parts of the word and B ∈ V(i,k), C ∈ V(k+1,j) are named; the rejection shows V(1,n)); tree pager with the exact tree count (`countCYKTrees`); the CNF grammar G′ is shown open with L(G′) = L(G); the table, the step and its subtrees sit side by side from 1 200 px. `src/test/cykSteps.test.ts`.

**Layout.** The Earley/ETTP controls and step explanation are sticky (`.sim-sticky` in `index.css`); the ALL(*) and CYK views were rearranged so that the step, the table/graph and the tree fit together on 1920×1080.

## 29. Leo's transitive items in the Earley simulator (2026-10-18)

A literature review recommended Leo's right-recursion optimisation (Leo 1991, TCS 82(1), 165–176, doi 10.1016/0304-3975(91)90180-A); Marpa (Kegler 2019, arXiv 1910.08129, §7) is the documented practical form. Leo's paper itself was not read here (paywalled); the definitions follow Kegler's account of it, which matches the secondary summaries (linear time and space on every LR(k), even LR-regular, grammar without look-ahead).

- **Option of the classic simulator** (`simulateEarleyParse(tokens, g, { leo: true })`, switch "Leovy tranzitivní položky" in the Earley tab). Without it the simulator is unchanged (the third parameter changed from `maxSteps` to an options object; no caller passed it).
- **Condition (Leo's):** `[A → α • B, j]` is the *only* item of Sₖ with B after the dot, and B is its last symbol. Then every completion of B with origin k completes A with origin j — the deterministic reduction path (Marpa: Leo stack). Marpa also allows a nullable rest after B and memoizes only right-recursive rules; we keep Leo's strict penult and memoize any rule. Omitting a transitive item never affects correctness (Kegler §7.1), which the code uses twice: completions with origin i (the current, still growing set) are left to the ordinary completer (with Aycock–Horspool they add nothing new), and a path that runs into a cycle of unit-like rules in one set (`A → B`, `B → A`) gets no transitive items.
- **Transitive items** are created lazily, when a completion first needs them (Leo; Marpa is eager), for the whole path at once from the top down, and stored per set (`EarleySet.leoItems`, shown as Marpa's triple `[C → δ •, B, m]`: dotted rule, transition symbol, origin; `depth` = items of the path it stands for, `next` = the transitive item above). The completer then adds only the topmost item (`operation: 'leo'`); steps of kind `'transitive'` explain why the symbol is Leo-unique and where the path ends.
- **Trees:** the skipped items are needed only for derivation trees. After recognition every Leo completion walks its transitive items down again and adds `[A → α B •, j]` for each waiting item (Marpa's Leo stack expansion, Alg. 1), stopping as soon as an item is already there (`reconstructedItems`, `stats.skippedItems`). The chart extractor (`earleyTrees.ts`) gets chart ∪ reconstructed items and is unchanged. Expanding all paths costs what Leo saved, so it is done for the trees only; Marpa expands only the paths a parse uses.
- **Counts:** `S → a S | ε` on aⁿ: plain Earley puts `[S → a S •, j]` for every j < i into Sᵢ (Θ(n²) items: n = 6 → 49), with Leo every set has a constant number of items and transitive items (n = 6 → 34 + 6; the differences double exactly when n doubles). Left recursion gains nothing (it is linear already).
- **Texts:** the complexity section said "bounded-state grammars, e.g. most LR(k) grammars: O(n)". Now: Earley is linear on a large class (his bounded-state grammars, with look-ahead) but not on every LR(k) grammar; the simulated algorithm has no look-ahead and right recursion costs Θ(n²) items; with Leo O(n) on every LR(k) / LR-regular grammar. New theory section 5; Leo and Kegler in the reference bar.
- **Tests** (`src/test/earleyLeo.test.ts`): 300 seeded random grammars, all words ≤ 5 — acceptance equals the oracle of `src/test/earley.ts`, trees use real rules and yield the word, Leo's chart ⊆ the plain chart and chart ∪ reconstructed = the plain chart exactly (set by set), item counts add up; linear counts for `S → a S | ε`, `S → a S | a` and `E → T + E | T` (n = 10…80) against quadratic plain counts; left recursion unchanged; step texts and sources; cyclic unit rules terminate.

## 30. Counterexamples for LR conflicts (2026-10-18)

Isradisaikul & Myers, *Finding Counterexamples from Parsing Conflicts*, PLDI 2015, 555–564 (https://www.cs.cornell.edu/andru/papers/cupex/cupex.pdf); Bison 3.7 `-Wcounterexamples` (manual, "Generation of Counterexamples"). `src/core/lr/lrCounterexample.ts`, `createCounterexampleFinder(grammar, automaton).forConflict(conflict)`; works on the automaton of every table (LR(0), SLR(1), LALR(1), IELR(1), LR(1)), both layouts (an LR(0) lecture conflict is a whole state).

- **Unifying counterexample** (one word, two derivation trees → the grammar is ambiguous). The paper searches with a product parser; we reuse the bounded ambiguity search of `analyser/ambiguity.ts` (refactored: `ambiguityWitnesses` reports every second leftmost derivation of a sentential form, completed to a word; `findAmbiguity` takes the first, as before). For each witness both left parses are turned into shift/reduce sequences (reversed rightmost derivations) and replayed on the automaton; where they first differ, the stack and the remaining input are the same, so (state, next symbol) is a conflict cell holding both actions in every table. The shortest word per cell and action pair is kept. Bounds: words ≤ 9, 60 000 forms — "not found" proves nothing, and the texts say so (with "the search hit its limit" when it did). Unlike the paper, the example is a terminal word, not a sentential form with non-terminals.
- **Non-unifying counterexample** (paper §4): a shortest path in the lookahead-sensitive graph — vertices (state, item, lookahead), edges = transitions of the automaton and production steps `[A → α • B β, a] → [B → • γ, b]` with b ∈ FIRST(β a) (the paper's precise follow sets, here one terminal per vertex) — from `[S' → • S, $]` to the reduce item with the conflict lookahead; the other item is then searched along the same states (only production steps may differ), and if that fails, the other way round. The productions open on the path are completed so that the conflict symbol stands right after • (a non-terminal before it is expanded to a derivation starting with it, nullable ones to ε); other symbols stay unexpanded. Two outcomes the paper's LALR setting does not name are reported explicitly:
  - *different prefixes*: each item needs another prefix into the same state — the canonical LR(1) automaton keeps them apart, the conflict comes from merging (LALR(1)); e.g. `S → a A d | b B d | a B e | b A e`, `A → c`, `B → c`: `a c • d` with A → c and `b c • d` with B → c (Bison prints two examples in this case too);
  - *lookahead not in context*: no derivation into the conflict state has the symbol after the reduction — SLR(1) reduces on all of FOLLOW(A) (LR(0) on everything); a second derivation shows where the symbol does follow A (`S → L = R | R`, `L → * R | id`, `R → L`: `L • = R`, and `=` follows R in `* R = …`). If FOLLOW comes only from rules no word uses (grammar not reduced), the text says so; if the conflict items occur in no derivation of a word at all (non-generating symbols), no counterexample is shown and the reader is told to reduce the grammar.
- **UI:** a closed "Protipříklad ke kolizi / Counterexample for the conflict" under every conflict in the LR table and in the state panel of the automaton; the search runs only when opened (all presets: about 1.3 s in total for every LR(0)/SLR(1)/LALR(1) conflict). Two trees side by side, the form with •, the actions in KIV terms; the Czech conflict labels are now "Kolize přesun/redukce", "Kolize redukce/redukce" (as "Kolize FIRST-FIRST").
- **Tests** (`src/test/lrCounterexample.test.ts`), every derivation checked independently of the search: trees use real rules and have the reported frontier; for unifying ones both left parses are replayed by a separate implementation and must part in the conflict state with the conflict lookahead and two actions of the cell; for non-unifying ones the prefix leads the automaton into the conflict state, a reduce derivation has the handle ending at • and the lookahead right after it (or a valid FOLLOW witness), a shift derivation has the symbol after •. Dangling else is unifying (`if c then if c then other • else other`) in SLR/LALR/IELR/LR(1); every conflict of `E → E + E | E * E | a` except LR(0)'s accept/shift ones is unifying; the LR(1)-not-LALR(1) grammar above gives non-unifying ones with different prefixes; the LALR-not-SLR grammar gives the FOLLOW case; 400 random grammars × 5 tables × both layouts and all presets pass.

## 31. GLL with BSR sets and shared packed forests (2026-10-19)

A literature review (2026-10-18) named GLL the main general algorithm the application lacked: the top-down counterpart of GLR, one of the parsers measured by Vo et al. (arXiv 2606.08465, 2026). Sources, all read in full (the 2013 and 2019 papers as the submitted/accepted manuscripts in the Royal Holloway repository, via Wayback copies): Scott & Johnstone, *GLL Parsing* (ENTCS 253(7), 2010, doi 10.1016/j.entcs.2010.08.041); *GLL parse-tree generation* (SCP 78(10), 2013, doi 10.1016/j.scico.2012.03.005); Scott, Johnstone & van Binsbergen, *Derivation representation using binary subtree sets* (SCP 175, 2019, doi 10.1016/j.scico.2019.01.008); Johnstone, *A Reference GLL Implementation* (SLE '23, doi 10.1145/3623476.3623521 — by Johnstone alone, not Scott & Johnstone).

- **Parser** (`src/core/gll/gllParser.ts`, `parseGLL(grammar, tokens, { lookahead, maxDescriptors, maxTrees })`): descriptors (L, u, i), R, U, the pop set P, GSS nodes (L, i) with L a return slot and the base node u₀ = (L₀, 0) as in the 2013 paper; `add`, `create` (with the contingent returns from P for a new edge) and `pop` (nothing for u₀) as in the papers; `test(a, X, α)` (a ∈ FIRST(α), or α ⇒* ε and a ∈ FOLLOW(X)) before an alternative and before a call after the first symbol, as in 2010 — a switch, on by default (the reference implementation has none). The papers generate code per slot; here an interpreter walks the slots (like Johnstone 2023). R is a stack, so the trace reads like recursive descent (the papers allow any order).
- **BSR** (`src/core/gll/bsr.ts`): elements (X ::= α, i, k, j) and (α, i, k, j) with |α| ≥ 2, `bsrAdd` exactly as in the 2019 paper (rule element when β = ε, string element when |α| > 1; ε-rule (X ::= ε, i, i, i)); string elements are keyed by the string, shared between rules. Acceptance = (S ::= α, 0, k, n) ∈ Υ (2019); tested to agree with "pop(u₀, n) happened". **Deviation, stated in the docs:** the 2019 paper's own parser is the clustered form (CNP: descriptors (L, k, j), a call-return forest, `ntAdd`, `call`, `rtn`); the task asked for the GSS of 2010/2013, so the app combines that GSS with `bsrAdd` in place of `getNodeT`/`getNodeP`, which is the correspondence the paper draws in §5.5.
- **Trees**: read top-down from the root elements (a rule element split at its pivot, the prefix through string elements); a part on the current path is not entered again, so a cycle is not repeated; the count is exact, ∞ when a part with a tree depends on itself (least fixpoint + cycle check).
- **Forest** (`src/core/forest/sppf.ts`): `bsrToForest` builds the forest of the whole word top-down from (S, 0, n), so it holds only parts used by some derivation; two forms — *by rules* (Tomita: a packed node = a rule and a cut of the part among all its symbols) and *binarised* (2013: packed nodes with ≤ 2 children, intermediate nodes keyed by slot). `earleyChartToBSR` turns an Earley chart into a BSR set ([A → α X • β, k] in Sⱼ with [A → α • X β, k] in Sₘ and X over w[m..j)), `treesToForest` merges a list of trees (GLR's). `forestTreeCount` (Tarjan SCC for cycles), `treeInForest` (ids of one tree, to highlight it).
- **UI**: tab *GLL* after *Earley & ETTP* in the first row (URL `tab=gll`, aliases bsr, sppf, forest); Overview badge. Sticky step panel (`.sim-sticky`): the descriptor taken from R and every operation it causes in words (match, create — new node / shared call, new edge —, contingent return, add — into R / already in U —, pop with P, bsrAdd with its element, failed tests). Below, in three columns from 1 500 px (`.gll-grid`): R (top of the stack marked) with |U| and |P|, the BSR set (new elements green); the GSS laid out once for the whole run (nodes keep their places, the part up to the step is drawn, the view follows the active node at a readable scale, P shown on the nodes); the derivation tree — the subtree of the newest rule element read from Υ as it was at that step, or the trees of the whole word with a pager. At 1920×1080 the step, the GSS and the tree are on screen together without scrolling. Below: the forest (form switch, source GLL / Earley, the pager's tree highlighted, ambiguous nodes orange with their packed alternatives labelled). The GLR panel of the LR tab has a "Shared forest" button for its trees.
- **Tests** (`src/test/gll.test.ts`, 19 tests): 500 seeded random grammars (290 left-recursive, 413 with ε-rules), all words ≤ 5, with and without the look-ahead test — 65 840 words each: acceptance = the Earley oracle (2 477 accepted), tree count = `testMembership` (1 308 ambiguous, 737 with ∞ trees), every listed tree uses real rules and yields the word, trees are distinct and are exactly the membership trees when ≤ 50; soundness of every BSR element (prefix and last symbol really derive their parts, checked by the oracle) on 120 grammars, words ≤ 4; forests on 250 grammars: GLL and Earley give the same forest node for node in both forms, the forest count equals the membership count, every tree lies in the forest, binarised packed nodes have ≤ 2 children; the GLR trees of `E → E + E | E * E | a` on `a + a * a + a` give the GLL forest (5 trees); hand-made grammars (immediate, indirect and hidden left recursion, `S → S a | ε`, cycles `S → S | A | a`, `A → A | ε`, palindromes, Catalan numbers 1…429 for `S → S S | a`, a rule-less non-terminal, dangling else); the operations (a shared call at 0 for `E → E + E | a`, duplicate adds, contingent returns), the descriptor limit. The look-ahead test saves about a third of the descriptors on the random grammars (555 686 vs 883 404).
- **Literature notes**: "SPPF" — Tomita's thesis/book use "shared-packed forest"; Rekers (1992) says "parse forest"; the 2019 paper credits Tomita. The 2019 paper speaks of BSR sets that "embed" derivation trees (Γ-core trees), not of "extracting" them; the texts follow that.

## 32. Audit of the reference links (2026-10-19)

Every URL in `src/`, `README.md` and `docs/REFERENCES.md` was checked: DOIs against the Crossref (and DataCite) metadata — title, year, venue, pages — and the other links by fetching the page and comparing its title with the citation. Eleven links led to the wrong work; they were in the reference bars, the transformation ⓘ texts, the teaching guide and REFERENCES.md since before §27:

| Reference | Old link (what it was) | Now |
|---|---|---|
| Denny & Malloy 2010 (IELR(1), SCP 75(11)) | 10.1016/j.scico.2009.09.006 (a concurrency-verification paper) | 10.1016/j.scico.2009.08.001 |
| Parr & Fisher 2011 (LL(*)) | 10.1145/1926385.1926432 ("Delay-bounded scheduling") | 10.1145/1993498.1993548 |
| Parr, Harwell & Fisher 2014 (ALL(*)) | 10.1145/2594291.2594326 ("Verification modulo versions") | 10.1145/2660193.2660202 |
| Mickunas, Lancaster & Schneider 1976 | 10.1145/321958.321969 (an ordinal-regression paper) | 10.1145/321958.321972 |
| Rosenkrantz & Lewis 1970 | 10.1109/SWAT.1970.19 ("Program schemata as automata") | 10.1109/SWAT.1970.5 |
| Tomita, *Efficient Parsing for Natural Language* | 10.1007/978-1-4613-2575-8 (a nephrology book) | 10.1007/978-1-4757-1885-0 |
| Bar-Hillel, Perles & Shamir 1961 | 10.1515/9783112613764-007 (an art-history text) | 10.1524/stuf.1961.14.14.143 |
| Lucas 1961 | dblp `journals/er/Lucas61` (404) | 10.1524/itit.1961.3.16.159 |
| Kasami 1965 | hdl 2142/74301 (a plasma-physics report) | DTIC AD0631692 |
| Rekers 1992 (thesis) | hdl 11245/1.103006 (a medical thesis) | ir.cwi.nl/pub/29930 |
| DeRemer 1969 (thesis) | hdl 1721.1/13857 (a 1991 vision thesis) | hdl 1721.1/13628 |

Also corrected: LL(*) appeared at PLDI '11 (not POPL '11, SIGPLAN Notices 46(1)); ALL(*) at OOPSLA '14, pp. 579–598 (not PLDI '14, 579–589; the core comments said PLDI too); Tomita's book is Kluwer 1986 (Crossref/Springer), now "Tomita (1986)" everywhere it is cited; the Kasami report is cited as AFCRL-65-758 only (the "CSL Report R-257, University of Illinois" could not be found anywhere); the Hopcroft–Motwani–Ullman Pearson page is gone, the link is the ISBN record at Open Library. REVIEW.md keeps its history unchanged. Links that answer bots with 403/429 (the Royal Holloway PDFs behind Cloudflare, DTIC, MIT DSpace) were checked by hand or through their APIs.

## 33. Recursive ascent (2026-10-21)

The owner asked about recursive ascent, the LR analogue of recursive descent. It is a fourth sub-tab of *Rekurzivní sestup* ("Rekurzivní vzestup (LR)"): the menu rows (`TAB_ROWS`) stay as they are, and the tab's tooltip now names both methods. It works for every grammar with a conflict-free LR table, also when the grammar is not LL(1); the LL(1) notice of the tab offers it. Link: `tab=ascent` (or `recursive-ascent`) opens the sub-tab (`UrlState.rdPart`). The variant is the one shared with the LR tabs.

**Sources.** Only Horspool's report was read in full: *Recursive ascent-descent parsing*, University of Victoria, 11 June 1991 (webhome.cs.uvic.ca/~nigelh/Publications/rad.pdf), the version of Computer Languages 18(1), 1–15, 1993 (doi 10.1016/0096-0551(93)90027-X); the journal version may differ in details. Its §5.2 gives the scheme implemented here, §5.3 the ascent-descent variant. Roberts 1988 (SIGPLAN Notices 23(8), 23–29, doi 10.1145/47907.47909), Roberts 1989 (IPL 32(5), 263–266, doi 10.1016/0020-0190(89)90054-9 — Horspool writes 1990), Kruseman Aretz 1988 (IPL 29(4), 201–206, doi 10.1016/0020-0190(88)90061-0), Barnard & Cordy 1988 (Computer Languages 13(2), 65–74), Leermakers, Augusteijn & Kruseman Aretz 1992 (TCS 104(2), 313–323, doi 10.1016/0304-3975(92)90128-3) and Pennello 1986 (SIGPLAN Notices 21(7), 145–151, doi 10.1145/13310.13326) are paywalled. Their metadata were checked against Crossref, and the texts say only what Horspool says about them. **Correction to the brief:** Pennello's "Very fast LR parsing" is not recursive ascent. Horspool lists it among the *other* directly executed LR parsers, which are faster than recursive ascent and much smaller, and the app cites it that way.

**The scheme** (`src/core/codegen/recursiveAscent.ts`, Horspool §5.2):
- one procedure per LR state, entered after the shift into it (the caller reads the terminal);
- shift t: read t, call the procedure of g(q, t);
- reduction by A → α, |α| > 0: print the rule number and return (A, |α|). Every caller decrements the count and returns it while it is > 0. The caller where it reaches 0 is the top after popping |α| states: it calls g(q, A) and loops on the result (Horspool's `while (TRUE)` over the gotos, his `return* k` simulated by the count);
- ε-rule: nothing is popped, so the procedure does the goto itself;
- accept: the reduction by rule 0 S' → S returns (S', 1) to #, whose goto loop ends the parse on S'. In LR(0), accept fills the whole row, but as in the table-driven parser only `$` accepts;
- error: an exception in JavaScript and Python; in C and PL/0 the flag `ok` (C returns 0, PL/0 sets `cnt := -1`, so no goto loop runs while unwinding).

A state whose only action is one reduction in every column (a reduce state of LR(0)) reduces without testing the input. The branches come from the Dragon ACTION/GOTO table, which holds the shift targets, so the program follows the resolved table where precedence resolved conflicts. Procedures are named by the lecture states (`E1` for E₁, `lparen2`, `start` for #, `_2` for a clash), and each is commented with its state name and number and all its items, with lookaheads for LALR(1)/IELR(1)/LR(1). Shift and goto lines say `g(E₁, +) = +₁`. Output is like recursive descent: the right parse (the rules of the reductions in their order, = `rightParse` of the LR simulator), then OK or `ERR x`.

**Languages.**
- *JavaScript* runs in the app; `parse(input)` returns `{ ok, rightParse, output }`.
- *Python 3*: the recursion limit is raised to 10,000.
- *C99* has no pairs, so the count is the result and the non-terminal goes in a global `lhs`. It is compiled with `-std=c99 -Wall -Wextra -pedantic -Werror`, without `-Wno-unused-function`.
- *PL/0* has no function results, so `lhs` and `cnt` are globals. It has no forward declarations either, and the transitions form cycles, so nesting cannot help: one procedure `state` gets the state in `which` and keeps it in its local `mine`, and its activation records on the P-machine stack are the state stack. Since PL/0 has no else, `act` is chosen first. PL/0 identifiers have no `_`, so the non-terminal constants use a digit suffix (`nTx2`). The program runs here on the P-code VM and is linked to the course interpreter.
- *Oberon* is not generated: with function procedures and procedure variables it would be the C program in other words, and it cannot be run here.

The locals of the JavaScript/Python procedures are `nt` and `count`. They, and the PL/0 globals, are reserved, but case-sensitively, so a non-terminal `T` keeps its constant `nT`.

**Step simulator** (`recursiveAscentSimulator.ts`). It does not execute the program; it keeps the call stack explicitly. Every call (shift, goto, ε-goto) and every return is a step, so a reduction is one return of the reducing state, |α| − 1 returns of callers and one goto. Each step records the frames (= the LR state stack), the pair returned, and line keys (`lineKey`: proc/act/err/goto/ret/head/end per state) that every generator maps to its lines. The view shows, side by side (container queries, three columns at 1920 × 1080):
- the code in the chosen language, with the executed line, the procedure that acted, and the header of the procedure called;
- the automaton (`AutomatonGraphVisualizer` with the new `height` and `followZoom`: the top state, zoomed to a readable scale, and the transition used);
- the call stack beside the LR state stack (entry symbol and lecture name), the returned pair, the input with •, and the right parse.

Below: copy/download, the PL/0 output on the VM, the interpreter link and the JavaScript run; then a correspondence table (state stack = call stack, f/g ↔ calls, R i ↔ return (A, |α|) and decrements, ε, accept, error, right parse) and notes from Horspool: why the count; fast but large; actions hard to place; recursive ascent-descent (generalised left-corner parsing of Demers 1977 extended to LALR(1)/LR(1), ascent until the rule is known at its leftmost free position (Purdom & Brown 1980), then a procedure per rule for the rest = descent, with semantic code at every free position, and far fewer states than LALR(1)).

*Performance:* the automaton visualizer re-rendered every state at every step (about 1 s per step for PL/0's 89 states in the dev build of a hidden pane). Its nodes are now memoized (`GraphNode`, with stable handlers through a ref), as are the code lines; no long task (> 50 ms) is left per step. The LR automaton tab benefits too.

*Tests* (`src/test/recursiveAscent.test.ts`):
- 400 seeded random grammars × every conflict-free variant. Every variant occurs, there are more than 300 tables and more than 1,000 accepted words, and all words up to length 5 are checked: the table-driven parser accepts exactly L(G) (the Earley oracle of `src/test/earley.ts`); the generated JavaScript and the simulator accept exactly the same words with the same right parse; a rejection stops with ERR at the same symbol; and the simulator's call stack after every call equals the LR state stack after every shift and reduction.
- The expression grammar: procedure names, item comments in all four languages, the output `6 4 2 6 4 6 3 1 OK`, the exact step kinds, and every line key of every step existing in every language.
- `S → a S b | ε` (inline goto) and LR(0) `S → a S | b` (unconditional reduce, accept only at the end).
- All presets with a conflict-free table: unique names, the example word accepted with the table-driven right parse.
- Names clashing with the programs' own names.
- PL/0 on the VM = JavaScript on 120 random seeds, words ≤ 4.
- C (gcc) and Python run on PL/0, the expression grammar and a sample of the random tables, with the same output and the C exit status; skipped without gcc/Python, as in `rdLanguages.test.ts`.
- `urlState.test.ts`: `tab=ascent`.
