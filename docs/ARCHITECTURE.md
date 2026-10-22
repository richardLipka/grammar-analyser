# Architecture

This document describes how the Formal Grammar Analyser (`grammar-analyser`) is put together: the principles, the modules of `src/`, and how a grammar flows from the editor to the tabs. The decisions about the algorithms, and how each was verified, are recorded in [REVIEW.md](REVIEW.md). The literature is in [REFERENCES.md](REFERENCES.md).

## 1. Principles

- **Client-side only.** There is no server. Everything runs in the browser in TypeScript: parsing the grammar, the analysis, the transformations, the automata and tables, the simulators, code generation, the PL/0 compiler and the P-code VM. The build is a static `dist/` with relative paths (GitHub Pages, home.zcu.cz).
- **Core and UI are separate.** `src/core/` has no DOM access, so all algorithms are tested headless with Vitest. `src/ui/` renders them with React 19.
- **Deterministic output.** Sets, tables, state numbers and generated code have a fixed order, so screens, LaTeX and tests are reproducible. Random grammars in the tests are seeded.
- **Independent checks.** The tests compare the algorithms with code written independently of them (`src/test/earley.ts`, FIRST/FOLLOW on token arrays, the Dragon Book LALR propagation, tree counts, brute force), on all presets and on random grammars (REVIEW §11, §18, §28).
- **Course terminology.** Every text exists in Czech (the default, with the terms of the KIV/FJP lectures) and English, with the same keys (`src/i18n/translations.ts`; some views keep their texts inline as `{ cz, en }`).
- **Long computations as jobs.** Analyses that can grow large are generators that yield. The UI runs them in slices, and the user can stop them and keep the partial result.

## 2. Module map

