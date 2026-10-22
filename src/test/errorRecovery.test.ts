/**
 * Optional panic-mode error recovery of the LL and LR simulators (core/analyser/errorRecovery.ts).
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { computeAnalysis } from '../core/analysisJob';
import { simulateLLParse, LLSimulationResult } from '../core/ll/llParser';
import { simulateLRParse, LRSimulationResult } from '../core/lr/lrParser';
import { recoverySets } from '../core/analyser/errorRecovery';
import { exampleWord } from '../core/generator/exampleWord';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { Grammar } from '../core/ast/grammar';
import { DerivationNode } from '../core/generator/wordGenerator';
import { LRTable } from '../core/lr/lrTable';
import { accepts } from './earley';
import { prng, randomGrammarText } from './randomGrammar';

const yieldToRunner = () => new Promise(resolve => setTimeout(resolve, 0));

/** Words with one or two symbols deleted, inserted or replaced. */
function mutations(w: string[], terminals: string[], seed: number): string[][] {
  const rnd = prng(seed);
  const pick = () => terminals[Math.floor(rnd() * terminals.length)];
  const out: string[][] = [];
  for (let n = 0; n < 6; n++) {
    let v = [...w];
    for (let e = 0; e <= n % 2; e++) {
      const i = Math.floor(rnd() * (v.length + 1));
      const kind = Math.floor(rnd() * 3);
      if (kind === 0 && v.length > 0) v.splice(Math.min(i, v.length - 1), 1);
      else if (kind === 1) v.splice(i, 0, pick());
      else if (v.length > 0) v[Math.min(i, v.length - 1)] = pick();
    }
    out.push(v);
  }
  out.push([...w, ...w.slice(0, 2)], w.slice(1), [pick(), ...w]);
  return out;
}

/** Every node that is not an error construct uses a rule of the grammar. */
function validWithErrors(g: Grammar, n: DerivationNode): boolean {
  if (n.isTerminal || n.isForestRoot) return (n.children ?? []).every(c => validWithErrors(g, c));
  if (n.mark === 'error') return true;
  const kids = (n.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
  return g.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === kids.join(' ')) && (n.children ?? []).every(c => validWithErrors(g, c));
}

/** Index of the input symbol at which the parser without recovery stops. */
const stopPosition = (r: LLSimulationResult | LRSimulationResult) => {
  const last = r.steps[r.steps.length - 1];
  return last.remainingInput.length;
};

interface Case { label: string; g: Grammar; words: string[][] }

function cases(): Case[] {
  const out: Case[] = [];
  const add = (label: string, g: Grammar) => {
    const ex = exampleWord(g);
    if (!ex) return;
    out.push({ label, g, words: [ex, ...mutations(ex, [...g.terminals], out.length + 1)] });
  };
  for (const p of PRESET_GRAMMARS) {
    const g = parseGrammar(p.grammarText).grammar;
    if (g && g.terminals.size < 25) add(p.id, g);
  }
  for (let seed = 1; seed <= 120; seed++) {
    const g = parseGrammar(randomGrammarText(seed)).grammar;
    if (g && g.terminals.size > 0) add(`random ${seed}`, g);
  }
  return out;
}

