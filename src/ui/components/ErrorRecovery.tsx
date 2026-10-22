/**
 * Optional panic-mode error recovery in the LL and LR simulators: the switch with its
 * explanation, the panel of the current recovery step, and the list of errors found.
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

export const RecoveryToggle: React.FC<{
  enabled: boolean;
  onChange: (on: boolean) => void;
  method: 'll' | 'lr';
  lang: Language;
}> = ({ enabled, onChange, method, lang }) => {
  const cz = lang === 'cz';
  return (
    <div className="recovery-toggle">
      <label className="recovery-toggle-label">
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
        <ShieldAlert size={14} />
        <span>{cz ? 'Zotavení z chyb (panický režim)' : 'Error recovery (panic mode)'}</span>
      </label>
      {enabled && (
        <details className="recovery-help">
          <summary>{cz ? 'Kdy panický režim začíná a kdy končí' : 'When panic mode starts and when it ends'}</summary>
          {method === 'll' ? (
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

export const RecoveryStepBox: React.FC<{ info: RecoveryInfo; method: 'll' | 'lr'; lang: Language }> = ({ info, method, lang }) => {
  const cz = lang === 'cz';
  const label = KIND_LABELS[info.kind][cz ? 'cz' : 'en'];
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
            {method === 'll' && info.nonTerminal
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
      {method === 'll' && info.resumeSet && info.nonTerminal && (
        <div className="recovery-sets">
          <span className="recovery-set-label">FIRST({info.nonTerminal}){cz ? ' — pokračovat' : ' — resume'}:</span>
          {info.resumeSet.length === 0 ? <span className="hint-text">∅</span> : info.resumeSet.map(s => (
            <span key={s} className={`token-chip ${info.token === s ? 'recovery-hit' : ''}`}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export const RecoveryErrorsList: React.FC<{ errors: RecoveredError[]; tokens: string[]; lang: Language }> = ({ errors, tokens, lang }) => {
  const cz = lang === 'cz';
  return (
    <ol className="recovery-errors">
      {errors.map(e => (
        <li key={e.number}>
          <span>
            {cz ? `u symbolu ${e.position + 1}` : `at symbol ${e.position + 1}`} ('{tokens[e.position] ?? '$'}'): {cz ? e.messageCz : e.messageEn}
          </span>
          <span className="hint-text">
            {cz
              ? ` — zahozeno ${e.skipped} symbol(ů) vstupu, ze zásobníku vyjmuto ${e.popped}`
              : ` — ${e.skipped} input symbol(s) thrown away, ${e.popped} stack entr${e.popped === 1 ? 'y' : 'ies'} given up`}
          </span>
        </li>
      ))}
    </ol>
  );
};
