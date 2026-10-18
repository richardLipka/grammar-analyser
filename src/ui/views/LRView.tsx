import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { LRTable, LRAction, LRLayout, LR0_ACTION_COLUMN, formatLayoutAction, stateLabel } from '../../core/lr/lrTable';
import { simulateLRParse, LRParseStep, LRSimulationResult } from '../../core/lr/lrParser';
import { simulateGLRParse, GLRSimulationResult, GLRParseStep } from '../../core/lr/glrParser';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { GSSGraphVisualizer } from '../visualizer/GSSGraphVisualizer';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { CheckCircle2, AlertTriangle, Cpu, XCircle, Sparkles, ExternalLink, GitFork, Network, Layers, X } from 'lucide-react';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText } from '../components/Symbols';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { LRLayoutSwitch } from '../components/LRLayoutSwitch';
import { exportLRTableToLatex, exportParseTreeToTikz } from '../../core/export/latexExport';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { InfoButton } from '../components/TransformationInfo';
import { InfoKey } from '../../core/processor/transformationInfo';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { ReferenceBar } from '../components/ReferenceBar';
import { ConflictCounterexample } from '../components/ConflictCounterexample';
import { createCounterexampleFinder } from '../../core/lr/lrCounterexample';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'IELR(1)' | 'LR(1)';

/** Primary literature references for each LR automaton & parsing algorithm */
export const LR_PRIMARY_REFERENCES: Record<LRVariantName, { authorYear: string; citation: string; url?: string }> = {
  'LR(0)': {
    authorYear: 'Knuth (1965)',
    citation: 'Knuth, D. E.: On the translation of languages from left to right. Information and Control 8(6), 607–639, 1965.',
    url: 'https://doi.org/10.1016/S0019-9958(65)90426-2'
  },
  'SLR(1)': {
    authorYear: 'DeRemer (1969, 1971)',
    citation: 'DeRemer, F. L.: Simple LR(k) grammars. Communications of the ACM 14(7), 453–460, 1971.',
    url: 'https://doi.org/10.1145/362619.362625'
  },
  'LALR(1)': {
    authorYear: 'DeRemer (1969), Aho & Ullman (1972)',
    citation: 'DeRemer, F. L.: Practical Translators for LR(k) Languages. Ph.D. thesis, MIT, 1969; Dragon Book (Alg. 4.62 & 4.63).',
    url: 'https://dspace.mit.edu/handle/1721.1/13857'
  },
  'IELR(1)': {
    authorYear: 'Denny & Malloy (2008, 2010)',
    citation: 'Denny, J. E., Malloy, B. A.: The IELR(1) algorithm for generating minimal LR(1) parser tables for non-LR(1) grammars with conflict resolution. Science of Computer Programming 75(11), 943–979, 2010.',
    url: 'https://doi.org/10.1016/j.scico.2009.09.006'
  },
  'LR(1)': {
    authorYear: 'Knuth (1965)',
    citation: 'Knuth, D. E.: On the translation of languages from left to right. Information and Control 8(6), 607–639, 1965.',
    url: 'https://doi.org/10.1016/S0019-9958(65)90426-2'
  }
};

/** Primary literature references for all LR algorithms, automata and conflict resolution techniques */
export const LR_TECHNIQUE_REFERENCES = [
  {
    authorYear: 'Knuth (1965)',
    topicEn: 'LR(0) / LR(1) Foundations',
    topicCz: 'Základy LR(0) a LR(1)',
    citation: 'Knuth, D. E.: On the translation of languages from left to right. Information and Control 8(6), 607–639, 1965.',
    url: 'https://doi.org/10.1016/S0019-9958(65)90426-2'
  },
  {
    authorYear: 'DeRemer (1971)',
    topicEn: 'SLR(1) Grammars',
    topicCz: 'SLR(1) gramatiky',
    citation: 'DeRemer, F. L.: Simple LR(k) grammars. Communications of the ACM 14(7), 453–460, 1971.',
    url: 'https://doi.org/10.1145/362619.362625'
  },
  {
    authorYear: 'DeRemer (1969), DeRemer & Pennello (1982)',
    topicEn: 'LALR(1) Lookahead Sets',
    topicCz: 'Výpočet symbolů dopředu pro LALR(1)',
    citation: 'DeRemer, F. L., Pennello, T. J.: Efficient computation of LALR(1) look-ahead sets. ACM TOPLAS 4(4), 615–649, 1982.',
    url: 'https://doi.org/10.1145/69622.357187'
  },
  {
    authorYear: 'Aho, Johnson & Ullman (1975)',
    topicEn: 'Precedence & Associativity Resolution',
    topicCz: 'Řešení konfliktů prioritami a asociativitou',
    citation: 'Aho, A. V., Johnson, S. C., Ullman, J. D.: Deterministic parsing of ambiguous grammars. Communications of the ACM 18(8), 441–452, 1975.',
    url: 'https://doi.org/10.1145/360933.360969'
  },
  {
    authorYear: 'Denny & Malloy (2010)',
    topicEn: 'IELR(1) Inadequacy Elimination',
    topicCz: 'IELR(1) – odstranění kolizí vzniklých slučováním stavů',
    citation: 'Denny, J. E., Malloy, B. A.: The IELR(1) algorithm for generating minimal LR(1) parser tables for non-LR(1) grammars with conflict resolution. Science of Computer Programming 75(11), 943–979, 2010.',
    url: 'https://doi.org/10.1016/j.scico.2009.09.006'
  },
  {
    authorYear: 'Pager (1977)',
    topicEn: 'Weak Compatibility & Minimal LR(1)',
    topicCz: 'Slabá kompatibilita a minimální LR(1)',
    citation: 'Pager, D.: A practical general method for constructing LR(k) parsers. Acta Informatica 7(3), 249–268, 1977.',
    url: 'https://doi.org/10.1007/BF00290336'
  },
  {
    authorYear: 'Aho & Johnson (1974)',
    topicEn: 'Shift-Reduce Parsing Algorithm',
    topicCz: 'Algoritmus analýzy přesun-redukce',
    citation: 'Aho, A. V., Johnson, S. C.: LR parsing. ACM Computing Surveys 6(2), 99–124, 1974.',
    url: 'https://doi.org/10.1145/356628.356629'
  },
  {
    authorYear: 'Tomita (1985)',
    topicEn: 'Generalized LR (GLR) & Graph-Structured Stack',
    topicCz: 'Zobecněný LR (GLR) a Graph-Structured Stack',
    citation: 'Tomita, M.: Efficient Parsing for Natural Language: A Generalized LR Parser. Kluwer Academic Publishers, Boston, 1985.',
    url: 'https://doi.org/10.1007/978-1-4613-2575-8'
  },
  {
    authorYear: 'Scott & Johnstone (2006)',
    topicEn: 'Right Nulled GLR (RNGLR) Parsing',
    topicCz: 'Algoritmus RNGLR pro obecné bezkontextové gramatiky',
    citation: 'Scott, E., Johnstone, A.: Right Nulled Generalized LR Parsers. ACM Transactions on Programming Languages and Systems (TOPLAS) 28(4), 577–618, 2006.',
    url: 'https://doi.org/10.1145/1146809.1146810'
  }
];

