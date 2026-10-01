import React, { useState, useEffect } from 'react';
import { Grammar, formatGrammarGrouped, formatGrammarForEditor, cloneGrammar } from '../../core/ast/grammar';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  convertToChomsky,
  convertToGreibach,
  getAvailableTransformationsForSymbol,
  applySymbolTransformation,
  TransformationResult,
  TransformationStep
} from '../../core/processor/grammarProcessor';
import {
  computeEndable,
  computeReachable,
  computeNullable,
  computeLeftRecursion,
  computeCyclic
} from '../../core/analyser/grammarAnalyser';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Sparkles, Check, BookOpen, RotateCcw, SkipBack, Layers, HelpCircle, CheckCircle2, Circle } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { SymbolSeq } from '../components/Symbols';
import { exportGrammarToLatex } from '../../core/export/latexExport';

interface TransformationsViewProps {
  grammar: Grammar;
  onApplyGrammarText: (text: string) => void;
  lang: Language;
}

/** Normal-form properties of a grammar, shown as a checklist under the result. */
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

export const TransformationsView: React.FC<TransformationsViewProps> = ({ grammar, onApplyGrammarText, lang }) => {
  const t = TRANSLATIONS[lang];

  const [workingGrammar, setWorkingGrammar] = useState<Grammar>(() => cloneGrammar(grammar));
  const [steps, setSteps] = useState<TransformationStep[]>([]);
  const [history, setHistory] = useState<Array<{ grammar: Grammar; steps: TransformationStep[] }>>([]);

  // Reset working grammar when the input grammar changes from the editor
  useEffect(() => {
    setWorkingGrammar(cloneGrammar(grammar));
    setSteps([]);
    setHistory([]);
  }, [grammar]);

  const pushResult = (result: TransformationResult) => {
    setHistory(prev => [...prev, { grammar: cloneGrammar(workingGrammar), steps: [...steps] }]);
    setWorkingGrammar(result.transformedGrammar);
    setSteps(prev => [...prev, ...result.steps]);
  };

  const handleApplySymbol = (nt: string, transId: string) => {
    if (!transId) return;
    pushResult(applySymbolTransformation(workingGrammar, nt, transId));
  };

  const handleApplyAutomatic = (fn: (g: Grammar) => TransformationResult) => pushResult(fn(workingGrammar));

  const handleUndo = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setWorkingGrammar(lastState.grammar);
    setSteps(lastState.steps);
  };

  const handleReset = () => {
    setHistory([]);
    setWorkingGrammar(cloneGrammar(grammar));
    setSteps([]);
  };

  const nonTerminalsList = [
    ...[...workingGrammar.nonTerminals].filter(nt => nt === workingGrammar.startSymbol),
    ...[...workingGrammar.nonTerminals].filter(nt => nt !== workingGrammar.startSymbol)
  ];
  const forms = grammarForms(workingGrammar);
  const formBadges: { ok: boolean; label: string }[] = [
    { ok: forms.reduced, label: t.formReduced },
    { ok: forms.epsFree, label: t.formEpsFree },
    { ok: forms.noUnit, label: t.formNoUnit },
    { ok: forms.proper, label: t.formProper },
    { ok: forms.noLeftRec, label: t.formNoLeftRec },
    { ok: forms.cnf, label: t.formCNF },
    { ok: forms.gnf, label: t.formGNF }
  ];

  const automatic: { label: string; fn: (g: Grammar) => TransformationResult; accent?: boolean; hint: string }[] = [
    { label: t.btnCNF, fn: convertToChomsky, accent: true, hint: t.hintCNF },
    { label: t.btnGNF, fn: convertToGreibach, accent: true, hint: t.hintGNF },
    { label: t.btnRemoveLeftRec, fn: removeLeftRecursion, hint: t.hintLeftRec },
    { label: t.btnLeftFactor, fn: leftFactorGrammar, hint: t.hintLeftFactor },
    { label: t.btnRemoveEps, fn: removeEpsilonRules, hint: t.hintEps },
    { label: t.btnRemoveUnits, fn: removeUnitRules, hint: t.hintUnits },
    { label: t.btnReduce, fn: reduceGrammar, hint: t.hintReduce }
  ];

  return (
    <div>
      {/* Direct Grammar Rules & Symbol Transformations */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.directGrammarRulesTitle}</span>
            <Layers size={18} color="var(--color-primary)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handleUndo} disabled={history.length === 0} title={t.undoStep} style={{ padding: '6px 12px', fontSize: '12px' }}>
              <SkipBack size={14} />
              <span>{t.undoStep}</span>
              {history.length > 0 && ` (${history.length})`}
            </button>
            <button className="btn btn-secondary" onClick={handleReset} disabled={history.length === 0 && steps.length === 0} title={t.resetToInitial} style={{ padding: '6px 12px', fontSize: '12px' }}>
              <RotateCcw size={14} />
              <span>{t.resetToInitial}</span>
            </button>
          </div>
        </div>

        <div className="hint-text" style={{ marginBottom: '14px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <HelpCircle size={15} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{t.directTransformHint}</span>
        </div>

        <div className="symbol-rules-list">
          {nonTerminalsList.map(nt => {
            const ntProds = workingGrammar.productions.filter(p => p.lhs === nt);
            const availableTrans = getAvailableTransformationsForSymbol(workingGrammar, nt);
            const isStart = nt === workingGrammar.startSymbol;

            return (
              <div key={nt} className="symbol-rule-card">
                <div className="symbol-header">
                  <div className="symbol-header-left">
                    <span className="badge badge-nt">{nt}</span>
                    {isStart && <span className="badge badge-start">{t.startSymbolBadge}</span>}
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {t.rulesCount.replace('{count}', ntProds.length.toString())}
                    </span>
                  </div>

                  <div className="symbol-header-right">
                    <select
                      className={`transform-combo ${availableTrans.length > 0 ? 'has-action' : ''}`}
                      value=""
                      disabled={availableTrans.length === 0}
                      aria-label={t.chooseSymbolTransformPlaceholder.replace('{symbol}', nt).replace('{count}', availableTrans.length.toString())}
                      onChange={(e) => handleApplySymbol(nt, e.target.value)}
                    >
                      <option value="">
                        {availableTrans.length > 0
                          ? t.chooseSymbolTransformPlaceholder.replace('{symbol}', nt).replace('{count}', availableTrans.length.toString())
                          : t.noTransformationsForSymbol}
                      </option>
                      {availableTrans.map(tr => (
                        <option key={tr.id} value={tr.id} title={lang === 'cz' ? tr.descriptionCz : tr.descriptionEn}>
                          {lang === 'cz' ? tr.labelCz : tr.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="symbol-productions">
                  <span className="sym-nt">{nt}</span>
                  <span className="sym-arrow">→</span>
                  {ntProds.length > 0 ? (
                    ntProds.map((p, i) => (
                      <React.Fragment key={p.id}>
                        {i > 0 && <span className="sym-arrow">|</span>}
                        <SymbolSeq symbols={p.rhs} nonTerminals={workingGrammar.nonTerminals} />
                      </React.Fragment>
                    ))
                  ) : (
                    <span style={{ color: 'var(--color-danger)', fontStyle: 'italic' }}>{t.noRulesLabel}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Automatic Construction Buttons Below Grammar */}
      <div className="card">
        <div className="card-title">
          <span>{t.automaticConstructionsTitle}</span>
          <Sparkles size={18} color="var(--color-primary)" />
        </div>

        <div className="automatic-actions-grid">
          {automatic.map(a => (
            <button
              key={a.label}
              className={`btn ${a.accent ? 'btn-accent' : 'btn-secondary'}`}
              onClick={() => handleApplyAutomatic(a.fn)}
              style={{ padding: '9px 14px' }}
              title={a.hint}
            >
              {a.accent && <Sparkles size={16} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Resulting Transformed Grammar & Apply Action */}
      <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span>{t.transformedOutputTitle}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LatexExportButton
              getLatex={() => exportGrammarToLatex(workingGrammar)}
              filename="transformed_grammar.tex"
              label={lang === 'cz' ? 'LaTeX export' : 'LaTeX Export'}
              lang={lang}
              title={lang === 'cz' ? 'Exportovat transformovanou gramatiku do LaTeXu' : 'Export transformed grammar to LaTeX'}
            />
            <button className="btn btn-primary" onClick={() => onApplyGrammarText(formatGrammarForEditor(workingGrammar))}>
              <Check size={16} />
              {t.applyToEditor}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {formBadges.map(b => (
            <span key={b.label} className={`badge ${b.ok ? 'badge-success' : 'badge-primary'}`} style={{ opacity: b.ok ? 1 : 0.7 }}>
              {b.ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              {b.label}
            </span>
          ))}
        </div>

        <pre style={{
          backgroundColor: 'var(--color-bg-base)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          overflowX: 'auto',
          border: '1px solid var(--color-border)'
        }}>
          {formatGrammarGrouped(workingGrammar)}
        </pre>
      </div>

      {/* Step-by-Step Pedagogical Explanation Logs */}
      <div className="card">
        <div className="card-title">
          <span>{t.appliedStepsHistory}</span>
          <BookOpen size={18} color="var(--color-text-secondary)" />
        </div>

        {steps.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            {t.noTransformationsYet}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {steps.map((step, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--color-bg-base)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '4px solid var(--color-primary)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--color-text-primary)' }}>
                  {t.stepTitle.replace('{num}', (idx + 1).toString()).replace('{title}', lang === 'cz' ? (step.titleCz || step.title) : step.title)}
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  {lang === 'cz' ? (step.descriptionCz || step.description) : step.description}
                </p>
                {(step.mathExplanationCz || step.mathExplanation) && (
                  <div style={{
                    marginTop: '6px',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-bg-elevated)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {lang === 'cz' ? (step.mathExplanationCz || step.mathExplanation) : step.mathExplanation}
                  </div>
                )}
                {step.removedRules && step.removedRules.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--color-danger)' }}>
                    <strong>{t.removedRulesLabel}</strong>
                    <div className="rule-list">
                      {step.removedRules.map((r, i) => <span key={i} className="rule-chip">{r}</span>)}
                    </div>
                  </div>
                )}
                {step.addedRules && step.addedRules.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--color-success)' }}>
                    <strong>{t.addedRulesLabel}</strong>
                    <div className="rule-list">
                      {step.addedRules.map((r, i) => <span key={i} className="rule-chip">{r}</span>)}
                    </div>
                  </div>
                )}
                {step.intermediateGrammar && (
                  <details className="proof-details">
                    <summary>{t.grammarAfterStep}</summary>
                    <pre>{formatGrammarGrouped(step.intermediateGrammar)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
