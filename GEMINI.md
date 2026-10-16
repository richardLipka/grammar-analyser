# GrammarAnalyser - Project Constitution & Engineering Guide

> **Binding decisions.** `docs/REVIEW.md` records the owner's decisions and the correctness reviews
> (sections 1–26); `README.md` describes the features as implemented. Where this guide and
> `docs/REVIEW.md` differ, `docs/REVIEW.md` is right. Do not "fix" behaviour that a section there
> describes as deliberate, and run `npm test` (all suites) before committing.

## 1. Project Overview & Vision
`GrammarAnalyser` (package / repo: `grammar-analyser`) is an interactive, browser-based, client-side educational platform designed for teaching and learning formal languages, grammars, and compiler construction at university level.

- **Zero Server-Side Dependency**: 100% computed in the client using TypeScript.
- **Publish Target**: Static website (GitHub Pages / custom domain).
- **Core Mission**: Demonstrate formal language theory concepts visually, dynamically, and rigorously with step-by-step proofs, table construction, and interactive parsing simulators.
- **Tech Stack**:
  - **Framework**: React 19 + TypeScript (strict mode) via **Vite**.
  - **Styling**: Vanilla CSS with custom properties (Dark & Light themes, classroom projector high-contrast mode).
  - **Visualization Engine**: Custom interactive SVG engine powered by Dagre layout (pan, zoom, state dragging, inspection).
  - **Bilingual Support**: English & Czech (academic terminology).
  - **Academic Exporter**: One-click LaTeX export for exam and homework creation.

---

## 2. Architectural Blueprint

The application is modularized into strictly decoupled functional components:

```
src/
├── core/
│   ├── ast/                # Grammar data model, formatting for the editor
│   ├── parser/             # Grammar parser (arrow/BNF, Yacc, ANTLR), input tokenizer and scanner, membership, CYK, derivation attempts
│   ├── analyser/           # Nullable, endable, FIRST(k), FOLLOW(k), director sets, ambiguity, language equivalence
│   ├── processor/          # Equivalent transformations (reduction, ε, unit rules, left recursion, factoring, CNF, GNF, LL(1) attempt)
│   ├── generator/          # Word generation, example words, derivation trees (cloneTree, createTreeNode)
│   ├── jobs/               # Long computations as resumable generator jobs
│   ├── ll/                 # llTable.ts (LL(1), LL(2) tables), llParser.ts (LL simulator)
│   ├── lr/                 # lrItem, lrAutomaton (LR(0), LALR(1) by propagation, LR(1)), lrTable, lrParser, glrParser (GLR/GSS), lrConstruction, lrExplain
│   ├── all/                # allAtn.ts (ATN network), allPredictor.ts (Lookahead DFA & ATN simulation), allParser.ts (ALL simulator)
│   ├── codegen/            # Recursive descent: generators (PL/0, Oberon, C, Python, JS), PL/0 compiler, P-code VM, step simulator, symbol table
│   ├── export/             # LaTeX and graph export (graphExport.ts, latexExport.ts)
│   └── presets/            # Built-in example grammars (presetGrammars.ts, rdSampleGrammars.ts)
├── i18n/                   # Czech and English texts (keys must exist in both)
├── ui/
│   ├── components/         # Shared widgets (simulator controls, symbols, LaTeX button, explanations, ReferenceBar)
│   ├── visualizer/         # SVG visualizers (AutomatonGraph, DerivationTree, LookaheadDFAGraph, GSSGraphVisualizer, GraphToolbar, graphUtils, usePanZoom)
│   ├── views/              # One view per tab (Overview, FirstFollow, LL, LR, AutomatonGraph, RecursiveDescent, ALL, etc.)
│   └── urlState.ts, useGrammarHistory.ts, useSteppedJob.ts
├── styles/                 # CSS with theme variables (light default, dark, projector)
└── App.tsx, main.tsx       # Application state and bootstrapping
```

---

## 3. Supported Grammar Syntaxes

The grammar parser must handle diverse standard notations seamlessly:
1. **Rule Separators / Arrows**:
   - Arrows: `->`, `-->`, `=>`
   - BNF / EBNF: `::=`, `:==`, `:=`
   - Yacc / Bison / ANTLR: `:`
   - Equality: `=`
