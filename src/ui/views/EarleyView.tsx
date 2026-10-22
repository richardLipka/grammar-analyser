/**
 * EarleyView: Interactive Earley (1970) & ETTP (Scott & Johnstone 2025) Parsing Simulator View
 *
 * Demonstrates:
 * 1. Classic Earley (1970) chart parsing with Predictor, Scanner, and Completer operations.
 * 2. Earley Table Traversing Parsers (ETTP 2025) precomputed table traversal eliminating runtime prediction.
 * 3. Step-by-step simulator with synchronized derivation tree construction.
 * 4. Side-by-side comparative diagnostics and performance metrics.
 * 5. Full primary literature citations and educational theory guide.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import {
  simulateEarleyParse,
  EarleySimulationResult,
  EarleyStep,
  EarleyOperation,
  formatEarleyItem,
  formatLeoItem,
  subscript
} from '../../core/earley/earleyParser';
import {
  buildETTPTable,
  simulateETTPParse,
  ETTPSimulationResult,
  ETTPStep,
  ETTPTable,
  formatETTPItem
} from '../../core/earley/ettpParser';
import {
  checkEarleyCompatibility,
  checkETTPCompatibility
} from '../../core/earley/earleyCompatibility';
import {
  EARLEY_PRIMARY_REFERENCES,
  EARLEY_THEORY_GUIDE
} from '../../core/earley/earleyExplain';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { ETTPGraphVisualizer } from '../visualizer/ETTPGraphVisualizer';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Layers, CheckCircle2, AlertTriangle, Eye, Sparkles,
  GitBranch, ArrowRight, ExternalLink, HelpCircle,
  BookOpen, ChevronDown, ChevronRight, List, TableProperties,
  Cpu, Zap, Info, Network
} from 'lucide-react';

interface EarleyViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  defaultInput?: string;
  lang: Language;
  initialMode?: 'classic' | 'ettp';
}

export const EarleyView: React.FC<EarleyViewProps> = ({
  grammar,
  analysis,
  defaultInput = '',
  lang,
  initialMode = 'classic'
}) => {
  const t = TRANSLATIONS[lang];
  const cz = lang === 'cz';

  const [parserMode, setParserMode] = useState<'classic' | 'ettp'>(initialMode);
  /** Leo's (1991) transitive items in the classic completer. */
  const [useLeo, setUseLeo] = useState(false);
  const [ettpSubView, setEttpSubView] = useState<'chart' | 'graph'>('chart');
  const [selectedGraphStateId, setSelectedGraphStateId] = useState<number | null>(null);
  const [selectedTreeIdx, setSelectedTreeIdx] = useState<number>(0);
  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Compatibility assessment
  const earleyComp = useMemo(() => checkEarleyCompatibility(grammar, analysis), [grammar, analysis]);
  const ettpComp = useMemo(() => checkETTPCompatibility(grammar, analysis), [grammar, analysis]);

  // Precomputed ETTP table
  const ettpTable: ETTPTable = useMemo(() => buildETTPTable(grammar), [grammar]);

  // Tokenize input
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);

  // Run Earley simulation, without and with Leo's transitive items (the panel compares the counts)
  const earleyPlainSim: EarleySimulationResult = useMemo(
    () => simulateEarleyParse(tokenized.tokens, grammar),
    [tokenized, grammar]
  );
  const earleyLeoSim: EarleySimulationResult = useMemo(
    () => simulateEarleyParse(tokenized.tokens, grammar, { leo: true }),
    [tokenized, grammar]
  );
  const earleySim = useLeo ? earleyLeoSim : earleyPlainSim;

  // Run ETTP simulation
  const ettpSim: ETTPSimulationResult = useMemo(
    () => simulateETTPParse(tokenized.tokens, grammar, ettpTable),
    [tokenized, grammar, ettpTable]
  );

  // Playback control state
  const totalSteps = parserMode === 'classic' ? earleySim.totalSteps : ettpSim.totalSteps;
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const [showTheoryGuide, setShowTheoryGuide] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedTableStateId, setSelectedTableStateId] = useState<number>(0);

  // Reset step index when input or mode changes
  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
    setSelectedTreeIdx(0);
  }, [inputText, parserMode, grammar, useLeo]);

  // Autoplay hook
  useAutoPlay(isPlaying, currentStepIdx, totalSteps, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  const activeEarleyStep: EarleyStep | undefined = earleySim.steps[currentStepIdx];
  const activeETTPStep: ETTPStep | undefined = ettpSim.steps[currentStepIdx];

  const [treeDisplayMode, setTreeDisplayMode] = useState<'full' | 'step'>('full');
  const isLastStep = currentStepIdx === totalSteps - 1;
  const activeSim = parserMode === 'classic' ? earleySim : ettpSim;
  const activeStep = parserMode === 'classic' ? activeEarleyStep : activeETTPStep;

  /** Role of each item that caused the current step, keyed `${set}:${index}`. */
  const sourceRoles = useMemo(() => {
    const m = new Map<string, string>();
    for (const src of activeStep?.sources ?? []) m.set(`${src.role === 'transitive' ? 'L' : ''}${src.setIndex}:${src.itemIndex}`, src.role);
    return m;
  }, [activeStep]);
  const roleLabel = (role: string) =>
    ({
      parent: cz ? 'zdroj predikce' : 'predicted from',
      scanned: cz ? 'čte se terminál' : 'scanned item',
      completed: cz ? 'dokončená' : 'completed',
      waiting: cz ? 'čekala na neterminál' : 'waited for it',
      transitive: cz ? 'použitá tranzitivní' : 'transitive item used'
    }[role] ?? role);
  const roleColor = (role: string) => (role === 'completed' || role === 'scanned' ? 'var(--color-success)' : 'var(--color-warning)');

  // Why the word is (not) accepted, shown with the last step.
  const resultExplanation = useMemo(() => {
    const n = tokenized.tokens.length;
    const accept = `[${earleySim.augmentedStart} → ${grammar.startSymbol} •, 0]`;
    if (activeSim.truncated) return undefined;
    if (activeSim.accepted) {
      return parserMode === 'classic'
        ? (cz ? `S${subscript(n)} obsahuje ${accept}: z ${grammar.startSymbol} lze odvodit celé slovo, slovo patří do L(G).` : `S${subscript(n)} contains ${accept}: ${grammar.startSymbol} derives the whole word, the word is in L(G).`)
        : (cz ? `S${subscript(n)} obsahuje pár (q, 0), jehož stav má položku ${earleySim.augmentedStart} → ${grammar.startSymbol} •: slovo patří do L(G).` : `S${subscript(n)} contains a pair (q, 0) whose state has ${earleySim.augmentedStart} → ${grammar.startSymbol} •: the word is in L(G).`);
    }
    const emptyAt = activeSim.sets.findIndex(set => set.items.length === 0);
    if (emptyAt > 0) {
      return cz
        ? `Žádná položka v S${subscript(emptyAt - 1)} nemá za tečkou terminál w${subscript(emptyAt)} = '${tokenized.tokens[emptyAt - 1]}', proto je S${subscript(emptyAt)} prázdná a další množiny také. Slovo nepatří do L(G); jeho předpona ${tokenized.tokens.slice(0, emptyAt - 1).join(' ') || 'ε'} je nejdelší, kterou lze ještě doplnit na slovo jazyka.`
        : `No item of S${subscript(emptyAt - 1)} has the terminal w${subscript(emptyAt)} = '${tokenized.tokens[emptyAt - 1]}' after its dot, so S${subscript(emptyAt)} and all later sets are empty. The word is not in L(G); its prefix ${tokenized.tokens.slice(0, emptyAt - 1).join(' ') || 'ε'} is the longest one that can still be extended to a word of the language.`;
    }
    return cz
      ? `Všechny symboly byly přečteny, ale S${subscript(n)} neobsahuje ${parserMode === 'classic' ? accept : `pár (q, 0) se stavem obsahujícím ${earleySim.augmentedStart} → ${grammar.startSymbol} •`}: celé slovo je jen předponou slov jazyka, do L(G) nepatří.`
      : `All symbols were read, but S${subscript(n)} has no ${parserMode === 'classic' ? accept : `pair (q, 0) whose state has ${earleySim.augmentedStart} → ${grammar.startSymbol} •`}: the word is only a prefix of words of the language, it is not in L(G).`;
  }, [activeSim, parserMode, cz, tokenized, grammar, earleySim.augmentedStart]);

  // Keep the active set and the new item in view while stepping.
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chartRef.current?.querySelector('[data-latest="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentStepIdx, parserMode, ettpSubView]);

  // The graph shows the transition (or ε-link) the current ETTP step used.
  const graphActive = useMemo(() => {
    if (parserMode !== 'ettp' || !activeETTPStep) return { stateId: undefined, fromStateId: undefined, symbol: undefined };
    if (activeETTPStep.operation === 'predict') {
      const parent = activeETTPStep.sources[0];
      const parentState = parent ? ettpSim.sets[parent.setIndex].items[parent.itemIndex]?.stateId : undefined;
      return { stateId: activeETTPStep.stateId, fromStateId: parentState, symbol: undefined };
    }
    return { stateId: activeETTPStep.stateId, fromStateId: activeETTPStep.fromStateId, symbol: activeETTPStep.triggerSymbol };
  }, [parserMode, activeETTPStep, ettpSim]);

  // Derivation tree computation:
  // - Full completed tree for the parsed input word (leaves match tokens exactly)
  // - Active step subtree tracking local reductions/scans
  const fullDerivationTree = useMemo(() => {
    if (activeSim.accepted && activeSim.trees.length > 0) {
      return activeSim.trees[selectedTreeIdx] ?? activeSim.trees[0];
    }
    return undefined;
  }, [activeSim.accepted, activeSim.trees, selectedTreeIdx]);

  const stepSubtree = useMemo(() => {
    if (activeStep?.derivationTree) return activeStep.derivationTree;
    for (let idx = currentStepIdx - 1; idx >= 0; idx--) {
      const step = activeSim.steps[idx];
      if (step?.derivationTree) return step.derivationTree;
    }
    return undefined;
  }, [activeStep, activeSim.steps, currentStepIdx]);

  const currentDerivationTree = treeDisplayMode === 'full' && fullDerivationTree ? fullDerivationTree : (stepSubtree ?? fullDerivationTree);

  const highlightedNodeIds = useMemo(() => {
    if (treeDisplayMode === 'full' && activeStep?.derivationTree?.id) {
      return [activeStep.derivationTree.id];
    }
    return undefined;
  }, [treeDisplayMode, activeStep]);

  const theory = cz ? EARLEY_THEORY_GUIDE.cz : EARLEY_THEORY_GUIDE.en;

  const operationName = (op: EarleyOperation) =>
    ({ init: cz ? 'inicializace' : 'init', predict: cz ? 'prediktor' : 'predictor', scan: cz ? 'skener' : 'scanner', complete: cz ? 'kompletor' : 'completer', leo: cz ? 'kompletor (Leo)' : 'completer (Leo)', transitive: cz ? 'tranzitivní (Leo)' : 'transitive (Leo)' }[op]);

  const operationBadge = (op: EarleyOperation) => {
    switch (op) {
      case 'init':
        return <span className="badge badge-info">{cz ? 'Inicializace' : 'Init'}</span>;
      case 'predict':
        return <span className="badge" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>{cz ? 'Prediktor' : 'Predict'}</span>;
      case 'scan':
        return <span className="badge badge-success">{cz ? 'Skener' : 'Scan'}</span>;
      case 'complete':
        return <span className="badge badge-warning">{cz ? 'Kompletor' : 'Complete'}</span>;
      case 'leo':
        return <span className="badge badge-warning">{cz ? 'Kompletor (Leo)' : 'Complete (Leo)'}</span>;
      case 'transitive':
        return <span className="badge" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)', border: '1px dashed var(--color-primary)' }}>{cz ? 'Leo: tranzitivní položka' : 'Leo: transitive item'}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Primary Reference Citation Bar */}
      <ReferenceBar
        references={EARLEY_PRIMARY_REFERENCES}
        lang={lang}
        extraRight={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
            onClick={() => setShowTheoryGuide(!showTheoryGuide)}
          >
            <BookOpen size={12} style={{ marginRight: '4px' }} />
            {cz ? (showTheoryGuide ? 'Skrýt teorii Earley & ETTP' : 'Jak funguje Earley & ETTP (teorie)') : (showTheoryGuide ? 'Hide Theory Guide' : 'How Earley & ETTP Work (Theory Guide)')}
            {showTheoryGuide ? <ChevronDown size={12} style={{ marginLeft: '4px' }} /> : <ChevronRight size={12} style={{ marginLeft: '4px' }} />}
          </button>
        }
      />

      {/* Expandable Theory & Literature Guide */}
      {showTheoryGuide && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="var(--color-primary)" />
              <span>{theory.title}</span>
            </div>
            <button className="link-button" onClick={() => setShowTheoryGuide(false)}>
              {cz ? 'Skrýt teorii' : 'Hide theory'}
            </button>
          </div>
          <p style={{ fontSize: '13px', margin: '8px 0 16px', lineHeight: '1.5' }}>{theory.overview}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {theory.sections.map((sec, idx) => (
              <div key={idx} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--color-primary)' }}>{sec.heading}</h4>
                <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.45', color: 'var(--color-text-secondary)' }}>
                  {sec.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Controls: Parser Mode Switcher & Input Bar */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px' }}>
                {cz ? 'Simulátor syntaktické analýzy Earley / ETTP' : 'Earley / ETTP Parsing Simulator'}
              </span>
              <span className={`badge ${earleyComp.canParse ? 'badge-success' : 'badge-danger'}`}>
                {earleyComp.canParse ? (cz ? 'Obecná CFG O(n³)' : 'General CFG O(n³)') : (cz ? 'Nekompatibilní' : 'Incompatible')}
              </span>
            </div>
            <p className="hint-text" style={{ margin: '4px 0 0' }}>
              {cz
                ? 'Porovnání klasického dynamického algoritmu (Earley 1970) s tabulkovým průchodem bez prediktoru (ETTP 2025).'
                : 'Comparison of classic dynamic chart parsing (Earley 1970) with precomputed table traversal without predictor (ETTP 2025).'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-bg-base)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              className={`btn ${parserMode === 'classic' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={() => setParserMode('classic')}
            >
              <Cpu size={14} />
              <span>{cz ? 'Klasický Earley (1970)' : 'Classic Earley (1970)'}</span>
            </button>
            <button
              type="button"
              className={`btn ${parserMode === 'ettp' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={() => setParserMode('ettp')}
            >
              <Zap size={14} />
              <span>{cz ? 'ETTP (Scott & Johnstone 2025)' : 'ETTP (Scott & Johnstone 2025)'}</span>
            </button>
          </div>
        </div>

        {/* Input Text Field */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              className="text-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={cz ? 'Zadejte slovo k analýze (oddělené mezerami)...' : 'Enter word to parse (space-separated)...'}
              style={{ width: '100%', fontSize: '13px', padding: '6px 10px' }}
            />
          </div>
          {parserMode === 'ettp' && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setShowTableModal(prev => !prev)}
            >
              <TableProperties size={14} />
              <span>{cz ? `Zobrazit přechodovou tabulku (${ettpTable.states.length} stavů)` : `Inspect Transition Table (${ettpTable.states.length} states)`}</span>
            </button>
          )}
        </div>

        {parserMode === 'classic' && (
          <label
            style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px', fontSize: '12px', cursor: 'pointer', lineHeight: 1.4 }}
            title={cz
              ? 'Leo (1991): je-li [A → α • B, j] jediná položka v Sₖ s B za tečkou a B je její poslední symbol, uloží se do Sₖ tranzitivní položka s nejvyšší položkou deterministické redukční cesty a kompletor přidá jen tu.'
              : 'Leo (1991): if [A → α • B, j] is the only item of Sₖ with B after the dot and B is its last symbol, Sₖ stores a transitive item holding the topmost item of the deterministic reduction path, and the completer adds only that one.'}
          >
            <input type="checkbox" checked={useLeo} onChange={e => setUseLeo(e.target.checked)} style={{ marginTop: '2px' }} />
            <span>
              <strong>{cz ? 'Leovy tranzitivní položky (Leo 1991)' : "Leo's transitive items (Leo 1991)"}</strong>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {cz
                  ? ` — pravá rekurze (např. S → a S | ε na aⁿ) pak stojí lineárně mnoho položek místo kvadraticky. Položek bez Lea: ${earleyPlainSim.stats.totalItems}, s Leem: ${earleyLeoSim.stats.totalItems} + ${earleyLeoSim.stats.leoItems} tranzitivních.`
                  : ` — right recursion (e.g. S → a S | ε on aⁿ) then costs a linear number of items instead of a quadratic one. Items without Leo: ${earleyPlainSim.stats.totalItems}, with Leo: ${earleyLeoSim.stats.totalItems} + ${earleyLeoSim.stats.leoItems} transitive.`}
              </span>
            </span>
          </label>
        )}

        <TokenizedInputNote tokenized={tokenized} lang={lang} />
      </div>

      {/* Playback controls and the step explanation stay in view while the chart is scrolled */}
      <div className="sim-sticky">
      {/* Simulator Playback Controls */}
      <SimulatorControls label={parserMode === 'classic' ? 'Earley' : 'ETTP'}
        stepIdx={currentStepIdx}
        total={totalSteps}
        isPlaying={isPlaying}
        speed={playSpeed}
        lang={lang}
        onStep={setCurrentStepIdx}
        onTogglePlay={() => setIsPlaying(prev => !prev)}
        onSpeed={setPlaySpeed}
      />

      {/* Active Step Description Card */}
      <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {cz ? `Krok ${currentStepIdx + 1} z ${totalSteps}` : `Step ${currentStepIdx + 1} of ${totalSteps}`}:
            </span>
            {parserMode === 'classic' && activeEarleyStep && operationBadge(activeEarleyStep.operation)}
            {parserMode === 'ettp' && activeETTPStep && operationBadge(activeETTPStep.operation)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {parserMode === 'classic'
                ? (cz ? `Položek celkem: ${activeEarleyStep?.totalItemsSoFar ?? 0}` : `Total items: ${activeEarleyStep?.totalItemsSoFar ?? 0}`)
                : (cz ? `Stavových párů (q, j): ${activeETTPStep?.totalItemsSoFar ?? 0}` : `State pairs (q, j): ${activeETTPStep?.totalItemsSoFar ?? 0}`)}
            </span>
            {(parserMode === 'classic' ? earleySim.accepted : ettpSim.accepted) && currentStepIdx === totalSteps - 1 ? (
              <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} />
                <span>{cz ? 'Slovo PŘIJATO' : 'Word ACCEPTED'}</span>
              </span>
            ) : currentStepIdx === totalSteps - 1 ? (
              <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={12} />
                <span>{cz ? 'Slovo ZAMÍTNUTO' : 'Word REJECTED'}</span>
              </span>
            ) : null}
          </div>
        </div>

        <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: '1.45', fontWeight: 500, minHeight: '3.9em' }}>
          {parserMode === 'classic'
            ? (cz ? activeEarleyStep?.descriptionCz : activeEarleyStep?.descriptionEn)
            : (cz ? activeETTPStep?.descriptionCz : activeETTPStep?.descriptionEn)}
        </p>
        {isLastStep && resultExplanation && (
          <p style={{ margin: '6px 0 0', fontSize: '12.5px', lineHeight: '1.45', color: activeSim.accepted ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {resultExplanation}
          </p>
        )}
        {(activeStep?.sources.length ?? 0) > 0 && (
          <div style={{ marginTop: '6px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '2px solid var(--color-primary)', marginRight: 4, verticalAlign: 'middle' }} />{cz ? 'nová položka' : 'new item'}</span>
            {[...new Set(activeStep!.sources.map(src => src.role))].map(role => (
              <span key={role}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: `2px dashed ${roleColor(role)}`, marginRight: 4, verticalAlign: 'middle' }} />{roleLabel(role)}</span>
            ))}
          </div>
        )}

        {(parserMode === 'classic' ? earleySim.truncated : ettpSim.truncated) && (
          <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} />
            <span>{cz ? (parserMode === 'classic' ? earleySim.errorMessageCz : ettpSim.errorMessageCz) : (parserMode === 'classic' ? earleySim.errorMessage : ettpSim.errorMessage)}</span>
          </div>
        )}
      </div>

      </div>

      {/* Main Analysis Pane: State Chart / Graph & Derivation Tree */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn btn-sm ${ettpSubView === 'chart' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11.5px', padding: '4px 10px' }}
          onClick={() => setEttpSubView('chart')}
        >
          <Layers size={13} style={{ marginRight: '4px' }} />
          <span>{cz ? 'Tabulka stavových množin (Chart S₀ … Sₙ)' : 'State Sets Chart (S₀ … Sₙ)'}</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${ettpSubView === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11.5px', padding: '4px 10px' }}
          onClick={() => setEttpSubView('graph')}
        >
          <Network size={13} style={{ marginRight: '4px' }} />
          <span>
            {cz
              ? `Graf přechodového automatu Earley / ETTP (${ettpTable.states.length} stavů)`
              : `Earley / ETTP Automaton Graph (${ettpTable.states.length} states)`}
          </span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(300px, 1fr)', gap: '16px' }}>
        {/* Left: State Sets Chart OR ETTP Automaton Graph */}
        {ettpSubView === 'graph' ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Network size={16} color="var(--color-primary)" />
                <span>
                  {cz
                    ? `Graf přechodového automatu Earley / ETTP (${ettpTable.states.length} stavů)`
                    : `Earley / ETTP Transition Automaton Graph (${ettpTable.states.length} states)`}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {cz ? 'Jádrové a predikční stavy, ε-odkazy a důvody přechodů' : 'Kernel and predicted states, ε-links and transition reasons'}
              </span>
            </div>
            {parserMode === 'classic' && (
              <div
                style={{
                  padding: '6px 10px',
                  marginBottom: '10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border)',
                  fontSize: '11px',
                  color: 'var(--color-text-secondary)',
                  lineHeight: '1.4'
                }}
              >
                <Info size={13} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'text-bottom' }} />
                {cz
                  ? 'Klasický Earleyův algoritmus (1970) vytváří položky za běhu. Aycock & Horspool (2002) a Scott & Johnstone (2025) ukázali, že položky se stejným počátkem lze seskupit do stavů automatu předpočítaného z gramatiky. Graf ukazuje tento automat; krok klasického algoritmu v něm zvýrazněn není (přepněte na ETTP).'
                  : 'Classic Earley (1970) creates its items at runtime. Aycock & Horspool (2002) and Scott & Johnstone (2025) showed that items with the same origin can be grouped into states of an automaton precomputed from the grammar. The graph shows this automaton; the classic algorithm\'s step is not highlighted in it (switch to ETTP).'}
              </div>
            )}
            <ETTPGraphVisualizer
              table={ettpTable}
              selectedStateId={selectedGraphStateId}
              onSelectState={setSelectedGraphStateId}
              activeStateId={graphActive.stateId}
              activeFromStateId={graphActive.fromStateId}
              activeSymbol={graphActive.symbol}
              lang={lang}
              height="500px"
            />
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="var(--color-primary)" />
                <span>
                  {parserMode === 'classic'
                    ? (cz ? 'Tabulka stavových množin Earley (Chart S₀ … Sₙ)' : 'Earley Item Sets Chart (S₀ … Sₙ)')
                    : (cz ? 'Tabulkové stavové množiny ETTP (S₀ … Sₙ)' : 'ETTP State Sets (S₀ … Sₙ)')}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {cz ? `${tokenized.tokens.length + 1} množin` : `${tokenized.tokens.length + 1} sets`}
              </span>
            </div>

            <div
              ref={chartRef}
              style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                paddingBottom: '10px',
                minHeight: '260px'
              }}
            >
              {Array.from({ length: tokenized.tokens.length + 1 }, (_, setIdx) => {
                const tokenMatched = setIdx > 0 ? tokenized.tokens[setIdx - 1] : undefined;
                const isCurrentActiveSet = (parserMode === 'classic' ? activeEarleyStep?.activeSetIndex : activeETTPStep?.activeSetIndex) === setIdx;

                const shown = activeStep?.setSizes[setIdx] ?? 0;
                const snapshotItems = parserMode === 'classic'
                  ? earleySim.sets[setIdx].items.slice(0, shown)
                  : ettpSim.sets[setIdx].items.slice(0, shown);

                return (
                  <div
                    key={setIdx}
                    style={{
                      minWidth: '220px',
                      maxWidth: '280px',
                      flex: '0 0 auto',
                      borderRadius: 'var(--radius-md)',
                      border: isCurrentActiveSet ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: isCurrentActiveSet ? 'var(--color-bg-surface)' : 'var(--color-bg-base)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '6px 10px',
                        backgroundColor: isCurrentActiveSet ? 'var(--color-primary-subtle)' : 'var(--color-bg-card)',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '12px' }}>
                        S<sub>{setIdx}</sub> {tokenMatched ? (cz ? `(po přečtení w${subscript(setIdx)} = '${tokenMatched}')` : `(after w${subscript(setIdx)} = '${tokenMatched}')`) : (cz ? '(začátek)' : '(start)')}
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)' }}>
                        {snapshotItems.length} {parserMode === 'classic' ? (cz ? 'pol.' : 'items') : (cz ? 'párů' : 'pairs')}
                      </span>
                    </div>

                    <div style={{ padding: '8px', overflowY: 'auto', maxHeight: '380px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {snapshotItems.length === 0 ? (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '4px' }}>
                          {cz ? 'Zatím prázdná množina' : 'Set empty so far'}
                        </span>
                      ) : parserMode === 'classic' ? (
                        <>
                        {(snapshotItems as typeof activeEarleyStep.item[]).map((it, itIdx) => {
                          const isLatest = activeEarleyStep?.activeSetIndex === setIdx && itIdx === activeEarleyStep.itemIndex;
                          const role = sourceRoles.get(`${setIdx}:${itIdx}`);
                          const tooltipText = `${formatEarleyItem(it)}\nOperation: ${it.operation}${it.triggerSymbol ? `\nTrigger: ${it.triggerSymbol}` : ''}${it.completedItemOrigin !== undefined ? `\nOrigin: ${it.completedItemOrigin}` : ''}`;
                          return (
                            <div
                              key={itIdx}
                              title={tooltipText}
                              data-latest={isLatest ? 'true' : undefined}
                              style={{
                                padding: '5px 8px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: isLatest ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
                                border: isLatest ? '2px solid var(--color-primary)' : role ? `2px dashed ${roleColor(role)}` : '1px solid var(--color-border)',
                                fontSize: '11px',
                                fontFamily: 'monospace'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600 }}>{formatEarleyItem(it)}</span>
                                <span style={{ fontSize: '9.5px', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                  {role ? roleLabel(role) : operationName(it.operation)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {earleySim.sets[setIdx].leoItems.slice(0, activeEarleyStep?.leoSizes[setIdx] ?? 0).map((leo, leoIdx) => {
                          const isLatest = activeEarleyStep?.operation === 'transitive' && activeEarleyStep.activeSetIndex === setIdx && leoIdx === activeEarleyStep.itemIndex;
                          const role = sourceRoles.get(`L${setIdx}:${leoIdx}`);
                          return (
                            <div
                              key={`leo${leoIdx}`}
                              title={cz
                                ? `Tranzitivní položka (Leo) pro ${leo.symbol}: dokončí-li se ${leo.symbol} s počátkem ${setIdx}, kompletor přidá rovnou ${formatEarleyItem(leo)}. Zastupuje ${leo.depth} pol. deterministické redukční cesty.`
                                : `Transitive item (Leo) for ${leo.symbol}: when ${leo.symbol} is completed with origin ${setIdx}, the completer adds ${formatEarleyItem(leo)} directly. Stands for ${leo.depth} item(s) of the deterministic reduction path.`}
                              data-latest={isLatest ? 'true' : undefined}
                              style={{
                                padding: '5px 8px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: isLatest ? 'var(--color-primary-subtle)' : 'var(--color-bg-base)',
                                border: isLatest ? '2px solid var(--color-primary)' : role ? `2px dashed ${roleColor(role)}` : '1px dashed var(--color-primary)',
                                fontSize: '11px',
                                fontFamily: 'monospace'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatLeoItem(leo)}</span>
                                <span style={{ fontSize: '9.5px', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                  {role ? roleLabel(role) : (cz ? `Leo, ${leo.depth} pol.` : `Leo, ${leo.depth} items`)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        </>
                      ) : (
                        (snapshotItems as { stateId: number; origin: number }[]).map((it, itIdx) => {
                          const isLatest = activeETTPStep?.activeSetIndex === setIdx && itIdx === activeETTPStep.itemIndex;
                          const role = sourceRoles.get(`${setIdx}:${itIdx}`);
                          const stateObj = ettpTable.states[it.stateId];
                          const stateItemsTooltip = (cz ? `Stav q${it.stateId} (${stateObj.kind === 'kernel' ? 'jádro' : 'predikce'}), položky s počátkem ${it.origin}:\n` : `State q${it.stateId} (${stateObj.kind}), items with origin ${it.origin}:\n`) +
                            stateObj.items.map(sIt => {
                              const rhs = [...sIt.production.rhs];
                              rhs.splice(sIt.dot, 0, '•');
                              return `${sIt.production.lhs} → ${rhs.join(' ') || '•'}`;
                            }).join('\n') +
                            (cz ? `\n(Klepnutím zobrazíte stav q${it.stateId} v grafu automatu)` : `\n(Click to inspect state q${it.stateId} in the automaton graph)`);

                          return (
                            <div
                              key={itIdx}
                              title={stateItemsTooltip}
                              data-latest={isLatest ? 'true' : undefined}
                              onClick={() => {
                                setSelectedGraphStateId(it.stateId);
                                setSelectedTableStateId(it.stateId);
                                setEttpSubView('graph');
                              }}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: isLatest ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
                                border: isLatest ? '2px solid var(--color-primary)' : role ? `2px dashed ${roleColor(role)}` : '1px solid var(--color-border)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                                  (q{it.stateId}, {it.origin})
                                </span>
                                <span style={{ fontSize: '9.5px', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                  {role ? roleLabel(role) : stateObj.kind === 'kernel' ? (cz ? 'jádro' : 'kernel') : (cz ? 'predikce' : 'predicted')}
                                </span>
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px', fontFamily: 'monospace', lineHeight: 1.35 }}>
                                {stateObj.items.slice(0, 6).map((sIt, k) => (
                                  <div key={k} style={{ color: sIt.dot === sIt.production.rhs.length ? 'var(--color-warning)' : undefined }}>
                                    {formatETTPItem(sIt)}
                                  </div>
                                ))}
                                {stateObj.items.length > 6 && <div>… +{stateObj.items.length - 6}</div>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right: Derivation Tree & Statistics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Synchronized Derivation Tree */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} color="var(--color-primary)" />
                <span>{cz ? 'Derivační strom' : 'Derivation Tree'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {fullDerivationTree && stepSubtree && (
                  <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${treeDisplayMode === 'full' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px', borderRadius: 0 }}
                      onClick={() => setTreeDisplayMode('full')}
                      title={cz ? 'Zobrazit úplný derivační strom vstupního slova' : 'Show full derivation tree of the input word'}
                    >
                      {cz ? 'Úplný strom' : 'Full Tree'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${treeDisplayMode === 'step' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '11px', padding: '2px 8px', height: '24px', borderRadius: 0 }}
                      onClick={() => setTreeDisplayMode('step')}
                      title={cz ? 'Zobrazit podstrom vytvářený v aktuálním kroku' : 'Show subtree formed at current step'}
                    >
                      {cz ? 'Krok' : 'Step'}
                    </button>
                  </div>
                )}
                {treeDisplayMode === 'full' && activeSim.accepted && activeSim.trees.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      disabled={selectedTreeIdx === 0}
                      onClick={() => setSelectedTreeIdx(p => Math.max(0, p - 1))}
                    >
                      ◀
                    </button>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>
                      {cz ? `Strom ${selectedTreeIdx + 1}/${activeSim.trees.length}` : `Tree ${selectedTreeIdx + 1}/${activeSim.trees.length}`}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                      disabled={selectedTreeIdx === activeSim.trees.length - 1}
                      onClick={() => setSelectedTreeIdx(p => Math.min(activeSim.trees.length - 1, p + 1))}
                    >
                      ▶
                    </button>
                  </div>
                )}
                {currentDerivationTree && (
                  <LatexExportButton
                    getLatex={() => exportParseTreeToTikz(currentDerivationTree)}
                    filename="earley_parse_tree.tex"
                    lang={lang}
                    title={cz ? 'Exportovat strom do LaTeXu (TikZ)' : 'Export tree as LaTeX (TikZ)'}
                  />
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentDerivationTree ? (
                <DerivationTreeVisualizer
                  rootNode={currentDerivationTree}
                  lang={lang}
                  highlightNodeIds={highlightedNodeIds}
                  // fitted into what is left of a 1080 px screen below the step panel, taller on taller screens
                  height="clamp(220px, calc(100vh - 800px), 380px)"
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px', padding: '24px' }}>
                  {currentStepIdx === totalSteps - 1 && !(parserMode === 'classic' ? earleySim.accepted : ettpSim.accepted)
                    ? (cz ? 'Slovo nepatří do jazyka gramatiky (žádný derivační strom neexistuje).' : 'Word is not in the grammar language (no valid derivation tree exists).')
                    : (cz ? 'Derivační strom se vytváří postupně během skenování a redukcí.' : 'Derivation tree will form progressively as tokens are scanned and reduced.')}
                </div>
              )}
            </div>
          </div>

          {/* Performance & Comparative Diagnostics Panel */}
          <div className="card" style={{ backgroundColor: 'var(--color-bg-base)' }}>
            <div className="card-title" style={{ fontSize: '13px' }}>
              <Sparkles size={15} color="var(--color-primary)" />
              <span>{cz ? 'Srovnávací metrika: Earley (1970) vs. ETTP (2025)' : 'Comparative Metrics: Earley vs ETTP'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                  {cz ? 'Klasický Earley (1970)' : 'Classic Earley (1970)'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>
                  {cz ? `Položek v množinách: ${earleySim.stats.totalItems}` : `Items in the sets: ${earleySim.stats.totalItems}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {cz ? `z toho predikcí za běhu: ${earleySim.stats.predictCount}` : `of them runtime predictions: ${earleySim.stats.predictCount}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }} data-testid="leo-counts">
                  {cz
                    ? `bez Lea ${earleyPlainSim.stats.totalItems} položek; s Leem ${earleyLeoSim.stats.totalItems} + ${earleyLeoSim.stats.leoItems} tranzitivních (vynecháno ${earleyLeoSim.stats.skippedItems})`
                    : `without Leo ${earleyPlainSim.stats.totalItems} items; with Leo ${earleyLeoSim.stats.totalItems} + ${earleyLeoSim.stats.leoItems} transitive (${earleyLeoSim.stats.skippedItems} skipped)`}
                </div>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-primary)' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '2px' }}>
                  {cz ? 'ETTP (Scott & Johnstone 2025)' : 'ETTP (2025)'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>
                  {cz ? `Párů (q, j): ${ettpSim.stats.totalRuntimePairs}` : `Pairs (q, j): ${ettpSim.stats.totalRuntimePairs}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {cz
                    ? `zastupují ${ettpSim.stats.representedItems} položek; ${ettpTable.states.length} stavů tabulky`
                    : `standing for ${ettpSim.stats.representedItems} items; ${ettpTable.states.length} table states`}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '8px 0 0', lineHeight: '1.4' }}>
              {cz
                ? 'ETTP za běhu nerozvíjí pravidla: predikce jsou předpočítané stavy tabulky a pár (q, j) zastupuje všechny položky stavu q s počátkem j. Obě metody mají stejné množiny položek a rozpoznávají libovolnou bezkontextovou gramatiku; v experimentech autorů (gramatiky Javy a ANSI C) byly struktury ETTP výrazně menší a analýza rychlejší.'
                : 'ETTP expands no rules at runtime: predictions are precomputed states of the table and a pair (q, j) stands for all items of state q with origin j. Both methods have the same item sets and recognise any context-free grammar; in the authors\' experiments (Java and ANSI C grammars) the ETTP structures were considerably smaller and parsing faster.'}
            </p>
          </div>
        </div>
      </div>

      {/* ETTP Transition Table Inspection Modal */}
      {showTableModal && parserMode === 'ettp' && (
        <div className="card" style={{ border: '2px solid var(--color-primary)', marginTop: '8px' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TableProperties size={18} color="var(--color-primary)" />
              <span>{cz ? `Předpočítaná přechodová tabulka ETTP (${ettpTable.states.length} stavů)` : `Precomputed ETTP Transition Table (${ettpTable.states.length} states)`}</span>
            </div>
            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => setShowTableModal(false)}>
              {cz ? 'Zavřít' : 'Close'}
            </button>
          </div>

          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table className="lr-table" style={{ width: '100%', fontSize: '11.5px' }}>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>{cz ? 'Stav' : 'State'}</th>
                  <th>{cz ? 'Položky stavu' : 'State items'}</th>
                  <th>{cz ? 'Přechody δ(q, X)' : 'Transitions δ(q, X)'}</th>
                  <th>{cz ? 'Dokončená pravidla' : 'Completions'}</th>
                  <th style={{ width: '80px' }}>{cz ? 'Přijímající' : 'Accepting'}</th>
                </tr>
              </thead>
              <tbody>
                {ettpTable.states.map(st => (
                  <tr key={st.id} style={{ backgroundColor: selectedTableStateId === st.id ? 'var(--color-primary-subtle)' : undefined }}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      q{st.id}
                      <div style={{ fontWeight: 400, fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                        {st.kind === 'kernel' ? (cz ? 'jádro' : 'kernel') : (cz ? 'predikce' : 'predicted')}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {st.items.map((it, idx) => {
                        const rhs = [...it.production.rhs];
                        rhs.splice(it.dot, 0, '•');
                        return <div key={idx}>{formatETTPItem(it)}</div>;
                      })}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {st.predictedStateId !== undefined && (
                        <span style={{ display: 'inline-block', marginRight: '8px', padding: '1px 4px', borderRadius: '3px', border: '1px dashed var(--color-border)' }}>
                          ε → <strong>q{st.predictedStateId}</strong>
                        </span>
                      )}
                      {[...st.transitions.entries()].map(([sym, tr], idx) => (
                        <span key={idx} style={{ display: 'inline-block', marginRight: '8px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--color-bg-base)' }}>
                          {sym} → <strong>q{tr.targetStateId}</strong>
                        </span>
                      ))}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {st.completions.map((comp, idx) => (
                        <div key={idx} style={{ color: 'var(--color-warning)' }}>
                          {comp.production.lhs} → {comp.production.rhs.join(' ') || 'ε'}
                        </div>
                      ))}
                    </td>
                    <td>
                      {st.isAcceptState && (
                        <span className="badge badge-success" style={{ fontSize: '10px' }}>
                          Accept
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
