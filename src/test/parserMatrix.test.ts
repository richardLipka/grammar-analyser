/**
 * The parser matrix: every parser of the application on every preset grammar and on
 * seeded random grammars, checked word by word against two independent oracles — the
 * Earley recognizer of src/test/earley.ts (accepts) and the CYK-based membership test
 * (testMembership: tree count, trees, the viable prefix of a rejected word).
 *
 * Applicability follows the application: LL(1) when isLL1, LL(2) when isLL2 (the strong
 * table M[A, xy] when the grammar is strong LL(2), the tables T(A, L) when the exact test
 * finished), every LR variant whose table is conflict-free in both layouts, GLR on every
 * table, ALL(*) when there is no left recursion, Earley (with and without Leo), ETTP,
 * GLL and CYK (on the CNF grammar G′) always, recursive descent when LL(1), recursive
 * ascent (step simulator and generated JavaScript) for every conflict-free table.
 *
 * For a word w with w ∈ L(G) (oracle):
 * - every deterministic parser accepts; its tree is a derivation of G (every inner node
 *   a rule, children = right-hand side, leaves = w; G′ for CYK);
 * - LL and recursive descent: the left parse replays to w by leftmost derivation and is
 *   the preorder of the tree; both have the same left parse;
 * - LR and recursive ascent: the right parse replays to w by rightmost derivation and is
 *   the postorder of the tree; both layouts and recursive ascent have the same right parse;
 * - GLR, GLL, Earley, Leo, ETTP: the number of trees equals the membership count (∞ for
 *   cyclic grammars; GLR lists at most 25); CYK counts the trees of G′ exactly.
 * For w ∉ L(G): every parser rejects. Deterministic parsers stop where their family
 * does (LL = recursive descent; LR dragon = lecture = recursive ascent = its JavaScript),
 * and at the true error position: the viable prefix of the membership test (LL(1), LR,
 * GLR, Earley; LL(2) one symbol earlier at most), on reduced grammars without precedence.
 * Error recovery on: words of L(G) give exactly the steps of the run without it; other
 * words are rejected with at least one error, the first one where the parser without
 * recovery stops (LL and RD on every word, LR and RA on a part of them: errorRecovery.test.ts
 * and rdRaRecovery.test.ts have more).
 *
 * Budget (the file runs in about 90 s): grammars with many terminals get a sample of words
 * (the sample input, the example word, generated words and their mutations) besides the
 * short ones; GLR runs on the LALR(1) table for every word and on one other table in turn,
 * with a work budget per grammar (it copies the whole GSS at every step), and a run that
 * reaches the step limit is checked for soundness only. MATRIX_VERBOSE=1 prints the time
 * per grammar; the last test prints the statistics.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar, EPSILON } from '../core/ast/grammar';
import { computeAnalysis, AnalysisDataResult } from '../core/analysisJob';
import { DerivationNode, generateWords } from '../core/generator/wordGenerator';
import { exampleWord } from '../core/generator/exampleWord';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { simulateLLParse, LLParseMode } from '../core/ll/llParser';
import { simulateLRParse } from '../core/lr/lrParser';
import { simulateGLRParse } from '../core/lr/glrParser';
import { LRTable, LRLayout } from '../core/lr/lrTable';
import { buildATN } from '../core/all/allAtn';
import { checkALLCompatibility, simulateALLParse } from '../core/all/allParser';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import { buildETTPTable, simulateETTPParse } from '../core/earley/ettpParser';
import { ChartItem } from '../core/earley/earleyTrees';
import { earleyChartToBSR } from '../core/forest/sppf';
import { countBSRTrees } from '../core/gll/bsr';
import { parseGLL } from '../core/gll/gllParser';
import { cnfViolations, countCYKTrees, cykTable, extractCYKTrees } from '../core/parser/cyk';
import { testMembership, MembershipResult } from '../core/parser/membership';
import { convertToChomsky } from '../core/processor/grammarProcessor';
import { simulateRecursiveDescent } from '../core/codegen/rdSimulator';
import { canGenerateAscent, generateRecursiveAscent, GeneratedAscent } from '../core/codegen/recursiveAscent';
import { simulateRecursiveAscent } from '../core/codegen/recursiveAscentSimulator';
import { recoverySets, RecoverySets } from '../core/analyser/errorRecovery';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { prng, randomGrammarText } from './randomGrammar';
import { accepts, wordsUpTo } from './earley';

const NL = String.fromCharCode(10);
const yieldToRunner = () => new Promise(resolve => setTimeout(resolve, 0));

// ---------------------------------------------------------------- bookkeeping

const failures = new Map<string, string[]>();
const fail = (category: string, message: string) => {
  if (!failures.has(category)) failures.set(category, []);
  failures.get(category)!.push(message);
};

interface ParserStats { grammars: Set<string>; words: number; accepted: number; rejected: number; trees: number }
const stats = new Map<string, ParserStats>();
const count = (parser: string, grammar: string, accepted: boolean, trees = 0) => {
  if (!stats.has(parser)) stats.set(parser, { grammars: new Set(), words: 0, accepted: 0, rejected: 0, trees: 0 });
  const s = stats.get(parser)!;
  s.grammars.add(grammar);
  s.words++;
  if (accepted) s.accepted++;
  else s.rejected++;
  s.trees += trees;
};
const times = new Map<string, number>();
/** Runs f and adds its time to the parser's total */
function timed<T>(what: string, f: () => T): T {
  const t0 = performance.now();
  const r = f();
  times.set(what, (times.get(what) ?? 0) + performance.now() - t0);
  return r;
}
const notes = new Map<string, number>();
const note = (what: string) => notes.set(what, (notes.get(what) ?? 0) + 1);

// ---------------------------------------------------------------- trees and derivations

const ruleText = (lhs: string, rhs: string[]) => `${lhs} → ${rhs.join(' ') || 'ε'}`;
const sameSeq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The right-hand side a node stands for: [] for an ε leaf as the only child (or no children at all). */
function nodeRhs(n: DerivationNode): string[] | null {
  const kids = n.children ?? [];
  if (kids.length === 0) return n.isTerminal ? null : [];
  if (kids.length === 1 && kids[0].isTerminal && kids[0].symbol === EPSILON && !(kids[0].children?.length)) return [];
  return kids.map(c => c.symbol);
}

