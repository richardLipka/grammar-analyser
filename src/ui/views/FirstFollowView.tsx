import React from 'react';
import { Grammar, EPSILON } from '../../core/ast/grammar';
import { GrammarAnalysis, first1OfString } from '../../core/analyser/grammarAnalyser';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText, formatLookaheadSet } from '../components/Symbols';
import { exportSetsToLatex } from '../../core/export/latexExport';

interface FirstFollowViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  lang: Language;
}

/** FIRST₁ sets list ε last, as in most textbooks. */
function fmtFirst1(set: Set<string>): string {
  const arr = [...set].filter(s => s !== EPSILON);
  if (set.has(EPSILON)) arr.push(EPSILON);
  return arr.length ? `{ ${arr.join(', ')} }` : '∅';
}

export const FirstFollowView: React.FC<FirstFollowViewProps> = ({ grammar, analysis, lang }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div>
      {/* Non-Terminal FIRST & FOLLOW Table */}
      <div className="card">
        <div className="card-title">
          <span>{t.firstFollowNtTitle}</span>
          <LatexExportButton getLatex={() => exportSetsToLatex(grammar, analysis, lang)} filename="first_follow_sets.tex" lang={lang} />
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>{t.firstFollowHint}</p>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>{t.colNonTerminal}</th>
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
                return (
                  <tr key={nt}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{nt}</td>
                    <td>
                      <span className={`badge ${isNullable ? 'badge-warning' : 'badge-primary'}`}>
                        {isNullable ? t.yesEps : t.no}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtFirst1(analysis.first1.get(nt) || new Set())}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{formatLookaheadSet(analysis.follow1.get(nt) || [])}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>{formatLookaheadSet(analysis.first2.get(nt) || [])}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>{formatLookaheadSet(analysis.follow2.get(nt) || [])}</td>
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
        <p className="hint-text" style={{ marginBottom: '12px' }}>{t.predictSetsDesc}</p>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '220px' }}>{t.colProduction}</th>
                <th>{t.colFirstRhs}</th>
                <th>{t.colLookahead}</th>
                <th>{t.colLookahead2}</th>
              </tr>
            </thead>
            <tbody>
              {grammar.productions.map(p => {
                const firstAlpha = first1OfString(p.rhs, analysis.first1, analysis.nullable);
                return (
                  <tr key={p.id}>
                    <td><ProductionText production={p} nonTerminals={grammar.nonTerminals} showId /></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtFirst1(firstAlpha)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)', fontWeight: 700 }}>
                      {formatLookaheadSet(analysis.predict1.get(p.id) || [])}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
                      {formatLookaheadSet(analysis.predict2.get(p.id) || [])}
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
