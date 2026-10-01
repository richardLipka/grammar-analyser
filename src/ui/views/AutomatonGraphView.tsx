import React, { useEffect, useState } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { LRTable, formatAction } from '../../core/lr/lrTable';
import { AutomatonGraphVisualizer, stateDisplayItems } from '../visualizer/AutomatonGraphVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Network, Info, ArrowRight, AlertTriangle } from 'lucide-react';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

interface AutomatonGraphViewProps {
  grammar: Grammar;
  lr0Automaton: LRAutomaton;
  slr1Automaton: LRAutomaton;
  lalr1Automaton: LRAutomaton;
  lr1Automaton: LRAutomaton;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  lang: Language;
  selectedVariant?: LRVariantName;
  onSelectVariant?: (v: LRVariantName) => void;
}

export const AutomatonGraphView: React.FC<AutomatonGraphViewProps> = ({
  grammar,
  lr0Automaton,
  slr1Automaton,
  lalr1Automaton,
  lr1Automaton,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  lang,
  selectedVariant: controlledVariant,
  onSelectVariant
}) => {
  const t = TRANSLATIONS[lang];
  const [internalVariant, setInternalVariant] = useState<LRVariantName>('SLR(1)');
  const selectedVariant = controlledVariant ?? internalVariant;
  const [selectedStateId, setSelectedStateId] = useState<number | null>(0);

  const setVariant = (v: LRVariantName) => {
    if (onSelectVariant) onSelectVariant(v);
    else setInternalVariant(v);
  };

  const activeAutomaton = { 'LR(0)': lr0Automaton, 'SLR(1)': slr1Automaton, 'LALR(1)': lalr1Automaton, 'LR(1)': lr1Automaton }[selectedVariant];
  const activeTable = { 'LR(0)': lr0Table, 'SLR(1)': slr1Table, 'LALR(1)': lalr1Table, 'LR(1)': lr1Table }[selectedVariant];

  useEffect(() => setSelectedStateId(0), [activeAutomaton]);

  const conflictStates = new Set(activeTable.conflicts.map(c => c.stateId));
  const selectedState = activeAutomaton.states.find(s => s.id === selectedStateId);
  const withLookaheads = selectedVariant === 'LR(1)' || selectedVariant === 'LALR(1)';
  const items = selectedState ? stateDisplayItems(selectedState, withLookaheads) : [];
  const stateConflicts = activeTable.conflicts.filter(c => c.stateId === selectedStateId);

  // LR(0) and SLR(1) share the canonical LR(0) collection; LALR(1) has the same states with lookaheads.
  const sameStatesNote = selectedVariant === 'SLR(1)' || selectedVariant === 'LR(0)'
    ? t.graphSharedLR0
    : selectedVariant === 'LALR(1)'
      ? t.graphLALRMerged.replace('{lr1}', lr1Automaton.states.length.toString()).replace('{lalr}', lalr1Automaton.states.length.toString())
      : '';

  return (
    <div>
      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="var(--color-primary)" />
            <span>{t.graphTitle}</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }} role="group" aria-label={t.variant}>
            {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
              <button
                key={v}
                className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '12px' }}
                aria-pressed={selectedVariant === v}
                onClick={() => setVariant(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <p className="hint-text">{t.graphDesc}</p>
        <p className="hint-text" style={{ marginTop: '4px' }}>{t.graphLegend}</p>
        <p className="hint-text" style={{ marginTop: '4px' }}>
          <strong>{t.statesCount}</strong> {activeAutomaton.states.length}
          {sameStatesNote && <> · {sameStatesNote}</>}
          {conflictStates.size > 0 && (
            <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
              {' '}· {t.graphConflictStates.replace('{states}', [...conflictStates].join(', '))}
            </span>
          )}
        </p>
      </div>

      <AutomatonGraphVisualizer
        automaton={activeAutomaton}
        selectedStateId={selectedStateId}
        onSelectState={setSelectedStateId}
        conflictStates={conflictStates}
        lang={lang}
      />

      {selectedState && (
        <div className="card" style={{ marginTop: '16px', border: '2px solid var(--color-primary)' }}>
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} color="var(--color-primary)" />
              <span>{t.inspectingState.replace('{id}', selectedState.id.toString())} {selectedState.id === 0 ? t.startState : ''}</span>
            </div>
            <span className="badge badge-primary">{selectedVariant}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              {(['kernel', 'closure'] as const).map(kind => {
                const list = items.filter(i => (kind === 'kernel' ? i.isKernel : !i.isKernel));
                if (list.length === 0) return null;
                return (
                  <div key={kind} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                      {kind === 'kernel' ? t.kernelItems : t.closureItems}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {list.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '5px 10px',
                            backgroundColor: 'var(--color-bg-base)',
                            borderRadius: 'var(--radius-sm)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            borderLeft: it.isComplete ? '3px solid var(--color-warning)' : '3px solid transparent'
                          }}
                        >
                          <span>
                            <span className="sym-nt">{it.lhs}</span>
                            <span className="sym-arrow">→</span>
                            {it.before.join(' ')} <strong style={{ color: 'var(--color-danger)' }}>•</strong> {it.after.join(' ')}
                          </span>
                          {it.lookaheads && (
                            <span className="badge badge-primary" style={{ padding: '1px 6px' }}>{it.lookaheads.join(' / ')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="hint-text" style={{ fontSize: '11.5px' }}>{t.closureHint}</div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                {t.outgoingTransitions.replace('{count}', selectedState.transitions.size.toString())}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[...selectedState.transitions.entries()].map(([sym, targetId]) => (
                  <button
                    key={sym}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => setSelectedStateId(targetId)}
                    title={`GOTO(${selectedState.id}, ${sym}) = ${targetId}`}
                  >
                    <span className={grammar.terminals.has(sym) ? 'sym-t' : 'sym-nt'}>{sym}</span>
                    <ArrowRight size={12} style={{ margin: '0 4px' }} />
                    <span>{t.stateLabel} {targetId}</span>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                  {t.tableRowForState.replace('{id}', selectedState.id.toString())}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeTable.terminals.map(term => {
                    const acts = activeTable.actionTable.get(selectedState.id)?.get(term) || [];
                    if (acts.length === 0) return null;
                    return (
                      <span key={term} className={`badge ${acts.length > 1 ? 'badge-danger' : 'badge-primary'}`}>
                        {term} &rarr; {acts.map(formatAction).join(' / ')}
                      </span>
                    );
                  })}
                </div>
              </div>

              {stateConflicts.length > 0 && (
                <div className="report-box danger" style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <AlertTriangle size={14} />
                    {t.conflictsInState}
                  </div>
                  {stateConflicts.map((c, i) => (
                    <div key={i} style={{ marginTop: '4px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {c.type} [{c.symbol}]: {c.actions.map(a => a.production ? `${formatAction(a)} (${formatProduction(a.production)})` : formatAction(a)).join(' vs ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
