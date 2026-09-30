import React from 'react';
import { Grammar, formatProduction, formatRhs } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { Language, TRANSLATIONS } from '../../i18n/translations';

interface FirstFollowViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  lang: Language;
}

export const FirstFollowView: React.FC<FirstFollowViewProps> = ({
  grammar,
  analysis,
  lang
}) => {
  const t = TRANSLATIONS[lang];

  return (
    <div>
      {/* Non-Terminal FIRST & FOLLOW Table */}
      <div className="card">
        <div className="card-title">FIRST and FOLLOW Sets for Non-Terminals</div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Non-Terminal</th>
                <th style={{ width: '90px' }}>Nullable</th>
                <th>FIRST₁</th>
                <th>FOLLOW₁</th>
                <th>FIRST₂</th>
                <th>FOLLOW₂</th>
              </tr>
            </thead>
            <tbody>
              {[...grammar.nonTerminals].map(nt => {
                const isNullable = analysis.nullable.has(nt);
                const first1 = analysis.first1.get(nt) || new Set();
                const follow1 = analysis.follow1.get(nt) || new Set();
                const first2 = analysis.first2.get(nt) || new Set();
                const follow2 = analysis.follow2.get(nt) || new Set();

                return (
                  <tr key={nt}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                      {nt}
                    </td>
                    <td>
                      <span className={`badge ${isNullable ? 'badge-warning' : 'badge-primary'}`}>
                        {isNullable ? 'Yes (ε)' : 'No'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {`{ ${[...first1].join(', ') || '∅'} }`}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {`{ ${[...follow1].join(', ') || '∅'} }`}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: '11.5px' }}>
                      {`{ ${[...first2].slice(0, 8).join(', ')}${first2.size > 8 ? ' ...' : ''} }`}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: '11.5px' }}>
                      {`{ ${[...follow2].slice(0, 8).join(', ')}${follow2.size > 8 ? ' ...' : ''} }`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Predict / Director Sets */}
      <div className="card">
        <div className="card-title">Production Predict / Lookahead Sets (Director Sets)</div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
          Calculated as LOOKAHEAD₁(A &rarr; &alpha;) = FIRST₁(&alpha; &middot; FOLLOW₁(A)). These determine the LL(1) parsing table entries.
        </p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ width: '220px' }}>Production</th>
                <th>FIRST₁(RHS)</th>
                <th>LOOKAHEAD₁ (Director Set)</th>
              </tr>
            </thead>
            <tbody>
              {grammar.productions.map(p => {
                const lookaheads = analysis.predict1.get(p.id) || new Set();
                const rhsFirst = [...lookaheads];

                return (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ({p.id})
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--color-primary)' }}>{p.lhs}</span>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 6px' }}>&rarr;</span>
                      <span>{formatRhs(p.rhs)}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {p.rhs.length === 0 ? '{ ε }' : `{ ${p.rhs.slice(0, 1).join(', ')} }`}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)', fontWeight: 600 }}>
                      {`{ ${[...lookaheads].join(', ') || '∅'} }`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