```
src/
├── App.tsx                 state of the application, tabs (TAB_ROWS), grammar panel, splitter, step-control dock
├── main.tsx                entry point
├── core/
│   ├── ast/grammar.ts      Grammar, Production, symbols, ε and $, formatting and quoting for the editor
│   ├── parser/
│   │   ├── grammarParser.ts      all input dialects (arrows, BNF, Yacc/Bison, ANTLR 4, course notation), warnings and errors
│   │   ├── inputTokenizer.ts     simulator input: longest-match split (tokenizeInput), names/numbers for RD/RA (scanInput)
│   │   ├── membership.ts         membership and tree counts for any CFG, span table, viable prefix
│   │   ├── cyk.ts                CNF check, CYK table with witnesses, steps, trees
│   │   └── derivationAttempt.ts  why a grammar does not generate a word (partial tree, expected symbols)
│   ├── analyser/
│   │   ├── grammarAnalyser.ts    nullable, generating, reachable, FIRST_k/FOLLOW_k/PREDICT_k, left recursion, cycles
│   │   ├── ambiguity.ts          bounded search for a word with two leftmost derivations (also used by counterexamples)
│   │   ├── equivalence.ts        language comparison (incremental Earley over prefixes) and form checks
│   │   └── errorRecovery.ts      stop symbols for panic mode (recoverySets = FIRST₁ \ {ε}, FOLLOW₁ ∪ {$}), error summaries
│   ├── processor/
│   │   ├── grammarProcessor.ts   all transformations (whole grammar, per symbol, per occurrence), LR transformations
│   │   ├── ll1Transformer.ts     the automatic attempt at LL(1) (as a job)
│   │   └── transformationInfo.ts ⓘ texts and their references
│   ├── generator/
│   │   ├── wordGenerator.ts      shortest-derivation words, random derivations, DerivationNode helpers
│   │   └── exampleWord.ts        an example word of L(G) (exampleWord, demonstrationWord)
│   ├── ll/
│   │   ├── llTable.ts            LL(1) table, strong LL(2), exact LL(2) with the tables T(A, L)
│   │   └── llParser.ts           LL(1)/LL(2) simulator (simulateLLParse), optional panic mode
│   ├── lr/
│   │   ├── lrItem.ts, lrAutomaton.ts   LR(0), SLR(1), LALR(1) (propagation), LR(1), IELR(1) (merge of LR(1) by resolved actions)
│   │   ├── lrTable.ts            tables in the lecture (f/g) and Dragon (ACTION/GOTO) layouts, precedence resolution
│   │   ├── lrParser.ts           shift-reduce simulator (simulateLRParse), optional panic mode
│   │   ├── glrParser.ts          Tomita-style GLR with a graph-structured stack over any of the tables
│   │   ├── lrConstruction.ts     construction steps, LR(1) → LALR(1) merges, IELR split groups
│   │   ├── lrExplain.ts          why a state, item or lookahead exists
│   │   └── lrCounterexample.ts   unifying and non-unifying counterexamples per conflict cell
│   ├── all/                allAtn.ts (ATN), allPredictor.ts (SLL/LL adaptive prediction, DFA cache), allParser.ts
│   ├── earley/
│   │   ├── earleyParser.ts       classic Earley with Aycock–Horspool ε handling, optional Leo items, steps
│   │   ├── ettpParser.ts         ETTP table (kernel and predicted states, ε-links) and its parser over pairs (q, j)
│   │   ├── earleyTrees.ts        derivation trees from a chart, shared by Earley and ETTP (chartTrees)
│   │   ├── earleyExplain.ts      references and theory texts
│   │   └── earleyCompatibility.ts  the badges of the Overview
│   ├── gll/
│   │   ├── gllParser.ts          GLL: descriptors, R, U, GSS nodes (L, i), pop set P, add/create/pop, test (parseGLL)
│   │   ├── bsr.ts                BSR sets (bsrAdd), tree count and extraction
│   │   └── gllExplain.ts         references, theory, step texts
│   ├── forest/sppf.ts      shared packed forests: from a BSR set, from an Earley chart, from a list of trees; by rules or binarised
│   ├── codegen/
│   │   ├── recursiveDescent.ts            RD parser generator: PL/0, Oberon-07, C99, Python 3, JavaScript
│   │   ├── rdSimulator.ts                 RD step simulator, symbol-table actions, semantic errors, Wirth-style panic mode
│   │   ├── recursiveAscent.ts             RA generator (one procedure per LR state): JS, Python, C, Oberon, PL/0
│   │   ├── recursiveAscentSimulator.ts    RA step simulator (call stack = LR stack), LR panic mode in terms of calls
│   │   ├── recursiveAscentActions.ts      where RD's actions can run in RA (transition / mixed / reduction), free positions
│   │   ├── symbolTable.ts                 stack of scopes, keyword detection of actions (suggestSymbolActions)
│   │   ├── pl0Compiler.ts, pcodeVm.ts     PL/0 → P-code (Wirth's code generation, course mnemonics) and the VM
│   ├── export/             latexExport.ts (grammar, sets, tables, forest trees), graphExport.ts (SVG/PNG with theme styles)
│   ├── teaching/           teachingGuideData.ts (techniques of the Transformation Guide), techniqueAnalyzer.ts
│   ├── presets/            presetGrammars.ts (examples by group), rdSampleGrammars.ts (RD/RA samples with programs)
│   ├── jobs/job.ts         Job = generator with JobControl; runJob, runToEnd, ticker
│   └── analysisJob.ts      the whole analysis as one job (analyzeAllSteps; computeAnalysis synchronously)
├── ui/
│   ├── views/              one view per tab (see §4)
│   ├── components/
│   │   ├── SimulatorControls.tsx   step controls of every simulator, rendered into the dock at the bottom of the screen
│   │   ├── PaneSplitter.tsx        draggable splitter between the grammar panel and the analysis
│   │   ├── ErrorRecovery.tsx       recovery switch, recovery step panel, error list (LL, LR, RD, RA)
│   │   ├── ConflictCounterexample.tsx  counterexample under an LR conflict
│   │   ├── LRConstructionPanel.tsx, LRExplanation.tsx, LRLayoutSwitch.tsx
│   │   ├── GrammarClickView.tsx    transform by clicking
│   │   ├── TransformationInfo.tsx  ⓘ dialog
│   │   ├── ReferenceBar.tsx, LatexExportButton.tsx, JobStatus.tsx, TokenizedInputNote.tsx, Symbols.tsx, FavLogo.tsx
│   ├── visualizer/         AutomatonGraph, LookaheadDFAGraph, ETTPGraph, GSSGraph (GLR), GLLGSS, Forest, DerivationTree;
│   │                       GraphToolbar (zoom, fit, SVG/PNG), usePanZoom, graphUtils (edge paths)
│   ├── urlState.ts         grammar links: read and build ?g=…&w=…&tab=…
│   ├── useGrammarHistory.ts  undo/redo of the editor, reset when an example is loaded
│   ├── useSteppedJob.ts    runs a job in 40 ms slices, asks every 30 s whether to go on
│   └── wholeGrammarTransformations.ts  menu of whole-grammar transformations
├── i18n/translations.ts    Czech and English texts
├── styles/                 index.css (layout, themes light/dark/projector, dock, splitter), teaching.css
└── test/                   47 vitest suites; oracles earley.ts, randomGrammar.ts, runProgram.ts (gcc/python)
```

