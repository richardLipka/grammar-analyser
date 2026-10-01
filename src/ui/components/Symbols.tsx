import React from 'react';
import { Production, EPSILON, END_MARKER } from '../../core/ast/grammar';

interface SymbolSeqProps {
  symbols: string[];
  nonTerminals: Set<string>;
  /** Index of a symbol to emphasise (e.g. the non-terminal rewritten next). */
  highlightIndex?: number;
  highlightClass?: string;
  /** Range [from, to) of symbols to mark as freshly produced. */
  newRange?: [number, number];
}

/** A sentential form with non-terminals, terminals and ε coloured consistently. */
export const SymbolSeq: React.FC<SymbolSeqProps> = ({
  symbols,
  nonTerminals,
  highlightIndex,
  highlightClass = 'deriv-next-nt',
  newRange
}) => {
  if (symbols.length === 0) return <span className="sym-eps">{EPSILON}</span>;
  return (
    <>
      {symbols.map((s, i) => {
        const cls = [
          s === EPSILON ? 'sym-eps' : s === END_MARKER ? '' : nonTerminals.has(s) ? 'sym-nt' : 'sym-t',
          i === highlightIndex ? highlightClass : '',
          newRange && i >= newRange[0] && i < newRange[1] ? 'deriv-new-symbols' : ''
        ].filter(Boolean).join(' ');
        return (
          <React.Fragment key={i}>
            {i > 0 && ' '}
            <span className={cls}>{s}</span>
          </React.Fragment>
        );
      })}
    </>
  );
};

/** A production "A → α" with coloured symbols. */
export const ProductionText: React.FC<{ production: Production; nonTerminals: Set<string>; showId?: boolean }> = ({
  production,
  nonTerminals,
  showId
}) => (
  <span style={{ fontFamily: 'var(--font-mono)' }}>
    {showId && <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>({production.id})</span>}
    <span className="sym-nt">{production.lhs}</span>
    <span className="sym-arrow">→</span>
    <SymbolSeq symbols={production.rhs} nonTerminals={nonTerminals} />
  </span>
);

/** Formats a set of k-lookahead strings ('' = ε). */
export function formatLookaheadSet(items: Iterable<string>): string {
  const arr = [...items].map(s => (s === '' ? EPSILON : s));
  return arr.length === 0 ? '∅' : `{ ${arr.join(', ')} }`;
}
