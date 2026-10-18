/**
 * Counterexample of one LR conflict (Isradisaikul & Myers 2015, Bison's -Wcounterexamples),
 * computed when the reader opens it: a unifying one (one word, two trees — the grammar is
 * ambiguous) or a non-unifying one (two derivations sharing the prefix up to •).
 */
import React, { useMemo, useState } from 'react';
import { LRAction, LRConflict, LR0_ACTION_COLUMN } from '../../core/lr/lrTable';
import { CounterexampleDerivation, CounterexampleFinder, LRCounterexample } from '../../core/lr/lrCounterexample';
import { LRVariant } from '../../core/lr/lrAutomaton';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { Language } from '../../i18n/translations';

interface Props {
  conflict: LRConflict;
  /** Finder for the table's automaton; asked only once the panel is opened. */
  finder: CounterexampleFinder;
  variant: LRVariant;
  /** The conflict state as shown in the table. */
  stateName: string;
  lang: Language;
}

/** A sentential form with the conflict point. */
const Form: React.FC<{ form: string[]; dot: number }> = ({ form, dot }) => (
  <code className="ambiguity-word" style={{ whiteSpace: 'normal' }}>
    {form.slice(0, dot).join(' ')}
    <strong style={{ color: 'var(--color-danger)', padding: '0 4px' }}>•</strong>
    {form.slice(dot).join(' ') || '$'}
  </code>
);

