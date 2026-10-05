/**
 * Word Generator & Derivation Visualizer
 * - Shortest words generation (BFS over leftmost derivations)
 * - Random derivations (with depth limits)
 * - Step-by-step leftmost derivation traces
 * - Hierarchical parse tree generation
 */

import { Grammar, Production } from '../ast/grammar';

export interface DerivationNode {
  id: string;
  symbol: string;
  isTerminal: boolean;
  /** Synthetic root that only groups the trees of a parse forest (LR stack). */
  isForestRoot?: boolean;
  /**
   * In a failed derivation attempt: the terminal the derivation needs where
   * the word has another symbol or ends ('mismatch'), or a symbol after it
   * that was not derived any more ('pending').
   */
  mark?: 'mismatch' | 'pending';
  children?: DerivationNode[];
}

export interface DerivationStep {
  stepIndex: number;
  sententialForm: string[];
  appliedRule?: Production;
  replacedIndex?: number;
}

export interface DerivationTrace {
  word: string;
  tokens: string[];
  steps: DerivationStep[];
  tree: DerivationNode;
}

/** Upper bound on explored sentential forms, so that exponential grammars cannot freeze the UI. */
const MAX_BFS_FORMS = 20000;

/**
 * Generate sample words with their derivation traces
 */
export function generateWords(g: Grammar, count: number = 5, maxDepth: number = 15): DerivationTrace[] {
  const traces: DerivationTrace[] = [];
  const seenWords = new Set<string>();

  // 1. First attempt BFS for shortest words
  const shortest = generateShortestWords(g, count * 2, maxDepth);
  for (const trace of shortest) {
    if (!seenWords.has(trace.word)) {
      seenWords.add(trace.word);
      traces.push(trace);
      if (traces.length >= count) break;
    }
  }

  // 2. If needed, supplement with random derivations
  let attempts = 0;
  while (traces.length < count && attempts < 30) {
    attempts++;
    const randomTrace = generateRandomDerivation(g, maxDepth * 2);
    if (randomTrace && !seenWords.has(randomTrace.word)) {
      seenWords.add(randomTrace.word);
      traces.push(randomTrace);
    }
  }

  return traces;
}

/**
 * Minimal height of a derivation tree for every generating non-terminal
 * (non-generating non-terminals are absent from the map).
 */
export function computeMinHeights(g: Grammar): Map<string, number> {
  const height = new Map<string, number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.productions) {
      let h = 0;
      let ok = true;
      for (const sym of p.rhs) {
        if (!g.nonTerminals.has(sym)) continue;
        const hs = height.get(sym);
        if (hs === undefined) {
          ok = false;
          break;
        }
        h = Math.max(h, hs);
      }
      if (!ok) continue;
      const candidate = h + 1;
      const old = height.get(p.lhs);
      if (old === undefined || candidate < old) {
        height.set(p.lhs, candidate);
        changed = true;
      }
    }
  }
  return height;
}

/**
 * BFS to discover shortest words (fewest derivation steps first)
 */
export function generateShortestWords(g: Grammar, count: number = 5, maxDepth: number = 12): DerivationTrace[] {
  if (!g.startSymbol || g.productions.length === 0) return [];

  const generating = computeMinHeights(g);
  if (!generating.has(g.startSymbol)) return [];

  interface QueueItem {
    form: string[];
    steps: DerivationStep[];
    tree: DerivationNode;
  }

  let nodeCounter = 1;
  const queue: QueueItem[] = [{
    form: [g.startSymbol],
    steps: [{ stepIndex: 0, sententialForm: [g.startSymbol] }],
    tree: { id: `node_${nodeCounter++}`, symbol: g.startSymbol, isTerminal: false }
  }];

  const results: DerivationTrace[] = [];
  const visitedForms = new Set<string>();
  let head = 0;

  while (head < queue.length && results.length < count && head < MAX_BFS_FORMS) {
    const current = queue[head++];
    const formKey = current.form.join(' ');

    if (visitedForms.has(formKey)) continue;
    visitedForms.add(formKey);

    // Find leftmost non-terminal
    const ntIndex = current.form.findIndex(sym => g.nonTerminals.has(sym));

    if (ntIndex === -1) {
      results.push({
        word: current.form.join(' ') || 'ε',
        tokens: [...current.form],
        steps: current.steps,
        tree: current.tree
      });
      continue;
    }

    if (current.steps.length > maxDepth) continue;

    const nt = current.form[ntIndex];
    for (const prod of g.productions.filter(p => p.lhs === nt)) {
      // Sentential forms containing a non-generating symbol never yield a word
      if (prod.rhs.some(sym => g.nonTerminals.has(sym) && !generating.has(sym))) continue;

      const nextForm = [
        ...current.form.slice(0, ntIndex),
        ...prod.rhs,
        ...current.form.slice(ntIndex + 1)
      ];

      const nextTree = cloneTree(current.tree);
      const targetNode = findLeftmostUnexpandedNode(nextTree, nt);
      if (targetNode) {
        targetNode.children = expandChildren(prod, g, () => `node_${nodeCounter++}`);
      }

      queue.push({
        form: nextForm,
        steps: [
          ...current.steps,
          {
            stepIndex: current.steps.length,
            sententialForm: nextForm,
            appliedRule: prod,
            replacedIndex: ntIndex
          }
        ],
        tree: nextTree
      });
    }
  }

  return results;
}

