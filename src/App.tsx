import React, { useState, useMemo, useEffect } from 'react';
import { Grammar } from './core/ast/grammar';
import { parseGrammar } from './core/parser/grammarParser';
import { analyzeGrammar, GrammarAnalysis } from './core/analyser/grammarAnalyser';
import { buildLLTable, LLTable } from './core/ll/llTable';
import {
  buildLR0Automaton,
  buildLR1Automaton,
  buildLALR1Automaton,
  LRAutomaton
} from './core/lr/lrAutomaton';
import { buildLRTable, LRTable } from './core/lr/lrTable';
import { PRESET_GRAMMARS } from './core/presets/presetGrammars';
import { Language, TRANSLATIONS } from './i18n/translations';

// Views
import { OverviewView } from './ui/views/OverviewView';
import { FirstFollowView } from './ui/views/FirstFollowView';
import { TransformationsView } from './ui/views/TransformationsView';
import { LLView } from './ui/views/LLView';
import { LRView } from './ui/views/LRView';
import { AutomatonGraphView } from './ui/views/AutomatonGraphView';
import { WordGeneratorView } from './ui/views/WordGeneratorView';
import { LatexExportView } from './ui/views/LatexExportView';
import { LatexExportButton } from './ui/components/LatexExportButton';
import { exportGrammarToLatex } from './core/export/latexExport';

// Icons
import {
  BookOpen, Eye, GitCommit, Layers, Cpu, Network,
  Sparkles, FileText, Sun, Moon, Monitor, AlertCircle, RefreshCw, Clock, AlertTriangle
} from 'lucide-react';

type TabId = 'overview' | 'firstFollow' | 'transformations' | 'll' | 'lr' | 'graph' | 'words' | 'latex';
type Theme = 'dark' | 'light' | 'projector';

export interface AnalysisDataResult {
  analysis: GrammarAnalysis;
  llTable: LLTable;
  lr0Automaton: LRAutomaton;
  slr1Automaton: LRAutomaton;
  lalr1Automaton: LRAutomaton;
  lr1Automaton: LRAutomaton;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table: LRTable;
}

function computeAnalysis(grammar: Grammar | null): AnalysisDataResult | null {
  if (!grammar) return null;

  try {
    const analysis = analyzeGrammar(grammar);
    const llTable = buildLLTable(grammar, analysis);

    const lr0Automaton = buildLR0Automaton(grammar, 'LR(0)');
    const slr1Automaton = buildLR0Automaton(grammar, 'SLR(1)');
    const lalr1Automaton = buildLALR1Automaton(grammar, analysis);
    const lr1Automaton = buildLR1Automaton(grammar, analysis);

    const lr0Table = buildLRTable(lr0Automaton, grammar, analysis);
    const slr1Table = buildLRTable(slr1Automaton, grammar, analysis);
    const lalr1Table = buildLRTable(lalr1Automaton, grammar, analysis);
    const lr1Table = buildLRTable(lr1Automaton, grammar, analysis);

    return {
      analysis,
      llTable,
      lr0Automaton,
      slr1Automaton,
      lalr1Automaton,
      lr1Automaton,
      lr0Table,
      slr1Table,
      lalr1Table,
      lr1Table
    };
  } catch (err) {
    console.error('Analysis error:', err);
    return null;
  }
}

