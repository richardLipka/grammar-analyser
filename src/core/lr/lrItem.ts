/**
 * LR(0) and LR(1) Item definitions and core operations
 */

import { Production, EPSILON, END_MARKER } from '../ast/grammar';

export interface LR0Item {
  production: Production;
  dotIndex: number; // 0 <= dotIndex <= rhs.length
}

export interface LR1Item {
  production: Production;
  dotIndex: number;
  lookahead: string; // terminal or $
}

export function formatLR0Item(item: LR0Item): string {
  const rhs = [...item.production.rhs];
  const before = rhs.slice(0, item.dotIndex).join(' ');
  const after = rhs.slice(item.dotIndex).join(' ');
  const rhsStr = [before, '•', after].filter(s => s.length > 0).join(' ');
  return `${item.production.lhs} -> ${rhsStr || '•'}`;
}

export function formatLR1Item(item: LR1Item): string {
  return `[${formatLR0Item(item)}, ${item.lookahead}]`;
}

export function lr0ItemKey(item: LR0Item): string {
  return `${item.production.id}@${item.dotIndex}`;
}

export function lr1ItemKey(item: LR1Item): string {
  return `${item.production.id}@${item.dotIndex},${item.lookahead}`;
}

export function nextSymbolAfterDot(item: LR0Item): string | null {
  if (item.dotIndex < item.production.rhs.length) {
    return item.production.rhs[item.dotIndex];
  }
  return null;
}
