/**
 * Recursive-descent parsers generated in PL/0 and Oberon: the PL/0 program is
 * compiled to P-code and run on every short word; it must accept exactly the
 * language and print the left parse of the LL(1) simulator.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar } from '../core/ast/grammar';
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import { compilePl0, formatPcode } from '../core/codegen/pl0Compiler';
import { runPcode } from '../core/codegen/pcodeVm';
import { generateRecursiveDescent, tokenCodes } from '../core/codegen/recursiveDescent';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

/** Generates, compiles and runs the parser on every word up to maxLen; checks against Earley and the LL(1) simulator. */
function checkParser(g: Grammar, maxLen: number, label: string) {
  const a = analyzeGrammar(g);
  const ll = buildLLTable(g, a);
  expect(ll.isLL1, label).toBe(true);
  const gen = generateRecursiveDescent(g, a);
  const code = compilePl0(gen.pl0);
  const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
  for (const w of wordsUpTo([...g.terminals], maxLen)) {
    const input = `${w.map(x => charOf.get(x)).join(' ')}$`;
    const run = runPcode(code, input);
    const where = `${label} '${w.join(' ')}'`;
    expect(run.error, where).toBeUndefined();
    const sim = simulateLLParse(w, g, ll);
    if (accepts(g, w)) {
      const leftParse = sim.steps[sim.steps.length - 1].leftParse;
      expect(run.output, where).toBe(`${leftParse.map(n => `${n} `).join('')}\nOK`);
    } else {
      expect(run.output, where).toContain('\nERR ');
      expect(sim.accepted, where).toBe(false);
    }
  }
  return gen;
}

describe('PL/0 compiler and P-code', () => {
  it('compiles and runs a PL/0 program with nested procedures, recursion and character output', () => {
    const src = `
const zero = 48;
var n, f;
procedure fact;
  var k;
  procedure mul;
  begin f := f * k end;
begin
  if n > 1 then
  begin
    k := n; call mul; n := n - 1; call fact
  end
end;
begin
  n := 5; f := 1; call fact;
  ! zero + f / 100; ! zero + f / 10 - f / 100 * 10; ! zero + f - f / 10 * 10;
  ? n; ! n; if odd 3 then ! 33
end.`;
    const code = compilePl0(src);
    expect(runPcode(code, 'x')).toEqual({ output: '120x!', steps: expect.any(Number) });
    expect(formatPcode(code).split('\n')[0]).toMatch(/^JMP 0, \d+$/);
    expect(() => compilePl0('begin x := 1 end.')).toThrow(/not declared/);
  });
});

describe('Recursive-descent parsers', () => {
  it('parses the LL(1) expression grammar with nested procedures (as in Wirth\'s compiler)', () => {
    const g = parse("E -> T E'\nE' -> + T E' | ε\nT -> F T'\nT' -> * F T' | ε\nF -> ( E ) | id");
    const gen = checkParser(g, 4, 'expr');
    expect(gen.nested).toBe(true);
    expect(gen.tokens.find(t => t.terminal === 'id')!.char).toBe('i');
    expect(gen.pl0).toContain('procedure Eprime;');
    expect(gen.oberon).toContain('PROCEDURE Eprime;');
    expect(gen.oberon).toContain('MODULE Parser;');
    const run = runPcode(compilePl0(gen.pl0), 'i+i*(i)$');
    expect(run.output.endsWith('OK')).toBe(true);
    expect(runPcode(compilePl0(gen.pl0), 'i+*i$').output).toContain('ERR *');
  });

  it('falls back to one dispatching procedure when nesting cannot express the calls', () => {
    // A calls C, but the search reaches C through B first: C is nested in B, invisible to A
    const g = parse('A -> B C\nB -> C b | x\nC -> c');
    const gen = checkParser(g, 4, 'dispatch');
    expect(gen.nested).toBe(false);
    expect(gen.pl0).toContain('procedure parse;');
    expect(gen.oberon).toContain('pC: PROCEDURE;');
  });

  it('gives multi-character and non-ASCII terminals substitute characters', () => {
    const codes = tokenCodes(parse('S -> if c then S | "→" S | x'));
    const chars = codes.map(c => c.char);
    expect(new Set(chars).size).toBe(chars.length);
    expect(codes.every(c => c.code > 32 && c.code < 127 && c.char !== '$')).toBe(true);
    expect(codes.find(c => c.terminal === 'if')!.name).toBe('tif');
  });

  it('works for the LL(1) presets and random LL(1) grammars', () => {
    let checked = 0;
    const texts = [...PRESET_GRAMMARS.map(p => p.grammarText), ...Array.from({ length: 300 }, (_, s) => randomGrammarText(s + 1))];
    for (const text of texts) {
      const res = parseGrammar(text);
      if (res.errors.length || !res.grammar) continue;
      const g = res.grammar;
      const a = analyzeGrammar(g);
      if (!buildLLTable(g, a).isLL1) continue;
      const gen = checkParser(g, g.terminals.size > 4 ? 2 : 4, text.split('\n')[0]);
      expect(gen.oberon.split('PROCEDURE').length - 1).toBeGreaterThanOrEqual(gen.nonTerminals.length);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});
