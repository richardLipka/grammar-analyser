import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Grammar, formatGrammarForEditor } from './core/ast/grammar';
import { parseGrammar, oneRulePerLine, ParseError } from './core/parser/grammarParser';
import { analyzeGrammar, GrammarAnalysis } from './core/analyser/grammarAnalyser';
import { buildLLTable, LLTable } from './core/ll/llTable';
import {
  buildLR0Automaton,
  buildLR1Automaton,
  buildLALR1Automaton,
  LRAutomaton
} from './core/lr/lrAutomaton';
import { buildLRTable, LRTable, LRLayout } from './core/lr/lrTable';
import { PRESET_GRAMMARS, PresetGrammar } from './core/presets/presetGrammars';
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
import { FavLogo } from './ui/components/FavLogo';
import { exportGrammarToLatex } from './core/export/latexExport';
import { TransformationResult } from './core/processor/grammarProcessor';
import { WHOLE_GRAMMAR_TRANSFORMATIONS } from './ui/wholeGrammarTransformations';
import { GrammarClickView } from './ui/components/GrammarClickView';
import { useGrammarHistory } from './ui/useGrammarHistory';
import { TransformationInfoDialog, InfoButton } from './ui/components/TransformationInfo';
import { InfoKey } from './core/processor/transformationInfo';
import { readUrlState, buildShareUrl, UrlState, UrlTab } from './ui/urlState';

// Icons
import {
  BookOpen, Eye, GitCommit, Layers, Cpu, Network, Link2, Check, HelpCircle, Undo2, Redo2, MousePointerClick, Type,
  Sparkles, FileText, Sun, Moon, Monitor, AlertCircle, RefreshCw, Clock, AlertTriangle, Info
} from 'lucide-react';

type TabId = UrlTab;
type EChoice = 'epsilon' | 'terminal';
type Theme = 'dark' | 'light' | 'projector';
type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

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

    return {
      analysis,
      llTable,
      lr0Automaton,
      slr1Automaton,
      lalr1Automaton,
      lr1Automaton,
      lr0Table: buildLRTable(lr0Automaton, grammar, analysis),
      slr1Table: buildLRTable(slr1Automaton, grammar, analysis),
      lalr1Table: buildLRTable(lalr1Automaton, grammar, analysis),
      lr1Table: buildLRTable(lr1Automaton, grammar, analysis)
    };
  } catch (err) {
    console.error('Analysis error:', err);
    return null;
  }
}

/** Per-viewer conveniences only; the app works the same when storage is unavailable. */
function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const PRESET_CATEGORY_LABELS: Record<PresetGrammar['category'], { en: string; cz: string }> = {
  Arithmetic: { en: 'Arithmetic expressions', cz: 'Aritmetické výrazy' },
  LL: { en: 'LL parsing', cz: 'Analýza LL' },
  LR: { en: 'LR parsing', cz: 'Analýza LR' },
  Ambiguity: { en: 'Ambiguity', cz: 'Nejednoznačnost' },
  Transformations: { en: 'Transformations', cz: 'Úpravy gramatiky' },
  Formats: { en: 'Input formats', cz: 'Formáty zápisu' }
};

const CUSTOM_PRESET_ID = '__custom__';


// Only an explicit choice is remembered, so the defaults (Czech, light theme) apply until the user changes them.
const THEME_KEY = 'grammar-analyser.theme';
const LANG_KEY = 'grammar-analyser.lang';
const LR_LAYOUT_KEY = 'grammar-analyser.lrLayout';

