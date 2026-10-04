# GrammarAnalyser 📐

> Interactive, client-side university laboratory for formal language theory, grammar transformations, LL/LR parsing tables, and automaton simulators.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff.svg)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Vitest-Passing-brightgreen.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Highlights & Capabilities

- **100% Client-Side**: Zero backend dependencies. Runs completely inside the browser with fast, reactive TypeScript computation. Easily publishable to **GitHub Pages**.
- **Multi-Syntax Grammar Parser**:
  - Arrows: `->`, `-->`, `=>`, `→`
  - BNF & EBNF: `::=`, `:==`, `:=`
  - Yacc / Bison / ANTLR: `:`; a trailing `;` or `.` (or a line holding only `;`) ends a rule
  - Alternatives: Pipe `|` or clean indentation/newline alternatives
  - Non-terminals: every symbol defined on a left-hand side, and every `<name>`
  - Terminals: all other symbols; a quoted `"…"` or `'…'` symbol is always a terminal (never ε, never a non-terminal)
  - Epsilon representations: `ε`, `ϵ`, `eps`, `epsilon`, `λ`, `lambda`, `%empty`, `""`, and `#` when it forms a whole alternative (`S -> a S | #`)
  - A standalone `e` (KIV/FJP notation for ε): the editor asks whether it means ε or the terminal e; until answered it is read as ε
  - Compact textbook notation `S → aSb | ab`, `E' → +TE'`, `A → 0A1`, `A1 → A2A3`: when every left-hand side is a capital letter with optional digits and primes, words are split into the defined non-terminals (longest match) and single characters
  - Rule numbers copied from slides are labels, not symbols: `S --> aAS    (1)`, `(1) S -> …`, `1. S -> …`; a warning appears when they differ from the analyser's numbering
  - Several rules on one line, separated by `;` (`S -> aAS | b; A -> a | bSA`) or by a space before the next `A ->` (`S -> aAS | b A -> a | bSA`)
  - Typographic primes and quotes pasted from lecture notes (`E’`, `“+”`) are accepted
  - Comments: `// ...`, `# ...`, `/* ... */`
  - Optional Yacc precedence, also in the arrow notation: lines `%left + -`, `%left * /`, `%right ^`, `%nonassoc <` (lowest precedence first) before the rules and `%prec UMINUS` at the end of an alternative; they resolve shift/reduce conflicts of the SLR(1), LALR(1) and LR(1) tables as Bison does (higher precedence wins, equal precedence by associativity), with every resolution listed and explained; a switch on the LR tab shows the table without them
  - Unicode identifiers (`Výraz`, `Člen`)
  - **Yacc / Bison files**: `%token`/`%left`/`%start` declarations, `%{ %}`, the `%%` sections, `{ actions }`, `%prec`, `%empty`, string aliases (`%token NUM "number"`), rules with or without `;` and with the left-hand side on its own line
  - **ANTLR 4 grammars**: `grammar X;` header, `options`/`tokens`/`@header` blocks, labels (`x=`, `x+=`, `# Alt`), lexer rules taken as tokens (single-literal rules unified with the literal), `EOF`, EBNF `( )`, `*`, `+`, `?` expanded into auxiliary non-terminals
  - A symbol palette under the editor inserts `→`, `|`, `ε`, primes, quotes and `<…>` without a keyboard
  - Errors (`$` used as a terminal, a symbol used both quoted and as a non-terminal, an unparsable line) stop the analysis; warnings (a capitalised symbol without rules, duplicate rules, `<X>` without rules) do not
