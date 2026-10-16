import React, { useState, useMemo, useEffect } from 'react';
import { Grammar, formatGrammarForEditor, formatGrammarGrouped, cloneGrammar } from '../../core/ast/grammar';
import { parseGrammar, ParseOptions } from '../../core/parser/grammarParser';
import { checkForm, compareLanguagesSteps, ComparisonResult } from '../../core/analyser/equivalence';
import { JobControl } from '../../core/jobs/job';
import { useSteppedJob } from '../useSteppedJob';
import { JobStatus } from '../components/JobStatus';
import { ComparisonReport, Derivation } from './EquivalenceView';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { ProductionText } from '../components/Symbols';
import { explainWord } from '../../core/parser/derivationAttempt';
import { DerivationNode, getTreeMetrics } from '../../core/generator/wordGenerator';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { TEACHING_TECHNIQUES } from '../../core/teaching/teachingGuideData';
import {
  analyzeTechniqueOnGrammar,
  findComparisonWords,
  ComparisonWordChoice
} from '../../core/teaching/techniqueAnalyzer';
import {
  GraduationCap,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  FastForward,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Layers,
  FileCode,
  ShieldCheck,
  Check,
  Edit3,
  RefreshCw,
  GitCompare,
  GitBranch
} from 'lucide-react';

interface TeachingGuideViewProps {
  lang: Language;
  parseOptions: ParseOptions;
  onLoadIntoEditor?: (text: string) => void;
  mainGrammarText?: string;
}

