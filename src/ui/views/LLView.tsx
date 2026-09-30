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
      {/* Classification & Conflicts Summary */}
      <div className="card">
        <div className="card-title">
          <span>LL(1) &amp; LL(2) Status</span>
          {llTable.isLL1 ? (
            <span className="badge badge-success"><CheckCircle2 size={12} /> LL(1) Valid</span>
          ) : llTable.isLL2 ? (
            <span className="badge badge-warning"><CheckCircle2 size={12} /> Not LL(1), but LL(2) Valid</span>
          ) : (
            <span className="badge badge-danger"><AlertTriangle size={12} /> Not LL(1) or LL(2)</span>
          )}
        </div>

        {llTable.conflicts.length > 0 && (
          <div style={{ backgroundColor: 'var(--color-danger-subtle)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-danger)', marginBottom: '4px' }}>
              {llTable.conflicts.length} LL(1) Conflict(s) Detected:
            </div>
            <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--color-danger)' }}>
              {llTable.conflicts.map((c, idx) => (
                <li key={idx}>
                  <strong>{c.conflictType} conflict</strong> on Non-Terminal <code>{c.nonTerminal}</code> with lookahead <code>'{c.lookahead}'</code>: {c.productions.map(formatProduction).join(' vs ')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* LL(1) Parsing Table */}
      <div className="card">
        <div className="card-title">LL(1) Parsing Table M[A, a]</div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Non-Terminal</th>
                {llTable.terminals.map(term => (
                  <th key={term} style={{ textAlign: 'center' }}>
                    <code>{term}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {llTable.nonTerminals.map(nt => (
                <tr key={nt}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                    {nt}
                  </td>
                  {llTable.terminals.map(term => {
                    const prods = llTable.table1.get(nt)?.get(term) || [];
                    const isConflict = prods.length > 1;

                    return (
                      <td
                        key={term}
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11.5px',
                          backgroundColor: isConflict ? 'var(--color-danger-subtle)' : undefined,
                          color: isConflict ? 'var(--color-danger)' : undefined,
                          fontWeight: isConflict ? 700 : 400
                        }}
                      >
                        {prods.map(p => formatProduction(p)).join('\n')}
                      </td>
                    );
                  })}
                </tr>
              ))}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            {/* Stack */}
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.stack} (Top on right)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {currentStep.stack.map((sym, idx) => (
                  <span
                    key={idx}
                    className={`badge ${idx === currentStep.stack.length - 1 ? 'badge-primary' : 'badge-primary'}`}
                    style={{ fontWeight: idx === currentStep.stack.length - 1 ? 800 : 500 }}
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
                    className={`badge ${idx === 0 ? 'badge-warning' : 'badge-success'}`}
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
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.parseTree}</div>
          <DerivationTreeVisualizer rootNode={currentStep?.tree} height="320px" />
        </div>
      </div>
    </div>
  );
};