/** Symbols that are awkward to type (touch screens, keyboards without these characters). */
const EDITOR_SYMBOLS: { insert: string; close?: string; label: string; titleEn: string; titleCz: string; spaced?: boolean }[] = [
  { insert: '→', label: '→', titleEn: 'Rule arrow', titleCz: 'Šipka pravidla', spaced: true },
  { insert: '|', label: '|', titleEn: 'Next alternative (right-hand side separator)', titleCz: 'Další alternativa (oddělovač pravých stran)', spaced: true },
  { insert: 'ε', label: 'ε', titleEn: 'Empty word', titleCz: 'Prázdné slovo' },
  { insert: "'", label: "A'", titleEn: 'Prime (new non-terminal A\')', titleCz: "Čárka (nový neterminál A')" },
  { insert: '"', close: '"', label: '"…"', titleEn: 'Quoted terminal', titleCz: 'Terminál v uvozovkách' },
  { insert: '<', close: '>', label: '<…>', titleEn: 'Named non-terminal', titleCz: 'Pojmenovaný neterminál' },
  { insert: '\n', label: '↵', titleEn: 'New line (new rule)', titleCz: 'Nový řádek (nové pravidlo)' }
];

/** The first screen: a grammar from the link (?g=… or ?preset=…), otherwise the first example. */
function initialSetup() {
  let url: UrlState = {};
  try {
    url = readUrlState(window.location.search, window.location.hash);
  } catch {
    /* no usable location */
  }
  const linkedPreset = PRESET_GRAMMARS.find(p => p.id === url.preset);
  // A linked grammar is often written on one line ("S->aAS|b;A->a|bSA"): one rule per line in the editor
  const grammarText = url.grammar !== undefined ? oneRulePerLine(url.grammar) : (linkedPreset ?? PRESET_GRAMMARS[0]).grammarText;
  const preset = PRESET_GRAMMARS.find(p => p.grammarText === grammarText);
  return {
    url,
    grammarText,
    presetId: preset?.id ?? CUSTOM_PRESET_ID,
    sampleInput: url.word ?? preset?.sampleInput ?? ''
  };
}