export const App: React.FC = () => {
  const [grammarText, setGrammarText] = useState(PRESET_GRAMMARS[0].grammarText);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_GRAMMARS[0].id);
  const [sampleInput, setSampleInput] = useState(PRESET_GRAMMARS[0].sampleInput);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [lrVariant, setLrVariant] = useState<'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)'>('SLR(1)');
  const [theme, setTheme] = useState<Theme>('dark');
  const [lang, setLang] = useState<Language>('en');

  const t = TRANSLATIONS[lang];

  const handleNavigateToAnalyser = (targetTab: 'll' | 'lr', variant?: 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)') => {
    if (variant) {
      setLrVariant(variant);
    }
    setActiveTab(targetTab);
  };

  // Set data-theme on root html/body
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Recalculation & Stale state management
  const [analyzedGrammarText, setAnalyzedGrammarText] = useState(PRESET_GRAMMARS[0].grammarText);
  const initialParse = useMemo(() => parseGrammar(PRESET_GRAMMARS[0].grammarText), []);
  const [analyzedGrammar, setAnalyzedGrammar] = useState<Grammar | null>(initialParse.grammar || null);
  const [analysisData, setAnalysisData] = useState<AnalysisDataResult | null>(() => computeAnalysis(initialParse.grammar || null));
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalcDuration, setLastCalcDuration] = useState<number>(0);
  const [isHeavyGrammar, setIsHeavyGrammar] = useState(false);

  // Parse currently edited text for syntax error validation
  const parseResult = useMemo(() => parseGrammar(grammarText), [grammarText]);
  const isStale = grammarText.trim() !== analyzedGrammarText.trim();

  // Recalculation logic with timing measurement
  const recalculate = (overrideText?: string) => {
    const textToRun = overrideText !== undefined ? overrideText : grammarText;
    const parsed = parseGrammar(textToRun);
    if (!parsed.grammar) {
      return;
    }

    setIsCalculating(true);

    // Run async in next tick so React renders invalid grey state and spinner first
    setTimeout(() => {
      const startTime = performance.now();
      try {
        const data = computeAnalysis(parsed.grammar!);
        const duration = Math.round(performance.now() - startTime);

        setAnalysisData(data);
        setAnalyzedGrammar(parsed.grammar || null);
        setAnalyzedGrammarText(textToRun);
        setLastCalcDuration(duration);
        setIsHeavyGrammar(duration > 150);
      } catch (err) {
        console.error('Recalculation error:', err);
      } finally {
        setIsCalculating(false);
      }
    }, 15);
  };

  // Auto-recalculate on grammar changes (debounced 350ms)
  // If grammar is heavy (> 150ms calculation time), pause auto-recalculation while typing
  // to prevent UI lag, showing results as invalid (grey) with recalculate button.
  useEffect(() => {
    if (grammarText.trim() === analyzedGrammarText.trim()) {
      return;
    }

    if (isHeavyGrammar) {
      return; // Wait for manual click on recalculate button
    }

    const timer = setTimeout(() => {
      recalculate();
    }, 350);

    return () => clearTimeout(timer);
  }, [grammarText, analyzedGrammarText, isHeavyGrammar]);

  // Load preset handler
  const handleSelectPreset = (presetId: string) => {
    const preset = PRESET_GRAMMARS.find(p => p.id === presetId);
    if (preset) {
      setSelectedPresetId(preset.id);
      setGrammarText(preset.grammarText);
      setSampleInput(preset.sampleInput);
      recalculate(preset.grammarText);
    }
  };

  // Apply transformed grammar handler
  const handleApplyGrammarText = (newText: string) => {
    setGrammarText(newText);
    recalculate(newText);
  };

  return (
    <div>
      {/* Top Application Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">📐</div>
          <div>
            <div className="brand-title">{t.appTitle}</div>
            <div className="brand-subtitle">{t.appSubtitle}</div>
          </div>
        </div>

        <div className="header-controls">
          {/* Language Switcher */}
          <div style={{ display: 'flex', gap: '2px', backgroundColor: 'var(--color-bg-base)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            <button
              className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              className={`btn ${lang === 'cz' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setLang('cz')}
            >
              CZ
            </button>
          </div>

          {/* Theme Selector */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn-icon ${theme === 'dark' ? 'active' : ''}`}
              title="Dark Theme"
              onClick={() => setTheme('dark')}
            >
              <Moon size={16} />
            </button>
            <button
              className={`btn-icon ${theme === 'light' ? 'active' : ''}`}
              title="Light Theme"
              onClick={() => setTheme('light')}
            >
              <Sun size={16} />
            </button>
            <button
              className={`btn-icon ${theme === 'projector' ? 'active' : ''}`}
              title="Classroom / Projector Mode"
              onClick={() => setTheme('projector')}
            >
              <Monitor size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Split-Pane Layout */}
      <div className="main-layout">
        {/* Left Pane: Grammar Editor & Presets */}
        <aside className="left-pane">
          <div className="editor-section">
            {/* Presets Selector */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
                {t.presets}
              </label>
              <select
                className="grammar-textarea"
                style={{ minHeight: 'unset', height: '36px', padding: '6px 10px', fontSize: '12.5px' }}
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
              >
                {PRESET_GRAMMARS.map(p => (
                  <option key={p.id} value={p.id}>
                    {lang === 'cz' ? p.nameCz : p.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Grammar Textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {t.editorTitle}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {lastCalcDuration > 0 && (
                    <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} />
                      {t.calcDuration.replace('{ms}', lastCalcDuration.toString())}
                    </span>
                  )}
                  {analyzedGrammar && (
                    <LatexExportButton
                      getLatex={() => exportGrammarToLatex(analyzedGrammar)}
                      filename="grammar.tex"
                      lang={lang}
                      title={lang === 'cz' ? 'Zkopírovat gramatiku jako LaTeX' : 'Copy grammar as LaTeX'}
                    />
                  )}
                  <button
                    className={`btn ${isStale ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => recalculate()}
                    disabled={isCalculating || !parseResult.grammar}
                    title={t.recalculateAnalysis}
                  >
                    <RefreshCw size={12} className={isCalculating ? 'spin-icon' : ''} />
                    <span>{isCalculating ? t.recalculating : t.recalculateAnalysis}</span>
                  </button>
                </div>
              </div>

              <textarea
                className="grammar-textarea"
                style={{ flex: 1, minHeight: '260px' }}
                value={grammarText}
                onChange={(e) => setGrammarText(e.target.value)}
                placeholder={t.editorPlaceholder}
                spellCheck={false}
              />
            </div>

            {/* Parse Errors Banner */}
            {parseResult.errors.length > 0 && (
              <div style={{
                backgroundColor: 'var(--color-danger-subtle)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-danger)', fontWeight: 700, fontSize: '12px' }}>
                  <AlertCircle size={15} />
                  <span>{t.syntaxErrorTitle}</span>
                </div>
                <ul style={{ paddingLeft: '18px', fontSize: '11.5px', color: 'var(--color-danger)', marginTop: '4px' }}>
                  {parseResult.errors.map((err: { line: number; message: string }, idx: number) => (
                    <li key={idx}>{lang === 'cz' ? 'Řádek' : 'Line'} {err.line}: {err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick Syntax Hint */}
            <div style={{
              backgroundColor: 'var(--color-bg-base)',
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              lineHeight: '1.4'
            }}>
              <strong>{t.syntaxHintTitle}</strong>
              <div>{t.syntaxNonTerminals}</div>
              <div>{t.syntaxTerminals}</div>
              <div>{t.syntaxEps}</div>
              <div>{t.syntaxAlts}</div>
            </div>
          </div>
        </aside>

        {/* Right Pane: Analysis Dashboard & Simulator */}
        <main className="right-pane">
          {/* Navigation Tabs */}
          <div className="tabs-header">
            <button
              className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <Eye size={15} />
              <span>{t.tabOverview}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'firstFollow' ? 'active' : ''}`}
              onClick={() => setActiveTab('firstFollow')}
            >
              <GitCommit size={15} />
              <span>{t.tabFirstFollow}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'transformations' ? 'active' : ''}`}
              onClick={() => setActiveTab('transformations')}
            >
              <Sparkles size={15} />
              <span>{t.tabTransform}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'll' ? 'active' : ''}`}
              onClick={() => setActiveTab('ll')}
            >
              <Layers size={15} />
              <span>{t.tabLL}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'lr' ? 'active' : ''}`}
              onClick={() => setActiveTab('lr')}
            >
              <Cpu size={15} />
              <span>{t.tabLR}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'graph' ? 'active' : ''}`}
              onClick={() => setActiveTab('graph')}
            >
              <Network size={15} />
              <span>{t.tabGraph}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'words' ? 'active' : ''}`}
              onClick={() => setActiveTab('words')}
            >
              <BookOpen size={15} />
              <span>{t.tabWords}</span>
            </button>
            <button
              className={`tab-button ${activeTab === 'latex' ? 'active' : ''}`}
              onClick={() => setActiveTab('latex')}
            >
              <FileText size={15} />
              <span>{t.tabLatex}</span>
            </button>
          </div>

          {/* Active Tab View */}
          <div className="tab-content">
            {/* Outdated / Invalid Banner when grammar changed or calculation is in progress */}
            {(isStale || isCalculating) && analysisData && (
              <div className="outdated-banner">
                <div className="outdated-banner-text">
                  <AlertTriangle size={18} />
                  <div>
                    <div>{t.outdatedResultsBanner}</div>
                    {isHeavyGrammar && lastCalcDuration > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '2px' }}>
                        {t.heavyGrammarNotice.replace('{ms}', lastCalcDuration.toString())}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => recalculate()}
                  disabled={isCalculating || !parseResult.grammar}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                >
                  <RefreshCw size={14} className={isCalculating ? 'spin-icon' : ''} />
                  <span>{isCalculating ? t.recalculating : t.recalculateAnalysis}</span>
                </button>
              </div>
            )}

            {!analyzedGrammar || !analysisData ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                {t.pleaseSpecifyGrammar}
              </div>
            ) : (
              <div className={isStale || isCalculating ? 'results-invalid' : ''}>
                {activeTab === 'overview' && (
                  <OverviewView
                    grammar={analyzedGrammar}
                    analysis={analysisData.analysis}
                    llTable={analysisData.llTable}
                    lr0Table={analysisData.lr0Table}
                    slr1Table={analysisData.slr1Table}
                    lalr1Table={analysisData.lalr1Table}
                    lr1Table={analysisData.lr1Table}
                    lang={lang}
                    onNavigateToTab={(tab, variant) => {
                      if (variant) setLrVariant(variant);
                      setActiveTab(tab);
                    }}
                  />
                )}

                {activeTab === 'firstFollow' && (
                  <FirstFollowView
                    grammar={analyzedGrammar}
                    analysis={analysisData.analysis}
                    lang={lang}
                  />
                )}

                {activeTab === 'transformations' && (
                  <TransformationsView
                    grammar={analyzedGrammar}
                    onApplyGrammarText={handleApplyGrammarText}
                    lang={lang}
                  />
                )}

                {activeTab === 'll' && (
                  <LLView
                    grammar={analyzedGrammar}
                    llTable={analysisData.llTable}
                    defaultInput={sampleInput}
                    lang={lang}
                  />
                )}

                {activeTab === 'lr' && (
                  <LRView
                    grammar={analyzedGrammar}
                    lr0Table={analysisData.lr0Table}
                    slr1Table={analysisData.slr1Table}
                    lalr1Table={analysisData.lalr1Table}
                    lr1Table={analysisData.lr1Table}
                    defaultInput={sampleInput}
                    lang={lang}
                    selectedVariant={lrVariant}
                    onSelectVariant={setLrVariant}
                  />
                )}

                {activeTab === 'graph' && (
                  <AutomatonGraphView
                    grammar={analyzedGrammar}
                    lr0Automaton={analysisData.lr0Automaton}
                    slr1Automaton={analysisData.slr1Automaton}
                    lalr1Automaton={analysisData.lalr1Automaton}
                    lr1Automaton={analysisData.lr1Automaton}
                    lr0Table={analysisData.lr0Table}
                    slr1Table={analysisData.slr1Table}
                    lalr1Table={analysisData.lalr1Table}
                    lr1Table={analysisData.lr1Table}
                    lang={lang}
                  />
                )}

                {activeTab === 'words' && (
                  <WordGeneratorView
                    grammar={analyzedGrammar}
                    lang={lang}
                  />
                )}

                {activeTab === 'latex' && (
                  <LatexExportView
                    grammar={analyzedGrammar}
                    analysis={analysisData.analysis}
                    llTable={analysisData.llTable}
                    slr1Table={analysisData.slr1Table}
                    lang={lang}
                  />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
