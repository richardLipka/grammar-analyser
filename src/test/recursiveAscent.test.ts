/**
 * Recursive ascent (codegen/recursiveAscent.ts, recursiveAscentSimulator.ts):
 * - on seeded random grammars, for every table that is conflict-free
 *   (LR(0), SLR(1), LALR(1), IELR(1), LR(1)), the generated JavaScript
 *   accepts exactly the words the table-driven LR parser accepts, and those
 *   are exactly the words of L(G) (Earley oracle), all words up to length 5;
 *   it prints the same right parse and stops with ERR at the same symbol;
 * - the step simulator accepts the same words with the same right parse, and
 *   its call stack after every call is the LR state stack after every action
 *   of the table-driven parser;
 * - the PL/0 program on the P-code VM prints what the JavaScript prints;
 * - C (gcc) and Python print the same, where the toolchain exists (skipped
 *   otherwise, as in rdLanguages.test.ts);
 * - the derivation tree after acceptance is the LR parser's tree;
 * - parity with recursive descent: the RD sample programs read by scanInput,
 *   the RD symbol-table actions placed in the automaton (on entering a state or
 *   at the reduction), the same scopes, declarations and lookups, and an
 *   undeclared name stops at the same symbol;
 * - Oberon and the P-code are generated; the JavaScript hooks see the right parse.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { runProgram as run } from './runProgram';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
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
import { simulateLRParse } from '../core/lr/lrParser';
import { GeneratedAscent, canGenerateAscent, generateRecursiveAscent, lineKey } from '../core/codegen/recursiveAscent';
import { simulateRecursiveAscent } from '../core/codegen/recursiveAscentSimulator';
import { ascentEvents, placeEvents, isFreePosition } from '../core/codegen/recursiveAscentActions';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import { suggestSymbolActions, DEFAULT_KEYWORD_CONFIG, tokenClasses, RuleActionDefinition, Scope } from '../core/codegen/symbolTable';
import { scanInput } from '../core/parser/inputTokenizer';
import { RD_SAMPLE_GRAMMARS } from '../core/presets/rdSampleGrammars';
import { formatPcode } from '../core/codegen/pl0Compiler';
import { DerivationNode } from '../core/generator/wordGenerator';
import { compilePl0 } from '../core/codegen/pl0Compiler';
import { runPcode } from '../core/codegen/pcodeVm';
import { exampleWord } from '../core/generator/exampleWord';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const yieldToRunner = () => new Promise(resolve => setTimeout(resolve, 0));

/** A tree without node ids and marks */
const shape = (n?: DerivationNode): unknown => (n ? { s: n.symbol, c: n.children?.map(shape) } : undefined);

/** The tables of all five variants (with the grammar's precedence, as in the app). */
function tables(g: Grammar): LRTable[] {
  const analysis = analyzeGrammar(g, { k2: false });
  const lalr = buildLALR1Automaton(g, analysis);
  const lr1 = buildLR1Automaton(g, analysis);
  attachMergedLR1States(lalr, lr1);
  const ielr = buildIELR1Automaton(g, analysis, lr1, { usePrecedence: true });
  const automata: LRAutomaton[] = [buildLR0Automaton(g), buildSLR1Automaton(g, analysis), lalr, ielr, lr1];
  return automata.map(a => buildLRTable(a, g, analysis));
}

const jsParser = (js: string): ((input: string) => { ok: boolean; rightParse: number[]; output: string }) =>
  new Function(js.replace('export function parse', 'function parse') + '\nreturn parse;')();

const inputOf = (gen: GeneratedAscent, w: string[]) => {
  const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
  return `${w.map(x => charOf.get(x)).join(' ')}$`;
};
const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

/** The conflict-free tables of random grammars with at least one terminal */
function randomCases(count: number, from = 1) {
  const cases: { label: string; g: Grammar; table: LRTable }[] = [];
  for (let seed = from; seed < from + count; seed++) {
    const g = parseGrammar(randomGrammarText(seed)).grammar!;
    if (g.terminals.size === 0) continue;
    for (const table of tables(g)) if (canGenerateAscent(table)) cases.push({ label: `seed ${seed} ${table.variant}`, g, table });
  }
  return cases;
}

