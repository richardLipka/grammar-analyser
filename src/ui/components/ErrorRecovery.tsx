/**
 * Optional panic-mode error recovery in the LL and LR simulators and in the step
 * simulators of recursive descent (Wirth's stop symbols) and recursive ascent: the
 * switch with its explanation, the panel of the current recovery step, and the list
 * of errors found.
 */
import React from 'react';
import { RecoveredError, RecoveryInfo } from '../../core/analyser/errorRecovery';
import { Language } from '../../i18n/translations';
import { ShieldAlert } from 'lucide-react';

const KIND_LABELS: Record<RecoveryInfo['kind'], { en: string; cz: string }> = {
  start: { en: 'error found — panic mode starts', cz: 'nalezena chyba — začíná panický režim' },
  skip: { en: 'panic mode: input thrown away', cz: 'panický režim: zahození vstupu' },
  pop: { en: 'panic mode: stack popped', cz: 'panický režim: odebrání ze zásobníku' },
  insert: { en: 'missing terminal — recovered', cz: 'chybějící terminál — zotaveno' },
  recovered: { en: 'recovered — the parser goes on', cz: 'zotaveno — analýza pokračuje' },
  end: { en: 'end of input with errors', cz: 'konec vstupu s chybami' },
  giveUp: { en: 'no recovery possible', cz: 'zotavení není možné' }
};

/** ll, lr: the table-driven simulators; rd: recursive descent; ra: recursive ascent */
export type RecoveryMethod = 'll' | 'lr' | 'rd' | 'ra';

/** The labels that differ in the procedures of recursive descent and ascent */
const PROCEDURE_LABELS: Partial<Record<RecoveryMethod, Partial<Record<RecoveryInfo['kind'], { en: string; cz: string }>>>> = {
  rd: {
    pop: { en: 'recovered — the procedure gives up and returns', cz: 'zotaveno — procedura se vzdá a vrátí' },
    recovered: { en: 'recovered — the procedure goes on', cz: 'zotaveno — procedura pokračuje' }
  },
  ra: {
    pop: { en: 'panic mode: a procedure returns without a result', cz: 'panický režim: procedura se vrátí bez výsledku' },
    recovered: { en: 'recovered — the goto on the error part', cz: 'zotaveno — přechod podle chybné části' }
  }
};

