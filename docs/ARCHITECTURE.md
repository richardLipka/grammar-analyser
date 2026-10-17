# GrammarAnalyser - System Architecture & Engineering Blueprint

This document details the architectural design, core engineering principles, module decoupling, and visualization infrastructure of **GrammarAnalyser** (`grammar-analyser`).

---

## 1. System Overview & Core Philosophy

GrammarAnalyser is an interactive, browser-based educational workstation for formal language theory, context-free grammars, parsing algorithms, and compiler construction.

### Fundamental Principles
- **100% Client-Side Computing**: Zero server-side runtime dependencies. All grammar analysis, normal form transformations, parsing table generation, automata construction, and code generation execute natively in the browser via TypeScript.
- **Academic Rigour & Determinism**: Output sets (FIRST, FOLLOW, Director sets), parsing tables, and automaton states are deterministically ordered. Algorithms implement standard university textbook specifications (Hopcroft, Motwani, Ullman; Aho, Lam, Sethi, Ullman - the *Dragon Book*; Meduna; Parr).
- **Bilingual Interface**: Seamless switching between Czech (default academic terminology of KIV/FJP at the University of West Bohemia) and English.
- **Deep Educational Visualization**: Interactive SVG state graphs (Dagre-powered), step-by-step parsing simulators (LL, LR, Recursive Descent, ALL(*)), parse tree animators, and one-click LaTeX exam export.

---

## 2. Directory Layout & Module Decoupling

The repository enforces strict separation between algorithmic computation (`src/core/`) and user interface rendering (`src/ui/`):

```
src/
├── core/                           # Pure algorithmic domain logic (zero DOM dependencies)
│   ├── ast/                        # Grammar AST, symbols, rule structures, formatting
│   ├── parser/                     # Multi-syntax grammar parser, tokenizer, membership, CYK
│   ├── analyser/                   # Nullable, endable, FIRST(k), FOLLOW(k), LR conflicts, ambiguity
│   ├── processor/                  # Equivalent transformations (reduction, ε, unit, left recursion, factoring, CNF, GNF)
│   ├── generator/                  # Word generation, example words, tree utilities (cloneTree, createTreeNode)
│   ├── jobs/                       # Resumable generator jobs for long-running computations
│   ├── ll/                         # LL(1) / LL(2) parsing tables and top-down simulator
│   ├── lr/                         # LR(0), SLR(1), LALR(1) (propagation), LR(1) automata & tables
│   ├── all/                        # ALL(*) Augmented Transition Network (ATN), Lookahead DFA, simulator
│   ├── codegen/                    # Recursive descent generators (PL/0, Oberon, C, Python, JS), P-code VM, symbol table
│   ├── export/                     # Academic LaTeX and SVG/PNG export engines
│   └── presets/                    # Built-in textbook grammars and curated conflict examples
├── i18n/                           # Bilingual dictionaries (cs.ts, en.ts)
├── ui/                             # React 19 UI presentation layer
│   ├── components/                 # Shared widgets (ReferenceBar, LaTeX button, simulator controls)
│   ├── visualizer/                 # SVG visualization engine (AutomatonGraph, LookaheadDFAGraph, GraphToolbar, graphUtils)
│   ├── views/                      # Feature views (Overview, FirstFollow, LL, LR, ALL, RecursiveDescent, etc.)
│   ├── urlState.ts                 # Bidirectional URL state synchronization (hash compression)
│   ├── useGrammarHistory.ts        # Undo/redo state history management
│   └── useSteppedJob.ts            # UI hook for generator-backed computational jobs
├── styles/                         # Vanilla CSS design system (Dark, Light, Classroom Projector themes)
├── App.tsx                         # Primary application state and view dispatcher
└── main.tsx                        # Application entry point
```

---

## 3. Core Domain Modules (`src/core/`)

