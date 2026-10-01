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
  - Epsilon representations: `ε`, `ϵ`, `e` (KIV/FJP notation), `eps`, `epsilon`, `λ`, `lambda`, `%empty`, `""`, and `#` when it forms a whole alternative (`S -> a S | #`)
  - Compact textbook notation `S → aSb | ab`, `A → bSA`: when every left-hand side is one capital letter, every letter is a symbol
  - Typographic primes and quotes pasted from lecture notes (`E’`, `“+”`) are accepted
  - Comments: `// ...`, `# ...`, `/* ... */`
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
  - Immediate, indirect and hidden (nullable-prefix) left recursion; cycles $A \Rightarrow^+ A$
- **Grammar Processor (Equivalent Transformations)**:
  - Unreachable & unproductive symbol removal (Reduced Grammar)
  - $\varepsilon$-production elimination with start symbol preservation (a fresh start symbol only when $S$ occurs on a right-hand side)
  - Unit-production elimination ($A \to B$)
  - Immediate and indirect left-recursion elimination (Paull's algorithm, with logged preprocessing of ε-rules and cycles)
  - Left factorization
  - Non-terminal substitution (inlining/expansion)
  - Chomsky Normal Form (CNF)
  - Greibach Normal Form (GNF): CNF, ordering $A_1 \dots A_n$, substitution, ε-free elimination of left recursion and back-substitution
  - Step-by-step explanations for all transformations, with the added/removed rules and the grammar after each step
  - Normal-form checklist of the result (reduced, ε-free, no unit rules, no left recursion, CNF, GNF)
  - Every transformation is tested for language equivalence (Earley recognizer over all short words)
- **Word Generator**:
  - BFS enumeration of shortest words in $L(G)$
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
  - $\text{ACTION}$ and $\text{GOTO}$ parsing table generation
  - Shift/Reduce and Reduce/Reduce conflict detection
  - Interactive SVG State Machine Graph (powered by Dagre) with kernel/closure items, conflict states, pan, zoom, and state inspection
  - Bottom-up shift-reduce simulator: textbook trace (stack, input, action), dual stack tracking and the parse forest after every step
- **University Teaching & Classroom Features**:
  - **One-Click LaTeX Export**: Compile-ready LaTeX tables (`align*`, `tabular`, and `forest` trees) for university exams and homework
  - **SVG / PNG Export** of automata and trees with the colours of the active theme
  - **Bilingual Interface**: Czech (default) and English; the Czech terms follow the KIV/FJP lectures (množina řídicích symbolů, rozkladová tabulka, kolize FIRST-FIRST, přesun-redukce, levý/pravý rozklad, nenormované symboly, …)
  - **Light (default), Dark and Projector Themes**: high-contrast outlines and text in the light and projector themes
  - **Curated Textbook Presets**: Benchmark grammars from the Dragon Book, Aho–Ullman, dangling else, arithmetic precedence, and grammars separating LR(0) / SLR(1) / LALR(1) / LR(1), LL(1) / SLR(1) and LL(2) / strong LL(2)

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
