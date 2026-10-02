import React, { useEffect, useMemo, useState } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { LRTable, LRLayout, LR0_ACTION_COLUMN, formatLayoutAction, stateLabel } from '../../core/lr/lrTable';
import { explainItem, explainLookahead, incomingEdges, itemsMovingOver, stateCreators } from '../../core/lr/lrExplain';
import { LRLayoutSwitch } from '../components/LRLayoutSwitch';
import { AutomatonGraphVisualizer, DisplayItem, stateDisplayItems } from '../visualizer/AutomatonGraphVisualizer';
import { ExplainContext, FloatingTip, LookaheadExplanationView, describeItemReason, formatItem } from '../components/LRExplanation';
import { Language, TRANSLATIONS } from '../../i18n/translations';
import { Network, Info, ArrowRight, AlertTriangle } from 'lucide-react';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'LR(1)';

/** Automata with more states are drawn only on request. */
const GRAPH_STATE_LIMIT = 150;

interface AutomatonGraphViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  lr0Automaton: LRAutomaton;
  slr1Automaton: LRAutomaton;
  lalr1Automaton: LRAutomaton;
  /** Missing when the computation was stopped before it */
  lr1Automaton?: LRAutomaton;
  lr0Table: LRTable;
  slr1Table: LRTable;
  lalr1Table: LRTable;
  lr1Table?: LRTable;
  lang: Language;
  selectedVariant?: LRVariantName;
  onSelectVariant?: (v: LRVariantName) => void;
  layout: LRLayout;
  onLayoutChange: (layout: LRLayout) => void;
}

