/**
 * Independent oracles for the analyser, the LL and LR constructions and
 * the simulators, on presets and random grammars. Collects every discrepancy.
 */
import { it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { Grammar, END_MARKER, EPSILON, Production } from '../core/ast/grammar';
import { buildLLTable } from '../core/ll/llTable';
import { simulateLLParse } from '../core/ll/llParser';
import { buildLR0Automaton, buildLALR1Automaton, buildLR1Automaton } from '../core/lr/lrAutomaton';
import { buildLRTable } from '../core/lr/lrTable';
import { simulateLRParse } from '../core/lr/lrParser';
import { generateWords } from '../core/generator/wordGenerator';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { randomGrammarText, prng } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';
import { DerivationNode } from '../core/generator/wordGenerator';

const issues = new Map<string, string[]>();
const report = (cat: string, msg: string) => {
  if (!issues.has(cat)) issues.set(cat, []);
  issues.get(cat)!.push(msg);
};

// ---------- independent FIRST_k / FOLLOW_k on token arrays ----------
type W = string[];
const key = (w: W) => w.join('\u0001');
const unkey = (s: string): W => (s === '' ? [] : s.split('\u0001'));

/** A ⊕k B; `strict`: an empty B gives ∅ (no derivation), otherwise prefixes of length k are kept (textbook FOLLOW). */
function concatK(A: Set<string>, B: Set<string>, k: number, strict = true): Set<string> {
  const r = new Set<string>();
  if (strict && B.size === 0) return r;
  for (const a of A) {
    const aw = unkey(a);
    if (aw.length >= k || aw[aw.length - 1] === END_MARKER) { r.add(key(aw.slice(0, k))); continue; }
    for (const b of B) r.add(key([...aw, ...unkey(b)].slice(0, k)));
  }
  return r;
}

function oracle(g: Grammar, k: number) {
  const first = new Map<string, Set<string>>();
  for (const nt of g.nonTerminals) first.set(nt, new Set());
  const fseq = (seq: W): Set<string> => {
    let cur = new Set<string>(['']);
    for (const s of seq) cur = concatK(cur, first.has(s) ? first.get(s)! : new Set([key([s])]), k);
    return cur;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      const f = first.get(p.lhs)!;
      for (const x of fseq(p.rhs)) if (!f.has(x)) { f.add(x); changed = true; }
    }
  }
  const follow = new Map<string, Set<string>>();
  for (const nt of g.nonTerminals) follow.set(nt, new Set());
  follow.get(g.startSymbol)?.add(key([END_MARKER]));
  changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      p.rhs.forEach((B, i) => {
        if (!g.nonTerminals.has(B)) return;
        const add = concatK(fseq(p.rhs.slice(i + 1)), follow.get(p.lhs)!, k, false);
        const f = follow.get(B)!;
        for (const x of add) if (!f.has(x)) { f.add(x); changed = true; }
      });
    }
  }
  const predict = (p: Production) => concatK(fseq(p.rhs), follow.get(p.lhs)!, k, false);
  return { first, follow, fseq, predict };
}

const appSet = (s: Set<string> | undefined) => new Set([...(s || [])].map(x => key(x === EPSILON ? [] : x.split(' ').filter(Boolean))));
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
const show = (s: Set<string>) => `{${[...s].map(x => unkey(x).join(' ') || 'ε').sort().join(', ')}}`;

// ---------- helpers ----------
const yieldOf = (n: DerivationNode | undefined): string[] =>
  !n ? [] : !n.children || n.children.length === 0 ? (n.isTerminal && n.symbol !== 'ε' ? [n.symbol] : n.isTerminal ? [] : ['?' + n.symbol]) : n.children.flatMap(yieldOf);

function leftmost(g: Grammar, parse: number[]): string[] | null {
  let form = [g.startSymbol];
  for (const id of parse) {
    const p = g.productions.find(q => q.id === id)!;
    const i = form.findIndex(s => g.nonTerminals.has(s));
    if (i < 0 || form[i] !== p.lhs) return null;
    form = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
  }
  return form;
}
function rightmost(g: Grammar, rightParse: number[]): string[] | null {
  let form = [g.startSymbol];
  for (const id of [...rightParse].reverse()) {
    const p = g.productions.find(q => q.id === id)!;
    let i = -1;
    for (let j = form.length - 1; j >= 0; j--) if (g.nonTerminals.has(form[j])) { i = j; break; }
    if (i < 0 || form[i] !== p.lhs) return null;
    form = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
  }
  return form;
}

