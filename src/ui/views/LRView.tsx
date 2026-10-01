import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LRTable, LRAction, LRLayout, LR0_ACTION_COLUMN, formatLayoutAction, stateLabel } from '../../core/lr/lrTable';
import { simulateLRParse, LRParseStep, LRSimulationResult } from '../../core/lr/lrParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, AlertTriangle, Cpu, XCircle } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText } from '../components/Symbols';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { LRLayoutSwitch } from '../components/LRLayoutSwitch';
import { exportLRTableToLatex, exportParseTreeToTikz } from '../../core/export/latexExport';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

interface LRViewProps {
  grammar: Grammar;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  defaultInput?: string;
  lang: Language;
  selectedVariant?: LRVariantName;
  onSelectVariant?: (variant: LRVariantName) => void;
  layout: LRLayout;
  onLayoutChange: (layout: LRLayout) => void;
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
  onSelectVariant,
  layout,
  onLayoutChange
}) => {
  const t = TRANSLATIONS[lang];
  const [internalVariant, setInternalVariant] = useState<LRVariantName>('SLR(1)');
  const selectedVariant = controlledVariant ?? internalVariant;
  const setSelectedVariant = (v: LRVariantName) => (onSelectVariant ? onSelectVariant(v) : setInternalVariant(v));
  const [inputText, setInputText] = useState(defaultInput);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => setInputText(defaultInput), [defaultInput]);

  const activeTable = { 'LR(0)': lr0Table, 'SLR(1)': slr1Table, 'LALR(1)': lalr1Table, 'LR(1)': lr1Table }[selectedVariant];
  const lecture = layout === 'lecture';

  const simulation: LRSimulationResult = useMemo(() => {
    const tokens = inputText.trim().split(/\s+/).filter(Boolean);
    return simulateLRParse(tokens, grammar, activeTable, layout);
  }, [inputText, grammar, activeTable, layout]);

  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  useEffect(() => {
    const row = traceRef.current?.querySelector('.trace-row-active') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentStepIdx]);

  const currentStep: LRParseStep | undefined = simulation.steps[currentStepIdx];
  const actionText = (s: LRParseStep) => (lang === 'cz' ? s.actionCz || s.action : s.action);

  // The two layouts: lecture f/g with named states, Dragon Book ACTION/GOTO with numbers
  const name = (state: number) => stateLabel(activeTable, state, layout);
  const actColumns = lecture ? activeTable.fColumns : activeTable.terminals;
  const actTable = lecture ? activeTable.fTable : activeTable.actionTable;
  const trColumns = lecture ? activeTable.gColumns : activeTable.nonTerminals;
  const trTable = lecture ? activeTable.gTable : activeTable.gotoTable;
  const conflicts = lecture ? activeTable.fConflicts : activeTable.conflicts;
  const conflictCells = new Set(conflicts.map(c => `${c.stateId}|${c.symbol}`));
  const fmt = (a: LRAction) => formatLayoutAction(a, layout, lang);
  const actionCellName = (state: number, col: string) =>
    lecture ? (col === LR0_ACTION_COLUMN ? `f(${name(state)})` : `f(${name(state)}, ${col})`) : `ACTION[${state}, ${col}]`;
  const transitionCellName = (state: number, sym: string) => (lecture ? `g(${name(state)}, ${sym})` : `GOTO[${state}, ${sym}]`);

  /** Lecture: the named states read like the sentential form (# E₁ + T₂); Dragon Book: $ 0 E 1 + 6 … */
  const stackText = (s: LRParseStep) =>
    lecture
      ? s.stateStack.map(name).join(' ')
      : s.stateStack.map((st, i) => `${s.symbolStack[i]} ${st}`).join(' ');

  return (
    <div>
      <LRLayoutSwitch layout={layout} onChange={onLayoutChange} lang={lang} />

      {/* Parsing table (f/g or ACTION/GOTO) with the conflicts */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.lrTableTitle.replace('{variant}', selectedVariant)}</span>
            <Cpu size={18} color="var(--color-primary)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} role="group" aria-label={t.variant}>
              {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  aria-pressed={selectedVariant === v}
                  onClick={() => setSelectedVariant(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <LatexExportButton
              getLatex={() => exportLRTableToLatex(activeTable, lang, layout)}
              filename={`${selectedVariant.toLowerCase().replace(/[^a-z0-9]/g, '_')}_table.tex`}
              label={lang === 'cz' ? 'Export tabulky' : 'Export Table'}
              lang={lang}
              title={lang === 'cz' ? `Exportovat tabulku ${selectedVariant} jako LaTeX` : `Export ${selectedVariant} table as LaTeX`}
            />
          </div>
        </div>
        <p className="hint-text" style={{ marginBottom: '12px' }}>{t.lrVariantHints[selectedVariant]}</p>

        <div style={{ marginBottom: '14px' }}>
          {conflicts.length > 0 ? (
            <div className="notice-box error">
              <div className="notice-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={15} />
                  {t.conflictsInVariant.replace('{variant}', selectedVariant).replace('{count}', conflicts.length.toString())}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  {t.statesCount} <strong>{activeTable.states.length}</strong> • {t.conflictCellsHighlighted}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {conflicts.map((c, idx) => (
                  <div key={idx} className="conflict-detail-card" style={{ color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                        {c.type === 'Shift/Reduce' ? t.shiftReduceConflict : t.reduceReduceConflict}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                        <strong>{actionCellName(c.stateId, c.symbol)}</strong>
                      </span>
                    </div>
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{t.conflictingActions}:</span>
                      {c.actions.map((act, actIdx) => (
                        <span key={actIdx} className="rule-chip" style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' }}>
                          <strong>{fmt(act)}</strong>
                          {act.production && <> ({formatProduction(act.production)})</>}
                          {act.type === 'shift' && !lecture && <> ({t.shiftTo} {act.targetState})</>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="report-box success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} />
                {t.noLRConflicts.replace('{variant}', selectedVariant)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                {t.statesCount} <strong>{activeTable.states.length}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Table entries used by the current step */}
        {currentStep?.lookupState !== undefined && currentStep.lookupSymbol !== undefined && (
          <div className="active-lookup-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{t.activeTableLookup}</span>
              <span className="active-lookup-badge">{actionCellName(currentStep.lookupState, currentStep.lookupSymbol)}</span>
              {currentStep.gotoSymbol && currentStep.gotoFromState !== undefined && (
                <span>
                  <span className="active-lookup-badge">{transitionCellName(currentStep.gotoFromState, currentStep.gotoSymbol)}</span>
                  {currentStep.gotoState !== undefined && <> = {name(currentStep.gotoState)}</>}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '60px', textAlign: 'center' }}>{t.stateLabel}</th>
                <th colSpan={actColumns.length} style={{ textAlign: 'center' }}>{lecture ? t.fTableTitle : 'ACTION'}</th>
                <th colSpan={trColumns.length} className="table-part-start" style={{ textAlign: 'center' }}>{lecture ? t.gTableTitle : 'GOTO'}</th>
              </tr>
              <tr>
                {actColumns.map(col => (
                  <th key={`a_${col}`} className={currentStep?.lookupSymbol === col ? 'table-col-active' : ''} style={{ textAlign: 'center' }}>
                    {col === LR0_ACTION_COLUMN ? t.lr0ActionColumn : <code>{col}</code>}
                  </th>
                ))}
                {trColumns.map((sym, i) => (
                  <th
                    key={`g_${sym}`}
                    className={[currentStep?.gotoSymbol === sym ? 'table-col-active' : '', i === 0 ? 'table-part-start' : ''].join(' ')}
                    style={{ textAlign: 'center', color: grammar.nonTerminals.has(sym) ? 'var(--color-primary)' : undefined }}
                  >
                    <code>{sym}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTable.states.map(s => {
                const actRow = actTable.get(s);
                const trRow = trTable.get(s);
                const isRowActive = currentStep?.lookupState === s;
                const isTransitionRow = currentStep?.gotoFromState === s && currentStep?.gotoSymbol !== undefined;

                return (
                  <tr key={s} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{name(s)}</td>
                    {actColumns.map(col => {
                      const actions = actRow?.get(col) || [];
                      const isConflict = conflictCells.has(`${s}|${col}`);
                      const isCellActive = isRowActive && currentStep?.lookupSymbol === col;
                      const isAccept = actions.some(a => a.type === 'accept');
                      return (
                        <td
                          key={`a_${col}`}
                          className={isCellActive ? 'table-cell-active' : ''}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            whiteSpace: 'nowrap',
                            backgroundColor: isCellActive ? undefined : isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isCellActive ? '#ffffff' : isConflict ? 'var(--color-danger)' : isAccept ? 'var(--color-success)' : undefined,
                            fontWeight: isCellActive || isConflict || isAccept ? 700 : 400
                          }}
                        >
                          {actions.map(fmt).join(' / ')}
                        </td>
                      );
                    })}
                    {trColumns.map((sym, i) => {
                      const target = trRow?.get(sym);
                      const isCellActive = isTransitionRow && currentStep?.gotoSymbol === sym;
                      return (
                        <td
                          key={`g_${sym}`}
                          className={[isCellActive ? 'table-cell-active' : '', i === 0 ? 'table-part-start' : ''].join(' ')}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            whiteSpace: 'nowrap',
                            color: isCellActive ? '#ffffff' : 'var(--color-primary)',
                            fontWeight: isCellActive ? 700 : 600
                          }}
                        >
                          {target !== undefined ? name(target) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="hint-text" style={{ marginTop: '8px' }}>
          {lecture ? t.lrLegendLecture : t.lrLegend}
          {' '}
          {grammar.productions.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && ', '}
              <ProductionText production={p} nonTerminals={grammar.nonTerminals} showId />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Bottom-Up Parsing Simulator */}
      <div className="card">
        <div className="card-title">
          <span>{t.parsingSimulator} ({t.bottomUpLR})</span>
          <Cpu size={18} color="var(--color-primary)" />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            className="grammar-textarea"
            style={{ minHeight: 'unset', height: '38px', padding: '6px 12px' }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t.tokensPlaceholder}
            aria-label={t.inputWord}
          />
        </div>

        {simulation.steps.length > 0 && (
          <div className={`report-box ${simulation.accepted ? 'success' : 'danger'}`} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {simulation.accepted ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <span>
              {simulation.accepted
                ? t.wordAccepted.replace('{n}', simulation.steps.length.toString())
                : `${t.wordRejected}: ${lang === 'cz' ? simulation.errorMessageCz || simulation.errorMessage : simulation.errorMessage}`}
            </span>
          </div>
        )}
        {!activeTable.isConflictFree && <div className="conflict-pick-note" style={{ marginBottom: '10px' }}>{t.simulatorConflictWarning}</div>}

        <SimulatorControls
          stepIdx={currentStepIdx}
          total={simulation.steps.length}
          isPlaying={isPlaying}
          speed={playSpeed}
          lang={lang}
          onStep={(i) => { setIsPlaying(false); setCurrentStepIdx(i); }}
          onTogglePlay={() => {
            if (!isPlaying && currentStepIdx >= simulation.steps.length - 1) setCurrentStepIdx(0);
            setIsPlaying(p => !p);
          }}
          onSpeed={setPlaySpeed}
        />

        {currentStep && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.stateStack} {t.topOnRight}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.stateStack.map((st, idx) => {
                  const isTop = idx === currentStep.stateStack.length - 1;
                  return (
                    <span key={idx} className={`badge ${isTop ? 'chip-top-stack' : 'badge-primary'}`}>
                      {name(st)}
                      {isTop && <span className="chip-tag-top">{t.topOfStackBadge}</span>}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* The named states already spell the symbols; the Dragon Book layout keeps a separate symbol stack */}
            {!lecture && (
              <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.symbolStack}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {currentStep.symbolStack.map((sym, idx) => (
                    <span key={idx} className={`badge ${grammar.nonTerminals.has(sym) ? 'badge-primary' : 'badge-success'}`}>{sym}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.remainingInput}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.remainingInput.map((sym, idx) => (
                  <span key={idx} className={`badge ${idx === 0 ? 'chip-decision-input' : 'badge-success'}`}>
                    {sym}
                    {idx === 0 && <span className="chip-tag-decision">{t.decisionSymbolBadge}</span>}
                  </span>
                ))}
              </div>
            </div>

            <div style={{
              padding: '10px 14px',
              backgroundColor: currentStep.isAccepted ? 'var(--color-success-subtle)' : currentStep.isError ? 'var(--color-danger-subtle)' : 'var(--color-bg-base)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${currentStep.isAccepted ? 'var(--color-success)' : currentStep.isError ? 'var(--color-danger)' : 'var(--color-border)'}`
            }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.action}</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                marginTop: '6px',
                color: currentStep.isAccepted ? 'var(--color-success)' : currentStep.isError ? 'var(--color-danger)' : 'var(--color-primary)'
              }}>
                {actionText(currentStep)}
              </div>
            </div>
          </div>
        )}

        <div className="two-column-grid">
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.traceTitle}</div>
            <div className="trace-table-container" ref={traceRef} style={{ maxHeight: '360px' }}>
              <table className="trace-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.stack}</th>
                    <th style={{ textAlign: 'right' }}>{t.remainingInput}</th>
                    <th>{t.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.steps.map((s, i) => (
                    <tr
                      key={i}
                      onClick={() => { setIsPlaying(false); setCurrentStepIdx(i); }}
                      className={[
                        i === currentStepIdx ? 'trace-row-active' : '',
                        i > currentStepIdx ? 'trace-row-future' : '',
                        s.isError ? 'trace-row-error' : '',
                        s.isAccepted ? 'trace-row-accept' : ''
                      ].join(' ')}
                    >
                      <td className="trace-num">{i + 1}</td>
                      <td>{stackText(s)}</td>
                      <td className="trace-input">{s.remainingInput.join(' ')}</td>
                      <td className="trace-action">{actionText(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {currentStep && (
              <div className="hint-text" style={{ marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                <strong>{t.rightParse}:</strong> {currentStep.rightParse.length > 0 ? currentStep.rightParse.join(' ') : 'ε'}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.bottomUpTreeLabel} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({t.treeAfterStep})</span></div>
              {currentStep?.tree && (
                <LatexExportButton
                  getLatex={() => exportParseTreeToTikz(currentStep.tree!)}
                  filename="parse_tree_lr.tex"
                  label="LaTeX (forest)"
                  lang={lang}
                  title={lang === 'cz' ? 'Exportovat strom do LaTeXu (forest)' : 'Export tree to LaTeX (forest)'}
                />
              )}
            </div>
            <DerivationTreeVisualizer rootNode={currentStep?.tree} height="360px" filename="parse_tree_lr" lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
};
