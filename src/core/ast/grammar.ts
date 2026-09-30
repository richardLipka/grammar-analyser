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

export function formatGrammarGrouped(g: Grammar): string {
  const groups = new Map<string, string[][]>();
  for (const p of g.productions) {
    if (!groups.has(p.lhs)) {
      groups.set(p.lhs, []);
    }
    groups.get(p.lhs)!.push(p.rhs);
  }

  const lines: string[] = [];
  for (const [lhs, rhsList] of groups.entries()) {
    const formattedAlts = rhsList.map(formatRhs).join(' | ');
    lines.push(`${lhs} -> ${formattedAlts}`);
  }
  return lines.join('\n');
}
