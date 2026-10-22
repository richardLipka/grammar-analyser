# Analyzátor formálních gramatik / Formal Grammar Analyser

**Live:** <https://richardlipka.github.io/grammar-analyser/>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)

The Formal Grammar Analyser is an interactive teaching tool for context-free grammars and syntax analysis. It was written for the course **KIV/FJP (Formal Languages and Compilers)** at the Department of Computer Science and Engineering, University of West Bohemia (ZČU) in Pilsen. It is meant for students, who can check their exercises and step through the algorithms of the lectures, and for teachers, who can show the algorithms in a lecture or link a grammar from a course page. Anyone else learning parsing can use it too.

The whole application runs in the browser and needs no server and no installation. The interface is in Czech (the default, with the terminology of the KIV/FJP lectures) or English, in a light, dark or projector theme.

**What it does:**

- **Reads grammars in many dialects.** The arrow notation of the lectures (`S → aSb | ab`, `E' --> +TE'`, `[Ba] --> a`), BNF, EBNF, Yacc/Bison files with `%token`, `%left` and `%prec`, and ANTLR 4 grammars. Rule numbers copied from slides, several rules on one line, and ε written as `ε`, `eps`, `λ`, `%empty`, `#` or `e` are accepted.
- **Analyses the grammar.** It computes nullable, generating and reachable symbols, FIRST₁/₂, FOLLOW₁/₂ and director sets. It finds immediate, indirect and hidden left recursion, cycles, and useless symbols. It classifies the grammar as LL(1), strong LL(2), LL(2), LR(0), SLR(1), LALR(1), IELR(1) and LR(1). A bounded search looks for an ambiguous word and shows its two derivation trees.
- **Transforms the grammar.** Reduction, ε-rules, unit rules, left recursion (Paull, or the left-corner transformation), left and right factoring, substitution, absorption of the following symbol, CNF, GNF, an automatic attempt at LL(1), and transformations against LR conflicts. Each transformation is explained step by step with the literature, and can be applied by clicking a symbol in the grammar.
- **Simulates the parsers step by step:**
  - LL(1) and LL(2);
  - LR(0), SLR(1), LALR(1), IELR(1) and LR(1) in the layout of the lectures or of the Dragon Book;
  - GLR, GLL with BSR sets and shared packed forests, ALL(\*), Earley (optionally with Leo's transitive items), ETTP and CYK;
  - recursive descent and recursive ascent, with the generated parser in PL/0, Oberon-07, C, Python and JavaScript, the P-code of the PL/0 version, and a symbol-table demonstration.
- **Explains LR conflicts.** Each conflict gets a counterexample: a word with two derivation trees, or two derivations that part at the conflict.
- **Recovers from syntax errors.** Optional panic-mode recovery is available in the LL, LR, recursive-descent and recursive-ascent simulators.
- **Compares two grammars.** It looks for a shortest word that one grammar generates and the other does not, and shows where the other grammar fails on it.
- **Generates words** and their derivations.
- **Exports** to LaTeX (grammar, sets, LL and LR tables, derivation trees) and to SVG/PNG (automata and trees).
- **Opens a grammar from a link** (`?g=…&w=…&tab=…`).

## Contents

- [Tabs](#tabs)
- [Grammar input](#grammar-input)
- [Working with the interface](#working-with-the-interface)
- [Grammar links (URL parameters)](#grammar-links-url-parameters)
- [Development, testing and deployment](#development-testing-and-deployment)
- [Project structure](#project-structure)
- [Literature and further documentation](#literature-and-further-documentation)
- [License](#license)

---

## Tabs

The menu has two rows. The first row holds the analyses and parsers, the second the work with the grammar and the export.

| Row | Czech | English | `tab=` |
|---|---|---|---|
| 1 | Přehled | Overview | `overview` |
| 1 | Generátor slov | Word generator | `words` |
| 1 | FIRST a FOLLOW | FIRST & FOLLOW | `first-follow` |
| 1 | LL | LL | `ll` |
| 1 | LR automat | LR automaton | `graph` |
| 1 | LR analyzátory | LR parsers | `lr` |
| 1 | CYK | CYK | `membership` (or `cyk`) |
| 1 | ALL(\*) | ALL(\*) | `all` |
| 1 | Earley & ETTP | Earley & ETTP | `earley` (or `ettp`) |
| 1 | GLL | GLL | `gll` |
| 2 | Úpravy gramatiky | Transformations | `transformations` |
| 2 | Průvodce úpravami | Transformation Guide | `teaching` (or `guide`) |
| 2 | Porovnání jazyků | Language comparison | `check` (or `comparison`) |
| 2 | Rekurzivní sestup | Recursive descent | `rd` |
| 2 | Rekurzivní vzestup | Recursive ascent | `ra` (or `ascent`) |
| 2 | LaTeX a export | LaTeX & export | `latex` |

### Přehled / Overview
- The classification of the grammar: LL(1), LL(2) (exact, and whether it is also strong LL(2)), LR(0), SLR(1), LALR(1), IELR(1) and LR(1), with the number of conflicts and states. A table that is conflict-free only thanks to precedence declarations is marked separately.
- Which general parsers apply: ALL(\*), Earley, ETTP and GLL.
- Properties of the grammar: ε ∈ L(G), L(G) = ∅, immediate, indirect and hidden left recursion, cycles A ⇒⁺ A, and the nullable, generating and reachable symbols.
- Ambiguity. A bounded search looks for a word with two derivation trees and shows both trees. An LL(1) or LR(1) grammar is reported as unambiguous. When the search finds nothing within its limits, the overview says that this is no proof. For an ambiguous grammar without precedence declarations it suggests them.
- When the grammar has useless symbols, the overview says that the classification assumes a reduced grammar and offers to reduce it.

### Generátor slov / Word generator
- The words with the shortest derivations, found breadth-first.
- Random derivations that always terminate, because they use rules of minimal derivation height.
- Leftmost derivations, with the rewritten non-terminal highlighted.
- Derivation trees, optionally with a row of leaves that shows the yield.

### FIRST a FOLLOW / FIRST & FOLLOW
- FIRST₁, FIRST₂, FOLLOW₁ and FOLLOW₂ of every non-terminal.
- FIRST₁ of every right-hand side, and the director sets (LOOKAHEAD₁ and LOOKAHEAD₂) of every rule.

### LL
- The LL(1) parse table M[A, a]. Each conflict is classified per rule as FIRST-FIRST or FIRST-FOLLOW, with its reason.
- The exact LL(2) test (Aho–Ullman, local follow sets) next to the strong LL(2) test. The tab shows the strong LL(2) table M[A, xy] and, for grammars that are LL(2) but not strong LL(2), the tables T(A, L).
- A step simulator for LL(1) and LL(2) (expansion, comparison, acceptance). It shows the stack, the input, a clickable trace, the derivation tree and the left parse.
- Optional **panic-mode error recovery** (a switch, off by default, Aho et al. §4.4.5):
  - An empty cell M[A, a] throws input away until a symbol of FIRST(A), where A is analysed again, or of FOLLOW(A) ∪ {$}, where A is given up.
  - A terminal on the stack that does not match is taken as missing.
  - Each phase is a step of its own, with the stop symbols shown. The errors are listed at the end, and the constructs that were given up are marked in the tree.

### LR automat / LR automaton
- The LR(0), LR(1), LALR(1) and IELR(1) automata as graphs, with kernel and closure items, complete items and conflict states.
- For a selected state, the graph shows how it was created: the transition that created it, the other transitions into it, and the items of the predecessors whose dot moves over the entry symbol. Clicking an item goes to the state its transition leads to.
- Hovering a lookahead explains why it is there:
  - it was carried over by a transition;
  - a ∈ FIRST(β);
  - it was passed on through a nullable β;
  - it is the end marker of the initial item;
  - for LALR(1), which of the merged LR(1) states have it.
- **Construction step by step.** The construction starts with the CLOSURE of the initial item. Then each GOTO is shown with the items that move, the kernel, what CLOSURE adds, and whether the state is new or already exists.
- **LR(1) → LALR(1) merges.** For every merged state the tab shows the lookaheads of each LR(1) state and their union. A conflict that the merge creates is marked.
- Automata with more than 150 states are drawn only on request.

### LR analyzátory / LR parsers
- **Tables** for LR(0), SLR(1), LALR(1), IELR(1) and LR(1), in two layouts:
  - the KIV/FJP lectures (the default): states named by their entry symbol (E₁, E₂, …, with # for the initial state), the action table f (P, R*i*, A) and the transition table g;
  - the Dragon Book: ACTION/GOTO with numbered states, `s5`, `r2`, `acc`.
- **Strict LR(0).** S' → S• is a complete item, so it conflicts with a shift or another reduction in its state.
- **Precedence.** Yacc precedence (`%left`, `%right`, `%nonassoc`, `%prec`) resolves shift/reduce conflicts as Bison does. Every resolution is listed with its reason, and a switch shows the table without precedence.
- **IELR(1).** The table is computed from canonical LR(1). LR(1) states with the same core are merged unless the merge would change an action after conflict resolution, so the parser behaves like canonical LR(1). It is not Denny & Malloy's annotation algorithm, and the split is greedy, so the result is not guaranteed to be minimal. Each split records its reason. An IELR(1) table is conflict-free exactly when the grammar is LR(1).
- **Counterexamples for every conflict** (Isradisaikul & Myers 2015, as Bison's `-Wcounterexamples`), shown in the table and in the state panel of the automaton:
  - **unifying:** one word with two derivation trees that part at the conflict, which proves the grammar ambiguous;
  - **non-unifying:** two derivations with the same prefix up to the conflict point •, with a note when the prefixes must differ (states merged by LALR) or when the lookahead comes only from FOLLOW (the SLR or LR(0) approximation).

  The search is bounded, and "not found" is stated as such.
- **The shift-reduce simulator** shows a textbook trace (stack, input, action), the parse forest after every step, and the right parse.
- **Optional panic-mode error recovery** (Aho et al. §4.8.3). The parser pops the stack to a state s with a transition g(s, A). It then throws input away until a symbol of FOLLOW(A) with which it can really go on, which is checked through its reductions, and pushes g(s, A). The popped subtrees and the thrown-away symbols become a marked error subtree.
- **GLR** (Tomita) over the chosen table. A graph-structured stack forks on conflicts and merges equal states, and the GSS can be inspected node by node. All derivation trees are found, and they can be shown as one shared packed forest.

### CYK
- **Membership for any context-free grammar**, including ambiguous ones, grammars with ε-rules or cycles, and grammars that are neither LL nor LR.
- **The number of derivation trees.** The count is finite, or infinite with a cycle. Up to 20 trees are listed with their left parses.
- **A rejected word** is explained by the longest prefix of some word of the language.
- **The CYK table V(i, j)** for a grammar in Chomsky normal form, in the triangle of Hopcroft, Motwani and Ullman. For another grammar the tab lists the rules that break CNF and can convert the grammar.
- **Step by step:** each cell is computed with its left and right operand cells highlighted and the rules A → B C that apply. Cells not yet computed are dimmed. The tree pager gives the exact count.
- The CYK view is the CYK card of `src/ui/views/MembershipView.tsx`.

### ALL(\*)
- ALL(\*) of ANTLR 4 (Parr, Harwell & Fisher 2014):
  - an augmented transition network (ATN) with one state per item;
  - SLL prediction with the cached lookahead DFA;
  - conflict detection and a fallback to full-LL prediction with the parser's real stack;
  - ambiguities resolved by the minimal alternative, after an LL conflict only.
- Left recursion of any kind gives "not applicable", and reaching a limit gives "undecided", never a rejection.
- The tab steps through the decisions and through the lookahead computation (closures, the call stack, the DFA states). The DFA graph shows the state of the cache at the shown step.
- **Limits.** Without a graph-structured stack, a closure is capped at 200,000 configurations. ANTLR's two-stage SLL-then-LL parse is not simulated.

### Earley & ETTP
- **Earley (1970)** with the ε-rule fix of Aycock & Horspool (2002). Every step marks the new item and the items it came from (parent, scanned, completed, waiting). The last step explains acceptance or rejection: the accepting item, or the first empty set and the longest prefix that can still be completed.
- **Leo's transitive items (1991)** are a switch. On a deterministic reduction path the completer adds only the topmost item, so right recursion such as `S → a S | ε` on aⁿ needs a linear number of items instead of a quadratic one. Both counts are shown. The skipped items are rebuilt for the derivation trees, as in Marpa (Kegler 2019).
- **ETTP (Scott & Johnstone 2025/2026).** An Earley recogniser driven by a precomputed table, with sets of pairs (q, j). The table has kernel states, which take the origin j of the pair, and predicted states, which take the current set as their origin, joined by a precomputed ε-link. Prediction is therefore a table lookup instead of expanding rules at parse time.
  - Only the abstract of the paper could be read, so the construction follows the split automaton of Aycock & Horspool, and its correctness is checked against an independent Earley oracle.
  - The authors' measurements are reported as theirs.
  - The pairs list the items of their states. `stats.representedItems` equals the number of items of classic Earley.
- **Both parsers take their derivation trees from their own chart** (`src/core/earley/earleyTrees.ts`), and the trees can be stepped through.
- The automaton graph has kernel and predicted items, transitions with their reasons, and a state inspector. It highlights the transition or ε-link used by the current ETTP step.

### GLL
- Generalised LL (Scott & Johnstone 2010, 2013):
  - descriptors (L, u, i), the sets R and U;
  - a graph-structured stack of nodes (L, i) with the pop set P;
  - the operations `add`, `create` and `pop` as in the papers;
  - the look-ahead `test` with FIRST/FOLLOW, as a switch.
- It works for any context-free grammar, including all kinds of left recursion, ε-rules and cycles.
- The derivations are recorded as a **BSR set** (Scott, Johnstone & van Binsbergen 2019), with acceptance (S ::= α, 0, k, n) ∈ Υ. All derivation trees are read from it: their count (∞ with a cycle) and the first 50.
- **Step by step:**
  - the descriptor taken from R and every operation it causes;
  - R and U, and the BSR set with its new elements;
  - the GSS with P on its nodes;
  - the subtree of the newest rule element.
- **The shared packed forest (SPPF)** of all trees in one picture, either by rules (Tomita) or binarised (Scott & Johnstone 2013). It is built from the GLL BSR set or from the Earley chart, which give the same forest. Ambiguous nodes are marked, and the chosen tree is highlighted.

### Úpravy gramatiky / Transformations
- **Transformations of the whole grammar:**
  - reduction (unproductive and unreachable symbols), ε-rules (a new start symbol only when S occurs on a right-hand side), unit rules;
  - left recursion (Paull's algorithm with logged preprocessing, or the left-corner transformation of Rosenkrantz & Lewis);
  - left and right factoring, left-linear to right-linear;
  - against LR conflicts: dangling else, precedence stratification, splitting a non-terminal by its LR context, and an automatic attempt;
  - CNF and GNF.
- **Explanations.** Each step shows the added and removed rules and the grammar after it. The tab ends with a normal-form checklist (reduced, ε-free, no unit rules, no left recursion, CNF, GNF).
- **Transform by clicking.** In the editor's click mode, a click on a non-terminal offers transformations:
  - on a left-hand side: left recursion with or without ε (as in the lectures), left factoring, elimination of a leading non-terminal, ε and unit rules, substitution, merging non-terminals with the same rules, useless symbols;
  - on an occurrence in a right-hand side: substitution, **absorption of the following symbol** `A → α B a β` ⇒ `A → α [Ba] β`, `[Ba] → αᵢ a` (as in the lectures, it turns a FIRST-FOLLOW conflict into a FIRST-FIRST one), and a copy B₂ for this occurrence, which reduces FOLLOW sets.

  LL(1) conflicts are marked FF and FFL, and the actions that address them are tagged.
- **History.** Undo and redo (also Ctrl+Z and Ctrl+Y) cover transformations, loaded examples and typing. The tab keeps the protocol of all steps, and any earlier state can be restored from it. Choosing an example starts a new history.
- **The automatic attempt at LL(1).** The order of steps follows R. Cockett's CPSC 411 notes, and the methods are those of the KIV/FJP lectures. Every operation is listed with its reason. When the attempt fails, it keeps the best state and names the remaining conflicts.
- **References.** Every transformation has an ⓘ text: the scheme, why it keeps the language, when to use it, and the publications.
- **Testing.** Every transformation is tested for language equivalence, also on seeded random grammars, together with the form it promises.

### Průvodce úpravami / Transformation Guide
- 19 techniques in four groups: cleaning and reduction, LL(1) transformations and left recursion, LR transformations and conflict elimination, and normal forms.
- Each technique has its original publication, an example grammar with the defect (or the grammar from the editor), the affected symbols and rules, and the transformation step by step.
- A language comparison on words up to a chosen length gives a word derived with the changed rules and its trees in both grammars. The result can be loaded into the editor.

### Porovnání jazyků / Language comparison
- A student's grammar is compared with the grammar in the editor (its current text) on all words up to a chosen length, shortest first. The first difference is therefore a shortest counterexample.
- For the counterexample, the grammar that generates it shows its derivation tree and leftmost derivation. The other grammar shows the attempt of the general analyser: a partial tree, the terminal it needs where the word differs, and what may follow.
- The search runs as incremental Earley recognisers over a tree of prefixes, in slices. It asks every 30 s whether to continue.
- Agreement is only a hint, because equivalence of context-free grammars is undecidable.
- The promised form is checked exactly: reduced, ε-free, no unit rules, no left recursion, left-factored, LL(1), CNF, GNF, with the rules that violate it.

### Rekurzivní sestup / Recursive descent
- Sub-tabs: simulator, generated code, and symbol-table actions. The tab is for LL(1) grammars.
- **The generated parser** has one procedure per non-terminal. It chooses the rule by the director sets, prints the rule number (the left parse) and calls the procedures of the right-hand side. Comments give the rules.
  - **Languages:** **PL/0** (with `? x` / `! v` for the character I/O of the course VM), **Oberon-07**, **C99**, **Python 3** and **JavaScript** (`parse(input, hooks)`). All of them print the same for the same input.
  - **Nesting.** PL/0 and Oberon have no forward declarations, so the procedures are nested along the calls as in Wirth's compiler. When nesting cannot express the calls, the code falls back to a dispatching procedure (PL/0) or to procedure variables (Oberon).
- **The P-code** of the PL/0 program comes from a built-in PL/0 compiler with Wirth's code generation. It runs in the tab and opens in the [KIV/FJP PL/0 interpreter](https://richardlipka.github.io/online-pl0-interpreter/).
- **The step simulator** shows the input, the call stack (with the stop sets when recovery is on), the procedure being executed with its branches, the parse tree and the symbol table.
- **The symbol table** is a stack of scopes. It is a **demonstration of how a parser builds and uses the table, not a compiler**, and the tab says what it can and cannot do.
  - Names and numbers in the input are read as the identifier and number terminals.
  - Declarations, scopes and lookups are actions placed at positions of the right-hand sides. They are detected by keywords and can be edited.
  - An undeclared name, or a name declared twice in one scope, is a semantic error that stops the descent. A switch turns it into a report.
- **Optional panic-mode recovery** after Wirth's PL/0 compiler (lecture 3 of the course):
  - every procedure gets the stop set FOLLOW(A) ∪ the stop set of its caller;
  - `test(start set, stop set)` runs on entry and `test(stop set, ∅)` on exit;
  - a missing terminal is taken as inserted.

  The generated programs still stop at the first error.
- Sample grammars come with programs: expressions, C blocks, a PL/0-like language, `let`/`const`/`function`, and the whole PL/0.

### Rekurzivní vzestup / Recursive ascent
- Sub-tabs: simulator (with the code and the automaton) and symbol-table actions. The tab works for any grammar with a conflict-free LR(0), SLR(1), LALR(1), IELR(1) or LR(1) table.
- The tab shares the word, the sample grammars and the symbol-table actions with *Recursive descent*. Both tabs are one view.
- **The LR parser as one procedure per LR state** (Horspool 1991/1993, §5.2). Procedures are named by the lecture states and commented with their items.
  - A procedure is called after the shift into its state.
  - It reads a terminal and calls the procedure of g(state, a).
  - A reduction by A → α returns (A, |α|). Every caller decrements the count and returns while it is above 0, and the caller where it reaches 0 calls g(state, A) in a loop.
  - An ε-rule does the goto in place.
- **Languages:**
  - **JavaScript** runs in the browser;
  - **Python 3**;
  - **C99**: the non-terminal goes in a global, the count is the result;
  - **Oberon-07**: one function with a CASE;
  - **PL/0**: one procedure `state`, whose activation records are the state stack;
  - the P-code of the PL/0 program.

  The output is the right parse, then OK, or ERR and the symbol.
- **The step simulator** shows the code with the executed line, the automaton with the current state, the call stack next to the LR state stack (they are the same), the derivation tree growing bottom up, and the symbol table.
- **Symbol-table actions** run when the parser enters a state whose kernel is just the action's item. Otherwise they wait for the reduction, which the tab reports together with a test whether a Yacc-style marker could go there.
- **Optional panic-mode recovery**, the same as in the LR simulator, expressed in calls and returns.
- A comparison table explains how the method relates to recursive descent. The literature: Roberts, Kruseman Aretz, Leermakers et al., Horspool, and Pennello (a directly executed LR parser, not recursive ascent).

### LaTeX a export / LaTeX & export
- Compile-ready LaTeX for the grammar, the FIRST/FOLLOW sets, and the LL and LR tables (either layout). The LaTeX buttons on the other tabs export their tables and derivation trees, the trees as `forest`. Symbols compile with pdfLaTeX: B₂ becomes `B_{2}`, accented names are set in text mode, arrows and Greek letters become commands.
- SVG and PNG export of automata, trees and forests, in the colours of the active theme, from the toolbar of every graph.

---

## Grammar input

- **Rule operators:** `->`, `-->`, `=>`, `→`, `::=`, `:==`, `:=`, and `:` (Yacc/ANTLR, where a trailing `;` or `.` or a line holding only `;` ends a rule).
- **Alternatives:** `|`, or a line that starts with `|`.
- **Several rules on one line:** separated by `;` (`S -> aAS | b; A -> a | bSA`) or by a space before the next `A ->`.
- **Rule numbers copied from slides** are labels, not symbols: `S --> aAS    (1)`, `(1) S -> …`, `1. S -> …`. A warning appears when they differ from the analyser's numbering.
- **Non-terminals** are every symbol defined on a left-hand side and every `<name>`. The bracketed names of the lectures (`[Ba]` after absorption, `[A-X]` of the left-corner transformation) are non-terminals when they have rules. Otherwise `a[i]` stays the terminals `[`, `i`, `]`.
- **Terminals** are all other symbols. A quoted `"…"` or `'…'` symbol is always a terminal.
- **ε:** `ε`, `ϵ`, `eps`, `epsilon`, `λ`, `lambda`, `%empty`, `""`, and `#` when it forms a whole alternative. A standalone `e` (the notation of the KIV/FJP lectures) makes the editor ask whether it means ε or the terminal e. Until it is answered, `e` is read as ε.
- **Course notation**, where every left-hand side is a capital letter with optional digits and primes, or a bracketed name:
  - Compact words such as `S → aSb | ab`, `E' → +TE'` and `A1 → A2A3` are split into the defined non-terminals (longest match) and single characters.
  - A word such as `bxc` may mean one terminal or several symbols. If no right-hand side separates its symbols by spaces, the editor asks. Until then, and with spaces elsewhere (`F → ( E ) | id`), such a word is one terminal, and a line under the editor says so.
  - A capital letter without rules is a non-terminal that generates no word, with a warning.
- **Yacc/Bison files:** `%token`, `%left`/`%right`/`%nonassoc`/`%precedence`, `%start`, `%{ %}`, the `%%` sections, `{ actions }`, `%prec`, `%empty`, and string aliases.
- **Precedence in the arrow notation:** lines `%left + -` (lowest precedence first) and `%prec X` at the end of an alternative.
- **ANTLR 4 grammars:**
  - the `grammar X;` header and the `options`/`tokens`/`@header` blocks;
  - labels;
  - lexer rules taken as tokens;
  - `EOF`;
  - EBNF `( )`, `*`, `+`, `?`, expanded into auxiliary non-terminals.
- **Also accepted:**
  - comments `// …`, `# …`, `/* … */`;
  - Unicode identifiers (`Výraz`);
  - typographic primes and quotes pasted from lecture notes.
- **The symbol palette** under the editor inserts `→`, `|`, `ε`, primes, quotes and `<…>`.
- **Errors and warnings.** Errors (`$` as a terminal, an arrow inside a right-hand side, an unparsable line) stop the analysis. Warnings (a capital without rules, duplicate rules) do not.

## Working with the interface

- **Layout.** The grammar panel on the left (editor, examples, history) and the analysis on the right are separated by a **draggable splitter**.
  - Drag the splitter to make the grammar panel wider or narrower, from 240 px to 70 % of the window.
  - A double-click, Enter or the button on the splitter collapses the panel and expands it again. Dragging it far to the left also collapses it, and the arrow keys move it.
  - The browser remembers the width and whether the panel is collapsed.
  - In the single-column layout of narrow screens there is no splitter, and the panel is always shown.
- **Step controls.** The controls of every step simulator float in a bar at the bottom of the screen, so they stay at hand however far the step, the table or the tree is scrolled. The bar names the simulator and has back, forward, play/pause, speed, a slider that jumps to any step, and a button that scrolls back to the simulator. The ← / → keys step too.
- **Simulator input.** Tokens are separated by spaces, or a word without spaces (`aabb`, `id+id`) is split into terminals by longest match, and the split is shown.
  - The word of the preset or the link is used only while it belongs to L(G).
  - Otherwise the app derives a word from the grammar: at least 8 symbols when the language has such words, at most 14 unless the shortest word is longer, and using as many rules as possible.
- **Long computations do not block the page.** The analysis, the automatic LL(1) attempt and the language comparison run in slices with their progress shown, and they ask every 30 s whether to continue.
  - Stopped after the LALR(1) automaton, the analysis shows its results and marks the missing parts (exact LL(2), LR(1), ambiguity).
  - LALR(1) is built from the LR(0) states by lookahead propagation (Dragon Book, Alg. 4.62/4.63).
  - Tables over 300 rows show their first rows.
- **Examples.** The built-in examples are grouped by topic:
  - the grammars of the lectures;
  - textbook grammars that separate LR(0) / SLR(1) / LALR(1) / LR(1), LL(1) / SLR(1) and LL(2) / strong LL(2);
  - ambiguous expressions with precedence, and dangling else;
  - constructs of real languages: C, Pascal, Ada, JavaScript, Lisp, and the whole of Wirth's PL/0.
- **Themes and language.** Light (the default), dark and projector themes. Czech or English. Both choices are remembered.

## Grammar links (URL parameters)

A link can carry a grammar, so a course page or an e-mail can open it ready for analysis. The *Odkaz* / *Link* button under the editor copies such a link.

```
https://richardlipka.github.io/grammar-analyser/?g=S-->aAS|b;A-->a|bSA&w=a%20b%20b%20a%20b&tab=ll
```

| Parameter | Meaning |
|---|---|
| `g` (or `grammar`) | The grammar text, percent-encoded (`encodeURIComponent`). New lines are `%0A`, or rules are separated by `;` or by a space (`S->aAS|b A->a|bSA`). A `+` stays a plus sign. The editor then shows every rule on its own line. |
| `w` (or `word`, `input`) | The input word of the simulators, symbols separated by spaces. It is used only when it belongs to the language of the grammar; otherwise a word of the grammar is derived. |
| `tab` | `overview`, `words`, `first-follow`, `ll`, `graph`, `lr`, `membership` (`cyk`), `all`, `earley` (`ettp`), `gll` (`bsr`, `sppf`, `forest`), `transformations`, `teaching` (`guide`), `check` (`comparison`, `equivalence`), `rd` (`descent`), `ra` (`ascent`, `recursive-ascent`), `latex` |
| `e` | `eps` or `term`: how a standalone `e` is read, so the question is not asked |
| `split` | `1` or `0`: whether words such as `bxc` in the course notation are the symbols `b x c` or one terminal, so the question is not asked |
| `preset` | The id of a built-in example (e.g. `strong_ll2`) instead of `g` |
| `lang`, `theme` | `cz`/`en` and `light`/`dark`/`projector`, for this visit only (not remembered) |

The same parameters also work after `#` (`…/#g=…`), and there they take precedence over the query.

## Development, testing and deployment

You need Node.js (the CI uses version 22).

```bash
npm install      # dependencies
npm run dev      # development server at http://localhost:3000
npm test         # the test suite (vitest run)
npm run build    # type check (tsc -b) and production build into dist/
npm run preview  # serve the built dist/ locally
```

- **Tests.** There are 865 tests in 47 files under `src/test/` (October 2026). Most suites compare the implementation with independent code: an Earley recogniser, FIRST/FOLLOW computed on token arrays, a brute-force exact LL(2) test, the Dragon Book LALR propagation, and tree counts. They run on all presets and on seeded random grammars. The suites that compile the generated C parsers and run the Python ones need `gcc` and `python`; without them those parts are skipped.
- **The build** uses relative paths (`base: './'`), so `dist/` can be served from any directory: GitHub Pages, or the course pages on home.zcu.cz.
- **Deployment.** The workflow `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and `npm run build` on every push to `master` and publishes `dist/` to GitHub Pages.

## Project structure

```
src/
├── App.tsx               application state, the tabs (TAB_ROWS), the grammar panel and the splitter
├── main.tsx              entry point
├── core/                 algorithms, no DOM access (tested headless)
│   ├── ast/              grammar model, symbols, formatting for the editor
│   ├── parser/           grammar parser (all dialects), input tokenizer, membership, CYK, derivation attempts
│   ├── analyser/         sets and properties, ambiguity search, language comparison, error-recovery sets
│   ├── processor/        transformations, automatic LL(1) attempt, ⓘ texts with references
│   ├── generator/        word generator, example words of L(G), tree helpers
│   ├── ll/               LL(1)/LL(2) tables and simulator
│   ├── lr/               LR automata (LR(0), LALR(1), IELR(1), LR(1)), tables, simulator, GLR, construction steps, counterexamples
│   ├── all/              ALL(*): ATN, adaptive prediction, parser
│   ├── earley/           Earley (+ Leo), ETTP, trees from the chart, explanations
│   ├── gll/              GLL parser, BSR sets, explanations
│   ├── forest/           shared packed forests (from BSR sets, Earley charts, tree lists)
│   ├── codegen/          recursive descent and ascent: generators, simulators, symbol table, PL/0 compiler, P-code VM
│   ├── export/           LaTeX, SVG/PNG
│   ├── teaching/         data and analysis of the Transformation Guide
│   ├── presets/          built-in grammars and the RD sample grammars
│   ├── jobs/             resumable jobs for long computations
│   └── analysisJob.ts    the whole analysis as one job
├── ui/
│   ├── views/            one view per tab
│   ├── components/       shared widgets (simulator controls, splitter, error recovery, references, …)
│   ├── visualizer/       SVG graphs and trees (automata, DFA, GSS, forest, trees), pan/zoom, toolbar
│   ├── urlState.ts       grammar links
│   ├── useGrammarHistory.ts, useSteppedJob.ts
│   └── wholeGrammarTransformations.ts
├── i18n/translations.ts  Czech and English texts
├── styles/               CSS (light, dark, projector)
└── test/                 vitest suites and oracles
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and the data flow.

## Literature and further documentation

- [docs/REFERENCES.md](docs/REFERENCES.md) is the literature: every work cited in the application, grouped by topic, with checked DOIs and links and the files that cite it.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the modules and the data flow.
- [docs/REVIEW.md](docs/REVIEW.md) is the review log, which holds the decisions about the algorithms and their verification.

## License

MIT, see [LICENSE](LICENSE). Free to use, adapt and share in schools.

© 2026 [Richard Lipka](https://home.zcu.cz/~lipka/) &lt;lipka@fav.zcu.cz&gt;
Department of Computer Science and Engineering, Faculty of Applied Sciences, University of West Bohemia.

The faculty mark shown in the header belongs to the university and is not covered by the MIT licence.
