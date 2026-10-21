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
 *   otherwise, as in rdLanguages.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
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
import { compilePl0 } from '../core/codegen/pl0Compiler';
import { runPcode } from '../core/codegen/pcodeVm';
import { exampleWord } from '../core/generator/exampleWord';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const yieldToRunner = () => new Promise(resolve => setTimeout(resolve, 0));

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
      if (seed % 10 === 0) await yieldToRunner();
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
    for (const lang of ['js', 'python', 'c', 'pl0'] as const) {
      for (const st of sim.steps) for (const key of st.lineKeys) expect(gen.lines[lang].has(key), `${lang} ${key}`).toBe(true);
      expect(gen.code[lang].split('\n')[gen.lines[lang].get(lineKey.proc(1))! - 1]).toMatch(/E1|mine = 1/);
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
    expect(gen.code.js).toMatch(/rightParse\.push\(2\); nt = "S"; count = 0; break; \/\/ reduce 2: S -> eps: goto here/);
    const sim = simulateRecursiveAscent(['a', 'b'], gen, slr);
    expect(sim.steps.map(s => s.kind)).toEqual(['call', 'shift', 'epsilon', 'shift', 'reduce', 'return', 'return', 'goto', 'reduce', 'accept']);
    expect(sim.rightParse).toEqual([2, 1]);

    const g0 = parseGrammar('S -> a S | b').grammar!;
    const lr0 = tables(g0)[0];
    expect(lr0.variant).toBe('LR(0)');
    const gen0 = generateRecursiveAscent(g0, lr0);
    expect(gen0.code.js).toContain('return ["S", 1]; // reduce 2: S -> b (whatever the input symbol)');
    const parse0 = jsParser(gen0.code.js);
    expect(parse0('a a b $').output).toBe('2 1 1 \nOK');
    expect(parse0('a b a $').output).toBe('2 1 \nERR a');
    const early = simulateRecursiveAscent(['a', 'b', 'a'], gen0, lr0);
    expect(early.steps[early.steps.length - 1].text.en).toContain('accept, but the input has not been read');
  });

  it('presets with a conflict-free table: generated, and the example word is accepted with the table-driven right parse', () => {
    let n = 0;
    for (const p of PRESET_GRAMMARS) {
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
      if (i % 20 === 0) await yieldToRunner();
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
    it(label, () => {
      const gen = generateRecursiveAscent(g, table);
      const parse = jsParser(gen.code.js);
      const dir = mkdtempSync(join(tmpdir(), 'ra-'));
      try {
        writeFileSync(join(dir, 'parser.c'), gen.code.c);
        writeFileSync(join(dir, 'parser.py'), gen.code.python);
        const exe = join(dir, process.platform === 'win32' ? 'parser.exe' : 'parser');
        const cc = spawnSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-pedantic', '-Werror', '-o', exe, join(dir, 'parser.c')], { encoding: 'utf8' });
        expect(cc.stderr, `${label}: gcc`).toBe('');
        expect(cc.status).toBe(0);
        const T = [...g.terminals];
        const example = exampleWord(g);
        const words = [...(sample ? [sample] : []), ...(example ? [example, example.slice(0, -1)] : []), ...wordsUpTo(T.slice(0, 3), 3)];
        for (const w of words) {
          const input = inputOf(gen, w);
          const expected = normalize(parse(input).output);
          const c = spawnSync(exe, [], { input, encoding: 'utf8' });
          const py = spawnSync(python!, [join(dir, 'parser.py')], { input, encoding: 'utf8' });
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