/** null when the tree is a derivation tree of g with root S and leaves = word, else what is wrong. */
function treeError(g: Grammar, root: DerivationNode | undefined, word: string[]): string | null {
  if (!root) return 'no tree';
  if (root.isForestRoot) return 'a forest root instead of a tree';
  if (root.symbol !== g.startSymbol) return `root ${root.symbol}`;
  const leaves: string[] = [];
  const walk = (n: DerivationNode): string | null => {
    if (n.mark === 'error' || n.mark === 'skipped') return `node ${n.symbol} marked ${n.mark}`;
    const rhs = nodeRhs(n);
    if (rhs === null) {
      if (n.symbol === EPSILON) return 'ε leaf outside an ε-rule';
      if (!g.terminals.has(n.symbol)) return `leaf ${n.symbol} is not a terminal`;
      leaves.push(n.symbol);
      return null;
    }
    if (n.isTerminal || !g.nonTerminals.has(n.symbol)) return `inner node ${n.symbol} is not a non-terminal`;
    if (!g.productions.some(p => p.lhs === n.symbol && sameSeq(p.rhs, rhs))) return `no rule ${ruleText(n.symbol, rhs)}`;
    if (rhs.length === 0) return null;
    for (const c of n.children!) {
      if (c.isTerminal !== !g.nonTerminals.has(c.symbol)) return `wrong terminal flag of ${c.symbol}`;
      const e = walk(c);
      if (e) return e;
    }
    return null;
  };
  const e = walk(root);
  if (e) return e;
  if (!sameSeq(leaves, word)) return `leaves '${leaves.join(' ')}'`;
  return null;
}

/** Rules of the inner nodes in preorder (= left parse) or postorder (= right parse). */
function treeRules(n: DerivationNode, order: 'pre' | 'post', out: string[] = []): string[] {
  const rhs = nodeRhs(n);
  if (rhs === null) return out;
  if (order === 'pre') out.push(ruleText(n.symbol, rhs));
  if (rhs.length > 0) for (const c of n.children!) treeRules(c, order, out);
  if (order === 'post') out.push(ruleText(n.symbol, rhs));
  return out;
}
const shape = (n: DerivationNode): string => {
  const rhs = nodeRhs(n);
  return rhs === null ? n.symbol : rhs.length === 0 ? `${n.symbol}()` : `${n.symbol}(${n.children!.map(shape).join(',')})`;
};

function replay(g: Grammar, parse: number[], which: 'leftmost' | 'rightmost'): string[] | string {
  let form = [g.startSymbol];
  for (const id of which === 'leftmost' ? parse : [...parse].reverse()) {
    const p = g.productions.find(q => q.id === id);
    if (!p) return `unknown rule ${id}`;
    let i = -1;
    if (which === 'leftmost') i = form.findIndex(s => g.nonTerminals.has(s));
    else for (let j = form.length - 1; j >= 0 && i < 0; j--) if (g.nonTerminals.has(form[j])) i = j;
    if (i < 0 || form[i] !== p.lhs) return `rule ${id} (${ruleText(p.lhs, p.rhs)}) does not rewrite the ${which} non-terminal of '${form.join(' ')}'`;
    form = [...form.slice(0, i), ...p.rhs, ...form.slice(i + 1)];
  }
  return form;
}
/** The parse replays to the word and is the preorder / postorder of the tree. */
function parseError(g: Grammar, parse: number[], which: 'leftmost' | 'rightmost', tree: DerivationNode | undefined, word: string[]): string | null {
  const form = replay(g, parse, which);
  if (typeof form === 'string') return form;
  if (!sameSeq(form, word)) return `replays to '${form.join(' ')}'`;
  if (tree) {
    const rules = parse.map(id => g.productions.find(q => q.id === id)!).map(p => ruleText(p.lhs, p.rhs));
    const fromTree = treeRules(tree, which === 'leftmost' ? 'pre' : 'post');
    if (!sameSeq(rules, fromTree)) return `parse ${parse.join(' ')} is not the ${which === 'leftmost' ? 'preorder' : 'postorder'} of the tree`;
  }
  return null;
}

/** The non-terminals that generate a word and are reachable: a reduced grammar has all of them. */
function isReduced(g: Grammar): boolean {
  const gen = new Set<string>();
  for (let ch = true; ch; ) {
    ch = false;
    for (const p of g.productions) if (!gen.has(p.lhs) && p.rhs.every(s => !g.nonTerminals.has(s) || gen.has(s))) { gen.add(p.lhs); ch = true; }
  }
  const reach = new Set([g.startSymbol]);
  for (let ch = true; ch; ) {
    ch = false;
    for (const p of g.productions) if (reach.has(p.lhs)) for (const s of p.rhs) if (g.nonTerminals.has(s) && !reach.has(s)) { reach.add(s); ch = true; }
  }
  return [...g.nonTerminals].every(n => gen.has(n) && reach.has(n));
}

/** A ⇒+ A for some A: an edge A → B when a rule A → α B β has α and β nullable. */
function isCyclic(g: Grammar): boolean {
  const nullable = new Set<string>();
  for (let ch = true; ch; ) {
    ch = false;
    for (const p of g.productions) if (!nullable.has(p.lhs) && p.rhs.every(s => nullable.has(s))) { nullable.add(p.lhs); ch = true; }
  }
  const edges = new Map<string, Set<string>>();
  for (const p of g.productions) {
    p.rhs.forEach((B, i) => {
      if (g.nonTerminals.has(B) && p.rhs.every((s, j) => j === i || nullable.has(s))) {
        if (!edges.has(p.lhs)) edges.set(p.lhs, new Set());
        edges.get(p.lhs)!.add(B);
      }
    });
  }
  for (const A of g.nonTerminals) {
    const seen = new Set<string>();
    const stack = [...(edges.get(A) ?? [])];
    while (stack.length) {
      const X = stack.pop()!;
      if (X === A) return true;
      if (seen.has(X)) continue;
      seen.add(X);
      stack.push(...(edges.get(X) ?? []));
    }
  }
  return false;
}

// ---------------------------------------------------------------- words

/** All single edits of the word (deletion, insertion, replacement), sampled down to `limit`, and random double edits. */
function mutations(word: string[], terminals: string[], rand: () => number, limit: number, doubles: number): string[][] {
  const single: string[][] = [];
  for (let i = 0; i < word.length; i++) single.push([...word.slice(0, i), ...word.slice(i + 1)]);
  for (let i = 0; i <= word.length; i++) for (const t of terminals) single.push([...word.slice(0, i), t, ...word.slice(i)]);
  for (let i = 0; i < word.length; i++) for (const t of terminals) if (t !== word[i]) single.push([...word.slice(0, i), t, ...word.slice(i + 1)]);
  const edit = (w: string[]): string[] => {
    const t = terminals[Math.floor(rand() * terminals.length)];
    const kind = Math.floor(rand() * 3);
    const i = Math.floor(rand() * (w.length + 1));
    if (kind === 0 && w.length > 0) return [...w.slice(0, Math.min(i, w.length - 1)), ...w.slice(Math.min(i, w.length - 1) + 1)];
    if (kind === 1 || w.length === 0) return [...w.slice(0, i), t, ...w.slice(i)];
    const j = Math.min(i, w.length - 1);
    return [...w.slice(0, j), t, ...w.slice(j + 1)];
  };
  const out = single.length <= limit ? single : Array.from({ length: limit }, () => single[Math.floor(rand() * single.length)]);
  for (let k = 0; k < doubles; k++) out.push(edit(edit(word)));
  return out;
}

