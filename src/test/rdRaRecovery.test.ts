/**
 * Panic-mode error recovery in the recursive-descent and recursive-ascent step
 * simulators (rdSimulator.ts: Wirth's stop symbols; recursiveAscentSimulator.ts:
 * the LR panic mode of lrParser.ts in terms of procedure calls and returns):
 * - recovery off: nothing changes (the other test files), and on correct words the
 *   descent with recovery on takes the same steps with the same left parse;
 * - recovery on, on the RD sample grammars and seeded random LL(1) / LR grammars,
 *   for example words and their mutations (one or two symbols deleted, inserted or
 *   replaced): the simulation always terminates (no step limit, it ends with
 *   acceptance or with the input read), never reports an error on a word of L(G),
 *   reports at least one error on every other word (Earley oracle);
 * - the first error is at the same position as in the table-driven LL resp. LR
 *   simulator with recovery (and without it); recursive ascent finds exactly the
 *   errors of the LR simulator (positions, symbols thrown away, states popped);
 * - semantic errors (symbol table) still stop the descent and the ascent.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar, GrammarAnalysis } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import { simulateLRParse } from '../core/lr/lrParser';
import {
  LRAutomaton,
  attachMergedLR1States,
  buildIELR1Automaton,
  buildLALR1Automaton,
  buildLR0Automaton,
  buildLR1Automaton,
  buildSLR1Automaton
} from '../core/lr/lrAutomaton';
import { LRTable, buildLRTable } from '../core/lr/lrTable';
import { recoverySets, RecoverySets } from '../core/analyser/errorRecovery';
import { simulateRecursiveDescent, RDSimulationResult } from '../core/codegen/rdSimulator';
import { canGenerateAscent, generateRecursiveAscent } from '../core/codegen/recursiveAscent';
import { simulateRecursiveAscent, AscentSimulation } from '../core/codegen/recursiveAscentSimulator';
import { ascentEvents, placeEvents } from '../core/codegen/recursiveAscentActions';
import { suggestSymbolActions, DEFAULT_KEYWORD_CONFIG, tokenClasses, RuleActionDefinition } from '../core/codegen/symbolTable';
import { scanInput, tokenizeInput } from '../core/parser/inputTokenizer';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';
import { exampleWord } from '../core/generator/exampleWord';
import { DerivationNode } from '../core/generator/wordGenerator';
import { prng, randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const yieldToRunner = () => new Promise(resolve => setTimeout(resolve, 0));

/** A tree without node ids and marks */
const shape = (n?: DerivationNode): unknown => (n ? { s: n.symbol, c: n.children?.map(shape) } : undefined);

/** The word with one or two symbols deleted, inserted or replaced: all single edits (up to `limit`), and random double edits */
function mutations(word: string[], terminals: string[], seed: number, limit = 400, doubles = 25): string[][] {
  const rand = prng(seed);
  const single: string[][] = [];
  for (let i = 0; i < word.length; i++) single.push([...word.slice(0, i), ...word.slice(i + 1)]);
  for (let i = 0; i <= word.length; i++) for (const t of terminals) single.push([...word.slice(0, i), t, ...word.slice(i)]);
  for (let i = 0; i < word.length; i++) for (const t of terminals) if (t !== word[i]) single.push([...word.slice(0, i), t, ...word.slice(i + 1)]);
  const pickEdit = (w: string[]): string[] => {
    const kind = Math.floor(rand() * 3);
    const t = terminals[Math.floor(rand() * terminals.length)];
    if (kind === 0 && w.length > 0) {
      const i = Math.floor(rand() * w.length);
      return [...w.slice(0, i), ...w.slice(i + 1)];
    }
    if (kind === 1 || w.length === 0) {
      const i = Math.floor(rand() * (w.length + 1));
      return [...w.slice(0, i), t, ...w.slice(i)];
    }
    const i = Math.floor(rand() * w.length);
    return [...w.slice(0, i), t, ...w.slice(i + 1)];
  };
  const chosen = single.length <= limit ? single : Array.from({ length: limit }, () => single[Math.floor(rand() * single.length)]);
  const out = new Map<string, string[]>();
  for (const w of chosen) out.set(w.join(' '), w);
  for (let k = 0; k < doubles; k++) {
    const w = pickEdit(pickEdit(word));
    out.set(w.join(' '), w);
  }
  return [...out.values()];
}

