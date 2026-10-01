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
- grammar save/load and sharing through the URL hash.

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
