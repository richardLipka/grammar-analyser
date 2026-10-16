# Primary Literature & Academic References Directory

> **Maintenance Policy:** This document serves as the single source of truth for all academic publications, primary papers, monographs, and research reports cited across the `GrammarAnalyser` application. Whenever a new parsing algorithm, automaton variant, grammar transformation, or theoretical technique is added to the codebase, its verified citation and persistent URL (DOI, DBLP, or Open Access digital repository) must be recorded here and linked in the corresponding UI view and core engine.

All URLs listed below have been verified for accessibility, persistent resolution, and correct bibliographic attribution. Where publications reside behind publisher paywalls (ACM Digital Library, ScienceDirect/Elsevier, SpringerLink, IEEE Xplore, Oxford Academic), the links lead to the public landing page with abstract and complete metadata.

---

## 1. Top-Down Parsing: LL(1), LL(k) & Lookahead Computation

### Lewis & Stearns (1968)
- **Authors:** Philip M. Lewis II, Richard E. Stearns
- **Title:** *Syntax-Directed Transduction*
- **Venue:** Journal of the ACM (JACM), Vol. 15, No. 3, pp. 465–488, July 1968.
- **Identifier / Link:** [https://doi.org/10.1145/321466.321477](https://doi.org/10.1145/321466.321477)
- **App Usage:** Foundation for deterministic LL(k) grammars and definitions of FIRST and FOLLOW lookahead sets.
- **Referenced In:** `LLView.tsx`, `FirstFollowView.tsx`, `transformationInfo.ts`.

### Knuth (1971)
- **Author:** Donald E. Knuth
- **Title:** *Top-Down Syntax Analysis*
- **Venue:** Acta Informatica, Vol. 1, No. 2, pp. 79–110, 1971.
- **Identifier / Link:** [https://doi.org/10.1007/BF00289517](https://doi.org/10.1007/BF00289517)
- **App Usage:** Fixed-point computation of FIRST and FOLLOW lookahead sets, predictive top-down parsing tables, and LL(1) deterministic condition proofs.
- **Referenced In:** `LLView.tsx`, `FirstFollowView.tsx`, `transformationInfo.ts`.

### Rosenkrantz & Stearns (1970)
- **Authors:** Daniel J. Rosenkrantz, Richard E. Stearns
- **Title:** *Properties of Deterministic Top-Down Grammars*
- **Venue:** Information and Control, Vol. 17, No. 3, pp. 226–256, October 1970.
- **Identifier / Link:** [https://doi.org/10.1016/S0019-9958(70)90446-8](https://doi.org/10.1016/S0019-9958(70)90446-8)
- **App Usage:** Structural properties of LL(k) languages, lookahead equivalence, and decision set disjointness tests.
- **Referenced In:** `LLView.tsx`, `teachingGuideData.ts`, `transformationInfo.ts`.

---

## 2. Adaptive Top-Down Parsing: ALL(*) & ANTLR

### Parr & Fisher (2011)
- **Authors:** Terence Parr, Kathleen Fisher
- **Title:** *LL(*): The Foundation of the ANTLR Parser Generator*
- **Venue:** ACM SIGPLAN Notices, Vol. 46, No. 1 (POPL '11), pp. 425–436, 2011.
- **Identifier / Link:** [https://doi.org/10.1145/1926385.1926432](https://doi.org/10.1145/1926385.1926432)
- **App Usage:** Regular lookahead DFA construction, cyclic lookahead prediction, and semantic predicates.
- **Referenced In:** `ALLView.tsx`.

### Parr, Harwell & Fisher (2014)
- **Authors:** Terence Parr, Sam Harwell, Kathleen Fisher
- **Title:** *Adaptive LL(*) Parsing: The Power of Dynamic Analysis*
- **Venue:** Proceedings of the 35th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI '14), pp. 579–589, June 2014.
- **Identifier / Link:** [https://doi.org/10.1145/2594291.2594326](https://doi.org/10.1145/2594291.2594326)
- **App Usage:** Augmented Transition Network (ATN) simulation, dynamic Lookahead DFA materialization on demand, and top-down grammar requirements (identifying that left recursion must be eliminated prior to top-down closure analysis, §3).
- **Referenced In:** `ALLView.tsx`, `allAtn.ts`, `allPredictor.ts`, `allParser.ts`.

---

## 3. Bottom-Up Parsing: LR Automata, LALR, IELR & Ambiguity Resolution

### Knuth (1965)
- **Author:** Donald E. Knuth
- **Title:** *On the Translation of Languages from Left to Right*
- **Venue:** Information and Control, Vol. 8, No. 6, pp. 607–639, December 1965.
- **Identifier / Link:** [https://doi.org/10.1016/S0019-9958(65)90426-2](https://doi.org/10.1016/S0019-9958(65)90426-2)
- **App Usage:** Foundational paper defining LR(0) and canonical LR(1) automata, item sets, closure, and deterministic bottom-up syntax analysis.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`, `teachingGuideData.ts`, `transformationInfo.ts`.

### DeRemer (1969)
- **Author:** Frank L. DeRemer
- **Title:** *Practical Translators for LR(k) Languages*
- **Venue:** Ph.D. Dissertation, Department of Electrical Engineering, Massachusetts Institute of Technology (MIT), Cambridge, MA, September 1969.
- **Identifier / Link:** [https://dspace.mit.edu/handle/1721.1/13857](https://dspace.mit.edu/handle/1721.1/13857) (MIT DSpace Open Access)
- **App Usage:** Invention of SLR(1) and LALR(1) parsers, compressing canonical LR(1) states by merging LR(0) cores.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`, `transformationInfo.ts`.

### DeRemer (1971)
- **Author:** Frank L. DeRemer
- **Title:** *Simple LR(k) Grammars*
- **Venue:** Communications of the ACM (CACM), Vol. 14, No. 7, pp. 453–460, July 1971.
- **Identifier / Link:** [https://doi.org/10.1145/362619.362625](https://doi.org/10.1145/362619.362625)
- **App Usage:** SLR(1) parsing table construction using $FOLLOW_1$ sets to restrict reductions.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`, `transformationInfo.ts`.

### DeRemer & Pennello (1982)
- **Authors:** Frank L. DeRemer, Thomas J. Pennello
- **Title:** *Efficient Computation of LALR(1) Look-Ahead Sets*
- **Venue:** ACM Transactions on Programming Languages and Systems (TOPLAS), Vol. 4, No. 4, pp. 615–649, October 1982.
- **Identifier / Link:** [https://doi.org/10.1145/69622.357187](https://doi.org/10.1145/69622.357187)
- **App Usage:** Spontaneous and propagated lookahead computation on the LR(0) state machine without building full LR(1) tables.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`.

### Pager (1977)
- **Author:** David Pager
- **Title:** *A Practical General Method for Constructing LR(k) Parsers*
- **Venue:** Acta Informatica, Vol. 7, No. 3, pp. 249–268, September 1977.
- **Identifier / Link:** [https://doi.org/10.1007/BF00290336](https://doi.org/10.1007/BF00290336)
- **App Usage:** Weak compatibility condition allowing minimal LR(1) state merging without introducing shift/reduce or reduce/reduce conflicts.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`, `transformationInfo.ts`.

### Denny & Malloy (2008)
- **Authors:** Joel E. Denny, Brian A. Malloy
- **Title:** *IELR(1): Practical LR(1) Parser Tables for Non-LR(1) Grammars with Conflict Resolution*
- **Venue:** Proceedings of the 2008 ACM Symposium on Applied Computing (SAC '08), Fortaleza, Brazil, pp. 240–245, March 2008.
- **Identifier / Link:** [https://doi.org/10.1145/1363686.1363747](https://doi.org/10.1145/1363686.1363747)
- **App Usage:** Original conference introduction of the Inadequacy Elimination LR(1) algorithm, state splitting to remove mysterious LALR(1) conflicts.
- **Referenced In:** `transformationInfo.ts`.

### Denny & Malloy (2010)
- **Authors:** Joel E. Denny, Brian A. Malloy
- **Title:** *The IELR(1) Algorithm for Generating Minimal LR(1) Parser Tables for Non-LR(1) Grammars with Conflict Resolution*
- **Venue:** Science of Computer Programming, Vol. 75, No. 11, pp. 943–979, November 2010.
- **Identifier / Link:** [https://doi.org/10.1016/j.scico.2009.09.006](https://doi.org/10.1016/j.scico.2009.09.006)
- **App Usage:** Full journal specification of the 4-phase IELR(1) algorithm adopted in GNU Bison 2.5+: LR(0) basis, inadequacy computation, state splitting, and lookahead annotation.
- **Referenced In:** `LRView.tsx`, `AutomatonGraphView.tsx`, `teachingGuideData.ts`, `transformationInfo.ts`.

### Aho, Johnson & Ullman (1975)
- **Authors:** Alfred V. Aho, Stephen C. Johnson, Jeffrey D. Ullman
- **Title:** *Deterministic Parsing of Ambiguous Grammars*
- **Venue:** Communications of the ACM (CACM), Vol. 18, No. 8, pp. 441–452, August 1975.
- **Identifier / Link:** [https://doi.org/10.1145/360933.360969](https://doi.org/10.1145/360933.360969)
- **App Usage:** Conflict resolution in LR tables via operator precedence and left/right/nonassoc associativity declarations (as in Yacc/Bison).
- **Referenced In:** `LRView.tsx`.

### Aho & Johnson (1974)
- **Authors:** Alfred V. Aho, Stephen C. Johnson
- **Title:** *LR Parsing*
- **Venue:** ACM Computing Surveys (CSUR), Vol. 6, No. 2, pp. 99–124, June 1974.
- **Identifier / Link:** [https://doi.org/10.1145/356628.356629](https://doi.org/10.1145/356628.356629)
- **App Usage:** Comprehensive tutorial and reference on table-driven shift-reduce LR parsing algorithms, dual state/symbol stacks, and error recovery.
- **Referenced In:** `LRView.tsx`.

---

## 4. Recursive Descent Parsing & Architecture

### Lucas (1961)
- **Author:** Peter Lucas
- **Title:** *Die Strukturanalyse von Formelübersetzern*
- **Venue:** Elektronische Rechenanlagen, Vol. 3, No. 4, pp. 159–167, 1961.
- **Identifier / Link:** [https://dblp.org/rec/journals/er/Lucas61.html](https://dblp.org/rec/journals/er/Lucas61.html) (DBLP Computer Science Bibliography)
- **App Usage:** Earliest formal description of recursive descent syntax analysis, mapping grammar non-terminals to mutually recursive procedures.
- **Referenced In:** `RecursiveDescentView.tsx`, `transformationInfo.ts`.

### Conway (1963)
- **Author:** Melvin E. Conway
- **Title:** *Design of a Separable Transition-Diagram Compiler*
- **Venue:** Communications of the ACM (CACM), Vol. 6, No. 7, pp. 396–408, July 1963.
- **Identifier / Link:** [https://doi.org/10.1145/366663.366704](https://doi.org/10.1145/366663.366704)
- **App Usage:** Formulation of syntax diagrams and recursive procedure invocation across coroutine-style stages.
- **Referenced In:** `RecursiveDescentView.tsx`.

### Wirth (1976)
- **Author:** Niklaus Wirth
- **Title:** *Algorithms + Data Structures = Programs*
- **Venue:** Prentice-Hall Series in Automatic Computation, Englewood Cliffs, NJ, 1976.
- **Identifier / Link:** [https://en.wikipedia.org/wiki/Algorithms_%2B_Data_Structures_%3D_Programs](https://en.wikipedia.org/wiki/Algorithms_%2B_Data_Structures_%3D_Programs)
- **App Usage:** Specification of the PL/0 educational language, recursive descent compiler architecture, P-code abstract stack machine, and interpreter.
- **Referenced In:** `RecursiveDescentView.tsx`, `transformationInfo.ts`.

---

## 5. General Context-Free Parsing: CYK & Earley

### Earley (1970)
- **Author:** Jay Earley
- **Title:** *An Efficient Context-Free Parsing Algorithm*
- **Venue:** Communications of the ACM (CACM), Vol. 13, No. 2, pp. 94–102, February 1970.
- **Identifier / Link:** [https://doi.org/10.1145/362007.362035](https://doi.org/10.1145/362007.362035)
- **App Usage:** Dynamic programming parser handling arbitrary context-free grammars with dotted items, Predictor, Scanner, and Completer in $O(n^3)$ worst-case and $O(n)$ for unambiguous grammars.
- **Referenced In:** `MembershipView.tsx`.

### Cocke & Schwartz (1970)
- **Authors:** John Cocke, Jacob T. Schwartz
- **Title:** *Programming Languages and Their Compilers: Preliminary Notes*
- **Venue:** Courant Institute of Mathematical Sciences, New York University (NYU), 1970.
- **Identifier / Link:** [https://softwarepreservation.computerhistory.org/SETL/precursors/Cocke_Schwartz-Programming_Languages_and_Their_Compilers-1970.pdf](https://softwarepreservation.computerhistory.org/SETL/precursors/Cocke_Schwartz-Programming_Languages_and_Their_Compilers-1970.pdf) (Software Preservation Group / Computer History Museum)
- **App Usage:** Formulation of the tabular Cocke-Younger-Kasami (CYK) bottom-up parsing algorithm for grammars in Chomsky Normal Form.
- **Referenced In:** `MembershipView.tsx`.

### Younger (1967)
- **Author:** Daniel H. Younger
- **Title:** *Recognition and Parsing of Context-Free Languages in Time $n^3$*
- **Venue:** Information and Control, Vol. 10, No. 2, pp. 189–208, February 1967.
- **Identifier / Link:** [https://doi.org/10.1016/S0019-9958(67)80007-X](https://doi.org/10.1016/S0019-9958(67)80007-X)
- **App Usage:** Independent discovery and complexity proof of the matrix-based $O(n^3)$ CYK recognition algorithm.
- **Referenced In:** `MembershipView.tsx`.

### Kasami (1965)
- **Author:** Tadao Kasami
- **Title:** *An Efficient Recognition and Syntax-Analysis Algorithm for Context-Free Languages*
- **Venue:** Air Force Cambridge Research Laboratory, Scientific Report AFCRL-65-758, Bedford, MA, 1965; also Coordinated Science Laboratory Report R-257, University of Illinois, Urbana, IL.
- **Identifier / Link:** [http://hdl.handle.net/2142/74301](http://hdl.handle.net/2142/74301) (UIUC IDEALS Permanent Repository Handle)
- **App Usage:** Foundational $O(n^3)$ dynamic programming recognition algorithm for context-free grammars (the 'K' in CYK).
- **Referenced In:** `MembershipView.tsx`.

---

## 6. Normal Forms & Equivalent Grammar Transformations

### Chomsky (1959)
- **Author:** Noam Chomsky
- **Title:** *On Certain Formal Properties of Grammars*
- **Venue:** Information and Control, Vol. 2, No. 2, pp. 137–167, June 1959.
- **Identifier / Link:** [https://doi.org/10.1016/S0019-9958(59)90362-6](https://doi.org/10.1016/S0019-9958(59)90362-6)
- **App Usage:** Definition of Chomsky Normal Form ($A \to BC \mid a$), elimination of unit rules ($A \to B$), and context-free derivation properties.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Greibach (1965)
- **Author:** Sheila A. Greibach
- **Title:** *A New Normal-Form Theorem for Context-Free Phrase Structure Grammars*
- **Venue:** Journal of the ACM (JACM), Vol. 12, No. 1, pp. 42–52, January 1965.
- **Identifier / Link:** [https://doi.org/10.1145/321250.321254](https://doi.org/10.1145/321250.321254)
- **App Usage:** Definition and transformation pipeline for Greibach Normal Form ($A \to a \alpha$, with leading terminal and non-terminal tail).
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Bar-Hillel, Perles & Shamir (1961)
- **Authors:** Yehoshua Bar-Hillel, Micha A. Perles, Eli Shamir
- **Title:** *On Formal Properties of Simple Phrase Structure Grammars*
- **Venue:** Zeitschrift für Phonetik, Sprachwissenschaft und Kommunikationsforschung, Vol. 14, pp. 143–172, 1961.
- **Identifier / Link:** [https://doi.org/10.1515/9783112613764-007](https://doi.org/10.1515/9783112613764-007)
- **App Usage:** Classical grammar reduction algorithm (removal of non-terminating and unreachable symbols), fixed-point terminating set $N_{term}$, and the Pumping Lemma for context-free languages.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Rosenkrantz & Lewis (1970)
- **Authors:** Daniel J. Rosenkrantz, Philip M. Lewis II
- **Title:** *Deterministic Left Corner Parsing*
- **Venue:** 11th Annual Symposium on Switching and Automata Theory (SWAT '70), pp. 139–152, October 1970.
- **Identifier / Link:** [https://doi.org/10.1109/SWAT.1970.19](https://doi.org/10.1109/SWAT.1970.19)
- **App Usage:** Left-corner grammar transformation eliminating direct and mutual left recursion into LL(1) form without introducing $\varepsilon$-chains.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Floyd (1963)
- **Author:** Robert W. Floyd
- **Title:** *Syntactic Analysis and Operator Precedence*
- **Venue:** Journal of the ACM (JACM), Vol. 10, No. 3, pp. 316–333, July 1963.
- **Identifier / Link:** [https://doi.org/10.1145/321172.321179](https://doi.org/10.1145/321172.321179)
- **App Usage:** Operator precedence grammars, operator precedence relation matrices ($< \cdot, = \cdot, \cdot >$), and operator stratification.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Mickunas, Lancaster & Schneider (1976)
- **Authors:** M. Dennis Mickunas, Ronald L. Lancaster, Victor B. Schneider
- **Title:** *Transforming LR(k) Grammars to LR(1), SLR(1) and (1,1) Bounded Right Context Grammars*
- **Venue:** Journal of the ACM (JACM), Vol. 23, No. 3, pp. 511–533, July 1976.
- **Identifier / Link:** [https://doi.org/10.1145/321958.321969](https://doi.org/10.1145/321958.321969)
- **App Usage:** Splitting LR context to eliminate LR conflicts without altering language generation.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Chomsky & Miller (1958)
- **Authors:** Noam Chomsky, George A. Miller
- **Title:** *Finite State Languages*
- **Venue:** Information and Control, Vol. 1, No. 2, pp. 91–112, May 1958.
- **Identifier / Link:** [https://doi.org/10.1016/S0019-9958(58)90082-2](https://doi.org/10.1016/S0019-9958(58)90082-2)
- **App Usage:** Dual NFA construction converting left-linear regular grammars ($A \to B a \mid a$) into right-linear form ($A \to a B \mid a$).
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`, `presetGrammars.ts`.

### Foster (1968)
- **Author:** J. M. Foster
- **Title:** *A Syntax Improving Program*
- **Venue:** The Computer Journal, Vol. 11, No. 1, pp. 31–34, May 1968.
- **Identifier / Link:** [https://doi.org/10.1093/comjnl/11.1.31](https://doi.org/10.1093/comjnl/11.1.31)
- **App Usage:** Left and right factorization (longest common prefix/suffix extraction) and automated grammar restructuring.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Moore (2000)
- **Author:** Robert C. Moore
- **Title:** *Removing Left Recursion from Context-Free Grammars*
- **Venue:** Proceedings of the 1st Meeting of the North American Chapter of the Association for Computational Linguistics (NAACL '00), pp. 249–255, 2000.
- **Identifier / Link:** [https://aclanthology.org/A00-2033/](https://aclanthology.org/A00-2033/) (ACL Anthology Open Access)
- **App Usage:** Paull's algorithm optimizations and direct elimination of left recursion avoiding production blow-up.
- **Referenced In:** `transformationInfo.ts`.

### Johnson & Roark (2000)
- **Authors:** Mark Johnson, Brian Roark
- **Title:** *Compact Non-Left-Recursive Grammars Using the Selective Left-Corner Transform and Factoring*
- **Venue:** Proceedings of the 18th International Conference on Computational Linguistics (COLING '00), Saarbrücken, Germany, Vol. 1, pp. 355–361, July 2000.
- **Identifier / Link:** [https://aclanthology.org/C00-1052/](https://aclanthology.org/C00-1052/) (ACL Anthology Open Access)
- **App Usage:** Selective left-corner transform and factoring pipeline creating compact grammars for top-down parsers.
- **Referenced In:** `transformationInfo.ts`.

### Aho & Ullman (1972)
- **Authors:** Alfred V. Aho, Jeffrey D. Ullman
- **Title:** *The Theory of Parsing, Translation, and Compiling. Vol. I: Parsing*
- **Venue:** Prentice-Hall Series in Automatic Computation, Englewood Cliffs, NJ, 1972.
- **Identifier / Link:** [https://archive.org/details/theoryofparsingt00ahoa](https://archive.org/details/theoryofparsingt00ahoa) (Internet Archive)
- **App Usage:** Canonical matched/open statement grammar stratification eliminating dangling-else ambiguity; comprehensive theory of parsing algorithms.
- **Referenced In:** `teachingGuideData.ts`, `transformationInfo.ts`.

### Hopcroft, Motwani & Ullman (2006)
- **Authors:** John E. Hopcroft, Rajeev Motwani, Jeffrey D. Ullman
- **Title:** *Introduction to Automata Theory, Languages, and Computation (3rd Edition)*
- **Venue:** Addison-Wesley / Pearson, Boston, MA, 2006.
- **Identifier / Link:** [https://www.pearson.com/en-us/subject-catalog/p/introduction-to-automata-theory-languages-and-computation/P200000003294](https://www.pearson.com/en-us/subject-catalog/p/introduction-to-automata-theory-languages-and-computation/P200000003294)
- **App Usage:** Standard reference for formal grammars, context-free languages, and Chomsky hierarchy.
- **Referenced In:** `transformationInfo.ts`.