export const TeachingGuideView: React.FC<TeachingGuideViewProps> = ({
  lang,
  parseOptions,
  onLoadIntoEditor,
  mainGrammarText
}) => {
  const cz = lang === 'cz';
  const t = TRANSLATIONS[lang];

  const [selectedId, setSelectedId] = useState<string>('reduce');
  const [grammarSource, setGrammarSource] = useState<'editor' | 'preset' | 'custom'>('preset');
  const [customText, setCustomText] = useState<string>('');
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [maxLength, setMaxLength] = useState<number>(10);
  const [compResult, setCompResult] = useState<ComparisonResult | null>(null);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number>(0);
  const runner = useSteppedJob();

  const technique = useMemo(
    () => TEACHING_TECHNIQUES.find(tech => tech.id === selectedId) || TEACHING_TECHNIQUES[0],
    [selectedId]
  );

  // Synchronously update customText and reset stepper on technique change
  const [prevTechniqueId, setPrevTechniqueId] = useState(technique.id);
  if (prevTechniqueId !== technique.id) {
    setPrevTechniqueId(technique.id);
    setCustomText(technique.exampleGrammarText);
    setStepIndex(0);
    setCompResult(null);
    setSelectedWordIndex(0);
    runner.stop();
  }

  // Active grammar text according to mode
  const activeGrammarText =
    grammarSource === 'editor'
      ? (mainGrammarText || technique.exampleGrammarText)
      : grammarSource === 'preset'
        ? technique.exampleGrammarText
        : customText;

  // Synchronously reset step and verification results whenever active grammar text changes
  const [prevActiveText, setPrevActiveText] = useState(activeGrammarText);
  if (prevActiveText !== activeGrammarText) {
    setPrevActiveText(activeGrammarText);
    setStepIndex(0);
    setCompResult(null);
    setSelectedWordIndex(0);
    runner.stop();
  }

  // Parse active grammar
  const parsedActive = useMemo(
    () => (activeGrammarText.trim() ? parseGrammar(activeGrammarText, parseOptions) : null),
    [activeGrammarText, parseOptions]
  );

  const activeGrammar = parsedActive && parsedActive.errors.length === 0 ? parsedActive.grammar ?? null : null;

  // Universal dynamic defect analysis on whatever grammar is active
  const dynamicAnalysis = useMemo(() => {
    if (!activeGrammar) return null;
    return analyzeTechniqueOnGrammar(activeGrammar, technique.id, lang);
  }, [activeGrammar, technique.id, lang]);

  // Execute the transformation to obtain all steps and the final grammar
  const transformData = useMemo(() => {
    if (!activeGrammar) return null;
    try {
      const res = technique.apply(cloneGrammar(activeGrammar));

      const stepsWithGrammar = res.steps.map((st, i) => {
        if (st.intermediateGrammar) return st;
        return {
          ...st,
          intermediateGrammar: i === res.steps.length - 1 ? res.transformedGrammar : res.transformedGrammar
        };
      });

      return {
        transformed: res.transformedGrammar,
        steps: stepsWithGrammar
      };
    } catch (err) {
      console.error('Error applying transformation:', err);
      return null;
    }
  }, [technique, activeGrammar]);

  const totalSteps = transformData ? transformData.steps.length : 0;

  // The grammar shown at the current step:
  // Step 0 = active original grammar
  // Step k (1 <= k <= totalSteps) = step k's intermediate grammar
  const currentGrammar: Grammar | null = useMemo(() => {
    if (stepIndex === 0) return activeGrammar;
    if (!transformData || transformData.steps.length === 0) return null;
    const clampedIndex = Math.min(stepIndex, transformData.steps.length);
    const step = transformData.steps[clampedIndex - 1];
    return step.intermediateGrammar || transformData.transformed;
  }, [stepIndex, activeGrammar, transformData]);

  // Check promised normal form properties on the final transformed grammar
  const formChecks = useMemo(() => {
    if (!transformData) return [];
    return checkForm(transformData.transformed, technique.promisedForm);
  }, [transformData, technique.promisedForm]);

  // Find non-trivial words in L(G1) ∩ L(G2) derived using changed rules
  const candidateWords: ComparisonWordChoice[] = useMemo(() => {
    if (!activeGrammar || !transformData) return [];
    return findComparisonWords(activeGrammar, transformData.transformed, 6);
  }, [activeGrammar, transformData]);

  // Ensure selected word index stays valid
  useEffect(() => {
    if (selectedWordIndex >= candidateWords.length && candidateWords.length > 0) {
      setSelectedWordIndex(0);
    }
  }, [candidateWords.length, selectedWordIndex]);

  const activeWordChoice = candidateWords[selectedWordIndex] || candidateWords[0] || null;

  // Explanations and derivation trees for the active word in both grammars
  const wordDerivationOriginal = useMemo(() => {
    if (!activeGrammar || !activeWordChoice) return null;
    return explainWord(activeGrammar, activeWordChoice.tokens);
  }, [activeGrammar, activeWordChoice]);

  const wordDerivationTransformed = useMemo(() => {
    if (!transformData || !activeWordChoice) return null;
    return explainWord(transformData.transformed, activeWordChoice.tokens);
  }, [transformData, activeWordChoice]);

  const originalMetrics = useMemo(
    () => getTreeMetrics(wordDerivationOriginal?.tree),
    [wordDerivationOriginal]
  );

  const transformedMetrics = useMemo(
    () => getTreeMetrics(wordDerivationTransformed?.tree),
    [wordDerivationTransformed]
  );

  // Language equivalence runner
  const startEquivalenceCheck = () => {
    if (!activeGrammar || !transformData) return;
    const control: JobControl = { stop: false };
    setCompResult(null);
    runner.start(
      compareLanguagesSteps(activeGrammar, transformData.transformed, control, maxLength),
      control,
      res => setCompResult(res)
    );
  };

  const categories = [
    {
      id: 'clean',
      label: t.teachingCatClean || (cz ? 'Čištění a redukce' : 'Cleaning & Reduction'),
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'clean')
    },
    {
      id: 'll',
      label: t.teachingCatLL || (cz ? 'LL(1) transformace a levá rekurze' : 'LL(1) Transformations & Left Recursion'),
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'll')
    },
    {
      id: 'lr',
      label: t.teachingCatLR || (cz ? 'LR transformace a řešení kolizí' : 'LR Transformations & Conflict Elimination'),
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'lr')
    },
    {
      id: 'normal',
      label: t.teachingCatNormal || (cz ? 'Normální formy (CNF / GNF)' : 'Normal Forms (CNF / GNF)'),
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'normal')
    }
  ];

  return (
    <div className="teaching-guide-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Intro Header */}
      <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GraduationCap size={20} color="var(--color-primary)" />
          <span>{t.teachingTitle}</span>
        </div>
        <p className="hint-text" style={{ margin: '4px 0 0' }}>
          {t.teachingSubtitle}
        </p>
      </div>

      {/* Technique Navigation Selector */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          {t.teachingSelectTechnique}:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {categories.map(cat => (
            <div key={cat.id}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>
                {cat.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {cat.items.map(tech => {
                  const isActive = tech.id === selectedId;
                  return (
                    <button
                      key={tech.id}
                      type="button"
                      className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onClick={() => setSelectedId(tech.id)}
                    >
                      <span>{cz ? tech.name.cz : tech.name.en}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grammar Source Selector Card (Pedagogical Preset vs Custom Grammar) */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {cz ? 'Gramatika pro demonstraci:' : 'Grammar for demonstration:'}
            </span>
            <div className="button-group" style={{ display: 'inline-flex' }}>
              <button
                type="button"
                className={`btn ${grammarSource === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '4px 12px' }}
                onClick={() => setGrammarSource('editor')}
              >
                <FileCode size={12} style={{ marginRight: '4px' }} />
                {t.teachingSourceEditor}
              </button>
              <button
                type="button"
                className={`btn ${grammarSource === 'preset' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '4px 12px' }}
                onClick={() => setGrammarSource('preset')}
              >
                {t.teachingSourcePreset}
              </button>
              <button
                type="button"
                className={`btn ${grammarSource === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '4px 12px' }}
                onClick={() => {
                  setCustomText(activeGrammarText);
                  setGrammarSource('custom');
                }}
              >
                <Edit3 size={12} style={{ marginRight: '4px' }} />
                {t.teachingSourceCustom}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {mainGrammarText && grammarSource === 'custom' && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                onClick={() => setCustomText(mainGrammarText)}
                title={t.teachingLoadFromEditor}
              >
                <FileCode size={13} style={{ marginRight: '4px' }} />
                <span>{t.teachingLoadFromEditor}</span>
              </button>
            )}

            {grammarSource === 'custom' && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                onClick={() => setCustomText(technique.exampleGrammarText)}
                title={t.teachingResetPreset}
              >
                <RefreshCw size={13} style={{ marginRight: '4px' }} />
                <span>{t.teachingResetPreset}</span>
              </button>
            )}
          </div>
        </div>

        {grammarSource === 'editor' ? (
          <div>
            <p className="hint-text" style={{ margin: '0 0 6px' }}>
              {cz
                ? 'Je aktivní gramatika z hlavního editoru. Jakékoliv změny v editoru se v demonstraci ihned projeví.'
                : 'Grammar from the main editor is active. Any changes in the editor are immediately reflected in the demonstration.'}
            </p>
            <pre className="protocol-grammar" style={{ margin: 0, maxHeight: '130px', overflowY: 'auto' }}>
              {activeGrammarText}
            </pre>
            {parsedActive && parsedActive.errors.length > 0 && (
              <div className="report-box danger" style={{ marginTop: '6px' }}>
                {parsedActive.errors.map((e, i) => (
                  <div key={i}>
                    {cz ? `Řádek ${e.line}: ${e.messageCz || e.message}` : `Line ${e.line}: ${e.message}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : grammarSource === 'custom' ? (
          <div>
            <p className="hint-text" style={{ margin: '0 0 6px' }}>
              {t.teachingCustomGrammarHint}
            </p>
            <textarea
              className="grammar-textarea"
              style={{ minHeight: '90px', width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="S -> A B | c ..."
              spellCheck={false}
            />
            {parsedActive && parsedActive.errors.length > 0 && (
              <div className="report-box danger" style={{ marginTop: '6px' }}>
                {parsedActive.errors.map((e, i) => (
                  <div key={i}>
                    {cz ? `Řádek ${e.line}: ${e.messageCz || e.message}` : `Line ${e.line}: ${e.message}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div className="hint-text">
              {cz ? 'Je načten výchozí didaktický příklad připravený pro tuto techniku.' : 'Default pedagogical example prepared for this technique is loaded.'}
            </div>
          </div>
        )}
      </div>

      {/* Technique Details & Literature Card */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--color-primary)" />
            <span>{cz ? technique.name.cz : technique.name.en}</span>
          </div>
          <span className="badge badge-primary" style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>
            {technique.scheme}
          </span>
        </div>

        <p style={{ margin: '4px 0 12px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {cz ? technique.subtitle.cz : technique.subtitle.en}
        </p>

        {/* Primary Scientific Literature Citation */}
        <div
          style={{
            background: 'var(--color-surface-hover, rgba(0,0,0,0.03))',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12.5px', color: 'var(--color-primary)' }}>
            <BookOpen size={14} />
            <span>{t.teachingOriginalLit}</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 6px' }}>
            {t.teachingOriginalLitNote}
          </p>
          <div style={{ fontSize: '12.5px', lineHeight: 1.45 }}>
            <strong>{technique.literature.authors}</strong> ({technique.literature.year}):{' '}
            <em>„{technique.literature.title}“</em>. {technique.literature.venue}.
            {technique.literature.url && (
              <a
                href={technique.literature.url}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--color-primary)' }}
              >
                [DOI / Paper <ExternalLink size={11} />]
              </a>
            )}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            ℹ️ {cz ? technique.literature.historicalNote.cz : technique.literature.historicalNote.en}
          </div>
        </div>

        {/* Universal Dynamic Defect & Mathematical Sets Analysis */}
        {dynamicAnalysis && (
          <div
            className={`notice-box ${dynamicAnalysis.hasDefect ? 'danger' : 'success'}`}
            style={{ marginBottom: '14px' }}
          >
            <div className="notice-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {dynamicAnalysis.hasDefect ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
              <span>{t.teachingUniversalAnalysisTitle}: {dynamicAnalysis.statusText}</span>
            </div>
            <p style={{ margin: '4px 0 6px', fontSize: '12.5px' }}>
              {dynamicAnalysis.defectDetail}
            </p>

            {dynamicAnalysis.computedSets && (
              <div className="protocol-math" style={{ margin: '6px 0', fontSize: '12px' }}>
                <strong>{t.teachingMathSets}:</strong> <code>{dynamicAnalysis.computedSets}</code>
              </div>
            )}

            {dynamicAnalysis.affectedRulesOrSymbols.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                  {cz ? 'Dotčené symboly/pravidla:' : 'Affected symbols/rules:'}
                </span>
                {dynamicAnalysis.affectedRulesOrSymbols.map((item, idx) => (
                  <span
                    key={idx}
                    className="rule-chip"
                    style={{ borderColor: dynamicAnalysis.hasDefect ? 'var(--color-danger)' : 'var(--color-border)' }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Defect vs Remedy Theory Comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <div className="notice-box danger" style={{ margin: 0 }}>
            <div className="notice-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={15} />
              <span>{t.teachingDefectTitle}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              {cz ? technique.defect.cz : technique.defect.en}
            </p>
          </div>

          <div className="notice-box success" style={{ margin: 0 }}>
            <div className="notice-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={15} />
              <span>{t.teachingFixTitle}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              {cz ? technique.remedy.cz : technique.remedy.en}
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Interactive Player Card */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--color-primary)" />
            <span>{t.teachingStepByStepTitle}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {onLoadIntoEditor && currentGrammar && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '11.5px', padding: '4px 10px' }}
                onClick={() => onLoadIntoEditor(formatGrammarForEditor(currentGrammar))}
                title={cz ? 'Vložit zobrazenou gramatiku do hlavního editoru' : 'Load current grammar into main editor'}
              >
                <FileCode size={13} style={{ marginRight: '4px' }} />
                <span>{cz ? 'Do hlavního editoru' : 'To Main Editor'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Note on pedagogical example */}
        {grammarSource === 'preset' && (
          <div className="notice-box warning" style={{ marginBottom: '14px' }}>
            <div className="notice-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{cz ? 'Ukázkový příklad s chybou' : 'Pedagogical Example with Error'}</span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px' }}>
              {cz ? technique.exampleIssueNote.cz : technique.exampleIssueNote.en}
            </p>
          </div>
        )}

        {totalSteps === 0 ? (
          <div className="report-box success" style={{ padding: '16px' }}>
            <CheckCircle2 size={16} />
            <span>
              {cz
                ? 'Tato gramatika již splňuje požadavky této transformace (žádný krok není potřeba provádět).'
                : 'This grammar already satisfies the requirements of this transformation (0 steps needed).'}
            </span>
          </div>
        ) : (
          <>
            {/* VCR Stepper Controls */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                background: 'var(--color-surface-hover, rgba(0,0,0,0.03))',
                padding: '8px 12px',
                borderRadius: '6px',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '5px 9px' }}
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex(0)}
                  title={t.teachingResetStep}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '5px 12px' }}
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex(s => Math.max(0, s - 1))}
                  title={t.teachingPrevStep}
                >
                  <ArrowLeft size={14} />
                  <span>{t.teachingPrevStep}</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                  {stepIndex === 0
                    ? (cz ? 'Původní stav (0 z ' + totalSteps + ')' : 'Initial State (0 of ' + totalSteps + ')')
                    : t.teachingStepProgress.replace('{current}', String(stepIndex)).replace('{total}', String(totalSteps))}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '5px 12px' }}
                  disabled={stepIndex >= totalSteps}
                  onClick={() => setStepIndex(s => Math.min(totalSteps, s + 1))}
                  title={t.teachingNextStep}
                >
                  <span>{t.teachingNextStep}</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '5px 9px' }}
                  disabled={stepIndex >= totalSteps}
                  onClick={() => setStepIndex(totalSteps)}
                  title={t.teachingFinishStep}
                >
                  <FastForward size={14} />
                </button>
              </div>
            </div>

            {/* Step Content */}
            {stepIndex === 0 ? (
              <div style={{ padding: '10px 0' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '6px' }}>
                  {t.teachingInitialState}
                </div>
                <p className="hint-text" style={{ marginBottom: '8px' }}>
                  {cz
                    ? 'Toto je výchozí gramatika před provedením úpravy. Projděte jednotlivé kroky pomocí tlačítek výše a sledujte, jak se symboly a pravidla manipulují.'
                    : 'This is the initial grammar before the transformation. Step forward using the controls above to see how symbols and productions are manipulated.'}
                </p>
                {currentGrammar && (
                  <pre className="protocol-grammar" style={{ margin: 0 }}>
                    {formatGrammarGrouped(currentGrammar)}
                  </pre>
                )}
              </div>
            ) : transformData && transformData.steps[stepIndex - 1] ? (
              (() => {
                const currentStep = transformData.steps[stepIndex - 1];
                return (
                  <div className="protocol-step" style={{ margin: 0 }}>
                    <div className="protocol-step-title" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {cz ? currentStep.titleCz || currentStep.title : currentStep.title}
                    </div>
                    <p style={{ margin: '6px 0', fontSize: '13px', lineHeight: 1.5 }}>
                      {cz ? currentStep.descriptionCz || currentStep.description : currentStep.description}
                    </p>

                    {(currentStep.mathExplanationCz || currentStep.mathExplanation) && (
                      <div className="protocol-math" style={{ marginBottom: '8px' }}>
                        {cz ? currentStep.mathExplanationCz || currentStep.mathExplanation : currentStep.mathExplanation}
                      </div>
                    )}

                    {/* Added and Removed Rules Diff */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                      {currentStep.removedRules && currentStep.removedRules.length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                          <strong>{t.teachingRemovedRules} (-):</strong>
                          <div className="rule-list" style={{ marginTop: '4px' }}>
                            {currentStep.removedRules.map((r, i) => (
                              <span key={i} className="rule-chip" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                                ✗ {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentStep.addedRules && currentStep.addedRules.length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--color-success)' }}>
                          <strong>{t.teachingAddedRules} (+):</strong>
                          <div className="rule-list" style={{ marginTop: '4px' }}>
                            {currentStep.addedRules.map((r, i) => (
                              <span key={i} className="rule-chip" style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
                                + {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Intermediate Grammar Display */}
                    {currentGrammar && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                          {stepIndex === totalSteps ? t.teachingFinalState : t.teachingIntermediateGrammar}:
                        </div>
                        <pre className="protocol-grammar" style={{ margin: 0 }}>
                          {formatGrammarGrouped(currentGrammar)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : null}
          </>
        )}
      </div>

      {/* Language Equivalence & Normal Form Verification Card with Side-by-Side Derivation Trees */}
      <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--color-primary)" />
          <span>{t.teachingVerificationTreesTitle}</span>
        </div>

        <p className="hint-text" style={{ margin: '4px 0 10px' }}>
          {t.teachingEquivalenceNotice}
        </p>

        {/* Promised Normal Form Properties Checklist */}
        {technique.promisedForm.length > 0 && transformData && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
              {t.teachingPromisedFormTitle}:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {formChecks.map(chk => (
                <span
                  key={chk.property}
                  className={`badge ${chk.ok ? 'badge-success' : 'badge-danger'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                >
                  {chk.ok ? <Check size={13} /> : <XCircle size={13} />}
                  <span>{chk.property}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Equivalence Controls */}
        <div className="equiv-controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{cz ? 'Délka slov do: ' : 'Word length up to: '}</span>
            <input
              type="number"
              min={1}
              max={25}
              value={maxLength}
              onChange={e => setMaxLength(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
              style={{ width: '60px', padding: '3px 6px' }}
            />
          </label>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!activeGrammar || !transformData || runner.state.running}
            onClick={startEquivalenceCheck}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheck size={14} />
            <span>{cz ? 'Ověřit ekvivalenci L(G) = L(G\')' : 'Verify Equivalence L(G) = L(G\')'}</span>
          </button>

          {runner.state.running && !runner.state.paused && (
            <button type="button" className="btn btn-secondary" onClick={runner.stop}>
              {cz ? 'Zastavit' : 'Stop'}
            </button>
          )}
        </div>

        {/* Running status */}
        <div className="equiv-job" style={{ marginTop: '8px' }}>
          <JobStatus
            state={runner.state}
            title={{ en: 'Comparing the languages', cz: 'Porovnání jazyků' }}
            stopHint={{
              en: 'Stopping keeps the result for the lengths checked completely.',
              cz: 'Zastavení ponechá výsledek pro délky, které byly zkontrolovány celé.'
            }}
            lang={lang}
            onResume={runner.resume}
            onStop={runner.stop}
          />
        </div>

        {/* Result of the comparison */}
        {compResult && (
          <div style={{ marginTop: '10px' }}>
            <ComparisonReport result={compResult} lang={lang} />
          </div>
        )}

        {/* Word Selection Bar for Derivation Trees (Offering at least 3 choices) */}
        {activeGrammar && transformData && (
          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <GitCompare size={15} />
              <span>{t.teachingSelectWordToDerive}</span>
            </div>

            {candidateWords.length === 0 ? (
              <p className="hint-text" style={{ fontStyle: 'italic' }}>
                {t.teachingNoWordsFound}
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                {candidateWords.map((cand, idx) => {
                  const isSelected = idx === selectedWordIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 700 : 500
                      }}
                      onClick={() => setSelectedWordIndex(idx)}
                    >
                      <code style={{ fontSize: '13px', fontWeight: 700, background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                        {cand.wordText}
                      </code>
                      <span className="badge" style={{ fontSize: '10.5px', padding: '1px 5px', opacity: 0.85 }}>
                        |w|={cand.length}
                      </span>
                      {cand.usesChangedRule && (
                        <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 4px' }} title={t.teachingUsesChangedRules}>
                          ✓ {cz ? 'změněná pravidla' : 'changed rules'}
                        </span>
                      )}
                      {cand.treesDiffer && (
                        <span className="badge badge-primary" style={{ fontSize: '10px', padding: '1px 4px' }} title={t.teachingTreesDiffer}>
                          Δ {cz ? 'jiný strom' : 'diff tree'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tree Structural Difference Metrics Banner */}
            {activeWordChoice && (
              <div
                style={{
                  background: 'var(--color-surface-hover, rgba(0,0,0,0.03))',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitBranch size={14} color="var(--color-primary)" />
                  <strong>{t.teachingTreeMetrics}:</strong>
                  <span>
                    {t.teachingOriginalGrammarTitle}: <strong>{originalMetrics.nodes}</strong> {t.teachingTreeNodes}, {t.teachingTreeDepth} <strong>{originalMetrics.depth}</strong>
                  </span>
                  <span>vs</span>
                  <span>
                    {t.teachingTransformedGrammarTitle}: <strong>{transformedMetrics.nodes}</strong> {t.teachingTreeNodes}, {t.teachingTreeDepth} <strong>{transformedMetrics.depth}</strong>
                  </span>
                </div>

                <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  {activeWordChoice.usesChangedRule
                    ? (cz ? 'Odvození v G\' využívá transformovaná pravidla.' : 'Derivation in G\' executes the transformed rules.')
                    : (cz ? 'Pravidla v odvození jsou totožná.' : 'Rules in derivation are identical.')}
                </div>
              </div>
            )}

            {/* Row 1: Side-by-Side Grammars */}
            <div className="equiv-grid">
              {/* Left Column: Original Grammar G */}
              <div className="equiv-column">
                <div className="equiv-label" style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '13px' }}>
                  {t.teachingOriginalGrammarTitle}
                </div>

                {activeGrammar ? (
                  <div className="equiv-original" style={{ marginBottom: '10px' }}>
                    {activeGrammar.productions.map(p => (
                      <div key={p.id}>
                        <ProductionText production={p} nonTerminals={activeGrammar.nonTerminals} showId />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="report-box danger">
                    {cz ? 'Chybná gramatika.' : 'Invalid grammar.'}
                  </div>
                )}
              </div>

              {/* Right Column: Transformed Grammar G' */}
              <div className="equiv-column">
                <div className="equiv-label" style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '13px' }}>
                  {t.teachingTransformedGrammarTitle}
                </div>

                {transformData && (
                  <div className="equiv-original" style={{ marginBottom: '10px' }}>
                    {transformData.transformed.productions.map(p => (
                      <div key={p.id}>
                        <ProductionText production={p} nonTerminals={transformData.transformed.nonTerminals} showId />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Side-by-Side Derivation Trees (Aligned on the Exact Same Level) */}
            {(wordDerivationOriginal?.tree || wordDerivationTransformed?.tree) && (
              <div className="equiv-grid" style={{ marginTop: '14px', alignItems: 'flex-start' }}>
                {/* Left Column Tree */}
                <div className="equiv-column">
                  {wordDerivationOriginal && wordDerivationOriginal.generated && wordDerivationOriginal.tree ? (
                    <div className="equiv-word">
                      <div className="equiv-word-caption">
                        {cz ? `Derivační strom v původní gramatice G pro slovo „${activeWordChoice?.wordText}“` : `Derivation tree in original grammar G for word "${activeWordChoice?.wordText}"`}
                      </div>
                      <DerivationTreeVisualizer
                        rootNode={wordDerivationOriginal.tree}
                        height="340px"
                        filename="original_grammar_tree"
                        lang={lang}
                      />
                      <Derivation forms={wordDerivationOriginal.forms} lang={lang} />
                    </div>
                  ) : (
                    <div className="report-box warning" style={{ padding: '12px' }}>
                      {cz ? 'Strom v původní gramatice nelze odvodit.' : 'Tree could not be derived in original grammar.'}
                    </div>
                  )}
                </div>

                {/* Right Column Tree */}
                <div className="equiv-column">
                  {wordDerivationTransformed && wordDerivationTransformed.generated && wordDerivationTransformed.tree ? (
                    <div className="equiv-word">
                      <div className="equiv-word-caption">
                        {cz ? `Derivační strom v upravené gramatice G' pro slovo „${activeWordChoice?.wordText}“` : `Derivation tree in transformed grammar G' for word "${activeWordChoice?.wordText}"`}
                      </div>
                      <DerivationTreeVisualizer
                        rootNode={wordDerivationTransformed.tree}
                        height="340px"
                        filename="transformed_grammar_tree"
                        lang={lang}
                      />
                      <Derivation forms={wordDerivationTransformed.forms} lang={lang} />
                    </div>
                  ) : (
                    <div className="report-box warning" style={{ padding: '12px' }}>
                      {cz ? 'Strom v upravené gramatice nelze odvodit.' : 'Tree could not be derived in transformed grammar.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

