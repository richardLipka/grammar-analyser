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
  formatEarleyItem
} from '../../core/earley/earleyParser';
import {
  buildETTPTable,
  simulateETTPParse,
  ETTPSimulationResult,
  ETTPStep,
  ETTPTable
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
import { LatexExportButton } from '../components/LatexExportButton';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Layers, CheckCircle2, AlertTriangle, Eye, Sparkles,
  GitBranch, ArrowRight, ExternalLink, HelpCircle,
  BookOpen, ChevronDown, ChevronRight, List, TableProperties,
  Cpu, Zap, Info
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
  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Compatibility assessment
  const earleyComp = useMemo(() => checkEarleyCompatibility(grammar, analysis), [grammar, analysis]);
  const ettpComp = useMemo(() => checkETTPCompatibility(grammar, analysis), [grammar, analysis]);

  // Precomputed ETTP table
  const ettpTable: ETTPTable = useMemo(() => buildETTPTable(grammar), [grammar]);

  // Tokenize input
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);

  // Run Earley simulation
  const earleySim: EarleySimulationResult = useMemo(
    () => simulateEarleyParse(tokenized.tokens, grammar),
    [tokenized, grammar]
  );

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
  }, [inputText, parserMode, grammar]);

  // Autoplay hook
  useAutoPlay(isPlaying, currentStepIdx, totalSteps, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  const activeEarleyStep: EarleyStep | undefined = earleySim.steps[currentStepIdx];
  const activeETTPStep: ETTPStep | undefined = ettpSim.steps[currentStepIdx];

  const currentDerivationTree = parserMode === 'classic'
    ? (activeEarleyStep?.derivationTree ?? (earleySim.accepted ? earleySim.trees[0] : undefined))
    : (activeETTPStep?.derivationTree ?? (ettpSim.accepted ? ettpSim.trees[0] : undefined));

  const theory = cz ? EARLEY_THEORY_GUIDE.cz : EARLEY_THEORY_GUIDE.en;

  const operationBadge = (op: 'init' | 'predict' | 'scan' | 'complete') => {
    switch (op) {
      case 'init':
        return <span className="badge badge-info">{cz ? 'Inicializace' : 'Init'}</span>;
      case 'predict':
        return <span className="badge" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>{cz ? 'Prediktor' : 'Predict'}</span>;
      case 'scan':
        return <span className="badge badge-success">{cz ? 'Skener' : 'Scan'}</span>;
      case 'complete':
        return <span className="badge badge-warning">{cz ? 'Kompletor' : 'Complete'}</span>;
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

        <TokenizedInputNote tokenized={tokenized} lang={lang} />
      </div>

      {/* Simulator Playback Controls */}
      <SimulatorControls
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

        <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: '1.45', fontWeight: 500 }}>
          {parserMode === 'classic'
            ? (cz ? activeEarleyStep?.descriptionCz : activeEarleyStep?.descriptionEn)
            : (cz ? activeETTPStep?.descriptionCz : activeETTPStep?.descriptionEn)}
        </p>

        {(parserMode === 'classic' ? earleySim.truncated : ettpSim.truncated) && (
          <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} />
            <span>{cz ? (parserMode === 'classic' ? earleySim.errorMessageCz : ettpSim.errorMessageCz) : (parserMode === 'classic' ? earleySim.errorMessage : ettpSim.errorMessage)}</span>
          </div>
        )}
      </div>

      {/* Main Analysis Pane: State Chart & Derivation Tree */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(300px, 1fr)', gap: '16px' }}>
        {/* Left: State Sets Chart (S_0, S_1, ..., S_n) */}
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

              const snapshotItems = parserMode === 'classic'
                ? (activeEarleyStep?.chartSnapshot[setIdx]?.items ?? [])
                : (activeETTPStep?.chartSnapshot[setIdx]?.items ?? []);

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
                      backgroundColor: isCurrentActiveSet ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '12px' }}>
                      S<sub>{setIdx}</sub> {tokenMatched ? `(token: '${tokenMatched}')` : '(start)'}
                    </span>
                    <span style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)' }}>
                      {snapshotItems.length} {cz ? 'pol.' : 'items'}
                    </span>
                  </div>

                  <div style={{ padding: '8px', overflowY: 'auto', maxHeight: '380px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {snapshotItems.length === 0 ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', padding: '4px' }}>
                        {cz ? 'Zatím prázdná množina' : 'Set empty so far'}
                      </span>
                    ) : parserMode === 'classic' ? (
                      (snapshotItems as typeof activeEarleyStep.item[]).map((it, itIdx) => {
                        const isLatest = activeEarleyStep?.activeSetIndex === setIdx && itIdx === snapshotItems.length - 1;
                        const tooltipText = `${formatEarleyItem(it)}\nOperation: ${it.operation}${it.triggerSymbol ? `\nTrigger: ${it.triggerSymbol}` : ''}${it.completedItemOrigin !== undefined ? `\nOrigin: ${it.completedItemOrigin}` : ''}`;
                        return (
                          <div
                            key={itIdx}
                            title={tooltipText}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isLatest ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
                              border: isLatest ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                              <span style={{ fontWeight: 600 }}>{formatEarleyItem(it)}</span>
                              <span style={{ fontSize: '9.5px', opacity: 0.8 }}>
                                {it.operation}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      (snapshotItems as { stateId: number; origin: number }[]).map((it, itIdx) => {
                        const isLatest = activeETTPStep?.activeSetIndex === setIdx && itIdx === snapshotItems.length - 1;
                        const stateObj = ettpTable.states[it.stateId];
                        const stateItemsTooltip = `State q${it.stateId} (Items in closure):\n` +
                          stateObj.items.map(sIt => {
                            const rhs = [...sIt.production.rhs];
                            rhs.splice(sIt.dot, 0, '•');
                            return `${sIt.production.lhs} → ${rhs.join(' ') || '•'}`;
                          }).join('\n') +
                          (stateObj.completions.length > 0 ? `\n\nCompletions: ${stateObj.completions.map(c => c.production.lhs).join(', ')}` : '') +
                          `\n(Click to inspect state q${it.stateId} in table)`;

                        return (
                          <div
                            key={itIdx}
                            title={stateItemsTooltip}
                            onClick={() => {
                              setSelectedTableStateId(it.stateId);
                              setShowTableModal(true);
                            }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isLatest ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)',
                              border: isLatest ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                                (q{it.stateId}, {it.origin})
                              </span>
                              {stateObj.isAcceptState && (
                                <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 4px' }}>
                                  accept
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                              {stateObj.completions.length > 0
                                ? `red: ${stateObj.completions.map(c => c.production.lhs).join(', ')}`
                                : `trans: ${[...stateObj.transitions.keys()].join(', ')}`}
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

        {/* Right: Derivation Tree & Statistics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Synchronized Derivation Tree */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} color="var(--color-primary)" />
                <span>{cz ? 'Derivační strom' : 'Derivation Tree'}</span>
              </div>
              {currentDerivationTree && (
                <LatexExportButton
                  getLatex={() => exportParseTreeToTikz(currentDerivationTree)}
                  filename="earley_parse_tree.tex"
                  lang={lang}
                  title={cz ? 'Exportovat strom do LaTeXu (TikZ)' : 'Export tree as LaTeX (TikZ)'}
                />
              )}
            </div>

            <div style={{ flex: 1, minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {currentDerivationTree ? (
                <DerivationTreeVisualizer rootNode={currentDerivationTree} lang={lang} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '12px', padding: '24px' }}>
                  {currentStepIdx === totalSteps - 1 && !(parserMode === 'classic' ? earleySim.accepted : ettpSim.accepted)
                    ? (cz ? 'Slovo nepatří do jazyka gramatiky (žádný derivační strom neexistuje).' : 'Word is not in the grammar language (no valid derivation tree exists).')
                    : (cz ? 'Derivační strom bude sestaven po dokončení pravidel.' : 'Derivation tree will form as completed rules reduce.')}
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
                  {cz ? `Predikcí za běhu: ${earleySim.stats.predictCount}` : `Runtime predictions: ${earleySim.stats.predictCount}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {cz ? `Položek: ${earleySim.stats.totalItems}` : `Total items: ${earleySim.stats.totalItems}`}
                </div>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-primary)' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '2px' }}>
                  {cz ? 'ETTP (Scott & Johnstone 2025)' : 'ETTP (2025)'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-success)' }}>
                  {cz ? 'Predikcí za běhu: 0' : 'Runtime predictions: 0'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {cz ? `Předp. stavů: ${ettpTable.states.length}` : `Precomputed states: ${ettpTable.states.length}`}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: '8px 0 0', lineHeight: '1.4' }}>
              {cz
                ? 'ETTP zcela eliminuje prediktor za běhu předvýpočtem přechodové tabulky. Tím dosahuje výrazně menší paměťové stopy a vyšší rychlosti při zachování plné bezkontextové obecnosti.'
                : 'ETTP completely eliminates runtime predictions via precomputed transition tables, achieving smaller memory overhead and higher throughput while preserving general CFG parsing.'}
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
                  <th>{cz ? 'Položky stavu (predikční uzávěr)' : 'State Items (Prediction Closure)'}</th>
                  <th>{cz ? 'Přechody δ(q, X)' : 'Transitions δ(q, X)'}</th>
                  <th>{cz ? 'Dokončená pravidla' : 'Completions'}</th>
                  <th style={{ width: '80px' }}>{cz ? 'Přijímající' : 'Accepting'}</th>
                </tr>
              </thead>
              <tbody>
                {ettpTable.states.map(st => (
                  <tr key={st.id} style={{ backgroundColor: selectedTableStateId === st.id ? 'var(--color-primary-subtle)' : undefined }}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>q{st.id}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {st.items.map((it, idx) => {
                        const rhs = [...it.production.rhs];
                        rhs.splice(it.dot, 0, '•');
                        return <div key={idx}>{`${it.production.lhs} → ${rhs.join(' ')}`}</div>;
                      })}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {[...st.transitions.entries()].map(([sym, tr], idx) => (
                        <span key={idx} style={{ display: 'inline-block', marginRight: '8px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--color-bg-base)' }}>
                          {sym} → <strong>q{tr.targetStateId}</strong> ({tr.originKind})
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