/** The tables of all five variants (with the grammar's precedence, as in the app). */
function lrTables(g: Grammar, analysis: GrammarAnalysis): LRTable[] {
  const lalr = buildLALR1Automaton(g, analysis);
  const lr1 = buildLR1Automaton(g, analysis);
  attachMergedLR1States(lalr, lr1);
  const ielr = buildIELR1Automaton(g, analysis, lr1, { usePrecedence: true });
  const automata: LRAutomaton[] = [buildLR0Automaton(g), buildSLR1Automaton(g, analysis), lalr, ielr, lr1];
  return automata.map(a => buildLRTable(a, g, analysis));
}

/** Position of the error of a run without recovery: the input symbol it stopped at */
const stopPosition = (wordLength: number, remaining: string[]) => wordLength + 1 - remaining.length;

interface Counts {
  words: number;
  wrong: number;
  errors: number;
  multi: number;
}

/** The checks of the recursive descent with recovery on one word */
function checkDescent(label: string, g: Grammar, analysis: GrammarAnalysis, sets: RecoverySets, w: string[], inL: boolean, counts: Counts, ruleActions: RuleActionDefinition[] = []) {
  const word = w.join(' ') || 'ε';
  const off = simulateRecursiveDescent(w, g, analysis, { ruleActions });
  const rd: RDSimulationResult = simulateRecursiveDescent(w, g, analysis, { ruleActions, recovery: { sets } });
  const last = rd.steps[rd.steps.length - 1];
  expect(off.accepted, `${label} RD without recovery = L(G) on '${word}'`).toBe(inL);
  expect(rd.truncated, `${label} RD terminates on '${word}'`).toBeUndefined();
  expect(last.isAccepted || last.recovery?.kind === 'end', `${label} RD ends with acceptance or the input read on '${word}': ${last.actionDescription}`).toBe(true);
  counts.words++;
  if (inL) {
    expect(rd.accepted, `${label} RD accepts '${word}'`).toBe(true);
    expect(rd.errors, `${label} RD no error on '${word}'`).toEqual([]);
    // recovery on changes nothing on a correct word
    expect(rd.steps.length, `${label} RD same steps '${word}'`).toBe(off.steps.length);
    expect(rd.leftParse, `${label} RD same left parse '${word}'`).toEqual(off.leftParse);
    expect(shape(rd.finalTree), `${label} RD same tree '${word}'`).toEqual(shape(off.finalTree));
    return;
  }
  counts.wrong++;
  expect(rd.accepted, `${label} RD rejects '${word}'`).toBe(false);
  expect(rd.completedWithErrors, `${label} RD reads the whole input '${word}'`).toBe(true);
  expect(rd.errors!.length, `${label} RD reports an error on '${word}'`).toBeGreaterThanOrEqual(1);
  counts.errors += rd.errors!.length;
  if (rd.errors!.length > 1) counts.multi++;
  // the same first error as the table-driven LL simulator (with and without recovery) and the descent without recovery
  const ll = simulateLLParse(w, g, buildLLTable(g, analysis), undefined, { k: 1 }, { recovery: { sets } });
  expect(ll.completedWithErrors, `${label} LL reads the whole input '${word}'`).toBe(true);
  expect(rd.errors![0].position, `${label} first error RD = LL '${word}'`).toBe(ll.errors![0].position);
  const llOff = simulateLLParse(w, g, buildLLTable(g, analysis));
  expect(rd.errors![0].position, `${label} first error RD = LL without recovery '${word}'`).toBe(stopPosition(w.length, llOff.steps[llOff.steps.length - 1].remainingInput));
  expect(rd.errors![0].position, `${label} first error = RD without recovery '${word}'`).toBe(off.steps[off.steps.length - 1].lookaheadIndex);
  // every error is described by its steps: panic mode starts, and the step says what happens
  for (const e of rd.errors!) {
    const own = rd.steps.filter(s => s.recovery && s.recovery.errorNumber === e.number);
    expect(own.some(s => s.recovery!.kind === 'start' || s.recovery!.kind === 'insert'), `${label} error ${e.number} starts '${word}'`).toBe(true);
    expect(own.filter(s => s.recovery!.kind === 'skip').length, `${label} skips of error ${e.number} '${word}'`).toBe(e.skipped);
  }
}