describe('recursive ascent: generated JavaScript and the step simulator', () => {
  it('accept exactly L(G) like the table-driven parser, with the same right parse and error symbol (random grammars, words ≤ 5)', async () => {
    let checked = 0;
    let acceptedWords = 0;
    const variants = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const g = parseGrammar(randomGrammarText(seed)).grammar!;
      if (g.terminals.size === 0) continue;
      const words = wordsUpTo([...g.terminals], 5);
      const oracle = words.map(w => accepts(g, w));
      for (const table of tables(g)) {
        if (!canGenerateAscent(table)) continue;
        variants.set(table.variant, (variants.get(table.variant) || 0) + 1);
        const label = `seed ${seed} ${table.variant}`;
        const gen = generateRecursiveAscent(g, table);
        const parse = jsParser(gen.code.js);
        words.forEach((w, i) => {
          const lr = simulateLRParse(w, g, table, 'dragon');
          const res = parse(inputOf(gen, w));
          const sim = simulateRecursiveAscent(w, gen, table);
          const word = w.join(' ') || 'ε';
          expect(lr.accepted, `${label} table-driven = L(G) on '${word}'`).toBe(oracle[i]);
          expect(res.ok, `${label} JavaScript on '${word}'`).toBe(lr.accepted);
          expect(sim.accepted, `${label} simulator on '${word}'`).toBe(lr.accepted);
          const last = lr.steps[lr.steps.length - 1];
          if (lr.accepted) {
            acceptedWords++;
            expect(res.rightParse, `${label} right parse '${word}'`).toEqual(last.rightParse);
            expect(sim.rightParse, `${label} simulator right parse '${word}'`).toEqual(last.rightParse);
            expect(shape(sim.finalTree), `${label} tree '${word}'`).toEqual(shape(lr.finalTree));
          } else {
            const errTok = last.remainingInput[0];
            const errChar = errTok === '$' ? '$' : gen.tokens.find(t => t.terminal === errTok)!.char;
            expect(res.output.endsWith(`ERR ${errChar}`), `${label} error symbol '${word}': ${res.output}`).toBe(true);
            expect(sim.steps[sim.steps.length - 1].lookahead, `${label} simulator error symbol '${word}'`).toBe(last.remainingInput[0]);
          }
          // The call stack after every call = the state stack after every shift and reduction
          const lrStacks = lr.steps.slice(0, -1).map((_, j) => lr.steps[j + 1].stateStack.join(' '));
          const calls = sim.steps.filter(s => s.kind === 'shift' || s.kind === 'goto' || s.kind === 'epsilon').map(s => s.frames.join(' '));
          expect(calls, `${label} stacks '${word}'`).toEqual(lrStacks);
        });
        checked++;
      }
      await yieldToRunner();
    }
    // every variant occurs, and not only rejections are checked
    expect([...variants.keys()].sort()).toEqual(['IELR(1)', 'LALR(1)', 'LR(0)', 'LR(1)', 'SLR(1)']);
    expect(checked).toBeGreaterThan(300);
    expect(acceptedWords).toBeGreaterThan(1000);
  }, 300000);

  it('the expression grammar: procedures named by the lecture states, items as comments, right parse', () => {
    const g = parseGrammar('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a').grammar!;
    const slr = tables(g)[1];
    const gen = generateRecursiveAscent(g, slr);
    expect(gen.states.map(s => s.name)).toEqual(slr.stateNames.map(n => n.text));
    expect(gen.states.map(s => s.proc)).toEqual(['start', 'E1', 'T1', 'F1', 'lparen', 'a', 'plus', 'times', 'E2', 'T2', 'F2', 'rparen']);
    expect(gen.code.js).toContain('  // state E₁ (1)\n  //   E\' -> E •\n  //   E -> E • + T\n  function E1() {');
    expect(gen.code.python).toContain('# state T₁ (2)\n#   E -> T •\n#   T -> T • * F\ndef T1():');
    expect(gen.code.c).toContain('/* state F₁ (3)\n *   T -> F •\n */\nstatic int F1(void)');
    expect(gen.code.pl0).toContain('  (* state E1 (1) *)\n  (*   E\' -> E . *)');
    const res = jsParser(gen.code.js)('a + a * a $');
    expect(res.output).toBe('6 4 2 6 4 6 3 1 \nOK');
    // every line key of a step exists in every language
    const sim = simulateRecursiveAscent(['a', '+', 'a', '*', 'a'], gen, slr);
    for (const lang of ['js', 'python', 'c', 'oberon', 'pl0'] as const) {
      for (const st of sim.steps) for (const key of st.lineKeys.filter(k => !k.startsWith('entry:'))) expect(gen.lines[lang].has(key), `${lang} ${key}`).toBe(true);
      expect(gen.code[lang].split('\n')[gen.lines[lang].get(lineKey.proc(1))! - 1]).toMatch(/E1|E₁|mine = 1/);
    }
    expect(sim.steps.map(s => s.kind)).toEqual([
      'call', 'shift', 'reduce', 'goto', 'reduce', 'goto', 'reduce', 'goto', 'shift', 'shift', 'reduce', 'goto', 'reduce', 'goto',
      'shift', 'shift', 'reduce', 'goto', 'reduce', 'return', 'return', 'goto', 'reduce', 'return', 'return', 'goto', 'reduce', 'accept'
    ]);
  });

  it('ε-rules do the goto inline; LR(0) reduces whatever the input symbol and accepts only at the end', () => {
    const g = parseGrammar('S -> a S b | ε').grammar!;
    const slr = tables(g)[1];
    const gen = generateRecursiveAscent(g, slr);
    expect(gen.code.js).toContain('[nt, count] = reduce(2, "S", []); break; // reduce 2: S -> eps: goto here');
    const sim = simulateRecursiveAscent(['a', 'b'], gen, slr);
    expect(sim.steps.map(s => s.kind)).toEqual(['call', 'shift', 'epsilon', 'shift', 'reduce', 'return', 'return', 'goto', 'reduce', 'accept']);
    expect(sim.rightParse).toEqual([2, 1]);

    const g0 = parseGrammar('S -> a S | b').grammar!;
    const lr0 = tables(g0)[0];
    expect(lr0.variant).toBe('LR(0)');
    const gen0 = generateRecursiveAscent(g0, lr0);
    expect(gen0.code.js).toContain('return reduce(2, "S", ["b"]); // reduce 2: S -> b (whatever the input symbol)');
    const parse0 = jsParser(gen0.code.js);
    expect(parse0('a a b $').output).toBe('2 1 1 \nOK');
    expect(parse0('a b a $').output).toBe('2 1 \nERR a');
    const early = simulateRecursiveAscent(['a', 'b', 'a'], gen0, lr0);
    expect(early.steps[early.steps.length - 1].text.en).toContain('accept, but the input has not been read');
  });

  it('presets with a conflict-free table: generated, and the example word is accepted with the table-driven right parse', async () => {
    let n = 0;
    for (const p of PRESET_GRAMMARS) {
      await yieldToRunner();
      const g = parseGrammar(p.grammarText).grammar!;
      const word = exampleWord(g);
      if (!word || g.terminals.size > 60) continue;
      for (const table of tables(g)) {
        if (!canGenerateAscent(table)) continue;
        const gen = generateRecursiveAscent(g, table);
        expect(new Set(gen.states.map(s => s.proc)).size, `${p.id} unique names`).toBe(gen.states.length);
        const res = jsParser(gen.code.js)(inputOf(gen, word));
        const lr = simulateLRParse(word, g, table, 'dragon');
        expect(res.ok, `${p.id} ${table.variant}`).toBe(true);
        expect(res.rightParse, `${p.id} ${table.variant}`).toEqual(lr.steps[lr.steps.length - 1].rightParse);
        n++;
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it('non-terminals and terminals named like the names of the programs', () => {
    const g = parseGrammar('nt -> count state next | ε\ncount -> start lhs\nstate -> cnt | mine act\nlhs -> rightParse | error').grammar!;
    for (const table of tables(g)) {
      if (!canGenerateAscent(table)) continue;
      const gen = generateRecursiveAscent(g, table);
      const parse = jsParser(gen.code.js);
      const pcode = compilePl0(gen.code.pl0);
      for (const w of [['start', 'rightParse', 'cnt', 'next'], ['start', 'error', 'mine', 'act', 'next'], [], ['start']]) {
        const input = inputOf(gen, w);
        const res = parse(input);
        expect(res.ok, `${table.variant} ${w.join(' ')}`).toBe(accepts(g, w));
        expect(normalize(res.output)).toBe(normalize(runPcode(pcode, input).output));
      }
    }
  });
});

describe('recursive ascent in PL/0 on the P-code VM', () => {
  it('prints what the JavaScript prints (random grammars, words ≤ 4)', async () => {
    let runs = 0;
    for (const [i, { label, g, table }] of randomCases(120).entries()) {
      const gen = generateRecursiveAscent(g, table);
      const parse = jsParser(gen.code.js);
      const pcode = compilePl0(gen.code.pl0);
      for (const w of wordsUpTo([...g.terminals], 4)) {
        const input = inputOf(gen, w);
        const vm = runPcode(pcode, input);
        expect(vm.error, `${label} '${input}'`).toBeUndefined();
        expect(normalize(vm.output), `${label} '${input}'`).toBe(normalize(parse(input).output));
        runs++;
      }
      await yieldToRunner();
    }
    expect(runs).toBeGreaterThan(10000);
  }, 300000);
});

const works = (cmd: string, args: string[]) => {
  try {
    return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
};
const canCompileC = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ra-cc-'));
  try {
    return spawnSync('gcc', ['-x', 'c', '-', '-o', join(dir, 'probe')], { input: 'int main(void){return 0;}', encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const python = ['python3', 'python'].find(cmd => works(cmd, ['--version']));
const gcc = canCompileC();

describe.skipIf(!gcc || !python)('recursive ascent in C and Python: compiled and run, the same output as JavaScript', () => {
  const cases = [
    ...PRESET_GRAMMARS.filter(p => ['arithmetic_unambiguous', 'lang_pl0'].includes(p.id)).flatMap(p => {
      const g = parseGrammar(p.grammarText).grammar!;
      return tables(g).filter(canGenerateAscent).slice(0, 2).map(table => ({ label: `${p.id} ${table.variant}`, g, table, sample: p.sampleInput.split(' ') }));
    }),
    ...randomCases(60).filter((_, i) => i % 6 === 0).map(c => ({ ...c, sample: undefined as string[] | undefined }))
  ];
  for (const { label, g, table, sample } of cases) {
    it(label, async () => {
      const gen = generateRecursiveAscent(g, table);
      const parse = jsParser(gen.code.js);
      const dir = mkdtempSync(join(tmpdir(), 'ra-'));
      try {
        writeFileSync(join(dir, 'parser.c'), gen.code.c);
        writeFileSync(join(dir, 'parser.py'), gen.code.python);
        const exe = join(dir, process.platform === 'win32' ? 'parser.exe' : 'parser');
        const cc = await run('gcc', ['-std=c99', '-Wall', '-Wextra', '-pedantic', '-Werror', '-o', exe, join(dir, 'parser.c')]);
        expect(cc.stderr, `${label}: gcc`).toBe('');
        expect(cc.status).toBe(0);
        const T = [...g.terminals];
        const example = exampleWord(g);
        const words = [...(sample ? [sample] : []), ...(example ? [example, example.slice(0, -1)] : []), ...wordsUpTo(T.slice(0, 3), 3)];
        for (const w of words) {
          const input = inputOf(gen, w);
          const expected = normalize(parse(input).output);
          const [c, py] = await Promise.all([run(exe, [], input), run(python!, [join(dir, 'parser.py')], input)]);
          expect(py.stderr, `${label} Python '${input}'`).toBe('');
          expect(normalize(c.stdout), `${label} C '${input}'`).toBe(expected);
          expect(normalize(py.stdout), `${label} Python '${input}'`).toBe(expected);
          expect(c.status, `${label} C status '${input}'`).toBe(expected.endsWith('OK') ? 0 : 1);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 120000);
  }
});

/** The scopes of a symbol table as text: name[symbol kind type, …] */
const scopesText = (scopes: Scope[]) => scopes.map(sc => `${sc.name}[${sc.symbols.map(x => `${x.name} ${x.kind}${x.type ? ` ${x.type}` : ''}`).join(', ')}]`).join(' ');

describe('recursive ascent and recursive descent: the same input, the same symbol table', () => {
  for (const sample of RD_SAMPLE_GRAMMARS) {
    it(sample.id, () => {
      const g = parseGrammar(sample.grammarText).grammar!;
      const analysis = analyzeGrammar(g);
      const actions = suggestSymbolActions(g, DEFAULT_KEYWORD_CONFIG);
      const scanned = scanInput(sample.namedInput, g.terminals, tokenClasses(g.terminals));
      expect(scanned.unknown).toEqual([]);
      const rd = simulateRecursiveDescent(scanned.tokens, g, analysis, { ruleActions: actions, lexemes: scanned.lexemes });
      const rdLast = rd.steps[rd.steps.length - 1];
      let checked = 0;
      for (const table of tables(g)) {
        if (!canGenerateAscent(table)) continue;
        const placements = placeEvents(g, table, ascentEvents(g, actions));
        // every detected action of the samples is known at a transition: nothing is late
        expect(placements.filter(p => p.late), `${sample.id} ${table.variant}`).toEqual([]);
        const gen = generateRecursiveAscent(g, table, { placements });
        const sim = simulateRecursiveAscent(scanned.tokens, gen, table, { lexemes: scanned.lexemes, placements });
        const lr = simulateLRParse(scanned.tokens, g, table, 'dragon');
        expect(sim.accepted, `${sample.id} ${table.variant}`).toBe(true);
        expect(rd.accepted).toBe(true);
        expect(sim.rightParse).toEqual(lr.steps[lr.steps.length - 1].rightParse);
        expect(shape(sim.finalTree)).toEqual(shape(lr.finalTree));
        // the derivation tree is the one of recursive descent (an LL(1) grammar has one tree per word)
        expect(shape(sim.finalTree)).toEqual(shape(rd.finalTree));
        const last = sim.steps[sim.steps.length - 1];
        // without actions there is no symbol table (recursive descent keeps an empty global scope)
        if (placements.length > 0) expect(scopesText(last.symbolTable?.allScopes ?? []), `${sample.id} ${table.variant} scopes`).toBe(scopesText(rdLast.symbolTableSnapshot.allScopes));
        else expect(last.symbolTable).toBeUndefined();
        const lookups = (xs: { lookup?: { name: string; scopeName?: string } }[]) => xs.filter(x => x.lookup).map(x => `${x.lookup!.name} -> ${x.lookup!.scopeName ?? '-'}`);
        expect(lookups(sim.steps.filter(x => x.kind !== 'error')), `${sample.id} ${table.variant} lookups`).toEqual(lookups(rd.steps));
        // the comments of the program say which actions run on entering which state
        if (placements.length > 0) expect(gen.code.js).toContain('//   on entry: rule ');
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('PL/0: an undeclared name stops recursive ascent at the same symbol as recursive descent', () => {
    const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === 'rd_sample_pl0')!;
    const g = parseGrammar(sample.grammarText).grammar!;
    const analysis = analyzeGrammar(g);
    const actions = suggestSymbolActions(g, DEFAULT_KEYWORD_CONFIG);
    // z is not declared anywhere; x of p is not visible in the main program
    for (const program of [sample.namedInput.replace('! x end', '! z end'), 'var y ; procedure p ; var x ; x := 1 ; begin x := 2 end .']) {
      const scanned = scanInput(program, g.terminals, tokenClasses(g.terminals));
      expect(scanned.unknown).toEqual([]);
      const rd = simulateRecursiveDescent(scanned.tokens, g, analysis, { ruleActions: actions, lexemes: scanned.lexemes });
      expect(rd.semanticError, program).toBe(true);
      const table = tables(g)[1];
      expect(canGenerateAscent(table)).toBe(true);
      const placements = placeEvents(g, table, ascentEvents(g, actions));
      const gen = generateRecursiveAscent(g, table, { placements });
      const sim = simulateRecursiveAscent(scanned.tokens, gen, table, { lexemes: scanned.lexemes, placements });
      expect(sim.accepted).toBe(false);
      expect(sim.semanticError).toBe(true);
      const last = sim.steps[sim.steps.length - 1];
      expect(last.kind).toBe('error');
      expect(last.text.en).toMatch(/^Semantic error: the name '(z|x)' is not declared/);
      // RD stops right after matching the name; RA right after shifting it
      expect(last.position).toBe(rd.steps[rd.steps.length - 1].lookaheadIndex);
      // switched off, the word is accepted and the name reported
      const lenient = simulateRecursiveAscent(scanned.tokens, gen, table, { lexemes: scanned.lexemes, placements, stopOnSemanticErrors: false });
      expect(lenient.accepted).toBe(true);
      expect(lenient.undeclared.map(u => u.name)).toEqual(rd.undeclared.length ? [...new Set(simulateRecursiveDescent(scanned.tokens, g, analysis, { ruleActions: actions, lexemes: scanned.lexemes, stopOnSemanticErrors: false }).undeclared.map(u => u.name))] : []);
    }
  });

  it('places actions on entering a state when the kernel fixes the rule, otherwise at the reduction (late, free position)', () => {
    const g = parseGrammar('P -> begin L end\nL -> S L | ε\nS -> id ";" | id "=" id ";"').grammar!;
    const [p1, , , s1, s2] = g.productions;
    const actions: RuleActionDefinition[] = [
      { ruleId: p1.id, actionType: 'enterScope', position: 1, closeAfter: 1, scopeName: 'block' },
      { ruleId: s1.id, actionType: 'addSymbol', position: 0, symbolKind: 'var' },
      { ruleId: p1.id, actionType: 'custom', jsCode: 'ctx.symTab.addSymbol("seen")' }
    ];
    const table = tables(g)[1];
    expect(table.variant).toBe('SLR(1)');
    expect(canGenerateAscent(table)).toBe(true);
    const placements = placeEvents(g, table, ascentEvents(g, actions));
    const where = placements.map(p => `${p.rule.id}:${p.op}@${p.dot}:${p.where}${p.late ? ':late' : ''}${p.freePosition !== undefined ? `:free=${p.freePosition}` : ''}`);
    expect(where).toEqual([
      `${p1.id}:open@1:transition`,
      `${p1.id}:close@2:transition`,
      // after id the kernel holds S -> id • ; and S -> id • = id ; – the rule is known only at the reduction
      `${s1.id}:declare@1:reduction:late:free=true`,
      // the start of a rule is never known
      `${p1.id}:custom@0:reduction:late:free=true`
    ]);
    const scanned = scanInput('begin x ; x = x ; end', g.terminals, tokenClasses(g.terminals));
    const gen = generateRecursiveAscent(g, table, { placements });
    const sim = simulateRecursiveAscent(scanned.tokens, gen, table, { lexemes: scanned.lexemes, placements });
    expect(sim.accepted).toBe(true);
    const last = sim.steps[sim.steps.length - 1];
    expect(scopesText(last.symbolTable!.allScopes)).toBe('global[seen var unknown] block[x var]');
    // the uses of x in x = x: the first is undecided at its shift (decided at the reduction), the second is known at once
    const uses = sim.steps.flatMap(st => st.actions.filter(a => !a.placement).map(a => a.text.en));
    expect(uses.filter(t => t.includes('is a declaration in some items')).length).toBe(2);
    expect(uses.filter(t => t.startsWith("the name 'x' is found")).map(t => t.endsWith('(decided at the reduction)'))).toEqual([false, true]);
    // the declaration is late and says so
    const decl = sim.steps.flatMap(st => st.actions).find(a => a.placement?.op === 'declare')!;
    expect(decl.late).toBe(true);
    expect(decl.text.en).toContain('later than in recursive descent');
    expect(gen.code.js).toContain('actions here: rule');
    // a marker where it would cause a conflict: S -> M a b | a c
    const h = parseGrammar('S -> a b | a c').grammar!;
    expect(isFreePosition(h, 'SLR(1)', h.productions[0], 0)).toBe(false);
    expect(isFreePosition(h, 'SLR(1)', h.productions[0], 1)).toBe(true);
  });

  it('Oberon and the P-code are generated for the presets; the JavaScript hooks see every reduction', async () => {
    let n = 0;
    for (const p of PRESET_GRAMMARS) {
      await yieldToRunner();
      const g = parseGrammar(p.grammarText).grammar!;
      const table = tables(g).find(canGenerateAscent);
      if (!table) continue;
      const gen = generateRecursiveAscent(g, table);
      expect(gen.code.oberon.startsWith('MODULE Parser;'), p.id).toBe(true);
      expect(gen.code.oberon.trimEnd().endsWith('END Parser.')).toBe(true);
      expect(gen.code.oberon.match(/^ {6}\| \d+: \(\* state /gm)?.length ?? 0).toBe(gen.states.length - 1);
      for (const st of gen.states) expect(gen.code.oberon).toContain(`${st.id}: (* state ${st.name.replace(/\*\)/g, '* )')} (${st.id}) *)`);
      // every IF, WHILE, CASE, PROCEDURE and the MODULE has its END (comments and strings left out)
      const code = gen.code.oberon.replace(/\(\*.*?\*\)/g, '').replace(/"[^"]*"/g, '');
      const words = (w: string) => (code.match(new RegExp(`\\b${w}\\b`, 'g')) || []).length;
      expect(words('END'), p.id).toBe(words('IF') + words('WHILE') + words('CASE') + words('PROCEDURE') + words('MODULE'));
      expect(gen.code.pcode).toBe(formatPcode(compilePl0(gen.code.pl0)));
      const word = exampleWord(g);
      if (word) {
        const rules: number[] = [];
        const parse = new Function(gen.code.js.replace('export function parse', 'function parse') + '\nreturn parse;')();
        const res = parse(inputOf(gen, word), { onRule: (r: number) => rules.push(r) });
        expect(res.ok, p.id).toBe(true);
        expect(rules).toEqual(res.rightParse);
      }
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });
});