### 3.1 Grammar AST & Multi-Syntax Parser (`ast/`, `parser/`)
- **AST Model**: Productions are represented as `ProductionRule { id, lhs, rhs: Symbol[] }`. Symbols distinguish `Terminal` vs `NonTerminal` and empty string $\varepsilon$.
- **Grammar Syntax Parser**: Supports flexible input syntax:
  - Arrows: `->`, `-->`, `=>`, `::=`, `:=`, `:`
  - Alternatives: Pipe `|` or indentation-based continuation.
  - Terminals: Quoted strings (`"term"`, `'+'`), explicit token declarations (`%token`), or unquoted lowercase tokens.
  - Non-Terminals: Angle-bracketed (`<expr>`), LHS-declared identifiers, or lecture capital notation (`[Ba]`).
  - Empty string: `epsilon`, `eps`, `EPS`, `ε`, `λ`, `lambda`, `%empty`, `""`, `#`.
- **Membership Algorithms**: Earley parser, CYK algorithm, and brute-force derivation search for validating word membership in arbitrary CFGs.

### 3.2 Grammatical Analysis & Properties (`analyser/`)
- **Properties**:
  - Nullable symbols $N_\varepsilon = \{ A \in N \mid A \Rightarrow^* \varepsilon \}$.
  - Generating / Endable symbols $N_{term} = \{ A \in N \mid A \Rightarrow^* w \in T^* \}$.
  - Reachable symbols $V_{reach} = \{ X \in V \mid S \Rightarrow^* \alpha X \beta \}$.
- **Lookahead Sets**:
  - $FIRST_k(\alpha)$ and $FOLLOW_k(A)$ for $k \in \{1, 2\}$ using fixed-point iterative propagation.
  - Director / Predict sets: $LOOKAHEAD_k(A \to \alpha) = FIRST_k(\alpha \cdot FOLLOW_k(A))$.
- **Recursion & Ambiguity**:
  - Cycle detection and left/right recursion classification (immediate vs indirect).
  - Ambiguity heuristics and language equivalence approximations.

