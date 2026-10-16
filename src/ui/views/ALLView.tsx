/**
 * ALLView: Interactive ALL(*) (Adaptive LL(*)) Parsing Demonstration View.
 *
 * Visualizes:
 * 1. Augmented Transition Network (ATN) decision points.
 * 2. Dynamic Lookahead DFA cache materialized on demand.
 * 3. Step-by-step top-down simulation with dynamic lookahead scanning.
 * 4. Interactive Derivation Tree construction.
 * 5. Primary literature citations (Parr, Harwell, Fisher 2014).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { buildATN, ATN, ATNDecisionPoint } from '../../core/all/allAtn';
import { createLookaheadDFA, LookaheadDFA } from '../../core/all/allPredictor';
import { checkALLCompatibility, simulateALLParse, ALLParseStep, ALLSimulationResult } from '../../core/all/allParser';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Network, CheckCircle2, AlertTriangle, Eye, Sparkles,
  GitBranch, ArrowRight, ExternalLink, HelpCircle
} from 'lucide-react';

interface ALLViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  defaultInput?: string;
  lang: Language;
  onAttemptLeftRecursionRemoval?: () => void;
}

export const ALL_PRIMARY_REFERENCES = [
  {
    authorYear: 'Parr, Harwell & Fisher (2014)',
    citation: 'Parr, T., Harwell, S., Fisher, K.: Adaptive LL(*) parsing: The power of dynamic analysis. In: Proceedings of the 35th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI \'14), pp. 579–589, 2014.',
    url: 'https://doi.org/10.1145/2594291.2594326'
  },
  {
    authorYear: 'Parr & Fisher (2011)',
    citation: 'Parr, T., Fisher, K.: LL(*): The foundation of the ANTLR parser generator. ACM SIGPLAN Notices 46(1), 425–436, 2011.',
    url: 'https://doi.org/10.1145/1926385.1926432'
  }
];

export const ALLView: React.FC<ALLViewProps> = ({
  grammar,
  analysis,
  defaultInput = '',
  lang,
  onAttemptLeftRecursionRemoval
}) => {
  const t = TRANSLATIONS[lang];
  const cz = lang === 'cz';

  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Precomputed ATN and compatibility assessment
  const atn: ATN = useMemo(() => buildATN(grammar), [grammar]);
  const compatibility = useMemo(() => checkALLCompatibility(grammar, analysis), [grammar, analysis]);

  // Pre-warmed DFA cache for all decision points
  const dfaCache = useMemo(() => {
    const map = new Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>();
    for (const dp of atn.decisionPoints) {
      map.set(dp.decisionNumber, createLookaheadDFA(dp, atn));
    }
    return map;
  }, [atn]);

  // Selected decision point for Lookahead DFA inspection
  const [selectedDecisionNum, setSelectedDecisionNum] = useState<number>(
    atn.decisionPoints[0]?.decisionNumber ?? 1
  );

  useEffect(() => {
    if (atn.decisionPoints.length > 0) {
      setSelectedDecisionNum(atn.decisionPoints[0].decisionNumber);
    }
  }, [atn]);

  const activeDecision = atn.decisionPoints.find(dp => dp.decisionNumber === selectedDecisionNum);
  const activeDfaEntry = activeDecision ? dfaCache.get(activeDecision.decisionNumber) : undefined;

  // Simulator state
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const simulation: ALLSimulationResult = useMemo(
    () => simulateALLParse(tokenized.tokens, grammar, atn, dfaCache),
    [tokenized, grammar, atn, dfaCache]
  );

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  useEffect(() => {
    const row = traceRef.current?.querySelector('.trace-row-active') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentStepIdx]);

  const currentStep: ALLParseStep | undefined = simulation.steps[currentStepIdx];
  const lastStep = simulation.steps[simulation.steps.length - 1];

  return (
    <div>
      {/* Compatibility & Classification Card */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="var(--color-primary)" />
            {cz ? 'ALL(*) Adaptivní analyzátor shora dolů (ANTLR v4)' : 'ALL(*) Adaptive Top-Down Parser (ANTLR v4)'}
          </span>
          <span className={`badge ${compatibility.canParse ? 'badge-success' : 'badge-warning'}`}>
            {compatibility.canParse
              ? (cz ? 'ALL(*) kompatibilní' : 'ALL(*) Compatible')
              : (cz ? 'Obsahuje levou rekurzi' : 'Contains Left Recursion')}
          </span>
        </div>

        <p className="hint-text" style={{ marginBottom: '12px' }}>
          {cz
            ? 'Algoritmus ALL(*) (Parr, Harwell, Fisher 2014) překonává statické limity LL(1) a LL(k) tím, že nedeterministické větvení řeší za běhu. Simulací rozšířené přechodové sítě (ATN) na tok vstupních symbolů dynamicky vytváří a ukládá do mezipaměti stavy deterministického automatu (Lookahead DFA) s libovolnou potřebnou hloubkou pohledu.'
            : 'The ALL(*) algorithm (Parr, Harwell, Fisher 2014) overcomes the static limits of LL(1) and LL(k) by resolving non-deterministic branches at runtime. By simulating an Augmented Transition Network (ATN) across the input token stream, it dynamically materializes and caches deterministic Lookahead DFA states with arbitrary lookahead depth.'}
        </p>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <div className="stat-label">{cz ? 'Stavy sítě ATN' : 'ATN States'}</div>
            <div className="stat-value">{compatibility.atnStateCount}</div>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <div className="stat-label">{cz ? 'Rozhodovací body' : 'Decision Points'}</div>
            <div className="stat-value">{compatibility.decisionPointCount}</div>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <div className="stat-label">{cz ? 'Max. hloubka pohledu' : 'Max Lookahead Depth'}</div>
            <div className="stat-value">{simulation.maxLookaheadDepth} {cz ? 'tokenů' : 'tokens'}</div>
          </div>
          <div className="stat-card" style={{ padding: '8px 12px' }}>
            <div className="stat-label">{cz ? 'Dynamická rozhodnutí' : 'Decisions Evaluated'}</div>
            <div className="stat-value">{simulation.decisionsMade}</div>
          </div>
        </div>

        {!compatibility.canParse && (
          <div className="notice-box warning" style={{ marginBottom: '12px' }}>
            <div className="notice-title">
              <AlertTriangle size={15} />
              <span>{cz ? 'Omezení levé rekurze' : 'Left Recursion Restriction'}</span>
            </div>
            <p style={{ margin: '4px 0 8px 0', fontSize: '13px' }}>
              {cz
                ? `Gramatika obsahuje levě rekurzivní pravidla (${compatibility.leftRecursiveRules.join(', ')}). Algoritmus ALL(*) shora dolů vyžaduje předchozí odstranění levé rekurze (nebo přepis do precedenčního tvaru), aby se zabránilo zacyklení uzávěru ATN.`
                : `The grammar contains left-recursive rules (${compatibility.leftRecursiveRules.join(', ')}). The top-down ALL(*) algorithm requires eliminating left recursion (or rewriting to precedence form) to prevent ATN closure cycles.`}
            </p>
            {onAttemptLeftRecursionRemoval && (
              <button className="btn btn-secondary btn-sm" onClick={onAttemptLeftRecursionRemoval}>
                <Sparkles size={13} style={{ marginRight: '5px' }} />
                {cz ? 'Odstranit levou rekurzi v záložce Úpravy' : 'Eliminate Left Recursion in Transformations'}
              </button>
            )}
          </div>
        )}

        {/* Primary Literature Reference Bar */}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          <span style={{ fontWeight: 600, marginRight: '6px' }}>{cz ? 'Primární literatura:' : 'Primary literature:'}</span>
          {ALL_PRIMARY_REFERENCES.map((ref, i) => (
            <span key={i} style={{ marginRight: '14px', display: 'inline-block' }}>
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                title={ref.citation}
                style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                <strong>{ref.authorYear}</strong>
                <ExternalLink size={10} />
              </a>
            </span>
          ))}
        </div>
      </div>

      {/* Decision Points & Lookahead DFA Cache Section */}
      {atn.decisionPoints.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={16} color="var(--color-primary)" />
              {cz ? 'Rozhodovací body a dynamická mezipaměť Lookahead DFA' : 'Decision Points & Dynamic Lookahead DFA Cache'}
            </span>
          </div>
          <p className="hint-text" style={{ marginBottom: '10px' }}>
            {cz
              ? 'Každý neterminál s více než jednou alternativou představuje rozhodovací bod. Během rozkladu se pro něj postupně buduje deterministický automat (Lookahead DFA), který se ukládá do mezipaměti.'
              : 'Every non-terminal with more than one alternative represents a decision point. During parsing, a deterministic Lookahead DFA is lazily constructed and cached for it.'}
          </p>

          {/* Decision point tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {atn.decisionPoints.map(dp => (
              <button
                key={dp.decisionNumber}
                className={`btn btn-sm ${selectedDecisionNum === dp.decisionNumber ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedDecisionNum(dp.decisionNumber)}
              >
                D{dp.decisionNumber}: <strong>{dp.nonTerminal}</strong> ({dp.alternatives.length} {cz ? 'alt.' : 'alts'})
              </button>
            ))}
          </div>

          {activeDecision && activeDfaEntry && (
            <div style={{ backgroundColor: 'var(--color-bg-base)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
                {cz ? `Rozhodnutí D${activeDecision.decisionNumber} pro neterminál ` : `Decision D${activeDecision.decisionNumber} for non-terminal `}
                <code>{activeDecision.nonTerminal}</code>:
              </div>

              {/* Alternatives List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px', fontSize: '13px' }}>
                {activeDecision.alternatives.map(alt => (
                  <div key={alt.alt} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-secondary" style={{ minWidth: '45px', textAlign: 'center' }}>
                      Alt {alt.alt}
                    </span>
                    <code>{formatProduction(alt.production)}</code>
                  </div>
                ))}
              </div>

              {/* Lookahead DFA States Table */}
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                {cz ? 'Stavy v mezipaměti Lookahead DFA:' : 'Cached Lookahead DFA States:'}
              </div>
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '70px' }}>{cz ? 'Stav' : 'State'}</th>
                      <th>{cz ? 'Konfigurace ATN (stav, alt, kontext)' : 'ATN Configurations (state, alt, context)'}</th>
                      <th style={{ width: '180px' }}>{cz ? 'Přechody na tokenech' : 'Transitions on Tokens'}</th>
                      <th style={{ width: '130px' }}>{cz ? 'Předpověď' : 'Decision / Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDfaEntry.dfa.states.map(s => {
                      const edgesList = Object.entries(s.edges);
                      return (
                        <tr key={s.id}>
                          <td><strong>s{s.id}</strong> {s.id === 0 && <span className="badge badge-secondary" style={{ fontSize: '10px' }}>start</span>}</td>
                          <td>
                            <div style={{ maxHeight: '60px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
                              {s.configs.map((c, idx) => (
                                <span key={idx} style={{ display: 'inline-block', marginRight: '8px', padding: '1px 4px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '3px' }}>
                                  ({c.stateId}, alt:{c.alt}{c.context.length > 0 ? `, ctx:[${c.context.join(',')}]` : ''})
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            {edgesList.length === 0 ? (
                              <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {edgesList.map(([tok, targetId]) => (
                                  <span key={tok} className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                    '{tok}' → s{targetId}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            {s.isAcceptState && s.predictedAlt !== undefined ? (
                              <span className="badge badge-success" style={{ fontSize: '11px' }}>
                                <CheckCircle2 size={11} style={{ marginRight: '3px' }} />
                                Alt {s.predictedAlt}
                              </span>
                            ) : (
                              <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                {cz ? 'Zkoumá se' : 'Pending'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Simulator & Derivation Tree Section */}
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={18} color="var(--color-primary)" />
            {cz ? 'Interaktivní krokovací simulátor ALL(*)' : 'Interactive ALL(*) Step Simulator'}
          </span>
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>
          {cz
            ? 'Sledujte rozklad slova shora dolů s adaptivním pohledem dopředu a živou stavbou derivačního stromu.'
            : 'Trace top-down parsing with adaptive lookahead scanning and live derivation tree construction.'}
        </p>

        {/* Word Input */}
        <input
          type="text"
          className="grammar-textarea"
          style={{ minHeight: 'unset', height: '38px', padding: '6px 12px', marginBottom: '10px' }}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={cz ? 'Zadejte slovo pro simulaci...' : 'Enter word to simulate...'}
          aria-label={cz ? 'Slovo pro rozklad' : 'Word to parse'}
        />
        <TokenizedInputNote tokenized={tokenized} lang={lang} />

        {/* Simulator Controls */}
        <SimulatorControls
          stepIdx={currentStepIdx}
          total={simulation.steps.length}
          isPlaying={isPlaying}
          speed={playSpeed}
          lang={lang}
          onStep={setCurrentStepIdx}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSpeed={setPlaySpeed}
        />

        {/* Step Callout Banner */}
        {currentStep && (
          <div
            className={`report-box ${currentStep.decisionEvent ? 'info' : currentStep.isMatch ? 'success' : 'neutral'}`}
            style={{ margin: '12px 0', fontSize: '13px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <strong>{cz ? `Krok ${currentStepIdx + 1} z ${simulation.steps.length}:` : `Step ${currentStepIdx + 1} of ${simulation.steps.length}:`}</strong>
              {currentStep.decisionEvent && (
                <span className="badge badge-primary">
                  {cz ? `Dopředný pohled: hloubka ${currentStep.decisionEvent.lookaheadDepth}` : `Lookahead depth: ${currentStep.decisionEvent.lookaheadDepth}`}
                </span>
              )}
            </div>
            <div>{cz ? currentStep.actionCz : currentStep.action}</div>
            {currentStep.decisionEvent && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {cz ? 'Přečtené symboly dopředu: ' : 'Scanned lookahead tokens: '}
                <code>[{currentStep.decisionEvent.lookaheadTokens.join(', ')}]</code>
                {' → '}
                {cz ? 'Zvolena ' : 'Selected '}
                <strong>Alt {currentStep.decisionEvent.predictedAlt}</strong> (<code>{formatProduction(currentStep.decisionEvent.production)}</code>)
              </div>
            )}
          </div>
        )}

        {/* Derivation Tree Visualizer & Trace Log Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '16px', marginTop: '14px' }}>
          {/* Derivation Tree View */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>
                {cz ? 'Derivační strom (shora dolů)' : 'Derivation Tree (Top-Down)'}
              </div>
              {currentStep?.derivationTree && (
                <LatexExportButton
                  getLatex={() => exportParseTreeToTikz(currentStep.derivationTree!)}
                  filename={`all_tree_step_${currentStepIdx}.tex`}
                  label={cz ? 'TikZ strom' : 'TikZ Tree'}
                  title={cz ? 'Export derivačního stromu do LaTeXu (TikZ)' : 'Export derivation tree to LaTeX (TikZ)'}
                  lang={lang}
                />
              )}
            </div>
            {currentStep?.derivationTree ? (
              <DerivationTreeVisualizer
                rootNode={currentStep.derivationTree}
                height="340px"
                filename={`all_tree_step_${currentStepIdx}`}
                lang={lang}
              />
            ) : (
              <div style={{ height: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                {cz ? 'Žádný strom k zobrazení' : 'No tree to display'}
              </div>
            )}
          </div>

          {/* Trace Log */}
          <div
            ref={traceRef}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              maxHeight: '390px',
              overflowY: 'auto',
              backgroundColor: 'var(--color-bg-base)',
              fontSize: '12px'
            }}
          >
            <div style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg-base)', padding: '8px 12px', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
              {cz ? 'Protokol kroků simulace' : 'Simulation Trace Log'}
            </div>
            {simulation.steps.map((s, idx) => (
              <div
                key={idx}
                className={`trace-row ${idx === currentStepIdx ? 'trace-row-active' : ''}`}
                style={{
                  padding: '6px 10px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  backgroundColor: idx === currentStepIdx ? 'var(--color-primary-subtle)' : undefined
                }}
                onClick={() => {
                  setCurrentStepIdx(idx);
                  setIsPlaying(false);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '11px' }}>
                  <span>#{idx + 1}</span>
                  {s.decisionEvent && <span style={{ color: 'var(--color-primary)' }}>Lookahead k={s.decisionEvent.lookaheadDepth}</span>}
                </div>
                <div>{cz ? s.actionCz : s.action}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Final Result Acceptance Banner */}
        {lastStep && currentStepIdx === simulation.steps.length - 1 && (
          <div style={{ marginTop: '14px' }}>
            {simulation.accepted ? (
              <div className="report-box success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} />
                <span>
                  <strong>{tokenized.tokens.join(' ') || 'ε'} ∈ L(G).</strong>{' '}
                  {cz
                    ? 'Slovo bylo úspěšně analyzováno a přijato algoritmem ALL(*).'
                    : 'The word was successfully parsed and accepted by the ALL(*) algorithm.'}
                </span>
              </div>
            ) : (
              <div className="report-box error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} />
                <span>
                  <strong>{tokenized.tokens.join(' ') || 'ε'} ∉ L(G).</strong>{' '}
                  {cz
                    ? 'Slovo bylo analyzátorem ALL(*) odmítnuto.'
                    : 'The word was rejected by the ALL(*) parser.'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
