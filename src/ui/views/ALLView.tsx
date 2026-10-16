/**
 * ALLView: Interactive ALL(*) (Adaptive LL(*)) Parsing Demonstration View.
 *
 * Visualizes:
 * 1. Augmented Transition Network (ATN) decision points.
 * 2. Dynamic Lookahead DFA cache materialized on demand (Interactive Graph & Table).
 * 3. Step-by-step top-down simulation with dynamic lookahead scanning and sub-step traces.
 * 4. Interactive Derivation Tree construction.
 * 5. Primary literature citations and comprehensive educational mechanics (Parr, Harwell, Fisher 2014).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { buildATN, ATN } from '../../core/all/allAtn';
import { createLookaheadDFA, LookaheadDFA } from '../../core/all/allPredictor';
import { checkALLCompatibility, simulateALLParse, ALLParseStep, ALLSimulationResult } from '../../core/all/allParser';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { LookaheadDFAGraphVisualizer } from '../visualizer/LookaheadDFAGraphVisualizer';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import {
  Network, CheckCircle2, AlertTriangle, Eye, Sparkles,
  GitBranch, ArrowRight, ExternalLink, HelpCircle, Layers,
  BookOpen, ChevronDown, ChevronRight, List
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
    url: 'https://doi.org/10.1145/2594291.2594326',
    sections: '§2 (Overview & Architecture), §3 (ATN Model), §4 (Dynamic Prediction), §5 (SLL vs LL), §6 (Left-Recursion)'
  },
  {
    authorYear: 'Parr & Fisher (2011)',
    citation: 'Parr, T., Fisher, K.: LL(*): The foundation of the ANTLR parser generator. ACM SIGPLAN Notices 46(1), 425–436, 2011.',
    url: 'https://doi.org/10.1145/1926385.1926432',
    sections: '§1–4 (Static Lookahead DFA Construction & Grammar Classes)'
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

  // Pre-warmed DFA cache for all decision points (computed only when grammar is compatible with top-down parsing)
  const dfaCache = useMemo(() => {
    const map = new Map<number, { dfa: LookaheadDFA; stateKeyMap: Map<string, number> }>();
    if (!compatibility.canParse) {
      return map;
    }
    for (const dp of atn.decisionPoints) {
      map.set(dp.decisionNumber, createLookaheadDFA(dp, atn));
    }
    return map;
  }, [atn, compatibility.canParse]);

  // Selected decision point for Lookahead DFA inspection
  const [selectedDecisionNum, setSelectedDecisionNum] = useState<number>(
    atn.decisionPoints[0]?.decisionNumber ?? 1
  );

  // DFA visualization mode: 'graph' or 'table'
  const [dfaViewMode, setDfaViewMode] = useState<'graph' | 'table'>('graph');
  const [selectedDfaStateId, setSelectedDfaStateId] = useState<number>(0);

  // Toggle for educational literature guide
  const [showTheoryGuide, setShowTheoryGuide] = useState(false);
  // Toggle for lookahead step trace walkthrough
  const [showLookaheadTrace, setShowLookaheadTrace] = useState(true);

  useEffect(() => {
    if (atn.decisionPoints.length > 0) {
      setSelectedDecisionNum(atn.decisionPoints[0].decisionNumber);
      setSelectedDfaStateId(0);
    }
  }, [atn]);

  const activeDecision = atn.decisionPoints.find(dp => dp.decisionNumber === selectedDecisionNum);
  const activeDfaEntry = activeDecision ? dfaCache.get(activeDecision.decisionNumber) : undefined;
  const inspectedDfaState = activeDfaEntry?.dfa.states.find(s => s.id === selectedDfaStateId) ?? activeDfaEntry?.dfa.states[0];

  // Simulator state: guarded against running on left-recursive grammars
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const simulation: ALLSimulationResult = useMemo(() => {
    if (!compatibility.canParse) {
      return {
        accepted: false,
        steps: [{
          stepIndex: 0,
          inputIndex: 0,
          currentToken: tokenized.tokens[0],
          remainingTokens: [...tokenized.tokens],
          callStack: [grammar.startSymbol],
          action: `Parsing halted: Grammar contains left-recursive rule(s) [${compatibility.leftRecursiveRules.join(', ')}]. ALL(*) top-down parsing requires eliminating left recursion first (Parr, Harwell, Fisher 2014, §3).`,
          actionCz: `Rozklad zastaven: Gramatika obsahuje levě rekurzivní pravidla [${compatibility.leftRecursiveRules.join(', ')}]. Algoritmus ALL(*) shora dolů vyžaduje nejprve odstranit levou rekurzi (Parr, Harwell, Fisher 2014, §3).`,
          derivationTree: undefined
        }],
        maxLookaheadDepth: 0,
        decisionsMade: 0,
        error: compatibility.reasons.join('\n'),
        errorCz: compatibility.reasonsCz.join('\n')
      };
    }
    return simulateALLParse(tokenized.tokens, grammar, atn, dfaCache);
  }, [tokenized, grammar, atn, dfaCache, compatibility]);

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
        <ReferenceBar
          references={ALL_PRIMARY_REFERENCES}
          lang={lang}
          extraRight={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
              onClick={() => setShowTheoryGuide(!showTheoryGuide)}
            >
              <BookOpen size={12} style={{ marginRight: '4px' }} />
              {cz ? (showTheoryGuide ? 'Skrýt teorii ALL(*)' : 'Jak ALL(*) funguje (teorie)') : (showTheoryGuide ? 'Hide Theory Guide' : 'How ALL(*) Works (Theory Guide)')}
              {showTheoryGuide ? <ChevronDown size={12} style={{ marginLeft: '4px' }} /> : <ChevronRight size={12} style={{ marginLeft: '4px' }} />}
            </button>
          }
        />

        {/* Educational Theory & Architectural Guide (Expandable) */}
        {showTheoryGuide && (
          <div style={{ marginTop: '14px', padding: '14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={16} />
              {cz ? 'Formální principy algoritmu ALL(*) (Parr et al. 2014)' : 'Formal Principles of the ALL(*) Algorithm (Parr et al. 2014)'}
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {/* Pillar 1: Two-tier architecture */}
              <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {cz ? '1. Dvouvrstvá architektura (Parr et al. §2, Obr. 1)' : '1. Two-Tier Architecture (Parr et al. §2, Fig. 1)'}
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {cz
                    ? 'ALL(*) striktně odděluje rozkladový automat shora dolů (LL parse stack) od predikčního stroje. Rozkladový automat provádí expanze a čte vstup. Pouze v místech větvení (rozhodovací body) volá predikční stroj adaptivePredict, který simuluje ATN a vrátí vítěznou alternativu.'
                    : 'ALL(*) strictly decouples top-down parsing execution from the lookahead prediction engine. The LL parser performs rule expansions and matches tokens. Only at non-deterministic decision points does it query adaptivePredict, which simulates the ATN to choose the winning alternative.'}
                </p>
              </div>

              {/* Pillar 2: Dynamic ATN Simulation & DFA Caching */}
              <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {cz ? '2. Dynamická mezipaměť DFA (Parr et al. §4, Alg. 1–3)' : '2. Dynamic DFA Caching (Parr et al. §4, Alg. 1–3)'}
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {cz
                    ? 'Stavy Lookahead DFA nejsou počítány staticky předem (což by vedlo k exponenciální explozi). Místo toho se vytvářejí za běhu (on-demand) podél tokenů skutečně se vyskytujících ve vstupu a ukládají do mezipaměti. Následující rozhodnutí na stejném prefixu proběhnou v čase O(1).'
                    : 'Lookahead DFA states are not precomputed ahead-of-time (which would cause exponential state explosion). Instead, they are materialized on-demand along token paths actually encountered in the input and cached. Future decisions on identical prefixes execute in O(1) time.'}
                </p>
              </div>

              {/* Pillar 3: SLL vs LL Context */}
              <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {cz ? '3. SLL(*) vs. plné LL(*) (Parr et al. §5)' : '3. SLL(*) vs. Full LL(*) (Parr et al. §5)'}
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {cz
                    ? 'Strong LL(*) simuluje ATN s prázdným kontextem volání (kontextově volně), což vyřeší přes 90 % rozhodnutí v programovacích jazycích. Pokud vznikne nejednoznačnost, ALL(*) přejde na plné LL(*) a zapojí skutečný zásobník návratových stavů γ.'
                    : 'Strong LL(*) evaluates ATN configurations without calling context (context-free), which resolves >90% of real-world grammar decisions. When ambiguity arises, ALL(*) falls back to full LL(*), restoring the caller return stack γ to distinguish valid paths.'}
                </p>
              </div>

              {/* Pillar 4: Left-Recursion Barrier */}
              <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {cz ? '4. Omezení levé rekurze (Parr et al. §3 & §6)' : '4. Left-Recursion Barrier (Parr et al. §3 & §6)'}
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {cz
                    ? 'Protože ALL(*) simuluje uzávěr pravidel shora dolů, přímá či nepřímá levá rekurze (A =>+ A α) vytváří nekonečný cyklus v ATN bez konzumace tokenu. Proto vyžaduje předchozí odstranění levé rekurze nebo precedenční stratifikaci.'
                    : 'Because ALL(*) computes ATN closures top-down, direct or indirect left recursion (A =>+ A α) induces an infinite cycle without token consumption. Therefore, top-down simulation requires eliminating left recursion or precedence stratification first.'}
                </p>
              </div>
            </div>

            {/* Parsing Families Comparison Table */}
            <div style={{ marginTop: '14px' }}>
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>
                {cz ? 'Srovnání rodin syntaktických analyzátorů:' : 'Comparison of Parser Families:'}
              </strong>
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>{cz ? 'Analyzátor' : 'Parser'}</th>
                      <th>{cz ? 'Směr rozkladu' : 'Direction'}</th>
                      <th>{cz ? 'Hloubka pohledu (k)' : 'Lookahead (k)'}</th>
                      <th>{cz ? 'Tabulka / Konstrukce' : 'Table / Construction'}</th>
                      <th>{cz ? 'Levá rekurze' : 'Left Recursion'}</th>
                      <th>{cz ? 'Konflikty' : 'Conflicts'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>LL(1)</strong></td>
                      <td>{cz ? 'Shora dolů' : 'Top-Down'}</td>
                      <td>k = 1 ({cz ? 'statické' : 'static'})</td>
                      <td>{cz ? 'Statická tabulka M[A, a]' : 'Static table M[A, a]'}</td>
                      <td>{cz ? 'Zakázána' : 'Prohibited'}</td>
                      <td>{cz ? 'Selhání při kolizi FIRST/FOLLOW' : 'Fails on FIRST/FOLLOW clash'}</td>
                    </tr>
                    <tr>
                      <td><strong>LL(k)</strong></td>
                      <td>{cz ? 'Shora dolů' : 'Top-Down'}</td>
                      <td>k {cz ? 'pevné' : 'fixed'} (1, 2, ...)</td>
                      <td>{cz ? 'Exponenciální velikost O(|T|^k)' : 'Exponential size O(|T|^k)'}</td>
                      <td>{cz ? 'Zakázána' : 'Prohibited'}</td>
                      <td>{cz ? 'Selhání, pokud k nestačí' : 'Fails if depth exceeds k'}</td>
                    </tr>
                    <tr>
                      <td><strong>LR(k) / LALR(1)</strong></td>
                      <td>{cz ? 'Zdola nahoru' : 'Bottom-Up'}</td>
                      <td>k = 1</td>
                      <td>{cz ? 'Statický automat položen (ACTION/GOTO)' : 'Static item set automaton'}</td>
                      <td>{cz ? 'Přirozeně podporována' : 'Naturally supported'}</td>
                      <td>{cz ? 'Shift/Reduce a Reduce/Reduce kolize' : 'Shift/Reduce & Reduce/Reduce'}</td>
                    </tr>
                    <tr style={{ backgroundColor: 'var(--color-primary-subtle)' }}>
                      <td><strong>ALL(*)</strong></td>
                      <td>{cz ? 'Shora dolů' : 'Top-Down'}</td>
                      <td>k ∈ [1, ∞) ({cz ? 'dynamické' : 'dynamic'})</td>
                      <td>{cz ? 'On-demand mezipaměť Lookahead DFA' : 'On-demand Lookahead DFA cache'}</td>
                      <td>{cz ? 'Vyžaduje odstranění / precedenci' : 'Requires elimination / precedence'}</td>
                      <td>{cz ? 'Řešeno dynamicky simulací ATN' : 'Dynamically resolved via ATN'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Decision Points & Lookahead DFA Cache Section */}
      {atn.decisionPoints.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={16} color="var(--color-primary)" />
              {cz ? 'Rozhodovací body a dynamická mezipaměť Lookahead DFA' : 'Decision Points & Dynamic Lookahead DFA Cache'}
            </span>

            {/* View Mode Toggle: Graph vs Table */}
            {compatibility.canParse && activeDfaEntry && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${dfaViewMode === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
                  onClick={() => setDfaViewMode('graph')}
                >
                  <GitBranch size={12} style={{ marginRight: '4px' }} />
                  {cz ? 'Graf DFA' : 'DFA Graph'}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${dfaViewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
                  onClick={() => setDfaViewMode('table')}
                >
                  <List size={12} style={{ marginRight: '4px' }} />
                  {cz ? 'Tabulka stavů' : 'States Table'}
                </button>
              </div>
            )}
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
                onClick={() => {
                  setSelectedDecisionNum(dp.decisionNumber);
                  setSelectedDfaStateId(0);
                }}
              >
                D{dp.decisionNumber}: <strong>{dp.nonTerminal}</strong> ({dp.alternatives.length} {cz ? 'alt.' : 'alts'})
              </button>
            ))}
          </div>

          {activeDecision && (
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

              {!compatibility.canParse ? (
                <div style={{ fontSize: '12px', color: 'var(--color-warning)', padding: '8px 12px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  {cz
                    ? 'Stavy Lookahead DFA se nevytvářejí, protože neterminál se účastní levé rekurze. V souladu s teorií ALL(*) (Parr et al. 2014) je nutné předchozí odstranění levé rekurze.'
                    : 'Lookahead DFA states are not materialized because this non-terminal participates in left recursion. Per ALL(*) theory (Parr et al. 2014), left recursion must be eliminated first.'}
                </div>
              ) : activeDfaEntry && (
                <>
                  {dfaViewMode === 'graph' ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                          {cz ? 'Vizuální diagram automatu Lookahead DFA:' : 'Lookahead DFA State Graph:'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {cz ? 'Kliknutím na stav zobrazíte jeho konfigurace ATN' : 'Click a state to inspect its ATN configurations'}
                        </div>
                      </div>

                      <LookaheadDFAGraphVisualizer
                        dfa={activeDfaEntry.dfa}
                        selectedStateId={selectedDfaStateId}
                        onSelectState={setSelectedDfaStateId}
                        activeStateId={currentStep?.decisionEvent?.dfaStateId}
                        lang={lang}
                        filename={`all_dfa_D${activeDecision.decisionNumber}_${activeDecision.nonTerminal}`}
                      />
                    </div>
                  ) : (
                    /* Table View */
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
                            const isSelected = selectedDfaStateId === s.id;
                            return (
                              <tr
                                key={s.id}
                                onClick={() => setSelectedDfaStateId(s.id)}
                                style={{
                                  cursor: 'pointer',
                                  backgroundColor: isSelected ? 'var(--color-primary-subtle)' : undefined
                                }}
                              >
                                <td>
                                  <strong>s{s.id}</strong> {s.id === 0 && <span className="badge badge-secondary" style={{ fontSize: '10px' }}>start</span>}
                                </td>
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
                  )}

                  {/* Selected DFA State Inspector */}
                  {inspectedDfaState && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div>
                          <strong>{cz ? `Detail stavu DFA s${inspectedDfaState.id}` : `DFA State s${inspectedDfaState.id} Details`}</strong>
                          {inspectedDfaState.id === 0 && <span className="badge badge-secondary" style={{ marginLeft: '6px', fontSize: '10px' }}>start</span>}
                          {inspectedDfaState.isAcceptState && (
                            <span className="badge badge-success" style={{ marginLeft: '6px', fontSize: '10px' }}>
                              {cz ? `Přijímací stav: Alt ${inspectedDfaState.predictedAlt}` : `Accept State: Alt ${inspectedDfaState.predictedAlt}`}
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--color-text-muted)' }}>
                          {cz ? `Celkem konfigurací ATN: ${inspectedDfaState.configs.length}` : `Total ATN configurations: ${inspectedDfaState.configs.length}`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {inspectedDfaState.configs.map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'var(--color-bg-base)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '11px'
                            }}
                          >
                            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>ATN #{c.stateId}</span>
                            <span style={{ margin: '0 4px', color: 'var(--color-text-muted)' }}>|</span>
                            <span>Alt {c.alt}</span>
                            {c.context.length > 0 && (
                              <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                                ctx:[{c.context.join(',')}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
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

            {/* Decision Event Summary & Lookahead Trace Walkthrough */}
            {currentStep.decisionEvent && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontSize: '12px' }}>
                  <div>
                    {cz ? 'Přečtené symboly dopředu: ' : 'Scanned lookahead tokens: '}
                    <code>[{currentStep.decisionEvent.lookaheadTokens.join(', ')}]</code>
                    {' → '}
                    {cz ? 'Zvolena ' : 'Selected '}
                    <strong>Alt {currentStep.decisionEvent.predictedAlt}</strong> (<code>{formatProduction(currentStep.decisionEvent.production)}</code>)
                  </div>

                  {currentStep.decisionEvent.trace && currentStep.decisionEvent.trace.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '2px 6px', height: '22px' }}
                      onClick={() => setShowLookaheadTrace(!showLookaheadTrace)}
                    >
                      {cz ? (showLookaheadTrace ? 'Skrýt podrobný pohled' : 'Zobrazit podrobný pohled') : (showLookaheadTrace ? 'Hide Lookahead Walkthrough' : 'Show Lookahead Walkthrough')}
                    </button>
                  )}
                </div>

                {/* Sub-step trace table showing how lookahead resolved alternatives */}
                {showLookaheadTrace && currentStep.decisionEvent.trace && currentStep.decisionEvent.trace.length > 0 && (
                  <div style={{ marginTop: '8px', backgroundColor: 'var(--color-bg-base)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600, fontSize: '11px', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                      {cz ? 'Průchod vyhodnocení dopředného pohledu (Parr et al. 2014, Alg. 1):' : 'Lookahead Evaluation Trace (Parr et al. 2014, Alg. 1):'}
                    </div>
                    <div className="table-responsive">
                      <table className="data-table" style={{ fontSize: '11px', margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th style={{ width: '70px' }}>{cz ? 'Symbol' : 'Token'}</th>
                            <th style={{ width: '70px' }}>{cz ? 'Stav DFA' : 'DFA State'}</th>
                            <th style={{ width: '130px' }}>{cz ? 'Živé alternativy' : 'Viable Alts'}</th>
                            <th>{cz ? 'Provedená akce / stav' : 'Action / Status'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentStep.decisionEvent.trace.map((tr, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td>{tr.token ? <code>'{tr.token}'</code> : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                              <td><strong>s{tr.dfaStateId}</strong></td>
                              <td>
                                <span className={tr.remainingAlts.length === 1 ? 'badge badge-success' : 'badge badge-secondary'} style={{ fontSize: '10px' }}>
                                  [{tr.remainingAlts.join(', ')}]
                                </span>
                              </td>
                              <td>{cz ? tr.actionCz : tr.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
