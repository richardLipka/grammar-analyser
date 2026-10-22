# Literature

This is the one list of the publications that the analyser cites: in the reference bars of the tabs, the ⓘ texts of the transformations, the transformation guide, the theory sections, and the comments of the core modules. The list is grouped by topic. The last section lists further reading that the application does not cite.

**Entries.** Each entry gives the authors, title, venue and year, the link, and the files that cite the work (*Used in*, paths under `src/`, found with grep for the DOI, URL or author name). *Note* says what the application takes from the work and anything that could not be checked.

**How the links were checked (2026-10-22).**
- Every DOI was looked up in the Crossref metadata, or in DataCite for LIPIcs, and the title, authors, venue, volume, pages and year were compared with the citation. Every DOI was also resolved at doi.org, and all of them redirect to the publisher's page of that work.
- Every other link was fetched, and the page title or the first page of the PDF was compared with the citation.
- Some pages could not be fetched on that day. The Royal Holloway repository and the ACM Digital Library answer automated requests with 403 (bot check), the DTIC page was down for maintenance, and the server of the Silesian University refused the connection. These links are kept from the audit in `docs/REVIEW.md` §32, which checked them by hand or through the sites' APIs, and each entry says that it was not reachable this time.
- `docs/REVIEW.md` §32 found eleven links that led to the wrong work. All of its corrections are kept here.

Section numbers are given only where they were checked against the work or are cited from the code as the authors' own. No page or section was added from memory.

---

## 1. Textbooks

