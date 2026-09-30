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

export interface GroupedLR1Item {
  production: Production;
  dotIndex: number;
  lookaheads: string[];
}

/**
 * Groups LR(1) items sharing the same LR(0) core with merged lookaheads
 */
export function groupLR1Items(items: LR1Item[]): GroupedLR1Item[] {
  const map = new Map<string, { production: Production; dotIndex: number; lookaheads: Set<string> }>();
  for (const it of items) {
    const key = lr0ItemKey(it);
    if (!map.has(key)) {
      map.set(key, { production: it.production, dotIndex: it.dotIndex, lookaheads: new Set() });
    }
    map.get(key)!.lookaheads.add(it.lookahead);
  }
  return Array.from(map.values()).map(g => ({
    production: g.production,
    dotIndex: g.dotIndex,
    lookaheads: Array.from(g.lookaheads).sort()
  }));
}

export function formatGroupedLR1Item(item: GroupedLR1Item): string {
  const lr0 = formatLR0Item({ production: item.production, dotIndex: item.dotIndex });
  const las = item.lookaheads.join(' / ');
  return `[${lr0}, ${las}]`;
}