/** Rows of the parsing table shown before "show all". */
const TABLE_ROW_LIMIT = 300;

interface LRViewProps {
  grammar: Grammar;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  ielr1Table?: LRTable;
  /** Missing when the computation was stopped before it */
  lr1Table?: LRTable;
  /** The tables without the precedence declarations (only when the grammar has some) */
  rawTables?: Partial<Record<LRVariantName, LRTable>>;
  defaultInput?: string;
  lang: Language;
  selectedVariant?: LRVariantName;
  onSelectVariant?: (variant: LRVariantName) => void;
  layout: LRLayout;
  onLayoutChange: (layout: LRLayout) => void;
  onAttemptLR?: () => void;
  onShowInfo?: (key: InfoKey) => void;
  lr0Automaton?: LRAutomaton;
  slr1Automaton?: LRAutomaton;
  lalr1Automaton?: LRAutomaton;
  ielr1Automaton?: LRAutomaton;
  lr1Automaton?: LRAutomaton;
}

export const LRView: React.FC<LRViewProps> = ({
  grammar,
  lr0Table,
  slr1Table,
  lalr1Table,
  ielr1Table,
  lr1Table,
  rawTables,
  defaultInput = '',
  lang,
  selectedVariant: controlledVariant,
  onSelectVariant,
  layout,
  onLayoutChange,
  onAttemptLR,
  onShowInfo,
  lr0Automaton,
  slr1Automaton,
  lalr1Automaton,
  ielr1Automaton,
  lr1Automaton
}) => {
  const t = TRANSLATIONS[lang];
  const [internalVariant, setInternalVariant] = useState<LRVariantName>('SLR(1)');
  const selectedVariant = controlledVariant ?? internalVariant;
  const setSelectedVariant = (v: LRVariantName) => (onSelectVariant ? onSelectVariant(v) : setInternalVariant(v));
  const [inputText, setInputText] = useState(defaultInput);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Large tables show their first rows unless asked for all (rendering thousands of rows blocks the page)
  const [showAllRows, setShowAllRows] = useState(false);
  // Precedence declarations resolve conflicts (as in Yacc); switched off, the raw table is shown
  const [usePrecedence, setUsePrecedence] = useState(true);
  const hasPrecedence = !!rawTables && Object.keys(rawTables).length > 0;
  const tables: Record<LRVariantName, LRTable | undefined> = {
    'LR(0)': lr0Table,
    'SLR(1)': slr1Table,
    'LALR(1)': lalr1Table,
    'IELR(1)': ielr1Table,
    'LR(1)': lr1Table
  };
  const resolvedTable = tables[selectedVariant];
  const missing = resolvedTable === undefined;
  const activeTable: LRTable = (!usePrecedence && rawTables?.[selectedVariant]) || resolvedTable || lalr1Table;
  const lecture = layout === 'lecture';

  // Words written without spaces (aabb, id+id) are split into terminals
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const simulation: LRSimulationResult = useMemo(
    () => simulateLRParse(tokenized.tokens, grammar, activeTable, layout),
    [tokenized, grammar, activeTable, layout]
  );

  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  useEffect(() => {
    const row = traceRef.current?.querySelector('.trace-row-active') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentStepIdx]);

  // GLR Simulator State
  const [parserMode, setParserMode] = useState<'standard' | 'glr'>('standard');
  const [selectedTreeIdx, setSelectedTreeIdx] = useState<number>(0);
  const [currentGLRStepIdx, setCurrentGLRStepIdx] = useState<number>(0);
  const [isGLRPlaying, setIsGLRPlaying] = useState<boolean>(false);
  const [glrPlaySpeed, setGLRPlaySpeed] = useState<number>(700);
  const glrTraceRef = useRef<HTMLDivElement>(null);

  // The automaton of the table shown (state ids must match): without precedence,
  // IELR(1) has its own automaton (built with the default conflict resolution only)
  const activeAutomaton = activeTable.automaton ?? ((
    selectedVariant === 'LR(0)' ? lr0Automaton
      : selectedVariant === 'LR(1)' ? lr1Automaton
        : selectedVariant === 'IELR(1)' ? (ielr1Table ? ielr1Automaton : lalr1Automaton)
          : lalr1Automaton
  ) || slr1Automaton || lr0Automaton);
  const [selectedGSSNodeId, setSelectedGSSNodeId] = useState<number | null>(null);
  // Conflict counterexamples (Isradisaikul & Myers 2015), searched when a conflict's panel is opened
  const counterexampleAutomaton = activeTable.automaton ?? activeAutomaton;
  const counterexampleFinder = useMemo(
    () => (counterexampleAutomaton ? createCounterexampleFinder(grammar, counterexampleAutomaton) : undefined),
    [grammar, counterexampleAutomaton]
  );

  const glrSimulation: GLRSimulationResult = useMemo(
    () => simulateGLRParse(tokenized.tokens, grammar, activeTable, layout, 300, 25, activeAutomaton),
    [tokenized, grammar, activeTable, layout, activeAutomaton]
  );

  useEffect(() => {
    setCurrentGLRStepIdx(0);
    setIsGLRPlaying(false);
    setSelectedTreeIdx(0);
    setSelectedGSSNodeId(null);
  }, [glrSimulation]);

  useAutoPlay(isGLRPlaying, currentGLRStepIdx, glrSimulation.steps.length, glrPlaySpeed, setCurrentGLRStepIdx, () => setIsGLRPlaying(false));

  useEffect(() => {
    const row = glrTraceRef.current?.querySelector('.trace-row-active') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [currentGLRStepIdx]);

  const currentGLRStep: GLRParseStep | undefined = glrSimulation.steps[currentGLRStepIdx];
  const glrActiveTree = glrSimulation.trees.length > 0 ? glrSimulation.trees[Math.min(selectedTreeIdx, glrSimulation.trees.length - 1)] : undefined;
  const currentSnapshot = currentGLRStep ? currentGLRStep.gssSnapshot : glrSimulation.gssFinal;
  const selectedGSSNode = selectedGSSNodeId !== null ? currentSnapshot.nodes.find(n => n.id === selectedGSSNodeId) : null;
  const incomingGSSEdges = selectedGSSNodeId !== null ? currentSnapshot.edges.filter(e => e.fromId === selectedGSSNodeId) : [];
  const outgoingGSSEdges = selectedGSSNodeId !== null ? currentSnapshot.edges.filter(e => e.toId === selectedGSSNodeId) : [];
  const gssHighlightedTreeIds = useMemo(() => {
    if (!selectedGSSNode) return undefined;
    return new Set(incomingGSSEdges.flatMap(e => e.treeIds));
  }, [selectedGSSNode, incomingGSSEdges]);

  const currentStep: LRParseStep | undefined = simulation.steps[currentStepIdx];
  const actionText = (s: LRParseStep) => (lang === 'cz' ? s.actionCz || s.action : s.action);

  // The two layouts: lecture f/g with named states, Dragon Book ACTION/GOTO with numbers
  const name = (state: number) => stateLabel(activeTable, state, layout);
  const actColumns = lecture ? activeTable.fColumns : activeTable.terminals;
  const actTable = lecture ? activeTable.fTable : activeTable.actionTable;
  const trColumns = lecture ? activeTable.gColumns : activeTable.nonTerminals;
  const trTable = lecture ? activeTable.gTable : activeTable.gotoTable;
  const conflicts = lecture ? activeTable.fConflicts : activeTable.conflicts;
  const conflictCells = new Set(conflicts.map(c => `${c.stateId}|${c.symbol}`));
  const resolvedCells = new Map(activeTable.resolvedConflicts.map(r => [`${r.stateId}|${r.symbol}`, r] as const));
  const cz = lang === 'cz';
  const fmt = (a: LRAction) => formatLayoutAction(a, layout, lang);
  const actionCellName = (state: number, col: string) =>
    lecture ? (col === LR0_ACTION_COLUMN ? `f(${name(state)})` : `f(${name(state)}, ${col})`) : `ACTION[${state}, ${col}]`;
  const transitionCellName = (state: number, sym: string) => (lecture ? `g(${name(state)}, ${sym})` : `GOTO[${state}, ${sym}]`);

  /** Lecture: the named states read like the sentential form (# E₁ + T₂); Dragon Book: $ 0 E 1 + 6 … */
  const stackText = (s: LRParseStep) =>
    lecture
      ? s.stateStack.map(name).join(' ')
      : s.stateStack.map((st, i) => `${s.symbolStack[i]} ${st}`).join(' ');

  return (
    <div>
      <LRLayoutSwitch layout={layout} onChange={onLayoutChange} lang={lang} />

      {/* Parsing table (f/g or ACTION/GOTO) with the conflicts */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{t.lrTableTitle.replace('{variant}', selectedVariant)}</span>
            <Cpu size={18} color="var(--color-primary)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} role="group" aria-label={t.variant}>
              {(['LR(0)', 'SLR(1)', 'LALR(1)', 'IELR(1)', 'LR(1)'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  aria-pressed={selectedVariant === v}
                  onClick={() => setSelectedVariant(v)}
                  title={tables[v] ? undefined : (cz ? 'Nespočteno – výpočet byl zastaven' : 'Not computed – the computation was stopped')}
                >
                  {v}
                </button>
              ))}
            </div>

            <LatexExportButton
              getLatex={() => exportLRTableToLatex(activeTable, lang, layout)}
              filename={`${selectedVariant.toLowerCase().replace(/[^a-z0-9]/g, '_')}_table.tex`}
              label={lang === 'cz' ? 'Export tabulky' : 'Export Table'}
              lang={lang}
              title={lang === 'cz' ? `Exportovat tabulku ${selectedVariant} jako LaTeX` : `Export ${selectedVariant} table as LaTeX`}
            />
          </div>
        </div>
        <p className="hint-text" style={{ marginBottom: '6px' }}>{t.lrVariantHints[selectedVariant]}</p>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{cz ? 'Primární literatura:' : 'Primary literature:'}</span>
          <span>{LR_PRIMARY_REFERENCES[selectedVariant].citation}</span>
          {LR_PRIMARY_REFERENCES[selectedVariant].url && (
            <a href={LR_PRIMARY_REFERENCES[selectedVariant].url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
              [DOI/Link]
            </a>
          )}
        </div>

        {missing && (
          <div className="notice-box warning" style={{ marginBottom: '12px' }}>
            <div className="notice-title">
              <AlertTriangle size={15} />
              <span>
                {cz
                  ? `Tabulka ${selectedVariant} nebyla spočtena: výpočet byl zastaven. Zobrazena je tabulka LALR(1); úplnou analýzu spustí tlačítko Přepočítat.`
                  : `The ${selectedVariant} table was not computed: the computation was stopped. The LALR(1) table is shown; the Recalculate button starts the full analysis.`}
              </span>
            </div>
          </div>
        )}

        {hasPrecedence && selectedVariant !== 'LR(0)' && (
          <div className="precedence-switch">
            <label>
              <input type="checkbox" checked={usePrecedence} onChange={e => setUsePrecedence(e.target.checked)} />
              <span>{cz ? 'Použít priority a asociativitu (%left, %right, %nonassoc, %prec)' : 'Use precedence and associativity (%left, %right, %nonassoc, %prec)'}</span>
            </label>
            {usePrecedence && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>{cz ? 'Teoretický základ (primární literatura): ' : 'Theoretical foundation (primary literature): '}</span>
                <span>Aho, Johnson & Ullman (1975): Deterministic parsing of ambiguous grammars (CACM 18(8), pp. 441–452). </span>
                <a href="https://doi.org/10.1145/360933.360969" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>[DOI]</a>
              </div>
            )}
            {usePrecedence && activeTable.resolvedConflicts.length > 0 && (
              <details className="resolved-list">
                <summary>
                  {cz
                    ? `Konflikty vyřešené prioritami: ${activeTable.resolvedConflicts.length}`
                    : `Conflicts resolved by precedence: ${activeTable.resolvedConflicts.length}`}
                </summary>
                <ul>
                  {activeTable.resolvedConflicts.map((r, i) => (
                    <li key={i}>
                      <code>{actionCellName(r.stateId, r.symbol)}</code>: {r.actions.map(fmt).join(' / ')} → <strong>{r.chosen ? fmt(r.chosen) : (cz ? 'chyba' : 'error')}</strong>
                      <div className="resolved-reason">{cz ? r.reason.cz : r.reason.en}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          {conflicts.length > 0 ? (
            <div className="notice-box error">
              <div className="notice-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={15} />
                  {t.conflictsInVariant.replace('{variant}', selectedVariant).replace('{count}', conflicts.length.toString())}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  {t.statesCount} <strong>{activeTable.states.length}</strong> • {t.conflictCellsHighlighted}
                </span>
              </div>
              {onAttemptLR && (
                <div className="ll1-attempt-row" style={{ marginTop: '8px' }}>
                  <button type="button" className="btn btn-accent" onClick={onAttemptLR} title={t.hintLR}>
                    <Sparkles size={14} />
                    <span>{t.lrAttemptButton}</span>
                  </button>
                  {onShowInfo && <InfoButton lang={lang} onClick={() => onShowInfo('lr')} />}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {conflicts.map((c, idx) => (
                  <div key={idx} className="conflict-detail-card" style={{ color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
                        {c.type === 'Shift/Reduce' ? t.shiftReduceConflict : t.reduceReduceConflict}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                        <strong>{actionCellName(c.stateId, c.symbol)}</strong>
                      </span>
                    </div>
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{t.conflictingActions}:</span>
                      {c.actions.map((act, actIdx) => (
                        <span key={actIdx} className="rule-chip" style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' }}>
                          <strong>{fmt(act)}</strong>
                          {act.production && <> ({formatProduction(act.production)})</>}
                          {act.type === 'shift' && !lecture && <> ({t.shiftTo} {act.targetState})</>}
                        </span>
                      ))}
                    </div>
                    {counterexampleFinder && (
                      <ConflictCounterexample
                        key={`${selectedVariant}|${usePrecedence}|${c.stateId}|${c.symbol}`}
                        conflict={c}
                        finder={counterexampleFinder}
                        variant={activeTable.variant}
                        stateName={name(c.stateId)}
                        lang={lang}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="report-box success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} />
                {t.noLRConflicts.replace('{variant}', selectedVariant)}
                {activeTable.resolvedConflicts.length > 0 && (cz
                  ? ` (díky prioritám; vyřešeno konfliktů: ${activeTable.resolvedConflicts.length})`
                  : ` (thanks to the precedence; ${activeTable.resolvedConflicts.length} conflict(s) resolved)`)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                {t.statesCount} <strong>{activeTable.states.length}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Table entries used by the current step */}
        {currentStep?.lookupState !== undefined && currentStep.lookupSymbol !== undefined && (
          <div className="active-lookup-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{t.activeTableLookup}</span>
              <span className="active-lookup-badge">{actionCellName(currentStep.lookupState, currentStep.lookupSymbol)}</span>
              {currentStep.gotoSymbol && currentStep.gotoFromState !== undefined && (
                <span>
                  <span className="active-lookup-badge">{transitionCellName(currentStep.gotoFromState, currentStep.gotoSymbol)}</span>
                  {currentStep.gotoState !== undefined && <> = {name(currentStep.gotoState)}</>}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '60px', textAlign: 'center' }}>{t.stateLabel}</th>
                <th colSpan={actColumns.length} style={{ textAlign: 'center' }}>{lecture ? t.fTableTitle : 'ACTION'}</th>
                <th colSpan={trColumns.length} className="table-part-start" style={{ textAlign: 'center' }}>{lecture ? t.gTableTitle : 'GOTO'}</th>
              </tr>
              <tr>
                {actColumns.map(col => (
                  <th key={`a_${col}`} className={currentStep?.lookupSymbol === col ? 'table-col-active' : ''} style={{ textAlign: 'center' }}>
                    {col === LR0_ACTION_COLUMN ? t.lr0ActionColumn : <code>{col}</code>}
                  </th>
                ))}
                {trColumns.map((sym, i) => (
                  <th
                    key={`g_${sym}`}
                    className={[currentStep?.gotoSymbol === sym ? 'table-col-active' : '', i === 0 ? 'table-part-start' : ''].join(' ')}
                    style={{ textAlign: 'center', color: grammar.nonTerminals.has(sym) ? 'var(--color-primary)' : undefined }}
                  >
                    <code>{sym}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(showAllRows ? activeTable.states : activeTable.states.slice(0, TABLE_ROW_LIMIT)).map(s => {
                const actRow = actTable.get(s);
                const trRow = trTable.get(s);
                const isRowActive = currentStep?.lookupState === s;
                const isTransitionRow = currentStep?.gotoFromState === s && currentStep?.gotoSymbol !== undefined;

                return (
                  <tr key={s} className={isRowActive ? 'table-row-active' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{name(s)}</td>
                    {actColumns.map(col => {
                      const actions = actRow?.get(col) || [];
                      const isConflict = conflictCells.has(`${s}|${col}`);
                      const resolved = resolvedCells.get(`${s}|${col}`);
                      const isCellActive = isRowActive && currentStep?.lookupSymbol === col;
                      const isAccept = actions.some(a => a.type === 'accept');
                      return (
                        <td
                          key={`a_${col}`}
                          className={[isCellActive ? 'table-cell-active' : '', resolved ? 'cell-resolved' : ''].join(' ')}
                          title={resolved ? `${resolved.actions.map(fmt).join(' / ')} → ${resolved.chosen ? fmt(resolved.chosen) : (cz ? 'chyba' : 'error')}: ${cz ? resolved.reason.cz : resolved.reason.en}` : undefined}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            whiteSpace: 'nowrap',
                            backgroundColor: isCellActive ? undefined : isConflict ? 'var(--color-danger-subtle)' : undefined,
                            color: isCellActive ? '#ffffff' : isConflict ? 'var(--color-danger)' : isAccept ? 'var(--color-success)' : undefined,
                            fontWeight: isCellActive || isConflict || isAccept ? 700 : 400
                          }}
                        >
                          {actions.length > 0 ? actions.map(fmt).join(' / ') : resolved ? '∅' : ''}
                        </td>
                      );
                    })}
                    {trColumns.map((sym, i) => {
                      const target = trRow?.get(sym);
                      const isCellActive = isTransitionRow && currentStep?.gotoSymbol === sym;
                      return (
                        <td
                          key={`g_${sym}`}
                          className={[isCellActive ? 'table-cell-active' : '', i === 0 ? 'table-part-start' : ''].join(' ')}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11.5px',
                            whiteSpace: 'nowrap',
                            color: isCellActive ? '#ffffff' : 'var(--color-primary)',
                            fontWeight: isCellActive ? 700 : 600
                          }}
                        >
                          {target !== undefined ? name(target) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!showAllRows && activeTable.states.length > TABLE_ROW_LIMIT && (
          <div className="table-row-limit">
            <span>
              {cz
                ? `Zobrazeno prvních ${TABLE_ROW_LIMIT} z ${activeTable.states.length} stavů (vykreslení celé tabulky chvíli trvá).`
                : `Showing the first ${TABLE_ROW_LIMIT} of ${activeTable.states.length} states (drawing the whole table takes a while).`}
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAllRows(true)}>
              {cz ? 'Zobrazit všechny řádky' : 'Show all rows'}
            </button>
          </div>
        )}
        <div className="hint-text" style={{ marginTop: '8px' }}>
          {lecture ? t.lrLegendLecture : t.lrLegend}
          {' '}
          {grammar.productions.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && ', '}
              <ProductionText production={p} nonTerminals={grammar.nonTerminals} showId />
            </React.Fragment>
          ))}
        </div>

        {/* Primary Literature Reference Bar */}
        <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>
            {cz ? 'Primární vědecká literatura pro LR analyzátory a techniky:' : 'Primary literature for LR parsers & techniques:'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px' }}>
            {LR_TECHNIQUE_REFERENCES.map((ref, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={ref.citation}
                  style={{ color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                >
                  <strong>{ref.authorYear}</strong>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>({cz ? ref.topicCz : ref.topicEn})</span>
                  <ExternalLink size={10} />
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-Up Parsing Simulator */}
      <div className="card">
        <div className="card-title">
          <span>{t.parsingSimulator} ({t.bottomUpLR})</span>
          <Cpu size={18} color="var(--color-primary)" />
        </div>
        <p className="hint-text" style={{ marginBottom: '6px' }}>
          {cz
            ? 'Deterministická syntaktická analýza zdola nahoru řízená tabulkou přechodů a akcí (přesun/redukce). Používá zásobník stavů a symbolů; výsledkem úspěšné analýzy je pravý rozklad.'
            : 'Deterministic table-driven bottom-up syntax analysis using shift/reduce actions, state and symbol stacks. A successful parse yields the right parse.'}
        </p>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{cz ? 'Teoretický základ (primární literatura):' : 'Theoretical foundation (primary literature):'}</span>
          <span>Aho & Johnson (1974): LR Parsing (ACM Computing Surveys 6(2), pp. 99–124)</span>
          <a href="https://doi.org/10.1145/356628.356629" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
            [DOI]
          </a>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            className="grammar-textarea"
            style={{ minHeight: 'unset', height: '38px', padding: '6px 12px' }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={defaultInput ? `${t.tokensPlaceholder} (${t.forExample} ${defaultInput})` : t.tokensPlaceholder}
            aria-label={t.inputWord}
          />
        </div>
        <TokenizedInputNote tokenized={tokenized} lang={lang} />

        {/* Simulator Mode Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0 16px 0', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
          <button
            type="button"
            className={`btn btn-sm ${parserMode === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setParserMode('standard')}
            style={{ fontWeight: 600 }}
          >
            {cz ? 'Standardní deterministický LR' : 'Standard Deterministic LR'}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${parserMode === 'glr' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setParserMode('glr')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <GitFork size={14} />
            <span>{cz ? 'Zobecněný LR (GLR / GSS)' : 'Generalized LR (GLR / GSS)'}</span>
            {!activeTable.isConflictFree && (
              <span className="badge badge-warning" style={{ fontSize: '10px', padding: '1px 6px', fontWeight: 700 }}>
                {cz ? 'Řeší kolize' : 'Resolves conflicts'}
              </span>
            )}
          </button>
        </div>

        {parserMode === 'standard' ? (
          <>
            {simulation.steps.length > 0 && (
              <div className={`report-box ${simulation.accepted ? 'success' : 'danger'}`} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {simulation.accepted ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span>
                  {simulation.accepted
                    ? t.wordAccepted.replace('{n}', simulation.steps.length.toString())
                    : `${t.wordRejected}: ${lang === 'cz' ? simulation.errorMessageCz || simulation.errorMessage : simulation.errorMessage}`}
                </span>
              </div>
            )}
            {!activeTable.isConflictFree && (
              <div className="conflict-pick-note" style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>{t.simulatorConflictWarning}</div>
                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-warning"
                    onClick={() => setParserMode('glr')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '3px 8px' }}
                  >
                    <GitFork size={13} />
                    {cz ? 'Spustit v GLR analyzátoru s Graph-Structured Stack (řeší všechny větve)' : 'Run in Generalized LR (GLR) with Graph-Structured Stack (explores all branches)'}
                  </button>
                </div>
              </div>
            )}

            <SimulatorControls
              stepIdx={currentStepIdx}
              total={simulation.steps.length}
              isPlaying={isPlaying}
              speed={playSpeed}
              lang={lang}
              onStep={(i) => { setIsPlaying(false); setCurrentStepIdx(i); }}
              onTogglePlay={() => {
                if (!isPlaying && currentStepIdx >= simulation.steps.length - 1) setCurrentStepIdx(0);
                setIsPlaying(p => !p);
              }}
              onSpeed={setPlaySpeed}
            />

            {currentStep && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.stateStack} {t.topOnRight}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentStep.stateStack.map((st, idx) => {
                      const isTop = idx === currentStep.stateStack.length - 1;
                      return (
                        <span key={idx} className={`badge ${isTop ? 'chip-top-stack' : 'badge-primary'}`}>
                          {name(st)}
                          {isTop && <span className="chip-tag-top">{t.topOfStackBadge}</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {!lecture && (
                  <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.symbolStack}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {currentStep.symbolStack.map((sym, idx) => (
                        <span key={idx} className={`badge ${grammar.nonTerminals.has(sym) ? 'badge-primary' : 'badge-success'}`}>{sym}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.remainingInput}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentStep.remainingInput.map((sym, idx) => (
                      <span key={idx} className={`badge ${idx === 0 ? 'chip-decision-input' : 'badge-success'}`}>
                        {sym}
                        {idx === 0 && <span className="chip-tag-decision">{t.decisionSymbolBadge}</span>}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{
                  padding: '10px 14px',
                  backgroundColor: currentStep.isAccepted ? 'var(--color-success-subtle)' : currentStep.isError ? 'var(--color-danger-subtle)' : 'var(--color-bg-base)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${currentStep.isAccepted ? 'var(--color-success)' : currentStep.isError ? 'var(--color-danger)' : 'var(--color-border)'}`
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.action}</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    marginTop: '6px',
                    color: currentStep.isAccepted ? 'var(--color-success)' : currentStep.isError ? 'var(--color-danger)' : 'var(--color-primary)'
                  }}>
                    {actionText(currentStep)}
                  </div>
                </div>
              </div>
            )}

            <div className="two-column-grid">
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.traceTitle}</div>
                <div className="trace-table-container" ref={traceRef} style={{ maxHeight: '360px' }}>
                  <table className="trace-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t.stack}</th>
                        <th style={{ textAlign: 'right' }}>{t.remainingInput}</th>
                        <th>{t.action}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulation.steps.map((s, i) => (
                        <tr
                          key={i}
                          onClick={() => { setIsPlaying(false); setCurrentStepIdx(i); }}
                          className={[
                            i === currentStepIdx ? 'trace-row-active' : '',
                            i > currentStepIdx ? 'trace-row-future' : '',
                            s.isError ? 'trace-row-error' : '',
                            s.isAccepted ? 'trace-row-accept' : ''
                          ].join(' ')}
                        >
                          <td className="trace-num">{i + 1}</td>
                          <td>{stackText(s)}</td>
                          <td className="trace-input">{s.remainingInput.join(' ')}</td>
                          <td className="trace-action">{actionText(s)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {currentStep && (
                  <div className="hint-text" style={{ marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                    <strong>{t.rightParse}:</strong> {currentStep.rightParse.length > 0 ? currentStep.rightParse.join(' ') : 'ε'}
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.bottomUpTreeLabel} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({t.treeAfterStep})</span></div>
                  {currentStep?.tree && (
                    <LatexExportButton
                      getLatex={() => exportParseTreeToTikz(currentStep.tree!)}
                      filename="parse_tree_lr.tex"
                      label="LaTeX (forest)"
                      lang={lang}
                      title={lang === 'cz' ? 'Exportovat strom do LaTeXu (forest)' : 'Export tree to LaTeX (forest)'}
                    />
                  )}
                </div>
                <DerivationTreeVisualizer rootNode={currentStep?.tree} height="360px" filename="parse_tree_lr" lang={lang} />
              </div>
            </div>
          </>
        ) : (
          /* GLR Mode */
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{cz ? 'Teoretický základ (GLR & GSS):' : 'Theoretical foundation (GLR & GSS):'}</span>
              <span>Tomita (1985): Generalized LR Parser; Scott & Johnstone (2006): RNGLR Parsing</span>
              <a href="https://doi.org/10.1145/1146809.1146810" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                [DOI]
              </a>
            </div>

            {glrSimulation.steps.length > 0 && (
              <div className={`report-box ${glrSimulation.accepted ? 'success' : 'danger'}`} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {glrSimulation.accepted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <span style={{ fontWeight: 600 }}>
                    {glrSimulation.accepted
                      ? (cz
                          ? `Slovo přijato: nalezeno ${glrSimulation.totalTrees} derivačních stromů ${glrSimulation.totalTrees > 1 ? '(nejednoznačná gramatika)' : '(jednoznačné)'}`
                          : `Word accepted: found ${glrSimulation.totalTrees} derivation tree(s) ${glrSimulation.totalTrees > 1 ? '(ambiguous grammar)' : '(unambiguous)'}`)
                      : (cz ? (glrSimulation.errorMessageCz || glrSimulation.errorMessage) : glrSimulation.errorMessage)}
                  </span>
                </div>
                {glrSimulation.accepted && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    <span>{cz ? `Zpracováno kolizí:` : `Conflicts handled:`} <strong>{glrSimulation.conflictsEncountered}</strong></span>
                    <span>{cz ? `Max. souběžných vrcholů GSS:` : `Max concurrent GSS heads:`} <strong>{glrSimulation.maxSimultaneousHeads}</strong></span>
                    <span>{cz ? `Kroků simulace:` : `Simulation steps:`} <strong>{glrSimulation.steps.length}</strong></span>
                  </div>
                )}
              </div>
            )}

            {glrSimulation.totalTrees > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' }}>
                  {cz ? 'Alternativní stromy rozkladu (nejednoznačnost):' : 'Alternative Derivation Trees (Ambiguity):'}
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {glrSimulation.trees.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`btn btn-sm ${selectedTreeIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedTreeIdx(idx)}
                      style={{ padding: '2px 10px', fontSize: '11px', fontWeight: 600 }}
                    >
                      {cz ? `Strom ${idx + 1}` : `Tree ${idx + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <SimulatorControls
              stepIdx={currentGLRStepIdx}
              total={glrSimulation.steps.length}
              isPlaying={isGLRPlaying}
              speed={glrPlaySpeed}
              lang={lang}
              onStep={(i) => { setIsGLRPlaying(false); setCurrentGLRStepIdx(i); }}
              onTogglePlay={() => {
                if (!isGLRPlaying && currentGLRStepIdx >= glrSimulation.steps.length - 1) setCurrentGLRStepIdx(0);
                setIsGLRPlaying(p => !p);
              }}
              onSpeed={setGLRPlaySpeed}
            />

            {currentGLRStep && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                    {cz ? 'Aktivní vrcholy GSS (HEAD)' : 'Active GSS Heads'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentGLRStep.activeHeadStates.map((st, idx) => (
                      <span key={idx} className="badge chip-top-stack">
                        {name(st)}
                        <span className="chip-tag-top">HEAD</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{t.remainingInput}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentGLRStep.remainingInput.map((sym, idx) => (
                      <span key={idx} className={`badge ${idx === 0 ? 'chip-decision-input' : 'badge-success'}`}>
                        {sym}
                        {idx === 0 && <span className="chip-tag-decision">{t.decisionSymbolBadge}</span>}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{
                  padding: '10px 14px',
                  backgroundColor: currentGLRStep.actionType === 'accept'
                    ? 'var(--color-success-subtle)'
                    : currentGLRStep.actionType === 'error'
                      ? 'var(--color-danger-subtle)'
                      : currentGLRStep.actionType === 'fork'
                        ? 'var(--color-warning-subtle, rgba(234, 179, 8, 0.15))'
                        : 'var(--color-bg-base)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    currentGLRStep.actionType === 'accept'
                      ? 'var(--color-success)'
                      : currentGLRStep.actionType === 'error'
                        ? 'var(--color-danger)'
                        : currentGLRStep.actionType === 'fork'
                          ? 'var(--color-warning, #eab308)'
                          : 'var(--color-border)'
                  }`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t.action}</div>
                    <span className={`badge ${
                      currentGLRStep.actionType === 'fork'
                        ? 'badge-warning'
                        : currentGLRStep.actionType === 'merge'
                          ? 'badge-primary'
                          : currentGLRStep.actionType === 'accept'
                            ? 'badge-success'
                            : currentGLRStep.actionType === 'error'
                              ? 'badge-danger'
                              : 'badge-secondary'
                    }`} style={{ fontSize: '9px', fontWeight: 700 }}>
                      {currentGLRStep.actionType.toUpperCase()}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    fontWeight: 700,
                    marginTop: '6px',
                    color: currentGLRStep.actionType === 'accept' ? 'var(--color-success)' : currentGLRStep.actionType === 'error' ? 'var(--color-danger)' : 'var(--color-text)'
                  }}>
                    {cz ? currentGLRStep.actionDescriptionCz : currentGLRStep.actionDescription}
                  </div>
                </div>
              </div>
            )}

            {/* GSS Visualizer */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Graph-Structured Stack (GSS)</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                    {cz ? '(Vrcholy se značkou HEAD představují aktivní zásobníkové hlavy; kliknutím na vrchol zobrazíte detail)' : '(HEAD badges indicate active frontier heads; click any node to inspect)'}
                  </span>
                </div>
              </div>
              <GSSGraphVisualizer
                snapshot={currentSnapshot}
                selectedNodeId={selectedGSSNodeId}
                onSelectNode={setSelectedGSSNodeId}
                lang={lang}
                filename="glr_gss_graph"
              />
            </div>

            {/* Selected GSS Node Inspection Drawer */}
            {selectedGSSNode && (
              <div className="card" style={{
                marginBottom: '16px',
                backgroundColor: 'var(--color-bg-base)',
                border: '1.5px solid var(--color-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--color-primary)' }}>
                      {cz ? `Inspekce vrcholu GSS #${selectedGSSNode.id}` : `GSS Node Inspection #${selectedGSSNode.id}`}
                    </span>
                    <span className="badge badge-primary" style={{ fontWeight: 700, fontSize: '12px' }}>
                      {cz ? `Stav ${selectedGSSNode.label}` : `State ${selectedGSSNode.label}`}
                    </span>
                    <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                      {cz ? `Úroveň vstupu: ${selectedGSSNode.level}` : `Input level: ${selectedGSSNode.level}`}
                    </span>
                    {selectedGSSNode.isHead && (
                      <span className="badge chip-top-stack">HEAD</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => setSelectedGSSNodeId(null)}
                    title={cz ? 'Zavřít detail' : 'Close inspection'}
                    style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <X size={13} />
                    <span>{cz ? 'Zavřít' : 'Close'}</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* Column 1: Creation & Stack Evolution */}
                  <div style={{ padding: '10px 12px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} color="var(--color-primary)" />
                      <span>{cz ? 'Jak vrchol v GSS vznikl' : 'Creation & Stack Origin'}</span>
                    </div>
                    <div style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--color-text)' }}>
                      {selectedGSSNode.creationKind === 'init' && (
                        <p style={{ margin: 0 }}>
                          {cz
                            ? `Počáteční kořenový vrchol zásobníku (stav ${selectedGSSNode.label}) vytvořený při startu syntaktické analýzy před čtením jakéhokoliv symbolu.`
                            : `Initial root stack node (state ${selectedGSSNode.label}) created at the start of parsing before reading any tokens.`}
                        </p>
                      )}
                      {selectedGSSNode.creationKind === 'shift' && (
                        <p style={{ margin: 0 }}>
                          {cz ? (
                            <>
                              Vznikl operací <strong>Přesun (Shift)</strong>: načtením terminálního symbolu{' '}
                              <code style={{ fontWeight: 700, color: 'var(--color-success)' }}>{selectedGSSNode.creationSymbol}</code> ze stavu{' '}
                              <strong>{selectedGSSNode.creationFromStateLabel}</strong>.
                            </>
                          ) : (
                            <>
                              Created by a <strong>Shift</strong> action: consuming terminal token{' '}
                              <code style={{ fontWeight: 700, color: 'var(--color-success)' }}>{selectedGSSNode.creationSymbol}</code> from predecessor state{' '}
                              <strong>{selectedGSSNode.creationFromStateLabel}</strong>.
                            </>
                          )}
                        </p>
                      )}
                      {selectedGSSNode.creationKind === 'reduce' && (
                        <p style={{ margin: 0 }}>
                          {cz ? (
                            <>
                              Vznikl <strong>redukcí pravidla</strong>{' '}
                              <code style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{selectedGSSNode.creationProduction}</code> a následným přechodem{' '}
                              <strong>GOTO</strong> na neterminál <code>{selectedGSSNode.creationSymbol}</code> ze stavu{' '}
                              <strong>{selectedGSSNode.creationFromStateLabel}</strong>.
                            </>
                          ) : (
                            <>
                              Created after <strong>reducing production</strong>{' '}
                              <code style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{selectedGSSNode.creationProduction}</code> followed by a{' '}
                              <strong>GOTO</strong> transition on <code>{selectedGSSNode.creationSymbol}</code> from state{' '}
                              <strong>{selectedGSSNode.creationFromStateLabel}</strong>.
                            </>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Branch Merging Notice */}
                    {incomingGSSEdges.length > 1 && (
                      <div style={{ marginTop: '8px', padding: '6px 8px', backgroundColor: 'var(--color-primary-subtle)', borderRadius: '4px', fontSize: '11px', color: 'var(--color-text)' }}>
                        <strong>{cz ? '⚡ Sloučení větví (Tomita Merge):' : '⚡ Branch Merging (Tomita Merge):'}</strong>{' '}
                        {cz
                          ? `Do tohoto vrcholu se spojilo ${incomingGSSEdges.length} různých větví syntaktické analýzy, které dospěly do stejného stavu na stejné pozici vstupu. Tím GSS zabraňuje exponenciálnímu větvení zásobníku.`
                          : `${incomingGSSEdges.length} distinct parsing paths converged into this state at the same input position, merging to eliminate redundant stack explorations.`}
                      </div>
                    )}

                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      <strong>{cz ? 'Přečtený prefix:' : 'Consumed prefix:'}</strong>{' '}
                      {selectedGSSNode.consumedPrefix.length > 0 ? (
                        <code>{selectedGSSNode.consumedPrefix.join(' ')}</code>
                      ) : (
                        <em>{cz ? '(začátek vstupu)' : '(input start)'}</em>
                      )}
                    </div>
                  </div>

                  {/* Column 2: LR Items & Active Grammar Context */}
                  <div style={{ padding: '10px 12px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Network size={14} color="var(--color-primary)" />
                      <span>{cz ? 'Položky gramatiky v tomto stavu' : 'Active LR Items in State'}</span>
                    </div>
                    {selectedGSSNode.items && selectedGSSNode.items.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '140px', overflowY: 'auto' }}>
                        {selectedGSSNode.items.map((it, idx) => (
                          <div key={idx} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 6px', backgroundColor: 'var(--color-bg-base)', borderRadius: '3px', border: '1px solid var(--color-border)' }}>
                            {it}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        {cz ? 'Položky automatu jsou shodné se stavem v LR tabulce výše.' : 'Items correspond to the canonical state in the table above.'}
                      </div>
                    )}
                  </div>

                  {/* Column 3: Link to Derivation Tree Below */}
                  <div style={{ padding: '10px 12px', backgroundColor: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={14} color="var(--color-accent, #8b5cf6)" />
                      <span>{cz ? 'Propojení s derivačním stromem' : 'Connection to Derivation Tree'}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text)' }}>
                      {incomingGSSEdges.length > 0 ? (
                        <div>
                          <p style={{ margin: '0 0 6px 0', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                            {cz
                              ? 'Hrany vstupující do tohoto vrcholu nesou podstromy derivačního rozkladu. Níže ve stromu jsou tyto uzly zvýrazněny fialovým obrysem.'
                              : 'Edges leading into this node carry derivation subtrees. Matching subtrees are highlighted with a purple halo in the tree below.'}
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {incomingGSSEdges.map((edge, idx) => {
                              const parentNode = currentSnapshot.nodes.find(n => n.id === edge.toId);
                              const parentLabel = parentNode ? parentNode.label : `#${edge.toId}`;
                              return (
                                <div key={idx} style={{ padding: '4px 6px', backgroundColor: 'var(--color-bg-base)', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '11px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>
                                      {cz ? 'Hrana ze stavu' : 'Edge from'} <strong>{parentLabel}</strong> přes symbol{' '}
                                      <code style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{edge.symbol}</code>
                                      {edge.count > 1 && (
                                        <span className="badge badge-warning" style={{ marginLeft: '4px', fontSize: '9px' }}>
                                          {edge.count} {cz ? 'varianty' : 'variants'}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {edge.treeYields && edge.treeYields.length > 0 && (
                                    <div style={{ marginTop: '2px', color: 'var(--color-text-muted)', fontSize: '10.5px' }}>
                                      {cz ? 'Rozklad (yield):' : 'Subtree yield:'}{' '}
                                      <strong style={{ color: 'var(--color-text)' }}>"{edge.treeYields.join(' / ')}"</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          {cz ? 'Počáteční kořen nemá žádné vstupující hrany (spodní dno zásobníku).' : 'Initial root has no incoming edges (bottom of stack).'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="two-column-grid">
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                  {cz ? 'Protokol kroků GLR analýzy' : 'GLR Trace Log'}
                </div>
                <div className="trace-table-container" ref={glrTraceRef} style={{ maxHeight: '360px' }}>
                  <table className="trace-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{cz ? 'Typ' : 'Type'}</th>
                        <th>{cz ? 'Symbol' : 'Token'}</th>
                        <th>{t.action}</th>
                        <th style={{ textAlign: 'right' }}>{cz ? 'Hlavy' : 'Heads'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glrSimulation.steps.map((s, i) => (
                        <tr
                          key={i}
                          onClick={() => { setIsGLRPlaying(false); setCurrentGLRStepIdx(i); }}
                          className={[
                            i === currentGLRStepIdx ? 'trace-row-active' : '',
                            i > currentGLRStepIdx ? 'trace-row-future' : '',
                            s.actionType === 'error' ? 'trace-row-error' : '',
                            s.actionType === 'accept' ? 'trace-row-accept' : ''
                          ].join(' ')}
                        >
                          <td className="trace-num">{i + 1}</td>
                          <td>
                            <span className={`badge ${
                              s.actionType === 'fork'
                                ? 'badge-warning'
                                : s.actionType === 'merge'
                                  ? 'badge-primary'
                                  : s.actionType === 'accept'
                                    ? 'badge-success'
                                    : s.actionType === 'error'
                                      ? 'badge-danger'
                                      : 'badge-secondary'
                            }`} style={{ fontSize: '9px' }}>
                              {s.actionType}
                            </span>
                          </td>
                          <td className="trace-input">{s.inputToken}</td>
                          <td className="trace-action">{cz ? s.actionDescriptionCz : s.actionDescription}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.activeHeadCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>
                    {cz ? 'Derivační strom' : 'Derivation Tree'}
                    {glrSimulation.totalTrees > 1 && (
                      <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                        ({cz ? `Strom ${selectedTreeIdx + 1} z ${glrSimulation.totalTrees}` : `Tree ${selectedTreeIdx + 1} of ${glrSimulation.totalTrees}`})
                      </span>
                    )}
                  </div>
                  {glrActiveTree && (
                    <LatexExportButton
                      getLatex={() => exportParseTreeToTikz(glrActiveTree)}
                      filename="parse_tree_glr.tex"
                      label="LaTeX (forest)"
                      lang={lang}
                      title={lang === 'cz' ? 'Exportovat strom do LaTeXu (forest)' : 'Export tree to LaTeX (forest)'}
                    />
                  )}
                </div>
                <DerivationTreeVisualizer rootNode={glrActiveTree} height="360px" filename="parse_tree_glr" lang={lang} highlightNodeIds={gssHighlightedTreeIds} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Literature Reference Bar */}
      <ReferenceBar
        references={LR_TECHNIQUE_REFERENCES}
        lang={lang}
        label={cz ? 'Primární literatura (analyzátory LR a GLR):' : 'Primary literature (LR & GLR parsers):'}
      />
    </div>
  );
};
