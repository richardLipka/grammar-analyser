/**
 * Academic Exporter: Generates compile-ready LaTeX for university exams,
 * problem sets, and lecture handouts.
 *
 * Conventions: grammar symbols are typeset in math mode, terminals in
 * \mathtt, non-terminals in \mathit, ε as \varepsilon and the end marker as \$.
 * Required packages: amsmath (align*), multirow (LR tables), forest (trees).
 */

import { Grammar, END_MARKER, EPSILON } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';
import { LLTable } from '../ll/llTable';
import { LRTable, formatAction } from '../lr/lrTable';
import { DerivationNode } from '../generator/wordGenerator';

/** Escapes a string for use inside \mathtt{...} / \mathit{...} / \text{...}. */
function escapeInner(str: string): string {
  return [...str].map(ch => {
    switch (ch) {
      case '\\': return '\\backslash{}';
      case '{': return '\\{';
      case '}': return '\\}';
      case '_': return '\\_';
      case '^': return '\\text{\\textasciicircum}';
      case '%': return '\\%';
      case '&': return '\\&';
      case '#': return '\\#';
      case '$': return '\\$';
      case '~': return '\\text{\\textasciitilde}';
      case "'": return '\\prime{}';
      default: return ch;
    }
  }).join('');
}

/** Typesets one grammar symbol in math mode. */
export function latexSymbol(sym: string, isTerminal: boolean): string {
  if (sym === EPSILON || sym === '') return '\\varepsilon';
  if (sym === END_MARKER) return '\\$';
  if (!isTerminal) {
    // Keep primes as real primes: E' -> E'
    const m = sym.match(/^(.*?)('*)$/);
    const base = m ? m[1] : sym;
    const primes = m ? m[2] : '';
    return `\\mathit{${escapeInner(base)}}${primes}`;
  }
  return `\\mathtt{${escapeInner(sym)}}`;
}

function latexRhs(rhs: string[], g: Pick<Grammar, 'nonTerminals'>): string {
  if (rhs.length === 0) return '\\varepsilon';
  return rhs.map(sym => latexSymbol(sym, !g.nonTerminals.has(sym))).join('\\,');
}

/** A k-lookahead string ("a b", "" = ε) in math mode. */
function latexLookahead(la: string): string {
  const parts = la.split(' ').filter(Boolean);
  if (parts.length === 0) return '\\varepsilon';
  return parts.map(p => latexSymbol(p, true)).join('\\,');
}

function latexSetOf(items: Iterable<string>): string {
  const arr = [...items];
  if (arr.length === 0) return '$\\emptyset$';
  return `$\\{${arr.map(latexLookahead).join(',\\ ')}\\}$`;
}

export function exportGrammarToLatex(g: Grammar): string {
  const order: string[] = [];
  const groups = new Map<string, string[][]>();
  for (const p of g.productions) {
    if (!groups.has(p.lhs)) {
      groups.set(p.lhs, []);
      order.push(p.lhs);
    }
    groups.get(p.lhs)!.push(p.rhs);
  }
  // Start symbol first
  order.sort((a, b) => (a === g.startSymbol ? -1 : b === g.startSymbol ? 1 : 0));

  const entries = order.map(lhs => {
    const alts = groups.get(lhs)!.map(rhs => latexRhs(rhs, g)).join(' \\mid ');
    return `  ${latexSymbol(lhs, false)} &\\to ${alts}`;
  });

  return [
    '% Grammar Definition (requires \\usepackage{amsmath})',
    '\\begin{align*}',
    entries.join(' \\\\\n'),
    '\\end{align*}'
  ].join('\n');
}

export function exportSetsToLatex(g: Grammar, analysis: GrammarAnalysis, lang: 'en' | 'cz' = 'en'): string {
  const isCz = lang === 'cz';
  const lines: string[] = [
    '% FIRST and FOLLOW Sets',
    '\\begin{table}[h]',
    '\\centering',
    '\\begin{tabular}{|c|c|l|l|}',
    '\\hline',
    `\\textbf{${isCz ? 'Symbol' : 'Symbol'}} & \\textbf{${isCz ? 'Generuje $\\varepsilon$' : 'Nullable'}} & $\\mathrm{FIRST}_1$ & $\\mathrm{FOLLOW}_1$ \\\\ \\hline`
  ];

  for (const nt of g.nonTerminals) {
    const isNullable = analysis.nullable.has(nt) ? (isCz ? 'Ano' : 'Yes') : (isCz ? 'Ne' : 'No');
    const firstSet = analysis.first1.get(nt) || new Set<string>();
    const followSet = analysis.follow1.get(nt) || new Set<string>();
    lines.push(`  $${latexSymbol(nt, false)}$ & ${isNullable} & ${latexSetOf(firstSet)} & ${latexSetOf(followSet)} \\\\ \\hline`);
  }

  lines.push('\\end{tabular}');
  lines.push(`\\caption{${isCz ? 'Množiny FIRST a FOLLOW pro gramatiku' : 'First and Follow Sets for Grammar'}}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

export function exportLLTableToLatex(llTable: LLTable, lang: 'en' | 'cz' = 'en', g?: Pick<Grammar, 'nonTerminals'>): string {
  const isCz = lang === 'cz';
  const nts = g ?? { nonTerminals: new Set(llTable.nonTerminals) };
  const cols = llTable.terminals;
  const colFormat = '|c|' + cols.map(() => 'c|').join('');

  const lines: string[] = [
    '% LL(1) Parsing Table',
    '\\begin{table}[h]',
    '\\centering',
    `\\begin{tabular}{${colFormat}}`,
    '\\hline',
    ` & ${cols.map(c => `$${latexSymbol(c, true)}$`).join(' & ')} \\\\ \\hline`
  ];

  for (const nt of llTable.nonTerminals) {
    const row = llTable.table1.get(nt);
    const cells = cols.map(c => {
      const prods = row?.get(c) || [];
      if (prods.length === 0) return '';
      return prods.map(p => `$${latexSymbol(p.lhs, false)} \\to ${latexRhs(p.rhs, nts)}$`).join(', ');
    });
    lines.push(`  $${latexSymbol(nt, false)}$ & ${cells.join(' & ')} \\\\ \\hline`);
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
    `% ${table.variant} Parsing Table (requires \\usepackage{multirow})`,
    '\\begin{table}[h]',
    '\\centering',
    `\\begin{tabular}{${colFormat}}`,
    '\\hline',
    `\\multirow{2}{*}{\\textbf{${isCz ? 'Stav' : 'State'}}} & \\multicolumn{${termCols.length}}{c||}{\\textbf{ACTION}} & \\multicolumn{${ntCols.length}}{c|}{\\textbf{GOTO}} \\\\ \\cline{2-${1 + termCols.length + ntCols.length}}`,
    ` & ${termCols.map(t => `$${latexSymbol(t, true)}$`).join(' & ')} & ${ntCols.map(nt => `$${latexSymbol(nt, false)}$`).join(' & ')} \\\\ \\hline`
  ];

  for (const s of table.states) {
    const actRow = table.actionTable.get(s);
    const gotoRow = table.gotoTable.get(s);
    const actCells = termCols.map(t => (actRow?.get(t) || []).map(formatAction).join('/'));
    const gotoCells = ntCols.map(nt => {
      const target = gotoRow?.get(nt);
      return target !== undefined ? target.toString() : '';
    });
    lines.push(`  ${s} & ${actCells.join(' & ')} & ${gotoCells.join(' & ')} \\\\ \\hline`);
  }

  lines.push('\\end{tabular}');
  lines.push(`\\caption{${isCz ? `Rozkladová tabulka ${table.variant}` : `${table.variant} Parsing Table`}}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

export function exportParseTreeToTikz(node: DerivationNode): string {
  // Node contents are braced so that ',' '=' '[' ']' in terminals cannot break forest's syntax.
  function nodeToForest(n: DerivationNode): string {
    const content = n.isForestRoot ? '{}, phantom' : `{$${latexSymbol(n.symbol, n.isTerminal)}$}`;
    if (!n.children || n.children.length === 0) {
      return `[${content}]`;
    }
    return `[${content} ${n.children.map(nodeToForest).join(' ')}]`;
  }

  return [
    '% Parse Tree in LaTeX (requires \\usepackage{forest})',
    '\\begin{forest}',
    `  ${nodeToForest(node)}`,
    '\\end{forest}'
  ].join('\n');
}
