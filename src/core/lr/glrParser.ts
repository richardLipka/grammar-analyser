/**
 * Generalized LR (GLR) Parser with Graph-Structured Stack (GSS)
 *
 * Implements Tomita's algorithm and Right-Nulled Generalized LR (RNGLR) principles
 * (Tomita 1986, Rekers 1992, Scott & Johnstone 2006).
 *
 * Key features:
 * - Operates over any LR table (LR(0), SLR(1), LALR(1), LR(1)) with arbitrary
 *   Shift/Reduce or Reduce/Reduce conflicts.
 * - Graph-Structured Stack (GSS):
 *   - Fork: When an active head encounters multiple conflicting actions,
 *     independent parsing branches are spawned.
 *   - Merge: When two distinct branches reach the same automaton state at the same
 *     input frontier, they merge into a single GSS node with multiple predecessor edges.
 *   - Local Ambiguity Packing: Ambiguous derivations are captured as alternative
 *     derivation trees in a parse forest.
 * - Step-by-step trace generation with complete GSS graph snapshots for interactive
 *   educational visualization.
 */

import { Grammar, Production, END_MARKER, formatProduction } from '../ast/grammar';
import { LRTable, LRLayout, LR0_ACTION_COLUMN, stateLabel } from './lrTable';
import { DerivationNode, cloneTree } from '../generator/wordGenerator';
import { LRAutomaton } from './lrAutomaton';
import { formatLR0Item } from './lrItem';

export interface GSSSnapshotNode {
  id: number;
  state: number;
  label: string;
  level: number;
  isHead: boolean;
  creationKind: 'init' | 'shift' | 'reduce';
  creationSymbol?: string;
  creationProduction?: string;
  creationFromState?: number;
  creationFromStateLabel?: string;
  items?: string[];
  consumedPrefix: string[];
}

export interface GSSSnapshotEdge {
  fromId: number; // child (higher in stack / later in input)
  toId: number;   // parent (predecessor in stack)
  symbol: string;
  count: number;  // number of alternative trees
  treeIds: string[];
  treeYields?: string[];
}

export interface GSSSnapshot {
  nodes: GSSSnapshotNode[];
  edges: GSSSnapshotEdge[];
}

export interface GLRParseStep {
  step: number;
  inputToken: string;
  inputIndex: number;
  remainingInput: string[];
  actionType: 'shift' | 'reduce' | 'fork' | 'merge' | 'accept' | 'error' | 'init';
  actionDescription: string;
  actionDescriptionCz: string;
  activeHeadCount: number;
  activeHeadStates: number[];
  gssSnapshot: GSSSnapshot;
  acceptedTreesSoFar: number;
}

export interface GLRSimulationResult {
  accepted: boolean;
  totalTrees: number;
  trees: DerivationNode[];
  steps: GLRParseStep[];
  gssFinal: GSSSnapshot;
  conflictsEncountered: number;
  maxSimultaneousHeads: number;
  errorMessage?: string;
  errorMessageCz?: string;
}

interface InternalGSSNode {
  id: number;
  state: number;
  level: number;
  creationKind: 'init' | 'shift' | 'reduce';
  creationSymbol?: string;
  creationProduction?: string;
  creationFromState?: number;
  consumedPrefix: string[];
  // Edges from this child node to its predecessor parents in stack
  predecessors: InternalGSSEdge[];
}

interface InternalGSSEdge {
  parent: InternalGSSNode;
  symbol: string;
  trees: DerivationNode[];
}

/**
 * Collects all tree node IDs recursively within a derivation tree.
 */
export function collectTreeIds(node: DerivationNode): string[] {
  const ids: string[] = [node.id];
  if (node.children) {
    for (const c of node.children) {
      ids.push(...collectTreeIds(c));
    }
  }
  return ids;
}

/**
 * Computes the yield (terminal leaves) of a derivation tree.
 */
