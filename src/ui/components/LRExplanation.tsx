import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Production } from '../../core/ast/grammar';
import { LR0Item } from '../../core/lr/lrItem';
import { ItemReason, LookaheadExplanation, LookaheadReason } from '../../core/lr/lrExplain';
import { Language } from '../../i18n/translations';

/** A → α • β */
export function formatItem(production: Production, dotIndex: number, lookahead?: string): string {
  const rhs = production.rhs;
  const parts = [...rhs.slice(0, dotIndex), '•', ...rhs.slice(dotIndex)];
  const core = `${production.lhs} → ${parts.join(' ')}`;
  return lookahead === undefined ? core : `[${core}, ${lookahead}]`;
}

const seq = (xs: string[]) => (xs.length ? xs.join(' ') : 'ε');

export interface ExplainContext {
  lang: Language;
  /** state name in the current automaton (E₁ or 3) */
  name: (id: number) => string;
  /** state name in the canonical LR(1) automaton (for merged LALR(1) states) */
  lr1Name?: (id: number) => string;
}

/** One sentence per reason why the lookahead is in the item's lookahead set. */
export function describeLookaheadReason(r: LookaheadReason, item: LR0Item, la: string, ctx: ExplainContext): string {
  const cz = ctx.lang === 'cz';
  switch (r.kind) {
    case 'initial':
      return cz
        ? `${la} je konec vstupu: počáteční položka [S' → • S, ${la}] je dána konstrukcí.`
        : `${la} is the end of the input: the initial item [S' → • S, ${la}] is given by the construction.`;
    case 'goto':
      return cz
        ? `Převzat beze změny přechodem g(${ctx.name(r.from)}, ${r.symbol}) z položky ${formatItem(item.production, item.dotIndex - 1, la)} stavu ${ctx.name(r.from)}: posunem tečky se dopředu prohlížený symbol nemění.`
        : `Carried over unchanged by g(${ctx.name(r.from)}, ${r.symbol}) from the item ${formatItem(item.production, item.dotIndex - 1, la)} of state ${ctx.name(r.from)}: moving the dot does not change the lookahead.`;
    case 'first': {
      const B = r.parent.production.rhs[r.parent.dotIndex];
      return cz
        ? `Uzávěr položky ${formatItem(r.parent.production, r.parent.dotIndex)}: za ${B} následuje β = ${seq(r.beta)} a ${la} ∈ FIRST(β).`
        : `Closure of the item ${formatItem(r.parent.production, r.parent.dotIndex)}: ${B} is followed by β = ${seq(r.beta)} and ${la} ∈ FIRST(β).`;
    }
    case 'inherit': {
      const B = r.parent.production.rhs[r.parent.dotIndex];
      const empty = r.beta.length === 0;
      return cz
        ? `Uzávěr položky ${formatItem(r.parent.production, r.parent.dotIndex, la)}: za ${B} ${empty ? 'už nic nenásleduje (β = ε)' : `následuje β = ${seq(r.beta)} ⇒* ε`}, proto ${la} ∈ FIRST(β ${la}) – předá se dopředu prohlížený symbol položky.`
        : `Closure of the item ${formatItem(r.parent.production, r.parent.dotIndex, la)}: ${empty ? `nothing follows ${B} (β = ε)` : `${B} is followed by β = ${seq(r.beta)} ⇒* ε`}, so ${la} ∈ FIRST(β ${la}) – the item's lookahead is passed on.`;
    }
  }
}

/** Why an item is in its state. */
export function describeItemReason(r: ItemReason, item: LR0Item, ctx: ExplainContext): string {
  const cz = ctx.lang === 'cz';
  switch (r.kind) {
    case 'initial':
      return cz ? 'Počáteční položka rozšířené gramatiky.' : 'The initial item of the augmented grammar.';
    case 'goto':
      return cz
        ? `Jádro: z položky ${formatItem(item.production, item.dotIndex - 1)} stavu ${ctx.name(r.from)} posunem tečky přes ${r.symbol}.`
        : `Kernel: from the item ${formatItem(item.production, item.dotIndex - 1)} of state ${ctx.name(r.from)} by moving the dot over ${r.symbol}.`;
    case 'closure':
      return cz
        ? `Uzávěr: v položce ${formatItem(r.parent.production, r.parent.dotIndex)} stojí tečka před ${item.production.lhs}.`
        : `Closure: the item ${formatItem(r.parent.production, r.parent.dotIndex)} has the dot before ${item.production.lhs}.`;
  }
}

/** Tooltip body: why `la` is a lookahead of the item. */
export const LookaheadExplanationView: React.FC<{
  explanation: LookaheadExplanation;
  production: Production;
  dotIndex: number;
  lookahead: string;
  ctx: ExplainContext;
}> = ({ explanation, production, dotIndex, lookahead, ctx }) => {
  const cz = ctx.lang === 'cz';
  const { reasons, mergedFrom, lr1States } = explanation;
  const shown = reasons.slice(0, 4);
  return (
    <div className="lr-explain">
      <div className="lr-explain-title">
        {cz ? 'Proč je ' : 'Why '}<strong>{lookahead}</strong>{cz ? ' dopředu prohlížený symbol položky' : ' is a lookahead of'}
        <div className="lr-explain-item">{formatItem(production, dotIndex, lookahead)}</div>
      </div>
      {reasons.length === 0 ? (
        <div className="lr-explain-error">{cz ? 'Žádný důvod nenalezen.' : 'No reason found.'}</div>
      ) : (
        <ol>
          {shown.map((r, i) => (
            <li key={i}>
              {i === 1 && <span className="lr-explain-also">{cz ? 'také: ' : 'also: '}</span>}
              {describeLookaheadReason(r, { production, dotIndex }, lookahead, ctx)}
            </li>
          ))}
          {reasons.length > shown.length && <li className="lr-explain-also">… +{reasons.length - shown.length}</li>}
        </ol>
      )}
      {mergedFrom && mergedFrom.length > 1 && ctx.lr1Name && (
        <div className="lr-explain-note">
          {cz
            ? `LALR(1): stav vznikl sloučením stavů LR(1) ${mergedFrom.map(ctx.lr1Name).join(', ')} se stejným jádrem; ${lookahead} má tato položka v ${lr1States!.map(ctx.lr1Name).join(', ')}.`
            : `LALR(1): the state merges the LR(1) states ${mergedFrom.map(ctx.lr1Name).join(', ')} with the same core; this item has ${lookahead} in ${lr1States!.map(ctx.lr1Name).join(', ')}.`}
        </div>
      )}
    </div>
  );
};

/** A tooltip placed next to an anchor rectangle (viewport coordinates), kept inside the window. */
export const FloatingTip: React.FC<{ anchor: DOMRect; children: React.ReactNode }> = ({ anchor, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - w / 2, window.innerWidth - w - 8));
    const below = anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below;
    setPos({ left, top });
  }, [anchor.left, anchor.top, anchor.width, anchor.bottom]);
  // In <body>, so no transformed or clipped ancestor can move or cut the tooltip
  return createPortal(
    <div ref={ref} className="lr-tip" role="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {children}
    </div>,
    document.body
  );
};