2. **Right-Hand Side Alternatives**:
   - Pipe character: `|`
   - Indented or consecutive newlines without repeating the left-hand side:
     ```
     expr -> expr "+" term
             term
     ```
3. **Rule Terminators**:
   - Dot `.`, semicolon `;`, or trailing newline.
4. **Terminals vs Non-Terminals** (see `docs/REVIEW.md` §1–3, §23):
   - Quoted strings: `"term"`, `'term'`, `"+"`, `";"` are strictly terminals.
   - Angle-bracketed identifiers: `<Expression>`, `<term>` are strictly non-terminals; so are the lecture names `[Ba]`, `[A-X]` that have rules.
   - Unquoted: a symbol is a non-terminal **because it is on a left-hand side**, not because of its case. An undefined capitalised word (`ID`) is a terminal with a warning.
   - Lecture notation (every left-hand side a capital with digits/primes): `aSb` is split into `a S b` when a word glues a non-terminal; a word like `bxc` without one stays whole and the editor asks; an undefined single capital (`D`) is a non-terminal without rules.
   - An unquoted arrow inside a right-hand side is an error.
   - Yacc/ANTLR declarations (`%token id num`, lexer rules) are honoured.
5. **Epsilon (Empty String)**:
   - Recognized literals: `epsilon`, `eps`, `EPS`, `ε`, `ϵ`, `λ`, `lambda`, `%empty`, `""`, `''`, and `#` as a whole alternative.
   - A standalone `e` (KIV notation) is ambiguous: the editor asks whether it means ε.
6. **Comments**:
   - Single-line: `// ...` or `# ...`
   - Multi-line: `/* ... */`

---

## 4. Formal Grammar Operations & Algorithms

### 4.1 Grammar Properties & Sets
- **Nullable Symbols**: $N_\varepsilon = \{ A \in N \mid A \Rightarrow^* \varepsilon \}$. Computed by iterative fixed-point algorithm.
- **Endable (Terminating / Generating) Symbols**: $N_{term} = \{ A \in N \mid A \Rightarrow^* w \in T^* \}$.
- **Reachable Symbols**: $V_{reach} = \{ X \in V \mid S \Rightarrow^* \alpha X \beta \}$.
- **FIRST(1) & FIRST(k)**: Fixed-point calculation of prefix sets for length $k \in \{1, 2\}$.
- **FOLLOW(1) & FOLLOW(k)**: Lookahead symbols following non-terminal occurrences across all productions, with `$` (end-of-input marker).
- **Director / Predict Sets**: For production $A \to \alpha$, $LOOKAHEAD_k(A \to \alpha) = FIRST_k(\alpha \cdot FOLLOW_k(A))$.

