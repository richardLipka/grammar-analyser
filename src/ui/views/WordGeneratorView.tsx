import React, { useState, useEffect } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { generateWords, DerivationTrace } from '../../core/generator/wordGenerator';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Sparkles, RefreshCw, GitBranch } from 'lucide-react';

interface WordGeneratorViewProps {
  grammar: Grammar;
  lang: Language;
}

export const WordGeneratorView: React.FC<WordGeneratorViewProps> = ({ grammar, lang }) => {
  const t = TRANSLATIONS[lang];
  const [traces, setTraces] = useState<DerivationTrace[]>([]);
  const [selectedWordIdx, setSelectedWordIdx] = useState(0);

  useEffect(() => {
    refreshWords();
  }, [grammar]);

  const refreshWords = () => {
    const generated = generateWords(grammar, 6, 12);
    setTraces(generated);
    setSelectedWordIdx(0);
  };

  const activeTrace: DerivationTrace | undefined = traces[selectedWordIdx];

  return (
    <div>
      {/* Header & Regenerate action */}
      <div className="card">
        <div className="card-title">
          <span>{t.tabWords}</span>
          <button className="btn btn-primary" onClick={refreshWords}>
            <RefreshCw size={14} />
            {t.generateNewExamples}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          {t.wordsDesc}
        </p>
      </div>

      {traces.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>
          {t.noWordsGenerated}
        </div>
      ) : (
        <>
          {/* Word Selector Chips */}
          <div className="card">
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
              {t.wordsInLanguage}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {traces.map((trace, idx) => (
                <button
                  key={idx}
                  className={`btn ${selectedWordIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  onClick={() => setSelectedWordIdx(idx)}
                >
                  {trace.word || 'ε'}
                </button>
              ))}
            </div>
          </div>

          {/* Derivation Steps & Tree for Active Word */}
          {activeTrace && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1fr', gap: '16px' }}>
              {/* Derivation Steps Column */}
              <div className="card">
                <div className="card-title">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GitBranch size={16} color="var(--color-primary)" />
                    <span>{t.leftmostSequence}</span>
                  </div>
                  <span className="badge badge-success">{t.derivationStepsCount.replace('{count}', (activeTrace.steps.length - 1).toString())}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                  {activeTrace.steps.map((st, sIdx) => (
                    <div
                      key={sIdx}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-bg-base)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12.5px',
                        borderLeft: sIdx === 0 ? '3px solid var(--color-primary)' : sIdx === activeTrace.steps.length - 1 ? '3px solid var(--color-success)' : '1px solid var(--color-border)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '11px' }}>
                        <span>{t.stepPrefix} {sIdx}</span>
                        {st.appliedRule && (
                          <span style={{ color: 'var(--color-primary)' }}>
                            {t.byRule} {formatProduction(st.appliedRule)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-text-primary)' }}>
                        {st.sententialForm.join(' ') || 'ε'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Derivation Tree Column */}
              <div className="card">
                <div className="card-title">
                  <span>{t.derivationTree}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-primary)' }}>
                    "{activeTrace.word}"
                  </span>
                </div>
                <DerivationTreeVisualizer rootNode={activeTrace.tree} height="420px" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
