/**
 * Dynamic Universal Analyzer and Derivation Word Finder for Teaching Guide.
 *
 * Computes universal property sets and defect analysis for any user-provided grammar,
 * and extracts non-trivial words in L(G1) ∩ L(G2) derived using the changed rules.
 */

import { Grammar } from '../ast/grammar';
import {
  computeEndable,
  computeReachable,
  computeNullable,
  computeLeftRecursion,
  computeCyclic,
  analyzeGrammar
} from '../analyser/grammarAnalyser';
import { buildLLTable } from '../ll/llTable';
import { cnfViolations } from '../parser/cyk';
import { explainWord } from '../parser/derivationAttempt';
import { generateWords, DerivationNode, treeStructuresDiffer } from '../generator/wordGenerator';
import { Language } from '../../i18n/translations';

export interface DynamicAnalysisResult {
  hasDefect: boolean;
  statusText: string;
  defectDetail: string;
  computedSets?: string;
  affectedRulesOrSymbols: string[];
}

/**
 * Universal analysis of any grammar against the specific defect targeted by a technique.
 */
export function analyzeTechniqueOnGrammar(
  g: Grammar,
  techniqueId: string,
  lang: Language
): DynamicAnalysisResult {
  const cz = lang === 'cz';

  switch (techniqueId) {
    case 'reduce': {
      const endable = computeEndable(g);
      const reachable = computeReachable(g);
      const unproductive = [...g.nonTerminals].filter(nt => !endable.has(nt));
      const unreachable = [...g.nonTerminals, ...g.terminals].filter(s => !reachable.has(s));
      const hasDefect = unproductive.length > 0 || unreachable.length > 0;
      const sets = `N_gen = { ${[...endable].join(', ') || '∅'} },  V_reach = { ${[...reachable].join(', ') || '∅'} }`;

      let detail = '';
      if (hasDefect) {
        const parts: string[] = [];
        if (unproductive.length > 0) {
          parts.push(cz ? `nenormované symboly: ${unproductive.join(', ')}` : `unproductive symbols: ${unproductive.join(', ')}`);
        }
        if (unreachable.length > 0) {
          parts.push(cz ? `nedosažitelné symboly: ${unreachable.join(', ')}` : `unreachable symbols: ${unreachable.join(', ')}`);
        }
        detail = parts.join('; ');
      } else {
        detail = cz ? 'Všechny symboly v této gramatice jsou normované i dosažitelné.' : 'All symbols in this grammar are generating and reachable.';
      }

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? 'Nalezeny zbytečné symboly k odstranění' : 'Useless symbols detected for elimination')
          : (cz ? 'Gramatika je již redukovaná' : 'Grammar is already reduced'),
        defectDetail: detail,
        computedSets: sets,
        affectedRulesOrSymbols: [...unproductive, ...unreachable]
      };
    }

    case 'eps': {
      const nullable = computeNullable(g);
      const epsRules = g.productions.filter(p => p.rhs.length === 0);
      const startOnRhs = g.productions.some(p => p.rhs.includes(g.startSymbol));
      const allowedEps = (lhs: string) => lhs === g.startSymbol && !startOnRhs;
      const violating = epsRules.filter(p => !allowedEps(p.lhs));
      const hasDefect = violating.length > 0;
      const sets = `N_ε = { ${[...nullable].join(', ') || '∅'} }`;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezena ε-pravidla k odstranění (${violating.length})` : `ε-rules detected for elimination (${violating.length})`)
          : (cz ? 'Gramatika neobsahuje nepovolená ε-pravidla' : 'Grammar is free of prohibited ε-rules'),
        defectDetail: hasDefect
          ? (cz
              ? `Nulovatelné neterminály N_ε: ${[...nullable].join(', ') || 'žádné'}. ε-pravidla: ${violating.map(p => `${p.lhs} → ε`).join(', ')}`
              : `Nullable symbols N_ε: ${[...nullable].join(', ') || 'none'}. ε-rules: ${violating.map(p => `${p.lhs} → ε`).join(', ')}`)
          : (cz ? 'Žádná pravidla s prázdnou pravou stranou.' : 'No productions with empty right-hand side.'),
        computedSets: sets,
        affectedRulesOrSymbols: violating.map(p => `${p.lhs} → ε`)
      };
    }

    case 'units': {
      const unitRules = g.productions.filter(p => p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0]));
      const cyclic = computeCyclic(g, computeNullable(g));
      const hasDefect = unitRules.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezena jednoduchá pravidla A → B (${unitRules.length})` : `Unit rules A → B detected (${unitRules.length})`)
          : (cz ? 'Gramatika neobsahuje jednoduchá pravidla' : 'Grammar contains no unit rules'),
        defectDetail: hasDefect
          ? (cz
              ? `Jednoduchá pravidla: ${unitRules.map(p => `${p.lhs} → ${p.rhs[0]}`).join(', ')}${cyclic.size > 0 ? ` (zjištěny cykly: ${[...cyclic].join(', ')})` : ''}`
              : `Unit productions: ${unitRules.map(p => `${p.lhs} → ${p.rhs[0]}`).join(', ')}${cyclic.size > 0 ? ` (cycles detected: ${[...cyclic].join(', ')})` : ''}`)
          : (cz ? 'Žádné pravidlo nepřepisuje neterminál na jediný neterminál.' : 'No rule rewrites a non-terminal directly into a single non-terminal.'),
        affectedRulesOrSymbols: unitRules.map(p => `${p.lhs} → ${p.rhs[0]}`)
      };
    }

    case 'immediateLeftRec': {
      const lr = computeLeftRecursion(g, computeNullable(g));
      const hasDefect = lr.immediate.size > 0;
      const offendingRules = g.productions.filter(p => p.rhs.length > 0 && p.rhs[0] === p.lhs);

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Zjištěna přímá levá rekurze u: ${[...lr.immediate].join(', ')}` : `Immediate left recursion found on: ${[...lr.immediate].join(', ')}`)
          : (cz ? 'Žádná přímá levá rekurze nezjištěna' : 'No immediate left recursion found'),
        defectDetail: hasDefect
          ? (cz ? `Pravidla s přímou levou rekurzí: ${offendingRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}` : `Directly left-recursive rules: ${offendingRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}`)
          : (cz ? 'Žádné pravidlo nezačíná vlastním neterminálem z levé strany.' : 'No production starts with the non-terminal on its left-hand side.'),
        affectedRulesOrSymbols: [...lr.immediate]
      };
    }

    case 'leftrec':
    case 'leftcorner': {
      const lr = computeLeftRecursion(g, computeNullable(g));
      const hasDefect = lr.kinds.size > 0;
      const cycles = [...lr.kinds.entries()].map(([nt, kind]) => `${nt} (${kind})`);

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezena levá rekurze: ${cycles.join(', ')}` : `Left recursion detected: ${cycles.join(', ')}`)
          : (cz ? 'Gramatika je zcela bez levé rekurze' : 'Grammar has no left recursion'),
        defectDetail: hasDefect
          ? (cz ? `Levorekurzivní neterminály N_L: ${[...lr.kinds.keys()].join(', ')}` : `Left-recursive non-terminals N_L: ${[...lr.kinds.keys()].join(', ')}`)
          : (cz ? 'Analyzátory shora dolů se nezacyklí.' : 'Top-down parsers will not loop indefinitely.'),
        affectedRulesOrSymbols: [...lr.kinds.keys()]
      };
    }

    case 'factor': {
      const prefixes: string[] = [];
      for (const A of g.nonTerminals) {
        const firsts = new Map<string, number>();
        for (const p of g.productions) {
          if (p.lhs === A && p.rhs.length > 0) {
            firsts.set(p.rhs[0], (firsts.get(p.rhs[0]) || 0) + 1);
          }
        }
        for (const [sym, count] of firsts) {
          if (count > 1) prefixes.push(`${A} → ${sym} … (${count}x)`);
        }
      }
      const hasDefect = prefixes.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezeny společné prefixy alternativ (${prefixes.length})` : `Common alternative prefixes detected (${prefixes.length})`)
          : (cz ? 'Gramatika je již levě faktorizovaná' : 'Grammar is already left-factored'),
        defectDetail: hasDefect
          ? (cz ? `Kolidující začátky pravidel: ${prefixes.join(', ')}` : `Conflicting rule beginnings: ${prefixes.join(', ')}`)
          : (cz ? 'Žádné dvě alternativy téhož neterminálu nezačínají stejným symbolem.' : 'No two alternatives of the same non-terminal begin with the same symbol.'),
        affectedRulesOrSymbols: prefixes
      };
    }

    case 'rightfactor': {
      const suffixes: string[] = [];
      for (const A of g.nonTerminals) {
        const lastMap = new Map<string, number>();
        for (const p of g.productions) {
          if (p.lhs === A && p.rhs.length > 0) {
            const last = p.rhs[p.rhs.length - 1];
            lastMap.set(last, (lastMap.get(last) || 0) + 1);
          }
        }
        for (const [sym, count] of lastMap) {
          if (count > 1) suffixes.push(`${A} → … ${sym} (${count}x)`);
        }
      }
      const hasDefect = suffixes.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezeny společné přípony k vytknutí (${suffixes.length})` : `Common suffixes detected for factoring (${suffixes.length})`)
          : (cz ? 'Žádné společné přípony k vytknutí' : 'No common suffixes to factor'),
        defectDetail: hasDefect
          ? (cz ? `Společné přípony: ${suffixes.join(', ')}` : `Common suffixes: ${suffixes.join(', ')}`)
          : (cz ? 'Alternativy nesdílejí společné přípony.' : 'Alternatives do not share common suffixes.'),
        affectedRulesOrSymbols: suffixes
      };
    }

    case 'expandLeading': {
      const leadingNtRules = g.productions.filter(
        p => p.rhs.length > 0 && g.nonTerminals.has(p.rhs[0]) && p.rhs[0] !== p.lhs
      );
      const hasDefect = leadingNtRules.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezena pravidla s úvodním neterminálem (${leadingNtRules.length})` : `Rules starting with a non-terminal (${leadingNtRules.length})`)
          : (cz ? 'Žádná pravidla s úvodním cizím neterminálem' : 'No rules with leading foreign non-terminal'),
        defectDetail: hasDefect
          ? (cz ? `Pravidla: ${leadingNtRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}` : `Rules: ${leadingNtRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}`)
          : (cz ? 'Všechna pravidla začínají terminály nebo prázdným slovem.' : 'All rules start with terminals or epsilon.'),
        affectedRulesOrSymbols: leadingNtRules.map(p => `${p.lhs} → ${p.rhs[0]}…`)
      };
    }

    case 'substitute': {
      // Find non-terminals used in rules other than start
      const intermediate = [...g.nonTerminals].filter(nt => nt !== g.startSymbol);
      const hasDefect = intermediate.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Pomocné neterminály k dosazení: ${intermediate.join(', ')}` : `Intermediate non-terminals available for inlining: ${intermediate.join(', ')}`)
          : (cz ? 'Pouze počáteční symbol' : 'Only start symbol present'),
        defectDetail: hasDefect
          ? (cz ? `Neterminály ${intermediate.join(', ')} lze dosadit přímo do jejich výskytů.` : `Non-terminals ${intermediate.join(', ')} can be inlined directly into occurrences.`)
          : (cz ? 'Žádné pomocné neterminály k rozvinutí.' : 'No intermediate non-terminals to unfold.'),
        affectedRulesOrSymbols: intermediate
      };
    }

    case 'absorb': {
      // Find non-terminals followed by a terminal on right-hand sides
      const followers: string[] = [];
      for (const p of g.productions) {
        for (let i = 0; i < p.rhs.length - 1; i++) {
          const A = p.rhs[i];
          const b = p.rhs[i + 1];
          if (g.nonTerminals.has(A) && g.terminals.has(b)) {
            followers.push(`${A} následovaný '${b}' v ${p.lhs} → ${p.rhs.join(' ')}`);
          }
        }
      }
      const hasDefect = followers.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezeny dvojice [Neterminál Terminál] k pohlcení (${followers.length})` : `Found [NonTerminal Terminal] pairs for absorption (${followers.length})`)
          : (cz ? 'Žádné dvojice pro pohlcení terminálu' : 'No pairs for terminal absorption'),
        defectDetail: hasDefect
          ? followers.join('; ')
          : (cz ? 'Na pravých stranách nenásleduje terminál bezprostředně za neterminálem.' : 'No terminal immediately follows a non-terminal on RHS.'),
        affectedRulesOrSymbols: followers
      };
    }

    case 'cnf': {
      const violations = cnfViolations(g);
      const hasDefect = violations.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Pravidla porušující CNF (${violations.length})` : `Rules violating CNF (${violations.length})`)
          : (cz ? 'Gramatika je v Chomského normální formě (CNF)' : 'Grammar is in Chomsky Normal Form (CNF)'),
        defectDetail: hasDefect
          ? (cz ? `Neodpovídající pravidla (musí být A → B C nebo A → a): ${violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`).join(', ')}` : `Non-compliant rules (must be A → B C or A → a): ${violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`).join(', ')}`)
          : (cz ? 'Každé pravidlo má tvar A → B C nebo A → a.' : 'Every production has the form A → B C or A → a.'),
        affectedRulesOrSymbols: violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`)
      };
    }

    case 'gnf': {
      const violations = g.productions.filter(
        p => p.rhs.length === 0 || !g.terminals.has(p.rhs[0]) || p.rhs.slice(1).some(s => !g.nonTerminals.has(s))
      );
      const hasDefect = violations.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Pravidla porušující GNF (${violations.length})` : `Rules violating GNF (${violations.length})`)
          : (cz ? 'Gramatika je v Greibachové normální formě (GNF)' : 'Grammar is in Greibach Normal Form (GNF)'),
        defectDetail: hasDefect
          ? (cz ? `Pravidla nezačínající terminálem (tvar A → a B₁…Bₖ): ${violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`).join(', ')}` : `Rules not starting with a terminal (form A → a B₁…Bₖ): ${violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`).join(', ')}`)
          : (cz ? 'Každé pravidlo začíná právě jedním terminálem následovaným neterminály.' : 'Every rule starts with exactly one terminal followed by non-terminals.'),
        affectedRulesOrSymbols: violations.map(p => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`)
      };
    }

    case 'll1': {
      const analysis = analyzeGrammar(g, { k2: false });
      const table = buildLLTable(g, analysis, { ll2: false });
      const hasDefect = table.conflicts.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezeno ${table.conflicts.length} kolizí LL(1)` : `${table.conflicts.length} LL(1) conflicts found`)
          : (cz ? 'Gramatika je již bezkolizní LL(1)' : 'Grammar is already conflict-free LL(1)'),
        defectDetail: hasDefect
          ? (cz
              ? `Kolize: ${table.conflicts.map(c => `${c.conflictType} na ${c.nonTerminal} pro lookahead '${c.lookahead}'`).join('; ')}`
              : `Conflicts: ${table.conflicts.map(c => `${c.conflictType} on ${c.nonTerminal} with lookahead '${c.lookahead}'`).join('; ')}`)
          : (cz ? 'Všechny řídicí množiny (director sets) jsou disjunktní.' : 'All director sets are mutually disjoint.'),
        affectedRulesOrSymbols: table.conflicts.map(c => `${c.nonTerminal}/${c.lookahead}`)
      };
    }

    case 'leftToRightLinear': {
      const leftLinearRules = g.productions.filter(
        p => p.rhs.length === 2 && g.nonTerminals.has(p.rhs[0]) && !g.nonTerminals.has(p.rhs[1])
      );
      const hasDefect = leftLinearRules.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Nalezena levolineární pravidla (${leftLinearRules.length})` : `Left-linear productions detected (${leftLinearRules.length})`)
          : (cz ? 'Žádná levolineární pravidla' : 'No left-linear productions'),
        defectDetail: hasDefect
          ? (cz
              ? `Levolineární pravidla obsahují přímou levou rekurzi: ${leftLinearRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}`
              : `Left-linear rules contain immediate left recursion: ${leftLinearRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`).join(', ')}`)
          : (cz ? 'Gramatika neobsahuje levolineární pravidla.' : 'Grammar does not contain left-linear rules.'),
        affectedRulesOrSymbols: leftLinearRules.map(p => `${p.lhs} → ${p.rhs.join(' ')}`)
      };
    }

    case 'danglingElse': {
      let foundPair: { s: string; unclosed: string; closed: string } | null = null;
      for (const nt of g.nonTerminals) {
        const alts = g.productions.filter(p => p.lhs === nt).map(p => p.rhs);
        for (const a1 of alts) {
          if (a1.length >= 2 && a1[a1.length - 1] === nt) {
            const prefix = a1.slice(0, a1.length - 1);
            for (const a2 of alts) {
              if (a2.length > a1.length + 1 && a2[a2.length - 1] === nt) {
                const matchesPrefix = prefix.every((sym, idx) => a2[idx] === sym);
                if (matchesPrefix && a2[prefix.length] === nt) {
                  foundPair = {
                    s: nt,
                    unclosed: `${nt} → ${a1.join(' ')}`,
                    closed: `${nt} → ${a2.join(' ')}`
                  };
                  break;
                }
              }
            }
          }
          if (foundPair) break;
        }
        if (foundPair) break;
      }

      const hasDefect = foundPair !== null;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Detekována nejednoznačnost dangling-else na ${foundPair!.s}` : `Dangling-else ambiguity detected on ${foundPair!.s}`)
          : (cz ? 'Nenalezen vzor dangling-else' : 'No dangling-else pattern found'),
        defectDetail: hasDefect
          ? (cz
              ? `Pravidla způsobující Shift/Reduce kolizi: ${foundPair!.unclosed} a ${foundPair!.closed}`
              : `Rules causing Shift/Reduce conflict: ${foundPair!.unclosed} and ${foundPair!.closed}`)
          : (cz ? 'Gramatika neobsahuje nejednoznačné větvení if-then-else.' : 'Grammar does not contain ambiguous if-then-else branching.'),
        affectedRulesOrSymbols: foundPair ? [foundPair.unclosed, foundPair.closed] : []
      };
    }

    case 'precedenceStrat': {
      let flatNt: string | null = null;
      let binCount = 0;
      for (const nt of g.nonTerminals) {
        const alts = g.productions.filter(p => p.lhs === nt).map(p => p.rhs);
        const selfBin = alts.filter(a => a.length >= 3 && a[0] === nt && a[a.length - 1] === nt);
        if (selfBin.length >= 2 || (selfBin.length >= 1 && alts.length > selfBin.length)) {
          flatNt = nt;
          binCount = selfBin.length;
          break;
        }
      }

      const hasDefect = flatNt !== null;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Detekovány ploché binární operátory (${binCount}) na ${flatNt}` : `Flat binary operators detected (${binCount}) on ${flatNt}`)
          : (cz ? 'Žádná nejednoznačná plochá pravidla operátorů' : 'No ambiguous flat operator productions'),
        defectDetail: hasDefect
          ? (cz
              ? `Neterminál ${flatNt} obsahuje ${binCount} seberekurzivních pravidel tvaru ${flatNt} → ${flatNt} op ${flatNt}, způsobujících Shift/Reduce a Reduce/Reduce kolize.`
              : `Non-terminal ${flatNt} contains ${binCount} self-recursive rules of the form ${flatNt} → ${flatNt} op ${flatNt}, causing Shift/Reduce and Reduce/Reduce conflicts.`)
          : (cz ? 'Operátory jsou již správně hierarchicky stratifikovány.' : 'Operators are already stratified into a hierarchy.'),
        affectedRulesOrSymbols: flatNt ? [`${flatNt} → ${flatNt} op ${flatNt}`] : []
      };
    }

    case 'splitLRContext': {
      const ntPairs = new Map<string, string[]>();
      for (const p of g.productions) {
        if (p.rhs.length >= 2) {
          for (let i = 1; i < p.rhs.length; i++) {
            const sym = p.rhs[i];
            if (g.nonTerminals.has(sym)) {
              const prev = p.rhs[i - 1];
              if (!ntPairs.has(sym)) ntPairs.set(sym, []);
              if (!ntPairs.get(sym)!.includes(prev)) ntPairs.get(sym)!.push(prev);
            }
          }
        }
      }
      const candidates = [...ntPairs.entries()].filter(([_, prefixes]) => prefixes.length >= 2);
      const hasDefect = candidates.length > 0;

      return {
        hasDefect,
        statusText: hasDefect
          ? (cz ? `Detekovány sloučené volací kontexty pro: ${candidates.map(c => c[0]).join(', ')}` : `Merged calling contexts detected for: ${candidates.map(c => c[0]).join(', ')}`)
          : (cz ? 'Žádné sloučené kontexty vyžadující štěpení' : 'No merged contexts requiring splitting'),
        defectDetail: hasDefect
          ? (cz
              ? `Neterminály ${candidates.map(c => `${c[0]} (po ${c[1].join(', ')})`).join('; ')} způsobují při sloučení stavů LALR(1) kolize Reduce/Reduce.`
              : `Non-terminals ${candidates.map(c => `${c[0]} (after ${c[1].join(', ')})`).join('; ')} cause Reduce/Reduce conflicts in LALR(1) state merging.`)
          : (cz ? 'Kontexty neterminálů jsou jednoznačně odděleny.' : 'Non-terminal contexts are cleanly separated.'),
        affectedRulesOrSymbols: candidates.map(c => c[0])
      };
    }

    case 'autoLR': {
      // Check any LR conflict patterns
      const hasDefect = true; // Evaluates available LR conflict resolutions
      return {
        hasDefect,
        statusText: cz ? 'Analýza LR rozkladových konfliktů' : 'LR Parse Table Conflict Analysis',
        defectDetail: cz
          ? 'Zkontroluje gramatiku na přítomnost Shift/Reduce a Reduce/Reduce kolizí a aplikuje odpovídající rozlišení (dangling-else, žebřík priorit operátorů, kontextové štěpení).'
          : 'Inspects grammar for Shift/Reduce and Reduce/Reduce conflicts and applies the appropriate formal resolution (dangling-else, operator ladder, or context splitting).',
        affectedRulesOrSymbols: []
      };
    }

    default:

      return {
        hasDefect: false,
        statusText: cz ? 'Gramatika připravena' : 'Grammar ready',
        defectDetail: '',
        affectedRulesOrSymbols: []
      };
  }
}

