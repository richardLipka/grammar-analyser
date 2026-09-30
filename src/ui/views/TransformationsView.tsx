import React, { useState } from 'react';
import { Grammar, formatGrammarGrouped, formatProduction } from '../../core/ast/grammar';
import {
  reduceGrammar,
  removeEpsilonRules,
  removeUnitRules,
  removeLeftRecursion,
  leftFactorGrammar,
  convertToChomsky,
  convertToGreibach,
  TransformationResult
} from '../../core/processor/grammarProcessor';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Sparkles, ArrowRight, Check, BookOpen } from 'lucide-react';

interface TransformationsViewProps {
  grammar: Grammar;
  onApplyGrammarText: (text: string) => void;
  lang: Language;
}

type TransformType = 'reduce' | 'epsilon' | 'unit' | 'leftRec' | 'leftFactor' | 'cnf' | 'gnf';

export const TransformationsView: React.FC<TransformationsViewProps> = ({
  grammar,
  onApplyGrammarText,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedType, setSelectedType] = useState<TransformType>('leftRec');

  // Compute transformation on current grammar
  const getResult = (): TransformationResult => {
    switch (selectedType) {
      case 'reduce':
        return reduceGrammar(grammar);
      case 'epsilon':
        return removeEpsilonRules(grammar);
      case 'unit':
        return removeUnitRules(grammar);
      case 'leftRec':
        return removeLeftRecursion(grammar);
      case 'leftFactor':
        return leftFactorGrammar(grammar);
      case 'cnf':
        return convertToChomsky(grammar);
      case 'gnf':
        return convertToGreibach(grammar);
    }
  };

  const result = getResult();
  const formattedTransformed = formatGrammarGrouped(result.transformedGrammar);

  return (
    <div>
      {/* Transformation Selector Toolbar */}
      <div className="card">
        <div className="card-title">
          <span>{t.transformActions}</span>
          <Sparkles size={18} color="var(--color-primary)" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            className={`btn ${selectedType === 'leftRec' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('leftRec')}
          >
            {t.removeLeftRec}
          </button>
          <button
            className={`btn ${selectedType === 'leftFactor' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('leftFactor')}
          >
            {t.leftFactor}
          </button>
          <button
            className={`btn ${selectedType === 'epsilon' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('epsilon')}
          >
            {t.removeEps}
          </button>
          <button
            className={`btn ${selectedType === 'unit' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('unit')}
          >
            {t.removeUnits}
          </button>
          <button
            className={`btn ${selectedType === 'reduce' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('reduce')}
          >
            {t.reduceGrammar}
          </button>
          <button
            className={`btn ${selectedType === 'cnf' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('cnf')}
          >
            {t.toCNF}
          </button>
          <button
            className={`btn ${selectedType === 'gnf' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedType('gnf')}
          >
            {t.toGNF}
          </button>
        </div>
      </div>

      {/* Resulting Transformed Grammar & Apply Action */}
      <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
        <div className="card-title">
          <span>Transformed Grammar Output</span>
          <button
            className="btn btn-primary"
            onClick={() => onApplyGrammarText(formattedTransformed)}
          >
            <Check size={16} />
            {t.applyToEditor}
          </button>
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
          {formattedTransformed}
        </pre>
      </div>

      {/* Step-by-Step Pedagogical Explanation Logs */}
      <div className="card">
        <div className="card-title">
          <span>{t.mathProofLog}</span>
          <BookOpen size={18} color="var(--color-text-secondary)" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {result.steps.map((step, idx) => (
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
                Step {idx + 1}: {step.title}
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {step.description}
              </p>
              {step.mathExplanation && (
                <div style={{
                  marginTop: '6px',
                  fontSize: '11.5px',
                  fontStyle: 'italic',
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'var(--color-bg-elevated)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  {step.mathExplanation}
                </div>
              )}
              {step.removedRules && step.removedRules.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--color-danger)' }}>
                  <strong>Removed rules:</strong> {step.removedRules.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
