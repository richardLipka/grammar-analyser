/**
 * Counterexamples for LR conflicts (Isradisaikul & Myers, PLDI 2015; Bison 3.7 -Wcounterexamples).
 *
 * For a conflict cell (state s, lookahead t) with two actions:
 *
 * - Unifying counterexample: ONE word with two derivation trees whose LR parses agree up to the
 *   conflict point and there take the two conflicting actions — a proof that the grammar is
 *   ambiguous. The paper searches with a product parser; we reuse the bounded ambiguity search
 *   (analyser/ambiguity.ts, shortest sentential forms first): for every word with two left parses
 *   it finds, both trees are turned into their shift/reduce sequences (reversed rightmost
 *   derivations), and the first place where the sequences differ is a conflict cell — same stack,
 *   same remaining input, two different actions. The shortest such word is kept for every cell.
 *   Like the paper's search it is bounded (word length, number of forms): "not found" is no proof
 *   of anything.
 *
 * - Non-unifying counterexample (the paper's Section 4): two derivations from the start symbol
 *   that share the prefix up to the conflict point (•) and then go on differently — one with the
 *   reduce item (and t right after •), the other with the shift item (t after • inside its rule)
 *   or the other reduce item. The prefix is a shortest "lookahead-sensitive path" from the start
 *   item to the conflict item: vertices are (state, item, lookahead), edges are transitions of the
 *   automaton and production steps [A → α • B β, a] → [B → • γ, b] with b ∈ FIRST(β a) — so the
 *   lookahead is the one that really follows in that derivation, not FOLLOW(A). The second
 *   derivation is searched along the same states (only the production steps may differ). The
 *   productions open on the path are then completed so that t comes right after •; the other
 *   symbols stay as they are (the paper also prefers non-terminals to made-up terminals).
 *
 *   When no derivation has t right after • in the conflict state, the conflict exists only because
 *   of the table's approximation: SLR(1) reduces on all of FOLLOW(A), LR(0) on everything. When the
 *   two items need different prefixes, LALR(1) merged two canonical LR(1) states (Bison then also
 *   prints two separate examples). Both cases are reported as such.
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { DerivationNode } from '../generator/wordGenerator';
import { ambiguityWitnesses, treeFromLeftParse } from '../analyser/ambiguity';
import { LRAutomaton } from './lrAutomaton';
import { LRAction, LRConflict, LR0_ACTION_COLUMN } from './lrTable';
import { testMembership } from '../parser/membership';

/** Trees of one witness word whose pairs are located at their conflict cells. */
const MAX_TREES_PER_WORD = 40;
/** Pairs of trees located in all (keeps the first opening of a panel fast on very ambiguous grammars). */
const MAX_PAIRS = 20000;

/** One derivation of a non-unifying counterexample. */
export interface CounterexampleDerivation {
  /** The sentential form; the conflict point • is before form[dot]. */
  form: string[];
  dot: number;
  /** Derivation tree (leaves may be non-terminals that were not expanded). */
  tree: DerivationNode;
  /** The conflict action this derivation uses. */
  action: LRAction;
  /** Its item in the conflict state (production and dot position). */
  item: { production: Production; dot: number };
  /**
   * False when no derivation reaching the conflict state has the conflict lookahead right after •
   * for this reduce item (the table reduces there only because of FOLLOW / LR(0)).
   */
  lookaheadInContext: boolean;
  /** For such an item: a derivation elsewhere in which the lookahead does follow the rule (why it is in FOLLOW). */
  followWitness?: { form: string[]; dot: number; tree: DerivationNode };
}

export type LRCounterexample =
  | {
    kind: 'unifying';
    /** The word with two derivation trees. */
    word: string[];
    /** Conflict point in the word. */
    dot: number;
    /** The lookahead at the conflict point (END_MARKER at the end of the word). */
    lookahead: string;
    trees: [DerivationNode, DerivationNode];
    /** The two left parses (rule numbers) the trees come from. */
    parses: [number[], number[]];
    /** What each tree's parser does at the conflict point. */
    actions: [LRAction, LRAction];
  }
  | {
    kind: 'nonunifying';
    derivations: [CounterexampleDerivation, CounterexampleDerivation];
    /** Both derivations have the same prefix before •. */
    samePrefix: boolean;
    /** The bounded search for a unifying counterexample ran out of its limits (no proof either way). */
    searchExhausted: boolean;
    /** The searched word length. */
    maxLength: number;
  };

