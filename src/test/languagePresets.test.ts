/**
 * The presets "Constructs of real languages": every property their
 * descriptions state is checked here.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { buildLLTable } from '../core/ll/llTable';
import { buildLALR1Automaton, buildLR0Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { findAmbiguity } from '../core/analyser/ambiguity';
import { eliminateImmediateLeftRecursionForSymbol, leftFactorGrammar } from '../core/processor/grammarProcessor';
import { transformToLL1 } from '../core/processor/ll1Transformer';
import { testMembership } from '../core/parser/membership';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { DerivationNode } from '../core/generator/wordGenerator';
import { generateRecursiveDescent } from '../core/codegen/recursiveDescent';
import { compilePl0 } from '../core/codegen/pl0Compiler';
import { runPcode } from '../core/codegen/pcodeVm';

const preset = (id: string): Grammar => {
  const p = PRESET_GRAMMARS.find(x => x.id === id);
  expect(p, id).toBeDefined();
  const res = parseGrammar(p!.grammarText);
  expect(res.errors, id).toEqual([]);
  expect(res.warnings, id).toEqual([]);
  return res.grammar!;
};
const classes = (g: Grammar, usePrecedence = false) => {
  const a = analyzeGrammar(g);
  const ll = buildLLTable(g, a);
  const lr = (aut: Parameters<typeof buildLRTable>[0]) => buildLRTable(aut, g, a, { usePrecedence });
  return {
    LL1: ll.isLL1,
    LL2: ll.isLL2,
    strongLL2: ll.isStrongLL2,
    LR0: lr(buildLR0Automaton(g, 'LR(0)')).isConflictFree,
    SLR: lr(buildLR0Automaton(g, 'SLR(1)')).isConflictFree,
    LALR: lr(buildLALR1Automaton(g, a)).isConflictFree,
    LR1: lr(buildLR1Automaton(g, a)).isConflictFree
  };
};
const isLL1 = (g: Grammar) => buildLLTable(g, analyzeGrammar(g)).isLL1;
const bracket = (n: DerivationNode): string =>
  n.children && n.children.length > 0 ? `${n.symbol}(${n.children.map(bracket).join(' ')})` : n.symbol;

describe('Constructs of real languages', () => {
  it('form their own group of presets, each sample in its language', () => {
    const ids = PRESET_GRAMMARS.filter(p => p.category === 'Languages').map(p => p.id);
    expect(ids.length).toBe(11);
    for (const id of ids) {
      const p = PRESET_GRAMMARS.find(x => x.id === id)!;
      expect(testMembership(preset(id), p.sampleInput.split(' ')).accepted, id).toBe(true);
    }
  });

  it('if–else with matched/open statements: unambiguous, SLR(1) and LALR(1), not LL(k)', () => {
    const g = preset('lang_if_matched');
    expect(classes(g)).toMatchObject({ LL1: false, LL2: false, SLR: true, LALR: true, LR1: true });
    expect(transformToLL1(g).success).toBe(false);
    expect(testMembership(g, 'if ( cond ) if ( cond ) other ; else other ;'.split(' ')).treeCount).toBe(1);
  });

  it('if–then–else with %nonassoc: ambiguous, the precedence attaches else to the nearest if', () => {
    const g = preset('lang_if_precedence');
    expect(findAmbiguity(g).kind).toBe('ambiguous');
    expect(classes(g).LALR).toBe(false);
    const a = analyzeGrammar(g);
    const t = buildLRTable(buildLALR1Automaton(g, a), g, a);
    expect(t.isConflictFree).toBe(true);
    expect(t.resolvedConflicts.map(r => r.symbol)).toEqual(['else']);
    const tree = simulateLRParse('if cond then if cond then other else other'.split(' '), g, t).finalTree!;
    expect(bracket(tree)).toBe('Statement(if cond then Statement(if cond then Statement(other) else Statement(other)))');
  });

  it('if … end if: LL(1) and unambiguous', () => {
    expect(classes(preset('lang_if_end'))).toMatchObject({ LL1: true, SLR: true });
  });

  it('while and for loops: LL(1), the optional parts decided by FOLLOW', () => {
    const g = preset('lang_loops');
    expect(isLL1(g)).toBe(true);
    expect([...analyzeGrammar(g).follow1.get('OptionalExpression')!].sort()).toEqual([')', ';']);
  });

  it('variable declarations: SLR(1), not LL(1); without the left recursion LL(1)', () => {
    const g = preset('lang_var_decl');
    expect(classes(g)).toMatchObject({ LL1: false, SLR: true });
    expect(isLL1(eliminateImmediateLeftRecursionForSymbol(g, 'DeclaratorList').transformedGrammar)).toBe(true);
    expect(transformToLL1(g).success).toBe(true);
  });

  it('function declaration: strong LL(2), not LL(1); left factoring gives LL(1)', () => {
    const g = preset('lang_func_decl');
    expect(classes(g)).toMatchObject({ LL1: false, LL2: true, strongLL2: true, SLR: true });
    expect(isLL1(leftFactorGrammar(g).transformedGrammar)).toBe(true);
  });

  it('lambda call: unambiguous on short words, but LR(1) has reduce/reduce and shift/reduce conflicts', () => {
    const g = preset('lang_lambda_call');
    const a = analyzeGrammar(g);
    const t = buildLRTable(buildLR1Automaton(g, a), g, a);
    expect(t.conflicts.map(c => c.type).sort()).toEqual(['Reduce/Reduce', 'Shift/Reduce']);
    expect(findAmbiguity(g, { maxLength: 9 }).kind).toBe('none-found');
    expect(isLL1(g)).toBe(false);
  });

  it('a * b ; in C: ambiguous', () => {
    const r = findAmbiguity(preset('lang_c_typedef'));
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.word).toEqual(['id', '*', 'id', ';']);
  });

  it('assignment or call: not LL(1), left factoring gives LL(1)', () => {
    const g = preset('lang_assign_call');
    expect(classes(g)).toMatchObject({ LL1: false, SLR: true });
    expect(isLL1(leftFactorGrammar(g).transformedGrammar)).toBe(true);
  });

  it('S-expressions: LR(0) with a left-recursive list; LL(1) but not LR(0) with a right-recursive one', () => {
    const g = preset('lang_sexpr');
    expect(classes(g)).toMatchObject({ LL1: false, LR0: true });
    const a = analyzeGrammar(g);
    expect(buildLRTable(buildLR0Automaton(g, 'LR(0)'), g, a).fConflicts).toEqual([]);
    const right = parseGrammar('SExpression → atom | ( List )\nList → SExpression List | ε').grammar!;
    expect(classes(right)).toMatchObject({ LL1: true, LR0: false });
  });

  it('PL/0: LL(1) and SLR(1), not LR(0); the parser generated in PL/0 nests its procedures and parses the sample', () => {
    const g = preset('lang_pl0');
    expect(classes(g)).toMatchObject({ LL1: true, LR0: false, SLR: true, LALR: true, LR1: true });
    const sample = PRESET_GRAMMARS.find(x => x.id === 'lang_pl0')!.sampleInput.split(' ');
    const membership = testMembership(g, sample);
    expect(membership.treeCount).toBe(1);
    const gen = generateRecursiveDescent(g, analyzeGrammar(g));
    expect(gen.nested).toBe(true);
    const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
    const run = runPcode(compilePl0(gen.pl0), `${sample.map(t => charOf.get(t)).join('')}$`);
    // the left parse of the generated parser is the leftmost derivation of the only tree
    expect(run.output.trim()).toBe(`${membership.trees[0].leftParse.join(' ')} \nOK`);
  });
});
