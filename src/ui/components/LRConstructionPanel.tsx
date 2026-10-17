import React from 'react';
import { LRAutomaton, IELRSplitReason, LRCellAction } from '../../core/lr/lrAutomaton';
import { LRLayout, LRAction, formatLayoutAction, formatLectureAction } from '../../core/lr/lrTable';
import { ConstructionStep, MergeStep, movedItems, IELRSplitGroup } from '../../core/lr/lrConstruction';
import { LR0Item, LR1Item, groupLR1Items, lr0ItemKey } from '../../core/lr/lrItem';
import { formatItem } from './LRExplanation';
import { Language } from '../../i18n/translations';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

const isKernel = (it: LR0Item) => it.dotIndex > 0 || it.production.id === 0;

/** Items with their lookaheads grouped: [A → α • β, a/b] */
function itemList(items: (LR0Item | LR1Item)[]): string[] {
  if (items.length > 0 && 'lookahead' in items[0]) {
    return groupLR1Items(items as LR1Item[]).map(g => formatItem(g.production, g.dotIndex, g.lookaheads.join('/')));
  }
  const seen = new Set<string>();
  return items.filter(it => !seen.has(lr0ItemKey(it)) && seen.add(lr0ItemKey(it))).map(it => formatItem(it.production, it.dotIndex));
}

