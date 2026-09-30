# GrammarAnalyser - Project Constitution & Engineering Guide

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
│   ├── ast/                # Grammar data models, AST nodes, symbol types
│   ├── parser/             # Multi-syntax grammar parsers (BNF, EBNF, Yacc, ANTLR, arrows)
│   ├── analyser/           # Nullable, Endable, FIRST(k), FOLLOW(k), Lookaheads
│   ├── processor/          # Equivalent grammar transformations (CNF, GNF, Left Recursion, etc.)
│   ├── generator/          # Word generation, leftmost/rightmost derivation traces
│   ├── ll/
│   │   ├── table.ts        # LL(1) and LL(2) table generation & conflict detection
│   │   └── parser.ts       # LL top-down stack simulator & parse tree builder
│   ├── lr/
│   │   ├── item.ts         # LR(0) and LR(1) item representations & core hashing
│   │   ├── automaton.ts    # Canonical collections (LR0, SLR1, LALR1, LR1) & graph
│   │   ├── table.ts        # ACTION & GOTO parsing tables & conflict detector
│   │   └── parser.ts       # LR bottom-up shift-reduce simulator & parse tree builder
│   ├── export/             # LaTeX, Markdown, JSON exporters for university problem sets
│   └── presets/            # Curated textbook grammars (Dragon Book, Hopcroft, dangling else, etc.)
├── i18n/                   # Bilingual terminology dictionaries (English & Czech)
├── ui/
│   ├── components/         # Reusable UI widgets (SplitPane, Tabs, Badges, Tables, LatexModal)
│   ├── editor/             # Grammar input editor with syntax detection & presets
│   ├── visualizer/         # Interactive SVG Graph visualizer (LR Automaton) and Derivation Tree visualizer
│   ├── simulator/          # Step-by-step playback controls (VCR: play/pause/step)
│   └── views/              # Tab views (Overview, Transformations, LL, LR, Graph, Words, Export)
├── styles/                 # Modern Vanilla CSS design system (tokens, themes, animations)
└── main.tsx                # Application bootstrapping & state orchestrator
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
4. **Terminals vs Non-Terminals**:
   - Quoted strings: `"term"`, `'term'`, `"+"`, `";"` are strictly terminals.
   - Angle-bracketed identifiers: `<Expression>`, `<term>` are strictly non-terminals.
   - Casing conventions when unquoted:
     - Uppercase/Capitalized (e.g. `E`, `Expr`, `Term`) = Non-terminals.
     - Lowercase/Symbols (e.g. `id`, `num`, `+`, `*`) = Terminals.
   - Explicit terminal/non-terminal declaration directives if specified (e.g. `%token id num`).
5. **Epsilon (Empty String)**:
   - Recognized literals: `epsilon`, `eps`, `EPS`, `ε`, `λ`, `""`, `''`, `#`.
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
  3. **LALR(1)**: Efficient state merging of LR(1) states sharing identical LR(0) cores.
  4. **LR(1)**: Full canonical LR(1) automaton.
- **Conflict Analysis**:
  - Highlights Shift/Reduce (S/R) and Reduce/Reduce (R/R) conflicts.
  - Computes grammar classification badge (LR(0) / SLR(1) / LALR(1) / LR(1) / Non-LR).
- **Automaton State Graph**:
  - Interactive SVG node-link diagram with Dagre layout, displaying states (item sets) and transitions (shifts & gotos).
  - Pan, zoom, node drag, node highlight, and state inspection drawer.
- **Interactive Bottom-Up Simulator**:
  - Dual stack display: State stack $[0, 2, 5]$ and Symbol stack $[\$, E, +]$.
  - Trace log showing every shift, reduction, and final acceptance.
  - Visual tree reconstruction: leaf creation on shift, subtree reduction on reduce.

---

## 6. University Teaching, Exporters & Bilingual Design
- **Bilingual Interface**: Seamless switching between English and Czech academic terminology (e.g. *Bezkontextová gramatika*, *Počáteční symbol*, *Nenulovatelný*, *Chomského normální forma*, *První a Následovník*).
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