- **Grammar Analyser**:
  - Nullable symbols ($N_\varepsilon$)
  - Endable / Terminating / Generating symbols ($N_{gen}$)
  - Reachable symbols ($V_{reach}$)
  - $\text{FIRST}_1$, $\text{FIRST}_2$, $\text{FOLLOW}_1$, $\text{FOLLOW}_2$
  - Lookahead / Predict / Director sets ($k = 1, 2$)
  - Immediate, indirect and hidden (nullable-prefix) left recursion, each non-terminal with all its kinds; cycles $A \Rightarrow^+ A$
  - Ambiguity: a bounded search for a word with two derivation trees (both trees are shown); an LL(1) or LR(1) grammar is reported as unambiguous; for an ambiguous grammar without precedence declarations the overview suggests them
  - The classification notes when the grammar has useless symbols and offers to reduce it
- **Grammar Processor (Equivalent Transformations)**:
  - Unreachable & unproductive symbol removal (Reduced Grammar)
  - $\varepsilon$-production elimination with start symbol preservation (a fresh start symbol only when $S$ occurs on a right-hand side)
  - Unit-production elimination ($A \to B$)
  - **Transform by clicking**: in the editor's click mode, a click on a non-terminal applies a transformation directly to the grammar; undo/redo (also Ctrl+Z / Ctrl+Y) and a protocol of all steps with their explanations
  - **History of the grammar**: selecting an example starts a new history (undo does not lead back to the previous grammar); next to undo/redo, one button clears the history and keeps the grammar, another clears the grammar together with its history (it asks for a second click, as this cannot be undone)
    - left-hand side: left recursion (with ε, or without ε as in the KIV/FJP lectures), left factoring, elimination of rules with a leading non-terminal, ε-rule and unit-rule elimination, substitution and removal, merging non-terminals with the same rules, removal of useless symbols
    - occurrence on a right-hand side: substitution of its right-hand sides, **absorption of the following symbol** `A → α B a β` ⇒ `A → α [Ba] β`, `[Ba] → αᵢ a` (turns a FIRST-FOLLOW conflict into a FIRST-FIRST one for left factoring), and a copy `B₂` for this occurrence (reduction of FOLLOW sets)
    - LL(1) conflicts are marked (FF / FFL) and the actions that address them are tagged
  - Immediate and indirect left-recursion elimination (Paull's algorithm, with logged preprocessing of ε-rules and cycles)
  - **Automatic attempt to transform to LL(1)** (button on the LL(1) and Transformations tabs, and in the whole-grammar menu): the order of R. Cockett's CPSC 411 notes (left recursion, exposing FIRST clashes, left factoring, FIRST/FOLLOW clashes, repeat) with the methods of the KIV/FJP lectures; every operation is listed with its reason; on failure it keeps the best state and names the remaining conflicts
  - **ⓘ references**: every transformation has a description (scheme, why it keeps the language, when to use it) and the publications that describe it, with links
  - Left-corner transformation (Rosenkrantz & Lewis) as an alternative way of removing all left recursion: only the left-recursive non-terminals are rewritten (`A → X [A-X]`, `[A-X] → β [A-B]` for `B → X β`, `[A-A] → ε`), no order of the non-terminals is needed, and helpers with a single unit rule are merged afterwards
  - Left factorization, and right factoring of common suffixes (`A → α₁ β | α₂ β` ⇒ `A → A' β`, `A' → α₁ | α₂`)
  - Non-terminal substitution (inlining/expansion)
  - Chomsky Normal Form (CNF)
  - Greibach Normal Form (GNF): CNF, ordering $A_1 \dots A_n$, substitution, ε-free elimination of left recursion and back-substitution
  - Step-by-step explanations for all transformations, with the added/removed rules and the grammar after each step
  - Normal-form checklist of the result (reduced, ε-free, no unit rules, no left recursion, CNF, GNF)
  - Every transformation is tested for language equivalence (Earley recognizer over all short words), including a seeded randomised test that applies every whole-grammar, per-symbol and per-occurrence transformation to random grammars and also checks the promised form (ε-free, no left recursion, CNF, GNF, …)
- **Check my transformation** (tab *Kontrola úpravy*, "Is my grammar the same?"):
  - A student's grammar is compared with the grammar in the editor on all words up to a chosen length, shortest first, so the first difference found is a shortest counterexample, with the information which grammar generates it and its derivation tree
  - Both grammars run as incremental Earley recognizers over a tree of prefixes; a prefix neither grammar can extend is not extended (25,000 words of the expression grammar up to length 12 in well under a second)
  - The search runs in slices and asks after every 30 s whether to continue; stopped, it reports the lengths checked completely
  - Agreement is reported as a hint only (equivalence of context-free grammars is undecidable)
  - The promised form is checked exactly: reduced, ε-free, no unit rules, no left recursion, left-factored, LL(1), CNF, GNF, with the violating rules
- **Membership & CYK** (tab *Příslušnost slova a CYK*):
  - Membership of a word for **any** context-free grammar (ambiguous, with ε-rules or cycles, neither LL nor LR): dynamic programming over the parts of the word and whole right-hand sides
  - The number of derivation trees (finite, or infinitely many with a cycle $A \Rightarrow^+ A$) and the trees themselves (up to 20, with their left parses); for a rejected word, where it goes wrong (the longest prefix of some word of the language)
  - The CYK table $V(i, j)$ for a grammar in Chomsky normal form, in the textbook triangle; a click on a cell lists $A \to B\,C$ with $B \in V(i, k)$, $C \in V(k{+}1, j)$ and marks the two cells; for another grammar the CYK table of an equivalent grammar in CNF on request
- **Recursive-descent parser generator** (tab *Rekurzivní sestup*, LL(1) grammars):
  - The parser in **PL/0** (Wirth's language of the KIV/FJP compiler, with `? x` / `! v` as the character input/output REA/WRI of the course virtual machine) and in **Oberon-07** (modules `In`, `Out`): one procedure per non-terminal that chooses the rule by the director sets, prints the rule number (the left parse) and calls the procedures of the right-hand side
  - Without forward declarations a procedure can call only itself, enclosing procedures and earlier ones, so the procedures are nested along the calls as `expression ⊃ term ⊃ factor` in Wirth's compiler; when nesting cannot express the calls, PL/0 uses one dispatching procedure and Oberon procedure variables (as ORP.Mod)
  - The **P-code** of the PL/0 program (a built-in PL/0 compiler with Wirth's code generation and the course mnemonics JMC/RET), runnable here, and a button that opens it with the input in the [KIV/FJP PL/0 interpreter](https://richardlipka.github.io/online-pl0-interpreter/) (`#code_b64=…&input=…`); its output equals the left parse of the LL(1) simulation
- **Word Generator**:
  - BFS enumeration of the words with the shortest derivations in $L(G)$
  - Random derivation with guaranteed termination (minimal derivation heights)
  - Leftmost sentential derivation sequences with the rewritten non-terminal highlighted
  - Interactive Derivation Tree visualizer (children kept in order, optional leaf row showing the yield)
- **LL(k) Analyser & Parser**:
  - $\text{LL}(1)$ parse table construction $M[A, a]$ with First/First and First/Follow conflicts explained per rule
  - Exact $\text{LL}(2)$ test (Aho–Ullman local follow sets) next to the strong $\text{LL}(2)$ test
  - Strong $\text{LL}(2)$ parse table $M[A, xy]$ and, for grammars that are LL(2) but not strong LL(2), the Aho–Ullman tables $T(A, L)$
  - LL(1) and LL(2) simulation (expansion / comparison / acceptance) with the left parse; the LR simulation shows the right parse
  - Interactive top-down stack simulator with a clickable trace table, auto-play, keyboard stepping and live parse tree
- **LR(k) Analyser & Parser**:
  - $\text{LR}(0)$, $\text{SLR}(1)$, $\text{LALR}(1)$, and $\text{LR}(1)$ canonical collections
  - Two table layouts, switched at the top of the LR screens (tables, automaton, LaTeX):
    - **KIV/FJP lectures (default)**: states named by the symbol that leads into them ($E_1, E_2, \dots$; the initial state is $\#$), a table of actions $f$ (P = shift, R$i$ = reduce, A = accept; for LR(0) one action per state) and a table of transitions $g$ over all terminals and non-terminals
    - **Dragon Book**: numbered states, $\text{ACTION}[s, a]$ with `s5` / `r2` / `acc` and $\text{GOTO}[s, A]$ for non-terminals
  - Strict LR(0): $S' \to S\bullet$ is a complete item, so it conflicts with a shift or another reduction in the same state (an LR(0) language is prefix-free)
  - Shift/Reduce and Reduce/Reduce conflict detection
  - Interactive SVG State Machine Graph (powered by Dagre) with kernel/closure items, conflict states, pan, zoom, and state inspection
  - The graph explains the construction: for the selected state it highlights the transition that created it, the other transitions into it, and in the predecessors the items whose dot moves over the entry symbol (they become its kernel); clicking an item goes to the state its transition leads to
  - **Construction step by step** (LR(0), SLR(1), LALR(1) states, LR(1)): the initial state as CLOSURE of the initial item, then every GOTO in the order of the construction with the items whose dot moves, the kernel, what CLOSURE adds, and whether the state is new or exists already; the graph keeps its layout and shows the states and transitions created so far
  - **Merging LR(1) → LALR(1)**: every merge of LR(1) states with the same core, with the lookaheads of each item in each LR(1) state and their union; a merge that creates a conflict none of the merged states had (the grammar is LR(1) but not LALR(1)) is marked with the colliding lookaheads
  - Hovering a lookahead (LR(1), LALR(1)) explains why it is there: carried over by a transition, $a \in \text{FIRST}(\beta)$ in the closure, passed on through a nullable $\beta$, or the end marker of the initial item; for LALR(1) also which merged LR(1) states have it
  - Bottom-up shift-reduce simulator: textbook trace (stack, input, action), dual stack tracking and the parse forest after every step
- **University Teaching & Classroom Features**:
  - **One-Click LaTeX Export**: Compile-ready LaTeX tables (`align*`, `tabular`, and `forest` trees) for university exams and homework; symbol names compile with pdfLaTeX (subscripts of copied non-terminals `B₂` → `B_{2}`, accented names in text mode, arrows and Greek letters as commands)
  - **Simulator input**: tokens separated by spaces, or a word without spaces (`aabb`, `id+id`) split into terminals by longest match; the split is shown
  - **The example word is always a word of the grammar's language**: the LL and LR simulators, membership and recursive descent start with the word of the preset or the link only while it belongs to L(G) (also after editing or transforming the grammar); otherwise they get a word derived from the grammar itself, of a reasonable length (at least 8 symbols when the language has such words, at most 14 unless its shortest word is longer) and using as many different rules as possible
  - **Long computations do not block the page**: the analysis and the automatic LL(1) attempt run in slices with their progress shown; after every 30 s of computation they pause and ask whether to continue. Stopped after the LALR(1) automaton, the results are shown with the missing parts (exact LL(2), LR(1), ambiguity) marked. LALR(1) is built from the LR(0) states by propagating lookaheads (Dragon Book, Alg. 4.62/4.63), so it does not need the canonical LR(1) collection; automata over 150 states are drawn only on request and tables over 300 rows show their first rows
  - **SVG / PNG Export** of automata and trees with the colours of the active theme
  - **Grammar links**: `?g=<grammar>` opens and analyses a grammar immediately (see below); the *Link* button below the editor copies such a link
  - **Bilingual Interface**: Czech (default) and English; the Czech terms follow the KIV/FJP lectures (množina řídicích symbolů, rozkladová tabulka, kolize FIRST-FIRST, přesun-redukce, levý/pravý rozklad, nenormované symboly, …)
  - **Light (default), Dark and Projector Themes**: high-contrast outlines and text in the light and projector themes
  - **Curated Textbook Presets**: Benchmark grammars from the Dragon Book, Aho–Ullman, dangling else, arithmetic precedence, and grammars separating LR(0) / SLR(1) / LALR(1) / LR(1), LL(1) / SLR(1) and LL(2) / strong LL(2)
  - **Constructs of real languages** (non-terminals named as in real grammars): if–else as matched/open statements (unambiguous, SLR(1), not LL(k)), Pascal's if–then–else resolved by `%nonassoc` as in Bison, Ada's `if … end if` (LL(1)), C `while`/`for` loops (LL(1) with ε), C variable declarations (left-recursive list: SLR(1), not LL(1)), a C function declaration (LL(2), not LL(1)), a JavaScript arrow function called at once (unambiguous but not LR(k): a cover grammar is needed), C's `a * b ;` (ambiguous without the symbol table, the "lexer hack"), assignment vs. procedure call (left factoring; PL/0's `call`), and Lisp S-expressions (an LR(0) grammar)

### Grammar links

A link can carry a grammar, so a course page or an e-mail can open it ready for analysis:

```
https://richardlipka.github.io/grammar-analyser/?g=S-->aAS|b;A-->a|bSA&w=a%20b%20b%20a%20b&tab=ll
```

| Parameter | Meaning |
|---|---|
| `g` (or `grammar`) | The grammar text, percent-encoded (`encodeURIComponent`); new lines as `%0A`, or rules separated by `;` or a space (`S->aAS|b A->a|bSA`). A `+` stays a plus sign. The editor then shows every rule on its own line. |
| `w` (or `word`) | The input word of the simulators, membership and recursive descent, symbols separated by spaces; used only when it belongs to the language of the grammar (otherwise a word of the grammar is derived) |
| `tab` | `overview`, `first-follow`, `transformations`, `check`, `ll`, `lr`, `graph`, `membership` (or `cyk`), `rd`, `words`, `latex` |
| `e` | `eps` or `term`: how a standalone `e` is read, so the question is not asked |
| `preset` | The id of a built-in example (e.g. `strong_ll2`) instead of `g` |
| `lang`, `theme` | `cz`/`en` and `light`/`dark`/`projector` for this visit only (not remembered) |

The same parameters also work after `#` (`…/#g=…`).

---

## 🚀 Quick Start

### 1. Development Server
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run Tests
```bash
npm test
```

### 3. Production Build
```bash
npm run build
```
The compiled, optimized static bundle is generated in `dist/`.

---

## 📖 Architecture & Modules

```
src/
├── core/
│   ├── ast/                # Grammar data models, AST nodes, symbol types
│   ├── parser/             # Multi-syntax grammar parser
│   ├── analyser/           # Nullable, Endable, FIRST(k), FOLLOW(k), Lookaheads
│   ├── processor/          # Equivalent grammar transformations & proof logs
│   ├── generator/          # Word generation, derivation traces, example words of L(G)
│   ├── ll/                 # LL(1) / LL(2) tables, conflict engine & top-down simulator
│   ├── lr/                 # LR(0), SLR(1), LALR(1), LR(1) automata & shift-reduce simulator
│   ├── export/             # LaTeX exam/problem-set exporter
│   └── presets/            # Curated university textbook grammars
├── i18n/                   # English & Czech academic terminology
├── ui/
│   ├── visualizer/         # Dagre-powered SVG automaton graph & tree visualizers
│   ├── views/              # Overview, FirstFollow, Transformations, LL, LR, Graph, Words, LaTeX
│   └── components/         # Reusable UI widgets
├── styles/                 # Vanilla CSS design system (Dark, Light, Projector modes)
└── App.tsx                 # Master application orchestrator
```

---

## 📄 License

MIT — see [LICENSE](LICENSE). Free to use, adapt and share in schools.

© 2026 [Richard Lipka](https://home.zcu.cz/~lipka/) &lt;lipka@fav.zcu.cz&gt;
Department of Computer Science and Engineering, Faculty of Applied Sciences,
University of West Bohemia.

The faculty mark shown in the header belongs to the university and is not covered by the MIT licence.