export interface CounterexampleOptions {
  /** Length bound for the unifying search (default 9). */
  maxLength?: number;
  /** Sentential forms the unifying search may visit (default 60000). */
  maxForms?: number;
}

interface Edge {
  kind: 'shift' | 'prod';
  symbol?: string;
  production?: Production;
}

interface Vertex {
  /** Index along a fixed state sequence (constrained search), else -1. */
  pos: number;
  state: number;
  production: Production;
  dot: number;
  la: string;
}

/** Finder bound to one grammar and automaton; the unifying search runs once, on first use. */
export interface CounterexampleFinder {
  forConflict(conflict: LRConflict): LRCounterexample | null;
}

export function createCounterexampleFinder(g: Grammar, automaton: LRAutomaton, options: CounterexampleOptions = {}): CounterexampleFinder {
  const maxLength = options.maxLength ?? 9;
  const maxForms = options.maxForms ?? 60000;
  const nts = g.nonTerminals;
  const aug = automaton.augmentedProduction;
  const rules = [aug, ...g.productions.filter(p => p.id !== aug.id)];
  const byLhs = new Map<string, Production[]>();
  for (const p of rules) {
    if (!byLhs.has(p.lhs)) byLhs.set(p.lhs, []);
    byLhs.get(p.lhs)!.push(p);
  }
  const byId = new Map(rules.map(p => [p.id, p] as const));

  // FIRST and nullable (terminal sets), shortest ε-trees and shortest trees starting with a terminal.
  const nullable = new Set<string>();
  const first = new Map<string, Set<string>>([...nts, aug.lhs].map(a => [a, new Set<string>()]));
  for (let changed = true; changed;) {
    changed = false;
    for (const p of rules) {
      const f = first.get(p.lhs)!;
      let allNull = true;
      for (const x of p.rhs) {
        const add = nts.has(x) ? first.get(x)! : new Set([x]);
        for (const t of add) if (!f.has(t)) { f.add(t); changed = true; }
        if (!(nts.has(x) && nullable.has(x))) { allNull = false; break; }
      }
      if (allNull && !nullable.has(p.lhs)) { nullable.add(p.lhs); changed = true; }
    }
  }
  const firstOf = (symbols: string[], after: string): Set<string> => {
    const out = new Set<string>();
    for (const x of symbols) {
      if (!nts.has(x)) { out.add(x); return out; }
      for (const t of first.get(x)!) out.add(t);
      if (!nullable.has(x)) return out;
    }
    out.add(after);
    return out;
  };
  // Height-minimal rule choices (fixpoints): A ⇒* ε, and A ⇒* t … (other leaves left unexpanded).
  const epsRule = new Map<string, { p: Production; h: number }>();
  for (let changed = true; changed;) {
    changed = false;
    for (const p of rules) {
      if (!p.rhs.every(x => epsRule.has(x))) continue;
      const h = 1 + Math.max(0, ...p.rhs.map(x => epsRule.get(x)!.h));
      const cur = epsRule.get(p.lhs);
      if (!cur || h < cur.h) { epsRule.set(p.lhs, { p, h }); changed = true; }
    }
  }
  const startRule = new Map<string, { p: Production; at: number; h: number }>();
  for (let changed = true; changed;) {
    changed = false;
    for (const p of rules) {
      for (let i = 0; i < p.rhs.length; i++) {
        const x = p.rhs[i];
        const targets = nts.has(x) ? [...first.get(x)!].filter(t => startRule.has(`${x}\u0000${t}`)) : [x];
        for (const t of targets) {
          const h = 1 + Math.max(nts.has(x) ? startRule.get(`${x}\u0000${t}`)!.h : 0, ...p.rhs.slice(0, i).map(y => epsRule.get(y)!.h));
          const key = `${p.lhs}\u0000${t}`;
          const cur = startRule.get(key);
          if (!cur || h < cur.h) { startRule.set(key, { p, at: i, h }); changed = true; }
        }
        if (!(nts.has(x) && epsRule.has(x))) break;
      }
    }
  }

  let ids = 0;
  const leaf = (symbol: string): DerivationNode => ({ id: `cx_${ids++}`, symbol, isTerminal: !nts.has(symbol) && symbol !== aug.lhs });
  const epsTree = (a: string): DerivationNode => {
    const { p } = epsRule.get(a)!;
    return { id: `cx_${ids++}`, symbol: a, isTerminal: false, children: p.rhs.length ? p.rhs.map(epsTree) : [{ id: `cx_${ids++}`, symbol: 'ε', isTerminal: true }] };
  };
  const startTree = (a: string, t: string): DerivationNode => {
    const { p, at } = startRule.get(`${a}\u0000${t}`)!;
    const x = p.rhs[at];
    return {
      id: `cx_${ids++}`,
      symbol: a,
      isTerminal: false,
      children: [...p.rhs.slice(0, at).map(epsTree), nts.has(x) ? startTree(x, t) : leaf(x), ...p.rhs.slice(at + 1).map(leaf)]
    };
  };

  /**
   * Shortest path in the lookahead-sensitive graph from the start item [S' → • S, $] in the
   * initial state to a vertex accepted by `target`; with `along` only along that state sequence
   * and its symbols (the prefix of another derivation).
   */
  const search = (target: (v: Vertex) => boolean, along?: { states: number[]; symbols: string[] }): Edge[] | null => {
    const startState = along ? along.states[0] : 0;
    const start: Vertex = { pos: along ? 0 : -1, state: startState, production: aug, dot: 0, la: END_MARKER };
    const key = (v: Vertex) => `${v.pos}|${v.state}|${v.production.id}|${v.dot}|${v.la}`;
    const parent = new Map<string, { from: string; edge: Edge } | null>([[key(start), null]]);
    const queue: Vertex[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      if (target(v)) {
        const edges: Edge[] = [];
        for (let k = key(v), step = parent.get(k); step; k = step.from, step = parent.get(k)) edges.push(step.edge);
        return edges.reverse();
      }
      if (queue.length > 400000) return null;
      if (v.dot >= v.production.rhs.length) continue;
      const x = v.production.rhs[v.dot];
      const next: [Vertex, Edge][] = [];
      if (!along || (v.pos < along.symbols.length && along.symbols[v.pos] === x)) {
        const to = automaton.states[v.state].transitions.get(x);
        if (to !== undefined) next.push([{ ...v, pos: along ? v.pos + 1 : -1, state: to, dot: v.dot + 1 }, { kind: 'shift', symbol: x }]);
      }
      if (nts.has(x)) {
        const las = firstOf(v.production.rhs.slice(v.dot + 1), v.la);
        for (const q of byLhs.get(x) ?? []) {
          for (const b of las) next.push([{ ...v, production: q, dot: 0, la: b }, { kind: 'prod', production: q }]);
        }
      }
      for (const [w, edge] of next) {
        const k = key(w);
        if (parent.has(k)) continue;
        parent.set(k, { from: key(v), edge });
        queue.push(w);
      }
    }
    return null;
  };

  /** States and symbols of a path's transitions. */
  const prefixOf = (edges: Edge[]) => {
    const states = [0];
    const symbols: string[] = [];
    for (const e of edges) {
      if (e.kind !== 'shift') continue;
      symbols.push(e.symbol!);
      states.push(automaton.states[states[states.length - 1]].transitions.get(e.symbol!)!);
    }
    return { states, symbols };
  };

  /**
   * The derivation of a path: the open productions on it, completed so that `need` (the conflict
   * lookahead, or null) comes right after the conflict point.
   */
  const derivationOf = (edges: Edge[], need: string | null): { form: string[]; dot: number; tree: DerivationNode } => {
    type Open = { node: DerivationNode; production: Production; dot: number };
    const root: Open = { node: { id: `cx_${ids++}`, symbol: aug.lhs, isTerminal: false, children: [] }, production: aug, dot: 0 };
    const stack: Open[] = [root];
    let dot = 0;
    for (const e of edges) {
      const top = stack[stack.length - 1];
      if (e.kind === 'shift') {
        top.node.children!.push(leaf(e.symbol!));
        top.dot++;
        dot++;
      } else {
        const child: Open = { node: { id: `cx_${ids++}`, symbol: e.production!.lhs, isTerminal: false, children: [] }, production: e.production!, dot: 0 };
        top.node.children!.push(child.node);
        stack.push(child);
      }
    }
    // Complete the open productions from the innermost one outwards.
    let pending = need;
    for (let level = stack.length - 1; level >= 0; level--) {
      const o = stack[level];
      // The innermost one has its dot at the conflict point; the others have the child at their dot.
      const rest = o.production.rhs.slice(level === stack.length - 1 ? o.dot : o.dot + 1);
      for (const x of rest) {
        if (pending !== null && nts.has(x)) {
          if (startRule.has(`${x}\u0000${pending}`)) {
            o.node.children!.push(startTree(x, pending));
            pending = null;
          } else {
            o.node.children!.push(epsRule.has(x) ? epsTree(x) : leaf(x));
          }
        } else {
          if (pending !== null && x === pending) pending = null;
          o.node.children!.push(leaf(x));
        }
      }
      if (o.node.children!.length === 0) o.node.children!.push({ id: `cx_${ids++}`, symbol: 'ε', isTerminal: true });
    }
    const frontier = (n: DerivationNode): string[] =>
      n.children && n.children.length ? n.children.flatMap(frontier) : n.symbol === 'ε' ? [] : [n.symbol];
    // S' → S: show the tree of S, unless the derivation stops at S' itself (accept item).
    const sNode = root.node.children![0];
    const tree = sNode && sNode.children && stack.length > 1 ? sNode : root.node;
    return { form: frontier(tree), dot, tree };
  };

  // ---- Unifying counterexamples: all ambiguity witnesses, located at their conflict cell ----
  let unifying: Map<string, { word: string[]; dot: number; lookahead: string; trees: [DerivationNode, DerivationNode]; parses: [number[], number[]]; actions: [LRAction, LRAction] }[]> | undefined;
  let exhausted = false;
  const actionKey = (a: LRAction) => (a.type === 'reduce' ? `r${a.production!.id}` : a.type === 'accept' ? 'acc' : 's');
  const runUnifyingSearch = () => {
    unifying = new Map();
    const found = unifying;
    const register = (word: string[], parses: [number[], number[]], sequences?: [LRAction[], LRAction[]]) => {
      const cell = divergence(word, parses, sequences);
      if (!cell) return;
      const k = `${cell.state}|${cell.lookahead}`;
      if (!found.has(k)) found.set(k, []);
      const list = found.get(k)!;
      const pair = cell.actions.map(actionKey).sort().join('/');
      if (!list.some(e => e.actions.map(actionKey).sort().join('/') === pair)) {
        list.push({ word, dot: cell.dot, lookahead: cell.lookahead, trees: [treeFromLeftParse(g, parses[0]), treeFromLeftParse(g, parses[1])], parses, actions: cell.actions });
      }
    };
    // The search reports one pair of derivations per form it meets twice and does not expand the
    // second one, so the pairs of trees that part at other conflict cells would be missed: every
    // witness word is therefore parsed again and every pair of its trees (up to a limit) is located.
    const seenWords = new Set<string>();
    let pairBudget = MAX_PAIRS;
    let budgetHit = false;
    const result = ambiguityWitnesses(g, { maxLength, maxForms }, w => {
      register(w.word, w.parses);
      const wk = w.word.join('\u0000');
      if (seenWords.has(wk)) return false;
      seenWords.add(wk);
      if (pairBudget <= 0) {
        budgetHit = true;
        return false;
      }
      const m = testMembership(g, w.word, MAX_TREES_PER_WORD);
      if (m.moreTrees) budgetHit = true;
      const parses = m.trees.map(t => t.leftParse);
      const sequences = parses.map(actionsOf);
      for (let x = 0; x < parses.length; x++) {
        for (let y = x + 1; y < parses.length; y++) register(w.word, [parses[x], parses[y]], [sequences[x], sequences[y]]);
      }
      pairBudget -= (parses.length * (parses.length - 1)) / 2;
      return false;
    });
    // Words with more trees than listed, or not re-parsed for the budget: "not found" is no longer
    // a statement about all words up to the bound.
    exhausted = result.kind === 'unknown' || budgetHit;
  };

  /** Shift/reduce sequence of a left parse (the reversed rightmost derivation). */
  const actionsOf = (parse: number[]): LRAction[] => {
    type N = { p: Production; kids: (N | string)[] };
    let pos = 0;
    const build = (): N => {
      const p = byId.get(parse[pos++])!;
      return { p, kids: p.rhs.map(x => (nts.has(x) ? build() : x)) };
    };
    // left parse: build children left to right (the leftmost non-terminal is expanded first)
    const tree = build();
    const out: LRAction[] = [];
    const walk = (n: N) => {
      for (const k of n.kids) {
        if (typeof k === 'string') out.push({ type: 'shift' });
        else walk(k);
      }
      out.push({ type: 'reduce', production: n.p });
    };
    walk(tree);
    out.push({ type: 'accept' });
    return out;
  };

  /** Where the LR parses of two trees of the same word part: state, lookahead, the two actions. */
  const divergence = (word: string[], parses: [number[], number[]], sequences?: [LRAction[], LRAction[]]) => {
    const [a, b] = sequences ?? [actionsOf(parses[0]), actionsOf(parses[1])];
    const same = (x: LRAction, y: LRAction) => x.type === y.type && x.production?.id === y.production?.id;
    let i = 0;
    while (i < a.length && i < b.length && same(a[i], b[i])) i++;
    if (i >= a.length || i >= b.length) return null;
    const stack = [0];
    let read = 0;
    for (let k = 0; k < i; k++) {
      const act = a[k];
      if (act.type === 'shift') {
        const to = automaton.states[stack[stack.length - 1]].transitions.get(word[read++]);
        if (to === undefined) return null;
        stack.push(to);
      } else if (act.type === 'reduce') {
        stack.length -= act.production!.rhs.length;
        const to = automaton.states[stack[stack.length - 1]].transitions.get(act.production!.lhs);
        if (to === undefined) return null;
        stack.push(to);
      }
    }
    const lookahead = read < word.length ? word[read] : END_MARKER;
    return { state: stack[stack.length - 1], lookahead, dot: read, actions: [a[i], b[i]] as [LRAction, LRAction] };
  };

  // ---- Non-unifying counterexamples ----
  /** A conflict action as a search goal: its item in the conflict state, and the lookahead a reduce item must have. */
  type Goal = { action: LRAction; reduce: boolean; item: (v: Vertex) => boolean; la: string | null; matches: (v: Vertex) => boolean };
  const goalsOf = (c: LRConflict): Goal[] => {
    const t = c.symbol === LR0_ACTION_COLUMN ? null : c.symbol;
    const lr0 = automaton.variant === 'LR(0)';
    return c.actions.map(action => {
      if (action.type === 'shift') {
        const item = (v: Vertex) => v.state === c.stateId && v.dot < v.production.rhs.length &&
          (t === null ? !nts.has(v.production.rhs[v.dot]) : v.production.rhs[v.dot] === t);
        return { action, reduce: false, item, la: null, matches: item };
      }
      const p = action.type === 'accept' ? aug : action.production!;
      const item = (v: Vertex) => v.state === c.stateId && v.production.id === p.id && v.dot === p.rhs.length;
      const la = t === null || lr0 ? null : t;
      return { action, reduce: true, item, la, matches: (v: Vertex) => item(v) && (la === null || v.la === la) };
    });
  };
  const itemOfPath = (edges: Edge[]) => {
    let production = aug;
    let dot = 0;
    for (const e of edges) {
      if (e.kind === 'prod') { production = e.production!; dot = 0; } else dot++;
    }
    return { production, dot };
  };
  const laOf = (c: LRConflict) => (c.symbol === LR0_ACTION_COLUMN || automaton.variant === 'LR(0)' ? null : c.symbol);

  const nonUnifying = (c: LRConflict): LRCounterexample | null => {
    const goals = goalsOf(c);
    // The paper starts from the reduce item (its lookahead matters); a shift goal second.
    const ordered = [...goals.filter(gl => gl.reduce), ...goals.filter(gl => !gl.reduce)].slice(0, 2);
    if (ordered.length < 2) return null;
    const t = laOf(c);
    const pathTo = (gl: Goal) => {
      const exact = search(gl.matches);
      if (exact) return { edges: exact, inContext: true };
      const any = search(gl.item);
      return any ? { edges: any, inContext: false } : null;
    };
    const make = (gl: Goal, edges: Edge[], inContext: boolean): CounterexampleDerivation => {
      const d = derivationOf(edges, gl.reduce && inContext ? t : null);
      const item = itemOfPath(edges);
      const out: CounterexampleDerivation = { ...d, action: gl.action, item, lookaheadInContext: inContext };
      if (!inContext && t !== null && gl.reduce) {
        const p = item.production;
        const elsewhere = search(v => v.production.id === p.id && v.dot === p.rhs.length && v.la === t);
        if (elsewhere) out.followWitness = derivationOf(elsewhere, t);
      }
      return out;
    };

    const [g1, g2] = ordered;
    const p1 = pathTo(g1);
    if (!p1) return null;
    // Second item along the same states (paper: the derivations differ only in production steps).
    const along1 = prefixOf(p1.edges);
    const target2 = (v: Vertex) => v.pos === along1.symbols.length && g2.matches(v);
    const e2 = search(target2, along1);
    if (e2) {
      return finish([make(g1, p1.edges, p1.inContext), make(g2, e2, true)], true);
    }
    // The other way round: the second item first, then the first along its states.
    const p2 = pathTo(g2);
    if (!p2) return null;
    if (p2.inContext) {
      const along2 = prefixOf(p2.edges);
      const e1 = search(v => v.pos === along2.symbols.length && g1.matches(v), along2);
      if (e1) return finish([make(g1, e1, true), make(g2, p2.edges, p2.inContext)], true);
    }
    return finish([make(g1, p1.edges, p1.inContext), make(g2, p2.edges, p2.inContext)], false);
  };
  const finish = (derivations: [CounterexampleDerivation, CounterexampleDerivation], samePrefix: boolean): LRCounterexample => ({
    kind: 'nonunifying',
    derivations,
    samePrefix: samePrefix || derivations[0].form.slice(0, derivations[0].dot).join(' ') === derivations[1].form.slice(0, derivations[1].dot).join(' '),
    searchExhausted: exhausted,
    maxLength
  });

  return {
    forConflict(c: LRConflict): LRCounterexample | null {
      if (!unifying) runUnifyingSearch();
      const keyAction = (a: LRAction) => actionKey(a);
      const wanted = new Set(c.actions.map(keyAction));
      // LR(0) decides without the next symbol: its reductions stand in every column of the state,
      // so a reduce/reduce conflict is the same conflict whatever symbol follows. A shift needs its
      // own symbol, so a conflict with a shift (or accept) keeps to its column.
      const stateWide = c.symbol === LR0_ACTION_COLUMN ||
        (automaton.variant === 'LR(0)' && c.actions.every(a => a.type === 'reduce'));
      const cells = stateWide
        ? [...unifying!.entries()].filter(([k]) => k.startsWith(`${c.stateId}|`)).flatMap(([, v]) => v)
        : unifying!.get(`${c.stateId}|${c.symbol}`) ?? [];
      const hit = cells.find(e => e.actions.every(a => wanted.has(keyAction(a))));
      if (hit) return { kind: 'unifying', ...hit };
      return nonUnifying(c);
    }
  };
}