export const AutomatonGraphView: React.FC<AutomatonGraphViewProps> = ({
  grammar,
  analysis,
  lr0Automaton,
  slr1Automaton,
  lalr1Automaton,
  lr1Automaton,
  lr0Table,
  slr1Table,
  lalr1Table,
  lr1Table,
  lang,
  selectedVariant: controlledVariant,
  onSelectVariant,
  layout,
  onLayoutChange
}) => {
  const t = TRANSLATIONS[lang];
  const [internalVariant, setInternalVariant] = useState<LRVariantName>('SLR(1)');
  const selectedVariant = controlledVariant ?? internalVariant;
  const [selectedStateId, setSelectedStateId] = useState<number | null>(0);

  const setVariant = (v: LRVariantName) => {
    if (onSelectVariant) onSelectVariant(v);
    else setInternalVariant(v);
  };

  // LR(1) is missing when the computation was stopped: LALR(1) is shown instead
  const lr1Missing = selectedVariant === 'LR(1)' && (!lr1Automaton || !lr1Table);
  const activeAutomaton = lr1Missing ? lalr1Automaton : { 'LR(0)': lr0Automaton, 'SLR(1)': slr1Automaton, 'LALR(1)': lalr1Automaton, 'LR(1)': lr1Automaton! }[selectedVariant];
  const activeTable = lr1Missing ? lalr1Table : { 'LR(0)': lr0Table, 'SLR(1)': slr1Table, 'LALR(1)': lalr1Table, 'LR(1)': lr1Table! }[selectedVariant];

  useEffect(() => setSelectedStateId(0), [activeAutomaton]);
  // A large automaton is not drawn unless asked for: dagre would block the page for a long time
  const [forceGraph, setForceGraph] = useState(false);
  useEffect(() => setForceGraph(false), [activeAutomaton]);
  const tooLarge = activeAutomaton.states.length > GRAPH_STATE_LIMIT && !forceGraph;

  const lecture = layout === 'lecture';
  const conflicts = lecture ? activeTable.fConflicts : activeTable.conflicts;
  const conflictStates = new Set(conflicts.map(c => c.stateId));
  const selectedState = activeAutomaton.states.find(s => s.id === selectedStateId);
  const withLookaheads = selectedVariant === 'LR(1)' || selectedVariant === 'LALR(1)';
  const items = selectedState ? stateDisplayItems(selectedState, withLookaheads) : [];
  const stateConflicts = conflicts.filter(c => c.stateId === selectedStateId);
  // Lecture: states named by their entry symbols (#, E₁); Dragon Book: numbers
  const name = (id: number) => stateLabel(activeTable, id, layout);
  const fmt = (a: Parameters<typeof formatLayoutAction>[0]) => formatLayoutAction(a, layout, lang);
  const actColumns = lecture ? activeTable.fColumns : activeTable.terminals;
  const actTable = lecture ? activeTable.fTable : activeTable.actionTable;
  const nodeTitles = activeAutomaton.states.map(s => (lecture ? name(s.id) : `${t.stateLabel} ${s.id}`));
  const cz = lang === 'cz';

  // Explanations: where a state comes from, why an item and a lookahead are in it
  const [tip, setTip] = useState<{ anchor: DOMRect; content: React.ReactNode } | null>(null);
  useEffect(() => setTip(null), [activeAutomaton, selectedStateId]);
  const creators = useMemo(() => stateCreators(activeAutomaton), [activeAutomaton]);
  const ctx: ExplainContext = {
    lang,
    name,
    lr1Name: lr1Table ? id => (lecture ? stateLabel(lr1Table, id, layout) : `${id}`) : undefined
  };
  const gotoText = (from: number, sym: string, to: number) =>
    lecture ? `g(${name(from)}, ${sym}) = ${name(to)}` : `GOTO(${from}, ${sym}) = ${to}`;

  const itemHint = (stateId: number, it: DisplayItem): string => {
    const reason = explainItem(activeAutomaton, stateId, it)[0];
    const why = reason ? describeItemReason(reason, it, ctx) : '';
    let where: string;
    if (it.target !== undefined) {
      where = `${gotoText(stateId, it.after[0], it.target)} — ${cz ? 'kliknutím přejdete do tohoto stavu' : 'click to go to this state'}`;
    } else if (it.production.id === 0) {
      where = cz ? 'Úplná položka S\' → S •: přijetí na konci vstupu.' : 'Complete item S\' → S •: accept at the end of the input.';
    } else if (selectedVariant === 'LR(0)') {
      where = cz ? 'Úplná položka: LR(0) redukuje bez ohledu na vstup.' : 'Complete item: LR(0) reduces whatever the input is.';
    } else if (selectedVariant === 'SLR(1)') {
      const follow = [...(analysis.follow1.get(it.lhs) || [])].join(', ');
      where = cz ? `Úplná položka: SLR(1) redukuje při FOLLOW(${it.lhs}) = { ${follow} }.` : `Complete item: SLR(1) reduces on FOLLOW(${it.lhs}) = { ${follow} }.`;
    } else {
      where = cz ? `Úplná položka: redukce při dopředu prohlížených symbolech ${it.lookaheads?.join(', ')}.` : `Complete item: reduce on the lookaheads ${it.lookaheads?.join(', ')}.`;
    }
    return why ? `${why}\n${where}` : where;
  };

  const lookaheadTip = (stateId: number, it: DisplayItem, la: string) => (
    <LookaheadExplanationView
      explanation={explainLookahead(activeAutomaton, analysis, stateId, it.production, it.dotIndex, la, lr1Automaton)}
      production={it.production}
      dotIndex={it.dotIndex}
      lookahead={la}
      ctx={ctx}
    />
  );
  const showTip = (e: React.SyntheticEvent<HTMLElement>, content: React.ReactNode) =>
    setTip({ anchor: e.currentTarget.getBoundingClientRect(), content });

  const creator = selectedState ? creators[selectedState.id] : null;
  const otherIncoming = selectedState
    ? incomingEdges(activeAutomaton, selectedState.id).filter(e => !creator || e.from !== creator.from)
    : [];
  const stateLink = (id: number) => (
    <button type="button" className="lr-state-link" onClick={() => setSelectedStateId(id)}>
      {lecture ? name(id) : `${t.stateLabel} ${id}`}
    </button>
  );

  // LR(0) and SLR(1) share the canonical LR(0) collection; LALR(1) has the same states with lookaheads.
  const sameStatesNote = selectedVariant === 'SLR(1)' || selectedVariant === 'LR(0)'
    ? t.graphSharedLR0
    : selectedVariant === 'LALR(1)'
      ? t.graphLALRStates + (lr1Automaton ? ' ' + t.graphLALRMerged.replace('{lr1}', lr1Automaton.states.length.toString()).replace('{lalr}', lalr1Automaton.states.length.toString()) : '')
      : '';

  return (
    <div>
      <LRLayoutSwitch layout={layout} onChange={onLayoutChange} lang={lang} />

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="var(--color-primary)" />
            <span>{t.graphTitle}</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }} role="group" aria-label={t.variant}>
            {(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)'] as const).map(v => (
              <button
                key={v}
                className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '12px' }}
                aria-pressed={selectedVariant === v}
                onClick={() => setVariant(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <p className="hint-text">{t.graphDesc}</p>
        <p className="hint-text" style={{ marginTop: '4px' }}>{t.graphLegend}</p>
        <p className="hint-text" style={{ marginTop: '4px' }}>
          {cz
            ? 'Fialově: přechod, kterým vybraný stav vznikl (plně), další přechody do něj (čárkovaně) a v předchůdcích položky, v nichž se tečka posune přes vstupní symbol stavu – z nich vzniká jeho jádro. Kliknutím na položku přejdete do stavu, kam vede její přechod. '
            : 'Purple: the transition that created the selected state (solid), other transitions into it (dashed), and in the predecessors the items whose dot moves over the entry symbol – they become its kernel. Click an item to go to the state its transition leads to. '}
          {withLookaheads && (cz
            ? 'Najetím myší na dopředu prohlížený symbol zobrazíte, proč do množiny patří.'
            : 'Hover a lookahead to see why it is in the set.')}
        </p>
        <p className="hint-text" style={{ marginTop: '4px' }}>
          <strong>{t.statesCount}</strong> {activeAutomaton.states.length}
          {sameStatesNote && <> · {sameStatesNote}</>}
          {conflictStates.size > 0 && (
            <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
              {' '}· {t.graphConflictStates.replace('{states}', [...conflictStates].map(name).join(', '))}
            </span>
          )}
        </p>
      </div>

      {lr1Missing && (
        <div className="notice-box warning" style={{ marginBottom: '12px' }}>
          <div className="notice-title">
            <AlertTriangle size={15} />
            <span>
              {cz
                ? 'Automat LR(1) nebyl spočten: výpočet byl zastaven. Zobrazen je automat LALR(1); úplnou analýzu spustí tlačítko Přepočítat.'
                : 'The LR(1) automaton was not computed: the computation was stopped. The LALR(1) automaton is shown; the Recalculate button starts the full analysis.'}
            </span>
          </div>
        </div>
      )}

      {tooLarge ? (
        <div className="card graph-too-large">
          <p>
            {cz
              ? `Automat má ${activeAutomaton.states.length} stavů. Rozložení tak velkého grafu by trvalo dlouho (stránka by mezitím nereagovala) a graf by byl nečitelný. Stavy lze procházet pomocí výběru níže a přechodů v detailu stavu.`
              : `The automaton has ${activeAutomaton.states.length} states. Laying out such a graph would take long (the page would not respond meanwhile) and the graph would be unreadable. Browse the states with the selection below and the transitions in the state details.`}
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12.5px' }}>
              {cz ? 'Stav: ' : 'State: '}
              <select
                className="whole-grammar-select"
                value={selectedStateId ?? 0}
                onChange={e => setSelectedStateId(Number(e.target.value))}
              >
                {activeAutomaton.states.map(st => (
                  <option key={st.id} value={st.id}>{lecture ? name(st.id) : `${t.stateLabel} ${st.id}`}{conflictStates.has(st.id) ? ' ⚠' : ''}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => setForceGraph(true)}>
              {cz ? 'Přesto vykreslit graf' : 'Draw the graph anyway'}
            </button>
          </div>
        </div>
      ) : (
        <AutomatonGraphVisualizer
          automaton={activeAutomaton}
          selectedStateId={selectedStateId}
          onSelectState={setSelectedStateId}
          conflictStates={conflictStates}
          nodeTitles={nodeTitles}
          lang={lang}
          itemHint={itemHint}
          lookaheadTip={withLookaheads ? lookaheadTip : undefined}
        />
      )}
      {tip && <FloatingTip anchor={tip.anchor}>{tip.content}</FloatingTip>}

      {selectedState && (
        <div className="card" style={{ marginTop: '16px', border: '2px solid var(--color-primary)' }}>
          <div className="card-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} color="var(--color-primary)" />
              <span>{t.inspectingState.replace('{id}', name(selectedState.id))} {selectedState.id === 0 ? t.startState : ''}</span>
            </div>
            <span className="badge badge-primary">{selectedVariant}</span>
          </div>

          {/* How the state arises: GOTO of the creating predecessor, then the closure */}
          <div className="lr-origin-box">
            {creator === null ? (
              <span>
                {cz
                  ? `Počáteční stav: uzávěr počáteční položky ${formatItem(activeAutomaton.augmentedProduction, 0)}.`
                  : `Initial state: the closure of the initial item ${formatItem(activeAutomaton.augmentedProduction, 0)}.`}
              </span>
            ) : (
              <>
                <span>
                  {cz ? 'Stav vznikl přechodem ' : 'The state was created by the transition '}
                  <strong>{gotoText(creator.from, creator.symbol, selectedState.id)}</strong>
                  {cz ? ' ze stavu ' : ' from state '}
                  {stateLink(creator.from)}
                  {cz ? `: v těchto položkách se tečka posune přes ${creator.symbol}` : `: the dot moves over ${creator.symbol} in these items`}
                  {items.some(i => !i.isKernel)
                    ? (cz ? ' a uzávěr pak přidá položky pod čarou.' : ', then the closure adds the items below the line.')
                    : '.'}
                </span>
                <ul>
                  {itemsMovingOver(activeAutomaton.states[creator.from], creator.symbol).map((it, i) => (
                    <li key={i}>
                      {formatItem(it.production, it.dotIndex)} ⟶ {formatItem(it.production, it.dotIndex + 1)}
                    </li>
                  ))}
                </ul>
                {otherIncoming.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {cz ? 'Do stavu vedou také: ' : 'Also entered by: '}
                    {otherIncoming.map((e, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && ', '}
                        {stateLink(e.from)} <span style={{ fontFamily: 'var(--font-mono)' }}>({gotoText(e.from, e.symbol, selectedState.id)})</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              {(['kernel', 'closure'] as const).map(kind => {
                const list = items.filter(i => (kind === 'kernel' ? i.isKernel : !i.isKernel));
                if (list.length === 0) return null;
                return (
                  <div key={kind} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                      {kind === 'kernel' ? t.kernelItems : t.closureItems}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {list.map((it, idx) => {
                        const navigable = it.target !== undefined;
                        return (
                          <div
                            key={idx}
                            className={`lr-item-row ${navigable ? 'navigable' : ''} ${it.isComplete ? 'complete' : ''}`}
                            role={navigable ? 'button' : undefined}
                            tabIndex={navigable ? 0 : undefined}
                            onClick={navigable ? () => setSelectedStateId(it.target!) : undefined}
                            onKeyDown={navigable ? (e) => {
                              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setSelectedStateId(it.target!);
                              }
                            } : undefined}
                          >
                            <span>
                              <span title={itemHint(selectedState.id, it)}>
                                <span className="sym-nt">{it.lhs}</span>
                                <span className="sym-arrow">→</span>
                                {it.before.join(' ')} <strong style={{ color: 'var(--color-danger)' }}>•</strong> {it.after.join(' ')}
                              </span>
                              {it.lookaheads && it.lookaheads.length === 0 && (
                                <span className="lr-la-list"><span className="lr-la empty" title={cz ? 'Položka nemá žádný dopředu prohlížený symbol (nenormovaný symbol)' : 'The item has no lookahead (a non-generating symbol)'}>∅</span></span>
                              )}
                              {it.lookaheads && (
                                <span className="lr-la-list">
                                  {it.lookaheads.map(la => (
                                    <span
                                      key={la}
                                      className="lr-la"
                                      tabIndex={0}
                                      aria-label={cz ? `Proč ${la}` : `Why ${la}`}
                                      onClick={e => e.stopPropagation()}
                                      onMouseEnter={e => showTip(e, lookaheadTip(selectedState.id, it, la))}
                                      onFocus={e => showTip(e, lookaheadTip(selectedState.id, it, la))}
                                      onMouseLeave={() => setTip(null)}
                                      onBlur={() => setTip(null)}
                                    >
                                      {la}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                            {navigable && (
                              <span className="lr-item-target">
                                {it.after[0]} <ArrowRight size={11} style={{ verticalAlign: '-1px' }} /> {lecture ? name(it.target!) : `${t.stateLabel} ${it.target}`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="hint-text" style={{ fontSize: '11.5px' }}>{t.closureHint}</div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                {t.outgoingTransitions.replace('{count}', selectedState.transitions.size.toString())}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[...selectedState.transitions.entries()].map(([sym, targetId]) => (
                  <button
                    key={sym}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => setSelectedStateId(targetId)}
                    title={lecture ? `g(${name(selectedState.id)}, ${sym}) = ${name(targetId)}` : `GOTO(${selectedState.id}, ${sym}) = ${targetId}`}
                  >
                    <span className={grammar.terminals.has(sym) ? 'sym-t' : 'sym-nt'}>{sym}</span>
                    <ArrowRight size={12} style={{ margin: '0 4px' }} />
                    <span>{lecture ? name(targetId) : `${t.stateLabel} ${targetId}`}</span>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                  {t.tableRowForState.replace('{id}', name(selectedState.id))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {actColumns.map(col => {
                    const acts = actTable.get(selectedState.id)?.get(col) || [];
                    if (acts.length === 0) return null;
                    return (
                      <span key={col} className={`badge ${acts.length > 1 ? 'badge-danger' : 'badge-primary'}`}>
                        {col === LR0_ACTION_COLUMN ? `f(${name(selectedState.id)})` : lecture ? `f(${name(selectedState.id)}, ${col})` : col} &rarr; {acts.map(fmt).join(' / ')}
                      </span>
                    );
                  })}
                </div>
              </div>

              {stateConflicts.length > 0 && (
                <div className="report-box danger" style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <AlertTriangle size={14} />
                    {t.conflictsInState}
                  </div>
                  {stateConflicts.map((c, i) => (
                    <div key={i} style={{ marginTop: '4px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {c.type === 'Shift/Reduce' ? t.shiftReduceConflict : t.reduceReduceConflict}{c.symbol !== LR0_ACTION_COLUMN ? ` [${c.symbol}]` : ''}: {c.actions.map(a => a.production ? `${fmt(a)} (${formatProduction(a.production)})` : fmt(a)).join(' × ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
