import React from 'react';
import { Grammar, formatGrammarGrouped } from '../../core/ast/grammar';
import { TransformationStep } from '../../core/processor/grammarProcessor';
import {
  computeEndable,
  computeReachable,
  computeNullable,
  computeLeftRecursion,
  computeCyclic
} from '../../core/analyser/grammarAnalyser';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Sparkles, BookOpen, MousePointerClick, CheckCircle2, Circle, CornerUpLeft } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportGrammarToLatex } from '../../core/export/latexExport';
import { HistoryEntry } from '../useGrammarHistory';
import { WHOLE_GRAMMAR_TRANSFORMATIONS } from '../wholeGrammarTransformations';

interface TransformationsViewProps {
  /** The analysed grammar (the editor's current grammar once it has been analysed) */
  grammar: Grammar;
  /** Undo/redo history of the editor: every state and how it was reached */
  entries: HistoryEntry[];
  index: number;
  onApplyWhole: (id: string) => void;
  onGoTo: (index: number) => void;
  onOpenClickMode: () => void;
  lang: Language;
}

/** Normal-form properties of a grammar, shown as a checklist. */
function grammarForms(g: Grammar) {
  const startOnRhs = g.productions.some(p => p.rhs.includes(g.startSymbol));
  const allowedEps = (lhs: string, len: number) => len > 0 || (lhs === g.startSymbol && !startOnRhs);
  const endable = computeEndable(g);
  const reachable = computeReachable(g);
  const lr = computeLeftRecursion(g, computeNullable(g));
  return {
    reduced: [...g.nonTerminals].every(nt => endable.has(nt) && reachable.has(nt)),
    epsFree: g.productions.every(p => allowedEps(p.lhs, p.rhs.length)),
    noUnit: g.productions.every(p => !(p.rhs.length === 1 && g.nonTerminals.has(p.rhs[0]))),
    noLeftRec: lr.immediate.size === 0 && lr.indirect.size === 0,
    // proper (vlastní / upravená): no cycles, no ε-rules (except S -> ε) and no useless symbols
    proper: [...g.nonTerminals].every(nt => endable.has(nt) && reachable.has(nt)) &&
      g.productions.every(p => allowedEps(p.lhs, p.rhs.length)) &&
      computeCyclic(g, computeNullable(g)).size === 0,
    cnf: g.productions.every(p =>
      (p.rhs.length === 2 && p.rhs.every(s => g.nonTerminals.has(s))) ||
      (p.rhs.length === 1 && g.terminals.has(p.rhs[0])) ||
      (p.rhs.length === 0 && allowedEps(p.lhs, 0))),
    gnf: g.productions.every(p =>
      (p.rhs.length > 0 && g.terminals.has(p.rhs[0]) && p.rhs.slice(1).every(s => g.nonTerminals.has(s))) ||
      (p.rhs.length === 0 && allowedEps(p.lhs, 0)))
  };
}

const StepDetails: React.FC<{ step: TransformationStep; lang: Language }> = ({ step, lang }) => {
  const t = TRANSLATIONS[lang];
  return (
    <div className="protocol-step">
      <div className="protocol-step-title">{lang === 'cz' ? step.titleCz || step.title : step.title}</div>
      <p>{lang === 'cz' ? step.descriptionCz || step.description : step.description}</p>
      {(step.mathExplanationCz || step.mathExplanation) && (
        <div className="protocol-math">{lang === 'cz' ? step.mathExplanationCz || step.mathExplanation : step.mathExplanation}</div>
      )}
      {step.removedRules && step.removedRules.length > 0 && (
        <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--color-danger)' }}>
          <strong>{t.removedRulesLabel}</strong>
          <div className="rule-list">{step.removedRules.map((r, i) => <span key={i} className="rule-chip">{r}</span>)}</div>
        </div>
      )}
      {step.addedRules && step.addedRules.length > 0 && (
        <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--color-success)' }}>
          <strong>{t.addedRulesLabel}</strong>
          <div className="rule-list">{step.addedRules.map((r, i) => <span key={i} className="rule-chip">{r}</span>)}</div>
        </div>
      )}
      {step.intermediateGrammar && (
        <details className="proof-details">
          <summary>{t.grammarAfterStep}</summary>
          <pre>{formatGrammarGrouped(step.intermediateGrammar)}</pre>
        </details>
      )}
    </div>
  );
};

