/**
 * Automatic attempt to transform a grammar into an equivalent LL(1) grammar.
 *
 * The order follows R. Cockett's course notes (CPSC 411, University of Calgary,
 * "Transformations to LL(1)"): 1. remove left recursion, 2. expose FIRST
 * clashes by substituting leading non-terminals, 3. left factor, 4. attempt to
 * remove FIRST/FOLLOW clashes, then repeat from 2. The individual methods are
 * those of the KIV/FJP lectures (Ježek, 9 a 10 LLk): left factoring after
 * eliminating rules for FIRST-FIRST conflicts and absorption of the terminal
 * that follows ("pohlcení terminálu") for FIRST-FOLLOW conflicts. Removing an
 * ε-rule is the last resort (Cockett: "epsilon separation").
 *
 * Success is not guaranteed: an ambiguous grammar or a language that is not
 * LL(1) cannot be transformed, and the process may grow the grammar without
 * end (the loop is bounded). Foster's SID (1968) worked the same way and
 * reported why it failed; the result here lists every operation and, on
 * failure, the conflicts that remain.
 *
 * The attempt is a job (jobs/job.ts): it yields after every round, so the UI
 * can run it in slices and ask the user before going on; stopped, it returns
 * the best state found so far, like a failed attempt.
 */

import { Grammar, cloneGrammar, formatGrammarGrouped, normalizeGrammar } from '../ast/grammar';
import {
  analyzeGrammar,
  computeCyclic,
  computeEndable,
  computeLeftRecursion,
  computeNullable,
  computeReachable
} from '../analyser/grammarAnalyser';
import { buildLLTable, LLConflict } from '../ll/llTable';
import { Job, JobControl, runJob, runToEnd } from '../jobs/job';
import {
  TransformationResult,
  TransformationStep,
  absorbFollowingSymbol,
  eliminateEpsilonForSymbol,
  eliminateImmediateLeftRecursionForSymbol,
  expandLeadingNonTerminalInSymbol,
  leftFactorSymbol,
  mergeEquivalentNonTerminal,
  reduceGrammar,
  removeLeftRecursion,
  removeUnitRules,
  substituteSymbol,
  getAvailableTransformationsForSymbol
} from './grammarProcessor';

export interface LL1AttemptResult extends TransformationResult {
  success: boolean;
  /** Number of operations performed */
  operations: number;
  /** LL(1) conflicts of the result (empty on success) */
  remaining: LLConflict[];
}

const MAX_ITERATIONS = 60;
const MAX_RULES = 400;
/** Rounds without a better state after which the attempt stops */
const NO_PROGRESS_ROUNDS = 10;

/** Badness of a grammar: a FIRST-FIRST conflict counts twice, a FIRST-FOLLOW conflict once. */
const conflictScore = (conflicts: LLConflict[]) =>
  conflicts.reduce((sum, c) => sum + (c.conflictType === 'First/First' ? 2 : 1), 0);

interface Reason {
  en: string;
  cz: string;
}

const conflictText = (c: LLConflict, cz: boolean) =>
  `${cz ? 'kolize' : ''} ${c.conflictType === 'First/First' ? 'FIRST-FIRST' : 'FIRST-FOLLOW'}${cz ? '' : ' conflict'} ${cz ? 'neterminálu' : 'of'} ${c.nonTerminal} ${cz ? 'na' : 'on'} '${c.lookahead}' (${c.productions.map(p => `(${p.id})`).join(cz ? ' a ' : ' and ')})`.trim();

function commonPrefix(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i]);
  return out;
}

export function transformToLL1(input: Grammar): LL1AttemptResult {
  return runJob(transformToLL1Steps(input, runToEnd()));
}