/** The checks of recursive ascent with recovery on one word */
function checkAscent(label: string, g: Grammar, table: LRTable, sets: RecoverySets, w: string[], inL: boolean, counts: Counts, gen = generateRecursiveAscent(g, table), placements = placeEvents(g, table, [])) {
  const word = w.join(' ') || 'ε';
  const ra: AscentSimulation = simulateRecursiveAscent(w, gen, table, { recovery: { sets }, placements });
  const lr = simulateLRParse(w, g, table, 'dragon', undefined, { recovery: { sets } });
  const last = ra.steps[ra.steps.length - 1];
  expect(ra.stopped, `${label} RA terminates on '${word}'`).toBeUndefined();
  expect(last.kind === 'accept' || last.recovery?.kind === 'end', `${label} RA ends with acceptance or the input read on '${word}': ${last.text.en}`).toBe(true);
  counts.words++;
  if (inL) {
    expect(ra.accepted, `${label} RA accepts '${word}'`).toBe(true);
    expect(ra.errors, `${label} RA no error on '${word}'`).toEqual([]);
    const off = simulateRecursiveAscent(w, gen, table, { placements });
    expect(ra.steps.map(s => s.kind), `${label} RA same steps '${word}'`).toEqual(off.steps.map(s => s.kind));
    expect(ra.rightParse).toEqual(off.rightParse);
    return;
  }
  counts.wrong++;
  expect(ra.accepted, `${label} RA rejects '${word}'`).toBe(false);
  expect(ra.completedWithErrors, `${label} RA reads the whole input '${word}'`).toBe(true);
  expect(ra.errors!.length, `${label} RA reports an error on '${word}'`).toBeGreaterThanOrEqual(1);
  counts.errors += ra.errors!.length;
  if (ra.errors!.length > 1) counts.multi++;
  expect(lr.completedWithErrors, `${label} LR reads the whole input '${word}'`).toBe(true);
  expect(ra.errors![0].position, `${label} first error RA = LR '${word}'`).toBe(lr.errors![0].position);
  const lrOff = simulateLRParse(w, g, table, 'dragon');
  expect(ra.errors![0].position, `${label} first error RA = LR without recovery '${word}'`).toBe(stopPosition(w.length, lrOff.steps[lrOff.steps.length - 1].remainingInput));
  // the same panic mode as the table-driven simulator: the same errors, the same work, the same right parse and tree
  expect(ra.errors!.map(e => [e.position, e.skipped, e.popped]), `${label} RA errors = LR errors '${word}'`).toEqual(lr.errors!.map(e => [e.position, e.skipped, e.popped]));
  expect(ra.rightParse, `${label} RA right parse = LR '${word}'`).toEqual(lr.steps[lr.steps.length - 1].rightParse);
  expect(shape(ra.finalTree), `${label} RA tree = LR '${word}'`).toEqual(shape(lr.finalTree));
  // the returns of panic mode are steps of their own, one per procedure
  for (const e of ra.errors!) {
    const own = ra.steps.filter(s => s.recovery && s.recovery.errorNumber === e.number);
    expect(own.filter(s => s.recovery!.kind === 'pop').length, `${label} returns of error ${e.number} '${word}'`).toBe(e.popped);
    expect(own.filter(s => s.recovery!.kind === 'skip').length, `${label} skips of error ${e.number} '${word}'`).toBe(e.skipped);
  }
}

