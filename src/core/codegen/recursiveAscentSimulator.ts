/**
 * Step simulator of a recursive-ascent program (recursiveAscent.ts): the call
 * stack is kept explicitly, so every call (shift, goto) and every return is a
 * step. A reduction by A → α takes the return of the reducing state, |α| − 1
 * further returns (each caller decrements the count) and one goto step, where
 * the table-driven parser has one step; the call stack after every step is
 * the LR state stack.
 */

import { Production, END_MARKER } from '../ast/grammar';
import { LRTable } from '../lr/lrTable';
import { GeneratedAscent, lineKey } from './recursiveAscent';

export type AscentStepKind = 'call' | 'shift' | 'reduce' | 'epsilon' | 'return' | 'goto' | 'accept' | 'error';

export interface AscentStep {
  kind: AscentStepKind;
  /** The call stack after the step, bottom first: the states of the running procedures = the LR state stack */
  frames: number[];
  /** The symbol that led into each frame ('' for the initial state) */
  frameSymbols: string[];
  /** The state whose procedure acted */
  state: number;
  /** Tokens read so far (after the step) */
  position: number;
  /** The input symbol when the step was taken */
  lookahead: string;
  production?: Production;
  /** The pair returned (reduce, return) or received (goto, accept) */
  nt?: string;
  count?: number;
  /** The state called (shift, goto, epsilon) */
  target?: number;
  /** The parts of the program executed (see lineKey) */
  lineKeys: string[];
  /** Rule numbers of the reductions so far (right parse) */
  rightParse: number[];
  text: { en: string; cz: string };
}

export interface AscentSimulation {
  accepted: boolean;
  steps: AscentStep[];
  rightParse: number[];
  /** Stopped at the step limit (only a precedence-resolved table could loop) */
  stopped?: boolean;
}