export function getTreeYield(node: DerivationNode): string {
  if (node.isTerminal) return node.symbol === 'ε' ? 'ε' : node.symbol;
  if (!node.children || node.children.length === 0) return node.symbol;
  return node.children.map(getTreeYield).filter(s => s !== 'ε').join(' ');
}

/**
 * Checks structural equality of two derivation trees to deduplicate identical parses.
 */
export function areTreesEqual(a: DerivationNode, b: DerivationNode): boolean {
  if (a.symbol !== b.symbol || a.isTerminal !== b.isTerminal) return false;
  const aChildren = a.children || [];
  const bChildren = b.children || [];
  if (aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i++) {
    if (!areTreesEqual(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

export function simulateGLRParse(
  inputTokens: string[],
  g: Grammar,
  table: LRTable,
  layout: LRLayout = 'dragon',
  maxSteps: number = 300,
  maxTrees: number = 25,
  automaton?: LRAutomaton
): GLRSimulationResult {
  const steps: GLRParseStep[] = [];
  const input = [...inputTokens, END_MARKER];
  const lecture = layout === 'lecture';
  const name = (st: number) => stateLabel(table, st, layout);

  let nodeCounter = 1;
  let gssIdCounter = 0;
  let conflictsEncountered = 0;
  let maxSimultaneousHeads = 1;
  const acceptedTrees: DerivationNode[] = [];

  const allNodes: InternalGSSNode[] = [];

  function createGSSNode(
    state: number,
    level: number,
    creationKind: 'init' | 'shift' | 'reduce' = 'init',
    creationSymbol?: string,
    creationProduction?: string,
    creationFromState?: number,
    consumedPrefix: string[] = []
  ): InternalGSSNode {
    const node: InternalGSSNode = {
      id: gssIdCounter++,
      state,
      level,
      creationKind,
      creationSymbol,
      creationProduction,
      creationFromState,
      consumedPrefix,
      predecessors: []
    };
    allNodes.push(node);
    return node;
  }

  function addGSSEdge(child: InternalGSSNode, parent: InternalGSSNode, symbol: string, tree: DerivationNode): boolean {
    const existing = child.predecessors.find(e => e.parent.id === parent.id && e.symbol === symbol);
    if (existing) {
      // Edge already exists between these two nodes for this symbol: check if tree is new alternative
      if (!existing.trees.some(t => areTreesEqual(t, tree))) {
        if (existing.trees.length < maxTrees) {
          existing.trees.push(cloneTree(tree));
          return true;
        }
      }
      return false;
    }
    child.predecessors.push({ parent, symbol, trees: [cloneTree(tree)] });
    return true;
  }

  function makeSnapshot(activeHeads: InternalGSSNode[]): GSSSnapshot {
    const headSet = new Set(activeHeads.map(h => h.id));
    const snapshotNodes: GSSSnapshotNode[] = allNodes.map(n => {
      const items = automaton?.states[n.state]
        ? automaton.states[n.state].items0.map(formatLR0Item)
        : undefined;

      return {
        id: n.id,
        state: n.state,
        label: name(n.state),
        level: n.level,
        isHead: headSet.has(n.id),
        creationKind: n.creationKind,
        creationSymbol: n.creationSymbol,
        creationProduction: n.creationProduction,
        creationFromState: n.creationFromState,
        creationFromStateLabel: n.creationFromState !== undefined ? name(n.creationFromState) : undefined,
        items,
        consumedPrefix: n.consumedPrefix
      };
    });

    const snapshotEdges: GSSSnapshotEdge[] = [];
    for (const n of allNodes) {
      for (const e of n.predecessors) {
        snapshotEdges.push({
          fromId: n.id,
          toId: e.parent.id,
          symbol: e.symbol,
          count: e.trees.length,
          treeIds: e.trees.flatMap(t => collectTreeIds(t)),
          treeYields: e.trees.map(t => getTreeYield(t))
        });
      }
    }
    return { nodes: snapshotNodes, edges: snapshotEdges };
  }

  // Initial root GSS node (state 0, level 0)
  const rootNode = createGSSNode(0, 0, 'init', undefined, undefined, undefined, []);
  let activeHeads: InternalGSSNode[] = [rootNode];

  steps.push({
    step: 0,
    inputToken: input[0],
    inputIndex: 0,
    remainingInput: [...input],
    actionType: 'init',
    actionDescription: `Initialize GSS with start state ${name(0)}`,
    actionDescriptionCz: `Inicializace GSS se startovním stavem ${name(0)}`,
    activeHeadCount: 1,
    activeHeadStates: [0],
    gssSnapshot: makeSnapshot(activeHeads),
    acceptedTreesSoFar: 0
  });

  let inputPtr = 0;
  let stepCounter = 1;

  interface PathResult {
    pathNodes: DerivationNode[]; // forward list of DerivationNodes
    baseNode: InternalGSSNode;
    edgePathKey: string;
  }

  function findPaths(head: InternalGSSNode, length: number): PathResult[] {
    if (length === 0) {
      return [{ pathNodes: [], baseNode: head, edgePathKey: `${head.id}` }];
    }
    const results: PathResult[] = [];
    for (const edge of head.predecessors) {
      const subPaths = findPaths(edge.parent, length - 1);
      for (const tree of edge.trees) {
        for (const sp of subPaths) {
          results.push({
            pathNodes: [...sp.pathNodes, tree],
            baseNode: sp.baseNode,
            edgePathKey: `${head.id}->${edge.parent.id}:${tree.id}|${sp.edgePathKey}`
          });
          if (results.length >= maxTrees * 4) break;
        }
      }
    }
    return results;
  }

  function checkAcceptance(head: InternalGSSNode, lookahead: string) {
    if (lookahead !== END_MARKER) return;
    for (const edge of head.predecessors) {
      if (edge.symbol === g.startSymbol && edge.parent.id === rootNode.id) {
        for (const tree of edge.trees) {
          if (!acceptedTrees.some(t => areTreesEqual(t, tree))) {
            if (acceptedTrees.length < maxTrees) {
              acceptedTrees.push(cloneTree(tree));
              steps.push({
                step: stepCounter++,
                inputToken: lookahead,
                inputIndex: inputPtr,
                remainingInput: input.slice(inputPtr),
                actionType: 'accept',
                actionDescription: `Accept: valid derivation tree #${acceptedTrees.length} found`,
                actionDescriptionCz: `Přijetí: nalezen platný derivační strom #${acceptedTrees.length}`,
                activeHeadCount: activeHeads.length,
                activeHeadStates: activeHeads.map(h => h.state),
                gssSnapshot: makeSnapshot(activeHeads),
                acceptedTreesSoFar: acceptedTrees.length
              });
            }
          }
        }
      }
    }
  }

  while (inputPtr < input.length && stepCounter < maxSteps) {
    const lookahead = input[inputPtr];
    const column = lecture && table.variant === 'LR(0)' ? LR0_ACTION_COLUMN : lookahead;

    if (activeHeads.length > maxSimultaneousHeads) {
      maxSimultaneousHeads = activeHeads.length;
    }

    // -------------------------------------------------------------
    // PHASE 1: REDUCTIONS (loop until fixed-point on current token)
    // -------------------------------------------------------------
    const executedReductions = new Set<string>();
    let reductionOccurred = true;

    while (reductionOccurred && stepCounter < maxSteps) {
      reductionOccurred = false;

      // Check acceptance for any existing heads
      if (lookahead === END_MARKER) {
        for (const h of activeHeads) {
          checkAcceptance(h, lookahead);
        }
      }

      const currentHeads = [...activeHeads];
      for (const head of currentHeads) {
        const actions = (lecture ? table.fTable : table.actionTable).get(head.state)?.get(column) || [];

        if (actions.length > 1) {
          conflictsEncountered++;
        }

        // Process all reduce actions for this head
        for (const act of actions) {
          if (act.type === 'accept') {
            checkAcceptance(head, lookahead);
            continue;
          }
          if (act.type !== 'reduce') continue;

          const prod = act.production!;
          const rhsLen = prod.rhs.length;

          // Find all ancestor paths of length rhsLen
          const paths = findPaths(head, rhsLen);

          for (const path of paths) {
            const redKey = `${head.id}:${prod.id}:${path.baseNode.id}:${path.edgePathKey}`;
            if (executedReductions.has(redKey)) continue;
            executedReductions.add(redKey);

            // GOTO transition from baseNode on prod.lhs
            const gotoState = (lecture ? table.gTable : table.gotoTable).get(path.baseNode.state)?.get(prod.lhs);
            if (gotoState === undefined) {
              continue; // Invalid transition
            }

            const childTrees = rhsLen === 0
              ? [{ id: `glr_eps_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
              : path.pathNodes.map(t => cloneTree(t));

            const newTree: DerivationNode = {
              id: `glr_node_${nodeCounter++}`,
              symbol: prod.lhs,
              isTerminal: false,
              children: childTrees
            };

            // Check if there is already an active head with gotoState at this input level
            let targetHead = activeHeads.find(h => h.state === gotoState && h.level === inputPtr);

            if (targetHead) {
              // MERGE: Stack merging into existing head
              const edgeAdded = addGSSEdge(targetHead, path.baseNode, prod.lhs, newTree);
              if (edgeAdded) {
                reductionOccurred = true;
                steps.push({
                  step: stepCounter++,
                  inputToken: lookahead,
                  inputIndex: inputPtr,
                  remainingInput: input.slice(inputPtr),
                  actionType: 'merge',
                  actionDescription: `Reduce by (${prod.id}) ${formatProduction(prod)} → merge into head ${name(gotoState)}`,
                  actionDescriptionCz: `Redukce podle (${prod.id}) ${formatProduction(prod)} → sloučení do stavu ${name(gotoState)}`,
                  activeHeadCount: activeHeads.length,
                  activeHeadStates: activeHeads.map(h => h.state),
                  gssSnapshot: makeSnapshot(activeHeads),
                  acceptedTreesSoFar: acceptedTrees.length
                });
                checkAcceptance(targetHead, lookahead);
              }
            } else {
              // CREATE: New head
              targetHead = createGSSNode(
                gotoState,
                inputPtr,
                'reduce',
                prod.lhs,
                formatProduction(prod),
                path.baseNode.state,
                inputTokens.slice(0, inputPtr)
              );
              addGSSEdge(targetHead, path.baseNode, prod.lhs, newTree);
              activeHeads.push(targetHead);
              if (activeHeads.length > maxSimultaneousHeads) {
                maxSimultaneousHeads = activeHeads.length;
              }
              reductionOccurred = true;

              const isFork = actions.length > 1;
              steps.push({
                step: stepCounter++,
                inputToken: lookahead,
                inputIndex: inputPtr,
                remainingInput: input.slice(inputPtr),
                actionType: isFork ? 'fork' : 'reduce',
                actionDescription: isFork
                  ? `Fork & Reduce by (${prod.id}) ${formatProduction(prod)} → head ${name(gotoState)}`
                  : `Reduce by (${prod.id}) ${formatProduction(prod)} → head ${name(gotoState)}`,
                actionDescriptionCz: isFork
                  ? `Větvení & redukce podle (${prod.id}) ${formatProduction(prod)} → stav ${name(gotoState)}`
                  : `Redukce podle (${prod.id}) ${formatProduction(prod)} → stav ${name(gotoState)}`,
                activeHeadCount: activeHeads.length,
                activeHeadStates: activeHeads.map(h => h.state),
                gssSnapshot: makeSnapshot(activeHeads),
                acceptedTreesSoFar: acceptedTrees.length
              });
              checkAcceptance(targetHead, lookahead);
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // PHASE 2: SHIFTS (advance to inputPtr + 1)
    // -------------------------------------------------------------
    if (lookahead === END_MARKER) {
      break;
    }

    const nextHeads: InternalGSSNode[] = [];

    for (const head of activeHeads) {
      const actions = (lecture ? table.fTable : table.actionTable).get(head.state)?.get(column) || [];
      const shiftActions = actions.filter(a => a.type === 'shift');

      for (const act of shiftActions) {
        let targetState = act.targetState;
        if (lecture) {
          targetState = table.gTable.get(head.state)?.get(lookahead);
        }
        if (targetState === undefined) continue;

        const termTree: DerivationNode = {
          id: `glr_term_${nodeCounter++}`,
          symbol: lookahead,
          isTerminal: true
        };

        let nextHead = nextHeads.find(h => h.state === targetState && h.level === inputPtr + 1);

        if (nextHead) {
          // Merge on shift
          addGSSEdge(nextHead, head, lookahead, termTree);
        } else {
          nextHead = createGSSNode(
            targetState,
            inputPtr + 1,
            'shift',
            lookahead,
            undefined,
            head.state,
            inputTokens.slice(0, inputPtr + 1)
          );
          addGSSEdge(nextHead, head, lookahead, termTree);
          nextHeads.push(nextHead);
        }
      }
    }

    if (nextHeads.length === 0) {
      // Parse failed: all branches exhausted
      steps.push({
        step: stepCounter++,
        inputToken: lookahead,
        inputIndex: inputPtr,
        remainingInput: input.slice(inputPtr),
        actionType: 'error',
        actionDescription: `Syntax error: no valid shift transitions from any head on token '${lookahead}'`,
        actionDescriptionCz: `Syntaktická chyba: pro symbol '${lookahead}' neexistuje žádný platný přechod přesunem`,
        activeHeadCount: 0,
        activeHeadStates: [],
        gssSnapshot: makeSnapshot([]),
        acceptedTreesSoFar: acceptedTrees.length
      });
      return {
        accepted: acceptedTrees.length > 0,
        totalTrees: acceptedTrees.length,
        trees: acceptedTrees,
        steps,
        gssFinal: makeSnapshot([]),
        conflictsEncountered,
        maxSimultaneousHeads,
        errorMessage: `Syntax error at token '${lookahead}': all parsing branches failed.`,
        errorMessageCz: `Syntaktická chyba na symbolu '${lookahead}': všechny větve syntaktické analýzy selhaly.`
      };
    }

    steps.push({
      step: stepCounter++,
      inputToken: lookahead,
      inputIndex: inputPtr,
      remainingInput: input.slice(inputPtr),
      actionType: 'shift',
      actionDescription: `Shift '${lookahead}' → ${nextHeads.length} active head(s) in next frontier`,
      actionDescriptionCz: `Přesun '${lookahead}' → ${nextHeads.length} aktivních stavů v další vrstvě`,
      activeHeadCount: nextHeads.length,
      activeHeadStates: nextHeads.map(h => h.state),
      gssSnapshot: makeSnapshot(nextHeads),
      acceptedTreesSoFar: acceptedTrees.length
    });

    activeHeads = nextHeads;
    if (activeHeads.length > maxSimultaneousHeads) {
      maxSimultaneousHeads = activeHeads.length;
    }
    inputPtr++;
  }

  // Final sweep for any uncollected accepted trees at root
  for (const head of activeHeads) {
    for (const edge of head.predecessors) {
      if (edge.symbol === g.startSymbol && edge.parent.id === rootNode.id) {
        for (const tree of edge.trees) {
          if (!acceptedTrees.some(t => areTreesEqual(t, tree))) {
            acceptedTrees.push(cloneTree(tree));
          }
        }
      }
    }
  }

  const isAccepted = acceptedTrees.length > 0;

  return {
    accepted: isAccepted,
    totalTrees: acceptedTrees.length,
    trees: acceptedTrees,
    steps,
    gssFinal: makeSnapshot(activeHeads),
    conflictsEncountered,
    maxSimultaneousHeads,
    errorMessage: isAccepted ? undefined : 'Sentence rejected: no valid parse tree found.',
    errorMessageCz: isAccepted ? undefined : 'Věta zamítnuta: nebyl nalezen žádný platný derivační strom.'
  };
}