/** What the current construction step does: CLOSURE of the initial item, or one GOTO. */
export const ConstructionStepText: React.FC<{
  automaton: LRAutomaton;
  step: ConstructionStep;
  index: number;
  total: number;
  name: (id: number) => string;
  lang: Language;
  layout?: LRLayout;
}> = ({ automaton, step, index, total, name, lang, layout = 'lecture' }) => {
  const cz = lang === 'cz';
  const lr1 = automaton.variant === 'LR(1)' || automaton.variant === 'IELR(1)';
  // LALR(1) and IELR(1) states merge LR(1) states: their lookaheads are the final unions
  const merged = automaton.variant === 'LALR(1)' || automaton.variant === 'IELR(1)';
  const last = index === total - 1;
  if (step.kind === 'initial') {
    const s = automaton.states[0];
    const items = s.items1 ?? s.items0;
    const kernel = itemList(items.filter(isKernel));
    const closure = itemList(items.filter(it => !isKernel(it)));
    return (
      <div className="construction-step">
        <div className="construction-step-title">{cz ? `Krok 1 z ${total}: počáteční stav` : `Step 1 of ${total}: the initial state`} {name(0)}</div>
        <p>
          {cz ? 'Počáteční stav je uzávěr položky rozšířené gramatiky' : 'The initial state is the closure of the item of the augmented grammar'}{' '}
          <code>{kernel.join(', ')}</code>
          {lr1 && (cz ? ' ($ = konec vstupu)' : ' ($ = end of the input)')}.
        </p>
        {closure.length > 0 && (
          <p>
            {cz ? 'CLOSURE přidá pro každý neterminál za tečkou jeho pravidla s tečkou na začátku' : 'CLOSURE adds, for every non-terminal after a dot, its rules with the dot at the beginning'}
            {lr1 && (cz ? ' (s dopředu prohlíženými symboly FIRST(β a))' : ' (with the lookaheads FIRST(β a))')}:{' '}
            <code>{closure.join(', ')}</code>.
          </p>
        )}
      </div>
    );
  }
  const from = automaton.states[step.from];
  const to = automaton.states[step.to];
  const moved = itemList(movedItems(from, step.symbol));
  const targetItems = to.items1 ?? to.items0;
  const kernel = itemList(targetItems.filter(isKernel));
  const closure = itemList(targetItems.filter(it => !isKernel(it)));

  // Identify whether an earlier state already has the exact same LR(0) core
  const toCoreKeys = new Set(to.items0.filter(isKernel).map(lr0ItemKey));
  const existingSameCoreState = step.isNew
    ? automaton.states.slice(0, step.to).find(s => {
        const sCore = s.items0.filter(isKernel).map(lr0ItemKey);
        return sCore.length === toCoreKeys.size && sCore.every(k => toCoreKeys.has(k));
      })
    : undefined;

  return (
    <div className="construction-step">
      <div className="construction-step-title">
        {cz ? `Krok ${index + 1} z ${total}: ` : `Step ${index + 1} of ${total}: `}
        GOTO({name(step.from)}, {step.symbol}) = {name(step.to)}
        <span className={`construction-badge ${step.isNew ? 'new' : 'existing'}`}>
          {step.isNew ? (cz ? 'nový stav' : 'new state') : (cz ? 'stav už existuje' : 'state exists')}
        </span>
      </div>
      <p>
        {cz ? `Ve stavu ${name(step.from)} se tečka posune přes ${step.symbol} v položkách ` : `In state ${name(step.from)} the dot moves over ${step.symbol} in the items `}
        <code>{moved.join(', ')}</code>
        {cz ? '; vzniknou položky jádra ' : '; this yields kernel items '}
        <code>{kernel.join(', ')}</code>.
      </p>
      {step.isNew ? (
        existingSameCoreState ? (
          <p>
            {automaton.variant === 'IELR(1)' ? (
              <>
                {cz
                  ? <>Tento stav má <strong>stejné LR(0) jádro</strong> jako stav <strong>{name(existingSameCoreState.id)}</strong> (položky <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>), ale IELR(1) tyto stavy LR(1) <strong>nesloučil</strong> (jádro je rozděleno):</>
                  : <>This state has the <strong>same LR(0) core</strong> as state <strong>{name(existingSameCoreState.id)}</strong> (items <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>), but IELR(1) did <strong>not merge</strong> these LR(1) states (the core is split):</>}
                {' '}{(to.splitReasons ?? []).map(r => ielrReasonText(r, lang, layout)).join(' ')}
              </>
            ) : (
              cz ? (
                <>
                  Tento stav má <strong>stejné LR(0) jádro</strong> jako stav <strong>{name(existingSameCoreState.id)}</strong> (položky <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>), ale kanonický LR(1) automat vytváří samostatný stav, protože se liší množiny symbolů pro zkoumání dopředu (lookahead).
                </>
              ) : (
                <>
                  This state shares the <strong>exact same LR(0) core</strong> as state <strong>{name(existingSameCoreState.id)}</strong> (items <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>), but canonical LR(1) creates a separate state because their lookahead sets differ.
                </>
              )
            )}
            {closure.length > 0 && (
              <> {cz ? 'CLOSURE k němu přidá ' : 'CLOSURE adds '}<code>{closure.join(', ')}</code>.</>
            )}
          </p>
        ) : (
          closure.length > 0 ? (
            <p>
              {cz ? 'Stav s tímto LR(0) jádrem dosud neexistuje, vzniká tedy nový stav; CLOSURE k němu přidá ' : 'No state with this LR(0) core exists yet, so a new state is created; CLOSURE adds '}
              <code>{closure.join(', ')}</code>.
            </p>
          ) : (
            <p>{cz ? 'Stav s tímto LR(0) jádrem dosud neexistuje, vzniká tedy nový stav (uzávěr nic nepřidá).' : 'No state with this LR(0) core exists yet, so a new state is created (the closure adds nothing).'}</p>
          )
        )
      ) : (
        <p>
          {merged
            ? (cz
                ? `Stav ${name(step.to)} s tímto jádrem už existuje: nevzniká nový stav, přidá se jen přechod (dopředu prohlížené symboly stavu jsou už výsledné, sjednocené ze sloučených stavů LR(1)).`
                : `State ${name(step.to)} with this core already exists: no new state, only the transition is added (the lookaheads of the state are already the final ones, the union over the merged LR(1) states).`)
            : (cz
                ? `Stav s tímto jádrem a touto konfigurací lookaheadů už existuje (${name(step.to)}): nevzniká nový stav, přidá se jen přechod.`
                : `A state with this core and lookahead configuration already exists (${name(step.to)}): no new state, only the transition is added.`)}
        </p>
      )}
      {last && (
        <p className="construction-done">
          {cz
            ? `Všechny stavy jsou zpracovány: automat má ${automaton.states.length} stavů.`
            : `All states are processed: the automaton has ${automaton.states.length} states.`}
        </p>
      )}
    </div>
  );
};