describe('panic-mode error recovery', () => {
  it('LL: off changes nothing; on: correct words unchanged, wrong words get ≥ 1 error at the first error, terminate, valid trees', async () => {
    let wrong = 0;
    for (const [i, { label, g, words }] of cases().entries()) {
      const data = computeAnalysis(g);
      if (!data || !data.llTable.isLL1) continue;
      const sets = recoverySets(g, data.analysis);
      for (const w of words) {
        const inL = accepts(g, w);
        const plain = simulateLLParse(w, g, data.llTable);
        const rec = simulateLLParse(w, g, data.llTable, undefined, { k: 1 }, { recovery: { sets } });
        expect(plain.accepted, `${label} '${w.join(' ')}' plain`).toBe(inL);
        if (inL) {
          expect(rec.accepted, `${label} '${w.join(' ')}'`).toBe(true);
          expect(rec.steps.length).toBe(plain.steps.length);
          expect(rec.errors ?? []).toEqual([]);
          continue;
        }
        wrong++;
        expect(rec.accepted, `${label} '${w.join(' ')}' recovered`).toBe(false);
        expect(rec.errors!.length, `${label} '${w.join(' ')}' errors`).toBeGreaterThan(0);
        expect(rec.steps.length).toBeLessThan(500 + 50 * w.length + 4 * (w.length + 1) + 50);
        // The first error is where the parser without recovery stops
        expect(w.length + 1 - rec.errors![0].position, `${label} '${w.join(' ')}' first error`).toBe(stopPosition(plain));
        const last = rec.steps[rec.steps.length - 1];
        expect(rec.completedWithErrors || last.recovery?.kind === 'giveUp', `${label} '${w.join(' ')}' end`).toBe(true);
        if (rec.finalTree) expect(validWithErrors(g, rec.finalTree), `${label} '${w.join(' ')}' tree`).toBe(true);
      }
      if (i % 10 === 0) await yieldToRunner();
    }
    expect(wrong).toBeGreaterThan(200);
  }, 120000);

  it('LR: off changes nothing; on: correct words unchanged, wrong words get ≥ 1 error at the first error, terminate, valid trees (all variants, both layouts)', async () => {
    let wrong = 0;
    for (const [i, { label, g, words }] of cases().entries()) {
      const data = computeAnalysis(g);
      if (!data) continue;
      const sets = recoverySets(g, data.analysis);
      const tables: LRTable[] = [data.lr0Table, data.slr1Table, data.lalr1Table, data.ielr1Table, data.lr1Table].filter((t): t is LRTable => !!t && t.isConflictFree);
      for (const table of tables) {
        for (const layout of ['dragon', 'lecture'] as const) {
          for (const w of words) {
            const inL = accepts(g, w);
            const plain = simulateLRParse(w, g, table, layout);
            const rec = simulateLRParse(w, g, table, layout, undefined, { recovery: { sets } });
            expect(plain.accepted, `${label} ${table.variant} '${w.join(' ')}' plain`).toBe(inL);
            if (inL) {
              expect(rec.accepted).toBe(true);
              expect(rec.steps.length).toBe(plain.steps.length);
              continue;
            }
            wrong++;
            const id = `${label} ${table.variant} ${layout} '${w.join(' ')}'`;
            expect(rec.accepted, id).toBe(false);
            expect(rec.errors!.length, id).toBeGreaterThan(0);
            expect(w.length + 1 - rec.errors![0].position, `${id} first error`).toBe(stopPosition(plain));
            const last = rec.steps[rec.steps.length - 1];
            expect(rec.completedWithErrors || last.recovery?.kind === 'giveUp', `${id} end: ${last.action}`).toBe(true);
            if (rec.completedWithErrors && rec.finalTree) expect(validWithErrors(g, rec.finalTree), `${id} tree`).toBe(true);
            // After "recovered" the parser goes on with the stop symbol (no error on it right away)
            rec.steps.forEach((s, k) => {
              if (s.recovery?.kind !== 'recovered') return;
              const next = rec.steps[k + 1];
              expect(next && !(next.isError && next.remainingInput.length === s.remainingInput.length && next.recovery?.kind === 'start'), `${id} recovered at step ${k}`).toBe(true);
            });
          }
        }
      }
      if (i % 5 === 0) await yieldToRunner();
    }
    expect(wrong).toBeGreaterThan(500);
  }, 300000);

  it('the expression grammar: the steps say when panic mode starts and when the parser has recovered', () => {
    const ll = parseGrammar("E -> T E'\nE' -> + T E' | ε\nT -> F T'\nT' -> * F T' | ε\nF -> ( E ) | a").grammar!;
    const d = computeAnalysis(ll)!;
    const r = simulateLLParse(['a', '+', '*', 'a'], ll, d.llTable, undefined, { k: 1 }, { recovery: { sets: recoverySets(ll, d.analysis) } });
    expect(r.steps.filter(s => s.recovery).map(s => s.recovery!.kind)).toEqual(['start', 'skip', 'recovered', 'end']);
    const start = r.steps.find(s => s.recovery?.kind === 'start')!;
    expect(start.actionCz).toContain('M[T, *] je prázdná');
    expect(start.recovery!.resumeSet).toEqual(['(', 'a']);
    expect(start.recovery!.syncSet).toEqual([')', '+', '$']);
    expect(r.steps.find(s => s.recovery?.kind === 'recovered')!.actionCz).toContain("'a' ∈ FIRST(T)");
    // ε-rule after skipping: the reason is FOLLOW, not FIRST
    const r2 = simulateLLParse(['a', 'a'], ll, d.llTable, undefined, { k: 1 }, { recovery: { sets: recoverySets(ll, d.analysis) } });
    expect(r2.steps.find(s => s.recovery?.kind === 'recovered')!.actionCz).toContain("'$' ∈ FOLLOW(T')");
    // a missing terminal
    const r3 = simulateLLParse(['(', 'a'], ll, d.llTable, undefined, { k: 1 }, { recovery: { sets: recoverySets(ll, d.analysis) } });
    expect(r3.steps.find(s => s.recovery?.kind === 'insert')!.recovery!.token).toBe(')');
    expect(r3.completedWithErrors).toBe(true);

    const lr = parseGrammar('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | a').grammar!;
    const d2 = computeAnalysis(lr)!;
    const rl = simulateLRParse(['(', 'a'], lr, d2.lalr1Table, 'lecture', undefined, { recovery: { sets: recoverySets(lr, d2.analysis) } });
    // an action in g(s, A) is not enough: T at '(' would reduce to E and fail again on $
    const st = rl.steps.find(s => s.recovery?.kind === 'start')!;
    expect(st.recovery!.nonTerminal).toBe('E');
    expect(rl.steps.find(s => s.recovery?.kind === 'pop')!.recovery!.poppedStates!.length).toBe(2);
    expect(rl.completedWithErrors).toBe(true);
    expect(rl.finalTree!.mark).toBe('error');
    // input after the end of the word
    const r4 = simulateLRParse(['a', ')', 'a'], lr, d2.lalr1Table, 'dragon', undefined, { recovery: { sets: recoverySets(lr, d2.analysis) } });
    expect(r4.errors!.length).toBe(1);
    expect(r4.completedWithErrors).toBe(true);
  });
});
