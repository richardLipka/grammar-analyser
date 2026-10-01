import React, { useEffect, useRef, useState } from 'react';
import { Grammar, EPSILON, formatRhs } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLConflict } from '../../core/ll/llTable';
import {
  AvailableSymbolTransformation,
  TransformationResult,
  applySymbolTransformation,
  getAvailableTransformationsForSymbol,
  getAvailableTransformationsForOccurrence
} from '../../core/processor/grammarProcessor';
import { Language, TRANSLATIONS } from '../../i18n/translations';

interface GrammarClickViewProps {
  grammar: Grammar;
  /** Analysis of exactly this grammar (FIRST/FOLLOW and LL(1) conflicts); omitted while it is being recomputed */
  analysis?: GrammarAnalysis;
  llConflicts?: LLConflict[];
  lang: Language;
  onApply: (result: TransformationResult, title: { en: string; cz: string }) => void;
}

type Target =
  | { kind: 'lhs'; nt: string }
  | { kind: 'occ'; nt: string; productionId: number; position: number };

const POPOVER_WIDTH = 360;

/**
 * The grammar with clickable non-terminals: a left-hand side opens the
 * transformations of the whole non-terminal, an occurrence on a right-hand
 * side opens the transformations of that occurrence. A chosen transformation
 * is applied at once (and can be undone by the caller's history).
 */