export const RecoveryToggle: React.FC<{
  enabled: boolean;
  onChange: (on: boolean) => void;
  method: RecoveryMethod;
  lang: Language;
  /** Extra class (e.g. inline in a row of options) */
  className?: string;
}> = ({ enabled, onChange, method, lang, className }) => {
  const cz = lang === 'cz';
  return (
    <div className={`recovery-toggle ${className ?? ''}`}>
      <label className="recovery-toggle-label">
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
        <ShieldAlert size={14} />
        <span>{cz ? 'Zotavení z chyb (panický režim)' : 'Error recovery (panic mode)'}</span>
      </label>
      {enabled && (
        <details className="recovery-help">
          <summary>{cz ? 'Kdy panický režim začíná a kdy končí' : 'When panic mode starts and when it ends'}</summary>
          {method === 'rd' ? (
            <>
              <p>
                {cz
                  ? 'Wirthova metoda z překladače PL/0 (přednáška 3): každá procedura dostane při volání množinu zastavovacích (synchronizačních) symbolů — FOLLOW svého neterminálu ∪ {$} ∪ zastavovací symboly volajícího; jsou vidět u každého rámce v zásobníku volání. Procedura začíná testem test(začátky, zastavovací symboly): není-li aktuální symbol v množině začátků (množiny řídicích symbolů jejích pravidel), nastane chyba a panický režim zahazuje vstup (getsym), dokud nepřijde symbol z některé z obou množin. Symbol z množiny začátků: procedura pokračuje; zastavovací symbol: procedura se vzdá a vrátí, pokračuje volající (a případně se vracejí i další procedury až k té, za kterou symbol smí následovat). Procedura končí testem test(zastavovací symboly, ∅): symbol, který za ní následovat nemůže, se zahodí. Chybějící terminál se považuje za doplněný (if sym = x then getsym else error).'
                  : "Wirth's method of the PL/0 compiler (lecture 3): every procedure gets, when it is called, a set of stop (synchronising) symbols — FOLLOW of its non-terminal ∪ {$} ∪ the stop symbols of the caller; they are shown at every frame of the call stack. A procedure starts with test(start set, stop symbols): when the current symbol is not in the start set (the director sets of its rules), it is an error and panic mode throws input away (getsym) until a symbol of either set comes. A symbol of the start set: the procedure goes on; a stop symbol: the procedure gives up and returns, its caller goes on (and further procedures may return, up to the one that the symbol may follow). A procedure ends with test(stop symbols, ∅): a symbol that cannot follow it is thrown away. A missing terminal is taken as inserted (if sym = x then getsym else error)."}
              </p>
              <p>
                {cz
                  ? 'Chyba, která přijde dřív, než se po zotavení přečte nějaký terminál, se počítá k předchozí. Sémantické chyby (tabulka symbolů) analýzu zastaví i se zotavením. První chyba je vždy na stejném symbolu jako v záložce LL; další se mohou lišit, protože tabulkový analyzátor používá jen FOLLOW(A), ne zastavovací symboly volajících. Programy v záložce Generovaný kód se zotavovat neumějí: končí u první chyby (ERR).'
                  : 'An error that comes before any terminal has been read after a recovery belongs to the previous one. Semantic errors (the symbol table) still stop the analysis. The first error is always at the same symbol as on the LL tab; later ones may differ, since the table-driven parser uses FOLLOW(A) only, not the stop symbols of the callers. The programs on the tab Generated code do not recover: they stop at the first error (ERR).'}
              </p>
            </>
          ) : method === 'ra' ? (
            <p>
              {cz
                ? 'Stejný panický režim jako v záložce LR analyzátory, vyjádřený voláními procedur. Začíná, když procedura stavu nemá pro aktuální symbol akci (místo ERR, který by ukončil všechny procedury). Chybná část se bude považovat za neterminál A: hledá se nejbližší procedura s na zásobníku volání s přechodem g(s, A) a symbol vstupu a ∈ FOLLOW(A), se kterým analyzátor po přechodu skutečně pokračuje (zastavovací symboly). Procedury nad s se vrátí bez výsledku (jejich stavy opustí zásobník), vstup se zahodí až po a a procedura s zavolá g(s, A), jako by se jí vrátila redukce na A. Chyba, která přijde dřív, než se po zotavení přečte nějaký terminál, se počítá k předchozí. Generované programy se nezotavují: končí u první chyby (ERR).'
                : 'The same panic mode as on the tab LR parsers, in terms of procedure calls. It starts when the procedure of a state has no action for the current symbol (instead of ERR, which would leave all procedures). The error part will be taken for a non-terminal A: the nearest procedure s on the call stack with a goto g(s, A) is looked for, with an input symbol a ∈ FOLLOW(A) with which the parser really goes on after the goto (the stop symbols). The procedures above s return without a result (their states leave the stack), input is thrown away up to a, and s calls g(s, A) as if a reduction to A had returned to it. An error that comes before any terminal has been read after a recovery belongs to the previous one. The generated programs do not recover: they stop at the first error (ERR).'}
            </p>
          ) : method === 'll' ? (
            <p>
              {cz
                ? 'Začíná, když analyzátor nemůže pokračovat: položka M[A, a] rozkladové tabulky je prázdná, terminál na vrcholu zásobníku se neshoduje se vstupem, nebo je derivace hotová a vstup pokračuje. Zastavovací symboly plynou z analýzy gramatiky: pro neterminál A na vrcholu se vstup zahazuje, dokud nepřijde symbol z FIRST(A) — pak se A analyzuje znovu — nebo z FOLLOW(A) ∪ {$} — pak se A vzdá (vyjme ze zásobníku) a pokračuje se tím, co za A následuje. Neshodný terminál se považuje za chybějící (vyjme se, jako by byl doplněn). Panický režim končí, jakmile analyzátor může pokračovat. Chyba, která přijde dřív, než se po zotavení přečte nějaký terminál, se počítá k předchozí (Wirth, překladač PL/0; Aho a kol., Compilers, §4.4.5).'
                : 'It starts when the parser cannot go on: the parse-table entry M[A, a] is empty, the terminal on top of the stack does not match the input, or the derivation is complete and the input goes on. The stop symbols come from the analysis of the grammar: for the non-terminal A on top, input is thrown away until a symbol of FIRST(A) — then A is analysed again — or of FOLLOW(A) ∪ {$} — then A is given up (popped) and the parser goes on with what follows A. A terminal that does not match is taken as missing (popped as if inserted). Panic mode ends as soon as the parser can go on. An error that comes before any terminal has been read after a recovery belongs to the previous one (Wirth, the PL/0 compiler; Aho et al., Compilers, §4.4.5).'}
            </p>
          ) : (
            <p>
              {cz
                ? 'Začíná, když je položka tabulky akcí f (ACTION) prázdná, nebo když přijímající stav přijde před koncem vstupu. Chybná část se bude považovat za neterminál A: analyzátor hledá na zásobníku od vrcholu stav s s přechodem g(s, A) a symbol vstupu a ∈ FOLLOW(A), se kterým po vložení A skutečně pokračuje (po redukcích ho přesune, nebo přijme $). Zvolí se řešení, které zahodí nejméně vstupu a pak odebere nejméně stavů; odebrané podstromy a zahozené symboly tvoří chybný podstrom A. Panický režim končí vložením A a stavu g(s, A). Chyba, která přijde dřív, než se po zotavení přesune nějaký terminál, se počítá k předchozí (Aho a kol., Compilers, §4.8.3).'
                : 'It starts when the action entry f (ACTION) is empty, or when the accepting state comes before the end of the input. The error part will be taken for a non-terminal A: the parser looks on the stack, from the top, for a state s with a transition g(s, A) and an input symbol a ∈ FOLLOW(A) with which it really goes on after pushing A (its reductions end with shifting a, or accepting $). The choice throws away the least input, then pops the fewest states; the popped subtrees and the thrown-away symbols form the error subtree of A. Panic mode ends by pushing A and the state g(s, A). An error that comes before any terminal has been shifted after a recovery belongs to the previous one (Aho et al., Compilers, §4.8.3).'}
            </p>
          )}
        </details>
      )}
    </div>
  );
};

