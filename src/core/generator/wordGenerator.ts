/**
 * Word Generator & Derivation Visualizer
 * - Shortest words generation (BFS)
 * - Random derivations (with depth limits)
 * - Step-by-step leftmost and rightmost derivation traces
 * - Hierarchical parse tree generation
 */

import { Grammar, Production } from '../ast/grammar';

export interface DerivationNode {
  id: string;
  symbol: string;
  isTerminal: boolean;
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
    const randomTrace = generateRandomDerivation(g, maxDepth);
    if (randomTrace && !seenWords.has(randomTrace.word)) {
      seenWords.add(randomTrace.word);
      traces.push(randomTrace);
    }
  }

  return traces;
}

/**
 * BFS to discover shortest words
 */
export function generateShortestWords(g: Grammar, count: number = 5, maxDepth: number = 12): DerivationTrace[] {
  if (!g.startSymbol || g.productions.length === 0) return [];

  interface QueueItem {
    form: string[];
    steps: DerivationStep[];
    tree: DerivationNode;
  }

  let nodeCounter = 1;
  const initialTree: DerivationNode = {
    id: `node_${nodeCounter++}`,
    symbol: g.startSymbol,
    isTerminal: false
  };

  const queue: QueueItem[] = [{
    form: [g.startSymbol],
    steps: [{
      stepIndex: 0,
      sententialForm: [g.startSymbol]
    }],
    tree: initialTree
  }];

  const results: DerivationTrace[] = [];
  const visitedForms = new Set<string>();

  while (queue.length > 0 && results.length < count) {
    const current = queue.shift()!;
    const formKey = current.form.join(' ');

    if (visitedForms.has(formKey) && current.form.some(s => g.nonTerminals.has(s))) {
      continue;
    }
    visitedForms.add(formKey);

    // Find leftmost non-terminal
    const ntIndex = current.form.findIndex(sym => g.nonTerminals.has(sym));

    if (ntIndex === -1) {
      // Completed terminal word!
      results.push({
        word: current.form.join(' ') || 'ε',
        tokens: [...current.form],
        steps: current.steps,
        tree: current.tree
      });
      continue;
    }

    if (current.steps.length >= maxDepth) continue;

    const nt = current.form[ntIndex];
    const matchingProds = g.productions.filter(p => p.lhs === nt);

    for (const prod of matchingProds) {
      const nextForm = [
        ...current.form.slice(0, ntIndex),
        ...prod.rhs,
        ...current.form.slice(ntIndex + 1)
      ];

      // Clone tree and attach children to the leftmost unexpanded node
      const nextTree = cloneTree(current.tree);
      const targetNode = findLeftmostUnexpandedNode(nextTree, nt);
      if (targetNode) {
        targetNode.children = prod.rhs.length === 0
          ? [{ id: `node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
          : prod.rhs.map(sym => ({
              id: `node_${nodeCounter++}`,
              symbol: sym,
              isTerminal: !g.nonTerminals.has(sym)
            }));
      }

      const nextSteps = [
        ...current.steps,
        {
          stepIndex: current.steps.length,
          sententialForm: nextForm,
          appliedRule: prod,
          replacedIndex: ntIndex
        }
      ];

      queue.push({
        form: nextForm,
        steps: nextSteps,
        tree: nextTree
      });
    }
  }

  return results;
}

/**
 * Random walk derivation
 */
export function generateRandomDerivation(g: Grammar, maxDepth: number = 20): DerivationTrace | null {
  if (!g.startSymbol) return null;

  let currentForm = [g.startSymbol];
  let nodeCounter = 1;
  const tree: DerivationNode = {
    id: `node_${nodeCounter++}`,
    symbol: g.startSymbol,
    isTerminal: false
  };

  const steps: DerivationStep[] = [{
    stepIndex: 0,
    sententialForm: [...currentForm]
  }];

  let stepCount = 0;

  while (stepCount < maxDepth) {
    const ntIndices: number[] = [];
    currentForm.forEach((sym, idx) => {
      if (g.nonTerminals.has(sym)) ntIndices.push(idx);
    });

    if (ntIndices.length === 0) {
      // Finished word!
      return {
        word: currentForm.join(' ') || 'ε',
        tokens: currentForm,
        steps,
        tree
      };
    }

    // Pick leftmost non-terminal
    const ntIdx = ntIndices[0];
    const nt = currentForm[ntIdx];
    const matching = g.productions.filter(p => p.lhs === nt);
    if (matching.length === 0) return null;

    // Pick a production (prefer terminating productions as stepCount approaches limit)
    let prod: Production;
    if (stepCount > maxDepth * 0.7) {
      const terminating = matching.filter(p => p.rhs.every(s => !g.nonTerminals.has(s)));
      prod = terminating.length > 0
        ? terminating[Math.floor(Math.random() * terminating.length)]
        : matching[Math.floor(Math.random() * matching.length)];
    } else {
      prod = matching[Math.floor(Math.random() * matching.length)];
    }

    currentForm = [
      ...currentForm.slice(0, ntIdx),
      ...prod.rhs,
      ...currentForm.slice(ntIdx + 1)
    ];

    const targetNode = findLeftmostUnexpandedNode(tree, nt);
    if (targetNode) {
      targetNode.children = prod.rhs.length === 0
        ? [{ id: `node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
        : prod.rhs.map(sym => ({
            id: `node_${nodeCounter++}`,
            symbol: sym,
            isTerminal: !g.nonTerminals.has(sym)
          }));
    }

    stepCount++;
    steps.push({
      stepIndex: stepCount,
      sententialForm: [...currentForm],
      appliedRule: prod,
      replacedIndex: ntIdx
    });
  }

  return null;
}

function cloneTree(node: DerivationNode): DerivationNode {
  return {
    id: node.id,
    symbol: node.symbol,
    isTerminal: node.isTerminal,
    children: node.children ? node.children.map(cloneTree) : undefined
  };
}

function findLeftmostUnexpandedNode(node: DerivationNode, expectedSymbol: string): DerivationNode | null {
  if (!node.isTerminal && (!node.children || node.children.length === 0)) {
    if (node.symbol === expectedSymbol) return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findLeftmostUnexpandedNode(child, expectedSymbol);
      if (found) return found;
    }
  }
  return null;
}