export const GrammarClickView: React.FC<GrammarClickViewProps> = ({ grammar, analysis, llConflicts, lang, onApply }) => {
  const t = TRANSLATIONS[lang];
  const [target, setTarget] = useState<Target | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click, Escape, scrolling and when the grammar changes
  useEffect(() => {
    if (!target) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setTarget(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTarget(null);
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) setTarget(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    popoverRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [target]);
  useEffect(() => setTarget(null), [grammar]);

  const order = [
    grammar.startSymbol,
    ...[...new Set(grammar.productions.map(p => p.lhs))].filter(nt => nt !== grammar.startSymbol)
  ].filter(nt => grammar.productions.some(p => p.lhs === nt));

  // LL(1) conflicts per non-terminal: FIRST-FIRST and FIRST-FOLLOW lookaheads
  const conflictsOf = (nt: string) => {
    const own = (llConflicts || []).filter(c => c.nonTerminal === nt);
    return {
      ff: own.filter(c => c.conflictType === 'First/First').map(c => c.lookahead),
      ffl: own.filter(c => c.conflictType === 'First/Follow').map(c => c.lookahead)
    };
  };
  const firstOf = (sym: string) => (grammar.nonTerminals.has(sym) ? analysis?.first1.get(sym) || new Set<string>() : new Set([sym]));

  /** Does the transformation address an LL(1) conflict of the clicked non-terminal? */
  const helps = (tr: AvailableSymbolTransformation, nt: string): boolean => {
    const c = conflictsOf(nt);
    if (tr.type === 'leftFactor' || tr.type === 'expandLeadingNT') return c.ff.length > 0;
    if (tr.type === 'eliminateImmediateLeftRecursion' || tr.type === 'eliminateImmediateLeftRecursionEpsFree') return true;
    if (tr.type === 'absorbFollowing' && tr.details?.follower && tr.details.occurrence) {
      const owner = grammar.productions.find(p => p.id === tr.details!.occurrence!.productionId)?.rhs[tr.details.occurrence.position];
      const ownerConflicts = owner ? conflictsOf(owner).ffl : [];
      return [...firstOf(tr.details.follower)].some(a => ownerConflicts.includes(a));
    }
    return false;
  };

  const open = (e: React.MouseEvent<HTMLButtonElement>, next: Target) => {
    e.stopPropagation();
    setAnchor(e.currentTarget.getBoundingClientRect());
    setTarget(next);
  };

  const apply = (nt: string, tr: AvailableSymbolTransformation) => {
    setTarget(null);
    onApply(applySymbolTransformation(grammar, nt, tr.id), { en: tr.labelEn, cz: tr.labelCz });
  };

  const renderActions = (list: AvailableSymbolTransformation[], nt: string) =>
    list.map(tr => {
      const recommended = helps(tr, nt);
      return (
        <button key={tr.id} type="button" className={`cg-action ${recommended ? 'recommended' : ''}`} onClick={() => apply(nt, tr)}>
          <span className="cg-action-label">
            {lang === 'cz' ? tr.labelCz : tr.labelEn}
            {recommended && <span className="cg-tag">{t.cgHelpsWithConflict}</span>}
          </span>
          <span className="cg-action-desc">{lang === 'cz' ? tr.descriptionCz : tr.descriptionEn}</span>
        </button>
      );
    });

  const popover = () => {
    if (!target || !anchor) return null;
    const nt = target.nt;
    const symbolActions = getAvailableTransformationsForSymbol(grammar, nt);
    const occActions = target.kind === 'occ'
      ? getAvailableTransformationsForOccurrence(grammar, { productionId: target.productionId, position: target.position })
      : [];
    const prod = target.kind === 'occ' ? grammar.productions.find(p => p.id === target.productionId) : undefined;
    const c = conflictsOf(nt);
    const below = window.innerHeight - anchor.bottom > 260;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8));
    const style: React.CSSProperties = below
      ? { left, top: anchor.bottom + 4, maxHeight: window.innerHeight - anchor.bottom - 16 }
      : { left, bottom: window.innerHeight - anchor.top + 4, maxHeight: anchor.top - 16 };

    return (
      <div ref={popoverRef} className="cg-popover" style={{ ...style, width: POPOVER_WIDTH }} role="dialog" aria-label={nt}>
        <div className="cg-popover-head">
          <span className="sym-nt">{nt}</span>
          {prod && <span className="cg-muted"> {t.cgInRule.replace('{rule}', `${prod.lhs} → ${formatRhs(prod.rhs)}`)}</span>}
          {analysis && (
            <div className="cg-muted cg-sets">
              FIRST₁ = {`{ ${[...firstOf(nt)].join(', ')} }`} · FOLLOW₁ = {`{ ${[...(analysis.follow1.get(nt) || [])].join(', ')} }`}
            </div>
          )}
          {c.ff.length > 0 && <div className="cg-conflict">{t.cgConflictFF.replace('{symbols}', c.ff.join(', '))}</div>}
          {c.ffl.length > 0 && <div className="cg-conflict">{t.cgConflictFFL.replace('{symbols}', c.ffl.join(', '))}</div>}
        </div>
        {occActions.length > 0 && (
          <>
            <div className="cg-section">{t.cgOccurrenceSection}</div>
            {renderActions(occActions, nt)}
          </>
        )}
        <div className="cg-section">{t.cgNonTerminalSection.replace('{nt}', nt)}</div>
        {symbolActions.length > 0 ? renderActions(symbolActions, nt) : <div className="cg-muted cg-empty">{t.cgNoActions}</div>}
      </div>
    );
  };

  return (
    <div className="click-grammar" aria-label={t.editorModeClick}>
      {order.map(lhs => {
        const c = conflictsOf(lhs);
        const alts = grammar.productions.filter(p => p.lhs === lhs);
        return (
          <div key={lhs} className="cg-rule">
            <button
              type="button"
              className={`cg-sym cg-lhs ${target?.kind === 'lhs' && target.nt === lhs ? 'active' : ''}`}
              onClick={e => open(e, { kind: 'lhs', nt: lhs })}
              title={t.cgLhsTitle.replace('{nt}', lhs)}
            >
              {lhs}
            </button>
            {c.ff.length > 0 && <span className="cg-badge" title={t.cgConflictFF.replace('{symbols}', c.ff.join(', '))}>FF</span>}
            {c.ffl.length > 0 && <span className="cg-badge" title={t.cgConflictFFL.replace('{symbols}', c.ffl.join(', '))}>FFL</span>}
            <span className="sym-arrow">→</span>
            {alts.map((p, ai) => (
              <React.Fragment key={p.id}>
                {ai > 0 && <span className="sym-arrow">|</span>}
                {p.rhs.length === 0 ? (
                  <span className="sym-eps">{EPSILON}</span>
                ) : (
                  p.rhs.map((s, i) =>
                    grammar.nonTerminals.has(s) && grammar.productions.some(q => q.lhs === s) ? (
                      <button
                        key={i}
                        type="button"
                        className={`cg-sym cg-occ ${target?.kind === 'occ' && target.productionId === p.id && target.position === i ? 'active' : ''}`}
                        onClick={e => open(e, { kind: 'occ', nt: s, productionId: p.id, position: i })}
                        title={t.cgOccTitle.replace('{nt}', s)}
                      >
                        {s}
                      </button>
                    ) : (
                      <span key={i} className={grammar.nonTerminals.has(s) ? 'sym-nt' : 'sym-t'}>{s}</span>
                    )
                  )
                )}
              </React.Fragment>
            ))}
          </div>
        );
      })}
      {popover()}
    </div>
  );
};
