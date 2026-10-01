/**
 * Formal Grammar Core AST & Representation
 */

export const EPSILON = 'ε';
export const END_MARKER = '$';

export interface Production {
  id: number;
  lhs: string;
  rhs: string[]; // empty array represents EPSILON
}

export interface Grammar {
  nonTerminals: Set<string>;
  terminals: Set<string>;
  startSymbol: string;
  productions: Production[];
}

export function formatRhs(rhs: string[]): string {
  if (rhs.length === 0) return EPSILON;
  return rhs.join(' ');
}

export function formatProduction(p: Production): string {
  return `${p.lhs} -> ${formatRhs(p.rhs)}`;
}

export function cloneGrammar(g: Grammar): Grammar {
  return {
    nonTerminals: new Set(g.nonTerminals),
    terminals: new Set(g.terminals),
    startSymbol: g.startSymbol,
    productions: g.productions.map(p => ({
      id: p.id,
      lhs: p.lhs,
      rhs: [...p.rhs]
    }))
  };
}

/**
 * Left-hand sides in display order: the start symbol first, then the order of
 * first appearance in the production list.
 */
function lhsOrder(g: Grammar): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  if (g.startSymbol && g.productions.some(p => p.lhs === g.startSymbol)) {
    order.push(g.startSymbol);
    seen.add(g.startSymbol);
  }
  for (const p of g.productions) {
    if (!seen.has(p.lhs)) {
      seen.add(p.lhs);
      order.push(p.lhs);
    }
  }
  return order;
}

export function formatGrammarGrouped(g: Grammar): string {
  const lines: string[] = [];
  for (const lhs of lhsOrder(g)) {
    const alts = g.productions.filter(p => p.lhs === lhs).map(p => formatRhs(p.rhs));
    lines.push(`${lhs} -> ${alts.join(' | ')}`);
  }
  return lines.join('\n');
}

const IDENTIFIER_RE = /^[\p{L}_][\p{L}\p{N}_]*'*$/u;
const RESERVED_BARE = new Set(['epsilon', 'eps', 'EPS', 'EPSILON', 'Epsilon', 'ε', 'λ', 'lambda']);

/** True when the symbol can be written in the editor without quotes or brackets. */
export function isPlainIdentifier(sym: string): boolean {
  return IDENTIFIER_RE.test(sym) && !/[ελ]/.test(sym) && !RESERVED_BARE.has(sym);
}

function quoteTerminal(sym: string): string {
  return sym.includes('"') ? `'${sym}'` : `"${sym}"`;
}

function editorNonTerminal(sym: string, hasRules = true): string {
  // A non-terminal without rules is bracketed, otherwise it would be read as a terminal
  return isPlainIdentifier(sym) && hasRules ? sym : `<${sym}>`;
}

// Terminals that read back as themselves without quotes: lower-case words and
// digits (not e and the ε keywords, which mean the empty word) and single
// characters that have no meaning in the textbook notation.
const BARE_TERMINAL_RE = /^[\p{Ll}\p{N}_][\p{Ll}\p{N}_]*$/u;
const BARE_PUNCTUATION = new Set(['+', '-', '*', '/', '(', ')', '[', ']', '{', '}', ',', '^', '!', '?', '&', '=', '~', '@', ':']);

function isBareTerminal(sym: string): boolean {
  return (BARE_TERMINAL_RE.test(sym) && sym !== 'e' && !RESERVED_BARE.has(sym)) || BARE_PUNCTUATION.has(sym);
}

/** Lower-case and digit subscripts, as in the names of LR states (E₁) and copied non-terminals (B₂). */
export function toSubscript(n: number): string {
  return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
}

/**
 * Formats a grammar so that parsing the text again yields the same grammar.
 * 'plain' (default) writes S → a A S | b: terminals without quotes where that
 * is unambiguous, quoted otherwise ("e", ":=", "A"). 'quoted' quotes every
 * terminal. Non-terminals that are not plain identifiers get angle brackets.
 */
export function formatGrammarForEditor(g: Grammar, style: 'plain' | 'quoted' = 'plain'): string {
  const withRules = new Set(g.productions.map(p => p.lhs));
  const fmtSym = (s: string) => g.nonTerminals.has(s)
    ? editorNonTerminal(s, withRules.has(s))
    : style === 'plain' && isBareTerminal(s) ? s : quoteTerminal(s);
  const lines: string[] = [];
  for (const lhs of lhsOrder(g)) {
    const alts = g.productions
      .filter(p => p.lhs === lhs)
      .map(p => (p.rhs.length === 0 ? EPSILON : p.rhs.map(fmtSym).join(' ')));
    lines.push(`${editorNonTerminal(lhs)} ${style === 'plain' ? '→' : '->'} ${alts.join(' | ')}`);
  }
  return lines.join('\n');
}

/**
 * Returns a non-terminal name based on `base` that clashes with no existing
 * terminal or non-terminal (base, base', base'', ..., then base_1, base_2, ...).
 */
export function freshNonTerminal(base: string, g: Grammar): string {
  return freshName(base, s => g.nonTerminals.has(s) || g.terminals.has(s));
}

/** Same naming scheme as freshNonTerminal for an arbitrary "is taken" predicate. */
export function freshName(base: string, taken: (s: string) => boolean): string {
  if (!taken(base)) return base;
  let primed = `${base}'`;
  for (let i = 0; i < 4 && taken(primed); i++) primed = `${primed}'`;
  if (!taken(primed)) return primed;
  let counter = 1;
  while (taken(`${base}_${counter}`)) counter++;
  return `${base}_${counter}`;
}

/**
 * Recomputes the symbol sets after productions were added or removed:
 * terminals are exactly the right-hand side symbols that are not
 * non-terminals; non-terminals are kept when they still occur somewhere
 * (or are the start symbol). Productions are renumbered 1..n.
 */
export function normalizeGrammar(g: Grammar): Grammar {
  const used = new Set<string>([g.startSymbol]);
  for (const p of g.productions) {
    used.add(p.lhs);
    for (const s of p.rhs) used.add(s);
  }
  const nonTerminals = new Set([...g.nonTerminals].filter(nt => used.has(nt)));
  for (const p of g.productions) nonTerminals.add(p.lhs);
  const terminals = new Set<string>();
  for (const p of g.productions) {
    for (const s of p.rhs) {
      if (!nonTerminals.has(s)) terminals.add(s);
    }
  }
  return {
    nonTerminals,
    terminals,
    startSymbol: g.startSymbol,
    productions: g.productions.map((p, idx) => ({ id: idx + 1, lhs: p.lhs, rhs: [...p.rhs] }))
  };
}

/** Removes duplicate productions (same LHS and RHS), keeping the first one. */
export function dedupeProductions(productions: Production[]): Production[] {
  const seen = new Set<string>();
  const result: Production[] = [];
  for (const p of productions) {
    const key = `${p.lhs}\u0000${p.rhs.join('\u0000')}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}