### Aho, Lam, Sethi & Ullman (2006): the Dragon Book
- A. V. Aho, M. S. Lam, R. Sethi, J. D. Ullman: *Compilers: Principles, Techniques, and Tools*, 2nd ed. Addison-Wesley, 2006. ISBN 978-0-321-48681-3. Record: [openlibrary.org/isbn/9780321486813](https://openlibrary.org/isbn/9780321486813) (checked via the Open Library API).
- *Used in:* `core/processor/transformationInfo.ts` and `core/processor/ll1Transformer.ts` (§4.3, left recursion and left factoring); `core/lr/lrAutomaton.ts` and `ui/views/LRView.tsx` (LALR(1) by propagation, Alg. 4.62/4.63; the Dragon Book table layout, `ui/components/LRLayoutSwitch.tsx`); `core/analyser/errorRecovery.ts`, `core/lr/lrParser.ts`, `core/codegen/recursiveAscentSimulator.ts` and `ui/components/ErrorRecovery.tsx` (panic mode, §4.4.5 and §4.8.3, see section 8).

### Hopcroft, Motwani & Ullman (2006)
- J. E. Hopcroft, R. Motwani, J. D. Ullman: *Introduction to Automata Theory, Languages, and Computation*, 3rd ed. Addison-Wesley, 2006. ISBN 978-0-321-45536-9. Record: [openlibrary.org/isbn/9780321455369](https://openlibrary.org/isbn/9780321455369). Open Library dates this printing 2007. The publisher's page cited earlier no longer exists (REVIEW §32).
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`. The CYK triangle of the CYK tab follows this book (`ui/views/MembershipView.tsx`).

### Aho & Ullman (1972)
- A. V. Aho, J. D. Ullman: *The Theory of Parsing, Translation, and Compiling. Vol. I: Parsing*. Prentice-Hall, 1972. [archive.org/details/theoryofparsingt00ahoa](https://archive.org/details/theoryofparsingt00ahoa) (Internet Archive).
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts` (dangling else, left recursion); `core/ll/llTable.ts`, `core/ll/llParser.ts`, `ui/views/LLView.tsx` (the exact LL(2) test with local follow sets and the tables T(A, L)).

---

## 2. Grammars, normal forms and transformations

### Chomsky & Miller (1958)
- N. Chomsky, G. A. Miller: *Finite state languages*. Information and Control 1(2), 91–112, 1958. [doi:10.1016/S0019-9958(58)90082-2](https://doi.org/10.1016/S0019-9958(58)90082-2)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts` (left-linear to right-linear grammars).

### Chomsky (1959)
- N. Chomsky: *On certain formal properties of grammars*. Information and Control 2(2), 137–167, 1959. [doi:10.1016/S0019-9958(59)90362-6](https://doi.org/10.1016/S0019-9958(59)90362-6)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `ui/views/TransformationsView.tsx` (Chomsky normal form, unit rules).

### Bar-Hillel, Perles & Shamir (1961)
- Y. Bar-Hillel, M. Perles, E. Shamir: *On formal properties of simple phrase structure grammars*. Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung 14, 143–172, 1961. [doi:10.1524/stuf.1961.14.14.143](https://doi.org/10.1524/stuf.1961.14.14.143)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `ui/views/TransformationsView.tsx` (reduction, ε-rules).
- *Note:* the Crossref record (journal now *STUF – Language Typology and Universals*, 14(1–4)) has no page numbers. The pages are the usual citation.

### Floyd (1963)
- R. W. Floyd: *Syntactic analysis and operator precedence*. Journal of the ACM 10(3), 316–333, 1963. [doi:10.1145/321172.321179](https://doi.org/10.1145/321172.321179)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts` (stratification of operator precedence).

### Greibach (1965)
- S. A. Greibach: *A new normal-form theorem for context-free phrase structure grammars*. Journal of the ACM 12(1), 42–52, 1965. [doi:10.1145/321250.321254](https://doi.org/10.1145/321250.321254)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `ui/views/TransformationsView.tsx`.

### Foster (1968)
- J. M. Foster: *A syntax improving program*. The Computer Journal 11(1), 31–34, 1968. [doi:10.1093/comjnl/11.1.31](https://doi.org/10.1093/comjnl/11.1.31)
- *Used in:* `core/processor/transformationInfo.ts`, `core/processor/ll1Transformer.ts`, `core/teaching/teachingGuideData.ts` (left factoring; SID, an early automatic transformation to LL(1) that reported why it failed).

### Rosenkrantz & Lewis (1970)
- D. J. Rosenkrantz, P. M. Lewis II: *Deterministic left corner parsing*. 11th Annual Symposium on Switching and Automata Theory (SWAT 1970), 139–152, 1970. [doi:10.1109/SWAT.1970.5](https://doi.org/10.1109/SWAT.1970.5)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `core/processor/grammarProcessor.ts` (left-corner transformation).

### Rosenkrantz & Stearns (1970)
- D. J. Rosenkrantz, R. E. Stearns: *Properties of deterministic top-down grammars*. Information and Control 17(3), 226–256, 1970. [doi:10.1016/S0019-9958(70)90446-8](https://doi.org/10.1016/S0019-9958(70)90446-8)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `ui/views/LLView.tsx`, `ui/views/TransformationsView.tsx`.

### Mickunas, Lancaster & Schneider (1976)
- M. D. Mickunas, R. L. Lancaster, V. B. Schneider: *Transforming LR(k) grammars to LR(1), SLR(1), and (1,1) bounded right-context grammars*. Journal of the ACM 23(3), 511–533, 1976. [doi:10.1145/321958.321972](https://doi.org/10.1145/321958.321972)
- *Used in:* `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, `core/processor/grammarProcessor.ts` (splitting a non-terminal by its LR context).

### Moore (2000)
- R. C. Moore: *Removing left recursion from context-free grammars*. 1st Meeting of the North American Chapter of the ACL (NAACL 2000), 2000. [aclanthology.org/A00-2033](https://aclanthology.org/A00-2033/)
- *Used in:* `core/processor/transformationInfo.ts`, `core/processor/grammarProcessor.ts` (the selective left-corner transformation).

### Johnson & Roark (2000)
- M. Johnson, B. Roark: *Compact non-left-recursive grammars using the selective left-corner transform and factoring*. COLING 2000. [aclanthology.org/C00-1052](https://aclanthology.org/C00-1052/)
- *Used in:* `core/processor/transformationInfo.ts`.

---

## 3. LL(k) parsing and recursive descent

### Lucas (1961)
- P. Lucas: *Die Strukturanalyse von Formelübersetzern*. Elektronische Rechenanlagen 3, 159–167, 1961 (the journal is now *it – Information Technology*). [doi:10.1524/itit.1961.3.16.159](https://doi.org/10.1524/itit.1961.3.16.159)
- *Used in:* `core/processor/transformationInfo.ts`, `ui/views/RecursiveDescentView.tsx`.
- *Note:* the code cites issue 4. Crossref lists the volume as issues 1–6 and does not give the issue.

### Conway (1963)
- M. E. Conway: *Design of a separable transition-diagram compiler*. Communications of the ACM 6(7), 396–408, 1963. [doi:10.1145/366663.366704](https://doi.org/10.1145/366663.366704)
- *Used in:* `ui/views/RecursiveDescentView.tsx`.

### Lewis & Stearns (1968)
- P. M. Lewis II, R. E. Stearns: *Syntax-directed transduction*. Journal of the ACM 15(3), 465–488, 1968. [doi:10.1145/321466.321477](https://doi.org/10.1145/321466.321477)
- *Used in:* `core/processor/transformationInfo.ts`, `ui/views/LLView.tsx`, `ui/views/FirstFollowView.tsx`.

### Knuth (1971)
- D. E. Knuth: *Top-down syntax analysis*. Acta Informatica 1(2), 79–110, 1971. [doi:10.1007/BF00289517](https://doi.org/10.1007/BF00289517)
- *Used in:* `core/processor/transformationInfo.ts`, `ui/views/LLView.tsx`, `ui/views/FirstFollowView.tsx`.

### Wirth (1976): PL/0
- N. Wirth: *Algorithms + Data Structures = Programs*. Prentice-Hall, 1976. No DOI. The link is the description of the book: [en.wikipedia.org/wiki/Algorithms_+_Data_Structures_=_Programs](https://en.wikipedia.org/wiki/Algorithms_%2B_Data_Structures_%3D_Programs).
- *Used in:* `core/processor/transformationInfo.ts`, `ui/views/RecursiveDescentView.tsx`, and in the comments of `core/codegen/recursiveDescent.ts`, `core/codegen/pl0Compiler.ts`, `core/codegen/pcodeVm.ts` and `core/presets/presetGrammars.ts` (preset `lang_pl0`).
- *Note:* the book introduces PL/0 and its recursive-descent compiler for a stack machine. The procedures of the compiler nest along their calls, and its error recovery uses the follow symbols of each procedure. The built-in PL/0 compiler of the app follows that code generation with the mnemonics of the course (JMC, RET). `core/analyser/errorRecovery.ts` also names Wirth's *Compilerbau* (Teubner). The Crossref record of a 1986 edition is [doi:10.1007/978-3-322-89543-1](https://doi.org/10.1007/978-3-322-89543-1). The app does not link it.

### The KIV/FJP PL/0 interpreter
- R. Lipka: *Online PL/0 interpreter* (the P-machine of the course). [richardlipka.github.io/online-pl0-interpreter](https://richardlipka.github.io/online-pl0-interpreter/). On home.zcu.cz the copy `../pl0/` next to the analyser is used instead.
- *Used in:* `ui/views/RecursiveDescentView.tsx` (`PL0_INTERPRETER_URL`, `pl0InterpreterUrl`). The P-code of recursive descent and recursive ascent opens there with its input (`#code_b64=…&input=…`).

---

## 4. The LR family

### Knuth (1965)
- D. E. Knuth: *On the translation of languages from left to right*. Information and Control 8(6), 607–639, 1965. [doi:10.1016/S0019-9958(65)90426-2](https://doi.org/10.1016/S0019-9958(65)90426-2)
- *Used in:* `ui/views/LRView.tsx`, `ui/views/AutomatonGraphView.tsx`, `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts` (LR(0) and canonical LR(1)).

### DeRemer (1969)
- F. L. DeRemer: *Practical Translators for LR(k) Languages*. Ph.D. thesis, MIT, 1969. [hdl.handle.net/1721.1/13628](https://hdl.handle.net/1721.1/13628) (MIT DSpace)
- *Used in:* `ui/views/LRView.tsx`, `ui/views/AutomatonGraphView.tsx`, `core/processor/transformationInfo.ts` (SLR and LALR).

### DeRemer (1971)
- F. L. DeRemer: *Simple LR(k) grammars*. Communications of the ACM 14(7), 453–460, 1971. [doi:10.1145/362619.362625](https://doi.org/10.1145/362619.362625)
- *Used in:* `ui/views/LRView.tsx`, `core/processor/transformationInfo.ts`.

### Aho & Johnson (1974)
- A. V. Aho, S. C. Johnson: *LR parsing*. ACM Computing Surveys 6(2), 99–124, 1974. [doi:10.1145/356628.356629](https://doi.org/10.1145/356628.356629)
- *Used in:* `ui/views/LRView.tsx`.

### Aho, Johnson & Ullman (1975)
- A. V. Aho, S. C. Johnson, J. D. Ullman: *Deterministic parsing of ambiguous grammars*. Communications of the ACM 18(8), 441–452, 1975. [doi:10.1145/360933.360969](https://doi.org/10.1145/360933.360969)
- *Used in:* `ui/views/LRView.tsx` (precedence and associativity resolve shift/reduce conflicts, as in Yacc/Bison: `%left`, `%right`, `%nonassoc`, `%prec`; implemented in `core/lr/lrTable.ts`).

### Pager (1977)
- D. Pager: *A practical general method for constructing LR(k) parsers*. Acta Informatica 7(3), 249–268, 1977. [doi:10.1007/BF00290336](https://doi.org/10.1007/BF00290336)
- *Used in:* `ui/views/LRView.tsx`, `ui/views/AutomatonGraphView.tsx`, `core/processor/transformationInfo.ts`.
- *Note:* cited as background on merging LR(1) states. The app does not implement Pager's weak compatibility.

### DeRemer & Pennello (1982)
- F. DeRemer, T. Pennello: *Efficient computation of LALR(1) look-ahead sets*. ACM TOPLAS 4(4), 615–649, 1982. [doi:10.1145/69622.357187](https://doi.org/10.1145/69622.357187)
- *Used in:* `ui/views/LRView.tsx`.
- *Note:* the app computes LALR(1) by the propagation algorithm of the Dragon Book (Alg. 4.62/4.63), not by the relations of this paper.

### Denny & Malloy (2008, 2010): IELR(1)
- J. E. Denny, B. A. Malloy: *IELR(1): practical LR(1) parser tables for non-LR(1) grammars with conflict resolution*. Proc. 2008 ACM Symposium on Applied Computing (SAC '08), 240–245, 2008. [doi:10.1145/1363686.1363747](https://doi.org/10.1145/1363686.1363747)
- J. E. Denny, B. A. Malloy: *The IELR(1) algorithm for generating minimal LR(1) parser tables for non-LR(1) grammars with conflict resolution*. Science of Computer Programming 75(11), 943–979, 2010. [doi:10.1016/j.scico.2009.08.001](https://doi.org/10.1016/j.scico.2009.08.001)
- *Used in:* 2008: `core/processor/transformationInfo.ts`. 2010: `ui/views/LRView.tsx`, `ui/views/AutomatonGraphView.tsx`, `core/processor/transformationInfo.ts`, `core/teaching/teachingGuideData.ts`, and the comments of `core/lr/lrAutomaton.ts` and `core/analysisJob.ts`.
- *Note:* the app does **not** implement Denny & Malloy's algorithm, which starts from LALR(1), annotates the inadequacies and splits states without building canonical LR(1). `buildIELR1Automaton` builds canonical LR(1) and merges the states with equal cores wherever no action changes after conflict resolution. Conflicts are resolved by precedence and associativity, otherwise by Bison's defaults: shift before reduce, and the earlier rule in a reduce/reduce conflict. The parser then behaves like canonical LR(1) after conflict resolution, as the paper requires, but the split is greedy and not guaranteed to be minimal (REVIEW §28).

### Isradisaikul & Myers (2015): counterexamples for conflicts
- C. Isradisaikul, A. C. Myers: *Finding counterexamples from parsing conflicts*. Proc. 36th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '15), 555–564, 2015. [doi:10.1145/2737924.2737961](https://doi.org/10.1145/2737924.2737961); author copy [cs.cornell.edu/andru/papers/cupex/cupex.pdf](https://www.cs.cornell.edu/andru/papers/cupex/cupex.pdf)
- *Used in:* `core/lr/lrCounterexample.ts`, `ui/components/ConflictCounterexample.tsx`, `ui/views/LRView.tsx`, `ui/views/AutomatonGraphView.tsx` (the code links the author copy).
- *Note:* the app has unifying counterexamples (one word with two trees that part at the conflict) and non-unifying ones (two derivations with a common prefix up to the conflict, on the lookahead-sensitive graph of §4 of the paper). The unifying search reuses the bounded ambiguity search instead of the paper's product parser (REVIEW §30, §34). The DOI landing page answered automated requests with 403. It was checked through Crossref.

### GNU Bison manual
- *GNU Bison – The Yacc-compatible Parser Generator* (manual of Bison 3.8.1): [gnu.org/software/bison/manual](https://www.gnu.org/software/bison/manual/). The relevant pages are [Counterexamples](https://www.gnu.org/software/bison/manual/html_node/Counterexamples.html) (`-Wcounterexamples`, citing Isradisaikul & Myers) and [LR Table Construction](https://www.gnu.org/software/bison/manual/html_node/LR-Table-Construction.html) (`%define lr.type ielr`).
- *Used in:* the Yacc/Bison input format (`core/parser/grammarParser.ts`); conflict resolution by precedence and the default resolutions (`core/lr/lrTable.ts`, `core/lr/lrParser.ts`, `core/lr/lrAutomaton.ts`); counterexamples (`core/lr/lrCounterexample.ts`, `ui/components/ConflictCounterexample.tsx`); the presets in Bison style (`core/presets/presetGrammars.ts`).

---

## 5. General context-free parsing

### Earley parsing

#### Earley (1970)
- J. Earley: *An efficient context-free parsing algorithm*. Communications of the ACM 13(2), 94–102, 1970. [doi:10.1145/362007.362035](https://doi.org/10.1145/362007.362035)
- *Used in:* `core/earley/earleyParser.ts`, `core/earley/earleyExplain.ts`, `ui/views/MembershipView.tsx`, `ui/visualizer/ETTPGraphVisualizer.tsx`.
- *Note:* the paper gives O(n³) in general, O(n²) for unambiguous grammars, and O(n) for a large class, his bounded-state grammars, with look-ahead. The simulated algorithm has no look-ahead (REVIEW §28–29).

#### Leo (1991)
- J. M. I. M. Leo: *A general context-free parsing algorithm running in linear time on every LR(k) grammar without using lookahead*. Theoretical Computer Science 82(1), 165–176, 1991. [doi:10.1016/0304-3975(91)90180-A](https://doi.org/10.1016/0304-3975(91)90180-A)
- *Used in:* `core/earley/earleyParser.ts`, `core/earley/earleyExplain.ts`, `core/earley/earleyTrees.ts`, `ui/views/EarleyView.tsx` (the switch "Leo's transitive items").
- *Note:* the paper is paywalled and was not read. The definitions follow Kegler's account (next entry), see REVIEW §29.

#### Kegler (2019): Marpa
- J. Kegler: *Marpa, a practical general parser: the recognizer*. arXiv:1910.08129, 2019. [arxiv.org/abs/1910.08129](https://arxiv.org/abs/1910.08129)
- *Used in:* `core/earley/earleyParser.ts`, `core/earley/earleyExplain.ts` (Section 7: Leo items as triples, and the Leo stack expansion that rebuilds the skipped items for the trees).

#### Aycock & Horspool (2002)
- J. Aycock, R. N. Horspool: *Practical Earley parsing*. The Computer Journal 45(6), 620–630, 2002. [doi:10.1093/comjnl/45.6.620](https://doi.org/10.1093/comjnl/45.6.620)
- *Used in:* `core/earley/earleyParser.ts`, `core/earley/earleyExplain.ts`, `core/earley/ettpParser.ts`, `ui/views/EarleyView.tsx`, `ui/visualizer/ETTPGraphVisualizer.tsx`.
- *Note:* the fix for ε-rules (the predictor moves the dot over nullable non-terminals, so the completer misses no item), and the LR(0)ε automaton in its split form with kernel and predicted states. The ETTP simulator follows this split form. The Crossref record lists only the first author.

#### Scott & Johnstone (2025/2026): ETTP
- E. Scott, A. Johnstone: *Earley table traversing parsers*. Science of Computer Programming 247, 103335, 2026 (issue of January 2026, online 2025). [doi:10.1016/j.scico.2025.103335](https://doi.org/10.1016/j.scico.2025.103335)
- *Used in:* `core/earley/ettpParser.ts`, `core/earley/earleyExplain.ts`, `ui/visualizer/ETTPGraphVisualizer.tsx`; named in `core/earley/earleyCompatibility.ts`, `ui/views/EarleyView.tsx` and the tab tooltip.
- *Note:* only the abstract could be read (ScienceDirect and SSRN are behind bot checks, REVIEW §28). The implementation is therefore an Earley recogniser over a precomputed table with pairs (q, j), built on the split automaton of Aycock & Horspool. It has kernel states (the origin j of the pair) and predicted states (origin = the index of the current set), joined by a precomputed ε-link. Its correctness is checked against an independent Earley oracle. Claims about run-time savings are attributed to the authors' experiments. The app does not claim them.

### GLL and binary subtree sets

#### Scott & Johnstone (2010)
- E. Scott, A. Johnstone: *GLL parsing*. Electronic Notes in Theoretical Computer Science 253(7), 177–189, 2010 (LDTA 2009). [doi:10.1016/j.entcs.2010.08.041](https://doi.org/10.1016/j.entcs.2010.08.041)
- *Used in:* `core/gll/gllParser.ts`, `core/gll/gllExplain.ts`, `ui/views/GLLView.tsx`, `ui/visualizer/GLLGSSVisualizer.tsx`.

#### Scott & Johnstone (2013)
- E. Scott, A. Johnstone: *GLL parse-tree generation*. Science of Computer Programming 78(10), 1828–1844, 2013. [doi:10.1016/j.scico.2012.03.005](https://doi.org/10.1016/j.scico.2012.03.005). Submitted manuscript: [pure.royalholloway.ac.uk/files/25269152/GLLsubmit.pdf](https://pure.royalholloway.ac.uk/files/25269152/GLLsubmit.pdf). The repository answered 403 (bot check) on 2026-10-22 and was checked in REVIEW §31–32.
- *Used in:* `core/gll/gllParser.ts`, `core/gll/gllExplain.ts`, `core/forest/sppf.ts` (GSS nodes (L, i), the binarised SPPF).

#### Scott, Johnstone & van Binsbergen (2019)
- E. Scott, A. Johnstone, L. T. van Binsbergen: *Derivation representation using binary subtree sets*. Science of Computer Programming 175, 63–84, 2019. [doi:10.1016/j.scico.2019.01.008](https://doi.org/10.1016/j.scico.2019.01.008). Accepted manuscript: [pure.royalholloway.ac.uk/files/33174042/Accepted_Manuscript.pdf](https://pure.royalholloway.ac.uk/files/33174042/Accepted_Manuscript.pdf) (403 on 2026-10-22, see above).
- *Used in:* `core/gll/bsr.ts`, `core/gll/gllParser.ts`, `core/gll/gllExplain.ts`, `core/forest/sppf.ts`.
- *Note:* the paper's own parser is the clustered form (CNP). The app keeps the GSS of 2010/2013 and calls `bsrAdd` in place of `getNodeT`/`getNodeP`, the correspondence drawn in §5.5 of the paper (REVIEW §31).

#### Johnstone (2023)
- A. Johnstone: *A reference GLL implementation*. Proc. 16th ACM SIGPLAN International Conference on Software Language Engineering (SLE '23), 43–55, 2023. [doi:10.1145/3623476.3623521](https://doi.org/10.1145/3623476.3623521). Author copy: [pure.royalholloway.ac.uk/files/56267014/sle23RefGLL.pdf](https://pure.royalholloway.ac.uk/files/56267014/sle23RefGLL.pdf) (403 on 2026-10-22).
- *Used in:* `core/gll/gllExplain.ts`.
- *Note:* the work is by Johnstone alone. The earlier remark that it has no look-ahead test could not be checked against the paper and was removed (REVIEW §34).

### GLR and shared packed forests

#### Tomita (1985, 1986)
- M. Tomita: *An efficient context-free parsing algorithm for natural languages*. Proc. 9th International Joint Conference on Artificial Intelligence (IJCAI 1985), Vol. 2, 1985. [ijcai.org/Proceedings/85-2/Papers/014.pdf](https://www.ijcai.org/Proceedings/85-2/Papers/014.pdf). The PDF was checked: it introduces the graph-structured stack and the "shared-packed forest".
- M. Tomita: *Efficient Parsing for Natural Language: A Fast Algorithm for Practical Systems*. Kluwer, Boston, 1986. [doi:10.1007/978-1-4757-1885-0](https://doi.org/10.1007/978-1-4757-1885-0)
- *Used in:* the book: `ui/views/LRView.tsx`, `core/gll/gllExplain.ts`, `core/lr/glrParser.ts`, `core/forest/sppf.ts`, `ui/visualizer/GSSGraphVisualizer.tsx`, `ui/views/GLLView.tsx`. The IJCAI paper is not cited in the app.
- *Note:* the GLR panel of the LR tab (`core/lr/glrParser.ts`) is Tomita-style GLR over the chosen LR table, with a graph-structured stack that forks on conflicts and merges equal states. The "by rules" form of the forest (`core/forest/sppf.ts`) is Tomita's shared-packed forest. Crossref dates the book 1986, and the app cites it as "Tomita (1986)" everywhere (REVIEW §32). 1985 is the year of the IJCAI paper.

#### Rekers (1992)
- J. Rekers: *Parser Generation for Interactive Environments*. Ph.D. thesis, University of Amsterdam, 1992. [ir.cwi.nl/pub/29930](https://ir.cwi.nl/pub/29930)
- *Used in:* `core/lr/glrParser.ts`, `core/forest/sppf.ts` (the thesis speaks of a "parse forest").

#### Scott & Johnstone (2006): RNGLR
- E. Scott, A. Johnstone: *Right nulled GLR parsers*. ACM TOPLAS 28(4), 577–618, 2006. [doi:10.1145/1146809.1146810](https://doi.org/10.1145/1146809.1146810)
- *Used in:* `ui/views/LRView.tsx`, `core/lr/glrParser.ts`, `ui/visualizer/GSSGraphVisualizer.tsx`; named in `core/gll/gllExplain.ts`.
- *Note:* cited as the GLR algorithm for all context-free grammars. The app's GLR does not use right-nulled tables.

#### Scott, Johnstone & Economopoulos (2007): BRNGLR
- E. Scott, A. Johnstone, R. Economopoulos: *BRNGLR: a cubic Tomita-style GLR parsing algorithm*. Acta Informatica 44(6), 427–461, 2007. [doi:10.1007/s00236-007-0054-z](https://doi.org/10.1007/s00236-007-0054-z)
- *Used in:* named only in `core/gll/gllExplain.ts`, as one of the parsers compared by Vo et al. It is not implemented.

### CYK and the complexity of recognition

#### Kasami (1965)
- T. Kasami: *An efficient recognition and syntax-analysis algorithm for context-free languages*. Scientific Report AFCRL-65-758, Air Force Cambridge Research Laboratory, Bedford, MA, 1965. DTIC record [AD0631692](https://apps.dtic.mil/sti/citations/AD0631692). The site was under maintenance on 2026-10-22, and the link was checked in REVIEW §32.
- *Used in:* `ui/views/MembershipView.tsx`, `core/parser/cyk.ts`.
- *Note:* the "CSL Report R-257, University of Illinois" cited elsewhere could not be found (REVIEW §32).

#### Younger (1967)
- D. H. Younger: *Recognition and parsing of context-free languages in time n³*. Information and Control 10(2), 189–208, 1967. [doi:10.1016/S0019-9958(67)80007-X](https://doi.org/10.1016/S0019-9958(67)80007-X)
- *Used in:* `ui/views/MembershipView.tsx`, `core/parser/cyk.ts`.

#### Cocke & Schwartz (1970)
- J. Cocke, J. T. Schwartz: *Programming Languages and Their Compilers: Preliminary Notes*. 2nd revised version, Courant Institute of Mathematical Sciences, New York University, April 1970. [PDF at the Software Preservation Group](https://softwarepreservation.computerhistory.org/SETL/precursors/Cocke_Schwartz-Programming_Languages_and_Their_Compilers-1970.pdf). The title page of the PDF was checked.
- *Used in:* `ui/views/MembershipView.tsx`, `core/parser/cyk.ts`.

#### Valiant (1975)
- L. G. Valiant: *General context-free recognition in less than cubic time*. Journal of Computer and System Sciences 10(2), 308–315, 1975. [doi:10.1016/S0022-0000(75)80046-8](https://doi.org/10.1016/S0022-0000(75)80046-8)
- *Used in:* named only in `core/gll/gllExplain.ts`, as one of the parsers compared by Vo et al. It is not implemented.

#### Abboud, Backurs & Vassilevska Williams (2018)
- A. Abboud, A. Backurs, V. Vassilevska Williams: *If the current clique algorithms are optimal, so is Valiant's parser*. SIAM Journal on Computing 47(6), 2527–2555, 2018. [doi:10.1137/16M1061771](https://doi.org/10.1137/16M1061771). Conference version: FOCS 2015, 98–117, [doi:10.1109/FOCS.2015.16](https://doi.org/10.1109/FOCS.2015.16).
- *Used in:* not cited in the app. It is the conditional lower bound for Valiant's method: no general recogniser can be much faster unless the clique algorithms improve.

### Empirical comparison

#### Vo, Liyanage, Kang, Rubin & Gopinath (2026)
- H. Vo, D. Liyanage, H. J. Kang, S. Rubin, R. Gopinath: *An empirical comparison of general context-free parsers*. arXiv:2606.08465, 2026. [arxiv.org/abs/2606.08465](https://arxiv.org/abs/2606.08465)
- *Used in:* `core/gll/gllExplain.ts`.
- *Note:* CYK, Valiant, Earley, GLL, RNGLR and BRNGLR measured on the same grammars, with LL(1) and LR(1) baselines. It was the reason for adding GLL next to Earley and GLR (REVIEW §31).

---

## 6. ALL(*)

### Parr & Fisher (2011)
- T. Parr, K. Fisher: *LL(\*): the foundation of the ANTLR parser generator*. Proc. 32nd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '11), 425–436, 2011. [doi:10.1145/1993498.1993548](https://doi.org/10.1145/1993498.1993548)
- *Used in:* `ui/views/ALLView.tsx`.

### Parr, Harwell & Fisher (2014)
- T. Parr, S. Harwell, K. Fisher: *Adaptive LL(\*) parsing: the power of dynamic analysis*. Proc. 2014 ACM International Conference on Object Oriented Programming Systems Languages & Applications (OOPSLA '14), 579–598, 2014. [doi:10.1145/2660193.2660202](https://doi.org/10.1145/2660193.2660202)
- *Used in:* `ui/views/ALLView.tsx`, `core/all/allAtn.ts`, `core/all/allPredictor.ts`, `core/all/allParser.ts`, `ui/visualizer/LookaheadDFAGraphVisualizer.tsx`.
- *Note:* the predictor follows Functions 2–9 of the paper. It does SLL prediction with the DFA cache, detects conflicts, falls back to full-LL prediction with the parser's real stack, and resolves an ambiguity by the minimal alternative only after an LL conflict. Left recursion of any kind gives "not applicable", and reaching a limit gives "undecided". The app has no graph-structured stack, so a closure is capped, and ANTLR's two-stage SLL-then-LL parse is not simulated (REVIEW §28). The section numbers in `ALLView.tsx` follow the paper.

---

## 7. Recursive ascent

All DOIs were checked against Crossref. Only Horspool's report was read in full. What the app says about the other works follows Horspool's §5.2–5.3 (REVIEW §33).

### Horspool (1991, 1993)
- R. N. Horspool: *Recursive ascent-descent parsing*. Computer Languages 18(1), 1–15, 1993. [doi:10.1016/0096-0551(93)90027-X](https://doi.org/10.1016/0096-0551(93)90027-X). Read as the report of 11 June 1991 on the author's page: [webhome.cs.uvic.ca/~nigelh/Publications/rad.pdf](https://webhome.cs.uvic.ca/~nigelh/Publications/rad.pdf). The journal version may differ in details.
- Related: R. N. Horspool: *Recursive ascent-descent parsers*. Compiler Compilers (CC '90), LNCS 477, 1–10, 1991. [doi:10.1007/3-540-53669-8_70](https://doi.org/10.1007/3-540-53669-8_70). Not cited in the app.
- *Used in:* `core/codegen/recursiveAscent.ts`, `core/codegen/recursiveAscentActions.ts`, `ui/views/RecursiveAscentView.tsx`.
- *Note:* §5.2 is the scheme of the app. There is one procedure per LR state, a `while` loop over the gotos, and a reduction that sets the non-terminal and returns through |α| procedures (Horspool's `return* k`, simulated by a count). §5.3 describes recursive ascent-descent, which the tab explains in its notes.

### Roberts (1988, 1989)
- G. H. Roberts: *Recursive ascent: an LR analog to recursive descent*. ACM SIGPLAN Notices 23(8), 23–29, 1988. [doi:10.1145/47907.47909](https://doi.org/10.1145/47907.47909)
- G. H. Roberts: *Another note on recursive ascent*. Information Processing Letters 32(5), 263–266, 1989. [doi:10.1016/0020-0190(89)90054-9](https://doi.org/10.1016/0020-0190(89)90054-9). Horspool's list gives 1990.
- *Used in:* `core/codegen/recursiveAscent.ts`, `ui/views/RecursiveAscentView.tsx`.

### Kruseman Aretz (1988)
- F. E. J. Kruseman Aretz: *On a recursive ascent parser*. Information Processing Letters 29(4), 201–206, 1988. [doi:10.1016/0020-0190(88)90061-0](https://doi.org/10.1016/0020-0190(88)90061-0)
- *Used in:* `core/codegen/recursiveAscent.ts`, `ui/views/RecursiveAscentView.tsx`.

### Barnard & Cordy (1988)
- D. T. Barnard, J. R. Cordy: *SL parses the LR languages*. Computer Languages 13(2), 65–74, 1988. [doi:10.1016/0096-0551(88)90010-0](https://doi.org/10.1016/0096-0551(88)90010-0)
- *Used in:* named in `ui/views/RecursiveAscentView.tsx`. Horspool cites it among the sources of recursive ascent.

### Leermakers, Augusteijn & Kruseman Aretz (1992)
- R. Leermakers, L. Augusteijn, F. E. J. Kruseman Aretz: *A functional LR parser*. Theoretical Computer Science 104(2), 313–323, 1992. [doi:10.1016/0304-3975(92)90128-3](https://doi.org/10.1016/0304-3975(92)90128-3)
- *Used in:* `core/codegen/recursiveAscent.ts`, `ui/views/RecursiveAscentView.tsx`.

### Pennello (1986): a directly executed LR parser, not recursive ascent
- T. J. Pennello: *Very fast LR parsing*. SIGPLAN '86 Symposium on Compiler Construction, ACM SIGPLAN Notices 21(7), 145–151, 1986. [doi:10.1145/13310.13326](https://doi.org/10.1145/13310.13326)
- *Used in:* `ui/views/RecursiveAscentView.tsx`; named in `ui/views/LRView.tsx`.
- *Note:* Horspool counts it among the *other* directly executed LR parsers, which are faster than recursive ascent and much smaller. It is cited that way and not as recursive ascent.

### Demers (1977); Purdom & Brown (1980)
- A. J. Demers: *Generalized left corner parsing*. POPL '77, 170–182, 1977. [doi:10.1145/512950.512966](https://doi.org/10.1145/512950.512966)
- P. Purdom, C. A. Brown: *Semantic routines and LR(k) parsers*. Acta Informatica 14(4), 1980. [doi:10.1007/BF00286489](https://doi.org/10.1007/BF00286489). Crossref gives no pages.
- *Used in:* named, without links, in `ui/views/RecursiveAscentView.tsx` (Demers: the basis of Horspool's ascent-descent) and in `core/codegen/recursiveAscentActions.ts` and `ui/views/RecursiveAscentView.tsx` (Purdom & Brown: free positions for semantic actions). Both are cited after Horspool and were not read.

---

## 8. Error recovery

### Panic mode in the Dragon Book
- Aho, Lam, Sethi & Ullman (2006), see section 1: §4.4.5 (error recovery in predictive parsing, synchronising sets from FIRST and FOLLOW) and §4.8.3 (error recovery in LR parsing: pop to a state with a goto on A, skip to a symbol of FOLLOW(A)).
- *Used in:* `core/analyser/errorRecovery.ts` (`recoverySets`), `core/ll/llParser.ts` and `core/lr/lrParser.ts` (option `recovery`), `core/codegen/recursiveAscentSimulator.ts`, `ui/components/ErrorRecovery.tsx`.

### Wirth's stop symbols
- Wirth (1976), see section 3, and the KIV/FJP lecture 3 (section 9). Each procedure gets the set of symbols that may follow it. On an error, the input is skipped to a symbol of the start set or of the stop set (the procedure `test`).
- *Used in:* `core/codegen/rdSimulator.ts` (panic mode of the recursive-descent simulator), `core/analyser/errorRecovery.ts`, `ui/components/ErrorRecovery.tsx`.

### Diekmann & Tratt (2020): further work
- L. Diekmann, L. Tratt: *Don't panic! Better, fewer, syntax errors for LR parsers*. 34th European Conference on Object-Oriented Programming (ECOOP 2020), LIPIcs 166, 6:1–6:32, 2020. [doi:10.4230/LIPIcs.ECOOP.2020.6](https://doi.org/10.4230/LIPIcs.ECOOP.2020.6) (metadata from DataCite).
- *Used in:* not cited in the app. CPCT+, a repair-sequence recovery for LR parsers, is a candidate for further work next to the panic mode of the LR and recursive-ascent simulators.

---

## 9. Course materials

### Ježek: lectures of KIV/FJP
- K. Ježek: *Formální jazyky a překladače* (Formal Languages and Compilers), lectures. KIV FAV ZČU. Index: [kiv.zcu.cz/~jezek_ka/vyuka/FJP/](https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/), lectures under [Přednášky](https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/P%f8edn%e1%9aky/). The directory name is encoded in Windows-1250.
  - Lecture 3, *Syntaktická analýza metodou rekurzivního sestupu* (recursive descent): [3 Syntak anal.pdf](https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/P%f8edn%e1%9aky/3/3%20Syntak%20anal.pdf). It covers error handling in PL/0: panic mode, stop symbols and the procedure `Test`. Cited as "lecture 3" without a link in `core/analyser/errorRecovery.ts` and `core/codegen/rdSimulator.ts`.
  - Lecture 8, *Bezkontextové gramatiky* (context-free grammars): [8 BKG.DOC.pdf](https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/P%f8edn%e1%9aky/8/8%20BKG.DOC.pdf). Used in `core/processor/transformationInfo.ts` (`jezek8`).
  - Lectures 9 and 10, *LL(k) gramatiky*: [9 a 10 LLk.pdf](https://www.kiv.zcu.cz/~jezek_ka/vyuka/FJP/P%f8edn%e1%9aky/9a10/9%20a%2010%20%20LLk.pdf). Used in `core/processor/transformationInfo.ts` (`jezek910`) and `core/processor/ll1Transformer.ts`.
  - The LR lectures (*11 a 12 LR*) were the source of the lecture layout of the LR tables (REVIEW §6). The app does not link them.

### Vavrečková: LL translation slides
- Š. Vavrečková: *Překladače – LL překlady* (prezentace 5). Slezská univerzita v Opavě. [prekl_05_LL.pdf](https://vavreckova.zam.slu.cz/obsahy/prekl/prezentace/prekl_05_LL.pdf)
- *Used in:* `core/processor/transformationInfo.ts`.
- *Note:* the server refused the connection on 2026-10-22. The link is kept from REVIEW §7 and §32.

### Cockett: Transformations to LL(1)
- R. Cockett: *CPSC 411 Compiler Construction I – Transformations to LL(1)*. University of Calgary. [pages.cpsc.ucalgary.ca/~robin/class/411/LL1.3.html](http://pages.cpsc.ucalgary.ca/~robin/class/411/LL1.3.html). The page now redirects to https.
- *Used in:* `core/processor/ll1Transformer.ts` (the order of the steps of the automatic LL(1) attempt), `core/processor/transformationInfo.ts`, `ui/views/TransformationsView.tsx`.

---

## 10. Further reading: semantic analysis and name binding

The symbol table of the recursive-descent and recursive-ascent tabs is a demonstration with a stack of scopes and actions found by keywords (REVIEW §24–26, §33.1). The following works show how semantic analysis and name binding are specified in general. The application does not cite them.

- D. E. Knuth: *Semantics of context-free languages*. Mathematical Systems Theory 2(2), 127–145, 1968. [doi:10.1007/BF01692511](https://doi.org/10.1007/BF01692511). Attribute grammars.
- G. Hedin: *Reference attributed grammars*. Informatica (Slovenia) 24(3), 301–317, 2000. No DOI. Lund University record: [lup.lub.lu.se/record/107069](https://lup.lub.lu.se/record/107069). Attributes that refer to nodes of the tree, used for name and type analysis.
- T. Ekman, G. Hedin: *The JastAdd system – modular extensible compiler construction*. Science of Computer Programming 69(1–3), 14–26, 2007. [doi:10.1016/j.scico.2007.02.003](https://doi.org/10.1016/j.scico.2007.02.003). See also T. Ekman, G. Hedin: *The JastAdd extensible Java compiler*, OOPSLA 2007, 1–18, [doi:10.1145/1297027.1297029](https://doi.org/10.1145/1297027.1297029).
- G. Konat, L. Kats, G. Wachsmuth, E. Visser: *Declarative name binding and scope rules* (NaBL). Software Language Engineering (SLE 2012), LNCS 7745, 311–331, Springer, 2013. [doi:10.1007/978-3-642-36089-3_18](https://doi.org/10.1007/978-3-642-36089-3_18)
- P. Neron, A. Tolmach, E. Visser, G. Wachsmuth: *A theory of name resolution* (scope graphs). Programming Languages and Systems (ESOP 2015), LNCS 9032, 205–231, 2015. [doi:10.1007/978-3-662-46669-8_9](https://doi.org/10.1007/978-3-662-46669-8_9)
- H. van Antwerpen, C. Bach Poulsen, A. Rouvoet, E. Visser: *Scopes as types* (Statix). Proceedings of the ACM on Programming Languages 2(OOPSLA), 2018. [doi:10.1145/3276484](https://doi.org/10.1145/3276484). Crossref gives the pages as 1–30.

---

## Maintenance

When a citation is added to the code, add it here with its link and the files that use it. Check a DOI against its Crossref record (`https://api.crossref.org/works/<doi>`) and not only by resolving it, because a wrong DOI also resolves, to the wrong work. For a page without a DOI, compare the page title with the citation.