/**
 * Random leftmost derivation. Once the step budget is half used, only rules
 * of minimal height are chosen, which guarantees termination for every
 * generating start symbol.
 */
export function generateRandomDerivation(g: Grammar, maxDepth: number = 20): DerivationTrace | null {
  if (!g.startSymbol) return null;

  const minHeight = computeMinHeights(g);
  if (!minHeight.has(g.startSymbol)) return null;

  const ruleHeight = (p: Production): number => {
    let h = 0;
    for (const sym of p.rhs) {
      if (!g.nonTerminals.has(sym)) continue;
      const hs = minHeight.get(sym);
      if (hs === undefined) return Infinity;
      h = Math.max(h, hs);
    }
    return h + 1;
  };

  let currentForm = [g.startSymbol];
  let nodeCounter = 1;
  const tree: DerivationNode = { id: `node_${nodeCounter++}`, symbol: g.startSymbol, isTerminal: false };
  const steps: DerivationStep[] = [{ stepIndex: 0, sententialForm: [...currentForm] }];
  const hardLimit = maxDepth * 20;

  for (let stepCount = 0; stepCount < hardLimit; ) {
    const ntIdx = currentForm.findIndex(sym => g.nonTerminals.has(sym));
    if (ntIdx === -1) {
      return { word: currentForm.join(' ') || 'ε', tokens: currentForm, steps, tree };
    }

    const nt = currentForm[ntIdx];
    const usable = g.productions.filter(p => p.lhs === nt && ruleHeight(p) < Infinity);
    if (usable.length === 0) return null;

    let candidates = usable;
    if (stepCount >= maxDepth / 2) {
      const best = Math.min(...usable.map(ruleHeight));
      candidates = usable.filter(p => ruleHeight(p) === best);
    }
    const prod = candidates[Math.floor(Math.random() * candidates.length)];

    currentForm = [...currentForm.slice(0, ntIdx), ...prod.rhs, ...currentForm.slice(ntIdx + 1)];

    const targetNode = findLeftmostUnexpandedNode(tree, nt);
    if (targetNode) {
      targetNode.children = expandChildren(prod, g, () => `node_${nodeCounter++}`);
    }

    stepCount++;
    steps.push({ stepIndex: stepCount, sententialForm: [...currentForm], appliedRule: prod, replacedIndex: ntIdx });
  }

  return null;
}

function expandChildren(prod: Production, g: Grammar, nextId: () => string): DerivationNode[] {
  if (prod.rhs.length === 0) {
    return [{ id: nextId(), symbol: 'ε', isTerminal: true }];
  }
  return prod.rhs.map(sym => ({ id: nextId(), symbol: sym, isTerminal: !g.nonTerminals.has(sym) }));
}

function cloneTree(node: DerivationNode): DerivationNode {
  return {
    id: node.id,
    symbol: node.symbol,
    isTerminal: node.isTerminal,
    isForestRoot: node.isForestRoot,
    children: node.children ? node.children.map(cloneTree) : undefined
  };
}

function findLeftmostUnexpandedNode(node: DerivationNode, expectedSymbol: string): DerivationNode | null {
  if (!node.isTerminal && (!node.children || node.children.length === 0)) {
    // The leftmost unexpanded node is the one being rewritten in a leftmost derivation
    return node.symbol === expectedSymbol ? node : null;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findLeftmostUnexpandedNode(child, expectedSymbol);
      if (found) return found;
      if (!child.isTerminal && hasUnexpanded(child)) return null;
    }
  }
  return null;
}

function hasUnexpanded(node: DerivationNode): boolean {
  if (!node.isTerminal && (!node.children || node.children.length === 0)) return true;
  return (node.children || []).some(hasUnexpanded);
}