### 3.3 Grammar Transformations (`processor/`)
Transformations preserve language equivalence $L(G) = L(G')$ and yield step-by-step mathematical derivations:
1. **Reduction**: Non-generating elimination followed by unreachable symbol pruning.
2. **$\varepsilon$-Removal**: Nullable expansion with optional start symbol substitution.
3. **Unit-Production Elimination**: Transitive closure over unit pairs $(A, B)$ where $A \Rightarrow^* B$.
4. **Left Recursion Removal**: Immediate transformation and Paull's general algorithm for indirect left recursion.
5. **Left Factoring**: Longest common prefix extraction.
6. **Normal Forms**: Chomsky Normal Form (5-stage pipeline) and Greibach Normal Form.

### 3.4 Parsing Engines & Automata

#### LL(k) Analyser & Parser (`ll/`)
- Evaluates FIRST/FIRST and FIRST/FOLLOW disjointness.
- Computes deterministic LL(1) and LL(2) tables.
- Interactive top-down parsing simulator featuring visual expansion stacks and live derivation trees.

#### LR(k) Automata & Table Construction (`lr/`)
- **Supported Automata**:
  - **LR(0)**: Canonical collection of item sets.
  - **SLR(1)**: $FOLLOW_1$-restricted reductions.
  - **LALR(1)**: Dragon Book lookahead propagation directly on the LR(0) kernel graph.
  - **LR(1)**: Full canonical collection.
  - **IELR(1)** (`buildIELR1Automaton`): the result of Denny & Malloy's IELR(1), computed more simply from the canonical LR(1) automaton. LR(1) states with the same LR(0) core are merged (as in LALR(1)), and a group is split only where merging would change a resolved action: precedence/associativity, otherwise Bison's default (shift before reduce, the earlier rule in a reduce/reduce conflict). Groups whose transitions lead to different groups are split too, and the states are numbered breadth-first like the other automata. The parser behaves like canonical LR(1) after conflict resolution. It has the states of LALR(1) when merging changes no resolved action, and it never adds a conflict on a symbol where none of its LR(1) states has one. Each split records its reason (`splitReasons`, shown by `ielrSplitGroups` / `IELRPanel`). Without precedence declarations the automaton is built with the default resolution only (`rawTables['IELR(1)']`).
- **Table Layouts**: Dual mode support:
  - University Lecture Layout (states named by entry symbol $E_1$, $f$ for reduce/shift, $g$ transition table).
  - Classical Dragon Book ACTION/GOTO layout.
- **Bottom-Up Simulators**:
  - **Standard Deterministic LR**: Stack visualization ($[\$, E, +]$), item matching, and reduction logs.
  - **Generalized LR (GLR)** (`glrParser.ts`): Implements Tomita's algorithm and RNGLR (Scott & Johnstone 2006). Uses a Graph-Structured Stack (GSS) to explore non-deterministic and ambiguous parsing paths concurrently, merging states at shared frontiers and enumerating all valid parse trees. Interactive SVG visualization via `GSSGraphVisualizer.tsx`.

#### ALL(*) Adaptive Top-Down Parser (`all/`)
- Based on Parr, Harwell, & Fisher (2014) (*ANTLR 4* foundation).
- **Augmented Transition Network (ATN)**: Synthesized from grammar rules with rule call/return transitions.
- **Lookahead DFA**: Runtime deterministic cache where states represent ATN configuration sets $(p, i, \gamma)$ with call stacks $\gamma$.
- Dynamic non-backtracking lookahead prediction simulator with decision graph visualization.

#### Recursive Descent & Code Generation (`codegen/`)
- Code generators for LL(1) grammars: PL/0, Oberon-07, C99, Python 3, and JavaScript.
- Embedded P-code virtual machine and PL/0 compiler for in-browser execution.
- Symbol table demonstration with nested scopes, declarations, and duplicate/undeclared identifier checks.

---

## 4. Shared Visualization & UI Architecture (`src/ui/`)

### 4.1 Shared Graph & Visualizer Subsystem (`ui/visualizer/`)
To eliminate code duplication across graph displays, visualization logic is unified:
- **`graphUtils.ts`**: Provides quadratic Bezier curve smoothing (`edgePath`) for multi-point polyline edges generated by layout engines.
- **`GraphToolbar.tsx`**: Reusable floating control toolbar providing:
  - Zoom In, Zoom Out, Reset/Fit View.
  - High-resolution SVG download.
  - High-resolution PNG rasterization via offscreen `<canvas>` with pixel ratio scaling.
  - Slot for component-specific action buttons.
- **`usePanZoom.ts`**: Unified mouse, touch, wheel, and drag pan-zoom interaction hook with boundary protection.
- **Automata Layout**: Dagre graph layout engine computes node coordinate hierarchies and edge routing.
- **Tree Layout**: Reingold-Tilford tidy tree layout for derivation trees.

### 4.2 Shared Academic Components (`ui/components/`)
- **`ReferenceBar.tsx`**: Standardized literature reference component. Displays author, year, title, publication venue, DOI/URL links, and bilingual annotations across parsing and analysis tabs.
- **`DerivationTreeVisualizer.tsx`**: Unified interactive tree visualizer used by LL, LR, and ALL(*) simulators.
- **`WordGenerator.ts`**: Centralized tree manipulation primitives (`cloneTree`, `createTreeNode`).

### 4.3 State Management & Synchronization
- **URL Hash Synchronization (`urlState.ts`)**: Encodes the active grammar and settings into a compressed URL hash for instant sharing and bookmarking.
- **Grammar History (`useGrammarHistory.ts`)**: Multi-level undo/redo ring buffer for the grammar editor.
- **Stepped Job Execution (`useSteppedJob.ts`)**: JavaScript generator runner allowing intensive computations (e.g., exponential CNF expansions or deep LR(1) closures) to yield back to the main UI thread.

---

## 5. Quality Assurance & Engineering Standards

1. **TypeScript Strict Mode**: Zero `any` in core domain modules; full type safety with strict null checks.
2. **Headless Unit Testing**: All core algorithms are completely decoupled from browser APIs (DOM, `window`, `document`), enabling headless testing via Vitest.
3. **Regression Test Coverage**: 35 test suites covering grammar parsing, normal forms, LL/LR tables, ALL(*) ATN prediction, code generation, and academic reference validity.
4. **Automated CI/CD**: GitHub Actions workflow (`.github/workflows/deploy.yml`) validates tests, builds the static production distribution, and deploys to GitHub Pages upon push to `master`.
