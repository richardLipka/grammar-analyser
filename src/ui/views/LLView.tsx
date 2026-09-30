import React, { useState, useEffect } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LLTable } from '../../core/ll/llTable';
import { simulateLLParse, LLParseStep, LLSimulationResult } from '../../core/ll/llParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw,
  CheckCircle2, AlertTriangle, Layers
} from 'lucide-react';

interface LLViewProps {
  grammar: Grammar;
  llTable: LLTable;
  defaultInput?: string;
  lang: Language;
}

export const LLView: React.FC<LLViewProps> = ({
  grammar,
  llTable,
  defaultInput = 'id + id * id',
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [inputText, setInputText] = useState(defaultInput);
  const [simulation, setSimulation] = useState<LLSimulationResult | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600); // ms per step

  // Run simulation whenever input or grammar changes
  useEffect(() => {
    runParse();
  }, [inputText, grammar, llTable]);

  const runParse = () => {
    const tokens = inputText.trim().split(/\s+/).filter(Boolean);
    const result = simulateLLParse(tokens, grammar, llTable);
    setSimulation(result);
    setCurrentStepIdx(0);
    setIsPlaying(false);
  };

  // Auto-play timer
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPlaying && simulation && currentStepIdx < simulation.steps.length - 1) {
      timer = setTimeout(() => {
        setCurrentStepIdx(prev => prev + 1);
      }, playSpeed);
    } else if (isPlaying && simulation && currentStepIdx >= simulation.steps.length - 1) {
      setIsPlaying(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIdx, simulation, playSpeed]);

  const currentStep: LLParseStep | undefined = simulation?.steps[currentStepIdx];

  return (
    <div>
      {/* LL(1) Parsing Table with Embedded Collisions */}
      <div className="card">
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.llTableTitle}</span>
            <Layers size={18} color="var(--color-primary)" />
          </div>

          <div>
            {llTable.isLL1 ? (
              <span className="badge badge-success"><CheckCircle2 size={12} /> {t.ll1Valid}</span>
            ) : llTable.isLL2 ? (
              <span className="badge badge-warning"><CheckCircle2 size={12} /> {t.ll2Valid}</span>
            ) : (
              <span className="badge badge-danger"><AlertTriangle size={12} /> {t.notLL}</span>
            )}
          </div>
        </div>

        {/* Embedded LL Collisions Directly Above Table */}
        {llTable.conflicts.length > 0 ? (
          <div style={{
            backgroundColor: 'var(--color-danger-subtle)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} />
                <span>{llTable.conflicts.length} {t.llConflictsDetected}</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {lang === 'cz' ? 'Níže zvýrazněné kolizní buňky v rozkladové tabulce' : 'Conflicting cells highlighted in red in the table below'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {llTable.conflicts.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    borderLeft: '3px solid var(--color-danger)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                      {c.conflictType === 'First/First' ? t.firstFirstConflict : t.firstFollowConflict}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                      {t.forNonTerminal} <strong style={{ color: 'var(--color-primary)' }}>{c.nonTerminal}</strong>, {t.withLookahead} <strong style={{ color: 'var(--color-text-primary)' }}>'{c.lookahead}'</strong>
                    </span>
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{t.conflictingRules}:</span>
                    {c.productions.map(p => (
                      <span
                        key={p.id}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: 'var(--color-bg-base)',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          border: '1px solid var(--color-border)'
                        }}
                      >
                        ({p.id}) {formatProduction(p)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'var(--color-success-subtle)',
            border: '1px solid var(--color-success)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--color-success)'
          }}>
            <CheckCircle2 size={15} />
            <span>{t.noLLConflicts}</span>
          </div>
        )}

        {/* Active Table Lookup Banner */}
        {currentStep?.lookupNt && currentStep?.lookupTerminal && (
          <div className="active-lookup-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{t.activeTableLookup}</span>
              <span>{t.activeLineRow}: <span className="active-lookup-badge">{currentStep.lookupNt}</span></span>
              <span>×</span>
              <span>{t.activeColumn}: <span className="active-lookup-badge">{currentStep.lookupTerminal}</span></span>
            </div>
            {currentStep.production && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', fontWeight: 700, color: 'var(--color-primary)' }}>
                ➔ {formatProduction(currentStep.production)}
              </div>
            )}
          </div>
        )}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>{t.colNonTerminal}</th>
                {llTable.terminals.map(term => {
                  const isColActive = currentStep?.lookupTerminal === term;
                  return (
                    <th
                      key={term}
                      className={isColActive ? 'table-col-active' : ''}
                      style={{ textAlign: 'center' }}
                    >
                      <code>{term}</code>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {llTable.nonTerminals.map(nt => {
                const isRowActive = currentStep?.lookupNt === nt;

                return (
                  <tr key={nt} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                      {nt}
                    </td>
                    {llTable.terminals.map(term => {
                      const prods = llTable.table1.get(nt)?.get(term) || [];
                      const isConflict = prods.length > 1;
                      const isCellActive = isRowActive && currentStep?.lookupTerminal === term;

                      return (
                        <td
                          key={term}
                          className={isCellActive ? 'table-cell-active' : ''}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            backgroundColor: isCellActive ? undefined : isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isCellActive ? '#ffffff' : isConflict ? 'var(--color-danger)' : undefined,
                            fontWeight: isCellActive || isConflict ? 700 : 400
                          }}
                        >
                          {prods.map(p => formatProduction(p)).join('\n')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Top-Down Simulator */}
      <div className="card">
        <div className="card-title">
          <span>{t.parsingSimulator} (Top-Down LL)</span>
          <Layers size={18} color="var(--color-primary)" />
        </div>

        {/* Input word controls */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input
            type="text"
            className="grammar-textarea"
            style={{ minHeight: 'unset', height: '38px', padding: '6px 12px' }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.tokensPlaceholder}
          />
          <button className="btn btn-primary" onClick={runParse}>
            {t.runSimulation}
          </button>
        </div>

        {/* Simulator VCR Controls */}
        <div className="simulator-controls">
          <button
            className="btn btn-secondary"
            onClick={() => { setIsPlaying(false); setCurrentStepIdx(0); }}
            title={t.reset}
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setIsPlaying(false); setCurrentStepIdx(prev => Math.max(0, prev - 1)); }}
            disabled={currentStepIdx === 0}
            title={t.stepBackward}
          >
            <SkipBack size={15} />
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsPlaying(p => !p)}
            title={isPlaying ? t.pause : t.play}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStepIdx(prev => Math.min((simulation?.steps.length || 1) - 1, prev + 1));
            }}
            disabled={!simulation || currentStepIdx >= simulation.steps.length - 1}
            title={t.stepForward}
          >
            <SkipForward size={15} />
          </button>

          <span style={{ fontSize: '12px', fontWeight: 600, margin: '0 8px', color: 'var(--color-text-secondary)' }}>
            {t.stepCountLabel.replace('{current}', (currentStepIdx + 1).toString()).replace('{total}', (simulation?.steps.length || 0).toString())}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t.speed}</span>
            <input
              type="range"
              min="150"
              max="1500"
              step="50"
              value={playSpeed}
              onChange={(e) => setPlaySpeed(Number(e.target.value))}
              style={{ width: '90px' }}
            />
          </div>
        </div>

        {/* Current State Cards */}
        {currentStep && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            {/* Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.stack} {t.topOnRight}</div>
                {currentStep.stack.length > 0 && (
                  <div style={{ fontSize: '10.5px', color: 'var(--color-primary)', fontWeight: 600 }}>
                    {t.topOfStackHint} <strong>{currentStep.stack[currentStep.stack.length - 1]}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.stack.map((sym, idx) => {
                  const isTop = idx === currentStep.stack.length - 1;
                  return (
                    <div key={idx} className="stack-chip-container">
                      <span
                        className={`badge ${isTop ? 'chip-top-stack' : 'badge-primary'}`}
                        style={{ fontWeight: isTop ? 800 : 500 }}
                      >
                        {sym}
                        {isTop && <span className="chip-tag-top">{t.topOfStackBadge}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Remaining Input */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.remainingInput}</div>
                {currentStep.remainingInput.length > 0 && (
                  <div style={{ fontSize: '10.5px', color: 'var(--color-warning)', fontWeight: 600 }}>
                    {t.decisionSymbolHint} <strong>{currentStep.remainingInput[0]}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.remainingInput.map((sym, idx) => {
                  const isDecision = idx === 0;
                  return (
                    <div key={idx} className="stack-chip-container">
                      <span
                        className={`badge ${isDecision ? 'chip-decision-input' : 'badge-success'}`}
                        style={{ fontWeight: isDecision ? 800 : 500 }}
                      >
                        {sym}
                        {isDecision && <span className="chip-tag-decision">{t.decisionSymbolBadge}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action */}
            <div style={{
              padding: '10px 14px',
              backgroundColor: currentStep.isAccepted
                ? 'var(--color-success-subtle)'
                : currentStep.isError
                ? 'var(--color-danger-subtle)'
                : 'var(--color-bg-base)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${currentStep.isAccepted ? 'var(--color-success)' : currentStep.isError ? 'var(--color-danger)' : 'var(--color-border)'}`
            }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.action}</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                marginTop: '6px',
                color: currentStep.isAccepted
                  ? 'var(--color-success)'
                  : currentStep.isError
                  ? 'var(--color-danger)'
                  : 'var(--color-primary)'
              }}>
                {lang === 'cz' ? (currentStep.actionCz || currentStep.action) : currentStep.action}
              </div>
            </div>
          </div>
        )}

        {/* Live Parse Tree */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.parseTree}</div>
          <DerivationTreeVisualizer rootNode={currentStep?.tree} height="320px" />
        </div>
      </div>
    </div>
  );
};
