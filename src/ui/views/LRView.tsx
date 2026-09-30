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
}

export const LRView: React.FC<LRViewProps> = ({
  grammar,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  defaultInput = 'id + id * id',
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedVariant, setSelectedVariant] = useState<'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)'>('SLR(1)');
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
            <strong>Status for {selectedVariant}: </strong>
            {activeTable.isConflictFree ? (
              <span className="badge badge-success"><CheckCircle2 size={12} /> {t.noConflicts}</span>
            ) : (
              <span className="badge badge-danger"><AlertTriangle size={12} /> {activeTable.conflicts.length} conflict(s)</span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            States: <strong>{activeTable.states.length}</strong>
          </div>
        </div>

        {activeTable.conflicts.length > 0 && (
          <div style={{ backgroundColor: 'var(--color-danger-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)', marginTop: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-danger)', marginBottom: '4px' }}>
              {activeTable.conflicts.length} Conflict(s) in {selectedVariant}:
            </div>
            <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--color-danger)' }}>
              {activeTable.conflicts.map((c, idx) => (
                <li key={idx}>
                  <strong>{c.type} conflict</strong> in State {c.stateId} on symbol <code>'{c.symbol}'</code>: {c.actions.map(formatAction).join(' vs ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ACTION & GOTO Parsing Table */}
      <div className="card">
        <div className="card-title">{selectedVariant} Parsing Table (ACTION &amp; GOTO)</div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '60px', textAlign: 'center' }}>State</th>
                <th colSpan={activeTable.terminals.length} style={{ textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                  ACTION
                </th>
                <th colSpan={activeTable.nonTerminals.length} style={{ textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                  GOTO
                </th>
              </tr>
              <tr>
                {activeTable.terminals.map(term => (
                  <th key={term} style={{ textAlign: 'center' }}><code>{term}</code></th>
                ))}
                {activeTable.nonTerminals.map(nt => (
                  <th key={nt} style={{ textAlign: 'center', color: 'var(--color-primary)' }}><code>{nt}</code></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTable.states.map(s => {
                const actRow = activeTable.actionTable.get(s);
                const gotoRow = activeTable.gotoTable.get(s);

                return (
                  <tr key={s}>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {s}
                    </td>
                    {/* Action Cells */}
                    {activeTable.terminals.map(term => {
                      const actions = actRow?.get(term) || [];
                      const isConflict = actions.length > 1;

                      return (
                        <td
                          key={term}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            backgroundColor: isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isConflict ? 'var(--color-danger)' : actions.some(a => a.type === 'accept') ? 'var(--color-success)' : undefined,
                            fontWeight: isConflict || actions.some(a => a.type === 'accept') ? 700 : 400
                          }}
                        >
                          {actions.map(formatAction).join(' / ')}
                        </td>
                      );
                    })}
                    {/* Goto Cells */}
                    {activeTable.nonTerminals.map(nt => {
                      const target = gotoRow?.get(nt);
                      return (
                        <td
                          key={nt}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            color: 'var(--color-primary)',
                            fontWeight: 600
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
          <span>{t.parsingSimulator} (Bottom-Up Shift-Reduce)</span>
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
            placeholder="Space-separated tokens (e.g. id + id * id)"
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
            title="Reset"
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setIsPlaying(false); setCurrentStepIdx(prev => Math.max(0, prev - 1)); }}
            disabled={currentStepIdx === 0}
            title="Step Back"
          >
            <SkipBack size={15} />
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsPlaying(p => !p)}
            title={isPlaying ? "Pause" : "Play"}
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
            title="Step Forward"
          >
            <SkipForward size={15} />
          </button>

          <span style={{ fontSize: '12px', fontWeight: 600, margin: '0 8px', color: 'var(--color-text-secondary)' }}>
            Step {currentStepIdx + 1} of {simulation?.steps.length || 0}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Speed:</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            {/* State Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.stateStack} (Top on right)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {currentStep.stateStack.map((st, idx) => (
                  <span
                    key={idx}
                    className="badge badge-primary"
                    style={{ fontWeight: idx === currentStep.stateStack.length - 1 ? 800 : 500 }}
                  >
                    {st}
                  </span>
                ))}
              </div>
            </div>

            {/* Symbol Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.symbolStack}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {currentStep.symbolStack.map((sym, idx) => (
                  <span
                    key={idx}
                    className="badge badge-success"
                    style={{ fontWeight: idx === currentStep.symbolStack.length - 1 ? 800 : 500 }}
                  >
                    {sym}
                  </span>
                ))}
              </div>
            </div>

            {/* Remaining Input */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.remainingInput}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {currentStep.remainingInput.map((sym, idx) => (
                  <span
                    key={idx}
                    className={`badge ${idx === 0 ? 'badge-warning' : 'badge-primary'}`}
                    style={{ fontWeight: idx === 0 ? 800 : 500 }}
                  >
                    {sym}
                  </span>
                ))}
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
                {currentStep.action}
              </div>
            </div>
          </div>
        )}

        {/* Live Parse Tree */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.parseTree} (Bottom-Up Construction)</div>
          <DerivationTreeVisualizer rootNode={currentStep?.tree} height="320px" />
        </div>
      </div>
    </div>
  );
};
