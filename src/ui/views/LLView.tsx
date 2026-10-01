import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, Production, formatProduction, formatRhs, EPSILON } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { simulateLLParse, LLParseStep, LLSimulationResult, LLParseMode } from '../../core/ll/llParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, AlertTriangle, Layers, XCircle, Sparkles } from 'lucide-react';
import { InfoButton } from '../components/TransformationInfo';
import { InfoKey } from '../../core/processor/transformationInfo';
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
  /** Automatic attempt to transform the grammar to LL(1) (applied to the editor, undoable) */
  onAttemptLL1?: () => void;
  onShowInfo?: (key: InfoKey) => void;
}

const fmtLa = (la: string) => (la === '' ? EPSILON : la);
const rhsText = (p: Production) => (p.rhs.length === 0 ? EPSILON : p.rhs.join(' '));

export const LLView: React.FC<LLViewProps> = ({
  grammar,
  llTable,
  analysis: _analysis,
  defaultInput = 'id + id * id',
  lang,
  onAttemptLL1,
  onShowInfo
}) => {
  const t = TRANSLATIONS[lang];
  const [inputText, setInputText] = useState(defaultInput);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const traceRef = useRef<HTMLDivElement>(null);

  // LL(1) when possible, LL(2) for grammars that need two symbols of lookahead
  const preferredK: 1 | 2 = llTable.isLL1 ? 1 : llTable.isLL2 ? 2 : 1;
  const [k, setK] = useState<1 | 2>(preferredK);
  useEffect(() => setK(preferredK), [llTable]);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Strong LL(2) grammars use the table M[A, xy]; other LL(2) grammars need the tables T(A, L)
  const useContexts = llTable.isLL2 && !llTable.isStrongLL2;
  const mode: LLParseMode = k === 1 ? { k: 1 } : { k: 2, tables: useContexts ? 'contexts' : 'strong' };

  const simulation: LLSimulationResult = useMemo(() => {
    const tokens = inputText.trim().split(/\s+/).filter(Boolean);
    return simulateLLParse(tokens, grammar, llTable, undefined, mode);
  }, [inputText, grammar, llTable, k, useContexts]);

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
  const ll1Lookup = k === 1 && currentStep?.lookupNt ? currentStep : undefined;
  const ll2Lookup = k === 2 && currentStep?.lookupNt ? currentStep : undefined;

  /** Stack as text; in the T(A, L) mode a non-terminal shows its table: A⟨T2⟩. */
  const stackText = (s: LLParseStep) =>
    s.stack.map((sym, i) => (s.stackTables && s.stackTables[i] !== null && s.stackTables[i] !== undefined ? `${sym}⟨T${s.stackTables[i]}⟩` : sym)).join(' ');

  const ll2Conflicting = new Set(llTable.strongLL2Conflicts.map(c => `${c.nonTerminal}|${c.lookahead}`));

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
                {t.llConflictsDetected.replace('{count}', llTable.conflicts.length.toString())}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{t.conflictCellsHighlighted}</span>
            </div>
            {onAttemptLL1 && (
              <div className="ll1-attempt-row">
                <button type="button" className="btn btn-accent" onClick={onAttemptLL1} title={t.hintLL1}>
                  <Sparkles size={14} />
                  <span>{t.ll1AttemptButton}</span>
                </button>
                {onShowInfo && <InfoButton lang={lang} onClick={() => onShowInfo('ll1')} />}
              </div>
            )}

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

        {ll1Lookup && <LookupBanner step={ll1Lookup} label={`M[${ll1Lookup.lookupNt}, ${ll1Lookup.lookupTerminal}]`} t={t} />}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>{t.colNonTerminal}</th>
                {llTable.terminals.map(term => (
                  <th key={term} className={ll1Lookup?.lookupTerminal === term ? 'table-col-active' : ''} style={{ textAlign: 'center' }}>
                    <code>{term}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {llTable.nonTerminals.map(nt => {
                const isRowActive = ll1Lookup?.lookupNt === nt;
                return (
                  <tr key={nt} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{nt}</td>
                    {llTable.terminals.map(term => {
                      const prods = llTable.table1.get(nt)?.get(term) || [];
                      return (
                        <TableCell
                          key={term}
                          prods={prods}
                          active={isRowActive && ll1Lookup?.lookupTerminal === term}
                          conflict={prods.length > 1}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* LL(2) analysis and parse tables when the grammar is not LL(1) */}
      {!llTable.isLL1 && (
        <div className="card">
          <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <span>{t.ll2SectionTitle}</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span className={`badge ${llTable.isStrongLL2 ? 'badge-success' : 'badge-danger'}`}>
                {llTable.isStrongLL2 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {t.strongLL2Label}
              </span>
              <span className={`badge ${llTable.isLL2 ? 'badge-success' : 'badge-danger'}`}>
                {llTable.isLL2 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} LL(2)
              </span>
            </div>
          </div>
          <p className="hint-text">{t.ll2Explanation}</p>

          {/* Strong LL(2) parse table M[A, xy] */}
          <div style={{ fontSize: '13px', fontWeight: 700, margin: '14px 0 6px' }}>
            {t.ll2TableTitle}
            {!llTable.isStrongLL2 && <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}> · {t.ll2TableHasConflicts.replace('{count}', llTable.strongLL2Conflicts.length.toString())}</span>}
          </div>
          <p className="hint-text" style={{ marginBottom: '8px', fontSize: '11.5px' }}>{t.ll2TableHint}</p>
          {ll2Lookup && !useContexts && <LookupBanner step={ll2Lookup} label={`M[${ll2Lookup.lookupNt}, ${ll2Lookup.lookupTerminal}]`} t={t} />}
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>{t.colNonTerminal}</th>
                  {llTable.ll2Columns.map(col => (
                    <th
                      key={col}
                      className={!useContexts && ll2Lookup?.lookupTerminal === col ? 'table-col-active' : ''}
                      style={{ textAlign: 'center', whiteSpace: 'nowrap' }}
                    >
                      <code>{fmtLa(col)}</code>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {llTable.nonTerminals.map(nt => {
                  const isRowActive = !useContexts && ll2Lookup?.lookupNt === nt;
                  return (
                    <tr key={nt} className={isRowActive ? 'table-row-active' : ''}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{nt}</td>
                      {llTable.ll2Columns.map(col => (
                        <TableCell
                          key={col}
                          prods={llTable.ll2Table?.get(nt)?.get(col) || []}
                          active={isRowActive && ll2Lookup?.lookupTerminal === col}
                          conflict={ll2Conflicting.has(`${nt}|${col}`)}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Aho–Ullman tables T(A, L) when the strong table has conflicts */}
          {useContexts && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 700, margin: '16px 0 6px' }}>{t.ll2ContextTablesTitle}</div>
              <p className="hint-text" style={{ marginBottom: '8px', fontSize: '11.5px' }}>{t.ll2ContextTablesHint}</p>
              {ll2Lookup && ll2Lookup.lookupTable !== undefined && (
                <LookupBanner step={ll2Lookup} label={`T${ll2Lookup.lookupTable}[${ll2Lookup.lookupTerminal}]`} t={t} />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {llTable.ll2Tables.map(table => {
                  const isActive = ll2Lookup?.lookupTable === table.id;
                  return (
                    <div
                      key={table.id}
                      className="data-table-container"
                      style={{ borderColor: isActive ? 'var(--color-primary)' : undefined, borderWidth: isActive ? 2 : 1 }}
                    >
                      <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, backgroundColor: 'var(--color-bg-elevated)' }}>
                        T{table.id} = T(<span className="sym-nt">{table.nonTerminal}</span>, {formatLookaheadSet(table.follow)})
                      </div>
                      <table className="data-table" style={{ fontSize: '11.5px' }}>
                        <thead>
                          <tr>
                            <th>u</th>
                            <th>{t.colProduction}</th>
                            <th>{t.colTables}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, i) => {
                            const rowActive = isActive && ll2Lookup?.lookupTerminal === row.lookahead;
                            const clash = table.rows.some(r => r.lookahead === row.lookahead && r.production.id !== row.production.id);
                            return (
                              <tr key={i} className={rowActive ? 'table-row-active' : ''}>
                                <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', color: clash ? 'var(--color-danger)' : undefined, fontWeight: clash ? 700 : 400 }}>
                                  {fmtLa(row.lookahead)}
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>({row.production.id}) {rhsText(row.production)}</td>
                                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                                  {row.production.rhs
                                    .map((sym, j) => (row.rhsTables[j] !== null ? `${sym}:T${row.rhsTables[j]}` : null))
                                    .filter(Boolean)
                                    .join(', ') || '–'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {(llTable.strongLL2Conflicts.length > 0 || llTable.ll2Conflicts.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '12px' }}>
              {llTable.strongLL2Conflicts.length > 0 && (
                <div className="report-box danger">
                  <strong>{t.strongLL2Label}: {t.collisionsLabel}</strong>
                  {llTable.strongLL2Conflicts.slice(0, 12).map((c, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--color-text-primary)' }}>
                      M[{c.nonTerminal}, {fmtLa(c.lookahead)}]: {c.productions.map(p => `(${p.id}) ${formatProduction(p)}`).join('  ×  ')}
                    </div>
                  ))}
                </div>
              )}
              {llTable.ll2Conflicts.length > 0 && (
                <div className="report-box danger">
                  <strong>{t.exactLL2Label}: {t.collisionsLabel}{!llTable.ll2Complete ? ` (${t.ll2Incomplete})` : ''}</strong>
                  {llTable.ll2Conflicts.slice(0, 12).map((c, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--color-text-primary)' }}>
                      T({c.nonTerminal}, {formatLookaheadSet(c.context || [])}) [{fmtLa(c.lookahead)}]: {c.productions.map(p => `(${p.id})`).join(' × ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interactive Top-Down Simulator */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span>{t.parsingSimulator} ({k === 1 ? t.topDownLL : t.topDownLL2})</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} role="group" aria-label={t.lookaheadLength}>
            <span className="hint-text">{t.lookaheadLength}</span>
            {([1, 2] as const).map(v => (
              <button
                key={v}
                type="button"
                className={`btn ${k === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 10px', fontSize: '11px' }}
                aria-pressed={k === v}
                onClick={() => setK(v)}
              >
                LL({v})
              </button>
            ))}
          </div>
        </div>
        {k === 2 && (
          <p className="hint-text" style={{ marginBottom: '8px' }}>
            {useContexts ? t.simUsesContextTables : t.simUsesStrongTable}
          </p>
        )}

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
        {((k === 1 && !llTable.isLL1) || (k === 2 && !llTable.isLL2)) && (
          <div className="conflict-pick-note" style={{ marginBottom: '10px' }}>{t.simulatorConflictWarning}</div>
        )}

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
                  const table = currentStep.stackTables?.[idx];
                  return (
                    <span key={idx} className={`badge ${isTop ? 'chip-top-stack' : grammar.nonTerminals.has(sym) ? 'badge-primary' : 'badge-success'}`}>
                      {sym}
                      {table !== null && table !== undefined && <sub style={{ marginLeft: '2px' }}>T{table}</sub>}
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
                  <span key={idx} className={`badge ${idx < k ? 'chip-decision-input' : 'badge-success'}`}>
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
                <strong>{t.leftParse}:</strong> {currentStep.leftParse.length > 0 ? currentStep.leftParse.join(' ') : EPSILON}
              </div>
            )}
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

/** A parse-table cell with one rule per line; conflicts in red, the cell in use highlighted. */
const TableCell: React.FC<{ prods: Production[]; active: boolean; conflict: boolean }> = ({ prods, active, conflict }) => (
  <td
    className={active ? 'table-cell-active' : ''}
    style={{
      textAlign: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: '11.5px',
      whiteSpace: 'nowrap',
      backgroundColor: active ? undefined : conflict ? 'var(--color-danger-subtle)' : undefined,
      color: active ? '#ffffff' : conflict ? 'var(--color-danger)' : undefined,
      fontWeight: active || conflict ? 700 : 400
    }}
  >
    {prods.map(p => (
      <div key={p.id} title={formatProduction(p)}>{rhsText(p)}<sub style={{ opacity: 0.75 }}>{p.id}</sub></div>
    ))}
  </td>
);

const LookupBanner: React.FC<{ step: LLParseStep; label: string; t: (typeof TRANSLATIONS)['en'] | (typeof TRANSLATIONS)['cz'] }> = ({ step, label, t }) => (
  <div className="active-lookup-banner">
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{t.activeTableLookup}</span>
      <span className="active-lookup-badge">{label}</span>
    </div>
    {step.production && (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', fontWeight: 700, color: 'var(--color-primary)' }}>
        ➔ ({step.production.id}) {formatProduction(step.production)}
      </div>
    )}
  </div>
);