/** Check if a derivation node uses any production not present in original grammar. */
function treeUsesChangedRules(node: DerivationNode, g1Rules: Set<string>): boolean {
  if (node.isTerminal || !node.children) return false;
  if (node.isForestRoot) return (node.children || []).some(c => treeUsesChangedRules(c, g1Rules));
  const rhs = node.children.map(c => c.symbol).filter(s => s !== 'ε');
  const sig = `${node.symbol}->${rhs.join(' ')}`;
  if (!g1Rules.has(sig)) return true;
  return node.children.some(c => treeUsesChangedRules(c, g1Rules));
}

export interface ComparisonWordChoice {
  tokens: string[];
  wordText: string;
  usesChangedRule: boolean;
  treesDiffer: boolean;
  length: number;
}

/**
 * Finds non-trivial words in L(G1) ∩ L(G2) derived using the changed rules,
 * returning at least 3 choices to pick from whenever possible.
 */
export function findComparisonWords(
  g1: Grammar,
  g2: Grammar,
  maxCount = 5
): ComparisonWordChoice[] {
  const g1Rules = new Set(g1.productions.map(p => `${p.lhs}->${p.rhs.join(' ')}`));
  const candidatePool: string[][] = [];
  const seen = new Set<string>();

  const addWord = (tokens: string[]) => {
    const key = tokens.join('\u0000');
    if (!seen.has(key)) {
      seen.add(key);
      candidatePool.push(tokens);
    }
  };

  // 1. Gather traces from both grammars
  const tracesG2 = generateWords(g2, 25, 14);
  const tracesG1 = generateWords(g1, 25, 14);

  for (const t of tracesG2) addWord(t.tokens);
  for (const t of tracesG1) addWord(t.tokens);

  // 2. Also test short common combinations if pool is small
  if (candidatePool.length < 5) {
    const terms = [...new Set([...g1.terminals, ...g2.terminals])].slice(0, 10);
    for (const t of terms) addWord([t]);
    for (const t1 of terms) {
      for (const t2 of terms) addWord([t1, t2]);
    }
  }

  const choices: ComparisonWordChoice[] = [];

  for (const tokens of candidatePool) {
    const e1 = explainWord(g1, tokens);
    const e2 = explainWord(g2, tokens);

    if (e1.generated && e2.generated && e1.tree && e2.tree) {
      const usesChanged = treeUsesChangedRules(e2.tree, g1Rules);
      const diff = treeStructuresDiffer(e1.tree, e2.tree);
      choices.push({
        tokens,
        wordText: tokens.join(' ') || 'ε',
        usesChangedRule: usesChanged,
        treesDiffer: diff,
        length: tokens.length
      });
    }
  }

  // Sort choices:
  // 1. Uses changed rule & trees differ first
  // 2. Uses changed rule
  // 3. Trees differ
  // 4. Non-empty length (length >= 1, preferably 2..8)
  choices.sort((a, b) => {
    const score = (c: ComparisonWordChoice) => {
      let s = 0;
      if (c.usesChangedRule) s += 100;
      if (c.treesDiffer) s += 50;
      if (c.length >= 2 && c.length <= 8) s += 20;
      else if (c.length === 1) s += 10;
      return s;
    };
    return score(b) - score(a);
  });

  return choices.slice(0, Math.max(3, maxCount));
}
