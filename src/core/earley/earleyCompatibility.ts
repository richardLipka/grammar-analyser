/**
 * Parser Compatibility Diagnostics for ALL(*), Earley (1970), and ETTP (2025)
 *
 * Designed for quick evaluation in the Overview tab without freezing UI.
 */

import { Grammar } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { checkALLCompatibility, ALLCompatibilityResult } from '../all/allParser';
import { buildETTPTable, ETTPTable } from './ettpParser';

export interface EarleyCompatibilityResult {
  canParse: boolean;
  algorithm: 'Earley (1970)';
  reasonsEn: string[];
  reasonsCz: string[];
  complexity: 'O(n)' | 'O(n²)' | 'O(n³)';
  badgeStatus: 'ok' | 'no' | 'partial';
}

export interface ETTPCompatibilityResult {
  canParse: boolean;
  algorithm: 'ETTP (Scott & Johnstone 2025)';
  statesCount: number;
  table?: ETTPTable;
  reasonsEn: string[];
  reasonsCz: string[];
  badgeStatus: 'ok' | 'no' | 'partial';
}

export interface ParsersCompatibilityAssessment {
  all: ALLCompatibilityResult;
  earley: EarleyCompatibilityResult;
  ettp: ETTPCompatibilityResult;
}

/**
 * Checks Earley (1970) parser compatibility.
 * Earley parses ALL context-free grammars (worst-case O(n^3), unambiguous O(n^2), LR-like O(n)).
 */
export function checkEarleyCompatibility(
  grammar: Grammar,
  analysis: GrammarAnalysis
): EarleyCompatibilityResult {
  const isStartProductive = analysis.endable.has(grammar.startSymbol);
  if (!isStartProductive) {
    return {
      canParse: false,
      algorithm: 'Earley (1970)',
      reasonsEn: [`Start symbol '${grammar.startSymbol}' is non-generating (derives no finite terminal word). Language is empty.`],
      reasonsCz: [`Počáteční symbol '${grammar.startSymbol}' je nenormovaný (negeneruje žádné konečné terminální slovo). Jazyk je prázdný.`],
      complexity: 'O(n³)',
      badgeStatus: 'no'
    };
  }

  const isCyclic = analysis.cyclic.size > 0;
  const isLeftRec = analysis.leftRecursion.kinds.size > 0;

  const reasonsEn: string[] = [
    'General context-free parser (accepts arbitrary CFG, left/right recursion, ambiguity, and epsilon rules).'
  ];
  const reasonsCz: string[] = [
    'Obecný bezkontextový analyzátor (přijímá libovolnou CFG, levou i pravou rekurzi, nejednoznačnost i prázdná pravidla).'
  ];

  if (isCyclic) {
    reasonsEn.push(`Grammar contains derivation cycles (A ⇒⁺ A). Earley terminates correctly without infinite loops.`);
    reasonsCz.push(`Gramatika obsahuje cykly v derivacích (A ⇒⁺ A). Earleyův algoritmus korektně skončí bez zacyklení.`);
  }

  if (isLeftRec) {
    reasonsEn.push(`Grammar is left-recursive. Earley processes left recursion in-place without grammar modification.`);
    reasonsCz.push(`Gramatika je levě rekurzivní. Earley zpracovává levou rekurzi přímo bez nutnosti úprav gramatiky.`);
  }

  return {
    canParse: true,
    algorithm: 'Earley (1970)',
    reasonsEn,
    reasonsCz,
    complexity: 'O(n³)',
    badgeStatus: 'ok'
  };
}

/**
 * Checks ETTP (2025) table generator and runtime traversal capability.
 */
export function checkETTPCompatibility(
  grammar: Grammar,
  analysis: GrammarAnalysis
): ETTPCompatibilityResult {
  const isStartProductive = analysis.endable.has(grammar.startSymbol);
  if (!isStartProductive) {
    return {
      canParse: false,
      algorithm: 'ETTP (Scott & Johnstone 2025)',
      statesCount: 0,
      reasonsEn: [`Start symbol '${grammar.startSymbol}' is non-generating.`],
      reasonsCz: [`Počáteční symbol '${grammar.startSymbol}' je nenormovaný.`],
      badgeStatus: 'no'
    };
  }

  try {
    const table = buildETTPTable(grammar);
    return {
      canParse: true,
      algorithm: 'ETTP (Scott & Johnstone 2025)',
      statesCount: table.states.length,
      table,
      reasonsEn: [
        `Precomputed Earley Transition Table successfully built with ${table.states.length} states.`,
        'Eliminates runtime dynamic predictor rule lookups.'
      ],
      reasonsCz: [
        `Předpočítaná Earleyova přechodová tabulka úspěšně sestavena (${table.states.length} stavů).`,
        'Zcela eliminuje dynamické predikční operace za běhu.'
      ],
      badgeStatus: 'ok'
    };
  } catch (err) {
    return {
      canParse: false,
      algorithm: 'ETTP (Scott & Johnstone 2025)',
      statesCount: 0,
      reasonsEn: [`Table construction error: ${String(err)}`],
      reasonsCz: [`Chyba při sestavení tabulky: ${String(err)}`],
      badgeStatus: 'no'
    };
  }
}

/**
 * Assesses compatibility for ALL(*), Earley, and ETTP in a single call.
 */
export function assessParsersCompatibility(
  grammar: Grammar,
  analysis: GrammarAnalysis
): ParsersCompatibilityAssessment {
  return {
    all: checkALLCompatibility(grammar, analysis),
    earley: checkEarleyCompatibility(grammar, analysis),
    ettp: checkETTPCompatibility(grammar, analysis)
  };
}
