/**
 * Recursive-descent parsers in C and Python: compiled (gcc) and run on right
 * and wrong words, they must print exactly what the PL/0 parser prints on
 * the P-code VM (the left parse, then OK, or ERR and the symbol). Every rule
 * is given as a comment in all four languages. The run needs gcc and Python;
 * where they are missing (they are on the GitHub runners) it is skipped.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
import { buildLLTable } from '../core/ll/llTable';
import { compilePl0 } from '../core/codegen/pl0Compiler';
import { runPcode } from '../core/codegen/pcodeVm';
import { generateRecursiveDescent } from '../core/codegen/recursiveDescent';
import { exampleWord } from '../core/generator/exampleWord';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { prng, randomGrammarText } from './randomGrammar';

const works = (cmd: string, args: string[]) => {
  try {
    return spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
};
const python = ['python3', 'python'].find(cmd => works(cmd, ['--version']));
const gcc = works('gcc', ['--version']);

/** The LL(1) grammars: the presets that are LL(1), and random ones. */
function grammars(): { label: string; g: Grammar; sample?: string[] }[] {
  const out: { label: string; g: Grammar; sample?: string[] }[] = [];
  for (const p of PRESET_GRAMMARS) {
    const g = parseGrammar(p.grammarText).grammar!;
    if (buildLLTable(g, analyzeGrammar(g)).isLL1) out.push({ label: p.id, g, sample: p.sampleInput.split(' ') });
  }
  for (let seed = 1, found = 0; seed < 400 && found < 8; seed++) {
    const g = parseGrammar(randomGrammarText(seed)).grammar!;
    if (g.terminals.size > 0 && buildLLTable(g, analyzeGrammar(g)).isLL1 && exampleWord(g)) {
      out.push({ label: `random ${seed}`, g });
      found++;
    }
  }
  return out;
}

/** Right words (sample, example) and wrong ones (shortened, a symbol doubled, random symbols). */
function inputs(g: Grammar, sample: string[] | undefined, seed: number): string[][] {
  const words: string[][] = [];
  if (sample) words.push(sample);
  const example = exampleWord(g);
  if (example) {
    words.push(example);
    if (example.length > 0) words.push(example.slice(0, -1), [...example.slice(0, 1), ...example]);
  }
  const rnd = prng(seed);
  const T = [...g.terminals];
  words.push(Array.from({ length: 5 }, () => T[Math.floor(rnd() * T.length)]));
  return words;
}

const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

describe('recursive descent in C and Python', () => {
  it('every rule is a comment in all four languages', () => {
    for (const { label, g } of grammars()) {
      const gen = generateRecursiveDescent(g, analyzeGrammar(g));
      for (const p of g.productions) {
        if (!gen.nonTerminals.includes(p.lhs)) continue;
        const rule = `${p.id}: ${p.lhs} -> ${p.rhs.join(' ') || 'eps'}`;
        // inside (* *) and /* */ a closing sequence would be broken up
        if (/\*\)|\(\*|\*\/|\/\*/.test(rule)) continue;
        expect(gen.pl0, `${label} PL/0`).toContain(`(* ${rule} *)`);
        expect(gen.oberon, `${label} Oberon`).toContain(`(* ${rule} *)`);
        expect(gen.c, `${label} C`).toContain(`/* ${rule} */`);
        expect(gen.python, `${label} Python`).toContain(`# ${rule}`);
      }
    }
  });

  describe.skipIf(!gcc || !python)('compiled and run: the same output as the PL/0 program on the P-code VM', () => {
    for (const [i, { label, g, sample }] of grammars().entries()) {
      it(label, () => {
        const gen = generateRecursiveDescent(g, analyzeGrammar(g));
        const pcode = compilePl0(gen.pl0);
        const dir = mkdtempSync(join(tmpdir(), 'rd-'));
        try {
          writeFileSync(join(dir, 'parser.c'), gen.c);
          writeFileSync(join(dir, 'parser.py'), gen.python);
          const exe = join(dir, process.platform === 'win32' ? 'parser.exe' : 'parser');
          const cc = spawnSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-pedantic', '-Werror', '-Wno-unused-function', '-o', exe, join(dir, 'parser.c')], { encoding: 'utf8' });
          expect(cc.stderr, `${label}: gcc`).toBe('');
          expect(cc.status).toBe(0);
          const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
          for (const w of inputs(g, sample, i + 1)) {
            const input = `${w.map(x => charOf.get(x)).join(' ')}$`;
            const expected = normalize(runPcode(pcode, input).output);
            const c = spawnSync(exe, [], { input, encoding: 'utf8' });
            const py = spawnSync(python!, [join(dir, 'parser.py')], { input, encoding: 'utf8' });
            expect(py.stderr, `${label} Python '${input}'`).toBe('');
            expect(normalize(c.stdout), `${label} C '${input}'`).toBe(expected);
            expect(normalize(py.stdout), `${label} Python '${input}'`).toBe(expected);
            // the exit status of the C program tells success
            expect(c.status, `${label} C status '${input}'`).toBe(expected.endsWith('OK') ? 0 : 1);
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }, 60000);
    }
  });
});
