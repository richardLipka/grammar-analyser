/**
 * "Check my transformation" on the implemented transformations: every
 * whole-grammar transformation and every click-mode transformation of every
 * non-terminal and right-hand-side occurrence of every preset goes the way of
 * the tab — the result written as editor text, read back as "your grammar"
 * and compared with the original — and must give the same language.
 * Grammars modified by removing or adding a rule: every difference found is
 * confirmed by the Earley recognizer and by the explanation under each
 * grammar (one derives the word, the other's attempt breaks off), and "no
 * difference" is confirmed by brute force on short words.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar, formatGrammarForEditor, transferPrecedence } from '../core/ast/grammar';
import { compareLanguages } from '../core/analyser/equivalence';
import { explainWord } from '../core/parser/derivationAttempt';
import {
  applySymbolTransformation,
  getAvailableTransformationsForOccurrence,
  getAvailableTransformationsForSymbol
} from '../core/processor/grammarProcessor';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { WHOLE_GRAMMAR_TRANSFORMATIONS } from '../ui/wholeGrammarTransformations';
import { accepts, wordsUpTo } from './earley';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

/** The grammar as the tab gets it: written into a text field and read back. */
const throughText = (source: Grammar, g: Grammar): Grammar => parse(formatGrammarForEditor(transferPrecedence(source, g)));

/** Words up to this length: a few thousand at most over the joint alphabet. */
const lengthFor = (g1: Grammar, g2: Grammar) => {
  const size = new Set([...g1.terminals, ...g2.terminals]).size;
  return Math.max(3, Math.min(8, Math.floor(Math.log(4000) / Math.log(Math.max(2, size)))));
};

/** Every transformation the user can apply to the grammar, with its result. */
function allTransformations(g: Grammar): { name: string; result: Grammar }[] {
  const out: { name: string; result: Grammar }[] = [];
  for (const tr of WHOLE_GRAMMAR_TRANSFORMATIONS) {
    const r = tr.fn(g);
    if (r.steps.length > 0) out.push({ name: tr.id, result: r.transformedGrammar });
  }
  const actions = new Map<string, string>();
  for (const nt of g.nonTerminals) {
    for (const a of getAvailableTransformationsForSymbol(g, nt)) actions.set(`${nt}|${a.id}`, nt);
  }
  for (const p of g.productions) {
    p.rhs.forEach((_, position) => {
      for (const a of getAvailableTransformationsForOccurrence(g, { productionId: p.id, position })) actions.set(`${p.rhs[position]}|${a.id}`, p.rhs[position]);
    });
  }
  for (const [key, nt] of actions) {
    const r = applySymbolTransformation(g, nt, key.slice(nt.length + 1));
    if (r.steps.length > 0) out.push({ name: key, result: r.transformedGrammar });
  }
  return out;
}

describe('check my transformation on the implemented transformations', () => {
  it('every transformation of every preset keeps the language', () => {
    let checked = 0;
    for (const preset of PRESET_GRAMMARS) {
      const original = parse(preset.grammarText);
      // "Start from the original" gives the same language too
      expect(compareLanguages(original, throughText(original, original), 6).kind, preset.id).toBe('same-up-to');
      for (const { name, result } of allTransformations(original)) {
        const student = throughText(original, result);
        const r = compareLanguages(original, student, lengthFor(original, student));
        expect(r.kind, `${preset.id} ${name}: ${r.kind === 'different' ? r.word.join(' ') : ''}`).toBe('same-up-to');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  }, 300000);
});

describe('check my transformation on modified grammars', () => {
  /** Grammars with one rule removed, and with a rule added (a copy of a rule with its last symbol doubled). */
  function modifications(g: Grammar): { name: string; text: string }[] {
    const lines = (ps: Grammar['productions']) => ps.map(p => `${p.lhs} -> ${p.rhs.map(s => (g.nonTerminals.has(s) ? s : JSON.stringify(s))).join(' ') || 'ε'}`);
    const out: { name: string; text: string }[] = [];
    const startRules = g.productions.filter(p => p.lhs === g.startSymbol);
    const ordered = [...startRules, ...g.productions.filter(p => p.lhs !== g.startSymbol)];
    ordered.forEach((p, i) => {
      if (ordered.length > 1 && !(p.lhs === g.startSymbol && startRules.length === 1)) {
        out.push({ name: `without ${p.lhs} → ${p.rhs.join(' ')}`, text: lines(ordered.filter((_, j) => j !== i)).join('\n') });
      }
      if (p.rhs.length > 0) {
        const added = { ...p, rhs: [...p.rhs, p.rhs[p.rhs.length - 1]] };
        out.push({ name: `with ${p.lhs} → ${added.rhs.join(' ')}`, text: lines([...ordered, added]).join('\n') });
      }
    });
    return out;
  }

  it('every difference is confirmed, and each grammar explains the word its own way', () => {
    let differences = 0;
    let same = 0;
    for (const preset of PRESET_GRAMMARS) {
      const original = parse(preset.grammarText);
      for (const { name, text } of modifications(original)) {
        const res = parseGrammar(text);
        if (res.errors.length > 0 || !res.grammar) continue;
        const student = res.grammar;
        const L = Math.min(5, lengthFor(original, student));
        const r = compareLanguages(original, student, L);
        const label = `${preset.id} ${name}`;
        if (r.kind === 'different') {
          differences++;
          expect(accepts(original, r.word), label).toBe(r.inFirst);
          expect(accepts(student, r.word), label).toBe(r.inSecond);
          expect(r.inFirst).not.toBe(r.inSecond);
          const e1 = explainWord(original, r.word);
          const e2 = explainWord(student, r.word);
          expect(e1.generated, label).toBe(r.inFirst);
          expect(e2.generated, label).toBe(r.inSecond);
          // the one that does not generate it shows an attempt (or has an empty language)
          const failed = r.inFirst ? e2 : e1;
          if (!failed.generated && failed.reason !== 'empty-language') expect(failed.tree, label).not.toBeNull();
          // no shorter word differs
          const alphabet = [...new Set([...original.terminals, ...student.terminals])];
          const shorter = r.word.length === 0 ? [] : wordsUpTo(alphabet, Math.min(r.word.length - 1, 3));
          for (const w of shorter) {
            expect(accepts(original, w), `${label}: ${w.join(' ')}`).toBe(accepts(student, w));
          }
        } else {
          same++;
          const alphabet = [...new Set([...original.terminals, ...student.terminals])];
          for (const w of wordsUpTo(alphabet, Math.min(L, 4))) {
            expect(accepts(original, w), `${label}: ${w.join(' ')}`).toBe(accepts(student, w));
          }
        }
      }
    }
    expect(differences).toBeGreaterThan(100);
    expect(same).toBeGreaterThan(5);
  }, 300000);
});
