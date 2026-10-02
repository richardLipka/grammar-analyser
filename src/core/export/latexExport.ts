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
import { LRTable, LRLayout, LR0_ACTION_COLUMN, formatLayoutAction } from '../lr/lrTable';
import { INITIAL_STATE_SYMBOL } from '../lr/lrAutomaton';
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

/** Unicode symbols that pdfLaTeX cannot take literally, as math commands. */
const MATH_SYMBOLS: Record<string, string> = {
  '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
  '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≡': '\\equiv', '≈': '\\approx', '·': '\\cdot', '×': '\\times', '÷': '\\div',
  '−': '-', '∗': '*', '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee', '∈': '\\in', '∉': '\\notin', '∪': '\\cup', '∩': '\\cap',
  '…': '\\ldots', '•': '\\bullet', '∅': '\\emptyset', '∞': '\\infty', '⊕': '\\oplus', '⊗': '\\otimes', '′': '\\prime',
  'λ': '\\lambda', 'ε': '\\varepsilon', 'ϵ': '\\epsilon', 'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
  'π': '\\pi', 'σ': '\\sigma', 'τ': '\\tau', 'φ': '\\varphi', 'ω': '\\omega', 'Σ': '\\Sigma', 'Δ': '\\Delta', 'Ω': '\\Omega'
};
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** Escapes a string for text mode (\text{\textit{…}}). */
function escapeText(str: string): string {
  return [...str].map(ch => {
    switch (ch) {
      case '\\': return '\\textbackslash{}';
      case '{': return '\\{';
      case '}': return '\\}';
      case '_': return '\\_';
      case '^': return '\\textasciicircum{}';
      case '~': return '\\textasciitilde{}';
      case '%': return '\\%';
      case '&': return '\\&';
      case '#': return '\\#';
      case '$': return '\\$';
      case '<': return '\\textless{}';
      case '>': return '\\textgreater{}';
      case '|': return '\\textbar{}';
      case '␣': return '\\textvisiblespace{}';
      default: {
        const sub = SUBSCRIPT_DIGITS.indexOf(ch);
        if (sub >= 0) return `\\textsubscript{${sub}}`;
        if (MATH_SYMBOLS[ch]) return `\\ensuremath{${MATH_SYMBOLS[ch]}}`;
        return ch;
      }
    }
  }).join('');
}

/** A run of the symbol in math mode: ASCII escaped inside \mathit/\mathtt, other characters as commands. */
function mathRun(str: string, font: 'mathit' | 'mathtt'): string {
  let out = '';
  let plain = '';
  const flush = () => {
    if (plain) out += `\\${font}{${escapeInner(plain)}}`;
    plain = '';
  };
  for (const ch of str) {
    if (ch.charCodeAt(0) < 128) {
      plain += ch;
      continue;
    }
    flush();
    if (MATH_SYMBOLS[ch]) out += `${MATH_SYMBOLS[ch]}{}`;
    else if (ch === '␣') out += '\\text{\\textvisiblespace}';
    else out += `\\text{${escapeText(ch)}}`;
  }
  flush();
  return out;
}

/**
 * Typesets one grammar symbol in math mode, so that pdfLaTeX compiles it:
 * trailing Unicode subscripts (B₂, a copied non-terminal) become B_{2}, primes
 * stay primes, arrows and Greek letters become commands, and a name with
 * accented letters (Výraz) is set in text mode.
 */
export function latexSymbol(sym: string, isTerminal: boolean): string {
  if (sym === EPSILON || sym === '') return '\\varepsilon';
  if (sym === END_MARKER) return '\\$';
  const font = isTerminal ? 'mathtt' : 'mathit';
  // E', B₂, X₁₀'': base, subscript digits and primes
  const m = sym.match(/^(.+?)([₀-₉]*)('*)$/u);
  const base = m ? m[1] : sym;
  const sub = m ? [...m[2]].map(c => SUBSCRIPT_DIGITS.indexOf(c)).join('') : '';
  const primes = m && !isTerminal ? m[3] : '';
  const body = m && isTerminal ? base + m[3] : base;
  // Accented letters need text mode (math fonts have no accents in pdfLaTeX)
  const typeset = /[^\x00-\x7F]/.test(body) && /\p{L}/u.test(body.replace(/[\x00-\x7F]/g, '')) && ![...body].every(c => c.charCodeAt(0) < 128 || MATH_SYMBOLS[c])
    ? `\\text{\\${isTerminal ? 'texttt' : 'textit'}{${escapeText(body)}}}`
    : mathRun(body, font);
  return `${typeset}${sub ? `_{${sub}}` : ''}${primes}`;
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

export function exportLRTableToLatex(table: LRTable, lang: 'en' | 'cz' = 'en', layout: LRLayout = 'lecture'): string {
  const isCz = lang === 'cz';
  const lecture = layout === 'lecture';
  const actCols = lecture ? table.fColumns : table.terminals;
  const trCols = lecture ? table.gColumns : table.nonTerminals;
  const actTable = lecture ? table.fTable : table.actionTable;
  const trTable = lecture ? table.gTable : table.gotoTable;
  const nonTerminals = new Set(table.nonTerminals);
  const colFormat = '|c|' + actCols.map(() => 'c|').join('') + '|' + trCols.map(() => 'c|').join('');
  // Lecture names E₁ become $E_{1}$; the Dragon Book layout numbers the states
  const stateCell = (s: number) => {
    if (!lecture) return s.toString();
    const n = table.stateNames[s];
    const base = n.symbol === INITIAL_STATE_SYMBOL && n.index === undefined ? '\\#' : latexSymbol(n.symbol, !nonTerminals.has(n.symbol));
    return `$${base}${n.index !== undefined ? `_{${n.index}}` : ''}$`;
  };
  const actionHeader = lecture ? (isCz ? 'Akce $f$' : 'Actions $f$') : 'ACTION';
  const transitionHeader = lecture ? (isCz ? 'Přechody $g$' : 'Transitions $g$') : 'GOTO';
  const colHeader = (c: string) => (c === LR0_ACTION_COLUMN ? (isCz ? 'akce' : 'action') : `$${latexSymbol(c, !nonTerminals.has(c))}$`);

  const lines: string[] = [
    `% ${table.variant} Parsing Table (requires \\usepackage{multirow})`,
    '\\begin{table}[h]',
    '\\centering',
    `\\begin{tabular}{${colFormat}}`,
    '\\hline',
    `\\multirow{2}{*}{\\textbf{${isCz ? 'Stav' : 'State'}}} & \\multicolumn{${actCols.length}}{c||}{\\textbf{${actionHeader}}} & \\multicolumn{${trCols.length}}{c|}{\\textbf{${transitionHeader}}} \\\\ \\cline{2-${1 + actCols.length + trCols.length}}`,
    ` & ${actCols.map(colHeader).join(' & ')} & ${trCols.map(colHeader).join(' & ')} \\\\ \\hline`
  ];

  for (const s of table.states) {
    const actRow = actTable.get(s);
    const trRow = trTable.get(s);
    const actCells = actCols.map(c => (actRow?.get(c) || []).map(a => formatLayoutAction(a, layout, lang)).join('/'));
    const trCells = trCols.map(x => {
      const target = trRow?.get(x);
      return target !== undefined ? stateCell(target) : '';
    });
    lines.push(`  ${stateCell(s)} & ${actCells.join(' & ')} & ${trCells.join(' & ')} \\\\ \\hline`);
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
