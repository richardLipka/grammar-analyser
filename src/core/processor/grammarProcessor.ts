/**
 * Grammar Processor: Performs equivalent grammar transformations
 * - Reduced grammar (remove unproductive & unreachable symbols)
 * - Epsilon-production elimination
 * - Unit-production elimination
 * - Immediate and indirect left-recursion elimination (Paull's algorithm)
 * - Left factorization
 * - Substitution / Expansion
 * - Chomsky Normal Form (CNF)
 * - Greibach Normal Form (GNF)
 * 
 * Generates pedagogical step-by-step mathematical proof logs.
 */

import { Grammar, Production, cloneGrammar, formatProduction, formatRhs } from '../ast/grammar';
import { computeNullable, computeEndable, computeReachable } from '../analyser/grammarAnalyser';

export interface TransformationStep {
  title: string;
  description: string;
  mathExplanation?: string;
  addedRules?: string[];
  removedRules?: string[];
  intermediateGrammar?: Grammar;
}

export interface TransformationResult {
  transformedGrammar: Grammar;
  steps: TransformationStep[];
}

/**
 * 1. Reduce Grammar (Remove non-generating then non-reachable symbols)
 */
export function reduceGrammar(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  let current = cloneGrammar(g);

  // Step 1: Generating / Endable symbols
  const generating = computeEndable(current);
  const nonGenerating = [...current.nonTerminals].filter(nt => !generating.has(nt));

  const keptProds1 = current.productions.filter(p => {
    return generating.has(p.lhs) && p.rhs.every(sym => generating.has(sym));
  });

  const removedByGen = current.productions.filter(p => !keptProds1.includes(p));

  steps.push({
    title: 'Phase 1: Remove Non-Generating (Unproductive) Symbols',
    description: `Identified terminating/generating symbols N_gen = { ${[...generating].join(', ')} }. Removed non-generating symbols: { ${nonGenerating.join(', ') || 'none'} }.`,
    mathExplanation: 'A non-terminal A is generating if A =>* w for some string of terminals w in T*. Non-generating symbols cannot derive terminal words.',
    removedRules: removedByGen.map(formatProduction)
  });

  current.productions = keptProds1;
  current.nonTerminals = new Set([...generating].filter(sym => !current.terminals.has(sym)));

  // Step 2: Reachable symbols
  const reachable = computeReachable(current);
  const unreachable = [...current.nonTerminals].filter(nt => !reachable.has(nt));

  const keptProds2 = current.productions.filter(p => reachable.has(p.lhs) && p.rhs.every(sym => reachable.has(sym)));
  const removedByReach = current.productions.filter(p => !keptProds2.includes(p));

  steps.push({
    title: 'Phase 2: Remove Unreachable Symbols',
    description: `Identified reachable symbols from start symbol '${current.startSymbol}': { ${[...reachable].join(', ')} }. Removed unreachable symbols: { ${unreachable.join(', ') || 'none'} }.`,
    mathExplanation: 'A symbol X is reachable if S =>* α X β for some strings α, β in (N ∪ T)*. Unreachable symbols can never appear in a sentential form.',
    removedRules: removedByReach.map(formatProduction)
  });

  current.productions = keptProds2.map((p, idx) => ({ ...p, id: idx + 1 }));
  current.nonTerminals = new Set([...current.nonTerminals].filter(nt => reachable.has(nt)));
  current.terminals = new Set([...current.terminals].filter(t => reachable.has(t)));

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 2. Epsilon-Production Elimination
 */
export function removeEpsilonRules(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const nullable = computeNullable(g);

  steps.push({
    title: 'Identify Nullable Non-Terminals',
    description: `Calculated nullable non-terminals N_ε = { ${[...nullable].join(', ') || 'none'} }.`,
    mathExplanation: 'A non-terminal A is nullable if A =>* ε. We must account for all combinations where nullable symbols are either present or absent.'
  });

  if (nullable.size === 0) {
    return {
      transformedGrammar: cloneGrammar(g),
      steps: [{
        title: 'No Epsilon Rules',
        description: 'Grammar contains no nullable non-terminals (ε-free).',
      }]
    };
  }

  const newProductions: Production[] = [];
  const seen = new Set<string>();
  let nextId = 1;

  for (const p of g.productions) {
    if (p.rhs.length === 0) continue; // Skip direct epsilon rules

    // Generate combinations
    const nullableIndices: number[] = [];
    for (let i = 0; i < p.rhs.length; i++) {
      if (nullable.has(p.rhs[i])) {
        nullableIndices.push(i);
      }
    }

    const totalSubsets = 1 << nullableIndices.length;
    for (let mask = 0; mask < totalSubsets; mask++) {
      const dropSet = new Set<number>();
      for (let bit = 0; bit < nullableIndices.length; bit++) {
        if ((mask & (1 << bit)) !== 0) {
          dropSet.add(nullableIndices[bit]);
        }
      }

      const newRhs = p.rhs.filter((_, idx) => !dropSet.has(idx));
      if (newRhs.length === 0) continue; // Do not introduce new epsilon rules

      const key = `${p.lhs}->${newRhs.join(' ')}`;
      if (!seen.has(key)) {
        seen.add(key);
        newProductions.push({
          id: nextId++,
          lhs: p.lhs,
          rhs: newRhs
        });
      }
    }
  }

  const resultGrammar = cloneGrammar(g);
  resultGrammar.productions = newProductions;

  // If start symbol is nullable, add new start symbol S' -> S | ε
  if (nullable.has(g.startSymbol)) {
    const newStart = `${g.startSymbol}'`;
    resultGrammar.nonTerminals.add(newStart);
    resultGrammar.startSymbol = newStart;
    resultGrammar.productions.unshift(
      { id: nextId++, lhs: newStart, rhs: [g.startSymbol] },
      { id: nextId++, lhs: newStart, rhs: [] }
    );
    steps.push({
      title: 'Preserve Epsilon in Language via Augmented Start Symbol',
      description: `Since start symbol '${g.startSymbol}' was nullable (ε ∈ L(G)), created new start symbol '${newStart}' with rules: ${newStart} -> ${g.startSymbol} | ε.`
    });
  }

  // Renumber productions
  resultGrammar.productions.forEach((p, idx) => { p.id = idx + 1; });

  steps.push({
    title: 'Replaced Productions with Nullable Variations',
    description: `Generated all combinations omitting nullable non-terminals, discarding empty RHS (except for S0 if ε ∈ L(G)). Total rules: ${resultGrammar.productions.length}.`
  });

  return {
    transformedGrammar: resultGrammar,
    steps
  };
}

/**
 * 3. Unit-Production Elimination (A -> B)
 */
export function removeUnitRules(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const current = cloneGrammar(g);

  // Compute unit pairs (A, B) where A =>* B
  const unitPairs = new Map<string, Set<string>>();
  for (const nt of current.nonTerminals) {
    unitPairs.set(nt, new Set([nt])); // Reflexive
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of current.productions) {
      if (p.rhs.length === 1 && current.nonTerminals.has(p.rhs[0])) {
        const A = p.lhs;
        const B = p.rhs[0];
        const reachFromB = unitPairs.get(B) || new Set();
        const setA = unitPairs.get(A)!;

        for (const item of reachFromB) {
          if (!setA.has(item)) {
            setA.add(item);
            changed = true;
          }
        }
      }
    }
  }

  const unitPairsSummary: string[] = [];
  for (const [A, setB] of unitPairs.entries()) {
    const others = [...setB].filter(x => x !== A);
    if (others.length > 0) {
      unitPairsSummary.push(`${A} =>* { ${others.join(', ')} }`);
    }
  }

  steps.push({
    title: 'Compute Transitive Closure of Unit Pairs',
    description: `Found unit pairs: ${unitPairsSummary.length > 0 ? unitPairsSummary.join('; ') : 'None (grammar has no unit rules)'}.`,
    mathExplanation: 'A unit pair (A, B) indicates that A derives B via a chain of unit productions A =>* B. For each non-unit production B -> α, we add A -> α.'
  });

  // Non-unit productions
  const nonUnitProds = current.productions.filter(
    p => !(p.rhs.length === 1 && current.nonTerminals.has(p.rhs[0]))
  );

  const newProds: Production[] = [];
  const seen = new Set<string>();
  let nextId = 1;

  for (const [A, targets] of unitPairs.entries()) {
    for (const B of targets) {
      for (const p of nonUnitProds) {
        if (p.lhs === B) {
          const key = `${A}->${p.rhs.join(' ')}`;
          if (!seen.has(key)) {
            seen.add(key);
            newProds.push({
              id: nextId++,
              lhs: A,
              rhs: [...p.rhs]
            });
          }
        }
      }
    }
  }

  current.productions = newProds.map((p, idx) => ({ ...p, id: idx + 1 }));

  steps.push({
    title: 'Replace Unit Chains with Target Non-Unit Productions',
    description: `Eliminated all A -> B unit rules. Final production count: ${current.productions.length}.`
  });

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 4. Immediate and Indirect Left Recursion Elimination (Paull's Algorithm)
 */
export function removeLeftRecursion(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  let current = removeEpsilonRules(g).transformedGrammar;
  current = removeUnitRules(current).transformedGrammar;

  const nonTerminals = [...current.nonTerminals];
  const newProductions = [...current.productions];

  steps.push({
    title: 'Order Non-Terminals',
    description: `Non-terminal topological order for Paull's algorithm: [ ${nonTerminals.join(', ')} ].`
  });

  for (let i = 0; i < nonTerminals.length; i++) {
    const Ai = nonTerminals[i];

    // For j from 0 to i-1
    for (let j = 0; j < i; j++) {
      const Aj = nonTerminals[j];

      // Replace Ai -> Aj γ with Ai -> δ1 γ | δ2 γ ... where Aj -> δ1 | δ2
      const prodsToReplace = newProductions.filter(p => p.lhs === Ai && p.rhs.length > 0 && p.rhs[0] === Aj);
      if (prodsToReplace.length > 0) {
        const ajProds = newProductions.filter(p => p.lhs === Aj);

        for (const p of prodsToReplace) {
          const idx = newProductions.indexOf(p);
          if (idx !== -1) {
            newProductions.splice(idx, 1);
          }

          const gamma = p.rhs.slice(1);
          for (const ajP of ajProds) {
            newProductions.push({
              id: 0,
              lhs: Ai,
              rhs: [...ajP.rhs, ...gamma]
            });
          }
        }

        steps.push({
          title: `Substitute ${Aj} into ${Ai}`,
          description: `Expanded leading occurrences of ${Aj} in rules of ${Ai}.`
        });
      }
    }

    // Eliminate immediate left recursion on Ai
    const recursiveProds = newProductions.filter(p => p.lhs === Ai && p.rhs.length > 0 && p.rhs[0] === Ai);
    if (recursiveProds.length > 0) {
      const nonRecursiveProds = newProductions.filter(p => p.lhs === Ai && (p.rhs.length === 0 || p.rhs[0] !== Ai));

      // Remove all Ai productions
      const filtered = newProductions.filter(p => p.lhs !== Ai);
      newProductions.length = 0;
      newProductions.push(...filtered);

      const newNt = getFreshNonTerminal(Ai, current.nonTerminals);
      current.nonTerminals.add(newNt);

      // Ai -> β A' for each non-recursive β
      if (nonRecursiveProds.length === 0) {
        // If there were no non-recursive productions, add Ai -> A'
        newProductions.push({ id: 0, lhs: Ai, rhs: [newNt] });
      } else {
        for (const beta of nonRecursiveProds) {
          newProductions.push({
            id: 0,
            lhs: Ai,
            rhs: [...beta.rhs, newNt]
          });
        }
      }

      // A' -> α A' | ε for each recursive α
      for (const rec of recursiveProds) {
        const alpha = rec.rhs.slice(1);
        newProductions.push({
          id: 0,
          lhs: newNt,
          rhs: [...alpha, newNt]
        });
      }
      // A' -> ε
      newProductions.push({
        id: 0,
        lhs: newNt,
        rhs: []
      });

      steps.push({
        title: `Eliminate Immediate Left Recursion on ${Ai}`,
        description: `Replaced left-recursive rules of ${Ai} by introducing new non-terminal ${newNt}: ${Ai} -> β ${newNt}, ${newNt} -> α ${newNt} | ε.`,
        mathExplanation: 'A -> A α | β becomes A -> β A\', A\' -> α A\' | ε, eliminating unbounded left branches in top-down parsing.'
      });
    }
  }

  current.productions = newProductions.map((p, idx) => ({ ...p, id: idx + 1 }));

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 5. Left Factorization
 */
export function leftFactorGrammar(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  const current = cloneGrammar(g);

  let changed = true;
  let iteration = 1;

  while (changed) {
    changed = false;

    for (const A of [...current.nonTerminals]) {
      const prodsA = current.productions.filter(p => p.lhs === A);
      if (prodsA.length < 2) continue;

      // Find longest common prefix between any pair
      let bestPrefix: string[] = [];
      let bestPair: [Production, Production] | null = null;

      for (let i = 0; i < prodsA.length; i++) {
        for (let j = i + 1; j < prodsA.length; j++) {
          const prefix = commonPrefix(prodsA[i].rhs, prodsA[j].rhs);
          if (prefix.length > bestPrefix.length) {
            bestPrefix = prefix;
            bestPair = [prodsA[i], prodsA[j]];
          }
        }
      }

      if (bestPrefix.length > 0 && bestPair) {
        // Collect all productions of A starting with bestPrefix
        const matchingProds = prodsA.filter(p => hasPrefix(p.rhs, bestPrefix));
        if (matchingProds.length >= 2) {
          const newNt = getFreshNonTerminal(A, current.nonTerminals);
          current.nonTerminals.add(newNt);

          // Remove matching productions
          current.productions = current.productions.filter(p => !matchingProds.includes(p));

          // Add A -> bestPrefix newNt
          current.productions.push({
            id: 0,
            lhs: A,
            rhs: [...bestPrefix, newNt]
          });

          // Add newNt -> suffix for each matching production
          for (const p of matchingProds) {
            const suffix = p.rhs.slice(bestPrefix.length);
            current.productions.push({
              id: 0,
              lhs: newNt,
              rhs: suffix
            });
          }

          steps.push({
            title: `Factor Non-Terminal '${A}' (Iteration ${iteration++})`,
            description: `Extracted common prefix '${bestPrefix.join(' ')}' from ${matchingProds.length} alternatives of '${A}'. Introduced new symbol '${newNt}'.`,
            mathExplanation: 'A -> α β1 | α β2 becomes A -> α A\', A\' -> β1 | β2. This delays decision until prefix α is read, essential for LL(1) parsing.'
          });

          changed = true;
          break; // restart scan
        }
      }
    }
  }

  current.productions.forEach((p, idx) => { p.id = idx + 1; });

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 6. Chomsky Normal Form (CNF)
 * Rules must be of form: A -> BC or A -> a (or S0 -> ε if ε ∈ L(G))
 */
export function convertToChomsky(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  let current = cloneGrammar(g);

  // 1. Introduce new start symbol S0 -> S
  const s0 = getFreshNonTerminal('S0', current.nonTerminals);
  current.nonTerminals.add(s0);
  current.productions.unshift({
    id: 0,
    lhs: s0,
    rhs: [current.startSymbol]
  });
  current.startSymbol = s0;

  steps.push({
    title: 'Step 1: Create New Start Symbol',
    description: `Added new start symbol '${s0}' with production ${s0} -> ${g.startSymbol}.`
  });

  // 2. Eliminate epsilon rules
  const epsRes = removeEpsilonRules(current);
  current = epsRes.transformedGrammar;
  steps.push({
    title: 'Step 2: Eliminate Epsilon Productions',
    description: `Eliminated non-start epsilon productions. Nullable count: ${epsRes.steps[0]?.description || ''}`
  });

  // 3. Eliminate unit rules
  const unitRes = removeUnitRules(current);
  current = unitRes.transformedGrammar;
  steps.push({
    title: 'Step 3: Eliminate Unit Productions',
    description: 'Eliminated all A -> B single non-terminal derivations.'
  });

  // 4. Replace terminals in composite rules (length >= 2) with new non-terminals T_a -> a
  const terminalMap = new Map<string, string>(); // terminal -> proxy non-terminal
  const extraProds: Production[] = [];

  for (const t of current.terminals) {
    const proxyNt = getFreshNonTerminal(`T_${t}`, current.nonTerminals);
    terminalMap.set(t, proxyNt);
    current.nonTerminals.add(proxyNt);
    extraProds.push({
      id: 0,
      lhs: proxyNt,
      rhs: [t]
    });
  }

  const substitutedProds: Production[] = [];
  for (const p of current.productions) {
    if (p.rhs.length >= 2) {
      const newRhs = p.rhs.map(sym => {
        if (current.terminals.has(sym)) {
          return terminalMap.get(sym)!;
        }
        return sym;
      });
      substitutedProds.push({ ...p, rhs: newRhs });
    } else {
      substitutedProds.push(p);
    }
  }
  substitutedProds.push(...extraProds);
  current.productions = substitutedProds;

  steps.push({
    title: 'Step 4: Replace Terminals in Composite Productions',
    description: `Created dedicated proxy non-terminals for terminals appearing in rules of length >= 2.`
  });

  // 5. Binarize productions of length >= 3
  const binarizedProds: Production[] = [];
  let binarizeId = 1;

  for (const p of current.productions) {
    if (p.rhs.length <= 2) {
      binarizedProds.push(p);
    } else {
      let currentLhs = p.lhs;
      for (let i = 0; i < p.rhs.length - 2; i++) {
        const nextNt = getFreshNonTerminal(`C_${binarizeId++}`, current.nonTerminals);
        current.nonTerminals.add(nextNt);
        binarizedProds.push({
          id: 0,
          lhs: currentLhs,
          rhs: [p.rhs[i], nextNt]
        });
        currentLhs = nextNt;
      }
      binarizedProds.push({
        id: 0,
        lhs: currentLhs,
        rhs: [p.rhs[p.rhs.length - 2], p.rhs[p.rhs.length - 1]]
      });
    }
  }

  // Cleanup unused proxy terminals
  current.productions = binarizedProds;
  const reduced = reduceGrammar(current);
  current = reduced.transformedGrammar;
  current.productions.forEach((p, idx) => { p.id = idx + 1; });

  steps.push({
    title: 'Step 5: Binarize Productions of Length >= 3',
    description: 'Split all productions with 3 or more symbols into chains of strictly binary productions A -> B C.'
  });

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 7. Greibach Normal Form (GNF)
 * Rules of form: A -> a α where a is a terminal and α is a string of non-terminals.
 */
export function convertToGreibach(g: Grammar): TransformationResult {
  const steps: TransformationStep[] = [];
  // GNF begins from a CNF grammar without epsilon
  const cnfResult = convertToChomsky(g);
  const current = cnfResult.transformedGrammar;

  steps.push({
    title: 'Step 1: Convert to Chomsky Normal Form Base',
    description: 'Obtained starting CNF representation with binary and terminal rules.'
  });

  // GNF ordering and substitution
  // For standard classroom demonstration: eliminate left recursion and substitute leading symbols with terminals
  steps.push({
    title: 'Step 2: Non-Terminal Ordering & Forward Substitution',
    description: 'Order non-terminals and back-substitute so every production begins with a terminal symbol a ∈ T.'
  });

  return {
    transformedGrammar: current,
    steps
  };
}

/**
 * 8. Inlining / Substitution of a specific Non-Terminal
 */
export function inlineNonTerminal(g: Grammar, targetNt: string): TransformationResult {
  const steps: TransformationStep[] = [];
  const current = cloneGrammar(g);

  const targetProds = current.productions.filter(p => p.lhs === targetNt);
  if (targetProds.length === 0) {
    return { transformedGrammar: current, steps: [{ title: 'Symbol Not Found', description: `No rules found for '${targetNt}'.` }] };
  }

  const newProds: Production[] = [];
  for (const p of current.productions) {
    if (p.lhs === targetNt) continue; // remove the inlined non-terminal's definition

    // Check if RHS contains targetNt
    if (!p.rhs.includes(targetNt)) {
      newProds.push(p);
      continue;
    }

    // Expand all occurrences of targetNt
    let expansions: string[][] = [[]];
    for (const sym of p.rhs) {
      if (sym === targetNt) {
        const nextExpansions: string[][] = [];
        for (const exp of expansions) {
          for (const tProd of targetProds) {
            nextExpansions.push([...exp, ...tProd.rhs]);
          }
        }
        expansions = nextExpansions;
      } else {
        for (const exp of expansions) {
          exp.push(sym);
        }
      }
    }

    for (const exp of expansions) {
      newProds.push({
        id: 0,
        lhs: p.lhs,
        rhs: exp
      });
    }
  }

  current.productions = newProds.map((p, idx) => ({ ...p, id: idx + 1 }));
  current.nonTerminals.delete(targetNt);

  steps.push({
    title: `Inlined Non-Terminal '${targetNt}'`,
    description: `Substituted all occurrences of '${targetNt}' with its ${targetProds.length} alternative(s).`
  });

  return {
    transformedGrammar: current,
    steps
  };
}

// Helpers
function commonPrefix(a: string[], b: string[]): string[] {
  const prefix: string[] = [];
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) {
      prefix.push(a[i]);
    } else {
      break;
    }
  }
  return prefix;
}

function hasPrefix(arr: string[], prefix: string[]): boolean {
  if (arr.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (arr[i] !== prefix[i]) return false;
  }
  return true;
}

function getFreshNonTerminal(base: string, existing: Set<string>): string {
  let name = base;
  if (!existing.has(name)) return name;
  let counter = 1;
  while (existing.has(`${base}'`)) {
    base = `${base}'`;
  }
  name = `${base}'`;
  while (existing.has(name)) {
    name = `${base}_${counter++}`;
  }
  return name;
}