describe('panic-mode recovery in recursive descent (Wirth\'s stop symbols)', () => {
  const g = parseGrammar('E -> T R\nR -> + T R | ε\nT -> F Y\nY -> * F Y | ε\nF -> ( E ) | a').grammar!;
  const analysis = analyzeGrammar(g, { k2: false });
  const sets = recoverySets(g, analysis);
  const run = (w: string) => simulateRecursiveDescent(w.split(' '), g, analysis, { recovery: { sets } });

  it('is off by default: the descent stops at the first error', () => {
    const off = simulateRecursiveDescent(['a', '+', '*', 'a'], g, analysis);
    expect(off.accepted).toBe(false);
    expect(off.errors).toBeUndefined();
    expect(off.steps[off.steps.length - 1].isError).toBe(true);
    expect(off.steps.some(s => s.recovery)).toBe(false);
  });

  it('a symbol that cannot start a procedure: test(start set, stop symbols) throws it away and the procedure goes on', () => {
    const rd = run('a + * a');
    expect(rd.errors!.map(e => [e.position, e.token, e.skipped, e.popped])).toEqual([[2, '*', 1, 0]]);
    const kinds = rd.steps.filter(s => s.recovery).map(s => s.recovery!.kind);
    expect(kinds).toEqual(['start', 'skip', 'recovered', 'end']);
    const start = rd.steps.find(s => s.recovery?.kind === 'start')!;
    expect(start.recoveryTest).toBe('entry');
    expect(start.recovery!.nonTerminal).toBe('T');
    expect(start.recovery!.resumeSet).toEqual(['(', 'a']);
    // stop symbols of T called from R called from E: FOLLOW(T) ∪ FOLLOW(R) ∪ FOLLOW(E) ∪ {$}
    expect(start.recovery!.syncSet).toEqual([')', '+', '$']);
    expect(start.callStack[start.callStack.length - 1].stopSet).toEqual([')', '+', '$']);
    expect(start.callStack[0].stopSet).toEqual([')', '$']);
    expect(start.actionDescriptionCz).toContain('Panický režim');
    expect(rd.completedWithErrors).toBe(true);
    // the left parse of a + a: the thrown-away * leaves no trace
    expect(rd.leftParse).toEqual([1, 4, 8, 6, 2, 4, 8, 6, 3]);
  });

  it('a missing terminal is taken as inserted; a stop symbol makes a procedure give up and return', () => {
    const missing = run('( a');
    expect(missing.errors!.map(e => [e.position, e.token])).toEqual([[2, '$']]);
    expect(missing.steps.find(s => s.recovery?.kind === 'insert')!.recovery!.token).toBe(')');
    const giveUp = run('a + )');
    expect(giveUp.errors!.map(e => e.position)).toEqual([2]);
    const pop = giveUp.steps.find(s => s.recovery?.kind === 'pop')!;
    expect(pop.recovery!.nonTerminal).toBe('T');
    expect(pop.actionDescription).toContain('gives up');
    // ')' cannot follow E at the end: the main program throws it away
    expect(giveUp.steps.some(s => s.recoveryTest === 'main' || s.recoveryTest === 'exit')).toBe(true);
  });

  it('test(stop symbols, ∅) at the end of a procedure throws away what cannot follow it', () => {
    // F → a: the test at the end of F finds the second a (it is not in FOLLOW(F) ∪ … = {), *, +, $}) and throws it away
    const rd = run('( a a ) * a');
    expect(rd.errors!.map(e => [e.position, e.skipped])).toEqual([[2, 1]]);
    const found = rd.steps.find(s => s.recovery?.kind === 'start')!;
    expect(found.recoveryTest).toBe('exit');
    expect(found.recovery!.nonTerminal).toBe('F');
    expect(rd.leftParse.slice(-4)).toEqual([5, 8, 6, 3]);
    // A → a ends with a terminal: the test at its end finds b, throws it away up to ')' ∈ FOLLOW(A), and S reads ')'
    const g2 = parseGrammar('S -> ( A ) | b\nA -> a').grammar!;
    const a2 = analyzeGrammar(g2, { k2: false });
    const exit = simulateRecursiveDescent('( a b )'.split(' '), g2, a2, { recovery: { sets: recoverySets(g2, a2) } });
    expect(exit.errors!.map(e => [e.position, e.token, e.skipped])).toEqual([[2, 'b', 1]]);
    const start = exit.steps.find(s => s.recovery?.kind === 'start')!;
    expect(start.recoveryTest).toBe('exit');
    expect(start.recovery!.syncSet).toEqual([')', '$']);
    const back = exit.steps.find(s => s.recovery?.kind === 'recovered')!;
    expect(back.actionDescription).toContain('Return from A()');
    expect(exit.steps.filter(s => s.matchedToken).map(s => s.matchedToken)).toEqual(['(', 'a', ')']);
    expect(exit.completedWithErrors).toBe(true);
  });

  it('follow-up errors before any terminal was read belong to the previous error', () => {
    const rd = run('( ( a');
    expect(rd.errors!.length).toBe(1);
    expect(rd.steps.filter(s => s.recovery?.kind === 'insert').length).toBe(2);
  });

  it('semantic errors still stop the descent; a syntax error before them is reported too', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pascal_pl0')!;
    const sg = parseGrammar(sample.grammarText).grammar!;
    const sa = analyzeGrammar(sg);
    const ss = recoverySets(sg, sa);
    const ruleActions = suggestSymbolActions(sg, DEFAULT_KEYWORD_CONFIG);
    const scan = (text: string) => scanInput(text, sg.terminals, tokenClasses(sg.terminals));
    const ok = scan(sample.namedInput);
    const good = simulateRecursiveDescent(ok.tokens, sg, sa, { ruleActions, lexemes: ok.lexemes, recovery: { sets: ss } });
    expect(good.accepted).toBe(true);
    const bad = scan(sample.namedInput.replace('call p', 'call q'));
    const sem = simulateRecursiveDescent(bad.tokens, sg, sa, { ruleActions, lexemes: bad.lexemes, recovery: { sets: ss } });
    expect(sem.accepted).toBe(false);
    expect(sem.semanticError).toBe(true);
    expect(sem.errors).toEqual([]);
    expect(sem.undeclared.map(u => u.name)).toEqual(['q']);
    // the declarations before a syntax error stay in the table, the name is still found after the recovery
    const both = scan(sample.namedInput.replace('a := 1', 'a := := 1'));
    const rd = simulateRecursiveDescent(both.tokens, sg, sa, { ruleActions, lexemes: both.lexemes, recovery: { sets: ss } });
    expect(rd.semanticError).toBeUndefined();
    expect(rd.errors!.length).toBe(1);
    expect(rd.completedWithErrors).toBe(true);
    expect(rd.undeclared).toEqual([]);
  });
});

