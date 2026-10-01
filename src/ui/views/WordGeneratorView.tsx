import React, { useState, useEffect } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { generateWords, DerivationTrace } from '../../core/generator/wordGenerator';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { RefreshCw, GitBranch } from 'lucide-react';
import { ProductionText, SymbolSeq } from '../components/Symbols';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { LatexExportButton } from '../components/LatexExportButton';

interface WordGeneratorViewProps {
  grammar: Grammar;
  lang: Language;
}

export const WordGeneratorView: React.FC<WordGeneratorViewProps> = ({ grammar, lang }) => {
  const t = TRANSLATIONS[lang];
  const [traces, setTraces] = useState<DerivationTrace[]>([]);
  const [selectedWordIdx, setSelectedWordIdx] = useState(0);

  const refreshWords = () => {
    setTraces(generateWords(grammar, 8, 12));
    setSelectedWordIdx(0);
  };

  useEffect(() => {
    refreshWords();
  }, [grammar]);

  const activeTrace: DerivationTrace | undefined = traces[selectedWordIdx];

  return (
    <div>
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span>{t.tabWords}</span>
          <button className="btn btn-primary" onClick={refreshWords}>
            <RefreshCw size={14} />
            {t.generateNewExamples}
          </button>
        </div>
        <p className="hint-text">{t.wordsDesc}</p>
      </div>

      {traces.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>
          {t.noWordsGenerated}
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>{t.wordsInLanguage}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {traces.map((trace, idx) => (
                <button
                  key={idx}
                  className={`btn ${selectedWordIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-pressed={selectedWordIdx === idx}
                  onClick={() => setSelectedWordIdx(idx)}
                >
                  {trace.word || 'ε'}
                </button>
              ))}
            </div>
          </div>

          {activeTrace && (
            <div className="two-column-grid">
              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GitBranch size={16} color="var(--color-primary)" />
                    <span>{t.leftmostSequence}</span>
                  </div>
                  <span className="badge badge-success">{t.derivationStepsCount.replace('{count}', (activeTrace.steps.length - 1).toString())}</span>
                </div>
                <p className="hint-text" style={{ marginBottom: '8px', fontSize: '11.5px' }}>{t.derivationHint}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '440px', overflowY: 'auto' }}>
                  {activeTrace.steps.map((st, sIdx) => {
                    const next = activeTrace.steps[sIdx + 1];
                    const newRange: [number, number] | undefined =
                      st.appliedRule && st.replacedIndex !== undefined && st.appliedRule.rhs.length > 0
                        ? [st.replacedIndex, st.replacedIndex + st.appliedRule.rhs.length]
                        : undefined;
                    return (
                      <div
                        key={sIdx}
                        style={{
                          padding: '7px 12px',
                          backgroundColor: 'var(--color-bg-base)',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                          borderLeft: sIdx === 0 ? '3px solid var(--color-primary)' : sIdx === activeTrace.steps.length - 1 ? '3px solid var(--color-success)' : '3px solid var(--color-border)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', color: 'var(--color-text-muted)', fontSize: '11px' }}>
                          <span>{sIdx === 0 ? t.startForm : `${t.stepPrefix} ${sIdx} ⇒`}</span>
                          {st.appliedRule && (
                            <span>
                              {t.byRule} <ProductionText production={st.appliedRule} nonTerminals={grammar.nonTerminals} showId />
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <SymbolSeq
                            symbols={st.sententialForm}
                            nonTerminals={grammar.nonTerminals}
                            highlightIndex={next?.replacedIndex}
                            newRange={newRange}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span>{t.derivationTree}</span>
                  <LatexExportButton
                    getLatex={() => exportParseTreeToTikz(activeTrace.tree)}
                    filename="derivation_tree.tex"
                    label="LaTeX (forest)"
                    lang={lang}
                  />
                </div>
                <DerivationTreeVisualizer rootNode={activeTrace.tree} height="440px" filename="derivation_tree" lang={lang} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