/** One merge of LR(1) states into an LALR(1) state, and whether it creates a conflict. */
export const MergePanel: React.FC<{
  merges: MergeStep[];
  index: number;
  onIndex: (i: number) => void;
  lalrName: (id: number) => string;
  lr1Name: (id: number) => string;
  lr1States: number;
  lalrStates: number;
  layout: LRLayout;
  lang: Language;
}> = ({ merges, index, onIndex, lalrName, lr1Name, lr1States, lalrStates, layout, lang }) => {
  const cz = lang === 'cz';
  const withConflict = merges.filter(m => m.newConflicts.length > 0).length;
  const summary = cz
    ? `LALR(1) vzniká sloučením ${lr1States} stavů LR(1) se stejným jádrem do ${lalrStates} stavů: ${merges.length} sloučení, z toho ${withConflict} s novým konfliktem.`
    : `LALR(1) arises by merging the ${lr1States} LR(1) states with equal cores into ${lalrStates} states: ${merges.length} merge(s), ${withConflict} with a new conflict.`;
  if (merges.length === 0) {
    return (
      <div className="construction-step">
        <p>{cz ? 'Žádné dva stavy LR(1) nemají stejné jádro: LR(1) a LALR(1) mají tytéž stavy.' : 'No two LR(1) states have the same core: LR(1) and LALR(1) have the same states.'}</p>
      </div>
    );
  }
  const m = merges[index];
  const conflictSymbols = new Set(m.newConflicts.map(c => c.symbol));
  return (
    <div className="construction-step">
      <p className="hint-text" style={{ marginTop: 0 }}>{summary}</p>
      <div className="membership-pager" style={{ marginBottom: '6px' }}>
        <button type="button" className="btn btn-secondary" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label={cz ? 'Předchozí sloučení' : 'Previous merge'}>
          <ChevronLeft size={14} />
        </button>
        <span>
          {cz ? 'Sloučení ' : 'Merge '}{index + 1}{cz ? ' z ' : ' of '}{merges.length}:{' '}
          {m.lr1States.map(lr1Name).join(' + ')} → {lalrName(m.lalrState)}
        </span>
        <button type="button" className="btn btn-secondary" disabled={index >= merges.length - 1} onClick={() => onIndex(index + 1)} aria-label={cz ? 'Další sloučení' : 'Next merge'}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="data-table-container">
        <table className="data-table merge-table">
          <thead>
            <tr>
              <th>{cz ? 'Položka (jádro)' : 'Item (core)'}</th>
              {m.lr1States.map(id => <th key={id}>LR(1) {lr1Name(id)}</th>)}
              <th>LALR(1) {lalrName(m.lalrState)}</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row, r) => {
              const complete = row.item.dotIndex === row.item.production.rhs.length;
              return (
                <tr key={r}>
                  <td className="merge-item">{formatItem(row.item.production, row.item.dotIndex)}</td>
                  {row.perState.map((las, c) => <td key={c} className="merge-la">{las.join(' / ') || '∅'}</td>)}
                  <td className="merge-la">
                    {row.union.map((la, k) => (
                      <React.Fragment key={la}>
                        {k > 0 && ' / '}
                        <span className={complete && conflictSymbols.has(la) ? 'merge-conflict' : ''}>{la}</span>
                      </React.Fragment>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {m.newConflicts.length > 0 ? (
        <div className="report-box danger" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {cz ? 'Sloučení vytvořilo konflikt' : 'The merge created a conflict'}
          </div>
          {m.newConflicts.map((c, i) => (
            <div key={i} style={{ marginTop: '3px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              {cz ? `na symbolu '${c.symbol}': ` : `on '${c.symbol}': `}
              {c.actions.map(a => formatLayoutAction(a, layout, lang) + (a.production ? ` (${a.production.lhs} → ${a.production.rhs.join(' ') || 'ε'})` : '')).join(' × ')}
            </div>
          ))}
          <div style={{ marginTop: '4px', fontSize: '12px' }}>
            {cz
              ? 'Žádný ze slučovaných stavů LR(1) tento konflikt neměl: ve sjednocení se potkaly dopředu prohlížené symboly úplných položek z různých stavů. Gramatika je LR(1), ale ne LALR(1).'
              : 'None of the merged LR(1) states had this conflict: the union brings together lookaheads of complete items from different states. The grammar is LR(1) but not LALR(1).'}
          </div>
        </div>
      ) : (
        <div className="report-box success" style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <CheckCircle2 size={14} />
          {cz ? 'Sloučení nevytvořilo žádný nový konflikt.' : 'The merge created no new conflict.'}
        </div>
      )}
    </div>
  );
};


/** A cell of the action table without targets: P / R2 / A (lecture, Czech), s / r2 / acc otherwise. */
function cellText(cell: LRCellAction[], lang: Language, layout: LRLayout): string {
  const cz = lang === 'cz';
  const one = (a: LRCellAction) => formatLectureAction(a as LRAction, layout === 'lecture' ? lang : 'en');
  if (cell.length === 0) return cz ? 'chybu (%nonassoc)' : 'an error (%nonassoc)';
  if (cell.length === 1) return cz ? `akci ${one(cell[0])}` : `the action ${one(cell[0])}`;
  return cz ? `kolizi ${cell.map(one).join(' × ')}` : `the conflict ${cell.map(one).join(' × ')}`;
}

/** One sentence: why IELR(1) did not merge the LR(1) states of a core. */
export function ielrReasonText(r: IELRSplitReason, lang: Language, layout: LRLayout): string {
  const cz = lang === 'cz';
  if (r.kind === 'successor') {
    return cz
      ? `Přechod přes ${r.symbol}: stavy LR(1) vedou do různých (rozdělených) stavů IELR(1), proto se musí rozdělit i tento stav, aby přechod zůstal jednoznačný.`
      : `Transition over ${r.symbol}: the LR(1) states go to different (split) IELR(1) states, so this state has to be split too to keep the transition deterministic.`;
  }
  const parts = r.parts.map(c => cellText(c, lang, layout)).join(cz ? ' nebo ' : ' or ');
  if (r.newConflict) {
    return cz
      ? `Symbol ${r.symbol}: sloučený stav by měl ${cellText(r.mergedRaw, lang, layout)}, kterou priority nerozhodnou, ačkoli žádný z těchto stavů LR(1) na symbolu ${r.symbol} kolizi nemá (mají ${parts}); IELR(1) nepřidává kolize tam, kde je kanonický LR(1) nemá.`
      : `Symbol ${r.symbol}: the merged state would have ${cellText(r.mergedRaw, lang, layout)}, which precedence does not resolve, although none of these LR(1) states has a conflict on ${r.symbol} (they have ${parts}); IELR(1) adds no conflicts where canonical LR(1) has none.`;
  }
  const merged = r.mergedRaw.length > 1
    ? (cz ? `${cellText(r.mergedRaw, lang, layout)} rozhodnutou na ${cellText(r.merged, lang, layout)}` : `${cellText(r.mergedRaw, lang, layout)} resolved to ${cellText(r.merged, lang, layout)}`)
    : cellText(r.merged, lang, layout);
  return cz
    ? `Symbol ${r.symbol}: sloučený stav by měl ${merged}, stavy LR(1) tohoto jádra ale mají po rozhodnutí kolizí ${parts}; sloučení by změnilo chování kanonického LR(1).`
    : `Symbol ${r.symbol}: the merged state would have ${merged}, but after conflict resolution the LR(1) states of this core have ${parts}; merging would change the behaviour of canonical LR(1).`;
}

/** The rule of conflict resolution IELR(1) keeps (one sentence for the panels). */
export function ielrResolutionNote(lang: Language): string {
  return lang === 'cz'
    ? 'Parser IELR(1) se chová jako kanonický LR(1) po rozhodnutí kolizí (priority a asociativita, jinak výchozí pravidlo Bisonu: přesun před redukcí, dřívější pravidlo při kolizi redukce-redukce). Surová tabulka IELR(1) proto může ve sloučeném stavu ukázat kolizi, kterou jeden ze stavů LR(1) neměl – rozhodnutá akce je stejná.'
    : "The IELR(1) parser behaves like canonical LR(1) after conflict resolution (precedence and associativity, otherwise Bison's default: shift before reduce, the earlier rule in a reduce/reduce conflict). The raw IELR(1) table can therefore show a conflict in a merged state where one of the LR(1) states had none; the resolved action is the same.";
}

/** Bison's default choice in a conflict: shift, otherwise the earliest rule. */
function defaultChoice(actions: LRAction[]): LRAction {
  return actions.find(a => a.type === 'shift') ?? [...actions].sort((a, b) => (a.production?.id ?? 0) - (b.production?.id ?? 0))[0];
}

/** The cores of the IELR(1) automaton: which LR(1) states were merged, which were not, and why. */
export const IELRPanel: React.FC<{
  groups: IELRSplitGroup[];
  index: number;
  onIndex: (i: number) => void;
  ielrName: (id: number) => string;
  lalrName: (id: number) => string;
  lr1Name: (id: number) => string;
  ielrStates: number;
  lalrStates: number;
  lr1States: number;
  layout: LRLayout;
  lang: Language;
}> = ({ groups, index, onIndex, ielrName, lalrName, lr1Name, ielrStates, lalrStates, lr1States, layout, lang }) => {
  const cz = lang === 'cz';
  const splitCount = groups.filter(g => g.isSplit).length;
  const fmt = (a: LRAction) => formatLayoutAction(a, layout, lang);
  const conflictText = (c: { symbol: string; actions: LRAction[] }) => `${c.symbol}: ${c.actions.map(fmt).join(' × ')}`;
  const summary = cz
    ? `IELR(1) slučuje stavy LR(1) se stejným jádrem jen tehdy, když se tím po rozhodnutí kolizí nezmění žádná akce. Z ${groups.length} jader ${splitCount > 0 ? `${splitCount === 1 ? 'bylo rozděleno 1' : `bylo rozděleno ${splitCount}`}: IELR(1) má ${ielrStates} stavů, LALR(1) ${lalrStates}, LR(1) ${lr1States}.` : `nebylo nutné rozdělit žádné: IELR(1) má stejné stavy jako LALR(1) (${ielrStates}; LR(1) má ${lr1States}).`}`
    : `IELR(1) merges the LR(1) states with the same core only when this changes no action after conflict resolution. Of ${groups.length} cores, ${splitCount > 0 ? `${splitCount} ${splitCount === 1 ? 'was' : 'were'} split: IELR(1) has ${ielrStates} states, LALR(1) ${lalrStates}, LR(1) ${lr1States}.` : `none had to be split: IELR(1) has the states of LALR(1) (${ielrStates}; LR(1) has ${lr1States}).`}`;

  if (groups.length === 0) {
    return (
      <div className="construction-step">
        <p>{cz ? 'Pro IELR(1) nejsou k dispozici žádná data o jádrech.' : 'No core data available for IELR(1).'}</p>
      </div>
    );
  }

  const safeIdx = Math.min(Math.max(0, index), groups.length - 1);
  const g = groups[safeIdx];
  const states = g.ielrStates.map(ielrName).join(', ');

  return (
    <div className="construction-step">
      <p className="hint-text" style={{ marginTop: 0 }}>{summary} {ielrResolutionNote(lang)}</p>
      <div className="membership-pager" style={{ marginBottom: '6px' }}>
        <button type="button" className="btn btn-secondary" disabled={safeIdx === 0} onClick={() => onIndex(safeIdx - 1)} aria-label={cz ? 'Předchozí jádro' : 'Previous core'}>
          <ChevronLeft size={14} />
        </button>
        <span>
          {cz ? 'Jádro ' : 'Core '}{safeIdx + 1}{cz ? ' z ' : ' of '}{groups.length}:{' '}
          <span className={`construction-badge ${g.isSplit ? 'new' : 'existing'}`}>
            {g.isSplit
              ? (cz ? `rozdělené do stavů ${states}` : `split into states ${states}`)
              : (cz ? `jediný stav ${states}` : `single state ${states}`)}
          </span>
        </span>
        <button type="button" className="btn btn-secondary" disabled={safeIdx >= groups.length - 1} onClick={() => onIndex(safeIdx + 1)} aria-label={cz ? 'Další jádro' : 'Next core'}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="data-table-container">
        <table className="data-table merge-table">
          <thead>
            <tr>
              <th>{cz ? 'Položka (LR(0) jádro)' : 'Item (LR(0) core)'}</th>
              {g.ielrStates.map((id, c) => (
                <th key={id}>
                  IELR(1) {ielrName(id)}
                  <div style={{ fontWeight: 400, fontSize: '11px' }}>{cz ? 'z LR(1) ' : 'from LR(1) '}{g.lr1States[c].map(lr1Name).join(', ')}</div>
                </th>
              ))}
              {g.isSplit && <th>LALR(1) {g.lalrState !== undefined ? lalrName(g.lalrState) : ''}</th>}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((row, r) => (
              <tr key={r}>
                <td className="merge-item">{formatItem(row.item.production, row.item.dotIndex)}</td>
                {row.perIelrState.map((las, c) => <td key={c} className="merge-la">{las.join(' / ') || '∅'}</td>)}
                {g.isSplit && <td className="merge-la">{row.lalrUnion.join(' / ') || '∅'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.isSplit ? (
        <div className="report-box warning" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {cz ? 'Proč se jádro dělí' : 'Why the core is split'}
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px' }}>
            {g.reasons.map((r, i) => <li key={i}>{ielrReasonText(r, lang, layout)}</li>)}
          </ul>
          {g.mergeConflicts.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              {cz
                ? `LALR(1), který slučuje celé jádro, má proto ve stavu ${g.lalrState !== undefined ? lalrName(g.lalrState) : ''} ${g.mergeConflicts.length === 1 ? 'kolizi vzniklou' : 'kolize vzniklé'} sloučením (${g.mergeConflicts.map(conflictText).join('; ')}); IELR(1) ${g.mergeConflicts.length === 1 ? 'ji' : 'je'} nemá.`
                : `LALR(1), which merges the whole core, therefore has ${g.mergeConflicts.length === 1 ? 'a conflict' : 'conflicts'} caused by the merge in state ${g.lalrState !== undefined ? lalrName(g.lalrState) : ''} (${g.mergeConflicts.map(conflictText).join('; ')}); IELR(1) does not.`}
            </p>
          )}
        </div>
      ) : (
        <div className="report-box success" style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <CheckCircle2 size={14} />
          {g.lr1States[0].length > 1
            ? (cz ? 'Sloučení všech stavů LR(1) tohoto jádra nezmění po rozhodnutí kolizí žádnou akci: jádro má jediný stav, jako v LALR(1).' : 'Merging all LR(1) states of this core changes no action after conflict resolution: the core has a single state, as in LALR(1).')
            : (cz ? 'Jádro má jediný stav LR(1), není co slučovat.' : 'The core has a single LR(1) state, there is nothing to merge.')}
        </div>
      )}
      {g.remainingConflicts.length > 0 && (
        <ul className="hint-text" style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
          {g.remainingConflicts.map((c, i) => (
            <li key={i}>
              {c.lr1WithoutConflict.length === 0
                ? (cz
                    ? `Kolize ${ielrName(c.state)} ${conflictText(c)} zůstává: mají ji i stavy LR(1) ${c.lr1WithConflict.map(lr1Name).join(', ')}, sloučením nevznikla.`
                    : `The conflict ${ielrName(c.state)} ${conflictText(c)} remains: the LR(1) states ${c.lr1WithConflict.map(lr1Name).join(', ')} have it too, it is not caused by merging.`)
                : (cz
                    ? `Kolize ${ielrName(c.state)} ${conflictText(c)}: má ji stav LR(1) ${c.lr1WithConflict.map(lr1Name).join(', ')}, stav LR(1) ${c.lr1WithoutConflict.map(lr1Name).join(', ')} má na tomto symbolu jen jednu akci; ta je stejná jako rozhodnutí kolize (${fmt(defaultChoice(c.actions))}), proto sloučení chování nemění.`
                    : `The conflict ${ielrName(c.state)} ${conflictText(c)}: the LR(1) state ${c.lr1WithConflict.map(lr1Name).join(', ')} has it, the LR(1) state ${c.lr1WithoutConflict.map(lr1Name).join(', ')} has a single action on this symbol, the same as the resolution of the conflict (${fmt(defaultChoice(c.actions))}), so merging does not change the behaviour.`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
