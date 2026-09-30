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
  - Arrows: `->`, `-->`, `=>`
  - BNF & EBNF: `::=`, `:==`, `:=`
  - Yacc / Bison / ANTLR: `:`, semicolons `;`, dot `.`
  - Alternatives: Pipe `|` or clean indentation/newline alternatives
  - Epsilon representations: `ε`, `eps`, `epsilon`, `λ`, `#`, `""`
  - Comments: `// ...`, `# ...`, `/* ... */`
- **Grammar Analyser**:
  - Nullable symbols ($N_\varepsilon$)
  - Endable / Terminating / Generating symbols ($N_{gen}$)
  - Reachable symbols ($V_{reach}$)
  - $\text{FIRST}_1$, $\text{FIRST}_2$, $\text{FOLLOW}_1$, $\text{FOLLOW}_2$
  - Lookahead / Predict / Director sets
- **Grammar Processor (Equivalent Transformations)**:
  - Unreachable & unproductive symbol removal (Reduced Grammar)
  - $\varepsilon$-production elimination with start symbol preservation
  - Unit-production elimination ($A \to B$)
  - Immediate and indirect left-recursion elimination (Paull's algorithm)
  - Left factorization
  - Non-terminal substitution (inlining/expansion)
  - Chomsky Normal Form (CNF)
  - Greibach Normal Form (GNF)
  - Step-by-step mathematical proof explanations for all transformations
- **Word Generator**:
  - BFS enumeration of shortest words in $L(G)$
  - Random derivation with bounded depth
  - Leftmost sentential derivation sequences
  - Interactive Derivation Tree visualizer
- **LL(k) Analyser & Parser**:
  - $\text{LL}(1)$ & $\text{LL}(2)$ conflict verification (First/First, First/Follow)
  - $\text{LL}(1)$ parse table construction $M[A, a]$
  - Interactive top-down stack simulator with forward/backward steps, auto-play, and live parse tree
- **LR(k) Analyser & Parser**:
  - $\text{LR}(0)$, $\text{SLR}(1)$, $\text{LALR}(1)$, and $\text{LR}(1)$ canonical collections
  - $\text{ACTION}$ and $\text{GOTO}$ parsing table generation
  - Shift/Reduce and Reduce/Reduce conflict detection
  - Interactive SVG State Machine Graph (powered by Dagre) with pan, zoom, and state inspection
  - Bottom-up shift-reduce simulator with dual stack tracking (state stack & symbol stack) and live tree reduction
- **University Teaching & Classroom Features**:
  - **One-Click LaTeX Export**: Compile-ready LaTeX tables (`align*`, `tabular`, and TikZ / `forest` trees) for university exams and homework
  - **Bilingual Interface**: Instant toggle between English and Czech academic terminology
  - **Projector / Classroom Mode**: High-contrast theme optimized for lecture hall projectors
  - **Curated Textbook Presets**: Benchmark grammars from the Dragon Book, Hopcroft-Motwani-Ullman, dangling else, arithmetic precedence, and LR family distinguishing grammars

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
│   ├── generator/          # Word generation & derivation traces
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
MIT