export const ConflictCounterexample: React.FC<Props> = ({ conflict, finder, variant, stateName, lang }) => {
  const cz = lang === 'cz';
  const [open, setOpen] = useState(false);
  const cx: LRCounterexample | null | undefined = useMemo(() => (open ? finder.forConflict(conflict) : undefined), [open, finder, conflict]);
  const t = conflict.symbol === LR0_ACTION_COLUMN ? null : conflict.symbol;

  /** The action in words; `accusative` for "potřebuje …" in Czech. */
  const actionText = (a: LRAction, shifted?: string, accusative = false) => {
    if (a.type === 'shift') return cz ? `přesun${shifted ? ` '${shifted}'` : ''}` : `shift${shifted ? ` '${shifted}'` : ''}`;
    if (a.type === 'accept') return cz ? 'přijetí' : 'accept';
    const p = a.production!;
    const rule = `(${p.id}) ${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;
    return cz ? `${accusative ? 'redukci' : 'redukce'} podle ${rule}` : `reduce by ${rule}`;
  };
  const itemText = (d: CounterexampleDerivation) => {
    const rhs = [...d.item.production.rhs];
    rhs.splice(d.item.dot, 0, '•');
    return `[${d.item.production.lhs} → ${rhs.join(' ')}]`;
  };

  return (
    <details
      className="counterexample"
      style={{ marginTop: '6px' }}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
      data-testid="conflict-counterexample"
    >
      <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>
        {cz ? 'Protipříklad ke kolizi' : 'Counterexample for the conflict'}
      </summary>
      {open && cx === null && (
        <p className="hint-text" style={{ margin: '6px 0 0' }}>
          {cz
            ? 'Protipříklad nebyl nalezen: položky kolize nejsou v žádném odvození slova. Gramatika má neterminály, které negenerují žádné slovo — nejprve ji redukujte.'
            : 'No counterexample: the conflict items occur in no derivation of a word. The grammar has non-terminals that generate no word — reduce it first.'}
        </p>
      )}
      {cx && cx.kind === 'unifying' && (
        <div style={{ marginTop: '6px', fontSize: '12px' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-warning)' }}>
            {cz ? 'Sjednocující protipříklad: gramatika je víceznačná' : 'Unifying counterexample: the grammar is ambiguous'}
          </div>
          <p style={{ margin: '4px 0' }}>
            {cz ? 'Slovo ' : 'The word '}
            <Form form={cx.word} dot={cx.dot} />
            {cz
              ? ` má dva derivační stromy. V místě • je analyzátor podle obou ve stavu ${stateName} se vstupním symbolem ${cx.lookahead} a tam se oba rozklady rozcházejí: první strom potřebuje ${actionText(cx.actions[0], cx.word[cx.dot], true)}, druhý ${actionText(cx.actions[1], cx.word[cx.dot], true)}. Žádná tabulka LR(k) tuto kolizi neodstraní; pomůže jen jiná gramatika nebo priority.`
              : ` has two derivation trees. At •, the parser is in state ${stateName} with the next symbol ${cx.lookahead} for both, and there the two parses part: the first tree needs ${actionText(cx.actions[0], cx.word[cx.dot])}, the second ${actionText(cx.actions[1], cx.word[cx.dot])}. No LR(k) table removes this conflict; only another grammar or precedence does.`}
          </p>
          <div className="ambiguity-trees">
            {cx.trees.map((tree, i) => (
              <div key={i}>
                <div className="hint-text" style={{ marginBottom: '4px' }}>
                  {cz ? `Strom ${i + 1}: ${actionText(cx.actions[i], cx.word[cx.dot])}` : `Tree ${i + 1}: ${actionText(cx.actions[i], cx.word[cx.dot])}`}
                </div>
                <DerivationTreeVisualizer rootNode={tree} height="220px" filename={`counterexample_${conflict.stateId}_${i + 1}`} lang={lang} />
              </div>
            ))}
          </div>
        </div>
      )}
      {cx && cx.kind === 'nonunifying' && (
        <div style={{ marginTop: '6px', fontSize: '12px' }}>
          <div style={{ fontWeight: 700 }}>
            {cz ? 'Nesjednocující protipříklad' : 'Non-unifying counterexample'}
          </div>
          <p style={{ margin: '4px 0' }}>
            {cx.samePrefix
              ? (cz
                ? `Dvě odvození se stejnou předponou až po místo kolize (•), která pak pokračují různě. Po přečtení předpony je analyzátor ve stavu ${stateName}${t ? ` se vstupním symbolem ${t}` : ''} a podle prvního odvození má provést jednu akci, podle druhého druhou.`
                : `Two derivations with the same prefix up to the conflict point (•) that go on differently. After the prefix the parser is in state ${stateName}${t ? ` with the next symbol ${t}` : ''}; the first derivation needs one action, the second the other.`)
              : (cz
                ? `Každá položka kolize potřebuje jinou předponu, obě předpony ale vedou do stavu ${stateName}. Kanonický LR(1) automat tyto situace rozlišuje (různé stavy); kolize vznikla tím, že je automat ${variant} sloučil.`
                : `Each conflict item needs another prefix, but both prefixes lead to state ${stateName}. The canonical LR(1) automaton keeps these situations apart (different states); the conflict arises because the ${variant} automaton merges them.`)}
            {' '}
            {cx.searchExhausted
              ? (cz
                ? 'Hledání sjednocujícího protipříkladu narazilo na svůj limit; víceznačnost tím není vyloučena.'
                : 'The search for a unifying counterexample hit its limit; ambiguity is not ruled out.')
              : (cz
                ? `Žádné slovo do délky ${cx.maxLength} nemá dva stromy, které by se rozcházely právě v této kolizi (víceznačnost obecně nelze rozhodnout).`
                : `No word up to length ${cx.maxLength} has two trees that part exactly at this conflict (ambiguity is undecidable in general).`)}
          </p>
          <div className="ambiguity-trees">
            {cx.derivations.map((d, i) => (
              <div key={i}>
                <div className="hint-text" style={{ marginBottom: '2px' }}>
                  {`${i + 1}. ${actionText(d.action, d.action.type === 'shift' ? d.form[d.dot] : undefined)} — ${cz ? 'položka' : 'item'} ${itemText(d)}`}
                </div>
                <div style={{ marginBottom: '4px' }}><Form form={d.form} dot={d.dot} /></div>
                {!d.lookaheadInContext && t && variant !== 'LR(0)' && (
                  <p className="hint-text" style={{ margin: '0 0 4px', color: 'var(--color-warning)' }}>
                    {cz
                      ? `V žádném odvození, které vede do stavu ${stateName}, nenásleduje po této redukci symbol ${t}. Redukce je v buňce jen proto, že ${t} ∈ FOLLOW(${d.item.production.lhs})${d.followWitness ? ' — např. zde:' : ' (jen díky pravidlům, která se v odvození žádného slova neuplatní).'}`
                      : `In no derivation leading to state ${stateName} does ${t} follow this reduction. The reduction is in the cell only because ${t} ∈ FOLLOW(${d.item.production.lhs})${d.followWitness ? ' — e.g. here:' : ' (only through rules no derivation of a word uses).'}`}
                    {d.followWitness && <> <Form form={d.followWitness.form} dot={d.followWitness.dot} /></>}
                    {cz ? ' LALR(1) a LR(1) počítají s výhledem v kontextu a tuto redukci zde nemají.' : ' LALR(1) and LR(1) use the lookahead in context and do not have this reduction here.'}
                  </p>
                )}
                <DerivationTreeVisualizer rootNode={d.tree} height="200px" filename={`counterexample_${conflict.stateId}_${i + 1}`} lang={lang} />
              </div>
            ))}
          </div>
        </div>
      )}
    </details>
  );
};