export const RecoveryStepBox: React.FC<{ info: RecoveryInfo; method: RecoveryMethod; lang: Language }> = ({ info, method, lang }) => {
  const cz = lang === 'cz';
  const label = (PROCEDURE_LABELS[method]?.[info.kind] ?? KIND_LABELS[info.kind])[cz ? 'cz' : 'en'];
  const tone = info.kind === 'recovered' || info.kind === 'insert' ? 'ok' : info.kind === 'giveUp' || info.kind === 'end' ? 'bad' : 'panic';
  return (
    <div className={`recovery-step recovery-${tone}`}>
      <div className="recovery-step-head">
        <ShieldAlert size={13} />
        <strong>{cz ? `Chyba ${info.errorNumber}` : `Error ${info.errorNumber}`}</strong>
        <span>{label}</span>
      </div>
      {info.syncSet && (
        <div className="recovery-sets">
          <span className="recovery-set-label">
            {method === 'rd' && info.nonTerminal
              ? `${cz ? 'zastavovací symboly' : 'stop symbols'} ${info.nonTerminal}()${info.resumeSet ? (cz ? ' — vrátit se' : ' — return') : ''}:`
              : method === 'll' && info.nonTerminal
              ? `FOLLOW(${info.nonTerminal}) ∪ {$}${cz ? ' — vzdát' : ' — give up'}:`
              : info.nonTerminal
              ? `${cz ? 'zastavovací symboly' : 'stop symbols'} (${info.nonTerminal}):`
              : `${cz ? 'zastavovací symboly' : 'stop symbols'}:`}
          </span>
          {info.syncSet.map(s => (
            <span key={s} className={`token-chip ${info.token === s ? 'recovery-hit' : ''}`}>{s}</span>
          ))}
        </div>
      )}
      {(method === 'll' || method === 'rd') && info.resumeSet && info.nonTerminal && (
        <div className="recovery-sets">
          <span className="recovery-set-label">
            {method === 'rd' ? `${cz ? 'začátky' : 'start set'} ${info.nonTerminal}()` : `FIRST(${info.nonTerminal})`}{cz ? ' — pokračovat' : ' — resume'}:
          </span>
          {info.resumeSet.length === 0 ? <span className="hint-text">∅</span> : info.resumeSet.map(s => (
            <span key={s} className={`token-chip ${info.token === s ? 'recovery-hit' : ''}`}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export const RecoveryErrorsList: React.FC<{ errors: RecoveredError[]; tokens: string[]; lang: Language; method?: RecoveryMethod }> = ({ errors, tokens, lang, method }) => {
  const cz = lang === 'cz';
  const procedures = method === 'rd' || method === 'ra';
  return (
    <ol className="recovery-errors">
      {errors.map(e => (
        <li key={e.number}>
          <span>
            {cz ? `u symbolu ${e.position + 1}` : `at symbol ${e.position + 1}`} ('{tokens[e.position] ?? '$'}'): {cz ? e.messageCz : e.messageEn}
          </span>
          <span className="hint-text">
            {procedures
              ? (cz
                ? ` — zahozeno ${e.skipped} symbol(ů) vstupu, ${method === 'rd' ? 'vzdaných procedur a doplněných terminálů' : 'procedur vrácených bez výsledku'}: ${e.popped}`
                : ` — ${e.skipped} input symbol(s) thrown away, ${method === 'rd' ? 'procedures given up and terminals inserted' : 'procedures returned without a result'}: ${e.popped}`)
              : cz
              ? ` — zahozeno ${e.skipped} symbol(ů) vstupu, ze zásobníku vyjmuto ${e.popped}`
              : ` — ${e.skipped} input symbol(s) thrown away, ${e.popped} stack entr${e.popped === 1 ? 'y' : 'ies'} given up`}
          </span>
        </li>
      ))}
    </ol>
  );
};
