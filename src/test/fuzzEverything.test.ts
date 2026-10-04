/**
 * Random texts (with the special syntax: precedence lines, %prec, quotes,
 * comments, ε forms) through the parser and every analysis and generator:
 * nothing may throw, and the editor text of every grammar reads back as the
 * same grammar.
 */
import { it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { computeAnalysis } from '../core/analysisJob';
import { testMembership } from '../core/parser/membership';
import { cykTable } from '../core/parser/cyk';
import { compareLanguages, checkForm } from '../core/analyser/equivalence';
import { generateRecursiveDescent } from '../core/codegen/recursiveDescent';
import { compilePl0 } from '../core/codegen/pl0Compiler';
import { constructionSteps, mergeSteps } from '../core/lr/lrConstruction';
import { exportGrammarToLatex, exportLRTableToLatex } from '../core/export/latexExport';
import { formatGrammarForEditor } from '../core/ast/grammar';
import { prng } from './randomGrammar';

it('random texts never crash the parser or any analysis', () => {
  const rand = prng(2026);
  const pieces = ['S', 'A', 'B', 'a', 'b', ' ', ' ', '\n', '->', '→', '|', ';', ':', '"', "'", '<', '>', 'ε', '(', ')', '1', '%left', '%right ', '%nonassoc', '%prec', '%%', '{', '}', '#', '/', '*', '=', '::=', 'e', '\t', '[', ']', '+', '-', '$', 'id'];
  let analysed = 0;
  for (let s = 0; s < 20000; s++) {
    const len = 1 + Math.floor(rand() * 30);
    const text = Array.from({ length: len }, () => pieces[Math.floor(rand() * pieces.length)]).join(rand() < 0.5 ? ' ' : '');
    const r = parseGrammar(text);
    if (!r.grammar || r.errors.length || r.grammar.productions.length > 12) continue;
    const g = r.grammar;
    const a = computeAnalysis(g)!;
    expect(a).not.toBeNull();
    analysed++;
    const w = [...g.terminals].slice(0, 2);
    testMembership(g, w, 3);
    cykTable(g, w);
    compareLanguages(g, g, 3);
    checkForm(g, ['reduced', 'epsFree', 'noUnit', 'noLeftRecursion', 'leftFactored', 'll1', 'cnf', 'gnf']);
    constructionSteps(a.lr1Automaton!);
    mergeSteps(a.lalr1Automaton, a.lr1Automaton!, a.lalr1Table, a.lr1Table!);
    exportGrammarToLatex(g);
    exportLRTableToLatex(a.lalr1Table, 'cz', 'lecture');
    if (a.llTable.isLL1) compilePl0(generateRecursiveDescent(g, a.analysis).pl0);
    // the editor text reads back as the same grammar (with its precedence)
    const back = parseGrammar(formatGrammarForEditor(g));
    expect(back.errors, text).toEqual([]);
    expect(back.grammar!.productions, text).toEqual(g.productions);
  }
  console.log(`analysed ${analysed}`);
  expect(analysed).toBeGreaterThan(100);
}, 900000);