function generatingSet(g: Grammar) {
  const gen = new Set<string>();
  let ch = true;
  while (ch) { ch = false; for (const p of g.productions) if (!gen.has(p.lhs) && p.rhs.every(s => !g.nonTerminals.has(s) || gen.has(s))) { gen.add(p.lhs); ch = true; } }
  return gen;
}
function reachableSet(g: Grammar) {
  const r = new Set([g.startSymbol]);
  let ch = true;
  while (ch) { ch = false; for (const p of g.productions) if (r.has(p.lhs)) for (const s of p.rhs) if (g.nonTerminals.has(s) && !r.has(s)) { r.add(s); ch = true; } }
  return r;
}

function audit(text: string, label: string) {
  const res = parseGrammar(text);
  if (res.errors.length || !res.grammar) { report('parse', `${label}: ${res.errors.map(e => JSON.stringify(e)).join('; ')}`); return; }
  const g = res.grammar;
  const a = analyzeGrammar(g);
  const tag = `${label} [${g.productions.map(p => `${p.lhs}->${p.rhs.join(' ') || 'ε'}`).join('; ')}]`;
  const gen0 = generatingSet(g), reach0 = reachableSet(g);
  const isReduced = [...g.nonTerminals].every(n => gen0.has(n) && reach0.has(n));
  const sfx = isReduced ? '' : ' (non-reduced)';

  // FIRST/FOLLOW k = 1, 2
  for (const k of [1, 2]) {
    const o = oracle(g, k);
    for (const nt of g.nonTerminals) {
      const appFirst = appSet(k === 1 ? a.first1.get(nt) : a.first2.get(nt));
      if (!same(appFirst, o.first.get(nt)!)) report(`FIRST${k}` + sfx, `${tag}: ${nt} app ${show(appFirst)} oracle ${show(o.first.get(nt)!)}`);
      const appFollow = appSet(k === 1 ? a.follow1.get(nt) : a.follow2.get(nt));
      if (!same(appFollow, o.follow.get(nt)!)) report(`FOLLOW${k}` + sfx, `${tag}: ${nt} app ${show(appFollow)} oracle ${show(o.follow.get(nt)!)}`);
    }
    for (const p of g.productions) {
      const appP = appSet(k === 1 ? a.predict1.get(p.id) : a.predict2.get(p.id));
      if (!same(appP, o.predict(p))) report(`PREDICT${k}` + sfx, `${tag}: rule ${p.id} app ${show(appP)} oracle ${show(o.predict(p))}`);
    }
  }

  // LL(1) class
  const o1 = oracle(g, 1);
  let ll1 = true;
  for (const nt of g.nonTerminals) {
    const ps = g.productions.filter(p => p.lhs === nt);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const x = o1.predict(ps[i]); const y = o1.predict(ps[j]);
      if ([...x].some(t => y.has(t))) ll1 = false;
    }
  }
  const ll = buildLLTable(g, a);
  if (ll.isLL1 !== ll1) report('LL1 class' + sfx, `${tag}: app ${ll.isLL1} oracle ${ll1}`);

  // strong LL(2) class
  const o2 = oracle(g, 2);
  let sll2 = true;
  for (const nt of g.nonTerminals) {
    const ps = g.productions.filter(p => p.lhs === nt);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const x = o2.predict(ps[i]); const y = o2.predict(ps[j]);
      if ([...x].some(t => y.has(t))) sll2 = false;
    }
  }
  if (ll.isStrongLL2 !== (ll1 || sll2)) report('strong LL2 class' + sfx, `${tag}: app ${ll.isStrongLL2} oracle ${ll1 || sll2}`);
  if (ll.isLL1 && !ll.isLL2) report('class hierarchy', `${tag}: LL1 but not LL2`);
  if (ll.isStrongLL2 && !ll.isLL2) report('class hierarchy', `${tag}: strong LL2 but not LL2`);

  // Exact LL(2) by brute force over left-sentential forms w A α (bounded)
  {
    const contexts = new Set<string>();
    const seen = new Set<string>();
    const queue: W[] = [[g.startSymbol, END_MARKER]];
    let conflict = false;
    for (let h = 0; h < queue.length && h < 3000; h++) {
      const form = queue[h];
      const i = form.findIndex(s => g.nonTerminals.has(s));
      if (i < 0) continue;
      const A = form[i];
      const rest = form.slice(i + 1);
      const L = o2.fseq(rest);
      const ctxKey = `${A}|${[...L].sort().join(',')}`;
      if (!contexts.has(ctxKey)) {
        contexts.add(ctxKey);
        const ps = g.productions.filter(p => p.lhs === A);
        const sets = ps.map(p => concatK(o2.fseq(p.rhs), L, 2));
        for (let x = 0; x < sets.length; x++) for (let y = x + 1; y < sets.length; y++) if ([...sets[x]].some(t => sets[y].has(t))) conflict = true;
      }
      if (form.length > 9) continue;
      for (const p of g.productions.filter(q => q.lhs === A)) {
        const next = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
        // keep only the part from the leftmost non-terminal: the terminal prefix w does not matter
        const j = next.findIndex(s => g.nonTerminals.has(s));
        const trimmed = j < 0 ? [] : next.slice(j);
        const kk = key(trimmed);
        if (!seen.has(kk)) { seen.add(kk); queue.push(trimmed); }
      }
    }
    if (conflict && ll.isLL2 && ll.ll2Complete) report('LL2 exact' + sfx, `${tag}: brute force finds a conflict, app says LL(2)`);
    const appCtx = new Set(ll.ll2Tables.map(t => `${t.nonTerminal}|${t.follow.map(f => key(f.split(' ').filter(Boolean))).sort().join(',')}`));
    for (const c of contexts) if (!appCtx.has(c) && ll.ll2Complete) report('LL2 contexts' + sfx, `${tag}: context ${c} missing in app tables`);
  }

  // Simulators against Earley
  const alphabet = [...g.terminals];
  let maxLen = 0;
  while (maxLen < 6 && alphabet.length ** (maxLen + 1) <= 800) maxLen++;
  const words = wordsUpTo(alphabet, maxLen);
  const inL = words.map(w => accepts(g, w));

  const checkLL = (mode: Parameters<typeof simulateLLParse>[4], name: string) => {
    words.forEach((w, idx) => {
      const r = simulateLLParse(w, g, ll, undefined, mode);
      if (r.accepted !== inL[idx]) report(`${name} accept`, `${tag}: '${w.join(' ')}' app ${r.accepted} earley ${inL[idx]}`);
      if (r.accepted) {
        const last = r.steps[r.steps.length - 1];
        const d = leftmost(g, last.leftParse);
        if (!d || d.join(' ') !== w.join(' ')) report(`${name} left parse`, `${tag}: '${w.join(' ')}' gives ${d?.join(' ')}`);
        if (yieldOf(r.finalTree).join(' ') !== w.join(' ')) report(`${name} tree`, `${tag}: '${w.join(' ')}' tree yield ${yieldOf(r.finalTree).join(' ')}`);
      }
    });
  };
  if (ll.isLL1) checkLL({ k: 1 }, 'LL1');
  if (ll.isStrongLL2) checkLL({ k: 2, tables: 'strong' }, 'strongLL2');
  if (ll.isLL2 && ll.ll2Complete) checkLL({ k: 2, tables: 'contexts' }, 'LL2ctx');

  const lr0 = buildLRTable(buildLR0Automaton(g, 'LR(0)'), g, a);
  const slr = buildLRTable(buildLR0Automaton(g, 'SLR(1)'), g, a);
  const lalr = buildLRTable(buildLALR1Automaton(g, a), g, a);
  const lr1 = buildLRTable(buildLR1Automaton(g, a), g, a);
  const free = (t: typeof lr0) => t.isConflictFree;
  if (free(lr0) && !free(slr)) report('LR hierarchy', `${tag}: LR0 but not SLR`);
  if (free(slr) && !free(lalr)) report('LR hierarchy', `${tag}: SLR but not LALR`);
  if (free(lalr) && !free(lr1)) report('LR hierarchy', `${tag}: LALR but not LR1`);
  if (lr0.fConflicts.length === 0 !== free(lr0)) report('LR0 f vs ACTION', `${tag}: f conflicts ${lr0.fConflicts.length}, ACTION conflict-free ${free(lr0)}`);
  const gen = generatingSet(g), reach = reachableSet(g);
  const reduced = [...g.nonTerminals].every(n => gen.has(n) && reach.has(n));
  if (reduced && ll.isLL1 && !free(lr1)) report('LL1 ⊂ LR1', `${tag}: LL(1) but not LR(1)`);

  for (const [t, name] of [[lr0, 'LR0'], [slr, 'SLR'], [lalr, 'LALR'], [lr1, 'LR1']] as const) {
    if (!free(t)) continue;
    for (const layout of ['dragon', 'lecture'] as const) {
      words.forEach((w, idx) => {
        const r = simulateLRParse(w, g, t, layout);
        if (r.accepted !== inL[idx]) report(`${name}/${layout} accept`, `${tag}: '${w.join(' ')}' app ${r.accepted} earley ${inL[idx]}`);
        if (r.accepted) {
          const last = r.steps[r.steps.length - 1];
          const d = rightmost(g, last.rightParse);
          if (!d || d.join(' ') !== w.join(' ')) report(`${name} right parse`, `${tag}: '${w.join(' ')}' gives ${d?.join(' ')}`);
          if (yieldOf(r.finalTree).join(' ') !== w.join(' ')) report(`${name} tree`, `${tag}: '${w.join(' ')}' tree yield ${yieldOf(r.finalTree).join(' ')}`);
        }
      });
    }
  }
  // strict LR(0) ⇒ prefix-free language (on the words checked)
  if (free(lr0)) {
    const L = new Set(words.filter((_, i) => inL[i]).map(w => w.join(' ')));
    for (const w of L) for (const v of L) if (v !== w && (w === '' ? v !== '' : v.startsWith(w + ' '))) report('LR0 prefix-free', `${tag}: '${w}' and '${v}'`);
  }

  // Word generator
  for (const tr of generateWords(g, 6)) {
    if (!accepts(g, tr.tokens)) report('generator', `${tag}: ${tr.word} not in L`);
    const last = tr.steps[tr.steps.length - 1].sententialForm;
    if (last.join(' ') !== tr.tokens.join(' ')) report('generator steps', `${tag}: ${tr.word}`);
    if (yieldOf(tr.tree).join(' ') !== tr.tokens.join(' ')) report('generator tree', `${tag}: ${tr.word} tree ${yieldOf(tr.tree).join(' ')}`);
  }
}

