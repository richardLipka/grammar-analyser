import React from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, Info, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText } from '../components/Symbols';
import { exportGrammarToLatex } from '../../core/export/latexExport';

type TabId = 'overview' | 'firstFollow' | 'transformations' | 'll' | 'lr' | 'graph' | 'words' | 'latex';
type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

interface OverviewViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
  lang: Language;
  onNavigateToTab?: (tab: TabId, lrVariant?: LRVariantName) => void;
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
  onNavigateToTab
}) => {
  const t = TRANSLATIONS[lang];

  // General Issues & Diagnostic Problems
  const unproductiveNts = [...grammar.nonTerminals].filter(nt => !analysis.endable.has(nt));
  const unreachableSymbols = [...grammar.nonTerminals, ...grammar.terminals].filter(s => !analysis.reachable.has(s));
  const immediateLR = [...analysis.leftRecursion.immediate];
  const indirectLR = [...analysis.leftRecursion.indirect];
  const leftRecursiveCount = immediateLR.length + indirectLR.length;
  const cyclic = [...analysis.cyclic];
  const hasAnyGeneralIssues = unproductiveNts.length > 0 || unreachableSymbols.length > 0 || leftRecursiveCount > 0 || cyclic.length > 0;
  const emptyLanguage = !analysis.endable.has(grammar.startSymbol);
  const epsInLanguage = analysis.nullable.has(grammar.startSymbol);

  const lrBadges: { variant: LRVariantName; label: string; table: LRTable }[] = [
    { variant: 'LR(0)', label: t.isLR0, table: lr0Table },
    { variant: 'SLR(1)', label: t.isSLR1, table: slr1Table },
    { variant: 'LALR(1)', label: t.isLALR1, table: lalr1Table },
    { variant: 'LR(1)', label: t.isLR1, table: lr1Table }
  ];

  const hasAnyConflicts = !llTable.isLL1 || lrBadges.some(b => !b.table.isConflictFree);

  return (
    <div>
      {/* Automata Classification Badges */}
      <div className="card">
        <div className="card-title">
          <span>{t.classification}</span>
          <ShieldCheck size={18} color="var(--color-primary)" />
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>{t.classificationHint}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          <BadgeItem
            label={t.isLL1}
            ok={llTable.isLL1}
            detail={llTable.isLL1 ? t.passZeroConflicts : t.conflictsCount.replace('{count}', llTable.conflicts.length.toString())}
            targetHint={!llTable.isLL1 ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToTab?.('ll')}
          />
          <BadgeItem
            label={t.isLL2}
            ok={llTable.isLL2}
            detail={
              llTable.isLL1
                ? t.ll2ImpliedByLL1
                : llTable.isLL2
                  ? (llTable.isStrongLL2 ? t.ll2StrongToo : t.ll2NotStrong)
                  : t.conflictsCount.replace('{count}', llTable.ll2Conflicts.length.toString())
            }
            targetHint={!llTable.isLL2 ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToTab?.('ll')}
          />
          {lrBadges.map(b => (
            <BadgeItem
              key={b.variant}
              label={b.label}
              ok={b.table.isConflictFree}
              detail={b.table.isConflictFree
                ? `${t.passZeroConflicts} · ${t.statesN.replace('{count}', b.table.states.length.toString())}`
                : `${t.conflictsCount.replace('{count}', b.table.conflicts.length.toString())} · ${t.statesN.replace('{count}', b.table.states.length.toString())}`}
              targetHint={!b.table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
              onClick={() => onNavigateToTab?.('lr', b.variant)}
            />
          ))}
        </div>
      </div>

      {/* Active Conflicts Direct Jump Alert Card */}
      {hasAnyConflicts && (
        <div className="notice-box error" style={{ marginBottom: '16px', padding: '14px 16px' }}>
          <div className="notice-title" style={{ fontSize: '13.5px' }}>
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
                style={{ fontSize: '11.5px', padding: '5px 12px' }}
                onClick={() => onNavigateToTab?.('ll')}
              >
                <span>{t.viewInLLAnalyser.replace('{count}', llTable.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            )}
            {lrBadges.filter(b => b.table.conflicts.length > 0).map(b => (
              <button
                key={b.variant}
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px' }}
                onClick={() => onNavigateToTab?.('lr', b.variant)}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', b.variant).replace('{count}', b.table.conflicts.length.toString())}</span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* General Issues & Diagnostic Problems Card */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.grammarReportsTitle}</span>
            <AlertTriangle size={18} color={hasAnyGeneralIssues ? 'var(--color-warning)' : 'var(--color-success)'} />
          </div>

          <div>
            {hasAnyGeneralIssues ? (
              <span className="badge badge-warning">
                <AlertTriangle size={12} />
                <span>{[
                  unproductiveNts.length > 0 ? t.unproductiveBadge.replace('{count}', unproductiveNts.length.toString()) : null,
                  unreachableSymbols.length > 0 ? t.unreachableBadge.replace('{count}', unreachableSymbols.length.toString()) : null,
                  leftRecursiveCount > 0 ? t.leftRecursionBadge.replace('{count}', leftRecursiveCount.toString()) : null,
                  cyclic.length > 0 ? t.cyclicBadge.replace('{count}', cyclic.length.toString()) : null
                ].filter(Boolean).join(' • ')}</span>
              </span>
            ) : (
              <span className="badge badge-success">
                <CheckCircle2 size={12} />
                <span>{t.cleanGrammarReports}</span>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {emptyLanguage && (
            <div className="report-box danger">
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} />
                <span>{t.emptyLanguageAlert.replace('{S}', grammar.startSymbol)}</span>
              </div>
            </div>
          )}

          {unproductiveNts.length > 0 && (
            <ReportBox
              kind="danger"
              title={t.unproductiveAlert}
              description={t.unproductiveDesc}
              symbols={unproductiveNts}
              action={t.goToTransformations}
              onAction={onNavigateToTab ? () => onNavigateToTab('transformations') : undefined}
            />
          )}

          {unreachableSymbols.length > 0 && (
            <ReportBox
              kind="warning"
              title={t.unreachableAlert}
              description={t.unreachableDesc}
              symbols={unreachableSymbols}
              action={t.goToTransformations}
              onAction={onNavigateToTab ? () => onNavigateToTab('transformations') : undefined}
            />
          )}

          {leftRecursiveCount > 0 && (
            <ReportBox
              kind="warning"
              title={t.leftRecursionAlert}
              description={t.leftRecursionDesc}
              symbols={[
                ...immediateLR.map(nt => `${nt} (${t.immediateLabel})`),
                ...indirectLR.map(nt => `${nt} (${t.indirectLabel})`)
              ]}
              action={t.goToTransformations}
              onAction={onNavigateToTab ? () => onNavigateToTab('transformations') : undefined}
            />
          )}

          {cyclic.length > 0 && (
            <ReportBox
              kind="danger"
              title={t.cyclicAlert}
              description={t.cyclicDesc}
              symbols={cyclic}
              action={t.goToTransformations}
              onAction={onNavigateToTab ? () => onNavigateToTab('transformations') : undefined}
            />
          )}

          {!hasAnyGeneralIssues && (
            <div className="report-box success">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <CheckCircle2 size={15} />
                <span>{t.allProductiveReachable}</span>
              </div>
            </div>
          )}
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
            <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {epsInLanguage ? t.epsInLanguage : t.epsNotInLanguage}
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
          <PropertySet title={t.nullableSymbols} hint={t.nullableHint} items={[...analysis.nullable]} none={t.none} color="var(--color-warning)" />
          <PropertySet
            title={t.endableSymbols}
            hint={t.endableHint}
            items={[...analysis.endable].filter(s => grammar.nonTerminals.has(s))}
            none={t.none}
            color="var(--color-success)"
          />
          <PropertySet title={t.reachableSymbols} hint={t.reachableHint} items={[...analysis.reachable]} none={t.none} color="var(--color-primary)" />
        </div>
      </div>

      {/* Numbered Productions List */}
      <div className="card">
        <div className="card-title">
          <span>{t.productionRules} ({grammar.productions.length})</span>
          <LatexExportButton getLatex={() => exportGrammarToLatex(grammar)} filename="grammar.tex" lang={lang} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {grammar.productions.map(p => (
            <div
              key={p.id}
              style={{
                padding: '6px 10px',
                backgroundColor: 'var(--color-bg-base)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12.5px',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              <ProductionText production={p} nonTerminals={grammar.nonTerminals} showId />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PropertySet: React.FC<{ title: string; hint: string; items: string[]; none: string; color: string }> = ({
  title, hint, items, none, color
}) => (
  <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)' }}>
    <div style={{ fontSize: '12px', fontWeight: 700 }}>{title}</div>
    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{hint}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color, marginTop: '4px', fontWeight: 600 }}>
      {items.length > 0 ? `{ ${items.join(', ')} }` : `∅ (${none})`}
    </div>
  </div>
);

const ReportBox: React.FC<{
  kind: 'danger' | 'warning';
  title: string;
  description: string;
  symbols: string[];
  action?: string;
  onAction?: () => void;
}> = ({ kind, title, description, symbols, action, onAction }) => (
  <div className={`report-box ${kind}`}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <AlertTriangle size={14} />
        <span>{title}</span>
      </div>
      {onAction && action && (
        <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
    <div style={{ fontSize: '12px', marginTop: '3px', color: 'var(--color-text-secondary)' }}>{description}</div>
    <div style={{ marginTop: '5px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>
      {`{ ${symbols.join(', ')} }`}
    </div>
  </div>
);

const BadgeItem: React.FC<{
  label: string;
  ok: boolean;
  detail: string;
  targetHint?: string;
  onClick?: () => void;
}> = ({ label, ok, detail, targetHint, onClick }) => (
  <button
    type="button"
    className={`badge-item-card ${ok ? 'ok' : 'has-conflicts'}`}
    onClick={onClick}
    title={targetHint}
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
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{detail}</div>
    </div>
  </button>
);
