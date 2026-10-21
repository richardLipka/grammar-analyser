/**
 * Where the semantic actions of recursive descent (RuleActionDefinition, symbolTable.ts)
 * can run in recursive ascent.
 *
 * Recursive descent knows its rule when it chooses it, so an action at any
 * position of the right-hand side runs at that position. An LR parser knows
 * the rule only where the items say so. An action that recursive descent does
 * at dot position d of rule p (before rhs[d], i.e. after rhs[d−1]) can run when
 * the parser enters a state whose kernel is exactly the item p@d: the
 * transition over rhs[d−1] then determines the rule and the position. In a
 * state whose kernel holds p@d together with other items the rule is not known
 * yet, and position 0 is never known (the item p@0 is only in closures). There
 * the action has to wait for the reduction by p. That is later than in
 * recursive descent whenever symbols of p follow the position: a scope opened
 * at the reduction comes after the names it should hold.
 *
 * Yacc places such an action with a marker, an ε-non-terminal M → ε inserted
 * at the position (a mid-rule action). That works only at a free position
 * (Purdom & Brown 1980, Horspool 1991 §4.1): where the grammar with the marker
 * is still in the same class (the table stays conflict-free). freePosition
 * reports it; the simulator itself does not insert markers.
 *
 * An identifier read is a declaration or a use (a lookup) depending on the
 * rule. It is decided when the identifier is shifted if every kernel item of
 * the state entered agrees (none declares at that position: a use); otherwise
 * at the reduction.
 */

import { Grammar, Production, cloneGrammar } from '../ast/grammar';
import { analyzeGrammar } from '../analyser/grammarAnalyser';
import {
  LRAutomaton,
  LRVariant,
  attachMergedLR1States,
  buildIELR1Automaton,
  buildLALR1Automaton,
  buildLR0Automaton,
  buildLR1Automaton,
  buildSLR1Automaton
} from '../lr/lrAutomaton';
import { LRTable, buildLRTable } from '../lr/lrTable';
import { RuleActionDefinition } from './symbolTable';

/** One thing an action does, at a dot position of its rule. */
export interface AscentEvent {
  /** Index in the list of events (stable key) */
  index: number;
  action: RuleActionDefinition;
  rule: Production;
  op: 'declare' | 'markType' | 'open' | 'close' | 'exit' | 'custom';
  /** The dot position at which recursive descent does it */
  dot: number;
  /** declare / markType: the position of the identifier in the right-hand side */
  symbolIndex?: number;
  /** close: the index of the open event of the same action */
  opens?: number;
}

export type EventWhere = 'transition' | 'mixed' | 'reduction';

export interface EventPlacement extends AscentEvent {
  /** States with the kernel exactly {rule@dot}: entering one, the parser knows the rule and the position */
  knownStates: number[];
  /** States with rule@dot in the kernel among other items: the rule is not known there */
  sharedStates: number[];
  /** transition: always on entering a known state; mixed: in some contexts at the reduction; reduction: always at the reduction */
  where: EventWhere;
  /** Symbols of the rule after the position are parsed before the action runs (in some or all contexts) */
  late: boolean;
  /** A marker M → ε at the position keeps the table conflict-free (computed only for late events) */
  freePosition?: boolean;
}

/** The events of the actions, in the order of the rules and positions (as recursive descent does them). */
export function ascentEvents(g: Grammar, actions: RuleActionDefinition[]): AscentEvent[] {
  const events: AscentEvent[] = [];
  const add = (e: Omit<AscentEvent, 'index'>) => {
    events.push({ ...e, index: events.length });
    return events.length - 1;
  };
  for (const a of actions) {
    const rule = g.productions.find(p => p.id === a.ruleId);
    if (!rule || a.actionType === 'none') continue;
    const n = rule.rhs.length;
    const last = Math.max(n - 1, 0);
    switch (a.actionType) {
      case 'addSymbol':
      case 'markType': {
        const op = a.actionType === 'addSymbol' ? 'declare' : 'markType';
        // without a position: a fixed name when the rule is chosen
        if (a.position === undefined) add({ action: a, rule, op: a.symbolName ? op : 'custom', dot: 0 });
        else add({ action: a, rule, op, dot: Math.min(a.position + 1, n), symbolIndex: a.position });
        break;
      }
      case 'enterScope': {
        const open = add({ action: a, rule, op: 'open', dot: Math.min(a.position ?? 0, n) });
        add({ action: a, rule, op: 'close', dot: Math.min((a.closeAfter ?? last) + 1, n), opens: open });
        break;
      }
      case 'exitScope':
        add({ action: a, rule, op: 'exit', dot: Math.min((a.position ?? last) + 1, n) });
        break;
      case 'custom':
        add({ action: a, rule, op: 'custom', dot: 0 });
        break;
    }
  }
  return events;
}

