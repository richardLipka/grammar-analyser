import React, { useState, useEffect } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LRTable, formatAction } from '../../core/lr/lrTable';
import { simulateLRParse, LRParseStep, LRSimulationResult } from '../../core/lr/lrParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw,
  CheckCircle2, AlertTriangle, Cpu
} from 'lucide-react';

interface LRViewProps {
  grammar: Grammar;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  defaultInput?: string;
  lang: Language;
  selectedVariant?: 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';
  onSelectVariant?: (variant: 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)') => void;
}

export const LRView: React.FC<LRViewProps> = ({
  grammar,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  defaultInput = 'id + id * id',
  lang,
  selectedVariant: controlledVariant,
  onSelectVariant
}) => {
  const t = TRANSLATIONS[lang];
  const [internalVariant, setInternalVariant] = useState<'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)'>('SLR(1)');
  const selectedVariant = controlledVariant ?? internalVariant;
  const setSelectedVariant = (v: 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)') => {
    if (onSelectVariant) {
      onSelectVariant(v);
    } else {
      setInternalVariant(v);
    }
  };
  const [inputText, setInputText] = useState(defaultInput);
  const [simulation, setSimulation] = useState<LRSimulationResult | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);

  const activeTable = selectedVariant === 'LR(0)'
    ? lr0Table
    : selectedVariant === 'SLR(1)'
    ? slr1Table
    : selectedVariant === 'LALR(1)'
    ? lalr1Table
    : lr1Table;

  useEffect(() => {
    runParse();
  }, [inputText, activeTable, grammar]);

  const runParse = () => {
    const tokens = inputText.trim().split(/\s+/).filter(Boolean);
    const result = simulateLRParse(tokens, grammar, activeTable);
    setSimulation(result);
    setCurrentStepIdx(0);
    setIsPlaying(false);
  };

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

  const currentStep: LRParseStep | undefined = simulation?.steps[currentStepIdx];

  return (
    <div>
      {/* Variant Selector & Conflict Overview */}
      <div className="card">
        <div className="card-title">
          <span>{t.variant}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
              <button
                key={v}
                className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setSelectedVariant(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <div>
            <strong>{t.statusFor} {selectedVariant}: </strong>
            {activeTable.isConflictFree ? (
              <span className="badge badge-success"><CheckCircle2 size={12} /> {t.noConflicts}</span>
            ) : (
              <span className="badge badge-danger"><AlertTriangle size={12} /> {activeTable.conflicts.length} {t.conflictsCountSuffix}</span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {t.statesCount} <strong>{activeTable.states.length}</strong>
          </div>
        </div>

        {activeTable.conflicts.length > 0 && (
          <div style={{ backgroundColor: 'var(--color-danger-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)', marginTop: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-danger)', marginBottom: '4px' }}>
              {activeTable.conflicts.length} {t.conflictsInVariant.replace('{variant}', selectedVariant)}
            </div>
            <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--color-danger)' }}>
              {activeTable.conflicts.map((c, idx) => (
                <li key={idx}>
                  <strong>{c.type === 'Shift/Reduce' ? t.shiftReduceConflict : t.reduceReduceConflict}</strong> {lang === 'cz' ? 've stavu' : 'in State'} {c.stateId} {lang === 'cz' ? 'se symbolem' : 'on symbol'} <code>'{c.symbol}'</code>: {c.actions.map(formatAction).join(' vs ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ACTION & GOTO Parsing Table */}
      <div className="card">
        <div className="card-title">{selectedVariant} {t.lrTableTitle}</div>

        {/* Active Table Lookup Banner */}
        {currentStep?.lookupState !== undefined && currentStep?.lookupSymbol && (
          <div className="active-lookup-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{t.activeTableLookup}</span>
              <span>{t.activeLineRow}: <span className="active-lookup-badge">{lang === 'cz' ? 'Stav' : 'State'} {currentStep.lookupState}</span></span>
              <span>×</span>
              <span>{t.activeColumn}: <span className="active-lookup-badge">{currentStep.lookupSymbol}</span></span>
              {currentStep.gotoNt && currentStep.gotoState !== undefined && (
                <span style={{ marginLeft: '6px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                  (GOTO: <span className="active-lookup-badge">{currentStep.gotoNt}</span> ➔ <span className="active-lookup-badge">State {currentStep.gotoState}</span>)
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', fontWeight: 700, color: 'var(--color-primary)' }}>
              ➔ {lang === 'cz' ? (currentStep.actionCz || currentStep.action) : currentStep.action}
            </div>
          </div>
        )}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '60px', textAlign: 'center' }}>{lang === 'cz' ? 'Stav' : 'State'}</th>
                <th colSpan={activeTable.terminals.length} style={{ textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                  ACTION
                </th>
                <th colSpan={activeTable.nonTerminals.length} style={{ textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                  GOTO
                </th>
              </tr>
              <tr>
                {activeTable.terminals.map(term => {
                  const isColActive = currentStep?.lookupSymbol === term;
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
                {activeTable.nonTerminals.map(nt => {
                  const isGotoColActive = currentStep?.gotoNt === nt;
                  return (
                    <th
                      key={nt}
                      className={isGotoColActive ? 'table-col-active' : ''}
                      style={{ textAlign: 'center', color: 'var(--color-primary)' }}
                    >
                      <code>{nt}</code>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeTable.states.map(s => {
                const actRow = activeTable.actionTable.get(s);
                const gotoRow = activeTable.gotoTable.get(s);
                const isRowActive = currentStep?.lookupState === s;

                return (
                  <tr key={s} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {s}
                    </td>
                    {/* Action Cells */}
                    {activeTable.terminals.map(term => {
                      const actions = actRow?.get(term) || [];
                      const isConflict = actions.length > 1;
                      const isCellActive = isRowActive && currentStep?.lookupSymbol === term;

                      return (
                        <td
                          key={term}
                          className={isCellActive ? 'table-cell-active' : ''}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            backgroundColor: isCellActive ? undefined : isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isCellActive ? '#ffffff' : isConflict ? 'var(--color-danger)' : actions.some(a => a.type === 'accept') ? 'var(--color-success)' : undefined,
                            fontWeight: isCellActive || isConflict || actions.some(a => a.type === 'accept') ? 700 : 400
                          }}
                        >
                          {actions.map(formatAction).join(' / ')}
                        </td>
                      );
                    })}
                    {/* Goto Cells */}
                    {activeTable.nonTerminals.map(nt => {
                      const target = gotoRow?.get(nt);
                      const isGotoCellActive = isRowActive && currentStep?.gotoNt === nt;

                      return (
                        <td
                          key={nt}
                          className={isGotoCellActive ? 'table-cell-active' : ''}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            color: isGotoCellActive ? '#ffffff' : 'var(--color-primary)',
                            fontWeight: isGotoCellActive ? 700 : 600
                          }}
                        >
                          {target !== undefined ? target : ''}
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

      {/* Bottom-Up Parsing Simulator */}
      <div className="card">
        <div className="card-title">
          <span>{t.parsingSimulator} ({lang === 'cz' ? 'Zdola nahoru Shift-Reduce' : 'Bottom-Up Shift-Reduce'})</span>
          <Cpu size={18} color="var(--color-primary)" />
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            {/* State Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.stateStack} {t.topOnRight}</div>
                {currentStep.stateStack.length > 0 && (
                  <div style={{ fontSize: '10.5px', color: 'var(--color-primary)', fontWeight: 600 }}>
                    {t.topOfStackHint} <strong>State {currentStep.stateStack[currentStep.stateStack.length - 1]}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.stateStack.map((st, idx) => {
                  const isTop = idx === currentStep.stateStack.length - 1;
                  return (
                    <div key={idx} className="stack-chip-container">
                      <span
                        className={`badge ${isTop ? 'chip-top-stack' : 'badge-primary'}`}
                        style={{ fontWeight: isTop ? 800 : 500 }}
                      >
                        {st}
                        {isTop && <span className="chip-tag-top">{t.topOfStackBadge}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Symbol Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.symbolStack}</div>
                {currentStep.symbolStack.length > 0 && (
                  <div style={{ fontSize: '10.5px', color: 'var(--color-success)', fontWeight: 600 }}>
                    {t.topOfStackHint} <strong>{currentStep.symbolStack[currentStep.symbolStack.length - 1]}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.symbolStack.map((sym, idx) => {
                  const isTop = idx === currentStep.symbolStack.length - 1;
                  return (
                    <div key={idx} className="stack-chip-container">
                      <span
                        className={`badge ${isTop ? 'chip-top-stack' : 'badge-success'}`}
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
                        className={`badge ${isDecision ? 'chip-decision-input' : 'badge-primary'}`}
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
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.bottomUpTreeLabel}</div>
          <DerivationTreeVisualizer rootNode={currentStep?.tree} height="320px" />
        </div>
      </div>
    </div>
  );
};