describe('panic-mode recovery in recursive ascent (the LR panic mode as procedure returns)', () => {
  it('pops procedures, throws input away and calls the goto on the error part', () => {
    const g = parseGrammar('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a').grammar!;
    const analysis = analyzeGrammar(g, { k2: false });
    const sets = recoverySets(g, analysis);
    const slr = lrTables(g, analysis)[1];
    const gen = generateRecursiveAscent(g, slr);
    const off = simulateRecursiveAscent(['a', '+', '*', 'a'], gen, slr);
    expect(off.accepted).toBe(false);
    expect(off.errors).toBeUndefined();
    expect(off.steps[off.steps.length - 1].kind).toBe('error');
    const ra = simulateRecursiveAscent(['a', '+', '*', 'a', ')', 'a'], gen, slr, { recovery: { sets } });
    const lr = simulateLRParse(['a', '+', '*', 'a', ')', 'a'], g, slr, 'dragon', undefined, { recovery: { sets } });
    expect(ra.completedWithErrors).toBe(true);
    expect(ra.errors!.map(e => [e.position, e.skipped, e.popped])).toEqual(lr.errors!.map(e => [e.position, e.skipped, e.popped]));
    const kinds = ra.steps.filter(s => s.recovery).map(s => s.recovery!.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds).toContain('recovered');
    expect(kinds[kinds.length - 1]).toBe('end');
    const goto = ra.steps.find(s => s.recovery?.kind === 'recovered')!;
    expect(goto.kind).toBe('recover');
    expect(goto.target).toBe(slr.gotoTable.get(goto.state)!.get(goto.nt!));
    expect(goto.text.cz).toContain('Zotaveno');
    expect(ra.steps.find(s => s.recovery?.kind === 'start')!.text.en).toContain('instead of ERR');
  });
});

