import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction, formatRhs, EPSILON } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { simulateLLParse, LLParseStep, LLSimulationResult } from '../../core/ll/llParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, AlertTriangle, Layers, XCircle } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText, formatLookaheadSet } from '../components/Symbols';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { exportLLTableToLatex, exportParseTreeToTikz } from '../../core/export/latexExport';

interface LLViewProps {
  grammar: Grammar;
  llTable: LLTable;
  analysis: GrammarAnalysis;
  defaultInput?: string;
  lang: Language;
}

export const LLView: React.FC<LLViewProps> = ({
  grammar,
  llTable,
  analysis,
  defaultInput = 'id + id * id',
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [inputText, setInputText] = useState(defaultInput);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => setInputText(defaultInput), [defaultInput]);

  const simulation: LLSimulationResult = useMemo(() => {
    const tokens = inputText.trim().split(/\s+/).filter(Boolean);
    return simulateLLParse(tokens, grammar, llTable);
  }, [inputText, grammar, llTable]);

  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  // Keep the active trace row visible
  useEffect(() => {
    const row = traceRef.current?.querySelector('.trace-row-active') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentStepIdx]);

  const currentStep: LLParseStep | undefined = simulation.steps[currentStepIdx];
  const lastStep = simulation.steps[simulation.steps.length - 1];
  const actionText = (s: LLParseStep) => (lang === 'cz' ? s.actionCz || s.action : s.action);
  const fmtLa = (la: string) => (la === '' ? EPSILON : la);

  return (
    <div>
      {/* LL(1) Parsing Table with Embedded Collisions */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.llTableTitle}</span>
            <Layers size={18} color="var(--color-primary)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LatexExportButton getLatex={() => exportLLTableToLatex(llTable, lang, grammar)} filename="ll1_table.tex" lang={lang} />
            {llTable.isLL1 ? (
              <span className="badge badge-success"><CheckCircle2 size={12} /> {t.ll1Valid}</span>
            ) : llTable.isLL2 ? (
              <span className="badge badge-warning"><CheckCircle2 size={12} /> {t.ll2Valid}</span>
            ) : (
              <span className="badge badge-danger"><AlertTriangle size={12} /> {t.notLL}</span>
            )}
          </div>
        </div>
        <p className="hint-text" style={{ marginBottom: '12px' }}>{t.llTableHint}</p>

        {llTable.conflicts.length > 0 ? (
          <div className="notice-box error" style={{ marginBottom: '14px' }}>
            <div className="notice-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} />
                {llTable.conflicts.length} {t.llConflictsDetected}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{t.conflictCellsHighlighted}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {llTable.conflicts.map((c, idx) => (
                <div key={idx} className="conflict-detail-card" style={{ color: 'var(--color-text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                      {c.conflictType === 'First/First' ? t.firstFirstConflict : t.firstFollowConflict}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                      M[<strong className="sym-nt">{c.nonTerminal}</strong>, <strong className="sym-t">{c.lookahead}</strong>]
                    </span>
                  </div>
                  <ul style={{ margin: '2px 0 0 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {c.reasons.map(r => (
                      <li key={r.production.id} style={{ fontSize: '11.5px' }}>
                        <ProductionText production={r.production} nonTerminals={grammar.nonTerminals} showId />
                        <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                          {[
                            r.viaFirst ? t.reasonViaFirst.replace('{a}', c.lookahead).replace('{alpha}', formatRhs(r.production.rhs)) : '',
                            r.viaFollow ? t.reasonViaFollow.replace('{a}', c.lookahead).replace('{alpha}', formatRhs(r.production.rhs)).replace('{A}', c.nonTerminal) : ''
                          ].filter(Boolean).join('; ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="report-box success" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                <th style={{ width: '90px' }}>{t.colNonTerminal}</th>
                {llTable.terminals.map(term => (
                  <th
                    key={term}
                    className={currentStep?.lookupTerminal === term && currentStep?.lookupNt ? 'table-col-active' : ''}
                    style={{ textAlign: 'center' }}
                  >
                    <code>{term}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {llTable.nonTerminals.map(nt => {
                const isRowActive = currentStep?.lookupNt === nt;
                return (
                  <tr key={nt} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{nt}</td>
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
                            whiteSpace: 'nowrap',
                            backgroundColor: isCellActive ? undefined : isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isCellActive ? '#ffffff' : isConflict ? 'var(--color-danger)' : undefined,
                            fontWeight: isCellActive || isConflict ? 700 : 400
                          }}
                        >
                          {prods.map(p => (
                            <div key={p.id}>{p.rhs.length === 0 ? EPSILON : p.rhs.join(' ')}</div>
                          ))}
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

      {/* LL(2) analysis when the grammar is not LL(1) */}
      {!llTable.isLL1 && (
        <div className="card">
          <div className="card-title">
            <span>{t.ll2SectionTitle}</span>
            {llTable.isLL2
              ? <span className="badge badge-success"><CheckCircle2 size={12} /> LL(2)</span>
              : <span className="badge badge-danger"><AlertTriangle size={12} /> {t.notLL2}</span>}
          </div>
          <p className="hint-text">{t.ll2Explanation}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '10px' }}>
            <div className={`report-box ${llTable.isStrongLL2 ? 'success' : 'danger'}`}>
              <strong>{t.strongLL2Label}: {llTable.isStrongLL2 ? t.yes : t.no}</strong>
              {llTable.strongLL2Conflicts.slice(0, 12).map((c, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--color-text-primary)' }}>
                  [{c.nonTerminal}, {fmtLa(c.lookahead)}]: {c.productions.map(p => `(${p.id}) ${formatProduction(p)}`).join('  vs  ')}
                </div>
              ))}
            </div>
            <div className={`report-box ${llTable.isLL2 ? 'success' : 'danger'}`}>
              <strong>{t.exactLL2Label}: {llTable.isLL2 ? t.yes : t.no}{!llTable.ll2Complete ? ` (${t.ll2Incomplete})` : ''}</strong>
              {llTable.ll2Conflicts.slice(0, 12).map((c, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--color-text-primary)' }}>
                  [{c.nonTerminal}, L = {formatLookaheadSet(c.context || [])}] {fmtLa(c.lookahead)}: {c.productions.map(p => `(${p.id})`).join(' vs ')}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Top-Down Simulator */}
      <div className="card">
        <div className="card-title">
          <span>{t.parsingSimulator} ({t.topDownLL})</span>
          <Layers size={18} color="var(--color-primary)" />
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
        {!llTable.isLL1 && <div className="conflict-pick-note" style={{ marginBottom: '10px' }}>{t.simulatorConflictWarning}</div>}

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

        {/* Current configuration */}
        {currentStep && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.stack} {t.topOnRight}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentStep.stack.map((sym, idx) => {
                  const isTop = idx === currentStep.stack.length - 1;
                  return (
                    <span key={idx} className={`badge ${isTop ? 'chip-top-stack' : grammar.nonTerminals.has(sym) ? 'badge-primary' : 'badge-success'}`}>
                      {sym}
                      {isTop && <span className="chip-tag-top">{t.topOfStackBadge}</span>}
                    </span>
                  );
                })}
              </div>
            </div>

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
          {/* Trace table */}
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
                      <td>{s.stack.join(' ')}</td>
                      <td className="trace-input">{s.remainingInput.join(' ')}</td>
                      <td className="trace-action">{actionText(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Parse Tree */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.parseTree} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({t.treeAfterStep})</span></div>
              {currentStep?.tree && (
                <LatexExportButton
                  getLatex={() => exportParseTreeToTikz(currentStep.tree)}
                  filename="parse_tree_ll.tex"
                  label="LaTeX (forest)"
                  lang={lang}
                  title={lang === 'cz' ? 'Exportovat strom do LaTeXu (forest)' : 'Export tree to LaTeX (forest)'}
                />
              )}
            </div>
            <DerivationTreeVisualizer rootNode={currentStep?.tree ?? lastStep?.tree} height="360px" filename="parse_tree_ll" lang={lang} />
          </div>
        </div>
      </div>
    </div>
  );
};