## 3. Data flow

```
URL (?g, preset, w, tab, e, split, lang, theme) ─┐
editor text ─── useGrammarHistory (undo/redo) ───┤
                                                 ▼
                     parseGrammar(text, { e, splitWords }) ──► errors / warnings / questions (e, bxc)
                                                 │ Grammar
                                                 ▼
             useSteppedJob(analyzeAllSteps(grammar))  ── JobStatus (progress, 30 s question, stop)
                                                 │ AnalysisDataResult
                                                 │   analysis (sets, recursion), llTable,
                                                 │   LR(0)/SLR(1)/LALR(1)/IELR(1)/LR(1) automata and tables,
                                                 │   rawTables (without precedence), ambiguity, stopped parts
                                                 ▼
           App: analyzedGrammar, demonstrationWord(grammar, preset/link word), active tab
                                                 │ props
                                                 ▼
   views ──► simulators run on demand (useMemo on grammar, tables, word, options):
             simulateLLParse, simulateLRParse, simulateGLRParse, simulateALLParse, simulateEarleyParse,
             simulateETTPParse, parseGLL, simulateCYKParse / testMembership,
             simulateRecursiveDescent, simulateRecursiveAscent, compareLanguagesSteps (job)
        ──► steps[] ──► SimulatorControls (in the dock) select the step ──► step panel, tables, graphs, trees
```

- **Reading the grammar.** `App.tsx` keeps the editor text and the parse options: how a standalone `e` is read, and whether words like `bxc` are split. `parseGrammar` returns the grammar or errors, plus warnings and the questions the editor asks. While the text has errors, the last analysis stays visible, marked as outdated.
- **Analysis.** `analyzeAllSteps` is a generator. The cheap parts come first (sets, LL(1), strong LL(2), LR(0), SLR(1), LALR(1)), and the parts that can grow large come last (exact LL(2), canonical LR(1), IELR(1), the ambiguity search). `useSteppedJob` runs it in slices. If the user stops it after LALR(1), the result names the missing parts in `stopped`.
- **The example word.** `demonstrationWord` keeps the word of the preset or the link while the membership algorithm accepts it. Otherwise it derives a word from the grammar. The LL, LR, CYK, RD and RA tabs start with this word.
- **Transformations** (`grammarProcessor.ts`, `ll1Transformer.ts`) return a new grammar and the steps that explain it. App writes the grammar back to the editor (`formatGrammarForEditor`) as one history entry, which triggers a new parse and analysis. The automatic LL(1) attempt runs as a job too.
- **Simulators** are pure functions of the grammar, the table or automaton, the tokens and their options, such as `{ recovery: true }`, Leo items, the GLL look-ahead test, or the symbol-table actions. They return the full list of steps and the result: trees, parses, errors. The views keep only the index of the current step.
- **Error recovery** is an option of `simulateLLParse`, `simulateLRParse`, `simulateRecursiveDescent` and `simulateRecursiveAscent`. The stop symbols come from `recoverySets` in `errorRecovery.ts`. A step of recovery carries a `recovery` record, which `ErrorRecovery.tsx` shows, and the trees mark nodes as `error` or `skipped`. Without the option the steps are exactly those of the plain parser.
- **Forests.** `sppf.ts` builds a forest from the GLL BSR set, from an Earley chart (`earleyChartToBSR`), or from GLR's list of trees (`treesToForest`). `ForestVisualizer` draws it.
- **Links and storage.** `urlState.ts` reads the link once at start-up and builds the link of the *Link* button. Theme, language, the LR table layout, the width of the grammar panel and whether it is collapsed are kept in `localStorage`. Reads and writes are guarded, so the page also works without storage.