interface WordBudget {
  /** Enumerate all words up to the longest length with at most this many words */
  enumerate: number;
  maxLength: number;
  /** Members from the word generator and the example word (with their mutations) */
  members: number;
  mutationsPerMember: number;
  cap: number;
}

function wordsFor(g: Grammar, sample: string[] | null, seed: number, b: WordBudget): string[][] {
  const terminals = [...g.terminals];
  const rand = prng(seed);
  const out = new Map<string, string[]>();
  const add = (w: string[]) => {
    if (out.size < b.cap) out.set(w.join(' '), w);
  };
  let len = 0;
  let total = 1;
  while (len < b.maxLength && terminals.length > 0 && total + terminals.length ** (len + 1) <= b.enumerate) total += terminals.length ** ++len;
  const members: string[][] = [];
  if (sample) members.push(sample);
  const ex = exampleWord(g);
  if (ex) members.push(ex);
  for (const t of generateWords(g, b.members, 12)) if (t.tokens.length <= 14) members.push(t.tokens);
  for (const m of members) add(m);
  for (const w of wordsUpTo(terminals, len)) add(w);
  if (terminals.length > 0) for (const m of members) for (const w of mutations(m, terminals, rand, b.mutationsPerMember, 4)) add(w);
  return [...out.values()];
}

// ---------------------------------------------------------------- the matrix for one grammar

const LR_KEYS = [
  ['LR(0)', 'lr0Table'],
  ['SLR(1)', 'slr1Table'],
  ['LALR(1)', 'lalr1Table'],
  ['IELR(1)', 'ielr1Table'],
  ['LR(1)', 'lr1Table']
] as const;

const stopPosition = (wordLength: number, remaining: string[]) => wordLength + 1 - remaining.length;
const jsParser = (js: string): ((input: string) => { ok: boolean; rightParse: number[]; output: string }) =>
  new Function(js.replace('export function parse', 'function parse') + '\nreturn parse;')();
const stepsKey = (steps: { action?: string; actionDescription?: string; text?: { en: string } }[]) =>
  steps.map(s => s.action ?? s.actionDescription ?? s.text?.en ?? '').join('\n');

const GLR_MAX_TREES = 25;
/**
 * GLR copies the whole GSS at every step: on cyclic, highly ambiguous grammars a run grows quadratically.
 * The runs get no automaton: it only adds the items of the states to the copies (labels of the view).
 */
const GLR_MAX_STEPS = 600;
/** Cyclic grammars (A ⇒+ A) have infinitely many trees: GLR only lists 25 of them per GSS edge, so it is stopped early */
const GLR_MAX_STEPS_CYCLIC = 300;
/** Work budget of GLR per grammar, deterministic (not a time): Σ over the steps of the GSS size copied at the step */
const GLR_BUDGET = 40000;
const glrWork = (r: { steps: { gssSnapshot: { nodes: unknown[]; edges: unknown[] } }[] }) =>
  r.steps.reduce((x, st) => x + st.gssSnapshot.nodes.length + st.gssSnapshot.edges.length, 0);