export function* transformToLL1Steps(input: Grammar, control: JobControl): Job<LL1AttemptResult> {
  const steps: TransformationStep[] = [];
  let current = normalizeGrammar(cloneGrammar(input));
  let operations = 0;
  const rulesBefore = current.productions.length;

  /** Records one operation: why it was done, what it did, the grammar after it. */
  const record = (reason: Reason, res: TransformationResult, nameEn: string, nameCz: string) => {
    if (res.steps.length === 0) return false;
    operations++;
    const first = res.steps[0];
    const last = res.steps[res.steps.length - 1];
    const own = res.steps.length === 1 ? first : undefined;
    steps.push({
      title: `${operations}. ${nameEn}`,
      titleCz: `${operations}. ${nameCz}`,
      description: `Reason: ${reason.en} ${own ? own.description : res.steps.map(s => s.title).join('; ') + '.'}`,
      descriptionCz: `Důvod: ${reason.cz} ${own ? own.descriptionCz || own.description : res.steps.map(s => s.titleCz || s.title).join('; ') + '.'}`,
      mathExplanation: own?.mathExplanation ?? last.mathExplanation,
      mathExplanationCz: own?.mathExplanationCz ?? last.mathExplanationCz,
      addedRules: res.steps.flatMap(s => s.addedRules || []),
      removedRules: res.steps.flatMap(s => s.removedRules || []),
      intermediateGrammar: cloneGrammar(res.transformedGrammar)
    });
    current = res.transformedGrammar;
    return true;
  };

  const llTable = (g: Grammar) => buildLLTable(g, analyzeGrammar(g, { k2: false }), { ll2: false });

  /** After success: a non-terminal used only once, in a unit rule B -> X, is substituted (KIV/FJP 9 a 10, p. 22), if the grammar stays LL(1). */
  const simplify = () => {
    const tried = new Set<string>();
    for (let guard = 0; guard < 100; guard++) {
      const X = [...current.nonTerminals].find(x => {
        if (x === current.startSymbol || tried.has(x) || !current.productions.some(p => p.lhs === x)) return false;
        const refs = current.productions.filter(p => p.rhs.includes(x));
        return refs.length === 1 && refs[0].rhs.length === 1 && refs[0].lhs !== x;
      });
      if (!X) return;
      tried.add(X);
      const res = substituteSymbol(current, X);
      if (res.steps.length === 0 || !llTable(res.transformedGrammar).isLL1) continue;
      record({ en: `${X} is used only in one unit rule; substituting it shortens the grammar and keeps it LL(1) (KIV/FJP 9 a 10, p. 22).`, cz: `${X} se používá jen v jednom jednoduchém pravidle; jeho dosazení gramatiku zkrátí a zachová LL(1) (KIV/FJP 9 a 10, s. 22).` },
        res, `Simplification: substitute ${X}`, `Zjednodušení: dosazení ${X}`);
    }
  };

  const finish = (success: boolean, stopEn: string, stopCz: string): LL1AttemptResult => {
    const remaining = success ? [] : llTable(current).conflicts;
    steps.push({
      title: success ? 'Result: the grammar is LL(1)' : 'Result: the grammar is not LL(1)',
      titleCz: success ? 'Výsledek: gramatika je LL(1)' : 'Výsledek: gramatika není LL(1)',
      description: `${stopEn} Operations: ${operations}; rules ${rulesBefore} → ${current.productions.length}.` +
        (remaining.length > 0 ? ` Remaining conflicts: ${remaining.map(c => conflictText(c, false)).join('; ')}.` : '') +
        ' The order of steps follows Cockett (CPSC 411): left recursion, exposing FIRST clashes, left factoring, FIRST/FOLLOW clashes, repeat; success is not guaranteed (KIV/FJP 9 a 10: "Rezultativnost LL(1) transformace se nezaručuje").',
      descriptionCz: `${stopCz} Počet operací: ${operations}; pravidel ${rulesBefore} → ${current.productions.length}.` +
        (remaining.length > 0 ? ` Zbývající kolize: ${remaining.map(c => conflictText(c, true)).join('; ')}.` : '') +
        ' Pořadí kroků podle Cocketta (CPSC 411): levá rekurze, odkrytí kolizí FIRST, levá faktorizace, kolize FIRST-FOLLOW, opakování; úspěch není zaručen (KIV/FJP 9 a 10: „Rezultativnost LL(1) transformace se nezaručuje“).',
      intermediateGrammar: cloneGrammar(current)
    });
    return { transformedGrammar: current, steps, success, operations, remaining };
  };

  if (llTable(current).isLL1) {
    return finish(true, 'The grammar already is LL(1); nothing was changed.', 'Gramatika už je LL(1); nic se neměnilo.');
  }

  // 1. Preparation: useless symbols, cycles
  const useless = () => {
    const e = computeEndable(current);
    const r = computeReachable(current);
    return [...current.nonTerminals].some(nt => !e.has(nt) || !r.has(nt)) || [...current.terminals].some(t => !r.has(t));
  };
  if (!computeEndable(current).has(current.startSymbol)) {
    return finish(false, 'The grammar generates no word.', 'Gramatika negeneruje žádné slovo.');
  }
  if (useless()) {
    record({ en: 'the LL(1) transformations assume a grammar without useless symbols (KIV/FJP 9 a 10, p. 20).', cz: 'LL(1) transformace předpokládají gramatiku bez zbytečných symbolů (KIV/FJP 9 a 10, s. 20).' },
      reduceGrammar(current), 'Remove useless symbols', 'Odstranění zbytečných symbolů');
  }
  if (computeCyclic(current, computeNullable(current)).size > 0) {
    record({ en: 'the grammar has a cycle A ⇒+ A, so it is ambiguous; unit rules are removed.', cz: 'gramatika obsahuje cyklus A ⇒+ A, je tedy nejednoznačná; odstraní se jednoduchá pravidla.' },
      removeUnitRules(current), 'Remove unit rules (cycles)', 'Odstranění jednoduchých pravidel (cyklů)');
  }

  // 2. Left recursion (Cockett step 1)
  const lr = computeLeftRecursion(current, computeNullable(current));
  // Only immediate left recursion: rule by rule; hidden or indirect recursion needs Paull's algorithm
  const onlyImmediate = [...lr.kinds.values()].every(k => k.length === 1 && k[0] === 'immediate');
  if (lr.immediate.size > 0 && onlyImmediate) {
    for (const nt of lr.immediate) {
      record({ en: `${nt} is immediately left-recursive; an LL(1) grammar cannot be left-recursive (Cockett step 1; Dragon Book §4.3.3).`, cz: `${nt} je přímo levorekurzivní; LL(1) gramatika nemůže být levorekurzivní (Cockett krok 1; Dragon Book §4.3.3).` },
        eliminateImmediateLeftRecursionForSymbol(current, nt), `Remove immediate left recursion of ${nt}`, `Odstranění přímé levé rekurze ${nt}`);
    }
  } else if (lr.kinds.size > 0) {
    record({ en: `indirect or hidden left recursion (${[...lr.immediate, ...lr.indirect].join(', ')}); an LL(1) grammar cannot be left-recursive (Cockett step 1).`, cz: `nepřímá nebo skrytá levá rekurze (${[...lr.immediate, ...lr.indirect].join(', ')}); LL(1) gramatika nemůže být levorekurzivní (Cockett krok 1).` },
      removeLeftRecursion(current), "Remove left recursion (Paull's algorithm)", 'Odstranění levé rekurze (Paullův algoritmus)');
  }

  // 3. Conflicts, FIRST-FIRST before FIRST-FOLLOW (Cockett steps 2–4, repeated).
  // The best state so far (fewest conflicts, then fewest rules) is kept; when the
  // attempt fails, the operations after it are discarded.
  const seen = new Set<string>();
  let best = { score: Infinity, rules: Infinity, grammar: current, stepsLength: steps.length, operations };
  let sinceBest = 0;
  const fail = (en: string, cz: string): LL1AttemptResult => {
    const discarded = operations - best.operations;
    if (discarded > 0) {
      current = best.grammar;
      steps.length = best.stepsLength;
      operations = best.operations;
      steps.push({
        title: `Discarded ${discarded} operation(s)`,
        titleCz: `Zahozené operace (počet: ${discarded})`,
        description: `${en} The ${discarded} operation(s) after step ${operations} did not reduce the conflicts and were discarded; the result is the state after step ${operations}.`,
        descriptionCz: `${cz} Operace po kroku ${operations} (počet: ${discarded}) kolize nesnížily a byly zahozeny; výsledkem je stav po kroku ${operations}.`
      });
    }
    return finish(false, en, cz);
  };
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    yield {
      en: `automatic LL(1) attempt: round ${iteration + 1}, ${operations} operations, ${current.productions.length} rules`,
      cz: `automatický převod na LL(1): kolo ${iteration + 1}, operací ${operations}, pravidel ${current.productions.length}`
    };
    if (control.stop) {
      return fail('Stopped by the user.', 'Zastaveno uživatelem.');
    }
    if (useless()) {
      record({ en: 'the previous step left useless symbols.', cz: 'předchozí krok zanechal zbytečné symboly.' },
        reduceGrammar(current), 'Remove useless symbols', 'Odstranění zbytečných symbolů');
    }
    // Merge non-terminals with the same rules (KIV/FJP 9 a 10, p. 22)
    for (const nt of [...current.nonTerminals]) {
      const merge = getAvailableTransformationsForSymbol(current, nt).find(t => t.type === 'mergeEquivalent');
      if (merge) {
        const other = merge.details!.other!;
        record({ en: `${other} has the same rules as ${nt} (the same generative power, KIV/FJP 9 a 10, p. 22).`, cz: `${other} má stejná pravidla jako ${nt} (tutéž generativní schopnost, KIV/FJP 9 a 10, s. 22).` },
          mergeEquivalentNonTerminal(current, nt, other), `Replace ${other} by ${nt}`, `Nahrazení ${other} neterminálem ${nt}`);
        break;
      }
    }

    const table = llTable(current);
    if (table.isLL1) {
      simplify();
      return finish(true, 'The grammar is LL(1).', 'Gramatika je LL(1).');
    }
    const score = conflictScore(table.conflicts);
    if (score < best.score || (score === best.score && current.productions.length < best.rules)) {
      best = { score, rules: current.productions.length, grammar: current, stepsLength: steps.length, operations };
      sinceBest = 0;
    } else if (++sinceBest >= NO_PROGRESS_ROUNDS) {
      return fail(`Stopped: ${NO_PROGRESS_ROUNDS} rounds did not reduce the conflicts (the steps repeat or only grow the grammar; the grammar may be ambiguous or its language not LL(1)).`,
        `Zastaveno: ${NO_PROGRESS_ROUNDS} kol nesnížilo kolize (úpravy se opakují nebo jen zvětšují gramatiku; gramatika může být nejednoznačná nebo její jazyk není LL(1)).`);
    }
    if (current.productions.length > MAX_RULES) {
      return fail(`Stopped: the grammar grew beyond ${MAX_RULES} rules.`, `Zastaveno: gramatika narostla nad ${MAX_RULES} pravidel.`);
    }
    const fingerprint = formatGrammarGrouped(current);
    if (seen.has(fingerprint)) {
      return fail('Stopped: the transformations returned to a grammar seen before.', 'Zastaveno: úpravy se vrátily ke gramatice, která už byla.');
    }
    seen.add(fingerprint);

    const conflicts = [
      ...table.conflicts.filter(c => c.conflictType === 'First/First'),
      ...table.conflicts.filter(c => c.conflictType === 'First/Follow')
    ];
    const first1 = analyzeGrammar(current, { k2: false }).first1;
    let applied = false;

    for (const c of conflicts) {
      const A = c.nonTerminal;
      const why = { en: `${conflictText(c, false)}.`, cz: `${conflictText(c, true)}.` };
      if (c.conflictType === 'First/First') {
        // Left factoring of the longest common prefix of the colliding rules (Cockett step 3)
        let prefix: string[] = [];
        for (let i = 0; i < c.productions.length; i++) {
          for (let j = i + 1; j < c.productions.length; j++) {
            const cp = commonPrefix(c.productions[i].rhs, c.productions[j].rhs);
            if (cp.length > prefix.length) prefix = cp;
          }
        }
        if (prefix.length > 0) {
          applied = record({ en: `${why.en} The rules share the prefix '${prefix.join(' ')}' (Cockett step 3).`, cz: `${why.cz} Pravidla mají společný prefix '${prefix.join(' ')}' (Cockett krok 3).` },
            leftFactorSymbol(current, A, prefix), `Left factoring of ${A}`, `Levá faktorizace ${A}`);
        } else {
          // Expose the clash: substitute the leading non-terminal (Cockett step 2, KIV "eliminace pravidel")
          const leading = c.productions.map(p => p.rhs[0]).find(s => s !== undefined && s !== A && current.productions.some(q => q.lhs === s));
          if (leading) {
            applied = record({ en: `${why.en} No common prefix: '${leading}' at the beginning hides '${c.lookahead}'; its rules are substituted so that factoring becomes possible (Cockett step 2; KIV/FJP 9 a 10, p. 20).`, cz: `${why.cz} Pravidla nemají společný prefix: '${leading}' na začátku skrývá '${c.lookahead}'; dosadí se jeho pravidla, aby šlo faktorizovat (Cockett krok 2; KIV/FJP 9 a 10, s. 20).` },
              expandLeadingNonTerminalInSymbol(current, A, leading), `Substitute ${leading} at the beginning of the rules of ${A}`, `Dosazení ${leading} na začátek pravidel ${A}`);
          }
        }
      } else {
        // Absorb the symbol that follows A and causes the clash (KIV/FJP 9 a 10, p. 21)
        let occurrence: { productionId: number; position: number; follower: string } | undefined;
        for (const p of current.productions) {
          p.rhs.forEach((s, i) => {
            const Y = p.rhs[i + 1];
            if (occurrence || s !== A || Y === undefined) return;
            const firstY = current.nonTerminals.has(Y) ? first1.get(Y) || new Set<string>() : new Set([Y]);
            if (firstY.has(c.lookahead)) occurrence = { productionId: p.id, position: i, follower: Y };
          });
        }
        if (occurrence) {
          applied = record({ en: `${why.en} '${occurrence.follower}' follows ${A} and brings '${c.lookahead}' into FOLLOW(${A}); absorbing it turns the conflict into a FIRST-FIRST one (Cockett step 4; KIV/FJP 9 a 10, p. 21).`, cz: `${why.cz} Za ${A} následuje '${occurrence.follower}', který přináší '${c.lookahead}' do FOLLOW(${A}); jeho pohlcením se kolize změní na FIRST-FIRST (Cockett krok 4; KIV/FJP 9 a 10, s. 21).` },
            absorbFollowingSymbol(current, occurrence), `Absorb ${occurrence.follower} following ${A}`, `Pohlcení ${occurrence.follower} za ${A}`);
        } else if (current.productions.some(p => p.lhs === A && p.rhs.length === 0) &&
          !(A === current.startSymbol && !current.productions.some(p => p.rhs.includes(A)))) {
          // Last resort: remove the ε-rule of A; the conflict moves into the rules that use A
          applied = record({ en: `${why.en} '${c.lookahead}' reaches FOLLOW(${A}) through the end of a rule, so nothing can be absorbed; as a last resort the ε-rule of ${A} is removed (Cockett: epsilon separation).`, cz: `${why.cz} '${c.lookahead}' se do FOLLOW(${A}) dostává přes konec pravidla, nelze tedy nic pohltit; jako poslední možnost se odstraní ε-pravidlo ${A} (Cockett: oddělení ε).` },
            eliminateEpsilonForSymbol(current, A), `Remove the ε-rule of ${A}`, `Odstranění ε-pravidla ${A}`);
        }
      }
      if (applied) break;
    }

    if (!applied) {
      return fail( 'Stopped: no known transformation applies to the remaining conflicts (the grammar may be ambiguous or the language not LL(1)).',
        'Zastaveno: na zbývající kolize nelze použít žádnou známou úpravu (gramatika může být nejednoznačná nebo jazyk není LL(1)).');
    }
  }
  return fail(`Stopped after ${MAX_ITERATIONS} rounds.`, `Zastaveno po ${MAX_ITERATIONS} kolech.`);
}
