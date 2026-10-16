import React, { useState, useMemo, useEffect } from 'react';
import { Grammar, formatGrammarForEditor, formatGrammarGrouped, cloneGrammar } from '../../core/ast/grammar';
import { parseGrammar, ParseOptions } from '../../core/parser/grammarParser';
import { checkForm, compareLanguagesSteps, ComparisonResult } from '../../core/analyser/equivalence';
import { JobControl } from '../../core/jobs/job';
import { useSteppedJob } from '../useSteppedJob';
import { JobStatus } from '../components/JobStatus';
import { ComparisonReport } from './EquivalenceView';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { TEACHING_TECHNIQUES, TechniqueGuide } from '../../core/teaching/teachingGuideData';
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
  Circle
} from 'lucide-react';

interface TeachingGuideViewProps {
  lang: Language;
  parseOptions: ParseOptions;
  onLoadIntoEditor?: (text: string) => void;
}

export const TeachingGuideView: React.FC<TeachingGuideViewProps> = ({
  lang,
  parseOptions,
  onLoadIntoEditor
}) => {
  const cz = lang === 'cz';
  const t = TRANSLATIONS[lang];

  const [selectedId, setSelectedId] = useState<string>('reduce');
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [maxLength, setMaxLength] = useState<number>(10);
  const [compResult, setCompResult] = useState<ComparisonResult | null>(null);
  const runner = useSteppedJob();

  const technique = useMemo(
    () => TEACHING_TECHNIQUES.find(t => t.id === selectedId) || TEACHING_TECHNIQUES[0],
    [selectedId]
  );

  // Parse original example grammar
  const parsedOriginal = useMemo(
    () => parseGrammar(technique.exampleGrammarText, parseOptions),
    [technique.exampleGrammarText, parseOptions]
  );

  // Execute the transformation to obtain all steps and the final grammar
  const transformData = useMemo(() => {
    if (!parsedOriginal.grammar) return null;
    const res = technique.apply(cloneGrammar(parsedOriginal.grammar));

    // Ensure every step has an intermediate grammar snapshot
    const stepsWithGrammar = res.steps.map((st, i) => {
      if (st.intermediateGrammar) return st;
      // If intermediate grammar missing on intermediate step, use final transformed
      return {
        ...st,
        intermediateGrammar: i === res.steps.length - 1 ? res.transformedGrammar : res.transformedGrammar
      };
    });

    return {
      transformed: res.transformedGrammar,
      steps: stepsWithGrammar
    };
  }, [technique, parsedOriginal.grammar]);

  // Reset step index and comparison results when technique changes
  useEffect(() => {
    setStepIndex(0);
    setCompResult(null);
    runner.stop();
  }, [selectedId]);

  const totalSteps = transformData ? transformData.steps.length : 0;

  // The grammar shown at the current step:
  // Step 0 = original grammar
  // Step k (1 <= k <= totalSteps) = step k's intermediate grammar
  const currentGrammar: Grammar | null = useMemo(() => {
    if (stepIndex === 0) return parsedOriginal.grammar ?? null;
    if (!transformData || transformData.steps.length === 0) return null;
    const clampedIndex = Math.min(stepIndex, transformData.steps.length);
    const step = transformData.steps[clampedIndex - 1];
    return step.intermediateGrammar || transformData.transformed;
  }, [stepIndex, parsedOriginal.grammar, transformData]);

  // Check promised normal form properties on the final transformed grammar
  const formChecks = useMemo(() => {
    if (!transformData) return [];
    return checkForm(transformData.transformed, technique.promisedForm);
  }, [transformData, technique.promisedForm]);

  // Language equivalence runner
  const startEquivalenceCheck = () => {
    if (!parsedOriginal.grammar || !transformData) return;
    const control: JobControl = { stop: false };
    setCompResult(null);
    runner.start(
      compareLanguagesSteps(parsedOriginal.grammar, transformData.transformed, control, maxLength),
      control,
      res => setCompResult(res)
    );
  };

  const categories = [
    {
      id: 'clean',
      label: cz ? 'Čištění a redukce' : 'Cleaning & Reduction',
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'clean')
    },
    {
      id: 'll1',
      label: cz ? 'Levá rekurze a LL(1)' : 'Left Recursion & LL(1)',
      items: TEACHING_TECHNIQUES.filter(x => x.category === 'll1')
    },
    {
      id: 'normal',
      label: cz ? 'Normální formy (CNF / GNF)' : 'Normal Forms (CNF / GNF)',
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

        {/* Defect vs Remedy Comparison */}
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
                <FileCode size={13} />
                <span>{cz ? 'Do editoru' : 'To Editor'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Note on what is wrong in the example */}
        <div className="notice-box warning" style={{ marginBottom: '14px' }}>
          <div className="notice-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} />
            <span>{cz ? 'Ukázkový příklad s chybou' : 'Pedagogical Example with Error'}</span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '12px' }}>
            {cz ? technique.exampleIssueNote.cz : technique.exampleIssueNote.en}
          </p>
        </div>

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
      </div>

      {/* Language Equivalence & Normal Form Verification Card */}
      <div className="card" style={{ border: '2px solid var(--color-primary)' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--color-primary)" />
          <span>{t.teachingVerifyEquivalence}</span>
        </div>

        <p className="hint-text" style={{ margin: '4px 0 10px' }}>
          {t.teachingEquivalenceNotice}
        </p>

        {/* Promised Normal Form Properties Checklist */}
        {technique.promisedForm.length > 0 && (
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
            disabled={!parsedOriginal.grammar || !transformData || runner.state.running}
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
      </div>
    </div>
  );
};
