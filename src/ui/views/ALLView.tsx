/**
 * ALLView: Interactive ALL(*) (Adaptive LL(*)) Parsing Demonstration View.
 *
 * Visualizes (Parr, Harwell & Fisher 2014):
 * 1. Step-by-step top-down parsing with adaptive prediction: SLL with the
 *    lookahead DFA cache, fallback to full LL with the parser's call stack,
 *    ambiguity resolution by the minimum alternative.
 * 2. The lookahead DFA of the active decision as it was at the shown step;
 *    DFA states are sets of ATN configurations (p, i, γ) shown as dotted items.
 * 3. The derivation tree built so far.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { buildATN, ATN } from '../../core/all/allAtn';
import { describeConfig, displaySymbol, ATNConfig, LookaheadDFA } from '../../core/all/allPredictor';
import { checkALLCompatibility, simulateALLParse, ALLParseStep, ALLSimulationResult } from '../../core/all/allParser';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { LookaheadDFAGraphVisualizer, dfaAtClock, dfaStateStatus, dfaStateStatusLabel } from '../visualizer/LookaheadDFAGraphVisualizer';
import { LatexExportButton } from '../components/LatexExportButton';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language } from '../../i18n/translations';
import {
  Network, CheckCircle2, AlertTriangle, Eye, Sparkles,
  GitBranch, BookOpen, ChevronDown, ChevronRight, HelpCircle
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
    citation: 'Parr, T., Harwell, S., Fisher, K.: Adaptive LL(*) parsing: The power of dynamic analysis. In: Proceedings of the 2014 ACM International Conference on Object Oriented Programming Systems Languages & Applications (OOPSLA \'14), pp. 579–598, 2014.',
    url: 'https://doi.org/10.1145/2660193.2660202',
    sections: '§2.2 (left recursion), §3 (SLL vs LL, two-stage parsing), §4.3–4.4 (ATN, lookahead DFA), §5.2 (Functions 1–7), §5.3 (conflicts and ambiguities), §6 (correctness)'
  },
  {
    authorYear: 'Parr & Fisher (2011)',
    citation: 'Parr, T., Fisher, K.: LL(*): The foundation of the ANTLR parser generator. In: Proceedings of the 32nd ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI \'11), pp. 425–436, 2011.',
    url: 'https://doi.org/10.1145/1993498.1993548',
    sections: 'static LL(*) lookahead DFA (the predecessor of ALL(*))'
  }
];

const MAX_INSPECTED_CONFIGS = 80;

const VIEW_CSS = `
.allv-host { container-type: inline-size; }
.allv-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) minmax(0, 0.7fr);
  gap: 12px;
  align-items: start;
}
@container (max-width: 1150px) {
  .allv-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); }
  .allv-grid > .allv-log { grid-column: 1 / -1; }
}
@container (max-width: 720px) {
  .allv-grid { grid-template-columns: minmax(0, 1fr); }
}
.allv-panel { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 8px; min-width: 0; }
.allv-panel-title { font-weight: 600; font-size: 12.5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
.allv-step { min-height: 92px; max-height: 190px; overflow-y: auto; margin: 10px 0; font-size: 13px; padding: 8px 10px;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-bg-surface); }
.allv-step.info { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.allv-step.ll { border-color: var(--color-warning); background: var(--color-warning-subtle); }
.allv-step.ok { border-color: var(--color-success); background: var(--color-success-subtle); }
.allv-step.bad { border-color: var(--color-danger); background: var(--color-danger-subtle); }
.allv-configs { max-height: 150px; overflow-y: auto; font-family: monospace; font-size: 11px; display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.allv-config { padding: 1px 4px; border-radius: 3px; background: var(--color-bg-base); white-space: nowrap; }
.allv-log { position: relative; max-height: 470px; overflow-y: auto; font-size: 11.5px; padding: 0; }
.allv-log-row { padding: 4px 8px; border-bottom: 1px solid var(--color-border-subtle); cursor: pointer; }
.allv-log-row.active { background: var(--color-primary-subtle); }
.allv-stats { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--color-text-muted); margin: 6px 0 0 0; }
.allv-stats strong { color: var(--color-text); }
.allv-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.allv-tabs .btn { font-size: 11px; padding: 2px 7px; height: 24px; }
`;

const modeBadge = (mode: 'SLL' | 'LL' | undefined, cz: boolean) =>
  mode === 'LL'
    ? <span className="badge badge-warning">{cz ? 'plné LL (zásobník γ0)' : 'full LL (stack γ0)'}</span>
    : mode === 'SLL'
      ? <span className="badge badge-info">{cz ? 'SLL (zásobník #)' : 'SLL (stack #)'}</span>
      : null;

export const ALLView: React.FC<ALLViewProps> = ({
  grammar,
  analysis,
  defaultInput = '',
  lang,
  onAttemptLeftRecursionRemoval
}) => {
  const cz = lang === 'cz';

  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  const atn: ATN = useMemo(() => buildATN(grammar), [grammar]);
  const compatibility = useMemo(() => checkALLCompatibility(grammar, analysis), [grammar, analysis]);

  const [showTheoryGuide, setShowTheoryGuide] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [detailedLookahead, setDetailedLookahead] = useState(true);

  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  // Every run starts with fresh lookahead DFAs, so the graph shows what this input built.
  const simulation: ALLSimulationResult = useMemo(
    () => simulateALLParse(tokenized.tokens, grammar, atn, undefined, { detailedLookaheadSteps: detailedLookahead }),
    [tokenized, grammar, atn, detailedLookahead]
  );

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  // Keep the active log row visible by scrolling the log only (not the page)
  useEffect(() => {
    const log = logRef.current;
    const row = log?.querySelector('.allv-log-row.active') as HTMLElement | null;
    if (!log || !row) return;
    const top = row.offsetTop;
    if (top < log.scrollTop + 30) log.scrollTop = Math.max(0, top - 30);
    else if (top + row.offsetHeight > log.scrollTop + log.clientHeight) log.scrollTop = top + row.offsetHeight - log.clientHeight;
  }, [currentStepIdx]);

  const currentStep: ALLParseStep | undefined = simulation.steps[currentStepIdx];
  const isLastStep = currentStepIdx === simulation.steps.length - 1;

  // Decision shown in the DFA panel: the one of the current step, else the latest one before it
  const [selectedDecisionNum, setSelectedDecisionNum] = useState<number>(atn.decisionPoints[0]?.decisionNumber ?? 1);
  const [selectedDfaStateId, setSelectedDfaStateId] = useState<number | null>(null);
  useEffect(() => {
    setSelectedDecisionNum(atn.decisionPoints[0]?.decisionNumber ?? 1);
    setSelectedDfaStateId(null);
  }, [atn]);
  useEffect(() => {
    if (currentStep?.activeDecisionNumber !== undefined) {
      setSelectedDecisionNum(currentStep.activeDecisionNumber);
      setSelectedDfaStateId(null);
    }
  }, [currentStep]);

  const activeDecision = atn.decisionPoints.find(dp => dp.decisionNumber === selectedDecisionNum);
  const activeDfa: LookaheadDFA | undefined = activeDecision ? simulation.dfaCache.get(activeDecision.decisionNumber)?.dfa : undefined;
  const stepClock = currentStep?.dfaClock;
  const stepIsOnShownDecision = currentStep?.activeDecisionNumber === selectedDecisionNum;
  const activeStateId = stepIsOnShownDecision ? currentStep?.activeDfaStateId : undefined;
  const visibleDfa = activeDfa ? dfaAtClock(activeDfa, stepClock) : undefined;
  const inspectedState = visibleDfa?.states.find(s => s.id === (selectedDfaStateId ?? activeStateId ?? -1));

  // Configurations shown under the graph: LL configurations of an LL step, else the inspected DFA state
  const llConfigs = stepIsOnShownDecision ? currentStep?.llConfigs : undefined;
  const shownConfigs: ATNConfig[] | undefined = llConfigs ?? inspectedState?.configs;

  const stepClass = !currentStep ? '' :
    currentStep.subStepType === 'error' || currentStep.subStepType === 'limit' ? 'bad' :
      currentStep.subStepType === 'accept' || currentStep.isMatch ? 'ok' :
        currentStep.predictionMode === 'LL' ? 'll' :
          currentStep.activeDecisionNumber !== undefined ? 'info' : '';

  const outcomeBanner = () => {
    const word = tokenized.tokens.join(' ') || 'ε';
    switch (simulation.outcome) {
      case 'accepted':
        return (
          <div className="report-box success" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <CheckCircle2 size={16} />
            <span><strong>{word} ∈ L(G).</strong> {cz ? 'ALL(*) slovo přijalo a sestrojilo derivační strom.' : 'ALL(*) accepted the word and built a derivation tree.'}
              {simulation.ambiguities > 0 && (cz
                ? ` Gramatika je pro toto slovo nejednoznačná (${simulation.ambiguities}× konflikt LL), zobrazen je strom s nejmenšími alternativami.`
                : ` The grammar is ambiguous for this word (${simulation.ambiguities} LL conflict(s)); the tree with the minimum alternatives is shown.`)}
            </span>
          </div>
        );
      case 'rejected':
        return (
          <div className="report-box danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <AlertTriangle size={16} />
            <span><strong>{word} ∉ L(G).</strong> {cz
              ? 'Syntaktická chyba. Pro gramatiku bez levé rekurze je ALL(*) přesné (Parr et al. 2014, Věta 6.1), takže slovo do jazyka nepatří.'
              : 'Syntax error. For a grammar without left recursion ALL(*) is exact (Parr et al. 2014, Theorem 6.1), so the word is not in the language.'}</span>
          </div>
        );
      case 'limit':
        return (
          <div className="report-box warning" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <HelpCircle size={16} />
            <span><strong>{cz ? 'Nerozhodnuto.' : 'Undecided.'}</strong> {cz
              ? 'Simulace narazila na bezpečnostní limit; o příslušnosti slova k jazyku nic netvrdí.'
              : 'The simulation hit a safety limit; it says nothing about membership of the word.'}</span>
          </div>
        );
      default:
        return (
          <div className="report-box warning" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <AlertTriangle size={16} />
            <span><strong>{cz ? 'ALL(*) nelze použít.' : 'ALL(*) is not applicable.'}</strong> {cz
              ? 'Gramatika je levě rekurzivní, slovo proto nebylo testováno (nic se netvrdí o jeho příslušnosti k jazyku).'
              : 'The grammar is left-recursive, so the word was not tested (nothing is claimed about its membership).'}</span>
          </div>
        );
    }
  };

  return (
    <div className="allv-host">
      <style>{VIEW_CSS}</style>

      {/* Simulator: step explanation, derivation tree, lookahead DFA and log side by side */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={18} color="var(--color-primary)" />
            {cz ? 'ALL(*) – krokování rozkladu s adaptivní predikcí' : 'ALL(*) – step-by-step parsing with adaptive prediction'}
          </span>
          <span className={`badge ${compatibility.canParse ? 'badge-success' : 'badge-warning'}`}>
            {compatibility.canParse
              ? (cz ? 'bez levé rekurze: ALL(*) použitelné' : 'no left recursion: ALL(*) applicable')
              : (cz ? 'levá rekurze: ALL(*) nelze použít' : 'left recursion: ALL(*) not applicable')}
          </span>
        </div>

        {!compatibility.canParse && (
          <div className="notice-box warning" style={{ marginBottom: '10px' }}>
            <div className="notice-title">
              <AlertTriangle size={15} />
              <span>{cz ? 'Levá rekurze' : 'Left recursion'}</span>
            </div>
            <p style={{ margin: '4px 0 8px 0', fontSize: '13px' }}>
              {cz
                ? `Levě rekurzivní neterminály: ${compatibility.leftRecursiveRules.join(', ')} (přímá, nepřímá nebo skrytá levá rekurze přes vypustitelný prefix). ALL(*) predikuje i rozkládá shora dolů, uzávěr ATN by se zacyklil; článek levou rekurzi nepodporuje a ANTLR 4 umí přepsat jen přímou (Parr et al. 2014, §2.2). Nejprve levou rekurzi odstraňte.`
                : `Left-recursive non-terminals: ${compatibility.leftRecursiveRules.join(', ')} (immediate, indirect or hidden behind a nullable prefix). ALL(*) predicts and parses top-down, so the ATN closure would loop; the paper does not support left recursion and ANTLR 4 only rewrites the immediate kind (Parr et al. 2014, §2.2). Remove the left recursion first.`}
            </p>
            {onAttemptLeftRecursionRemoval && (
              <button className="btn btn-secondary btn-sm" onClick={onAttemptLeftRecursionRemoval}>
                <Sparkles size={13} style={{ marginRight: '5px' }} />
                {cz ? 'Odstranit levou rekurzi v záložce Úpravy' : 'Eliminate Left Recursion in Transformations'}
              </button>
            )}
          </div>
        )}

        <input
          type="text"
          className="grammar-textarea"
          style={{ minHeight: 'unset', height: '36px', padding: '6px 12px', marginBottom: '6px' }}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={cz ? 'Zadejte slovo pro simulaci...' : 'Enter word to simulate...'}
          aria-label={cz ? 'Slovo pro rozklad' : 'Word to parse'}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
          <TokenizedInputNote tokenized={tokenized} lang={lang} />
          <label className="precedence-switch" style={{ margin: 0, fontSize: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="checkbox" checked={detailedLookahead} onChange={e => setDetailedLookahead(e.target.checked)} />
              {cz ? 'Krokovat i predikci (jednotlivé symboly pohledu dopředu, SLL i LL)' : 'Step through prediction too (each lookahead symbol, SLL and LL)'}
            </span>
          </label>
        </div>

        <SimulatorControls label={'ALL(*)'}
          stepIdx={currentStepIdx}
          total={simulation.steps.length}
          isPlaying={isPlaying}
          speed={playSpeed}
          lang={lang}
          onStep={setCurrentStepIdx}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSpeed={setPlaySpeed}
        />
        <div className="allv-stats">
          <span>{cz ? 'Rozhodnutí' : 'Decisions'}: <strong>{simulation.decisionsMade}</strong></span>
          <span>{cz ? 'Konflikty SLL → LL' : 'SLL conflicts → LL'}: <strong>{simulation.llFallbacks}</strong></span>
          <span>{cz ? 'Nejednoznačnosti (konflikt LL)' : 'Ambiguities (LL conflict)'}: <strong>{simulation.ambiguities}</strong></span>
          <span>{cz ? 'Max. pohled dopředu' : 'Max lookahead'}: <strong>{simulation.maxLookaheadDepth}</strong> {cz ? 'symbolů' : 'symbols'}</span>
          <span>{cz ? 'Stavy ATN / rozhodovací body' : 'ATN states / decision points'}: <strong>{compatibility.atnStateCount} / {compatibility.decisionPointCount}</strong></span>
        </div>

        {/* Step explanation */}
        {currentStep && (
          <div className={`allv-step ${stepClass}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <strong>{cz ? `Krok ${currentStepIdx + 1} z ${simulation.steps.length}` : `Step ${currentStepIdx + 1} of ${simulation.steps.length}`}</strong>
              <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {modeBadge(currentStep.predictionMode, cz)}
                {currentStep.lookaheadTokens && (
                  <span className="badge badge-secondary">{cz ? 'pohled dopředu' : 'lookahead'}: [{currentStep.lookaheadTokens.join(' ')}]</span>
                )}
                {currentStep.viableAlts && (
                  <span className="badge badge-secondary">{cz ? 'alternativy' : 'alternatives'}: {'{'}{currentStep.viableAlts.join(', ')}{'}'}</span>
                )}
              </span>
            </div>
            <div>{cz ? currentStep.actionCz : currentStep.action}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>
              {cz ? 'zbývá' : 'remaining'}: {currentStep.remainingTokens.join(' ') || 'ε'} $
              {currentStep.atnStack !== undefined && <> · γ = {currentStep.atnStack}</>}
            </div>
            {currentStep.decisionEvent && (
              <div style={{ marginTop: '6px', fontSize: '12px' }}>
                <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: '11px', padding: '1px 6px', height: '22px' }}
                  onClick={() => setShowWalkthrough(!showWalkthrough)}>
                  {showWalkthrough ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {cz ? ' Průběh predikce (adaptivePredict)' : ' Prediction walkthrough (adaptivePredict)'}
                </button>
                {showWalkthrough && (
                  <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {currentStep.decisionEvent.trace?.map((tr, i) => (
                      <li key={i} style={{ marginBottom: '2px' }}>
                        <code>{tr.mode}</code> {cz ? tr.actionCz : tr.action}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}

        <div className="allv-grid">
          {/* Derivation tree */}
          <div className="allv-panel">
            <div className="allv-panel-title">
              <span>{cz ? 'Derivační strom (shora dolů)' : 'Derivation tree (top-down)'}</span>
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
              <DerivationTreeVisualizer rootNode={currentStep.derivationTree} height="420px" filename={`all_tree_step_${currentStepIdx}`} lang={lang} />
            ) : (
              <div style={{ height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                {cz ? 'Žádný strom k zobrazení' : 'No tree to display'}
              </div>
            )}
          </div>

          {/* Lookahead DFA of the active decision, as it was at this step */}
          <div className="allv-panel">
            <div className="allv-panel-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <GitBranch size={14} color="var(--color-primary)" />
                {activeDecision
                  ? (cz ? `Lookahead DFA rozhodnutí D${activeDecision.decisionNumber} (${activeDecision.nonTerminal}) v tomto kroku` : `Lookahead DFA of decision D${activeDecision.decisionNumber} (${activeDecision.nonTerminal}) at this step`)
                  : (cz ? 'Lookahead DFA' : 'Lookahead DFA')}
              </span>
              {atn.decisionPoints.length > 1 && (
                <span className="allv-tabs">
                  {atn.decisionPoints.map(dp => (
                    <button key={dp.decisionNumber}
                      className={`btn ${selectedDecisionNum === dp.decisionNumber ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setSelectedDecisionNum(dp.decisionNumber); setSelectedDfaStateId(null); }}>
                      D{dp.decisionNumber}: {dp.nonTerminal}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {!compatibility.canParse ? (
              <div className="hint-text" style={{ padding: '10px' }}>
                {cz ? 'Pro levě rekurzivní gramatiku se predikce nespouští, DFA se nevytváří.' : 'For a left-recursive grammar prediction does not run and no DFA is built.'}
              </div>
            ) : !activeDecision || !activeDfa ? (
              <div className="hint-text" style={{ padding: '10px' }}>
                {cz ? 'Gramatika nemá žádný neterminál s více pravidly, rozklad nic nepredikuje.' : 'No non-terminal has more than one production, nothing has to be predicted.'}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11.5px', marginBottom: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                  {activeDecision.alternatives.map(a => (
                    <code key={a.alt}>{a.alt}: {formatProduction(a.production)}</code>
                  ))}
                </div>
                <LookaheadDFAGraphVisualizer
                  dfa={activeDfa}
                  atn={atn}
                  upToClock={stepClock}
                  selectedStateId={selectedDfaStateId}
                  onSelectState={setSelectedDfaStateId}
                  activeStateId={activeStateId}
                  activeEdge={stepIsOnShownDecision ? currentStep?.activeEdge : undefined}
                  lang={lang}
                  height="330px"
                  filename={`all_dfa_D${activeDecision.decisionNumber}_${activeDecision.nonTerminal}`}
                />
                <div style={{ fontSize: '12px', marginTop: '6px' }}>
                  {llConfigs ? (
                    <strong>{cz
                      ? `Konfigurace LL (p, i, γ) s přesným zásobníkem – neukládají se do DFA (${llConfigs.length})`
                      : `LL configurations (p, i, γ) with exact stacks – not stored in the DFA (${llConfigs.length})`}</strong>
                  ) : inspectedState ? (
                    <strong>
                      {cz ? `Stav s${inspectedState.id}: ${dfaStateStatusLabel(inspectedState, true)}, ${inspectedState.configs.length} konfigurací (p, i, γ)` : `State s${inspectedState.id}: ${dfaStateStatusLabel(inspectedState, false)}, ${inspectedState.configs.length} configurations (p, i, γ)`}
                      {dfaStateStatus(inspectedState) === 'conflict' && (cz ? ' – konflikt: stejné (p, γ) s různými alternativami' : ' – conflict: same (p, γ) with different alternatives')}
                    </strong>
                  ) : (
                    <span className="hint-text">{cz ? 'Kliknutím na stav zobrazíte všechny jeho konfigurace. # = libovolný volající (SLL), [] = konec vstupu.' : 'Click a state to list all its configurations. # = any caller (SLL), [] = end of input.'}</span>
                  )}
                  {shownConfigs && (
                    <div className="allv-configs">
                      {shownConfigs.slice(0, MAX_INSPECTED_CONFIGS).map((c, i) => (
                        <span key={i} className="allv-config">{describeConfig(atn, c)}</span>
                      ))}
                      {shownConfigs.length > MAX_INSPECTED_CONFIGS && (
                        <span className="hint-text">{cz ? `… a dalších ${shownConfigs.length - MAX_INSPECTED_CONFIGS}` : `… and ${shownConfigs.length - MAX_INSPECTED_CONFIGS} more`}</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Step log */}
          <div className="allv-panel allv-log" ref={logRef}>
            <div style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg-surface)', padding: '6px 8px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '12.5px' }}>
              {cz ? 'Protokol kroků' : 'Step log'}
            </div>
            {simulation.steps.map((s, idx) => (
              <div key={idx} className={`allv-log-row ${idx === currentStepIdx ? 'active' : ''}`}
                onClick={() => { setCurrentStepIdx(idx); setIsPlaying(false); }}>
                <span style={{ color: 'var(--color-text-muted)' }}>#{idx + 1} </span>
                {s.predictionMode && <code style={{ fontSize: '10px' }}>{s.predictionMode} </code>}
                {cz ? s.actionCz : s.action}
              </div>
            ))}
          </div>
        </div>

        {isLastStep && <div style={{ marginTop: '10px' }}>{outcomeBanner()}</div>}
      </div>

      {/* Lookahead DFA cache table (state at the shown step) */}
      {compatibility.canParse && activeDecision && visibleDfa && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={16} color="var(--color-primary)" />
              {cz ? `Mezipaměť lookahead DFA rozhodnutí D${activeDecision.decisionNumber} (${activeDecision.nonTerminal}) – tabulka stavů` : `Lookahead DFA cache of decision D${activeDecision.decisionNumber} (${activeDecision.nonTerminal}) – state table`}
            </span>
          </div>
          <p className="hint-text" style={{ marginBottom: '8px' }}>
            {cz
              ? 'Stav DFA je množina konfigurací ATN (p, i, γ): stav ATN zapsaný jako položka s tečkou, číslo predikované alternativy a zásobník návratových stavů (# = libovolný volající v režimu SLL). Tabulka ukazuje DFA ve zvoleném kroku; stavy a hrany vznikají až při predikci na skutečném vstupu.'
              : 'A DFA state is a set of ATN configurations (p, i, γ): the ATN state written as a dotted item, the predicted alternative and the stack of return states (# = any caller in SLL mode). The table shows the DFA at the shown step; states and edges appear only when prediction meets real input.'}
          </p>
          <div className="table-responsive">
            <table className="data-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '70px' }}>{cz ? 'Stav' : 'State'}</th>
                  <th>{cz ? 'Konfigurace (p, i, γ)' : 'Configurations (p, i, γ)'}</th>
                  <th style={{ width: '160px' }}>{cz ? 'Přechody' : 'Transitions'}</th>
                  <th style={{ width: '150px' }}>{cz ? 'Výsledek' : 'Outcome'}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDfa.states.map(s => {
                  const edges = visibleDfa.edges.filter(e => e.from === s.id);
                  const status = dfaStateStatus(s);
                  return (
                    <tr key={s.id} onClick={() => setSelectedDfaStateId(s.id)}
                      style={{ cursor: 'pointer', backgroundColor: (selectedDfaStateId ?? activeStateId) === s.id ? 'var(--color-primary-subtle)' : undefined }}>
                      <td><strong>s{s.id}</strong>{s.id === activeDfa?.startStateId && <span className="badge badge-secondary" style={{ fontSize: '10px', marginLeft: '4px' }}>D0</span>}</td>
                      <td>
                        <div style={{ maxHeight: '64px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
                          {s.configs.slice(0, MAX_INSPECTED_CONFIGS).map(c => describeConfig(atn, c)).join('  ')}
                          {s.configs.length > MAX_INSPECTED_CONFIGS && ` … (+${s.configs.length - MAX_INSPECTED_CONFIGS})`}
                        </div>
                      </td>
                      <td>
                        {edges.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>—</span> : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {edges.map(e => (
                              <span key={e.symbol} className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                {displaySymbol(e.symbol)} → s{e.to}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${status === 'accept' ? 'badge-success' : status === 'conflict' ? 'badge-warning' : 'badge-secondary'}`} style={{ fontSize: '11px' }}>
                          {dfaStateStatusLabel(s, cz)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* About ALL(*) */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={18} color="var(--color-primary)" />
          {cz ? 'ALL(*) – adaptivní analýza LL(*) (ANTLR 4)' : 'ALL(*) – Adaptive LL(*) parsing (ANTLR 4)'}
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>
          {cz
            ? 'ALL(*) je analýza shora dolů (rekurzivní sestup), která na každém neterminálu s více pravidly zavolá predikci adaptivePredict. Ta nepoužívá rozkladovou tabulku s pevným k: simuluje síť ATN na skutečném vstupu tak daleko, jak je potřeba, a výsledky ukládá do lookahead DFA. Pro každou gramatiku bez levé rekurze rozpozná přesně jazyk L(G) (Parr, Harwell, Fisher 2014, Věta 6.1); u nejednoznačné gramatiky vybere jeden strom.'
            : 'ALL(*) is top-down (recursive-descent) parsing that calls the prediction adaptivePredict at every non-terminal with several productions. Instead of a parsing table with a fixed k it simulates the ATN on the actual input as far as needed and caches the results in a lookahead DFA. For every grammar without left recursion it recognizes exactly L(G) (Parr, Harwell, Fisher 2014, Theorem 6.1); for an ambiguous grammar it chooses one tree.'}
        </p>

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

        {showTheoryGuide && (
          <div style={{ marginTop: '14px', padding: '14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {[
                {
                  titleCz: '1. Síť ATN a rozklad (§4.3, §5.2, Function 1)',
                  titleEn: '1. ATN and the parser (§4.3, §5.2, Function 1)',
                  cz: 'Každý neterminál A má podsíť p_A → p_A,i → … → p\'_A: pro každé pravidlo cestu se stavem před každým symbolem pravé strany (položka s tečkou). Terminál je hrana se symbolem, neterminál B hrana p –B→ q, která si pamatuje návratový stav q. Analyzátor jde po pravidlech shora dolů, terminály porovnává se vstupem a při volání B uloží q na zásobník volání γ.',
                  en: 'Every non-terminal A has a submachine p_A → p_A,i → … → p\'_A: for every production a path with a state before each right-hand-side symbol (a dotted item). A terminal is an edge labelled with it, a non-terminal B an edge p –B→ q that remembers the return state q. The parser follows productions top-down, matches terminals against the input and pushes q on the call stack γ when it calls B.'
                },
                {
                  titleCz: '2. Predikce SLL a lookahead DFA (§3, §4.4, Function 4–5)',
                  titleEn: '2. SLL prediction and the lookahead DFA (§3, §4.4, Function 4–5)',
                  cz: 'Predikce simuluje všechny alternativy současně jako konfigurace (p, i, γ). Režim SLL (Strong LL) nezná volajícího: zásobník je # a na konci A pokračuje u všech míst volání A (obdoba množiny FOLLOW). Stavy DFA jsou množiny konfigurací po přečtení symbolu (move + uzávěr). Vznikají až pro symboly, které se na vstupu skutečně objeví, a hrany se ukládají: další stejné rozhodnutí už jen projde existující hrany DFA. Predikce končí, když všechny konfigurace předpovídají stejnou alternativu.',
                  en: 'Prediction simulates all alternatives at once as configurations (p, i, γ). SLL (Strong LL) does not know the caller: the stack is # and at the end of A it continues at every call site of A (like the FOLLOW set). DFA states are configuration sets after reading a symbol (move + closure). They are created only for symbols that really occur in the input and the edges are cached: a later identical decision just follows existing DFA edges. Prediction stops when all configurations predict the same alternative.'
                },
                {
                  titleCz: '3. Konflikt SLL → plné LL, nejednoznačnost (§3.1, §5.3, Function 6, 8, 9)',
                  titleEn: '3. SLL conflict → full LL, ambiguity (§3.1, §5.3, Function 6, 8, 9)',
                  cz: 'Konflikt nastane, když konfigurace se stejným (p, γ) předpovídají různé alternativy a žádný stav ATN nepředpovídá jedinou – další pohled dopředu nepomůže. SLL pak neví, zda jde o nejednoznačnost, nebo o rozhodnutí závislé na volajícím (např. S → x B | y C, B → A a, C → A b a, A → b | ε: na vstupu „b a“ rozhodne až volající). Proto se predikce zopakuje v režimu LL se skutečným zásobníkem γ0 (výsledek se do DFA neukládá). Konflikt i v LL znamená nejednoznačnost vstupu: zvolí se nejmenší alternativa.',
                  en: 'A conflict occurs when configurations with the same (p, γ) predict different alternatives and no ATN state predicts just one – more lookahead cannot help. SLL then cannot tell an ambiguity from a decision that depends on the caller (e.g. S → x B | y C, B → A a, C → A b a, A → b | ε: on input "b a" only the caller decides). So prediction is repeated in LL mode with the real stack γ0 (the result is not cached in the DFA). A conflict in LL as well means the input is ambiguous: the minimum alternative is chosen.'
                },
                {
                  titleCz: '4. Levá rekurze a správnost (§2.2, §6)',
                  titleEn: '4. Left recursion and correctness (§2.2, §6)',
                  cz: 'Pro gramatiku bez levé rekurze ALL(*) přijme slovo, právě když patří do L(G) (Věta 6.1). Levá rekurze (A ⇒+ A α, přímá, nepřímá i skrytá) podporována není: uzávěr by se zacyklil. ANTLR 4 před generováním přepisuje jen přímou levou rekurzi; zde je nutné ji odstranit v záložce Úpravy. ANTLR navíc nejdřív zkouší celý vstup jen v SLL a LL použije až při chybě (dvoufázový rozklad, §3.2); tento simulátor používá optimalizované LL pro každé rozhodnutí.',
                  en: 'For a grammar without left recursion ALL(*) accepts a word iff it is in L(G) (Theorem 6.1). Left recursion (A ⇒+ A α: immediate, indirect or hidden) is not supported: the closure would loop. ANTLR 4 rewrites only immediate left recursion before generating the parser; here it has to be removed in the Transformations tab. ANTLR also first parses the whole input in SLL-only mode and uses LL only after an error (two-stage parsing, §3.2); this simulator uses optimized LL per decision.'
                }
              ].map(p => (
                <div key={p.titleEn} style={{ padding: '10px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>{cz ? p.titleCz : p.titleEn}</strong>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>{cz ? p.cz : p.en}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '14px' }}>
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>
                {cz ? 'Srovnání syntaktických analyzátorů:' : 'Comparison of parsers:'}
              </strong>
              <div className="table-responsive">
                <table className="data-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>{cz ? 'Analyzátor' : 'Parser'}</th>
                      <th>{cz ? 'Směr' : 'Direction'}</th>
                      <th>{cz ? 'Pohled dopředu' : 'Lookahead'}</th>
                      <th>{cz ? 'Konstrukce' : 'Construction'}</th>
                      <th>{cz ? 'Levá rekurze' : 'Left recursion'}</th>
                      <th>{cz ? 'Konflikty' : 'Conflicts'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>LL(1)</strong></td>
                      <td>{cz ? 'shora dolů' : 'top-down'}</td>
                      <td>k = 1</td>
                      <td>{cz ? 'rozkladová tabulka M[A, a] z FIRST/FOLLOW' : 'parsing table M[A, a] from FIRST/FOLLOW'}</td>
                      <td>{cz ? 'nepodporuje' : 'not supported'}</td>
                      <td>{cz ? 'gramatika není LL(1)' : 'grammar is not LL(1)'}</td>
                    </tr>
                    <tr>
                      <td><strong>LL(k)</strong></td>
                      <td>{cz ? 'shora dolů' : 'top-down'}</td>
                      <td>{cz ? 'pevné k' : 'fixed k'}</td>
                      <td>{cz ? 'tabulka s řetězci délky k (až |T|^k sloupců)' : 'table over strings of length k (up to |T|^k columns)'}</td>
                      <td>{cz ? 'nepodporuje' : 'not supported'}</td>
                      <td>{cz ? 'gramatika není LL(k)' : 'grammar is not LL(k)'}</td>
                    </tr>
                    <tr>
                      <td><strong>LR(1) / LALR(1)</strong></td>
                      <td>{cz ? 'zdola nahoru' : 'bottom-up'}</td>
                      <td>k = 1</td>
                      <td>{cz ? 'automat LR položek, tabulky ACTION/GOTO' : 'LR item automaton, ACTION/GOTO tables'}</td>
                      <td>{cz ? 'podporuje' : 'supported'}</td>
                      <td>{cz ? 'konflikty přesun/redukce a redukce/redukce' : 'shift/reduce and reduce/reduce conflicts'}</td>
                    </tr>
                    <tr style={{ backgroundColor: 'var(--color-primary-subtle)' }}>
                      <td><strong>ALL(*)</strong></td>
                      <td>{cz ? 'shora dolů' : 'top-down'}</td>
                      <td>{cz ? 'libovolně dlouhý, určený za běhu' : 'any length, decided at run time'}</td>
                      <td>{cz ? 'síť ATN + lookahead DFA budované za běhu' : 'ATN + lookahead DFA built at run time'}</td>
                      <td>{cz ? 'nepodporuje (ANTLR 4 přepisuje přímou)' : 'not supported (ANTLR 4 rewrites immediate)'}</td>
                      <td>{cz ? 'konflikt SLL → LL; nejednoznačnost → nejmenší alternativa' : 'SLL conflict → LL; ambiguity → minimum alternative'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