export const App: React.FC = () => {
  const [setup] = useState(initialSetup);
  const [grammarText, setGrammarText] = useState(setup.grammarText);
  const [selectedPresetId, setSelectedPresetId] = useState(setup.presetId);
  const [sampleInput, setSampleInput] = useState(setup.sampleInput);
  const [activeTab, setActiveTab] = useState<TabId>(setup.url.tab ?? 'overview');
  const [lrVariant, setLrVariant] = useState<LRVariantName>('SLR(1)');
  // LR tables and states: lecture f/g with named states (default) or Dragon Book ACTION/GOTO
  const [lrLayout, setLrLayoutState] = useState<LRLayout>(() => readStored(LR_LAYOUT_KEY, ['lecture', 'dragon'] as const, 'lecture'));
  // A theme or language given in the link applies to this visit only
  const [theme, setThemeState] = useState<Theme>(() => setup.url.theme ?? readStored(THEME_KEY, ['dark', 'light', 'projector'] as const, 'light'));
  const [lang, setLangState] = useState<Language>(() => setup.url.lang ?? readStored(LANG_KEY, ['en', 'cz'] as const, 'cz'));
  // How a standalone e is read; null = not decided yet (read as ε and ask)
  const [eChoice, setEChoice] = useState<EChoice | null>(setup.url.e ?? null);
  const eIsEpsilon = eChoice !== 'terminal';
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  // Text editing, or transformations by clicking symbols of the grammar
  const [editorMode, setEditorMode] = useState<'text' | 'click'>('text');
  const [notice, setNotice] = useState<string | null>(null);
  // Description and literature of a transformation ('all' = overview of all of them)
  const [infoKey, setInfoKey] = useState<InfoKey | 'all' | null>(null);
  // Undo/redo of the grammar text: typing is committed after a pause, transformations at once
  const history = useGrammarHistory(setup.grammarText);
  const grammarTextRef = useRef(setup.grammarText);
  const typingTimer = useRef<number | undefined>(undefined);

  const t = TRANSLATIONS[lang];

  const setTheme = (value: Theme) => {
    setThemeState(value);
    writeStored(THEME_KEY, value);
  };
  const setLang = (value: Language) => {
    setLangState(value);
    writeStored(LANG_KEY, value);
  };
  const setLrLayout = (value: LRLayout) => {
    setLrLayoutState(value);
    writeStored(LR_LAYOUT_KEY, value);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang === 'cz' ? 'cs' : 'en');
  }, [lang]);

  // On phones the tab bar is a single scrollable row: keep the active tab visible
  useEffect(() => {
    document.querySelector('.tab-button.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTab]);

  // Recalculation & Stale state management. The initial grammar (also one from a link) is analysed right away.
  const [analyzedGrammarText, setAnalyzedGrammarText] = useState(setup.grammarText);
  const initialParse = useMemo(() => parseGrammar(setup.grammarText, { eIsEpsilon }), []);
  const initialGrammar = initialParse.errors.length === 0 ? initialParse.grammar ?? null : null;
  const [analyzedGrammar, setAnalyzedGrammar] = useState<Grammar | null>(initialGrammar);
  const [analysisData, setAnalysisData] = useState<AnalysisDataResult | null>(() => computeAnalysis(initialGrammar));
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalcDuration, setLastCalcDuration] = useState<number>(0);
  const [isHeavyGrammar, setIsHeavyGrammar] = useState(false);

  // Parse currently edited text for syntax error validation
  const parseResult = useMemo(() => parseGrammar(grammarText, { eIsEpsilon }), [grammarText, eIsEpsilon]);
  const canAnalyse = !!parseResult.grammar && parseResult.errors.length === 0;
  const isStale = grammarText.trim() !== analyzedGrammarText.trim();

  const recalculate = (overrideText?: string, epsilonE = eIsEpsilon) => {
    const textToRun = overrideText !== undefined ? overrideText : grammarText;
    const parsed = parseGrammar(textToRun, { eIsEpsilon: epsilonE });
    if (!parsed.grammar || parsed.errors.length > 0) {
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

  // Auto-recalculate on grammar changes (debounced 350ms). Heavy grammars
  // (> 150 ms) wait for the manual button so typing stays responsive.
  useEffect(() => {
    if (grammarText.trim() === analyzedGrammarText.trim() || isHeavyGrammar || !canAnalyse) {
      return;
    }
    const timer = setTimeout(() => recalculate(), 350);
    return () => clearTimeout(timer);
  }, [grammarText, analyzedGrammarText, isHeavyGrammar, canAnalyse]);

  /** Commits typed text that has not been recorded in the history yet. */
  const flushTyping = () => {
    if (typingTimer.current !== undefined) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = undefined;
    }
    const h = history.get();
    if (grammarTextRef.current !== h.entries[h.index].text) {
      history.commit({ text: grammarTextRef.current, kind: 'edit' });
    }
  };

  /** Shows a grammar text from the history or from a transformation and analyses it. */
  const showText = (text: string) => {
    grammarTextRef.current = text;
    setGrammarText(text);
    setSelectedPresetId(PRESET_GRAMMARS.find(p => p.grammarText === text)?.id ?? CUSTOM_PRESET_ID);
    recalculate(text);
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = PRESET_GRAMMARS.find(p => p.id === presetId);
    if (preset) {
      flushTyping();
      history.commit({ text: preset.grammarText, kind: 'preset', titleEn: preset.nameEn, titleCz: preset.nameCz });
      setSampleInput(preset.sampleInput);
      showText(preset.grammarText);
    }
  };

  const handleEditGrammar = (text: string) => {
    grammarTextRef.current = text;
    setGrammarText(text);
    const preset = PRESET_GRAMMARS.find(p => p.id === selectedPresetId);
    if (preset && preset.grammarText !== text) {
      setSelectedPresetId(CUSTOM_PRESET_ID);
    }
    if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(flushTyping, 800);
  };

  /** Applies a transformation directly to the grammar in the editor (one undoable step). */
  const applyTransformation = (result: TransformationResult, title: { en: string; cz: string }) => {
    if (result.steps.length === 0) {
      setNotice(t.nothingChanged);
      window.setTimeout(() => setNotice(null), 2500);
      return;
    }
    const text = formatGrammarForEditor(result.transformedGrammar);
    flushTyping();
    history.commit({ text, kind: 'transform', titleEn: title.en, titleCz: title.cz, steps: result.steps });
    showText(text);
  };

  const applyWholeGrammar = (id: string) => {
    const tr = WHOLE_GRAMMAR_TRANSFORMATIONS.find(x => x.id === id);
    if (!tr || !parseResult.grammar || parseResult.errors.length > 0) return;
    applyTransformation(tr.fn(parseResult.grammar), { en: tr.label(TRANSLATIONS.en), cz: tr.label(TRANSLATIONS.cz) });
  };

  const goToHistory = (i: number) => {
    flushTyping();
    const entry = history.goTo(i);
    if (entry) showText(entry.text);
  };
  const undo = () => {
    flushTyping();
    goToHistory(history.get().index - 1);
  };
  const redo = () => {
    flushTyping();
    goToHistory(history.get().index + 1);
  };
  const canUndo = history.index > 0 || grammarText !== history.entries[history.index].text;
  const currentEntry = history.entries[history.index];
  const canRedo = history.index < history.entries.length - 1;

  /** Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) act on the grammar history. */
  const handleUndoKeys = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; key: string; preventDefault: () => void }) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  };
  // Outside text fields (e.g. after clicking a transformation) the shortcuts work too
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      handleUndoKeys(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /** Inserts a palette symbol at the caret (or wraps the selection for paired symbols). */
  const insertSymbol = (sym: (typeof EDITOR_SYMBOLS)[number]) => {
    const ta = editorRef.current;
    const start = ta ? ta.selectionStart : grammarText.length;
    const end = ta ? ta.selectionEnd : grammarText.length;
    const before = grammarText.slice(0, start);
    const selected = grammarText.slice(start, end);
    const after = grammarText.slice(end);
    let piece = sym.close !== undefined ? `${sym.insert}${selected}${sym.close}` : sym.insert;
    if (sym.spaced) {
      piece = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}${piece}${/^\s/.test(after) ? '' : ' '}`;
    }
    handleEditGrammar(before + piece + after);
    // Caret: between an empty pair, otherwise after the inserted text
    const caret = sym.close !== undefined && selected.length === 0 ? start + sym.insert.length : start + piece.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    });
  };

  /** The user's answer to "does e mean ε?"; the analysis is redone at once. */
  const chooseE = (choice: EChoice) => {
    setEChoice(choice);
    recalculate(grammarText, choice === 'epsilon');
  };

  /** Copies a link that reopens this grammar; it is also put in the address bar in case copying is refused. */
  const copyLink = async () => {
    const url = buildShareUrl(`${window.location.origin}${window.location.pathname}`, {
      grammar: grammarText,
      word: sampleInput,
      e: parseResult.bareE && eChoice !== null ? eChoice : undefined,
      tab: activeTab
    });
    try {
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      /* clipboard unavailable or denied */
    }
    setLinkFeedback(copied ? t.linkCopied : t.linkInAddressBar);
    setTimeout(() => setLinkFeedback(null), 2500);
  };

  const selectedPreset = PRESET_GRAMMARS.find(p => p.id === selectedPresetId);
  const categories = [...new Set(PRESET_GRAMMARS.map(p => p.category))];
  const msg = (e: ParseError) => (lang === 'cz' ? e.messageCz || e.message : e.message);

  const tabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <Eye size={15} />, label: t.tabOverview },
    { id: 'firstFollow', icon: <GitCommit size={15} />, label: t.tabFirstFollow },
    { id: 'transformations', icon: <Sparkles size={15} />, label: t.tabTransform },
    { id: 'll', icon: <Layers size={15} />, label: t.tabLL },
    { id: 'lr', icon: <Cpu size={15} />, label: t.tabLR },
    { id: 'graph', icon: <Network size={15} />, label: t.tabGraph },
    { id: 'words', icon: <BookOpen size={15} />, label: t.tabWords },
    { id: 'latex', icon: <FileText size={15} />, label: t.tabLatex }
  ];

  return (
    <div className="app-shell">
      <TransformationInfoDialog infoKey={infoKey} onClose={() => setInfoKey(null)} onShowAll={() => setInfoKey('all')} lang={lang} />
      {/* Top Application Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">📐</div>
          <div>
            <div className="brand-title">{t.appTitle}</div>
            <div className="brand-subtitle">{t.appSubtitle}</div>
          </div>
        </div>

        {/* Author and affiliation, as in the author's other teaching tools */}
        <div className="header-credit">
          <a
            className="header-logo"
            href="https://www.kiv.zcu.cz/cs"
            target="_blank"
            rel="noopener noreferrer"
            title={t.affiliation}
            aria-label={t.affiliation}
          >
            <FavLogo />
          </a>
          <div className="header-credit-text">
            <div>
              © 2026{' '}
              <a href="https://home.zcu.cz/~lipka/" target="_blank" rel="noopener noreferrer">Richard Lipka</a>
              <span className="credit-extra">
                <span aria-hidden="true"> · </span>
                <a href="mailto:lipka@fav.zcu.cz">lipka@fav.zcu.cz</a>
              </span>
            </div>
            <div>
              <a href="https://github.com/richardLipka/grammar-analyser/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">
                {t.licence}
              </a>
              <span aria-hidden="true"> · </span>
              <a href="https://github.com/richardLipka/grammar-analyser" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </div>

        <div className="header-controls">
          {/* Language Switcher */}
          <div style={{ display: 'flex', gap: '2px', backgroundColor: 'var(--color-bg-base)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            <button
              className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
            >
              EN
            </button>
            <button
              className={`btn ${lang === 'cz' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setLang('cz')}
              aria-pressed={lang === 'cz'}
            >
              CZ
            </button>
          </div>

          {/* Theme Selector */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className={`btn-icon ${theme === 'dark' ? 'active' : ''}`} title={t.dark} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <Moon size={16} />
            </button>
            <button className={`btn-icon ${theme === 'light' ? 'active' : ''}`} title={t.light} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <Sun size={16} />
            </button>
            <button className={`btn-icon ${theme === 'projector' ? 'active' : ''}`} title={t.projectorMode} aria-pressed={theme === 'projector'} onClick={() => setTheme('projector')}>
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
              <label htmlFor="preset-select" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
                {t.presets}
              </label>
              <select
                id="preset-select"
                className="grammar-textarea"
                style={{ minHeight: 'unset', height: '36px', padding: '6px 10px', fontSize: '12.5px' }}
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
              >
                {selectedPresetId === CUSTOM_PRESET_ID && (
                  <option value={CUSTOM_PRESET_ID}>{t.customGrammar}</option>
                )}
                {categories.map(cat => (
                  <optgroup key={cat} label={PRESET_CATEGORY_LABELS[cat][lang]}>
                    {PRESET_GRAMMARS.filter(p => p.category === cat).map(p => (
                      <option key={p.id} value={p.id}>
                        {lang === 'cz' ? p.nameCz : p.nameEn}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedPreset && (
                <div className="preset-description">
                  {lang === 'cz' ? selectedPreset.descriptionCz : selectedPreset.descriptionEn}
                </div>
              )}
            </div>

            {/* Grammar Textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <label htmlFor="grammar-editor" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {t.editorTitle}
                </label>
                {lastCalcDuration > 0 && (
                  <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Clock size={11} />
                    {t.calcDuration.replace('{ms}', lastCalcDuration.toString())}
                  </span>
                )}
              </div>

              {/* One line: text/click mode, undo/redo and whole-grammar transformations */}
              <div className="editor-toolbar">
                <div className="editor-mode" role="group" aria-label={t.editorModeLabel}>
                  <button
                    type="button"
                    className={`btn ${editorMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={editorMode === 'text'}
                    onClick={() => setEditorMode('text')}
                  >
                    <Type size={12} />
                    <span>{t.editorModeText}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn ${editorMode === 'click' ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={editorMode === 'click'}
                    onClick={() => setEditorMode('click')}
                  >
                    <MousePointerClick size={12} />
                    <span>{t.editorModeClick}</span>
                  </button>
                </div>
                <span className="editor-toolbar-sep" aria-hidden="true" />
                <div className="editor-toolbar-right">
                  <button type="button" className="btn btn-secondary" onClick={undo} disabled={!canUndo} title={t.undoTitle} aria-label={t.undo}>
                    <Undo2 size={13} />
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={redo} disabled={!canRedo} title={t.redoTitle} aria-label={t.redo}>
                    <Redo2 size={13} />
                  </button>
                  <select
                    className="whole-grammar-select"
                    value=""
                    disabled={!canAnalyse}
                    aria-label={t.wholeGrammarMenu}
                    onChange={(e) => applyWholeGrammar(e.target.value)}
                  >
                    <option value="">{t.wholeGrammarMenu}…</option>
                    {WHOLE_GRAMMAR_TRANSFORMATIONS.map(tr => (
                      <option key={tr.id} value={tr.id} title={tr.hint(t)}>{tr.label(t)}</option>
                    ))}
                  </select>
                  <InfoButton lang={lang} onClick={() => setInfoKey('all')} />
                </div>
              </div>

              <div className="editor-area">
              {editorMode === 'text' ? (
                <>
                  <textarea
                    id="grammar-editor"
                    ref={editorRef}
                    className="grammar-textarea"
                    style={{ flex: 1, minHeight: '220px' }}
                    value={grammarText}
                    onChange={(e) => handleEditGrammar(e.target.value)}
                    onKeyDown={handleUndoKeys}
                    placeholder={t.editorPlaceholder}
                    spellCheck={false}
                  />
                </>
              ) : canAnalyse && parseResult.grammar ? (
                <GrammarClickView
                  grammar={parseResult.grammar}
                  analysis={!isStale && analysisData ? analysisData.analysis : undefined}
                  llConflicts={!isStale && analysisData ? analysisData.llTable.conflicts : undefined}
                  lang={lang}
                  onApply={applyTransformation}
                  onShowInfo={setInfoKey}
                />
              ) : (
                <div className="click-grammar click-grammar-empty">{t.clickModeErrors}</div>
              )}
                <button
                  className={`btn ${isStale ? 'btn-primary' : 'btn-secondary'} recalc-corner`}
                  onClick={() => recalculate()}
                  disabled={isCalculating || !canAnalyse}
                  title={t.recalculateAnalysis}
                >
                  <RefreshCw size={12} className={isCalculating ? 'spin-icon' : ''} />
                  <span>{isCalculating ? t.recalculating : t.recalculateAnalysis}</span>
                </button>
              </div>

              {editorMode === 'text' ? (
                <>

                  {/* Symbol palette: arrow, alternative separator, ε, ... without a keyboard */}
                  <div className="symbol-palette" role="toolbar" aria-label={t.symbolPaletteLabel}>
                    {EDITOR_SYMBOLS.map(sym => (
                      <button
                        key={sym.label}
                        type="button"
                        className="symbol-key"
                        title={lang === 'cz' ? sym.titleCz : sym.titleEn}
                        aria-label={lang === 'cz' ? sym.titleCz : sym.titleEn}
                        // keep the caret in the editor (mouse and touch)
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertSymbol(sym)}
                      >
                        {sym.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : canAnalyse && parseResult.grammar ? (
                <p className="hint-text" style={{ marginTop: '6px' }}>{t.clickModeHint}</p>
              ) : null}

              {/* Sharing and export of the grammar */}
              <div className="editor-export">
                <button
                  className="btn btn-secondary"
                  onClick={copyLink}
                  disabled={grammarText.trim() === ''}
                  title={t.copyLinkTitle}
                  aria-live="polite"
                >
                  {linkFeedback ? <Check size={12} /> : <Link2 size={12} />}
                  <span>{linkFeedback ?? t.copyLink}</span>
                </button>
                {analyzedGrammar && (
                  <LatexExportButton
                    getLatex={() => exportGrammarToLatex(analyzedGrammar)}
                    filename="grammar.tex"
                    lang={lang}
                    title={lang === 'cz' ? 'Zkopírovat gramatiku jako LaTeX' : 'Copy grammar as LaTeX'}
                  />
                )}
              </div>

              {notice && <div className="notice-inline" role="status">{notice}</div>}

              {/* Explanation of the transformation that produced the current grammar */}
              {currentEntry.kind === 'transform' && currentEntry.steps && currentEntry.steps.length > 0 && (() => {
                const step = currentEntry.steps[currentEntry.steps.length - 1];
                return (
                  <div className="last-step-box">
                    <div className="last-step-head">
                      <span><strong>{t.lastStepTitle}:</strong> {lang === 'cz' ? currentEntry.titleCz : currentEntry.titleEn}</span>
                      <button type="button" className="link-button" onClick={() => setActiveTab('transformations')}>{t.showProtocol}</button>
                    </div>
                    <p>{lang === 'cz' ? step.descriptionCz || step.description : step.description}</p>
                    {(step.mathExplanation || step.mathExplanationCz) && (
                      <div className="last-step-math">{lang === 'cz' ? step.mathExplanationCz || step.mathExplanation : step.mathExplanation}</div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* A standalone e: the empty word (KIV/FJP) or a terminal? */}
            {parseResult.bareE && (eChoice === null ? (
              <div className="notice-box question" role="group" aria-labelledby="e-question-title">
                <div className="notice-title">
                  <HelpCircle size={15} />
                  <span id="e-question-title">{t.eQuestionTitle}</span>
                </div>
                <p>{t.eQuestionText}</p>
                <div className="notice-actions">
                  <button className="btn btn-primary" onClick={() => chooseE('epsilon')}>{t.eAsEpsilon}</button>
                  <button className="btn btn-secondary" onClick={() => chooseE('terminal')}>{t.eAsTerminal}</button>
                </div>
              </div>
            ) : (
              <div className="e-choice-line">
                <span>{eChoice === 'epsilon' ? t.eReadAsEpsilon : t.eReadAsTerminal}</span>
                <button className="link-button" onClick={() => chooseE(eChoice === 'epsilon' ? 'terminal' : 'epsilon')}>
                  {t.eChange}
                </button>
              </div>
            ))}

            {/* Detected input format and notes on how it was read */}
            {parseResult.info.length > 0 && (
              <div className="notice-box info">
                <div className="notice-title">
                  <Info size={15} />
                  <span>{t.formatTitle}: {t.formatNames[parseResult.dialect]}</span>
                </div>
                <ul>
                  {parseResult.info.map((n, idx) => (
                    <li key={idx}>{msg(n)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Parse Errors (block the analysis) */}
            {parseResult.errors.length > 0 && (
              <div className="notice-box error" role="alert">
                <div className="notice-title">
                  <AlertCircle size={15} />
                  <span>{t.syntaxErrorTitle}</span>
                </div>
                <ul>
                  {parseResult.errors.map((err, idx) => (
                    <li key={idx}>{lang === 'cz' ? 'Řádek' : 'Line'} {err.line}: {msg(err)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings (analysis still runs) */}
            {parseResult.warnings.length > 0 && (
              <div className="notice-box warning">
                <div className="notice-title">
                  <AlertTriangle size={15} />
                  <span>{t.warningsTitle}</span>
                </div>
                <ul>
                  {parseResult.warnings.map((w, idx) => (
                    <li key={idx}>{lang === 'cz' ? 'Řádek' : 'Line'} {w.line}: {msg(w)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick Syntax Hint */}
            <div className="syntax-hint">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '2px' }}>
                <Info size={13} />
                <span>{t.syntaxHintTitle}</span>
              </div>
              <div>{t.syntaxRules}</div>
              <div>{t.syntaxNonTerminals}</div>
              <div>{t.syntaxTerminals}</div>
              <div>{t.syntaxEps}</div>
              <div>{t.syntaxAlts}</div>
              <div>{t.syntaxComments}</div>
              <div>{t.syntaxCompact}</div>
              <div>{t.syntaxNumbers}</div>
              <div>{t.syntaxFormats}</div>
              <div>{t.syntaxLink}</div>
            </div>
          </div>
        </aside>

        {/* Right Pane: Analysis Dashboard & Simulator */}
        <main className="right-pane">
          {/* Navigation Tabs */}
          <nav className="tabs-header" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Active Tab View */}
          <div className="tab-content">
            {/* Outdated / Invalid Banner when grammar changed or calculation is in progress */}
            {(isStale || isCalculating) && analysisData && (
              <div className="outdated-banner">
                <div className="outdated-banner-text">
                  <AlertTriangle size={18} />
                  <div>
                    <div>{canAnalyse || isCalculating ? t.outdatedResultsBanner : t.outdatedInvalidBanner}</div>
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
                  disabled={isCalculating || !canAnalyse}
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
                    lrLayout={lrLayout}
                    onNavigateToTab={(tab, variant) => {
                      if (variant) setLrVariant(variant);
                      setActiveTab(tab);
                    }}
                  />
                )}

                {activeTab === 'firstFollow' && (
                  <FirstFollowView grammar={analyzedGrammar} analysis={analysisData.analysis} lang={lang} />
                )}

                {activeTab === 'transformations' && (
                  <TransformationsView
                    grammar={analyzedGrammar}
                    entries={history.entries}
                    index={history.index}
                    onApplyWhole={applyWholeGrammar}
                    onGoTo={goToHistory}
                    onOpenClickMode={() => setEditorMode('click')}
                    onShowInfo={setInfoKey}
                    lang={lang}
                  />
                )}

                {activeTab === 'll' && (
                  <LLView
                    grammar={analyzedGrammar}
                    llTable={analysisData.llTable}
                    analysis={analysisData.analysis}
                    defaultInput={sampleInput}
                    lang={lang}
                    onAttemptLL1={() => applyWholeGrammar('ll1')}
                    onShowInfo={setInfoKey}
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
                    layout={lrLayout}
                    onLayoutChange={setLrLayout}
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
                    selectedVariant={lrVariant}
                    onSelectVariant={setLrVariant}
                    layout={lrLayout}
                    onLayoutChange={setLrLayout}
                  />
                )}

                {activeTab === 'words' && <WordGeneratorView grammar={analyzedGrammar} lang={lang} />}

                {activeTab === 'latex' && (
                  <LatexExportView
                    grammar={analyzedGrammar}
                    analysis={analysisData.analysis}
                    llTable={analysisData.llTable}
                    lrTables={{
                      'LR(0)': analysisData.lr0Table,
                      'SLR(1)': analysisData.slr1Table,
                      'LALR(1)': analysisData.lalr1Table,
                      'LR(1)': analysisData.lr1Table
                    }}
                    lang={lang}
                    lrLayout={lrLayout}
                    onLrLayoutChange={setLrLayout}
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