/** The LR(0) kernel items of a state as rule@dot keys */
export function kernelKeys(automaton: LRAutomaton, state: number): string[] {
  return automaton.states[state].items0.filter(it => it.dotIndex > 0 || it.production.id === 0).map(it => `${it.production.id}@${it.dotIndex}`);
}

export function placeEvents(g: Grammar, table: LRTable, events: AscentEvent[], options: { testFreePositions?: boolean } = {}): EventPlacement[] {
  const automaton = table.automaton!;
  const kernels = automaton.states.map(s => kernelKeys(automaton, s.id));
  const freeCache = new Map<string, boolean | undefined>();
  return events.map(e => {
    const key = `${e.rule.id}@${e.dot}`;
    const knownStates: number[] = [];
    const sharedStates: number[] = [];
    if (e.dot > 0) {
      kernels.forEach((k, q) => {
        if (!k.includes(key)) return;
        (k.length === 1 ? knownStates : sharedStates).push(q);
      });
    }
    const where: EventWhere = knownStates.length > 0 && sharedStates.length === 0 ? 'transition' : knownStates.length > 0 ? 'mixed' : 'reduction';
    // At the end of the right-hand side the reduction is the same moment
    const late = where !== 'transition' && e.dot < e.rule.rhs.length;
    let freePosition: boolean | undefined;
    if (late && options.testFreePositions !== false) {
      if (!freeCache.has(key)) freeCache.set(key, isFreePosition(g, table.variant, e.rule, e.dot));
      freePosition = freeCache.get(key);
    }
    return { ...e, knownStates, sharedStates, where, late, freePosition };
  });
}

/** Grammars larger than this are not tested for free positions (a table per position) */
const FREE_POSITION_LIMIT = 120;

/** Tables of a variant for another grammar (the grammar with a marker) */
export function buildTableOfVariant(g: Grammar, variant: LRVariant): LRTable {
  const analysis = analyzeGrammar(g, { k2: false });
  let automaton: LRAutomaton;
  switch (variant) {
    case 'LR(0)': automaton = buildLR0Automaton(g); break;
    case 'SLR(1)': automaton = buildSLR1Automaton(g, analysis); break;
    case 'LALR(1)': automaton = buildLALR1Automaton(g, analysis); break;
    case 'LR(1)': automaton = buildLR1Automaton(g, analysis); break;
    case 'IELR(1)': {
      const lalr = buildLALR1Automaton(g, analysis);
      const lr1 = buildLR1Automaton(g, analysis);
      attachMergedLR1States(lalr, lr1);
      automaton = buildIELR1Automaton(g, analysis, lr1, { usePrecedence: true });
      break;
    }
  }
  return buildLRTable(automaton, g, analysis);
}

/**
 * Is dot position d of rule p a free position: does the grammar with a fresh
 * non-terminal M → ε inserted there still have a conflict-free table of the
 * variant? (Horspool's test of a free position, with the parsing method of the table.)
 */
export function isFreePosition(g: Grammar, variant: LRVariant, p: Production, d: number): boolean | undefined {
  if (g.productions.length > FREE_POSITION_LIMIT) return undefined;
  const marked = cloneGrammar(g);
  let M = '$M';
  while (marked.nonTerminals.has(M) || marked.terminals.has(M)) M += "'";
  marked.nonTerminals.add(M);
  const rule = marked.productions.find(q => q.id === p.id)!;
  rule.rhs = [...rule.rhs.slice(0, d), M, ...rule.rhs.slice(d)];
  const maxId = Math.max(...marked.productions.map(q => q.id));
  marked.productions.push({ id: maxId + 1, lhs: M, rhs: [] });
  return buildTableOfVariant(marked, variant).isConflictFree;
}