describe('recovery terminates, never reports an error on a word of L(G) and finds the first error of the table-driven parser', () => {
  it('recursive descent: seeded random LL(1) grammars, example words and their mutations', async () => {
    const counts: Counts = { words: 0, wrong: 0, errors: 0, multi: 0 };
    let grammars = 0;
    for (let seed = 1; seed <= 600; seed++) {
      if (seed % 10 === 0) await yieldToRunner();
      const g = parseGrammar(randomGrammarText(seed)).grammar!;
      if (g.terminals.size === 0) continue;
      const analysis = analyzeGrammar(g, { k2: false });
      if (!buildLLTable(g, analysis).isLL1) continue;
      const word = exampleWord(g);
      if (!word) continue;
      grammars++;
      const sets = recoverySets(g, analysis);
      const terminals = [...g.terminals];
      const words = [word, ...wordsUpTo(terminals, 3), ...mutations(word, terminals, seed)];
      for (const w of words) checkDescent(`seed ${seed}`, g, analysis, sets, w, accepts(g, w), counts);
    }
    expect(grammars).toBeGreaterThan(40);
    expect(counts.wrong).toBeGreaterThan(3000);
    expect(counts.multi).toBeGreaterThan(50);
  }, 300000);

  it('recursive ascent: seeded random grammars with a conflict-free LR table, example words and their mutations', async () => {
    const counts: Counts = { words: 0, wrong: 0, errors: 0, multi: 0 };
    const variants = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      await yieldToRunner();
      const g = parseGrammar(randomGrammarText(seed)).grammar!;
      if (g.terminals.size === 0) continue;
      const word = exampleWord(g);
      if (!word) continue;
      const analysis = analyzeGrammar(g, { k2: false });
      const sets = recoverySets(g, analysis);
      const terminals = [...g.terminals];
      const words = [word, ...wordsUpTo(terminals, 3), ...mutations(word, terminals, seed, 120, 15)];
      const oracle = words.map(w => accepts(g, w));
      for (const table of lrTables(g, analysis)) {
        if (!canGenerateAscent(table)) continue;
        variants.add(table.variant);
        const gen = generateRecursiveAscent(g, table);
        const placements = placeEvents(g, table, []);
        words.forEach((w, i) => checkAscent(`seed ${seed} ${table.variant}`, g, table, sets, w, oracle[i], counts, gen, placements));
      }
    }
    expect([...variants].sort()).toEqual(['IELR(1)', 'LALR(1)', 'LR(0)', 'LR(1)', 'SLR(1)']);
    expect(counts.wrong).toBeGreaterThan(5000);
    expect(counts.multi).toBeGreaterThan(50);
  }, 300000);

  it('the RD sample grammars: descent and ascent with the symbol-table actions on mutated sample words', async () => {
    const counts: Counts = { words: 0, wrong: 0, errors: 0, multi: 0 };
    for (const sample of RD_SAMPLE_GRAMMARS) {
      const g = parseGrammar(sample.grammarText).grammar!;
      const analysis = analyzeGrammar(g);
      const sets = recoverySets(g, analysis);
      const ruleActions = suggestSymbolActions(g, DEFAULT_KEYWORD_CONFIG);
      const word = tokenizeInput(sample.sampleInput, g.terminals).tokens;
      const terminals = [...g.terminals];
      const words = [word, ...mutations(word, terminals, sample.id.length, 80, 20)];
      const oracle = words.map(w => accepts(g, w));
      const ascentTables = lrTables(g, analysis).filter(canGenerateAscent).slice(0, 2);
      for (let i = 0; i < words.length; i++) {
        if (i % 10 === 0) await yieldToRunner();
        checkDescent(sample.id, g, analysis, sets, words[i], oracle[i], counts, ruleActions);
        for (const table of ascentTables) {
          const placements = placeEvents(g, table, ascentEvents(g, ruleActions));
          checkAscent(`${sample.id} ${table.variant}`, g, table, sets, words[i], oracle[i], counts, generateRecursiveAscent(g, table, { placements }), placements);
        }
      }
    }
    expect(counts.wrong).toBeGreaterThan(400);
  }, 300000);
});
