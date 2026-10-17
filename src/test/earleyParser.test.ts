import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { simulateEarleyParse } from '../core/earley/earleyParser';
import {
  simulateETTPParse,
  buildETTPTable,
  isETTPKernelItem,
  getETTPTransitionReason,
  findPredictionTriggers
} from '../core/earley/ettpParser';
import { checkEarleyCompatibility, checkETTPCompatibility } from '../core/earley/earleyCompatibility';
import { analyzeGrammar } from '../core/analyser/grammarAnalyser';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { generateWords, DerivationNode } from '../core/generator/wordGenerator';
import { Grammar } from '../core/ast/grammar';
import { randomGrammarText } from './randomGrammar';
import { accepts } from './earley';

describe('Earley (1970) and ETTP (2025) Parsers Suite', () => {
  it('correctly parses arithmetic expressions in both Earley and ETTP', () => {
    const text = `E -> E "+" T | T\nT -> T "*" F | F\nF -> "(" E ")" | "id"`;
    const g = parseGrammar(text).grammar!;
    const input = 'id + id * id';
    const tokens = tokenizeInput(input, g.terminals).tokens;

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);
    expect(earleyRes.sets.length).toBe(tokens.length + 1);
    expect(earleyRes.trees.length).toBeGreaterThan(0);
    expect(earleyRes.stats.predictCount).toBeGreaterThan(0);
    expect(earleyRes.stats.scanCount).toBe(tokens.length);
    expect(earleyRes.stats.completeCount).toBeGreaterThan(0);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);
    expect(ettpRes.stats.predictCount).toBe(0); // ETTP has 0 runtime predictions!
    expect(ettpRes.stats.scanTransitions).toBeGreaterThanOrEqual(tokens.length);
    expect(ettpRes.table.states.length).toBeGreaterThan(0);
  });

  it('correctly handles grammars with cycles (S -> S | a) without looping', () => {
    const text = `S -> S | "a"`;
    const g = parseGrammar(text).grammar!;
    const tokens = ['a'];

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);

    const badTokens = ['a', 'a'];
    expect(simulateEarleyParse(badTokens, g).accepted).toBe(false);
    expect(simulateETTPParse(badTokens, g).accepted).toBe(false);
  });

  it('correctly handles empty word (epsilon) and nullable non-terminals', () => {
    const text = `S -> A B "c"\nA -> "a" | ε\nB -> "b" | ε`;
    const g = parseGrammar(text).grammar!;

    // 'c', 'a c', 'b c', 'a b c' are valid
    const validWords = [['c'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']];
    for (const w of validWords) {
      expect(simulateEarleyParse(w, g).accepted).toBe(true);
      expect(simulateETTPParse(w, g).accepted).toBe(true);
    }

    const invalidWords = [[], ['a'], ['b'], ['a', 'b']];
    for (const w of invalidWords) {
      expect(simulateEarleyParse(w, g).accepted).toBe(false);
      expect(simulateETTPParse(w, g).accepted).toBe(false);
    }
  });

  it('parses ambiguous dangling else grammar', () => {
    const text = `S -> "if" "c" "then" S "else" S | "if" "c" "then" S | "other"`;
    const g = parseGrammar(text).grammar!;
    const input = 'if c then if c then other else other';
    const tokens = tokenizeInput(input, g.terminals).tokens;

    const earleyRes = simulateEarleyParse(tokens, g);
    expect(earleyRes.accepted).toBe(true);
    expect(earleyRes.trees.length).toBeGreaterThan(0);

    const ettpRes = simulateETTPParse(tokens, g);
    expect(ettpRes.accepted).toBe(true);
  });

  it('verifies acceptance across all preset grammars with sampleInput', () => {
    for (const p of PRESET_GRAMMARS) {
      const parsed = parseGrammar(p.grammarText);
      if (!parsed.grammar || parsed.errors.length > 0) continue;
      const g = parsed.grammar;
      const analysis = analyzeGrammar(g);

      // Check compatibility diagnostics
      const earleyComp = checkEarleyCompatibility(g, analysis);
      const ettpComp = checkETTPCompatibility(g, analysis);

      if (analysis.endable.has(g.startSymbol)) {
        expect(earleyComp.canParse).toBe(true);
        expect(ettpComp.canParse).toBe(true);
      }

      if (p.sampleInput && p.sampleInput.trim() !== '') {
        const tokens = tokenizeInput(p.sampleInput, g.terminals).tokens;
        // If sample tokens are valid in the language, both should agree
        const earleyRes = simulateEarleyParse(tokens, g);
        const ettpRes = simulateETTPParse(tokens, g);
        expect(earleyRes.accepted).toBe(ettpRes.accepted);
      }
    }
  });

  it('verifies that the tree leaves match the input word across all preset grammars and sample inputs in Earley and ETTP', () => {
    function extractLeaves(node: { symbol: string; children?: any[] }): string[] {
      if (!node.children || node.children.length === 0) {
        if (node.symbol === 'ε') return [];
        return [node.symbol];
      }
      const leaves: string[] = [];
      for (const child of node.children) {
        leaves.push(...extractLeaves(child));
      }
      return leaves;
    }

    const mismatches: string[] = [];

    for (const p of PRESET_GRAMMARS) {
      const parsed = parseGrammar(p.grammarText);
      if (!parsed.grammar || parsed.errors.length > 0) continue;
      const g = parsed.grammar;

      const wordsToTest: string[][] = [];
      if (p.sampleInput && p.sampleInput.trim() !== '') {
        wordsToTest.push(tokenizeInput(p.sampleInput, g.terminals).tokens);
      }
      for (const w of generateWords(g, 3, 6)) {
        wordsToTest.push(w.tokens);
      }

      for (const tokens of wordsToTest) {
        const expected = tokens.join(' ');

      // 1. Verify Earley
      const earleyRes = simulateEarleyParse(tokens, g);
      if (earleyRes.accepted) {
        if (!earleyRes.trees || earleyRes.trees.length === 0) {
          mismatches.push(`[${p.id}] Earley accepted "${expected}" but returned no trees`);
        } else {
          const actual = extractLeaves(earleyRes.trees[0]).join(' ');
          if (actual !== expected) {
            mismatches.push(`[${p.id}] Earley leaf mismatch: expected "${expected}", got "${actual}"`);
          }
        }
      }

      // 2. Verify ETTP
      const ettpRes = simulateETTPParse(tokens, g);
      if (ettpRes.accepted) {
        if (!ettpRes.trees || ettpRes.trees.length === 0) {
          mismatches.push(`[${p.id}] ETTP accepted "${expected}" but returned no trees`);
        } else {
          const actual = extractLeaves(ettpRes.trees[0]).join(' ');
          if (actual !== expected) {
            mismatches.push(`[${p.id}] ETTP leaf mismatch: expected "${expected}", got "${actual}"`);
          }
        }
      }
    }
  }

  if (mismatches.length > 0) {
      console.error('Earley/ETTP Tree Leaf Mismatches:\n' + mismatches.join('\n'));
    }
    expect(mismatches).toEqual([]);
  });

  describe('Earley / ETTP Automaton Graph: kernel and predicted states, transition reasons', () => {
    it('splits the table into kernel states (one origin j) and predicted states (origin = set index)', () => {
      for (const preset of PRESET_GRAMMARS.slice(0, 10)) {
        const parsed = parseGrammar(preset.grammarText);
        if (!parsed.grammar) continue;
        const table = buildETTPTable(parsed.grammar);

        const start = table.states[table.startStateId];
        expect(start.kind).toBe('kernel');
        expect(start.items[0].production.id).toBe(-1); // S' -> . S
        expect(start.predictedStateId).toBeDefined();

        for (const s of table.states) {
          if (s.kind === 'kernel') {
            // Only S' -> . S has the dot at the start; every other item came from a transition.
            for (const it of s.items) if (it.production.id !== -1) expect(it.dot).toBeGreaterThan(0);
            expect(s.items.every(it => isETTPKernelItem(it, s))).toBe(true);
          } else {
            expect(s.predictedStateId).toBeUndefined();
            expect(s.items.some(it => it.dot === 0)).toBe(true);
            expect(s.items.some(it => isETTPKernelItem(it, s))).toBe(false);
            for (const it of s.items.filter(x => x.dot === 0)) {
              expect(findPredictionTriggers(table, s, it).length, `${it.production.lhs} in q${s.id} must be predicted by some item`).toBeGreaterThanOrEqual(1);
            }
          }
          // Every transition leads to a kernel state.
          for (const tr of s.transitions.values()) {
            expect(table.states[tr.targetStateId].kind).toBe('kernel');
            expect(tr.originKind).toBe(s.kind);
          }
        }
      }
    });

    it('computes exact derivation reasons for all transitions', () => {
      for (const preset of PRESET_GRAMMARS.slice(0, 8)) {
        const parsed = parseGrammar(preset.grammarText);
        if (!parsed.grammar) continue;
        const table = buildETTPTable(parsed.grammar);

        for (const fromState of table.states) {
          for (const [sym, tr] of fromState.transitions.entries()) {
            const targetState = table.states[tr.targetStateId];
            const reason = getETTPTransitionReason(fromState, sym, targetState);
            expect(reason).toBeDefined();
            expect(reason!.triggerItems.length).toBeGreaterThanOrEqual(1);
            expect(reason!.resultingKernelItems.length).toBe(reason!.triggerItems.length);
            for (const it of reason!.triggerItems) expect(it.production.rhs[it.dot]).toBe(sym);
            for (const it of reason!.resultingKernelItems) {
              expect(it.production.rhs[it.dot - 1]).toBe(sym);
              expect(targetState.items.some(t => t.production.id === it.production.id && t.dot === it.dot)).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('regressions (2026-10-17 review)', () => {
    const allWords = (ts: string[], max: number): string[][] => {
      const out: string[][] = [[]];
      let layer: string[][] = [[]];
      for (let l = 1; l <= max; l++) {
        layer = layer.flatMap(w => ts.map(t => [...w, t]));
        out.push(...layer);
      }
      return out;
    };
    const validTree = (g: Grammar, n: DerivationNode): boolean => {
      if (n.isTerminal) return true;
      const kids = (n.children ?? []).map(c => c.symbol).filter(s => s !== 'ε');
      return g.productions.some(p => p.lhs === n.symbol && p.rhs.join(' ') === kids.join(' ')) &&
        (n.children ?? []).every(c => validTree(g, c));
    };
    const leaves = (n: DerivationNode): string[] =>
      !n.children || n.children.length === 0 ? (n.symbol === 'ε' ? [] : [n.symbol]) : n.children.flatMap(leaves);

    it('Earley and ETTP accept exactly L(G) and return valid trees (random grammars, all words ≤ 5)', async () => {
      const failures: string[] = [];
      for (let seed = 1; seed <= 250 && failures.length < 5; seed++) {
        // Let the worker answer vitest's RPC between batches (CI timed out on long synchronous loops).
        if (seed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        const text = randomGrammarText(seed);
        const g = parseGrammar(text).grammar;
        if (!g) continue;
        const table = buildETTPTable(g);
        for (const w of allWords([...g.terminals], 5)) {
          const expected = accepts(g, w);
          const e = simulateEarleyParse(w, g);
          const t = simulateETTPParse(w, g, table);
          const problems: string[] = [];
          if (e.accepted !== expected) problems.push(`Earley ${e.accepted}`);
          if (t.accepted !== expected) problems.push(`ETTP ${t.accepted}`);
          for (const [name, r] of [['Earley', e], ['ETTP', t]] as const) {
            if (!r.accepted) continue;
            const tree = r.trees[0];
            if (!tree || !validTree(g, tree) || leaves(tree).join(' ') !== w.join(' ')) problems.push(`${name} tree`);
          }
          if (problems.length) {
            failures.push(`seed ${seed} [${text.replace(/\n/g, '; ')}] "${w.join(' ')}" (in L: ${expected}): ${problems.join(', ')}`);
            break;
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it('ETTP: predicted items get the origin of their own set (seed 11 accepted "b b b" before)', () => {
      const g = parseGrammar('S -> b A | b b\nA -> S A | a | b c\nB -> a | ε | a B').grammar!;
      expect(simulateETTPParse(['b', 'b', 'b'], g).accepted).toBe(false);
      expect(simulateETTPParse(['b', 'b'], g).accepted).toBe(true);
      const g2 = parseGrammar('S -> ε | a A c\nA -> a A a | ε | c c b').grammar!;
      expect(simulateETTPParse(['a', 'a', 'a', 'a', 'c'], g2).accepted).toBe(false);
      expect(simulateETTPParse(['a', 'a', 'a', 'c'], g2).accepted).toBe(true);
    });

    it("a non-terminal named S' in the grammar does not clash with the added start rule", () => {
      const g = parseGrammar("S -> S' a\nS' -> b").grammar!;
      for (const parse of [simulateEarleyParse, (w: string[], gr: Grammar) => simulateETTPParse(w, gr)]) {
        expect(parse(['b', 'a'], g).accepted).toBe(true);
        expect(parse(['b', 'a', 'a'], g).accepted).toBe(false);
      }
      expect(simulateEarleyParse(['b', 'a'], g).augmentedStart).toBe("S''");
    });

    it('a nullable non-terminal gets the subtree of a real ε-derivation, not an invented rule A → ε', () => {
      const g = parseGrammar('S -> A b\nA -> B C\nB -> ε\nC -> ε | c').grammar!;
      for (const r of [simulateEarleyParse(['b'], g), simulateETTPParse(['b'], g)]) {
        expect(r.accepted).toBe(true);
        expect(validTree(g, r.trees[0])).toBe(true);
        const a = r.trees[0].children![0];
        expect(a.symbol).toBe('A');
        expect(a.children!.map(c => c.symbol)).toEqual(['B', 'C']);
      }
      // the empty word: S -> A A with A ⇒ ε twice — node ids stay unique
      const g2 = parseGrammar('S -> A A\nA -> ε | a').grammar!;
      const tree = simulateEarleyParse([], g2).trees[0];
      const ids: string[] = [];
      const walk = (n: DerivationNode) => { ids.push(n.id); n.children?.forEach(walk); };
      walk(tree);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every step names the items it came from, and complete steps carry the completed subtree', () => {
      const g = parseGrammar('E -> E + T | T\nT -> a').grammar!;
      const w = ['a', '+', 'a'];
      const r = simulateEarleyParse(w, g);
      for (const step of r.steps.slice(1)) {
        expect(step.sources.length).toBeGreaterThan(0);
        for (const s of step.sources) expect(r.sets[s.setIndex].items[s.itemIndex]).toBeDefined();
        if (step.operation === 'complete') {
          expect(step.derivationTree?.symbol).toBe(step.item.triggerSymbol);
          const waiting = step.sources.find(s => s.role === 'waiting')!;
          const waited = r.sets[waiting.setIndex].items[waiting.itemIndex];
          expect(waited.production.rhs[waited.dot]).toBe(step.item.triggerSymbol);
        }
        expect(step.setSizes[step.activeSetIndex]).toBe(step.itemIndex + 1);
      }
      const t = simulateETTPParse(w, g);
      for (const step of t.steps.slice(1)) {
        for (const s of step.sources) expect(t.sets[s.setIndex].items[s.itemIndex]).toBeDefined();
        if (step.operation === 'scan' || step.operation === 'complete') {
          expect(t.table.states[step.fromStateId!].transitions.get(step.triggerSymbol!)?.targetStateId).toBe(step.stateId);
        }
      }
      // The ETTP pairs stand for exactly the items of the classic chart.
      expect(t.stats.representedItems).toBe(r.stats.totalItems);
    });
  });
});
