import React from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { LRTable, LRLayout } from '../../core/lr/lrTable';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, Info, ShieldCheck, AlertTriangle, ArrowRight, HelpCircle, GitFork } from 'lucide-react';
import { AmbiguityResult } from '../../core/analyser/ambiguity';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
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
  /** Missing when the computation was stopped before it */
  lr1Table?: LRTable;
  lang: Language;
  /** Conflicts are counted per state for LR(0) in the lecture layout, per table cell otherwise */
  lrLayout: LRLayout;
  onNavigateToTab?: (tab: TabId, lrVariant?: LRVariantName) => void;
  /** Search for a word with two derivation trees */
  ambiguity?: AmbiguityResult;
  provenUnambiguous?: 'LL(1)' | 'LR(1)';
  /** Parts of the analysis the user stopped */
  stopped?: string[];
  /** Removes the useless symbols (one undoable step) */
  onReduce?: () => void;
}

type BadgeStatus = 'ok' | 'no' | 'partial' | 'unknown';

export const OverviewView: React.FC<OverviewViewProps> = ({
  grammar,
  analysis,
  llTable,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  lang,
  lrLayout,
  onNavigateToTab,
  ambiguity,
  provenUnambiguous,
  stopped = [],
  onReduce
}) => {
  const t = TRANSLATIONS[lang];
  const cz = lang === 'cz';
  const precedence = grammar.precedence && grammar.precedence.levels.length > 0 ? grammar.precedence : undefined;

  // General Issues & Diagnostic Problems
  const unproductiveNts = [...grammar.nonTerminals].filter(nt => !analysis.endable.has(nt));
  const unreachableSymbols = [...grammar.nonTerminals, ...grammar.terminals].filter(s => !analysis.reachable.has(s));
  const leftRecursive = [...analysis.leftRecursion.kinds];
  const leftRecursiveCount = leftRecursive.length;
  const kindLabel = { immediate: t.immediateLabel, hidden: t.hiddenLabel, indirect: t.indirectLabel };
  const cyclic = [...analysis.cyclic];
  const hasAnyGeneralIssues = unproductiveNts.length > 0 || unreachableSymbols.length > 0 || leftRecursiveCount > 0 || cyclic.length > 0;
  const emptyLanguage = !analysis.endable.has(grammar.startSymbol);
  const epsInLanguage = analysis.nullable.has(grammar.startSymbol);

  const lrBadges = ([
    { variant: 'LR(0)', label: t.isLR0, table: lr0Table },
    { variant: 'SLR(1)', label: t.isSLR1, table: slr1Table },
    { variant: 'LALR(1)', label: t.isLALR1, table: lalr1Table },
    { variant: 'LR(1)', label: t.isLR1, table: lr1Table }
  ] as { variant: LRVariantName; label: string; table?: LRTable }[]).map(b => ({
    ...b,
    conflictCount: b.table ? (lrLayout === 'lecture' ? b.table.fConflicts : b.table.conflicts).length : 0,
    resolvedCount: b.table?.resolvedConflicts.length ?? 0
  }));
  // The grammar class needs a table without conflicts; precedence only resolves them for the parser
  const lrStatus = (b: (typeof lrBadges)[number]): BadgeStatus =>
    !b.table ? 'unknown' : !b.table.isConflictFree ? 'no' : b.resolvedCount > 0 ? 'partial' : 'ok';
  const lrDetail = (b: (typeof lrBadges)[number]) => {
    if (!b.table) return cz ? 'Nespočteno – výpočet byl zastaven' : 'Not computed – the computation was stopped';
    const states = t.statesN.replace('{count}', b.table.states.length.toString());
    const resolved = b.resolvedCount > 0
      ? (cz ? `${b.resolvedCount} konfl. vyřešeno prioritami` : `${b.resolvedCount} conflict(s) resolved by precedence`)
      : '';
    if (b.table.isConflictFree) return [b.resolvedCount > 0 ? (cz ? 'Ne, ale tabulka je s prioritami bez konfliktů' : 'No, but the table is conflict-free with precedence') : t.passZeroConflicts, resolved, states].filter(Boolean).join(' · ');
    return [t.conflictsCount.replace('{count}', b.conflictCount.toString()), resolved, states].filter(Boolean).join(' · ');
  };
  const ll2Unknown = !llTable.isLL1 && !llTable.ll2Complete;
  const uselessNts = [...grammar.nonTerminals].filter(nt => !analysis.endable.has(nt) || !analysis.reachable.has(nt));

  const hasAnyConflicts = !llTable.isLL1 || lrBadges.some(b => b.table && !b.table.isConflictFree);

  return (
    <div>
      {/* Automata Classification Badges */}
      <div className="card">
        <div className="card-title">
          <span>{t.classification}</span>
          <ShieldCheck size={18} color="var(--color-primary)" />
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>{t.classificationHint}</p>
        {uselessNts.length > 0 && (
          <div className="notice-box warning" style={{ marginBottom: '10px' }}>
            <div className="notice-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} />
                {cz ? 'Klasifikace předpokládá redukovanou gramatiku' : 'The classification assumes a reduced grammar'}
              </span>
              {onReduce && (
                <button type="button" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '11.5px' }} onClick={onReduce}>
                  {cz ? 'Redukovat gramatiku' : 'Reduce the grammar'}
                </button>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              {cz
                ? `Nepoužitelné neterminály { ${uselessNts.join(', ')} } (nenormované nebo nedosažitelné) žádné slovo neovlivní, ale mohou vyvolat kolize LL a měnit množiny FIRST a FOLLOW; pravidla s nimi se při rozboru nikdy nepoužijí. Po redukci platí klasifikace pro gramatiku, která generuje týž jazyk.`
                : `The useless non-terminals { ${uselessNts.join(', ')} } (non-generating or unreachable) affect no word, but they can cause LL conflicts and change the FIRST and FOLLOW sets; their rules are never used in a parse. After the reduction the classification holds for a grammar of the same language.`}
            </p>
          </div>
        )}
        {precedence && (
          <p className="hint-text" style={{ marginBottom: '10px' }}>
            {cz
              ? `Gramatika deklaruje priority a asociativitu (${precedence.levels.map(l => `%${l.assoc} ${l.symbols.join(' ')}`).join('; ')}). Jako v Yaccu/Bisonu řeší konflikty přesun/redukce v tabulkách SLR(1), LALR(1) a LR(1); gramatika sama do třídy tím nepatří.`
              : `The grammar declares precedence and associativity (${precedence.levels.map(l => `%${l.assoc} ${l.symbols.join(' ')}`).join('; ')}). As in Yacc/Bison they resolve shift/reduce conflicts of the SLR(1), LALR(1) and LR(1) tables; the grammar itself does not belong to the class because of them.`}
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          <BadgeItem
            label={t.isLL1}
            status={llTable.isLL1 ? 'ok' : 'no'}
            detail={llTable.isLL1 ? t.passZeroConflicts : t.conflictsCount.replace('{count}', llTable.conflicts.length.toString())}
            targetHint={!llTable.isLL1 ? t.clickToViewErrors : t.clickToViewAnalyser}
            onClick={() => onNavigateToTab?.('ll')}
          />
          <BadgeItem
            label={t.isLL2}
            status={llTable.isLL1 ? 'ok' : ll2Unknown && llTable.ll2Conflicts.length === 0 ? 'unknown' : llTable.isLL2 ? 'ok' : 'no'}
            detail={
              llTable.isLL1
                ? t.ll2ImpliedByLL1
                : ll2Unknown && llTable.ll2Conflicts.length === 0
                  ? (cz ? 'Nezjištěno – přesný test nebyl dokončen' : 'Unknown – the exact test was not finished')
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
              status={lrStatus(b)}
              detail={lrDetail(b)}
              targetHint={b.table && !b.table.isConflictFree ? t.clickToViewErrors : t.clickToViewAnalyser}
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
            {lrBadges.filter(b => b.conflictCount > 0).map(b => (
              <button
                key={b.variant}
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '11.5px', padding: '5px 12px' }}
                onClick={() => onNavigateToTab?.('lr', b.variant)}
              >
                <span>{t.viewInLRAnalyser.replace('{variant}', b.variant).replace('{count}', b.conflictCount.toString())}</span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ambiguity: a witness with its two derivation trees, or why the grammar is unambiguous */}
      <AmbiguityCard
        ambiguity={ambiguity}
        provenUnambiguous={provenUnambiguous}
        stopped={stopped.includes('ambiguity')}
        hasPrecedence={!!precedence}
        resolvedCount={lalr1Table.resolvedConflicts.length}
        cyclic={cyclic.length > 0}
        lang={lang}
      />

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
              symbols={leftRecursive.map(([nt, kinds]) => `${nt} (${kinds.map(k => kindLabel[k]).join(', ')})`)}
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

const BADGE_COLOR: Record<BadgeStatus, string> = {
  ok: 'var(--color-success)',
  no: 'var(--color-danger)',
  partial: 'var(--color-warning)',
  unknown: 'var(--color-text-muted)'
};

const BadgeItem: React.FC<{
  label: string;
  status: BadgeStatus;
  detail: string;
  targetHint?: string;
  onClick?: () => void;
}> = ({ label, status, detail, targetHint, onClick }) => {
  const color = BADGE_COLOR[status];
  return (
    <button
      type="button"
      className={`badge-item-card ${status === 'ok' ? 'ok' : status === 'no' ? 'has-conflicts' : status}`}
      onClick={onClick}
      title={targetHint}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {status === 'ok' || status === 'partial'
          ? <CheckCircle2 size={18} color={color} />
          : status === 'unknown' ? <HelpCircle size={18} color={color} /> : <AlertTriangle size={18} color={color} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color }}>
            {label}
          </span>
          <ArrowRight size={13} className="badge-arrow-icon" color={color} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{detail}</div>
      </div>
    </button>
  );
};

/** Ambiguity of the grammar: two derivation trees of one word, or the reason it is unambiguous. */
const AmbiguityCard: React.FC<{
  ambiguity?: AmbiguityResult;
  provenUnambiguous?: 'LL(1)' | 'LR(1)';
  stopped: boolean;
  hasPrecedence: boolean;
  resolvedCount: number;
  cyclic: boolean;
  lang: Language;
}> = ({ ambiguity, provenUnambiguous, stopped, hasPrecedence, resolvedCount, cyclic, lang }) => {
  const cz = lang === 'cz';
  if (provenUnambiguous) {
    return (
      <div className="report-box success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CheckCircle2 size={15} />
        <span>
          {cz
            ? `Gramatika je jednoznačná: je ${provenUnambiguous} (tabulka bez konfliktů určuje pro každé slovo jediný derivační strom).`
            : `The grammar is unambiguous: it is ${provenUnambiguous} (a conflict-free table determines a single derivation tree for every word).`}
        </span>
      </div>
    );
  }
  if (stopped || !ambiguity) {
    return stopped ? (
      <div className="report-box warning" style={{ marginBottom: '16px' }}>
        {cz ? 'Hledání nejednoznačného slova bylo zastaveno.' : 'The search for an ambiguous word was stopped.'}
      </div>
    ) : null;
  }
  if (ambiguity.kind !== 'ambiguous') {
    return (
      <div className="report-box warning" style={{ marginBottom: '16px', fontSize: '12px' }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GitFork size={14} />
          <span>{cz ? 'Jednoznačnost nebyla rozhodnuta' : 'Ambiguity not decided'}</span>
        </div>
        <div style={{ marginTop: '3px' }}>
          {ambiguity.kind === 'none-found'
            ? (cz
              ? `Gramatika není LR(1), ale žádné slovo do délky ${ambiguity.maxLength} nemá dva derivační stromy. Nejednoznačnost gramatiky obecně nelze algoritmicky rozhodnout; delší slovo s dvěma stromy existovat může.`
              : `The grammar is not LR(1), but no word up to length ${ambiguity.maxLength} has two derivation trees. Ambiguity is undecidable in general; a longer word with two trees may exist.`)
            : (cz
              ? `Hledání slova se dvěma derivačními stromy dosáhlo svého limitu (${ambiguity.forms} větných forem) bez výsledku.`
              : `The search for a word with two derivation trees reached its limit (${ambiguity.forms} sentential forms) without a result.`)}
        </div>
      </div>
    );
  }
  const word = ambiguity.word.join(' ') || 'ε';
  return (
    <div className="card" style={{ border: '1.5px solid var(--color-warning)' }}>
      <div className="card-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitFork size={18} color="var(--color-warning)" />
          {cz ? 'Gramatika je nejednoznačná' : 'The grammar is ambiguous'}
        </span>
      </div>
      <p style={{ fontSize: '12.5px', margin: '0 0 8px' }}>
        {cz ? 'Slovo ' : 'The word '}
        <code className="ambiguity-word">{word}</code>
        {cz
          ? ` má dva různé derivační stromy (levé rozklady ${ambiguity.parses[0].join(' ')} a ${ambiguity.parses[1].join(' ')}). Žádná nejednoznačná gramatika není LL(k) ani LR(k).`
          : ` has two different derivation trees (left parses ${ambiguity.parses[0].join(' ')} and ${ambiguity.parses[1].join(' ')}). No ambiguous grammar is LL(k) or LR(k).`}
        {cyclic && (cz ? ' Gramatika obsahuje cyklus A ⇒+ A, takže některá slova mají nekonečně mnoho stromů.' : ' The grammar has a cycle A ⇒+ A, so some words have infinitely many trees.')}
      </p>
      <div className="ambiguity-trees">
        {ambiguity.trees.map((tree, i) => (
          <div key={i}>
            <div className="hint-text" style={{ marginBottom: '4px' }}>{cz ? `Strom ${i + 1}` : `Tree ${i + 1}`}</div>
            <DerivationTreeVisualizer rootNode={tree} height="230px" filename={`ambiguity_tree_${i + 1}`} lang={lang} />
          </div>
        ))}
      </div>
      {hasPrecedence ? (
        <p className="hint-text" style={{ marginTop: '8px' }}>
          {cz
            ? `Deklarované priority a asociativita vyřešily v tabulce LALR(1) ${resolvedCount} konfliktů přesun/redukce: LR analyzátor z obou stromů zvolí jeden (stejně jako Yacc/Bison). Konflikty bez priorit zůstávají; jsou vidět v záložce Analýza LR.`
            : `The declared precedence and associativity resolved ${resolvedCount} shift/reduce conflict(s) of the LALR(1) table: the LR parser chooses one of the trees (as Yacc/Bison does). Conflicts without precedence remain; they are shown on the LR tab.`}
        </p>
      ) : (
        <div className="notice-box info" style={{ marginTop: '10px' }}>
          <div className="notice-title">
            <Info size={15} />
            <span>{cz ? 'Priority nejsou deklarovány' : 'No precedence is declared'}</span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
            {cz
              ? 'Gramatiku lze přepsat na jednoznačnou (např. výrazy s úrovněmi E, T, F), nebo – jako v Yaccu/Bisonu – ponechat a konflikty LR tabulek vyřešit prioritami a asociativitou operátorů. Řádky priorit se píší před pravidla, nejnižší priorita první:'
              : 'Rewrite the grammar to an unambiguous one (e.g. expressions with the levels E, T, F), or – as in Yacc/Bison – keep it and resolve the conflicts of the LR tables by the precedence and associativity of the operators. The precedence lines go before the rules, lowest precedence first:'}
          </p>
          <pre className="ambiguity-example">{`%left + -
%left * /
%right ^
%right UMINUS
E → E + E | E * E | - E %prec UMINUS | …`}</pre>
        </div>
      )}
    </div>
  );
};
