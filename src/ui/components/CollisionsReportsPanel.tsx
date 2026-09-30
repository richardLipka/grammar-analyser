import React, { useState } from 'react';
import { Grammar, formatProduction, formatRhs } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable, formatAction } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  Layers,
  Sparkles,
  Info,
  Cpu,
  ArrowRight
} from 'lucide-react';

interface CollisionsReportsPanelProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  lang: Language;
}

export const CollisionsReportsPanel: React.FC<CollisionsReportsPanelProps> = ({
  grammar,
  analysis,
  llTable,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLrVariant, setSelectedLrVariant] = useState<'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)'>('SLR(1)');

  // Diagnostic Sets
  const unproductiveNts = [...grammar.nonTerminals].filter(nt => !analysis.endable.has(nt));
  const unreachableSymbols = [...grammar.nonTerminals, ...grammar.terminals].filter(s => !analysis.reachable.has(s));
  const nullableNts = [...analysis.nullable];

  // Immediate Left Recursion Detection (A -> A alpha)
  const leftRecursiveNts = [
    ...new Set(grammar.productions.filter(p => p.rhs.length > 0 && p.rhs[0] === p.lhs).map(p => p.lhs))
  ];

  // Total collision counts
  const llConflictsCount = llTable.conflicts.length;
  const slr1ConflictsCount = slr1Table.conflicts.length;
  const lr1ConflictsCount = lr1Table.conflicts.length;
  const lr0ConflictsCount = lr0Table.conflicts.length;

  const totalCollisions = llConflictsCount + slr1ConflictsCount;
  const hasAnyCollisions = llConflictsCount > 0 || slr1ConflictsCount > 0 || lr1ConflictsCount > 0 || lr0ConflictsCount > 0;
  const hasAnyWarnings = unproductiveNts.length > 0 || unreachableSymbols.length > 0 || leftRecursiveNts.length > 0;

  // Selected LR Table
  const activeLrTable =
    selectedLrVariant === 'LR(0)'
      ? lr0Table
      : selectedLrVariant === 'LALR(1)'
      ? lalr1Table
      : selectedLrVariant === 'LR(1)'
      ? lr1Table
      : slr1Table;

  return (
    <div className="collisions-reports-panel">
      {/* Top Summary Bar */}
      <div className="collisions-reports-bar">
        {/* Left: Icon, Title & Diagnostic Warning Badges */}
        <div className="collisions-reports-title-area">
          <div className="collisions-reports-title">
            {hasAnyCollisions ? (
              <ShieldAlert size={17} color="var(--color-danger)" />
            ) : hasAnyWarnings ? (
              <AlertTriangle size={17} color="var(--color-warning)" />
            ) : (
              <ShieldCheck size={17} color="var(--color-success)" />
            )}
            <span>{t.collisionsAndReportsTitle}</span>
          </div>

          <div className="collisions-reports-badges">
            {/* Overall Collisions Badge */}
            {hasAnyCollisions ? (
              <button
                type="button"
                className="badge badge-danger"
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setIsExpanded(true)}
                title={t.showDetails}
              >
                <AlertTriangle size={11} />
                <span>{t.collisionsSummaryBadge.replace('{count}', totalCollisions.toString())}</span>
              </button>
            ) : (
              <span className="badge badge-success">
                <CheckCircle2 size={11} />
                <span>{t.noCollisionsFound}</span>
              </span>
            )}

            {/* Diagnostic Badges */}
            {unproductiveNts.length > 0 && (
              <span className="badge badge-danger" title={t.unproductiveDesc}>
                {t.unproductiveBadge.replace('{count}', unproductiveNts.length.toString())}
              </span>
            )}

            {unreachableSymbols.length > 0 && (
              <span className="badge badge-warning" title={t.unreachableDesc}>
                {t.unreachableBadge.replace('{count}', unreachableSymbols.length.toString())}
              </span>
            )}

            {leftRecursiveNts.length > 0 && (
              <span className="badge badge-warning" title={t.leftRecursionDesc}>
                {t.leftRecursionBadge.replace('{count}', leftRecursiveNts.length.toString())}
              </span>
            )}

            {!hasAnyWarnings && !hasAnyCollisions && (
              <span className="badge badge-primary">
                <Sparkles size={11} />
                <span>{t.cleanGrammarReports}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick Automata Classification Chips & Expand Toggle */}
        <div className="collisions-reports-right-controls">
          <div className="classification-chips-group">
            {/* LL(1) Chip */}
            <span className={`classification-chip ${llTable.isLL1 ? 'chip-pass' : 'chip-fail'}`}>
              <span>{t.ll1Badge}:</span>
              <span>{llTable.isLL1 ? t.passZero : t.conflictsShort.replace('{count}', llConflictsCount.toString())}</span>
            </span>

            {/* SLR(1) Chip */}
            <span className={`classification-chip ${slr1Table.isConflictFree ? 'chip-pass' : 'chip-fail'}`}>
              <span>{t.slr1Badge}:</span>
              <span>{slr1Table.isConflictFree ? t.passZero : t.conflictsShort.replace('{count}', slr1ConflictsCount.toString())}</span>
            </span>

            {/* LR(1) Chip */}
            <span className={`classification-chip ${lr1Table.isConflictFree ? 'chip-pass' : 'chip-fail'}`}>
              <span>{t.lr1Badge}:</span>
              <span>{lr1Table.isConflictFree ? t.passZero : t.conflictsShort.replace('{count}', lr1ConflictsCount.toString())}</span>
            </span>
          </div>

          {/* Details Toggle Button */}
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 10px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? t.hideDetails : t.showDetails}
          >
            <span>{isExpanded ? t.hideDetails : t.showDetails}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded Details Drawer */}
      {isExpanded && (
        <div className="collisions-reports-details">
          {/* Column 1: Detailed Parsing Collisions */}
          <div className="reports-column">
            {/* LL(1) & LL(2) Collisions Section */}
            <div>
              <div className="reports-subheading">
                <span>{t.llConflictsTitle}</span>
                {llTable.isLL1 ? (
                  <span className="badge badge-success"><CheckCircle2 size={11} /> {t.ll1Valid}</span>
                ) : llTable.isLL2 ? (
                  <span className="badge badge-warning"><CheckCircle2 size={11} /> {t.ll2Valid}</span>
                ) : (
                  <span className="badge badge-danger"><AlertTriangle size={11} /> {t.notLL}</span>
                )}
              </div>

              {llTable.conflicts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {llTable.conflicts.map((c, idx) => (
                    <div key={idx} className="conflict-detail-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                          {c.conflictType === 'First/First' ? t.firstFirstConflict : t.firstFollowConflict}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {t.forNonTerminal} <strong style={{ color: 'var(--color-primary)' }}>{c.nonTerminal}</strong>, {t.withLookahead} <strong style={{ color: 'var(--color-text-primary)' }}>'{c.lookahead}'</strong>
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                        <span style={{ color: 'var(--color-text-muted)', marginRight: '4px' }}>{t.conflictingRules}:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className="report-box success" style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} />
                    <span>{t.noLLConflicts}</span>
                  </div>
                </div>
              )}
            </div>

            {/* LR Collisions Section */}
            <div style={{ marginTop: '8px' }}>
              <div className="reports-subheading">
                <span>{t.lrConflictsTitle}</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`btn ${selectedLrVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '2px 6px', fontSize: '10.5px' }}
                      onClick={() => setSelectedLrVariant(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {activeLrTable.conflicts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {activeLrTable.conflicts.map((c, idx) => (
                    <div key={idx} className="conflict-detail-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                          {c.type === 'Shift/Reduce' ? t.shiftReduceConflict : t.reduceReduceConflict}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {t.stateLabel} <strong style={{ color: 'var(--color-primary)' }}>{c.stateId}</strong>, {t.onSymbol} <strong style={{ color: 'var(--color-text-primary)' }}>'{c.symbol}'</strong>
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                        <span style={{ color: 'var(--color-text-muted)', marginRight: '4px' }}>{t.conflictingActions}:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                          {c.actions.map((act, actIdx) => (
                            <span
                              key={actIdx}
                              style={{
                                padding: '2px 6px',
                                backgroundColor: 'var(--color-bg-base)',
                                borderRadius: 'var(--radius-sm)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                border: '1px solid var(--color-border)'
                              }}
                            >
                              <strong>{formatAction(act)}</strong>
                              {act.production && ` (${formatProduction(act.production)})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="report-box success" style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} />
                    <span>{t.noLRConflicts.replace('{variant}', selectedLrVariant)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Grammar Health & Diagnostic Reports */}
          <div className="reports-column">
            <div className="reports-subheading">
              <span>{t.grammarReportsTitle}</span>
              <Info size={14} color="var(--color-text-secondary)" />
            </div>

            {/* Unproductive / Non-generating Non-Terminals */}
            {unproductiveNts.length > 0 && (
              <div className="report-box danger">
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertTriangle size={13} />
                  <span>{t.unproductiveAlert}</span>
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {t.unproductiveDesc}
                </div>
                <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>
                  {`{ ${unproductiveNts.join(', ')} }`}
                </div>
              </div>
            )}

            {/* Unreachable Symbols */}
            {unreachableSymbols.length > 0 && (
              <div className="report-box warning">
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertTriangle size={13} />
                  <span>{t.unreachableAlert}</span>
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {t.unreachableDesc}
                </div>
                <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>
                  {`{ ${unreachableSymbols.join(', ')} }`}
                </div>
              </div>
            )}

            {/* Immediate Left Recursion */}
            {leftRecursiveNts.length > 0 && (
              <div className="report-box warning">
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertTriangle size={13} />
                  <span>{t.leftRecursionAlert}</span>
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {t.leftRecursionDesc}
                </div>
                <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>
                  {`{ ${leftRecursiveNts.join(', ')} }`}
                </div>
              </div>
            )}

            {/* Clean Status if no unproductive and no unreachable */}
            {unproductiveNts.length === 0 && unreachableSymbols.length === 0 && (
              <div className="report-box success">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} />
                  <span>{t.allProductiveReachable}</span>
                </div>
              </div>
            )}

            {/* Nullable Non-terminals */}
            <div className="report-box info">
              <div style={{ fontWeight: 700 }}>
                {t.nullableReport}:
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', marginTop: '2px', fontSize: '12px' }}>
                {nullableNts.length > 0 ? `{ ${nullableNts.join(', ')} }` : `∅ (${t.none})`}
              </div>
            </div>

            {/* Summary Grammar Info */}
            <div style={{
              padding: '8px 10px',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11.5px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>{t.startSymbol}: </span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{grammar.startSymbol}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>{t.nonTerminals}: </span>
                <strong>{grammar.nonTerminals.size}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>{t.terminals}: </span>
                <strong>{grammar.terminals.size}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>{t.productionRules}: </span>
                <strong>{grammar.productions.length}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