async function matrix(label: string, text: string, words: (g: Grammar) => string[][]) {
  const parsed = parseGrammar(text);
  if (parsed.errors.length || !parsed.grammar) {
    fail('grammar', `${label}: ${JSON.stringify(parsed.errors)}`);
    return;
  }
  const g = parsed.grammar;
  const a: AnalysisDataResult | null = computeAnalysis(g);
  if (!a || a.stopped) {
    fail('analysis', `${label}: no complete analysis`);
    return;
  }
  const tag = (w: string[]) => `${label} '${w.join(' ') || 'ε'}'`;
  const reduced = isReduced(g);
  const ll = a.llTable;
  const sets: RecoverySets = recoverySets(g, a.analysis);
  const hasPrecedence = !!g.precedence && g.precedence.levels.length > 0;

  // Parsers that apply to this grammar
  const llModes: [string, LLParseMode][] = [];
  if (ll.isLL1) llModes.push(['LL(1)', { k: 1 }]);
  if (ll.isStrongLL2) llModes.push(['LL(2) strong', { k: 2, tables: 'strong' }]);
  if (ll.isLL2 && ll.ll2Complete) llModes.push(['LL(2) T(A,L)', { k: 2, tables: 'contexts' }]);
  if (ll.isLL2 && !ll.isStrongLL2 && !ll.ll2Complete) note('LL(2) grammar without complete tables T(A, L)');

  const lrTables: { name: string; table: LRTable; glrTable: LRTable; deterministic: boolean; exact: boolean }[] = [];
  for (const [name, key] of LR_KEYS) {
    const table = a[key];
    if (!table) continue;
    const raw = a.rawTables?.[name as keyof NonNullable<AnalysisDataResult['rawTables']>];
    // precedence may make a table reject words of L(G): then only soundness is required
    const exact = table.resolvedConflicts.length === 0;
    lrTables.push({ name, table, glrTable: raw ?? table, deterministic: table.isConflictFree, exact });
  }
  const ascents: { name: string; table: LRTable; gen: GeneratedAscent; js: ReturnType<typeof jsParser> }[] = [];
  for (const t of lrTables) {
    if (!t.deterministic || !canGenerateAscent(t.table)) continue;
    try {
      const gen = generateRecursiveAscent(g, t.table);
      ascents.push({ name: t.name, table: t.table, gen, js: jsParser(gen.code.js) });
    } catch (err) {
      fail('RA generation', `${label} ${t.name}: ${String(err)}`);
    }
  }
  const atn = buildATN(g);
  const allCompat = checkALLCompatibility(g, a.analysis);
  const ettpTable = buildETTPTable(g);
  const cnfNeeded = cnfViolations(g).length > 0;
  let cnf: Grammar | null = cnfNeeded ? null : g;
  if (cnfNeeded) {
    try {
      cnf = convertToChomsky(g).transformedGrammar;
      if (cnfViolations(cnf).length > 0) {
        fail('CNF', `${label}: the converted grammar is not in CNF`);
        cnf = null;
      }
    } catch (err) {
      fail('CNF', `${label}: ${String(err)}`);
    }
  }

  const list = words(g);
  const started = performance.now();
  let glrSpent = 0;
  const glrMaxSteps = isCyclic(g) ? GLR_MAX_STEPS_CYCLIC : GLR_MAX_STEPS;
  for (let wi = 0; wi < list.length; wi++) {
    if (wi % 40 === 39) await yieldToRunner();
    const w = list[wi];
    const n = w.length;
    const inL = timed('oracle', () => accepts(g, w));
    const mem: MembershipResult = timed('membership', () => testMembership(g, w, 30));
    const vp = mem.viablePrefix;
    const listedAll = Number.isFinite(mem.treeCount) && mem.treeCount <= 30;
    const memShapes = new Set(mem.trees.map(t => shape(t.tree)));

    // the membership test itself
    count('membership (CYK-based)', label, mem.accepted, mem.trees.length);
    if (mem.accepted !== inL) fail('membership accept', `${tag(w)}: ${mem.accepted}, oracle ${inL}`);
    for (const t of mem.trees) {
      const e = treeError(g, t.tree, w) ?? parseError(g, t.leftParse, 'leftmost', t.tree, w);
      if (e) fail('membership tree', `${tag(w)}: ${e}`);
    }
    if (!inL && (vp < 0 || vp > n)) fail('membership viable prefix', `${tag(w)}: ${vp}`);

    // ---------------- LL(1), LL(2)
    let llPos: number | null = null;
    let llLeftParse: number[] | null = null;
    for (const [name, mode] of llModes) {
      const r = timed('LL', () => simulateLLParse(w, g, ll, undefined, mode));
      count(name, label, r.accepted);
      const last = r.steps[r.steps.length - 1];
      if (r.accepted !== inL) {
        fail(`${name} accept`, `${tag(w)}: ${r.accepted}, oracle ${inL}`);
        continue;
      }
      if (r.accepted) {
        const e = treeError(g, r.finalTree, w) ?? parseError(g, last.leftParse, 'leftmost', r.finalTree, w);
        if (e) fail(`${name} tree/left parse`, `${tag(w)}: ${e}`);
        if (name === 'LL(1)') llLeftParse = last.leftParse;
        else if (llLeftParse && !sameSeq(llLeftParse.map(String), last.leftParse.map(String))) fail(`${name} left parse ≠ LL(1)`, tag(w));
      } else {
        const pos = stopPosition(n, last.remainingInput);
        if (name === 'LL(1)') llPos = pos;
        // correct-prefix property: LL(1) stops exactly after the viable prefix, LL(2) at most one symbol earlier
        const lo = name === 'LL(1)' ? vp : vp - 1;
        if (pos < lo || (reduced && pos > vp)) fail(`${name} error position`, `${tag(w)}: stops at ${pos}, viable prefix ${vp}${reduced ? '' : ' (non-reduced)'}`);
        else if (pos < vp) note(`${name}: error found one symbol before the end of the viable prefix (look-ahead 2)`);
        else if (pos > vp) note(`${name}: error found after the viable prefix (non-reduced grammar)`);
      }
      // error recovery on
      const rr = timed('LL recovery', () => simulateLLParse(w, g, ll, undefined, mode, { recovery: { sets } }));
      count(`${name} + recovery`, label, rr.accepted);
      if (inL) {
        if (!rr.accepted || (rr.errors?.length ?? 0) > 0 || stepsKey(rr.steps) !== stepsKey(r.steps)) fail(`${name} recovery changes a correct word`, tag(w));
      } else {
        const pos = stopPosition(n, last.remainingInput);
        if (rr.accepted || !rr.errors?.length) fail(`${name} recovery accepts or reports no error`, tag(w));
        else if (rr.errors[0].position !== pos) fail(`${name} recovery first error`, `${tag(w)}: ${rr.errors[0].position}, without recovery ${pos}`);
      }
    }

    // ---------------- recursive descent (LL(1))
    if (ll.isLL1) {
      const rd = timed('RD', () => simulateRecursiveDescent(w, g, a.analysis, { ruleActions: [] }));
      count('recursive descent', label, rd.accepted);
      const last = rd.steps[rd.steps.length - 1];
      if (rd.truncated) fail('RD truncated', tag(w));
      if (rd.accepted !== inL) fail('RD accept', `${tag(w)}: ${rd.accepted}, oracle ${inL}`);
      else if (rd.accepted) {
        const e = treeError(g, rd.finalTree, w) ?? parseError(g, rd.leftParse, 'leftmost', rd.finalTree, w);
        if (e) fail('RD tree/left parse', `${tag(w)}: ${e}`);
        if (llLeftParse && !sameSeq(rd.leftParse.map(String), llLeftParse.map(String))) fail('RD left parse ≠ LL(1)', `${tag(w)}: ${rd.leftParse.join(' ')} vs ${llLeftParse.join(' ')}`);
      } else if (llPos !== null && last.lookaheadIndex !== llPos) {
        fail('RD error position ≠ LL(1)', `${tag(w)}: ${last.lookaheadIndex} vs ${llPos}`);
      }
      const rr = timed('RD recovery', () => simulateRecursiveDescent(w, g, a.analysis, { ruleActions: [], recovery: { sets } }));
      count('recursive descent + recovery', label, rr.accepted);
      if (inL) {
        // the texts name the stop sets with recovery on; the calls, rules, matches and input positions must be the same
        const key = (r: typeof rd) => r.steps.map(s => `${s.activeFunction}|${s.lookaheadIndex}|${s.ruleApplied?.id ?? ''}|${s.matchedToken ?? ''}|${s.callStack.length}`).join(' ');
        if (!rr.accepted || (rr.errors?.length ?? 0) > 0 || key(rr) !== key(rd) || !sameSeq(rr.leftParse.map(String), rd.leftParse.map(String)) || shape(rr.finalTree!) !== shape(rd.finalTree!)) fail('RD recovery changes a correct word', tag(w));
      } else if (rr.accepted || !rr.errors?.length) fail('RD recovery accepts or reports no error', tag(w));
      else if (rr.errors[0].position !== last.lookaheadIndex) fail('RD recovery first error', `${tag(w)}: ${rr.errors[0].position} vs ${last.lookaheadIndex}`);
    }

    // ---------------- deterministic LR, both layouts; recursive ascent
    const lrRight = new Map<string, number[]>();
    const lrTree = new Map<string, string>();
    const lrPos = new Map<string, number>();
    for (const t of lrTables) {
      if (!t.deterministic) continue;
      let dragon: { accepted: boolean; rightParse: number[]; pos: number } | null = null;
      for (const layout of ['dragon', 'lecture'] as LRLayout[]) {
        const name = `${t.name} ${layout}`;
        const r = timed('LR', () => simulateLRParse(w, g, t.table, layout));
        count(`${t.name} (${layout})`, label, r.accepted);
        const last = r.steps[r.steps.length - 1];
        const pos = r.accepted ? n : stopPosition(n, last.remainingInput);
        if (r.accepted && !inL) fail(`${t.name} accepts a word outside L(G)`, `${tag(w)} ${layout}`);
        else if (!r.accepted && inL) {
          if (t.exact) fail(`${t.name} rejects a word of L(G)`, `${tag(w)} ${layout}`);
          else note(`${t.name}: word of L(G) rejected because precedence removed an action`);
        }
        if (r.accepted) {
          const e = treeError(g, r.finalTree, w) ?? parseError(g, last.rightParse, 'rightmost', r.finalTree, w);
          if (e) fail(`${t.name} tree/right parse`, `${tag(w)} ${layout}: ${e}`);
          else if (layout === 'dragon') lrTree.set(t.name, shape(r.finalTree!));
        } else if (!inL && t.exact && (pos < vp || (reduced && pos > vp))) {
          fail(`${t.name} error position`, `${tag(w)} ${layout}: stops at ${pos}, viable prefix ${vp}${reduced ? '' : ' (non-reduced)'}`);
        }
        if (!dragon) {
          dragon = { accepted: r.accepted, rightParse: last.rightParse, pos };
          lrRight.set(t.name, last.rightParse);
          lrPos.set(t.name, pos);
        } else if (dragon.accepted !== r.accepted || dragon.pos !== pos || (r.accepted && !sameSeq(dragon.rightParse.map(String), last.rightParse.map(String)))) {
          fail(`${t.name} dragon ≠ lecture`, `${tag(w)}: ${JSON.stringify(dragon)} vs ${JSON.stringify({ accepted: r.accepted, pos, rp: last.rightParse })}`);
        }
        // error recovery on (in one layout per word, alternating; errorRecovery.test.ts has more)
        if ((wi + (layout === 'dragon' ? 0 : 1)) % 2 === 1) continue;
        const rr = timed('LR recovery', () => simulateLRParse(w, g, t.table, layout, undefined, { recovery: { sets } }));
        count(`${t.name} (${layout}) + recovery`, label, rr.accepted);
        if (r.accepted) {
          if (!rr.accepted || (rr.errors?.length ?? 0) > 0 || stepsKey(rr.steps) !== stepsKey(r.steps)) fail(`${t.name} recovery changes an accepted word`, `${tag(w)} ${layout}`);
        } else if (rr.accepted || !rr.errors?.length) fail(`${t.name} recovery accepts or reports no error`, `${tag(w)} ${layout}`);
        else if (rr.errors[0].position !== pos) fail(`${t.name} recovery first error`, `${tag(w)} ${layout}: ${rr.errors[0].position} vs ${pos}`);
      }
    }
    for (const ra of ascents) {
      const sim = timed('RA', () => simulateRecursiveAscent(w, ra.gen, ra.table));
      count(`recursive ascent ${ra.name}`, label, sim.accepted);
      const lr = simulateLRParse(w, g, ra.table, 'dragon');
      const lrLast = lr.steps[lr.steps.length - 1];
      if (sim.stopped) fail('RA step limit', `${tag(w)} ${ra.name}`);
      if (sim.accepted !== lr.accepted) fail('RA accept ≠ LR', `${tag(w)} ${ra.name}: ${sim.accepted} vs ${lr.accepted}`);
      else if (sim.accepted) {
        if (!sameSeq(sim.rightParse.map(String), lrLast.rightParse.map(String))) fail('RA right parse ≠ LR', `${tag(w)} ${ra.name}`);
        const e = treeError(g, sim.finalTree, w) ?? parseError(g, sim.rightParse, 'rightmost', sim.finalTree, w);
        if (e) fail('RA tree/right parse', `${tag(w)} ${ra.name}: ${e}`);
      } else {
        const pos = stopPosition(n, lrLast.remainingInput);
        const raLast = sim.steps[sim.steps.length - 1];
        if (raLast.position !== pos) fail('RA error position ≠ LR', `${tag(w)} ${ra.name}: ${raLast.position} vs ${pos}`);
      }
      // the generated JavaScript
      const charOf = new Map(ra.gen.tokens.map(t => [t.terminal, t.char]));
      const res = timed('RA JS', () => ra.js(`${w.map(x => charOf.get(x)).join(' ')}$`));
      count(`recursive ascent JS ${ra.name}`, label, res.ok);
      if (res.ok !== lr.accepted) fail('RA JavaScript accept ≠ LR', `${tag(w)} ${ra.name}: ${res.ok}`);
      else if (res.ok && !sameSeq(res.rightParse.map(String), lrLast.rightParse.map(String))) fail('RA JavaScript right parse ≠ LR', `${tag(w)} ${ra.name}`);
      else if (!res.ok) {
        const pos = stopPosition(n, lrLast.remainingInput);
        const ch = pos >= n ? '$' : charOf.get(w[pos]);
        if (!res.output.trimEnd().endsWith(`ERR ${ch}`)) fail('RA JavaScript error symbol ≠ LR', `${tag(w)} ${ra.name}: ${res.output.slice(-30)} (expected ERR ${ch})`);
      }
      // error recovery on (every other word; rdRaRecovery.test.ts has more)
      if (wi % 2 !== 0) continue;
      const rr = timed('RA recovery', () => simulateRecursiveAscent(w, ra.gen, ra.table, { recovery: { sets } }));
      count(`recursive ascent ${ra.name} + recovery`, label, rr.accepted);
      if (lr.accepted) {
        if (!rr.accepted || (rr.errors?.length ?? 0) > 0 || rr.steps.length !== sim.steps.length || !sameSeq(rr.rightParse.map(String), sim.rightParse.map(String))) fail('RA recovery changes an accepted word', `${tag(w)} ${ra.name}`);
      } else if (rr.accepted || !rr.errors?.length) fail('RA recovery accepts or reports no error', `${tag(w)} ${ra.name}`);
      else if (rr.errors[0].position !== stopPosition(n, lrLast.remainingInput)) fail('RA recovery first error', `${tag(w)} ${ra.name}`);
    }

    // ---------------- GLR on every table (raw tables when precedence resolved conflicts), alternating layouts
    // GLR: on the LALR(1) table (the application's default) for every word, on one other table in turn
    const others = lrTables.filter(t => t.name !== 'LALR(1)');
    const glrTables = lrTables.filter(t => t.name === 'LALR(1)');
    if (others.length) glrTables.push(others[wi % others.length]);
    glrTables.forEach((t, ti) => {
      if (glrSpent > GLR_BUDGET) {
        note('GLR: skipped (work budget of the grammar used up)');
        return;
      }
      const layout: LRLayout = (ti + Math.floor(wi / Math.max(1, others.length))) % 2 === 0 ? 'dragon' : 'lecture';
      const r = timed('GLR', () => simulateGLRParse(w, g, t.glrTable, layout, glrMaxSteps, GLR_MAX_TREES));
      glrSpent += glrWork(r);
      // stopped by the step limit: only soundness can be checked
      if (r.truncated) {
        note('GLR: step limit of the test reached (only soundness checked)');
        if (r.accepted && !inL) fail('GLR (step limit) accepts a word outside L(G)', `${tag(w)} ${t.name} ${layout}`);
        for (const tree of r.accepted ? r.trees : []) {
          const e = treeError(g, tree, w);
          if (e) { fail('GLR (step limit) tree', `${tag(w)} ${t.name} ${layout}: ${e}`); break; }
        }
        return;
      }
      const name = `GLR ${t.name}`;
      count(name, label, r.accepted, r.trees.length);
      if (r.accepted !== inL) {
        fail('GLR accept', `${tag(w)} ${t.name} ${layout}: ${r.accepted}, oracle ${inL}`);
        return;
      }
      if (r.accepted) {
        for (const tree of r.trees) {
          const e = treeError(g, tree, w);
          if (e) fail('GLR tree', `${tag(w)} ${t.name} ${layout}: ${e}`);
          else if (listedAll && !memShapes.has(shape(tree))) fail('GLR tree not a membership tree', `${tag(w)} ${t.name}`);
        }
        if (new Set(r.trees.map(shape)).size !== r.trees.length) fail('GLR repeated tree', `${tag(w)} ${t.name} ${layout}`);
        // on a conflict-free table GLR is the deterministic parser
        if (t.deterministic && t.glrTable === t.table && lrTree.has(t.name) && (r.trees.length !== 1 || shape(r.trees[0]) !== lrTree.get(t.name))) fail('GLR ≠ LR on a conflict-free table', `${tag(w)} ${t.name} ${layout}`);
        const expected = Number.isFinite(mem.treeCount) ? Math.min(mem.treeCount, GLR_MAX_TREES) : GLR_MAX_TREES;
        if (r.totalTrees !== expected) {
          if (Number.isFinite(mem.treeCount)) fail('GLR tree count', `${tag(w)} ${t.name} ${layout}: ${r.totalTrees}, membership ${mem.treeCount}`);
          else note('GLR: fewer than 25 trees listed for a word with infinitely many');
        }
      } else {
        const last = r.steps[r.steps.length - 1];
        const pos = last.actionType === 'error' ? last.inputIndex : n;
        if (reduced && pos !== vp) fail('GLR error position', `${tag(w)} ${t.name} ${layout}: ${pos}, viable prefix ${vp}`);
      }
      // with the step limit of the application (the same run when it takes fewer steps)
      const app = r.steps.length < 299 ? r : timed('GLR', () => simulateGLRParse(w, g, t.glrTable, layout, 300, GLR_MAX_TREES));
      if (app.truncated) {
        // a run stopped by the limit says so and does not claim a rejection
        note('GLR: stopped by the 300-step limit of the application');
        if (!app.accepted && !/limit/.test(app.errorMessage ?? '')) fail('GLR (300 steps) truncated run reported as a rejection', `${tag(w)} ${t.name} ${layout}: ${app.errorMessage}`);
        if (app.accepted && !inL) fail('GLR (300 steps) accepts a word outside L(G)', `${tag(w)} ${t.name} ${layout}`);
        for (const tree of app.accepted ? app.trees : []) {
          const e = treeError(g, tree, w);
          if (e) { fail('GLR (300 steps) tree', `${tag(w)} ${t.name} ${layout}: ${e}`); break; }
        }
      } else if (app.accepted !== r.accepted || app.totalTrees !== r.totalTrees) {
        fail('GLR (300 steps) differs without saying it was stopped', `${tag(w)} ${t.name} ${layout}: ${app.accepted}/${app.totalTrees} vs ${r.accepted}/${r.totalTrees}`);
      }
      if (!t.exact && t.table !== t.glrTable) {
        // the precedence-resolved table: a subset of the trees
        const p = timed('GLR', () => simulateGLRParse(w, g, t.table, layout, glrMaxSteps, GLR_MAX_TREES));
        if (!p.truncated && inL && !p.accepted) note('GLR (precedence): word of L(G) rejected because precedence removed an action');
        if (p.accepted && !inL) fail('GLR (precedence) accepts a word outside L(G)', `${tag(w)} ${t.name}`);
        for (const tree of p.trees) {
          const e = treeError(g, tree, w);
          if (e) fail('GLR (precedence) tree', `${tag(w)} ${t.name}: ${e}`);
        }
      }
    });

    // ---------------- ALL(*)
    {
      const r = timed('ALL', () => simulateALLParse(w, g, atn));
      if (!allCompat.hasLeftRecursion) count('ALL(*)', label, r.accepted);
      if (allCompat.hasLeftRecursion) {
        if (r.outcome !== 'notApplicable') fail('ALL(*) left recursion', `${tag(w)}: ${r.outcome}`);
      } else if (r.outcome === 'limit') {
        if (!r.error) fail('ALL(*) limit without a reason', tag(w));
        note('ALL(*): undecided (limit)');
      } else if (r.outcome !== (inL ? 'accepted' : 'rejected') || r.accepted !== inL) {
        fail('ALL(*) accept', `${tag(w)}: ${r.outcome}, oracle ${inL}`);
      } else if (r.accepted) {
        const e = treeError(g, r.finalTree, w);
        if (e) fail('ALL(*) tree', `${tag(w)}: ${e}`);
      }
    }

    // ---------------- Earley, Leo, ETTP
    const chartCount = (chart: ChartItem[][]) => (inL ? timed('chart count', () => countBSRTrees(earleyChartToBSR(g, w, chart), g, w, g.startSymbol, 0, n)) : 0);
    for (const leo of [false, true]) {
      const name = leo ? 'Earley + Leo' : 'Earley';
      const r = timed(name, () => simulateEarleyParse(w, g, { leo }));
      count(name, label, r.accepted, r.trees.length);
      if (r.truncated) fail(`${name} truncated`, tag(w));
      if (r.accepted !== inL) {
        fail(`${name} accept`, `${tag(w)}: ${r.accepted}, oracle ${inL}`);
        continue;
      }
      if (r.accepted) {
        const e = treeError(g, r.trees[0], w);
        if (e) fail(`${name} tree`, `${tag(w)}: ${e}`);
        else if (listedAll && !memShapes.has(shape(r.trees[0]))) fail(`${name} tree not a membership tree`, tag(w));
        const c = chartCount(r.sets.map((s, i) => [...s.items, ...r.reconstructedItems[i]]));
        if (c !== mem.treeCount) fail(`${name} chart tree count`, `${tag(w)}: ${c}, membership ${mem.treeCount}`);
      } else if (reduced) {
        let last = 0;
        r.sets.forEach((s, i) => { if (s.items.length > 0) last = i; });
        if (last !== vp) fail(`${name} last non-empty set`, `${tag(w)}: S${last}, viable prefix ${vp}`);
      }
    }
    {
      const r = timed('ETTP', () => simulateETTPParse(w, g, ettpTable));
      count('ETTP', label, r.accepted, r.trees.length);
      if (r.truncated) fail('ETTP truncated', tag(w));
      if (r.accepted !== inL) fail('ETTP accept', `${tag(w)}: ${r.accepted}, oracle ${inL}`);
      else if (r.accepted) {
        const e = treeError(g, r.trees[0], w);
        if (e) fail('ETTP tree', `${tag(w)}: ${e}`);
        else if (listedAll && !memShapes.has(shape(r.trees[0]))) fail('ETTP tree not a membership tree', tag(w));
        const chart = r.sets.map(s => s.items.flatMap(p => ettpTable.states[p.stateId].items.map(it => ({ production: it.production, dot: it.dot, origin: p.origin }))));
        const c = chartCount(chart);
        if (c !== mem.treeCount) fail('ETTP chart tree count', `${tag(w)}: ${c}, membership ${mem.treeCount}`);
      } else if (reduced) {
        let last = 0;
        r.sets.forEach((s, i) => { if (s.items.length > 0) last = i; });
        if (last !== vp) fail('ETTP last non-empty set', `${tag(w)}: S${last}, viable prefix ${vp}`);
      }
    }

    // ---------------- GLL (with and without the look-ahead test)
    for (const lookahead of [true, false]) {
      const name = lookahead ? 'GLL' : 'GLL (no look-ahead test)';
      const r = timed(name, () => parseGLL(g, w, { lookahead, maxDescriptors: 200000 }));
      count(name, label, r.accepted, r.trees.length);
      if (r.truncated) fail(`${name} truncated`, tag(w));
      if (r.accepted !== inL) {
        fail(`${name} accept`, `${tag(w)}: ${r.accepted}, oracle ${inL}`);
        continue;
      }
      if (r.treeCount !== mem.treeCount) fail(`${name} tree count`, `${tag(w)}: ${r.treeCount}, membership ${mem.treeCount}`);
      for (const tree of r.trees) {
        const e = treeError(g, tree, w);
        if (e) { fail(`${name} tree`, `${tag(w)}: ${e}`); break; }
        if (listedAll && !memShapes.has(shape(tree))) { fail(`${name} tree not a membership tree`, tag(w)); break; }
      }
      if (new Set(r.trees.map(shape)).size !== r.trees.length) fail(`${name} repeated tree`, tag(w));
      if (Number.isFinite(mem.treeCount) && r.trees.length !== Math.min(mem.treeCount, 50)) fail(`${name} trees listed`, `${tag(w)}: ${r.trees.length} of ${mem.treeCount}`);
    }

    // ---------------- CYK on G (in CNF) or G′
    if (cnf) {
      const t = timed('CYK', () => cykTable(cnf!, w));
      const trees = t.accepted ? timed('CYK', () => extractCYKTrees(cnf!, w, t, 5)) : [];
      count('CYK', label, t.accepted, trees.length);
      if (t.accepted !== inL) fail('CYK accept', `${tag(w)}: ${t.accepted}, oracle ${inL}`);
      else if (t.accepted) {
        const exact = testMembership(cnf, w, 1).treeCount;
        const c = countCYKTrees(cnf, t);
        if (c !== BigInt(exact)) fail('CYK tree count', `${tag(w)}: ${c}, membership of G′ ${exact}`);
        if (trees.length !== Math.min(5, exact)) fail('CYK trees listed', `${tag(w)}: ${trees.length} of ${exact}`);
        if (new Set(trees.map(shape)).size !== trees.length) fail('CYK repeated tree', tag(w));
        for (const tree of trees) {
          const e = treeError(cnf, tree, w);
          if (e) { fail('CYK tree (in G′)', `${tag(w)}: ${e}`); break; }
        }
      }
    }
  }
  matrixSizes.push({ label, words: list.length, members: 0 });
  if (process.env.MATRIX_VERBOSE) console.log(`${label}: ${list.length} words, ${Math.round(performance.now() - started)} ms, ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
}

const matrixSizes: { label: string; words: number; members: number }[] = [];

/** The larger random grammars of audit.test.ts (2–5 non-terminals, more terminals than non-terminals on right-hand sides). */
function bigGrammar(seed: number): string {
  const rand = prng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const nts = ['S', 'A', 'B', 'C', 'D'].slice(0, 2 + Math.floor(rand() * 4));
  const ts = ['a', 'b', 'c'].slice(0, 2 + Math.floor(rand() * 2));
  return nts.map(nt => {
    const alts: string[] = [];
    const k = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < k; i++) {
      const len = Math.floor(rand() * 4);
      alts.push(len === 0 ? 'ε' : Array.from({ length: len }, () => (rand() < 0.35 ? pick(nts) : pick(ts))).join(' '));
    }
    return `${nt} -> ${alts.join(' | ')}`;
  }).join('\n');
}

const report = (title: string) => {
  const lines = [...failures].map(([c, l]) => `${c}: ${l.length}\n   ${l.slice(0, 5).join('\n   ')}`);
  failures.clear();
  return lines.length ? `${title}\n${lines.join('\n')}` : '';
};
const timesText = () => [...times].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');

const RANDOM_BUDGET: WordBudget = { enumerate: 130, maxLength: 7, members: 10, mutationsPerMember: 5, cap: 150 };

describe('parser matrix: every parser on every grammar, against the Earley and membership oracles', () => {
  it('presets: all short words, the sample input, generated words and their mutations', async () => {
    const t0 = Date.now();
    for (const [i, p] of PRESET_GRAMMARS.entries()) {
      await yieldToRunner();
      await matrix(`preset ${p.id}`, p.grammarText, g => {
        const sample = tokenizeInput(p.sampleInput, g.terminals);
        return wordsFor(g, sample.unknown.length ? null : sample.tokens, 1000 + i, { enumerate: 100, maxLength: 6, members: 10, mutationsPerMember: 8, cap: 140 });
      });
    }
    console.log(`presets: ${Date.now() - t0} ms; ${timesText()}`);
    expect(report('presets')).toBe('');
  }, 600000);

  it('random grammars (randomGrammar.ts and the bigger generator of audit.test.ts): all words up to a length, generated words and mutations', async () => {
    const t0 = Date.now();
    for (let seed = 1; seed <= 60; seed++) {
      await yieldToRunner();
      await matrix(`random ${seed}`, randomGrammarText(seed), g => wordsFor(g, null, seed, RANDOM_BUDGET));
    }
    for (let seed = 1; seed <= 40; seed++) {
      await yieldToRunner();
      await matrix(`big ${seed}`, bigGrammar(seed), g => wordsFor(g, null, 5000 + seed, RANDOM_BUDGET));
    }
    console.log(`random: ${Date.now() - t0} ms`);
    expect(report('random')).toBe('');
  }, 600000);

  it('random LL(1) grammars with a non-empty language (LL(1), LL(2), recursive descent are rare among the random ones)', async () => {
    const t0 = Date.now();
    let found = 0;
    for (let seed = 10000; found < 24 && seed < 14000; seed++) {
      const text = seed % 2 === 0 ? randomGrammarText(seed) : bigGrammar(seed);
      const g = parseGrammar(text).grammar;
      if (!g || g.terminals.size === 0) continue;
      const a = computeAnalysis(g);
      if (!a?.llTable.isLL1 || !exampleWord(g) || generateWords(g, 3, 12).length < 3) continue;
      found++;
      await yieldToRunner();
      await matrix(`LL(1) seed ${seed}`, text, gr => wordsFor(gr, null, seed, RANDOM_BUDGET));
    }
    expect(found).toBe(24);
    console.log(`LL(1) grammars: ${Date.now() - t0} ms`);
    expect(report('LL(1) grammars')).toBe('');
  }, 600000);

  it('the checks themselves reject wrong trees and parses', () => {
    const g = parseGrammar('E -> E + T | T' + NL + 'T -> a | ε').grammar!;
    const w = ['a', '+', 'a'];
    const lr = simulateLRParse(w, g, computeAnalysis(g)!.lalr1Table);
    const last = lr.steps[lr.steps.length - 1];
    expect(treeError(g, lr.finalTree, w)).toBeNull();
    expect(parseError(g, last.rightParse, 'rightmost', lr.finalTree, w)).toBeNull();
    // the leftmost reading of a right parse, a wrong word, a swapped child, a missing ε-subtree
    expect(parseError(g, last.rightParse, 'leftmost', undefined, w)).not.toBeNull();
    expect(treeError(g, lr.finalTree, ['a', '+'])).toMatch(/leaves/);
    const swapped = JSON.parse(JSON.stringify(lr.finalTree)) as DerivationNode;
    swapped.children!.reverse();
    expect(treeError(g, swapped, w)).toMatch(/no rule/);
    const eps = simulateLRParse(['+', 'a'], g, computeAnalysis(g)!.lalr1Table);
    expect(eps.accepted).toBe(true);
    const cut = JSON.parse(JSON.stringify(eps.finalTree)) as DerivationNode;
    cut.children![0].children = [];
    expect(treeError(g, cut, ['+', 'a'])).toBe('no rule E → ε');
    // a reordered right parse no longer is the postorder of the tree
    const rp = [...last.rightParse];
    [rp[0], rp[1]] = [rp[1], rp[0]];
    expect(parseError(g, rp, 'rightmost', lr.finalTree, w)).not.toBeNull();
    expect(isCyclic(parseGrammar(['S -> A | a', 'A -> B S | b', 'B -> ε'].join(NL)).grammar!)).toBe(true);
    expect(isCyclic(g)).toBe(false);
  });

  it('GLR stopped by its step limit says so instead of rejecting the word', () => {
    // with the application's limits (LRView: 300 steps, 25 trees) both words of L(G) were reported as rejected
    // (the matrix checks complete runs with a larger limit)
    const cases: [string, string[]][] = [
      ['S -> S S | a', Array(12).fill('a')],
      ['E -> E + E | E * E | ( E ) | id', 'id + id * id + id * id + id * id + id * id + id * id + id'.split(' ')]
    ];
    for (const [text, w] of cases) {
      const g = parseGrammar(text).grammar!;
      const t = computeAnalysis(g)!.lalr1Table;
      expect(accepts(g, w)).toBe(true);
      const app = simulateGLRParse(w, g, t, 'dragon', 300, 25, t.automaton);
      expect(app.truncated, text).toBe(true);
      expect(app.accepted, text).toBe(false);
      expect(app.errorMessage, text).toBe('Parsing stopped after reaching the limit of 300 steps: membership is undecided (the word is not rejected).');
      expect(app.errorMessageCz, text).toMatch(/limitu 300 kroků: o příslušnosti slova nerozhodnuto/);
    }
    // a run within the limit is not marked, a real rejection keeps its message
    const g = parseGrammar('S -> S S | a').grammar!;
    const t = computeAnalysis(g)!.lalr1Table;
    const r = simulateGLRParse(['a', 'a', 'a'], g, t, 'dragon', 300, 25, t.automaton);
    expect(r.truncated).toBe(false);
    expect(r.totalTrees).toBe(2);
    expect(simulateGLRParse(['a', 'b'], g, t, 'dragon', 300, 25, t.automaton).errorMessage).toMatch(/^Syntax error/);
  });

  it('statistics: every parser ran on accepted and rejected words', () => {
    const rows = [...stats].map(([p, s]) => `${p.padEnd(36)} grammars ${String(s.grammars.size).padStart(4)}  words ${String(s.words).padStart(7)}  accepted ${String(s.accepted).padStart(6)}  rejected ${String(s.rejected).padStart(6)}  trees ${s.trees}`);
    const total = [...stats.values()].reduce((x, s) => x + s.words, 0);
    console.log(`times (ms): ${timesText()}`);
    console.log(`grammars ${matrixSizes.length}, words ${matrixSizes.reduce((x, m) => x + m.words, 0)}, parser runs ${total}\n${rows.join('\n')}\nnotes:\n${[...notes].map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
    // the matrix is not vacuous: every parser saw words of L(G) and other words on many grammars
    for (const [p, s] of stats) {
      expect(s.grammars.size, p).toBeGreaterThanOrEqual(20);
      expect(s.accepted, p).toBeGreaterThanOrEqual(15);
      expect(s.rejected, p).toBeGreaterThanOrEqual(200);
    }
    expect(stats.size).toBeGreaterThanOrEqual(50);
  });
});
