import React from 'react';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { LRLayout, formatLayoutAction } from '../../core/lr/lrTable';
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
}> = ({ automaton, step, index, total, name, lang }) => {
  const cz = lang === 'cz';
  const lr1 = automaton.variant === 'LR(1)' || automaton.variant === 'IELR(1)';
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
              cz ? (
                <>
                  Tento stav má <strong>stejné LR(0) jádro</strong> jako stav <strong>{name(existingSameCoreState.id)}</strong> (položky <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>). Algoritmus IELR(1) jej však vytváří jako samostatný <strong>rozdělený stav</strong> (split state) s odlišnou množinou symbolů pro zkoumání dopředu (lookahead), protože jejich sloučení do jednoho stavu by způsobilo neadekvátní (falešný) LALR(1) konflikt.
                </>
              ) : (
                <>
                  This state shares the <strong>exact same LR(0) core</strong> as state <strong>{name(existingSameCoreState.id)}</strong> (items <code>{to.items0.filter(isKernel).map(it => formatItem(it.production, it.dotIndex)).join(', ')}</code>). However, the IELR(1) algorithm creates it as a separate <strong>split state</strong> with distinct lookahead symbols because merging them into a single state would cause an inadequate (spurious) LALR(1) conflict.
                </>
              )
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
          {cz
            ? `Stav s tímto jádrem a touto konfigurací lookaheadů už existuje (${name(step.to)}): nevzniká nový stav, přidá se jen přechod.`
            : `A state with this core and lookahead configuration already exists (${name(step.to)}): no new state, only the transition is added.`}
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

/** Visualisation of IELR(1) core partitioning, state splits, and spurious conflicts eliminated. */
export const IELRPanel: React.FC<{
  groups: IELRSplitGroup[];
  index: number;
  onIndex: (i: number) => void;
  ielrName: (id: number) => string;
  lalrName: (id: number) => string;
  ielrStates: number;
  lalrStates: number;
  layout: LRLayout;
  lang: Language;
}> = ({ groups, index, onIndex, ielrName, lalrName, ielrStates, lalrStates, layout, lang }) => {
  const cz = lang === 'cz';
  const splitGroups = groups.filter(g => g.isSplit);
  const splitCount = splitGroups.length;
  const summary = cz
    ? `IELR(1) analyzuje LR(0) jádra: z celkem ${groups.length} jader ${splitCount > 0 ? `bylo ${splitCount} rozděleno (vzniklo ${ielrStates} stavů oproti ${lalrStates} v LALR(1)), čímž byly izolovány parazitní konflikty bez exploze stavů plného LR(1).` : `žádné nemuselo být rozděleno (automat má shodných ${ielrStates} stavů jako LALR(1)).`}`
    : `IELR(1) analyzes LR(0) cores: of ${groups.length} total cores, ${splitCount > 0 ? `${splitCount} were split (yielding ${ielrStates} states vs ${lalrStates} in LALR(1)), eliminating spurious conflicts without full LR(1) state explosion.` : `none needed splitting (automaton has identical ${ielrStates} states to LALR(1)).`}`;

  if (groups.length === 0) {
    return (
      <div className="construction-step">
        <p>{cz ? 'Pro IELR(1) nejsou k dispozici žádná data o jádrech.' : 'No core data available for IELR(1).'}</p>
      </div>
    );
  }

  const safeIdx = Math.min(Math.max(0, index), groups.length - 1);
  const g = groups[safeIdx];

  return (
    <div className="construction-step">
      <p className="hint-text" style={{ marginTop: 0 }}>{summary}</p>
      <div className="membership-pager" style={{ marginBottom: '6px' }}>
        <button type="button" className="btn btn-secondary" disabled={safeIdx === 0} onClick={() => onIndex(safeIdx - 1)} aria-label={cz ? 'Předchozí jádro' : 'Previous core'}>
          <ChevronLeft size={14} />
        </button>
        <span>
          {cz ? 'Jádro ' : 'Core '}{safeIdx + 1}{cz ? ' z ' : ' of '}{groups.length}:{' '}
          {g.isSplit ? (
            <span className="construction-badge" style={{ backgroundColor: 'var(--color-primary-light, #e0e7ff)', color: 'var(--color-primary, #3730a3)', fontWeight: 600 }}>
              {cz ? `Rozdělené jádro (${g.ielrStates.map(ielrName).join(', ')})` : `Split core (${g.ielrStates.map(ielrName).join(', ')})`}
            </span>
          ) : (
            <span className="construction-badge" style={{ backgroundColor: 'var(--color-bg-subtle, #f3f4f6)', color: 'var(--color-text-muted)' }}>
              {cz ? `Sloučené jádro (${g.ielrStates.map(ielrName).join(', ')})` : `Merged core (${g.ielrStates.map(ielrName).join(', ')})`}
            </span>
          )}
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
              {g.ielrStates.map(id => <th key={id}>IELR(1) {ielrName(id)}</th>)}
              <th>LALR(1) {g.lalrState !== undefined ? lalrName(g.lalrState) : ''}</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((row, r) => (
              <tr key={r}>
                <td className="merge-item">{formatItem(row.item.production, row.item.dotIndex)}</td>
                {row.perIelrState.map((las, c) => <td key={c} className="merge-la">{las.join(' / ') || '∅'}</td>)}
                <td className="merge-la">{row.lalrUnion.join(' / ') || '∅'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.isSplit ? (
        <div className="report-box danger" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {cz ? 'Odstraněný parazitní LALR(1) konflikt' : 'Eliminated spurious LALR(1) conflict'}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
            {cz
              ? `V LALR(1) by sloučení těchto lookaheadů do jediného stavu vytvořilo konflikt${g.spuriousConflicts.length > 0 ? ` (${g.spuriousConflicts.map(c => `${c.symbol}: ${c.actions.map(a => formatLayoutAction(a, layout, lang)).join(' × ')}`).join('; ')})` : ''}. IELR(1) tomuto konfliktu zabránil rozdělením jádra do stavů ${g.ielrStates.map(ielrName).join(', ')}.`
              : `In LALR(1), merging these lookaheads into a single state would cause a conflict${g.spuriousConflicts.length > 0 ? ` (${g.spuriousConflicts.map(c => `${c.symbol}: ${c.actions.map(a => formatLayoutAction(a, layout, lang)).join(' × ')}`).join('; ')})` : ''}. IELR(1) prevented this conflict by splitting the core into states ${g.ielrStates.map(ielrName).join(', ')}.`}
          </p>
        </div>
      ) : (
        <div className="report-box success" style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <CheckCircle2 size={14} />
          {cz ? 'Jádro bez parazitního konfliktu: sloučení do jediného stavu je bezpečné.' : 'Core without spurious conflict: merging into a single state is safe.'}
        </div>
      )}
    </div>
  );
};

