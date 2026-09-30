import React, { useState, useEffect } from 'react';
import { Grammar, formatGrammarGrouped, formatProduction, formatRhs, cloneGrammar } from '../../core/ast/grammar';
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
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Sparkles, Check, BookOpen, RotateCcw, SkipBack, Layers, HelpCircle } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportGrammarToLatex } from '../../core/export/latexExport';

interface TransformationsViewProps {
  grammar: Grammar;
  onApplyGrammarText: (text: string) => void;
  lang: Language;
}

export const TransformationsView: React.FC<TransformationsViewProps> = ({
  grammar,
  onApplyGrammarText,
  lang
}) => {
  const t = TRANSLATIONS[lang];

  // Working grammar state that can be transformed directly step-by-step
  const [workingGrammar, setWorkingGrammar] = useState<Grammar>(() => cloneGrammar(grammar));
  const [steps, setSteps] = useState<TransformationStep[]>([]);
  const [history, setHistory] = useState<Array<{ grammar: Grammar; steps: TransformationStep[] }>>([]);

  // Reset working grammar when the input grammar changes from the editor
  useEffect(() => {
    setWorkingGrammar(cloneGrammar(grammar));
    setSteps([]);
    setHistory([]);
  }, [grammar]);

  // Handle single-symbol transformation selected from combo box
  const handleApplySymbol = (nt: string, transId: string) => {
    if (!transId) return;
    setHistory(prev => [...prev, { grammar: cloneGrammar(workingGrammar), steps: [...steps] }]);
    const result = applySymbolTransformation(workingGrammar, nt, transId);
    setWorkingGrammar(result.transformedGrammar);
    setSteps(prev => [...prev, ...result.steps]);
  };

  // Handle whole-grammar automatic constructions (CNF, GNF, etc.)
  const handleApplyAutomatic = (fn: (g: Grammar) => TransformationResult) => {
    setHistory(prev => [...prev, { grammar: cloneGrammar(workingGrammar), steps: [...steps] }]);
    const result = fn(workingGrammar);
    setWorkingGrammar(result.transformedGrammar);
    setSteps(prev => [...prev, ...result.steps]);
  };

  // Undo last transformation
  const handleUndo = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setWorkingGrammar(lastState.grammar);
    setSteps(lastState.steps);
  };

  // Reset to initial editor grammar
  const handleReset = () => {
    setHistory([]);
    setWorkingGrammar(cloneGrammar(grammar));
    setSteps([]);
  };

  const formattedWorking = formatGrammarGrouped(workingGrammar);
  const nonTerminalsList = [...workingGrammar.nonTerminals];

  return (
    <div>
      {/* Direct Grammar Rules & Symbol Transformations */}
      <div className="card">
        <div className="card-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.directGrammarRulesTitle}</span>
            <Layers size={18} color="var(--color-primary)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleUndo}
              disabled={history.length === 0}
              title={t.undoStep}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <SkipBack size={14} />
              <span>{t.undoStep}</span>
              {history.length > 0 && ` (${history.length})`}
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={history.length === 0 && steps.length === 0}
              title={t.resetToInitial}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <RotateCcw size={14} />
              <span>{t.resetToInitial}</span>
            </button>

            <LatexExportButton
              getLatex={() => exportGrammarToLatex(workingGrammar)}
              filename="transformed_grammar.tex"
              label={lang === 'cz' ? 'LaTeX export' : 'LaTeX Export'}
              title={lang === 'cz' ? 'Exportovat transformovanou gramatiku jako LaTeX' : 'Export transformed grammar as LaTeX'}
            />
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <HelpCircle size={15} color="var(--color-primary)" />
          <span>{t.directTransformHint}</span>
        </div>

        {/* List of rules per symbol with interactive combo box */}
        <div className="symbol-rules-list">
          {nonTerminalsList.map(nt => {
            const ntProds = workingGrammar.productions.filter(p => p.lhs === nt);
            const availableTrans = getAvailableTransformationsForSymbol(workingGrammar, nt);
            const isStart = nt === workingGrammar.startSymbol;
            const rhsListStr = ntProds.length > 0
              ? ntProds.map(p => formatRhs(p.rhs)).join('  |  ')
              : 'ε';

            return (
              <div key={nt} className="symbol-rule-card">
                <div className="symbol-header">
                  <div className="symbol-header-left">
                    <span className="badge badge-nt">{nt}</span>
                    {isStart && <span className="badge badge-start">{t.startSymbolBadge}</span>}
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {ntProds.length} {t.rulesCountSuffix}
                    </span>
                  </div>

                  <div className="symbol-header-right">
                    <select
                      className={`transform-combo ${availableTrans.length > 0 ? 'has-action' : ''}`}
                      value=""
                      disabled={availableTrans.length === 0}
                      onChange={(e) => handleApplySymbol(nt, e.target.value)}
                    >
                      <option value="">
                        {availableTrans.length > 0
                          ? t.chooseSymbolTransformPlaceholder.replace('{symbol}', nt).replace('{count}', availableTrans.length.toString())
                          : t.noTransformationsForSymbol}
                      </option>
                      {availableTrans.map(tr => (
                        <option
                          key={tr.id}
                          value={tr.id}
                          title={lang === 'cz' ? tr.descriptionCz : tr.descriptionEn}
                        >
                          {lang === 'cz' ? tr.labelCz : tr.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="symbol-productions">
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{nt}</span>
                  <span style={{ margin: '0 8px', color: 'var(--color-text-muted)' }}>-&gt;</span>
                  <span>{rhsListStr}</span>
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
          {/* Prominent GNF and CNF construction buttons */}
          <button
            className="btn btn-accent"
            onClick={() => handleApplyAutomatic(convertToChomsky)}
            style={{ padding: '9px 14px' }}
          >
            <Sparkles size={16} />
            <span>{t.btnCNF}</span>
          </button>

          <button
            className="btn btn-accent"
            onClick={() => handleApplyAutomatic(convertToGreibach)}
            style={{ padding: '9px 14px' }}
          >
            <Sparkles size={16} />
            <span>{t.btnGNF}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleApplyAutomatic(removeLeftRecursion)}
          >
            {t.btnRemoveLeftRec}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleApplyAutomatic(leftFactorGrammar)}
          >
            {t.btnLeftFactor}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleApplyAutomatic(removeEpsilonRules)}
          >
            {t.btnRemoveEps}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleApplyAutomatic(removeUnitRules)}
          >
            {t.btnRemoveUnits}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleApplyAutomatic(reduceGrammar)}
          >
            {t.btnReduce}
          </button>
        </div>
      </div>

      {/* Resulting Transformed Grammar & Apply Action */}
      <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
        <div className="card-title">
          <span>{t.transformedOutputTitle}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LatexExportButton
              getLatex={() => exportGrammarToLatex(workingGrammar)}
              filename="transformed_grammar.tex"
              label={lang === 'cz' ? 'LaTeX export' : 'LaTeX Export'}
              title={lang === 'cz' ? 'Exportovat transformovanou gramatiku do LaTeXu' : 'Export transformed grammar to LaTeX'}
            />
            <button
              className="btn btn-primary"
              onClick={() => onApplyGrammarText(formattedWorking)}
            >
              <Check size={16} />
              {t.applyToEditor}
            </button>
          </div>
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
          {formattedWorking}
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
            {lang === 'cz'
              ? 'Dosud nebyla provedena žádná transformace. Zvolte transformaci u libovolného symbolu výše nebo klikněte na automatickou konstrukci.'
              : 'No transformations have been applied yet. Select a transformation for any symbol above or click an automatic construction.'}
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
                    fontSize: '11.5px',
                    fontStyle: 'italic',
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'var(--color-bg-elevated)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    {lang === 'cz' ? (step.mathExplanationCz || step.mathExplanation) : step.mathExplanation}
                  </div>
                )}
                {step.addedRules && step.addedRules.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--color-success)' }}>
                    <strong>{lang === 'cz' ? 'Přidaná pravidla:' : 'Added rules:'}</strong> {step.addedRules.join(', ')}
                  </div>
                )}
                {step.removedRules && step.removedRules.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--color-danger)' }}>
                    <strong>{t.removedRulesLabel}</strong> {step.removedRules.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