export function simulateRecursiveAscent(
  tokens: string[],
  gen: GeneratedAscent,
  table: LRTable,
  maxSteps = 2000 + 100 * tokens.length
): AscentSimulation {
  const input = [...tokens, END_MARKER];
  const states = gen.states;
  const S1 = gen.augmentedStart;
  const name = (q: number) => states[q].name;
  const steps: AscentStep[] = [];
  const frames: number[] = [0];
  const frameSymbols: string[] = [''];
  const rightParse: number[] = [];
  let pos = 0;
  const push = (step: Omit<AscentStep, 'frames' | 'frameSymbols' | 'position' | 'rightParse'>) =>
    steps.push({ ...step, frames: [...frames], frameSymbols: [...frameSymbols], position: pos, rightParse: [...rightParse] });
  const pop = () => {
    frames.pop();
    frameSymbols.pop();
  };
  const rule = (p: Production) => `${p.id}: ${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;
  const done = (accepted: boolean): AscentSimulation => ({ accepted, steps, rightParse });

  push({
    kind: 'call', state: 0, lookahead: input[0], lineKeys: [lineKey.main, lineKey.proc(0)],
    text: {
      en: 'The main program reads the first symbol and calls the procedure of the initial state #.',
      cz: 'Hlavní program přečte první symbol a zavolá proceduru počátečního stavu #.'
    }
  });

  /** The callers receive (A, count) until it reaches 0. True: the goto was called; false: the parse ended. */
  const deliver = (nt: string, count: number): boolean => {
    for (;;) {
      const q = frames[frames.length - 1];
      const left = count - 1;
      if (left > 0) {
        pop();
        push({
          kind: 'return', state: q, lookahead: input[pos], nt, count: left, lineKeys: [lineKey.ret(q)],
          text: {
            en: `${name(q)} gets (${nt}, ${count}) and decrements the count: ${count} − 1 = ${left} > 0, so the reduction does not end here; it returns (${nt}, ${left}) and ${name(q)} leaves the stack.`,
            cz: `${name(q)} dostane (${nt}, ${count}) a sníží počet: ${count} − 1 = ${left} > 0, redukce tedy nekončí zde; vrací (${nt}, ${left}) a ${name(q)} opouští zásobník.`
          }
        });
        count = left;
        continue;
      }
      if (nt === S1) {
        push({
          kind: 'accept', state: q, lookahead: input[pos], nt, count: 0, lineKeys: [lineKey.goto(q, S1)],
          text: {
            en: `The initial state # gets (${S1}, 1), the count drops to 0, and there is no goto over ${S1}: the parse ends, the word is accepted. Right parse: ${rightParse.join(' ') || '–'}.`,
            cz: `Počáteční stav # dostane (${S1}, 1), počet klesne na 0 a přechod podle ${S1} neexistuje: analýza končí, slovo je přijato. Pravý rozklad: ${rightParse.join(' ') || '–'}.`
          }
        });
        return false;
      }
      const target = table.gotoTable.get(q)?.get(nt);
      if (target === undefined) {
        push({
          kind: 'error', state: q, lookahead: input[pos], nt, lineKeys: [lineKey.ret(q)],
          text: { en: `g(${name(q)}, ${nt}) is empty: the table is inconsistent.`, cz: `g(${name(q)}, ${nt}) je prázdné: tabulka je nekonzistentní.` }
        });
        return false;
      }
      frames.push(target);
      frameSymbols.push(nt);
      push({
        kind: 'goto', state: q, lookahead: input[pos], nt, count: 0, target, lineKeys: [lineKey.goto(q, nt), lineKey.proc(target)],
        text: {
          en: `${name(q)} gets (${nt}, ${count}): ${count} − 1 = 0, the reduction ends here (${name(q)} is the top after popping |α| states). In its loop it calls g(${name(q)}, ${nt}) = ${name(target)}.`,
          cz: `${name(q)} dostane (${nt}, ${count}): ${count} − 1 = 0, redukce končí zde (${name(q)} je vrcholem po odebrání |α| stavů). Ve své smyčce zavolá g(${name(q)}, ${nt}) = ${name(target)}.`
        }
      });
      return true;
    }
  };

  while (steps.length < maxSteps) {
    const q = frames[frames.length - 1];
    const s = states[q];
    const la = input[pos];
    const action = s.actions.find(a =>
      a.kind === 'shift' ? a.terminal === la : a.kind === 'accept' ? la === END_MARKER : s.unconditional || a.columns.includes(la)
    );
    const actKey = lineKey.act(q, s.unconditional ? '*' : la);
    const cell = `f(${name(q)}, ${la})`;
    if (!action) {
      // LR(0) accepts in every column, but only at the end of the input
      const early = table.actionTable.get(q)?.get(la)?.some(a => a.type === 'accept');
      push({
        kind: 'error', state: q, lookahead: la, lineKeys: [lineKey.err(q)],
        text: {
          en: `${early ? `${cell} = accept, but the input has not been read` : `${cell} is empty`}: syntax error at '${la}' (ERR). The error leaves all procedures at once (an exception in JavaScript and Python, the flag ok = 0 in C and PL/0).`,
          cz: `${early ? `${cell} = přijetí, ale vstup není přečten` : `${cell} je prázdné`}: syntaktická chyba u '${la}' (ERR). Chyba ukončí všechny procedury najednou (výjimka v JavaScriptu a Pythonu, příznak ok = 0 v C a PL/0).`
        }
      });
      return done(false);
    }
    if (action.kind === 'shift') {
      pos++;
      frames.push(action.target);
      frameSymbols.push(la);
      push({
        kind: 'shift', state: q, lookahead: la, target: action.target, lineKeys: [actKey, lineKey.proc(action.target)],
        text: {
          en: `${cell} = shift: ${name(q)} reads '${la}' and calls g(${name(q)}, ${la}) = ${name(action.target)}; the call pushes ${name(action.target)}.`,
          cz: `${cell} = přesun: ${name(q)} přečte '${la}' a zavolá g(${name(q)}, ${la}) = ${name(action.target)}; volání vloží ${name(action.target)} na zásobník.`
        }
      });
      continue;
    }
    if (action.kind === 'accept') {
      const start = table.automaton!.augmentedProduction.rhs.join(' ');
      pop();
      push({
        kind: 'reduce', state: q, lookahead: la, nt: S1, count: 1, lineKeys: [actKey],
        text: {
          en: `${cell} = accept: the rule 0: ${S1} → ${start} is done as a reduction, ${name(q)} returns (${S1}, 1) and leaves the stack.`,
          cz: `${cell} = přijetí: pravidlo 0: ${S1} → ${start} se provede jako redukce, ${name(q)} vrací (${S1}, 1) a opouští zásobník.`
        }
      });
      deliver(S1, 1);
      return done(steps[steps.length - 1].kind === 'accept');
    }
    const p = action.production;
    rightParse.push(p.id);
    if (p.rhs.length === 0) {
      const target = table.gotoTable.get(q)?.get(p.lhs);
      if (target === undefined) {
        push({
          kind: 'error', state: q, lookahead: la, production: p, lineKeys: [actKey],
          text: { en: `g(${name(q)}, ${p.lhs}) is empty: the table is inconsistent.`, cz: `g(${name(q)}, ${p.lhs}) je prázdné: tabulka je nekonzistentní.` }
        });
        return done(false);
      }
      frames.push(target);
      frameSymbols.push(p.lhs);
      push({
        kind: 'epsilon', state: q, lookahead: la, production: p, nt: p.lhs, count: 0, target, lineKeys: [actKey, lineKey.goto(q, p.lhs), lineKey.proc(target)],
        text: {
          en: `${cell} = reduce ${rule(p)}: prints ${p.id}. Nothing is popped (|α| = 0), so ${name(q)} itself does the goto: it calls g(${name(q)}, ${p.lhs}) = ${name(target)}.`,
          cz: `${cell} = redukce ${rule(p)}: vypíše ${p.id}. Nic se neodebírá (|α| = 0), přechod tedy provede sama ${name(q)}: zavolá g(${name(q)}, ${p.lhs}) = ${name(target)}.`
        }
      });
      continue;
    }
    pop();
    const more = p.rhs.length - 1;
    push({
      kind: 'reduce', state: q, lookahead: la, production: p, nt: p.lhs, count: p.rhs.length, lineKeys: [actKey],
      text: {
        en: `${cell} = reduce ${rule(p)}: prints ${p.id} and returns (${p.lhs}, ${p.rhs.length}); ${name(q)} leaves the stack${more > 0 ? `, ${more} more state${more > 1 ? 's' : ''} will follow` : ''}.`,
        cz: `${cell} = redukce ${rule(p)}: vypíše ${p.id} a vrací (${p.lhs}, ${p.rhs.length}); ${name(q)} opouští zásobník${more > 0 ? `, ${more === 1 ? 'odebere se ještě 1 stav' : more < 5 ? `odeberou se ještě ${more} stavy` : `odebere se ještě ${more} stavů`}` : ''}.`
      }
    });
    if (!deliver(p.lhs, p.rhs.length)) return done(false);
  }
  return { accepted: false, steps, rightParse, stopped: true };
}
