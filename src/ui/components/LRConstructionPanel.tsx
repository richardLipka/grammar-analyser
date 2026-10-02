import React from 'react';
import { LRAutomaton } from '../../core/lr/lrAutomaton';
import { LRLayout, formatLayoutAction } from '../../core/lr/lrTable';
import { ConstructionStep, MergeStep, movedItems } from '../../core/lr/lrConstruction';
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
  const lr1 = automaton.variant === 'LR(1)';
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
        {cz ? '; vznikne jádro ' : '; this gives the kernel '}
        <code>{kernel.join(', ')}</code>.
      </p>
      {step.isNew ? (
        closure.length > 0 ? (
          <p>
            {cz ? 'Takové jádro dosud nemá žádný stav, vzniká tedy nový stav; CLOSURE k němu přidá ' : 'No state has this kernel yet, so it is a new state; CLOSURE adds '}
            <code>{closure.join(', ')}</code>.
          </p>
        ) : (
          <p>{cz ? 'Takové jádro dosud nemá žádný stav, vzniká tedy nový stav (uzávěr nic nepřidá).' : 'No state has this kernel yet, so it is a new state (the closure adds nothing).'}</p>
        )
      ) : (
        <p>
          {cz
            ? `Stav s tímto jádrem už existuje (${name(step.to)}): nevzniká nový stav, přidá se jen přechod.`
            : `A state with this kernel already exists (${name(step.to)}): no new state, only the transition is added.`}
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
