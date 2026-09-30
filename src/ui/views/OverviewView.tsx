import React from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, Info, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';

interface OverviewViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  lang: Language;
  onNavigateToAnalyser?: (tab: 'll' | 'lr', lrVariant?: 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)') => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  grammar,
  analysis,
  llTable,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  lang,
  onNavigateToAnalyser
}) => {
  const t = TRANSLATIONS[lang];

  const hasAnyConflicts =
    !llTable.isLL1 ||
    !slr1Table.isConflictFree ||
    !lr0Table.isConflictFree ||
    !lalr1Table.isConflictFree ||
    !lr1Table.isConflictFree;

  return (
    <div>
      {/* Automata Classification Badges */}
      <div className="card">
        <div className="card-title">
          <span>{t.classification}</span>
          <ShieldCheck size={18} color="var(--color-primary)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          <BadgeItem
            label={t.isLL1}
            ok={llTable.isLL1}
            conflictsCount={llTable.conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!llTable.isLL1 ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('ll')}
          />
          <BadgeItem
            label={t.isLL2}
            ok={llTable.isLL2}
            conflictsCount={llTable.ll2Conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!llTable.isLL2 ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('ll')}
          />
          <BadgeItem
            label={t.isLR0}
            ok={lr0Table.isConflictFree}
            conflictsCount={lr0Table.conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!lr0Table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('lr', 'LR(0)')}
          />
          <BadgeItem
            label={t.isSLR1}
            ok={slr1Table.isConflictFree}
            conflictsCount={slr1Table.conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!slr1Table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('lr', 'SLR(1)')}
          />
          <BadgeItem
            label={t.isLALR1}
            ok={lalr1Table.isConflictFree}
            conflictsCount={lalr1Table.conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!lalr1Table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('lr', 'LALR(1)')}
          />
          <BadgeItem
            label={t.isLR1}
            ok={lr1Table.isConflictFree}
            conflictsCount={lr1Table.conflicts.length}
            passText={t.passZeroConflicts}
            conflictsSuffix={t.conflictsCountSuffix}
            targetHint={!lr1Table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToAnalyser?.('lr', 'LR(1)')}
          />
        </div>
      </div>

      {/* Active Conflicts Direct Jump Alert Card */}
      {hasAnyConflicts && (
        <div
          style={{
            backgroundColor: 'var(--color-danger-subtle)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '13.5px' }}>
            <AlertTriangle size={18} />
            <span>{t.overviewConflictsTitle}</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '6px 0 10px 0', lineHeight: '1.4' }}>
            {t.overviewConflictsDesc}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {llTable.conflicts.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onNavigateToAnalyser?.('ll')}
              >
                <span>{t.viewInLLAnalyser.replace('{count}', llTable.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
            {lr0Table.conflicts.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onNavigateToAnalyser?.('lr', 'LR(0)')}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', 'LR(0)').replace('{count}', lr0Table.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
            {slr1Table.conflicts.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onNavigateToAnalyser?.('lr', 'SLR(1)')}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', 'SLR(1)').replace('{count}', slr1Table.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
            {lalr1Table.conflicts.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onNavigateToAnalyser?.('lr', 'LALR(1)')}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', 'LALR(1)').replace('{count}', lalr1Table.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
            {lr1Table.conflicts.length > 0 && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => onNavigateToAnalyser?.('lr', 'LR(1)')}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', 'LR(1)').replace('{count}', lr1Table.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}

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
              {analysis.nullable.size > 0 ? `{ ${[...analysis.nullable].join(', ')} }` : `∅ (${t.none})`}
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
        <div className="card-title">{t.productionRules} ({grammar.productions.length})</div>
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

const BadgeItem: React.FC<{
  label: string;
  ok: boolean;
  conflictsCount: number;
  passText: string;
  conflictsSuffix: string;
  targetHint?: string;
  onClick?: () => void;
}> = ({
  label,
  ok,
  conflictsCount,
  passText,
  conflictsSuffix,
  targetHint,
  onClick
}) => {
  return (
    <button
      type="button"
      className={`badge-item-card ${ok ? 'ok' : 'has-conflicts'}`}
      onClick={onClick}
      title={targetHint || (ok ? passText : `${conflictsCount} ${conflictsSuffix}`)}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {ok ? <CheckCircle2 size={18} color="var(--color-success)" /> : <AlertTriangle size={18} color="var(--color-danger)" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {label}
          </span>
          <ArrowRight size={13} className="badge-arrow-icon" color={ok ? 'var(--color-success)' : 'var(--color-danger)'} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          {ok ? passText : `${conflictsCount} ${conflictsSuffix}`}
        </div>
        {!ok && (
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-danger)', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {targetHint}
          </div>
        )}
      </div>
    </button>
  );
};

