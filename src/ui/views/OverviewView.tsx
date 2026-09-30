import React from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, XCircle, Info, ShieldCheck, AlertTriangle } from 'lucide-react';

interface OverviewViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  lang: Language;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
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

  return (
    <div>
      {/* Automata Classification Badges */}
      <div className="card">
        <div className="card-title">
          <span>{t.classification}</span>
          <ShieldCheck size={18} color="var(--color-primary)" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <BadgeItem label={t.isLL1} ok={llTable.isLL1} conflictsCount={llTable.conflicts.length} />
          <BadgeItem label={t.isLL2} ok={llTable.isLL2} conflictsCount={llTable.ll2Conflicts.length} />
          <BadgeItem label={t.isLR0} ok={lr0Table.isConflictFree} conflictsCount={lr0Table.conflicts.length} />
          <BadgeItem label={t.isSLR1} ok={slr1Table.isConflictFree} conflictsCount={slr1Table.conflicts.length} />
          <BadgeItem label={t.isLALR1} ok={lalr1Table.isConflictFree} conflictsCount={lalr1Table.conflicts.length} />
          <BadgeItem label={t.isLR1} ok={lr1Table.isConflictFree} conflictsCount={lr1Table.conflicts.length} />
        </div>
      </div>

      {/* Grammar Properties */}
      <div className="card">
        <div className="card-title">
          <span>{t.grammarProperties}</span>
          <Info size={18} color="var(--color-text-secondary)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.startSymbol}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
              {grammar.startSymbol}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.nonTerminals} ({grammar.nonTerminals.size})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
              {[...grammar.nonTerminals].map(nt => (
                <span key={nt} className="badge badge-primary">{nt}</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.terminals} ({grammar.terminals.size})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
              {[...grammar.terminals].map(tm => (
                <span key={tm} className="badge badge-success">{tm}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Property Sets */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{t.nullableSymbols}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-warning)', marginTop: '4px' }}>
              {analysis.nullable.size > 0 ? `{ ${[...analysis.nullable].join(', ')} }` : '∅ (none)'}
            </div>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{t.endableSymbols}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-success)', marginTop: '4px' }}>
              {`{ ${[...analysis.endable].filter(s => grammar.nonTerminals.has(s)).join(', ')} }`}
            </div>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{t.reachableSymbols}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-primary)', marginTop: '4px' }}>
              {`{ ${[...analysis.reachable].join(', ')} }`}
            </div>
          </div>
        </div>
      </div>

      {/* Numbered Productions List */}
      <div className="card">
        <div className="card-title">Production Rules ({grammar.productions.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {grammar.productions.map(p => (
            <div
              key={p.id}
              style={{
                padding: '6px 10px',
                backgroundColor: 'var(--color-bg-base)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', marginRight: '8px' }}>({p.id})</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{p.lhs}</span>
              <span style={{ color: 'var(--color-text-muted)', margin: '0 6px' }}>&rarr;</span>
              <span>{p.rhs.length === 0 ? 'ε' : p.rhs.join(' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BadgeItem: React.FC<{ label: string; ok: boolean; conflictsCount: number }> = ({ label, ok, conflictsCount }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: ok ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
        border: `1px solid ${ok ? 'var(--color-success)' : 'var(--color-danger)'}`
      }}
    >
      {ok ? <CheckCircle2 size={16} color="var(--color-success)" /> : <AlertTriangle size={16} color="var(--color-danger)" />}
      <div>
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {label}
        </div>
        <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>
          {ok ? 'Pass (0 conflicts)' : `${conflictsCount} conflict(s)`}
        </div>
      </div>
    </div>
  );
};