function bigGrammar(seed: number): string {
  const rand = prng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const nts = ['S', 'A', 'B', 'C', 'D'].slice(0, 2 + Math.floor(rand() * 4));
  const ts = ['a', 'b', 'c'].slice(0, 2 + Math.floor(rand() * 2));
  return nts.map(nt => {
    const alts: string[] = [];
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const len = Math.floor(rand() * 4);
      alts.push(len === 0 ? 'ε' : Array.from({ length: len }, () => (rand() < 0.35 ? pick(nts) : pick(ts))).join(' '));
    }
    return `${nt} -> ${alts.join(' | ')}`;
  }).join('\n');
}

it('audit', () => {
  for (const p of PRESET_GRAMMARS) audit(p.grammarText, `preset ${p.id}`);
  const N = 200;
  for (let s = 1; s <= N; s++) audit(randomGrammarText(s), `rand ${s}`);
  for (let s = 1; s <= N; s++) audit(bigGrammar(s), `big ${s}`);
  // With useless symbols FIRST₁ follows the sentential-form definition (A → S A b gives {b} although A
  // derives no word) while FIRST₂ follows the terminal-word one; those differences are only logged
  const fmt = (list: [string, string[]][]) => list.map(([c, l]) => `${c}: ${l.length}\n   ${l.slice(0, 4).join('\n   ')}`).join('\n');
  const all = [...issues];
  const informational = all.filter(([c]) => c.endsWith('(non-reduced)'));
  if (informational.length) console.log(`non-reduced grammars (conventions, not errors):\n${fmt(informational)}`);
  expect(fmt(all.filter(([c]) => !c.endsWith('(non-reduced)')))).toBe('');
}, 900000);
