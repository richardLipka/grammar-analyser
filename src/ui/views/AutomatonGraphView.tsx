import React, { useState } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { LRTable, formatAction } from '../../core/lr/lrTable';
import { formatLR0Item, formatLR1Item } from '../../core/lr/lrItem';
import { AutomatonGraphVisualizer } from '../visualizer/AutomatonGraphVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Network, Info, ArrowRight } from 'lucide-react';

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
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedVariant, setSelectedVariant] = useState<'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)'>('SLR(1)');
  const [selectedStateId, setSelectedStateId] = useState<number | null>(0);

  const activeAutomaton = selectedVariant === 'LR(0)'
    ? lr0Automaton
    : selectedVariant === 'SLR(1)'
    ? slr1Automaton
    : selectedVariant === 'LALR(1)'
    ? lalr1Automaton
    : lr1Automaton;

  const activeTable = selectedVariant === 'LR(0)'
    ? lr0Table
    : selectedVariant === 'SLR(1)'
    ? slr1Table
    : selectedVariant === 'LALR(1)'
    ? lalr1Table
    : lr1Table;

  const selectedState = activeAutomaton.states.find(s => s.id === selectedStateId);

  return (
    <div>
      {/* Header controls & variant selector */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="var(--color-primary)" />
            <span>LR Automaton State Graph</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
              <button
                key={v}
                className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => { setSelectedVariant(v); setSelectedStateId(0); }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Interactive state transition graph (DFA of item sets). Click any state to inspect items and table row. Drag background to pan, scroll to zoom.
        </p>
      </div>

      {/* Main Graph Canvas */}
      <AutomatonGraphVisualizer
        automaton={activeAutomaton}
        selectedStateId={selectedStateId}
        onSelectState={setSelectedStateId}
      />

      {/* Selected State Inspector Drawer */}
      {selectedState && (
        <div className="card" style={{ marginTop: '16px', border: '2px solid var(--color-primary)' }}>
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} color="var(--color-primary)" />
              <span>Inspecting State {selectedState.id} {selectedState.id === 0 ? '(Start State)' : ''}</span>
            </div>
            <span className="badge badge-primary">{selectedVariant}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {/* Item Sets in State */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                LR Items in State:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(selectedVariant === 'LR(1)' || selectedVariant === 'LALR(1)'
                  ? (selectedState.items1 || [])
                  : selectedState.items0
                ).map((item, idx) => {
                  const str = (selectedVariant === 'LR(1)' || selectedVariant === 'LALR(1)')
                    ? formatLR1Item(item as any)
                    : formatLR0Item(item as any);

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'var(--color-bg-base)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px'
                      }}
                    >
                      {str}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Outgoing Transitions */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Outgoing Transitions ({selectedState.transitions.size}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[...selectedState.transitions.entries()].map(([sym, targetId]) => (
                  <button
                    key={sym}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => setSelectedStateId(targetId)}
                  >
                    <span style={{ fontWeight: 700, color: grammar.terminals.has(sym) ? 'var(--color-success)' : 'var(--color-primary)' }}>
                      {sym}
                    </span>
                    <ArrowRight size={12} style={{ margin: '0 4px' }} />
                    <span>State {targetId}</span>
                  </button>
                ))}
              </div>

              {/* Table Row Preview */}
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                  Parsing Table Row for State {selectedState.id}:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeTable.terminals.map(term => {
                    const acts = activeTable.actionTable.get(selectedState.id)?.get(term) || [];
                    if (acts.length === 0) return null;
                    return (
                      <span key={term} className="badge badge-primary">
                        {term} &rarr; {acts.map(formatAction).join('/')}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