### 4.2 Equivalent Transformations
All transformations preserve $L(G) = L(G')$ and generate step-by-step educational explanations:
1. **Grammar Reduction**:
   - Step 1: Remove non-generating symbols ($V \setminus N_{term}$) and their productions.
   - Step 2: Remove unreachable symbols from $S$.
2. **Epsilon-Production Removal**:
   - Compute nullable set $N_\varepsilon$.
   - For every production $A \to X_1 \dots X_n$, generate combinations omitting nullable positions.
   - If $S \in N_\varepsilon$, create new start symbol $S_0 \to S \mid \varepsilon$.
3. **Unit-Production Removal ($A \to B$)**:
   - Compute transitive closure of unit pairs.
   - Replace unit derivations with corresponding non-unit productions.
4. **Left Recursion Removal**:
   - **Immediate**: $A \to A \alpha \mid \beta \implies A \to \beta A', A' \to \alpha A' \mid \varepsilon$.
   - **Indirect / General**: Paull's algorithm using non-terminal topological ordering $A_1 \dots A_n$, expanding previous non-terminals, then eliminating immediate left recursion.
5. **Left Factorization**:
   - Extract longest common prefixes: $A \to \alpha \beta_1 \mid \alpha \beta_2 \mid \gamma \implies A \to \alpha A' \mid \gamma, A' \to \beta_1 \mid \beta_2$.
6. **Substitution (Inlining / Expansion)**:
   - Replace all occurrences of a non-terminal with its alternatives.
7. **Chomsky Normal Form (CNF)**:
   - Target format: $A \to BC$ or $A \to a$ (and $S_0 \to \varepsilon$).
   - Standard 5-step pipeline: New start $\to$ $\varepsilon$-removal $\to$ unit-removal $\to$ terminal extraction $\to$ binarization.
8. **Greibach Normal Form (GNF)**:
   - Target format: $A \to a \alpha$ where $a \in T, \alpha \in N^*$.

---

## 5. Automata & Parsing Engines

### 5.1 LL(k) Analyser & Parser
- **LL(1) Conflict Detection**:
  - Validates disjointness of director sets: $FIRST_1(\alpha_i \cdot FOLLOW_1(A)) \cap FIRST_1(\alpha_j \cdot FOLLOW_1(A)) = \emptyset$.
  - Categorizes First/First and First/Follow conflicts with exact token explanations.
- **LL(2) Capability**:
  - Computes 2-token lookahead sets for ambiguous LL(1) grammars, verifying LL(2) compatibility.
- **Interactive Top-Down Simulator**:
  - Visual stack: `[$ , E', T]`
  - Lookahead buffer: `id + id $`
  - Derivation tree: animated top-down tree growth matching stack expansions.
  - Controls: Step Forward, Step Backward, Auto-Play, Pause, Speed Slider, Reset.

### 5.2 LR(k) Analyser & Parser
- **Item Configurations**:
  - LR(0) items: $[A \to \alpha \cdot \beta]$
  - LR(1) items: $[A \to \alpha \cdot \beta, a]$ where $a \in T \cup \{\$\}$
- **Automaton Variants**:
  1. **LR(0)**: Canonical collection, standard shift/reduce table.
  2. **SLR(1)**: Reductions constrained by $FOLLOW_1(A)$.
  3. **LALR(1)**: Built by the Dragon Book propagation of lookaheads on the LR(0) automaton (not by merging LR(1) states); the merges of LR(1) states are shown separately.
  4. **LR(1)**: Full canonical LR(1) automaton.
- **Tables**: the lecture layout is the default (states named by their entry symbol, E₁; f = P/R i/A, g over T then N); the Dragon Book ACTION/GOTO layout is a switch. LR(0) is strict (S'→S• conflicts with shifts).
- **Conflict Analysis**:
  - Highlights Shift/Reduce (S/R) and Reduce/Reduce (R/R) conflicts.
  - Computes grammar classification badge (LR(0) / SLR(1) / LALR(1) / LR(1) / Non-LR).
- **Automaton State Graph**:
  - Interactive SVG node-link diagram with Dagre layout, displaying states (item sets) and transitions (shifts & gotos).
  - Pan, zoom, node drag, node highlight, and state inspection drawer.
- **Interactive Bottom-Up Simulators**:
  - **Deterministic LR Simulator**: Dual stack display (State stack $[0, 2, 5]$ and Symbol stack $[\$, E, +]$), trace log showing shift, reduce, and accept steps.
  - **Generalized LR (GLR) Simulator (Tomita 1985, Scott & Johnstone 2006)**: Uses Graph-Structured Stack (GSS) to parse non-deterministic and ambiguous grammars with conflicts. Forks on S/R and R/R conflicts, merges states on identical frontiers, and generates alternative derivation trees. Interactive SVG GSS graph visualizer with Dagre layout, step trace log, node inspection drawer (origins, LR items, merge notices), and synchronized subtree highlighting in the derivation tree.

### 5.3 Recursive Descent & Symbol Table (see `docs/REVIEW.md` §24–26)
- **Code generation** for LL(1) grammars: PL/0 (compiled by our PL/0 compiler, run on the P-code VM, link to the course interpreter), Oberon-07, C99, Python 3, JavaScript. All print the same output (left parse, then OK or ERR); `rdLanguages.test.ts` checks it. The generated programs check the syntax only.
- **Step simulator**: input with the current symbol, call stack, the procedure being executed with its `if (sym ∈ {…})` branches, parse tree, symbol table, playback controls. The columns follow the card width (container queries).
- **Symbol table – a demonstration of building the table, not a compiler** (the tab has a help section listing what it can and cannot do; keep it in sync with the code):
  - The scanner (`scanInput`) reads names and numbers as the identifier and number terminals and keeps their text; samples come with programs with names (`namedInput`).
  - Rule actions have positions in the right-hand side (`position`, `closeAfter`): a name is declared after its identifier is read; a scope opens before and closes after given symbols; every other identifier is looked up.
  - Semantic errors stop the descent (switchable): a name not declared in any open scope, a name declared twice in one scope. The terminal itself (`id` written instead of a name) is not checked.
  - Detection (`suggestSymbolActions`): procedure/function keywords declare the name in the enclosing scope and open its own scope (not over a trailing self-call); declaration keywords and their list/definition non-terminals; typed declarations with the type read last (`$type`); `{ }`/`begin end` are scopes only when declarations can occur inside. `number` is not a type keyword.
  - Not implemented: types, kinds of names and parameters are not checked; no forward references, records, modules; no code, addresses or levels.

### 5.4 ALL(*) Adaptive Top-Down Parser & Automata (Parr, Harwell, & Fisher 2014)
- **Theoretical Foundation**: Implements the dynamic non-backtracking adaptive LL(*) algorithm powering ANTLR 4. Resolves parsing decisions at runtime by launching subparser simulations on recursive Transition Networks (ATN) and caching deterministic prediction decisions in Lookahead DFAs.
- **Augmented Transition Network (ATN)**:
  - Constructed directly from context-free productions: rule start states, rule stop states, rule call transitions (with return targets), and terminal match transitions.
  - Decision states: Non-terminals with multiple alternatives act as decision points branching into alternative paths.
- **Lookahead DFA & Adaptive Prediction**:
  - Deterministic state cache where states represent closure sets of ATN configurations: $(p, i, \gamma)$ where $p$ is an ATN state, $i$ is the alternative index ($1 \dots k$), and $\gamma$ is the call stack.
  - $\varepsilon$-closure with call/return stack tracking enables precise context-sensitive lookahead evaluation beyond fixed $k$.
  - Ambiguity resolution: If multiple alternatives survive at end-of-input or identical state configurations, lowest alternative index (rule order) resolves the conflict deterministically.
- **Interactive Step Simulator & Graph Visualization**:
  - Step simulator tracing input token pointer, active ATN configurations, lookahead depth, decision stack, and derivation tree construction.
  - Interactive SVG visualizer for dynamically synthesized Lookahead DFAs using Dagre hierarchical layout, complete with pan, zoom, node drag, and state inspection drawer.

---

## 6. University Teaching, Exporters & Bilingual Design
- **Bilingual Interface**: Czech (default) and English with the terminology of the KIV/FJP lectures (e.g. *bezkontextová gramatika*, *počáteční symbol*, *FIRST a FOLLOW*, *množina řídicích symbolů*, *rozkladová tabulka*, *kolize FIRST-FIRST*, *nenormovaný symbol*, *Chomského normální forma*). Every text exists in both languages.
- **LaTeX Export**: One-click generation of compile-ready LaTeX tables (`tabular`, `array`, and TikZ / forest tree environments) for problem sets and exams.
- **Step-by-Step Mathematical Proofs**: Every transformation details the sets computed (e.g., $N_\varepsilon$, unit pairs), rules removed, and rules inserted.
- **Curated Textbook Presets**:
  - Arithmetic Expressions (Ambiguous, Left-Recursive LL(1)-incompatible, Factored LL(1), SLR(1) compatible).
  - Classic Dangling-Else Ambiguity.
  - Palindromes and Even/Odd balanced languages.
  - Classic grammar separating LR(0) from SLR(1) (e.g., $S \to L = R \mid R, L \to * R \mid \text{id}, R \to L$).
  - Classic grammar separating SLR(1) from LALR(1) and LR(1).
- **Projector / Classroom Mode**: High-contrast typography and layout suitable for large-screen university lecture projectors.

---

## 7. Development & Engineering Rules
1. **TypeScript Strict Mode**: No `any` types in core domain logic; exhaustive enum/union switches.
2. **Pure Algorithmic Core**: Modules under `src/core/` must be completely independent of the DOM/UI, allowing headless CLI testing and 100% unit test coverage via Vitest.
3. **Deterministic Output**: Sets and tables must be sorted alphabetically and by rule order to ensure reproducible teaching examples and regression tests.
4. **Defensive Bounds**: Educational inputs can include exponential or non-terminating grammars. Include cycle detectors and configurable recursion/depth limits.
5. **Preserve User Code & Documentation**: Never delete comments or overwrite established modules without clear architectural rationale.
