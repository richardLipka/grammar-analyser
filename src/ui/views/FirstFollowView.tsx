import React from 'react';
import { Grammar, formatProduction, formatRhs } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportSetsToLatex } from '../../core/export/latexExport';

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
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t.firstFollowNtTitle}</span>
          <LatexExportButton
            getLatex={() => exportSetsToLatex(grammar, analysis, lang)}
            filename="first_follow_sets.tex"
            lang={lang}
          />
        </div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>{t.colNonTerminal}</th>
                <th style={{ width: '90px' }}>{t.colNullable}</th>
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
                        {isNullable ? t.yesEps : t.no}
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
        <div className="card-title">{t.predictSetsTitle}</div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
          {t.predictSetsDesc}
        </p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th style={{ width: '220px' }}>{t.colProduction}</th>
                <th>{t.colFirstRhs}</th>
                <th>{t.colLookahead}</th>
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