export const TransformationsView: React.FC<TransformationsViewProps> = ({
  grammar,
  entries,
  index,
  onApplyWhole,
  onGoTo,
  onOpenClickMode,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const forms = grammarForms(grammar);
  const formBadges: { ok: boolean; label: string }[] = [
    { ok: forms.reduced, label: t.formReduced },
    { ok: forms.epsFree, label: t.formEpsFree },
    { ok: forms.noUnit, label: t.formNoUnit },
    { ok: forms.proper, label: t.formProper },
    { ok: forms.noLeftRec, label: t.formNoLeftRec },
    { ok: forms.cnf, label: t.formCNF },
    { ok: forms.gnf, label: t.formGNF }
  ];

  const entryTitle = (e: HistoryEntry) => {
    switch (e.kind) {
      case 'initial':
        return t.historyInitial;
      case 'edit':
        return t.historyEdit;
      case 'preset':
        return t.historyPreset.replace('{name}', (lang === 'cz' ? e.titleCz : e.titleEn) || '');
      case 'transform':
        return (lang === 'cz' ? e.titleCz : e.titleEn) || '';
    }
  };

  return (
    <div>
      {/* Single symbols are transformed on the grammar on the left */}
      <div className="card">
        <div className="card-title">
          <span>{t.clickTransformCardTitle}</span>
          <MousePointerClick size={18} color="var(--color-primary)" />
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>{t.clickTransformCardText}</p>
        <button type="button" className="btn btn-primary" onClick={onOpenClickMode}>
          <MousePointerClick size={15} />
          <span>{t.openClickMode}</span>
        </button>
      </div>

      {/* Transformations of the whole grammar */}
      <div className="card">
        <div className="card-title">
          <span>{t.automaticConstructionsTitle}</span>
          <Sparkles size={18} color="var(--color-primary)" />
        </div>
        <div className="automatic-actions-grid">
          {[...WHOLE_GRAMMAR_TRANSFORMATIONS].reverse().map(a => (
            <button
              key={a.id}
              className={`btn ${a.accent ? 'btn-accent' : 'btn-secondary'}`}
              onClick={() => onApplyWhole(a.id)}
              style={{ padding: '9px 14px' }}
              title={a.hint(t)}
            >
              {a.accent && <Sparkles size={16} />}
              <span>{a.label(t)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The current grammar and its normal forms */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span>{t.currentGrammarTitle}</span>
          <LatexExportButton
            getLatex={() => exportGrammarToLatex(grammar)}
            filename="grammar.tex"
            label={lang === 'cz' ? 'LaTeX export' : 'LaTeX Export'}
            lang={lang}
            title={lang === 'cz' ? 'Exportovat gramatiku do LaTeXu' : 'Export the grammar to LaTeX'}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {formBadges.map(b => (
            <span key={b.label} className={`badge ${b.ok ? 'badge-success' : 'badge-primary'}`} style={{ opacity: b.ok ? 1 : 0.7 }}>
              {b.ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              {b.label}
            </span>
          ))}
        </div>
        <pre className="protocol-grammar">{formatGrammarGrouped(grammar)}</pre>
      </div>

      {/* Protocol: every state of the editor's grammar and how it was reached */}
      <div className="card">
        <div className="card-title">
          <span>{t.protocolTitle}</span>
          <BookOpen size={18} color="var(--color-text-secondary)" />
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>{t.protocolHint}</p>
        <ol className="protocol-list">
          {entries.map((e, i) => (
            <li key={i} className={`protocol-entry ${i === index ? 'current' : ''} ${i > index ? 'future' : ''} ${e.kind}`}>
              <div className="protocol-entry-head">
                <span className="protocol-num">{i}</span>
                <span className="protocol-entry-title">{entryTitle(e)}</span>
                {i === index ? (
                  <span className="badge badge-primary">{t.currentState}</span>
                ) : (
                  <button type="button" className="link-button" onClick={() => onGoTo(i)}>
                    <CornerUpLeft size={12} /> {t.goToState}
                  </button>
                )}
              </div>
              {e.kind === 'transform' && e.steps && e.steps.map((step, k) => <StepDetails key={k} step={step} lang={lang} />)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
