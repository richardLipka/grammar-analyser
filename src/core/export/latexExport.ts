/**
 * Academic Exporter: Generates compile-ready LaTeX for university exams,
 * problem sets, and lecture handouts.
 */

import { Grammar, Production, formatProduction, formatRhs, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { LLTable } from '../ll/llTable';
import { LRTable, formatAction } from '../lr/lrTable';
import { DerivationNode } from '../generator/wordGenerator';

export function exportGrammarToLatex(g: Grammar): string {
  const lines: string[] = [
    '% Grammar Definition',
    '\\begin{align*}'
  ];

  // Group by LHS
  const groups = new Map<string, string[][]>();
  for (const p of g.productions) {
    if (!groups.has(p.lhs)) groups.set(p.lhs, []);
    groups.get(p.lhs)!.push(p.rhs);
  }

  const entries: string[] = [];
  for (const [lhs, alts] of groups.entries()) {
    const formattedAlts = alts.map(rhs => {
      if (rhs.length === 0) return '\\varepsilon';
      return rhs.map(sym => escapeLatex(sym)).join(' \\; ');
    }).join(' \\;\\mid\\; ');

    entries.push(`  ${escapeLatex(lhs)} &\\to ${formattedAlts}`);
  }

  lines.push(entries.join(' \\\\\n'));
  lines.push('\\end{align*}');
  return lines.join('\n');
}

export function exportSetsToLatex(g: Grammar, analysis: GrammarAnalysis, lang: 'en' | 'cz' = 'en'): string {
  const isCz = lang === 'cz';
  const lines: string[] = [
    '% FIRST and FOLLOW Sets',
    '\\begin{table}[h]',
    '\\centering',
    '\\begin{tabular}{|c|c|l|l|}',
    '\\hline',
    `\\textbf{Symbol} & \\textbf{${isCz ? 'Nulovatelný' : 'Nullable'}} & \\textbf{FIRST} & \\textbf{FOLLOW} \\\\ \\hline`
  ];

  for (const nt of g.nonTerminals) {
    const isNullable = analysis.nullable.has(nt) ? (isCz ? 'Ano' : 'Yes') : (isCz ? 'Ne' : 'No');
    const firstSet = analysis.first1.get(nt) || new Set();
    const followSet = analysis.follow1.get(nt) || new Set();

    const firstStr = `\\{ ${[...firstSet].map(escapeLatex).join(', ')} \\}`;
    const followStr = `\\{ ${[...followSet].map(escapeLatex).join(', ')} \\}`;

    lines.push(`  ${escapeLatex(nt)} & ${isNullable} & ${firstStr} & ${followStr} \\\\ \\hline`);
  }

  lines.push('\\end{tabular}');
  lines.push(`\\caption{${isCz ? 'Množiny FIRST a FOLLOW pro gramatiku' : 'First and Follow Sets for Grammar'}}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

export function exportLLTableToLatex(llTable: LLTable, lang: 'en' | 'cz' = 'en'): string {
  const isCz = lang === 'cz';
  const cols = llTable.terminals;
  const colFormat = '|c|' + cols.map(() => 'c|').join('');

  const lines: string[] = [
    '% LL(1) Parsing Table',
    '\\begin{table}[h]',
    '\\centering',
    `\\begin{tabular}{${colFormat}}`,
    '\\hline',
    `\\textbf{NT} & ${cols.map(c => `\\textbf{${escapeLatex(c)}}`).join(' & ')} \\\\ \\hline`
  ];

  for (const nt of llTable.nonTerminals) {
    const row = llTable.table1.get(nt);
    const cells = cols.map(c => {
      const prods = row?.get(c) || [];
      if (prods.length === 0) return '';
      return prods.map(p => `$${p.lhs} \\to ${p.rhs.length === 0 ? '\\varepsilon' : p.rhs.map(escapeLatex).join(' ')}$`).join(', ');
    });

    lines.push(`  \\textbf{${escapeLatex(nt)}} & ${cells.join(' & ')} \\\\ \\hline`);
  }

  lines.push('\\end{tabular}');
  lines.push(`\\caption{${isCz ? 'Rozkladová tabulka LL(1)' : 'LL(1) Parse Table'}}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

export function exportLRTableToLatex(table: LRTable, lang: 'en' | 'cz' = 'en'): string {
  const isCz = lang === 'cz';
  const termCols = table.terminals;
  const ntCols = table.nonTerminals;
  const colFormat = '|c|' + termCols.map(() => 'c|').join('') + '|' + ntCols.map(() => 'c|').join('');

  const lines: string[] = [
    `% ${table.variant} Parsing Table`,
    '\\begin{table}[h]',
    '\\centering',
    `\\begin{tabular}{${colFormat}}`,
    '\\hline',
    `\\multirow{2}{*}{\\textbf{${isCz ? 'Stav' : 'State'}}} & \\multicolumn{${termCols.length}}{|c|}{\\textbf{ACTION}} & \\multicolumn{${ntCols.length}}{|c|}{\\textbf{GOTO}} \\\\ \\cline{2-${1 + termCols.length + ntCols.length}}`,
    ` & ${termCols.map(t => `\\textbf{${escapeLatex(t)}}`).join(' & ')} & ${ntCols.map(nt => `\\textbf{${escapeLatex(nt)}}`).join(' & ')} \\\\ \\hline`
  ];

  for (const s of table.states) {
    const actRow = table.actionTable.get(s);
    const gotoRow = table.gotoTable.get(s);

    const actCells = termCols.map(t => {
      const actions = actRow?.get(t) || [];
      return actions.map(formatAction).join('/');
    });

    const gotoCells = ntCols.map(nt => {
      const target = gotoRow?.get(nt);
      return target !== undefined ? target.toString() : '';
    });

    lines.push(`  \\textbf{${s}} & ${actCells.join(' & ')} & ${gotoCells.join(' & ')} \\\\ \\hline`);
  }

  lines.push('\\end{tabular}');
  lines.push(`\\caption{${isCz ? `Rozkladová tabulka ${table.variant}` : `${table.variant} Parsing Table`}}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

export function exportParseTreeToTikz(node: DerivationNode): string {
  function nodeToTikz(n: DerivationNode): string {
    const escaped = escapeLatex(n.symbol);
    if (!n.children || n.children.length === 0) {
      return `[${escaped}]`;
    }
    const childrenStr = n.children.map(nodeToTikz).join(' ');
    return `[${escaped} ${childrenStr}]`;
  }

  return [
    '% Parse Tree in LaTeX (Requires \\usepackage{forest})',
    '\\begin{forest}',
    `  ${nodeToTikz(node)}`,
    '\\end{forest}'
  ].join('\n');
}

function escapeLatex(str: string): string {
  if (str === 'ε' || str === 'eps') return '\\varepsilon';
  if (str === '$') return '\\$';
  return str
    .replace(/\\/g, '\\textbackslash ')
    .replace(/_/g, '\\_')
    .replace(/\^/g, '\\textasciicircum ')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#');
}