## 4. User interface

- **Layout** (`App.tsx`, `styles/index.css`):
  - a header;
  - on the left, the grammar panel: editor or click mode, examples, history, palette, link;
  - the `PaneSplitter`, which can be dragged (240 px to 70 % of the window, the CSS variable `--left-pane-width`) and collapsed (double-click, Enter or its button, or a drag far to the left); App clamps its width and remembers it;
  - on the right, the analysis: the two menu rows (`TAB_ROWS`) and the active view;
  - at the bottom of the analysis pane, the dock `#sim-dock`.
- **Step controls.** `SimulatorControls` renders itself through a portal into `#sim-dock`, so the controls of the active simulator float at the bottom of the screen. The bar names the simulator (`label`) and has back, forward, play, speed, a slider over the steps and a button that scrolls back to the simulator, and ← / → also step. The bar is hidden while it is empty, and in the single-column layout it sticks to the bottom of the window. `docked={false}` keeps the controls in place where needed. Step panels that must stay visible are sticky (`.sim-sticky`).
- **Views**, in menu order:

  | Tab | View |
  |---|---|
  | Overview | `OverviewView.tsx` |
  | Word generator | `WordGeneratorView.tsx` |
  | FIRST & FOLLOW | `FirstFollowView.tsx` |
  | LL | `LLView.tsx` |
  | LR automaton | `AutomatonGraphView.tsx` |
  | LR parsers | `LRView.tsx` (tables, simulator, GLR, counterexamples) |
  | CYK | `MembershipView.tsx` (membership, trees, the CYK card) |
  | ALL(\*) | `ALLView.tsx` |
  | Earley & ETTP | `EarleyView.tsx` |
  | GLL | `GLLView.tsx` |
  | Transformations | `TransformationsView.tsx` |
  | Transformation Guide | `TeachingGuideView.tsx` |
  | Language comparison | `EquivalenceView.tsx` |
  | Recursive descent and Recursive ascent | one `RecursiveDescentView.tsx` instance with the prop `method`; ascent renders `RecursiveAscentView.tsx` |
  | LaTeX & export | `LatexExportView.tsx` |

  Because both recursive tabs are one instance, the word, the sample grammar, the symbol-table actions and the recovery switch stay when switching between them.
- **Graphs.** dagre computes the layout of automata, DFAs, GSSs and forests. Trees use a tidy layout that keeps the order of the yield. `usePanZoom` provides wheel zoom towards the cursor, fit, focus and frame. `GraphToolbar` exports SVG/PNG with the computed styles inlined, so the exports keep the theme. Large automata (over 150 states) are drawn only on request. Graph nodes are memoized, so that stepping does not re-render the whole graph.

## 5. Quality

- **Tests.** There are 865 tests in 47 suites under `src/test/` (October 2026). They cover:
  - grammar parsing in all dialects and the course notation;
  - every transformation, for language equivalence and the promised form, including random fuzzing;
  - LL and LR tables against oracles, the lecture examples, lookaheads, construction steps and IELR properties;
  - counterexamples, Earley/Leo/ETTP, GLL/BSR/forests, ALL(\*), CYK and membership, and the language comparison;
  - recursive descent and ascent in all languages (C compiled by gcc and Python run when available), the symbol table, and error recovery in all four simulators;
  - URL state.

  Long suites yield to the runner between grammars.
- **Type checking.** `npm run build` runs `tsc -b` before `vite build`.
- **Continuous integration.** `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and `npm run build` on every push to `master` and deploys `dist/` to GitHub Pages.