/** What an event does, in words */
export function describeEvent(e: AscentEvent): { en: string; cz: string } {
  const r = `${e.rule.id}`;
  const sym = (i: number | undefined) => (i !== undefined ? `${e.rule.rhs[i]} (${i + 1})` : '');
  switch (e.op) {
    case 'declare':
      return { en: `rule ${r}: declare the name of ${sym(e.symbolIndex)}`, cz: `pravidlo ${r}: deklarace jména ${sym(e.symbolIndex)}` };
    case 'markType':
      return { en: `rule ${r}: the type of the name of ${sym(e.symbolIndex)}`, cz: `pravidlo ${r}: typ jména ${sym(e.symbolIndex)}` };
    case 'open':
      return { en: `rule ${r}: open the scope "${e.action.scopeName ?? ''}"`, cz: `pravidlo ${r}: otevření rozsahu „${e.action.scopeName ?? ''}“` };
    case 'close':
      return { en: `rule ${r}: close the scope "${e.action.scopeName ?? ''}"`, cz: `pravidlo ${r}: uzavření rozsahu „${e.action.scopeName ?? ''}“` };
    case 'exit':
      return { en: `rule ${r}: close the innermost scope`, cz: `pravidlo ${r}: uzavření nejvnitřnějšího rozsahu` };
    default:
      return { en: `rule ${r}: action when the rule is chosen`, cz: `pravidlo ${r}: akce při výběru pravidla` };
  }
}

/** Where and why the event runs, in words (state names given by `name`) */
export function placementText(pl: EventPlacement, name: (q: number) => string): { en: string; cz: string } {
  const pos = pl.dot === 0 ? { en: 'at the start of the rule', cz: 'na začátku pravidla' } : { en: `after ${pl.rule.rhs[pl.dot - 1]} (position ${pl.dot})`, cz: `po ${pl.rule.rhs[pl.dot - 1]} (pozice ${pl.dot})` };
  const known = pl.knownStates.map(name).join(', ');
  const shared = pl.sharedStates.map(name).join(', ');
  const marker = pl.late
    ? pl.freePosition === true
      ? { en: ' A marker M → ε at this position would keep the table conflict-free (a free position), so Yacc could place it there.', cz: ' Značka M → ε na této pozici by tabulku ponechala bez kolizí (volné místo), Yacc by tedy akci mohl umístit sem.' }
      : pl.freePosition === false
        ? { en: ' A marker M → ε at this position would cause a conflict: the position is not free, the action cannot come earlier.', cz: ' Značka M → ε na této pozici by způsobila kolizi: místo není volné, akce nemůže přijít dřív.' }
        : { en: '', cz: '' }
    : { en: '', cz: '' };
  const lateText = pl.late
    ? { en: ' Later than in recursive descent: the rest of the right-hand side is parsed before it.', cz: ' Později než v rekurzivním sestupu: zbytek pravé strany se zpracuje před ní.' }
    : { en: '', cz: '' };
  switch (pl.where) {
    case 'transition':
      return {
        en: `${pos.en}: on entering ${known}, whose kernel is only this item, so the rule is known there.`,
        cz: `${pos.cz}: při vstupu do ${known}, jehož jádro tvoří jen tato položka, pravidlo je tam tedy známo.`
      };
    case 'mixed':
      return {
        en: `${pos.en}: on entering ${known}; but in ${shared} the item shares the kernel with others, so there it waits for the reduction.${lateText.en}${marker.en}`,
        cz: `${pos.cz}: při vstupu do ${known}; v ${shared} ale položka sdílí jádro s jinými, tam tedy čeká na redukci.${lateText.cz}${marker.cz}`
      };
    default:
      return pl.dot === 0
        ? {
          en: `${pos.en}: an LR parser does not know the rule before reading its first symbol (p•0 is only in closures), so it runs at the reduction.${lateText.en}${marker.en}`,
          cz: `${pos.cz}: analyzátor LR pravidlo před přečtením jeho prvního symbolu nezná (položka s tečkou na začátku je jen v uzávěru), akce proto proběhne při redukci.${lateText.cz}${marker.cz}`
        }
        : {
          en: `${pos.en}: in ${shared || '–'} the item shares the kernel with other items, so the rule is known only at the reduction.${lateText.en}${marker.en}`,
          cz: `${pos.cz}: v ${shared || '–'} sdílí položka jádro s jinými položkami, pravidlo je tedy známo až při redukci.${lateText.cz}${marker.cz}`
        };
  }
}
