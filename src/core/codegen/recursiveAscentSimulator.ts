/**
 * Step simulator of a recursive-ascent program (recursiveAscent.ts): the call
 * stack is kept explicitly, so every call (shift, goto) and every return is a
 * step. A reduction by A → α takes the return of the reducing state, |α| − 1
 * further returns (each caller decrements the count) and one goto step, where
 * the table-driven parser has one step; the call stack after every step is
 * the LR state stack.
 *
 * The derivation tree grows bottom up: every frame holds the tree of its
 * symbol (a leaf after a shift), a reduction joins the trees of the handle
 * under A, and the goto gives the new tree to the frame it pushes. So a step
 * shows the forest of the stack, and acceptance the derivation tree.
 *
 * With rule actions (the symbol-table actions of recursive descent) an action
 * runs where the parser knows its rule (recursiveAscentActions.ts): on entering
 * a state whose kernel is the item of the action, otherwise at the reduction.
 * Identifiers read are declarations or uses (lookups) as in recursive descent;
 * an undeclared name and a name declared twice in one scope stop the parse
 * when stopOnSemanticErrors is on.
 */

import { Production, END_MARKER } from '../ast/grammar';
import { LRTable } from '../lr/lrTable';
import { DerivationNode, cloneTree } from '../generator/wordGenerator';
import { FOREST_ROOT_SYMBOL } from '../lr/lrParser';
import { GeneratedAscent, lineKey } from './recursiveAscent';
import { EventPlacement, kernelKeys, placementText } from './recursiveAscentActions';
import {
  SymbolTable,
  SymbolTableSnapshot,
  SymbolEntry,
  SymbolKind,
  DeclarationKeywordConfig,
  isIdentifierTerminal,
  normalizeKeywordConfig
} from './symbolTable';
import { RDLookup } from './rdSimulator';

export type AscentStepKind = 'call' | 'shift' | 'reduce' | 'epsilon' | 'return' | 'goto' | 'accept' | 'error';

/** An action run in a step, with where it was placed */
export interface AscentActionNote {
  /** The placed action; none for a lookup */
  placement?: EventPlacement;
  /** The action ran at the reduction, although recursive descent would have done it earlier */
  late: boolean;
  text: { en: string; cz: string };
}

export interface AscentStep {
  kind: AscentStepKind;
  /** The call stack after the step, bottom first: the states of the running procedures = the LR state stack */
  frames: number[];
  /** The symbol that led into each frame ('' for the initial state) */
  frameSymbols: string[];
  /** The text of each frame's symbol (the name x of an identifier); the symbol itself otherwise */
  frameLexemes: string[];
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
  /** The forest of the stack after the step (one tree, or a root ⋯ over several) */
  tree?: DerivationNode;
  /** Nodes made or joined in this step */
  activeNodeIds: string[];
  /** Actions run in this step */
  actions: AscentActionNote[];
  /** The symbol table after the step (with rule actions only) */
  symbolTable?: SymbolTableSnapshot;
  declared?: SymbolEntry;
  lookup?: RDLookup;
  /** The step ends the parse with a semantic error */
  semanticError?: boolean;
  text: { en: string; cz: string };
}

export interface AscentSimulation {
  accepted: boolean;
  steps: AscentStep[];
  rightParse: number[];
  /** The derivation tree after acceptance */
  finalTree?: DerivationNode;
  /** Stopped at the step limit (only a precedence-resolved table could loop) */
  stopped?: boolean;
  undeclared: { name: string; step: number }[];
  redeclared: { name: string; scopeName: string; step: number }[];
  /** Identifiers written as the terminal itself (id instead of x): not checked */
  unnamedIdentifiers: number;
  /** Rejected because of the symbol table, not the syntax */
  semanticError?: boolean;
}

export interface AscentOptions {
  /** The text of the input tokens (x for the terminal id) */
  lexemes?: string[];
  /** The placed events of the rule actions (placeEvents); none = parsing only */
  placements?: EventPlacement[];
  keywords?: Partial<DeclarationKeywordConfig>;
  /** An undeclared name or a name declared twice stops the parse (default true) */
  stopOnSemanticErrors?: boolean;
  maxSteps?: number;
}

const KIND_CZ: Record<SymbolKind, string> = {
  var: 'proměnná', const: 'konstanta', procedure: 'procedura', function: 'funkce', type: 'typ', param: 'parametr', custom: 'vlastní'
};

interface Frame {
  state: number;
  symbol: string;
  lexeme: string;
  tree?: DerivationNode;
  /** An identifier whose role (declaration or use) is known only at the reduction */
  pendingIdentifier?: boolean;
}

export function simulateRecursiveAscent(tokens: string[], gen: GeneratedAscent, table: LRTable, options: AscentOptions = {}): AscentSimulation {
  const maxSteps = options.maxSteps ?? 2000 + 100 * tokens.length;
  const input = [...tokens, END_MARKER];
  const lexemes = input.map((t, i) => (i < tokens.length ? options.lexemes?.[i] ?? t : t));
  const states = gen.states;
  const automaton = table.automaton!;
  const S1 = gen.augmentedStart;
  const name = (q: number) => states[q].name;
  const steps: AscentStep[] = [];
  const frames: Frame[] = [{ state: 0, symbol: '', lexeme: '' }];
  const rightParse: number[] = [];
  let pos = 0;
  let nodeCounter = 1;
  let pending: DerivationNode | undefined;
  let activeNodeIds: string[] = [];
  const rule = (p: Production) => `${p.id}: ${p.lhs} → ${p.rhs.join(' ') || 'ε'}`;

  // Symbol table
  const placements = options.placements ?? [];
  const tableActive = placements.length > 0;
  const keywords = normalizeKeywordConfig(options.keywords);
  const stopOnSemanticErrors = options.stopOnSemanticErrors ?? true;
  const symTab = new SymbolTable('global');
  const isIdentifier = (X: string) => isIdentifierTerminal(X, keywords.idSymbols);
  const isTypeKeyword = (X: string) => keywords.typeKeywords.includes(X.toLowerCase());
  let lastType = '';
  let lastDeclared = '';
  const resolveType = (t: string | undefined) => (t === '$type' ? lastType : t ?? '');
  const undeclared: { name: string; step: number }[] = [];
  const redeclared: { name: string; scopeName: string; step: number }[] = [];
  let unnamedIdentifiers = 0;
  /** `${base}:${event}`: the event ran for the rule instance whose dot-0 frame is base */
  const doneEvents = new Set<string>();
  const openedScopes = new Map<string, string>();
  const byRule = new Map<number, EventPlacement[]>();
  for (const pl of placements) byRule.set(pl.rule.id, [...(byRule.get(pl.rule.id) || []), pl]);
  for (const list of byRule.values()) list.sort((a, b) => a.dot - b.dot || a.index - b.index);
  const declaresAt = (ruleId: number, i: number) => (byRule.get(ruleId) || []).some(pl => pl.op === 'declare' && pl.symbolIndex === i);
  const kernels = automaton.states.map(s => kernelKeys(automaton, s.id).map(k => k.split('@').map(Number) as [number, number]));

  // What happens in the current step (actions, the table, a semantic error)
  let notes: AscentActionNote[] = [];
  let extra: Partial<AscentStep> = {};
  let semantic: { en: string; cz: string } | undefined;
  let semanticStop = false;
  const semanticFail = (en: string, cz: string, node?: DerivationNode) => {
    if (!stopOnSemanticErrors || semanticStop) return;
    semanticStop = true;
    semantic = {
      en: `Semantic error: ${en}. The word is correct syntactically so far, but a compiler would reject the program.`,
      cz: `Sémantická chyba: ${cz}. Syntakticky je slovo zatím v pořádku, překladač by ale program odmítl.`
    };
    if (node) node.mark = 'mismatch';
  };

  const lookupName = (lexeme: string, terminal: string, node: DerivationNode | undefined, deferred: boolean) => {
    const later = deferred ? { en: ' (decided at the reduction)', cz: ' (rozhodnuto až při redukci)' } : { en: '', cz: '' };
    const found = symTab.lookup(lexeme);
    if (found) {
      extra.lookup = { name: lexeme, scopeId: found.scope.id, scopeName: found.scope.name, level: found.scope.level, kind: found.entry.kind };
      notes.push({
        late: deferred,
        text: {
          en: `the name '${lexeme}' is found: the ${found.entry.kind} of scope '${found.scope.name}' (level ${found.scope.level})${later.en}`,
          cz: `jméno '${lexeme}' nalezeno: ${KIND_CZ[found.entry.kind]} z rozsahu '${found.scope.name}' (úroveň ${found.scope.level})${later.cz}`
        }
      });
    } else if (lexeme === terminal) {
      extra.lookup = { name: lexeme };
      notes.push({ late: deferred, text: { en: `'${lexeme}' is the terminal, not a name: it is not checked`, cz: `'${lexeme}' je terminál, ne jméno: nekontroluje se` } });
    } else {
      extra.lookup = { name: lexeme };
      undeclared.push({ name: lexeme, step: steps.length });
      notes.push({ late: deferred, text: { en: `the name '${lexeme}' is not declared in any visible scope!${later.en}`, cz: `jméno '${lexeme}' není deklarováno v žádném viditelném rozsahu!${later.cz}` } });
      semanticFail(`the name '${lexeme}' is not declared in any visible scope`, `jméno '${lexeme}' není deklarováno v žádném viditelném rozsahu`, node);
    }
  };

  const closeScope = (scopeId: string | undefined): string[] => {
    const closed: string[] = [];
    if (scopeId !== undefined && !symTab.getActiveStack().some(s => s.id === scopeId)) return closed;
    for (;;) {
      const exited = symTab.exitScope();
      if (!exited) return closed;
      closed.push(exited.name);
      if (scopeId === undefined || exited.id === scopeId) return closed;
    }
  };

  /** Runs an event for the rule instance whose dot-0 frame is `base` */
  const runEvent = (pl: EventPlacement, base: number, late: boolean) => {
    const key = `${base}:${pl.index}`;
    if (doneEvents.has(key)) return;
    doneEvents.add(key);
    const a = pl.action;
    const where = placementText(pl, name);
    const lateNote = late ? { en: ' – at the reduction, later than in recursive descent', cz: ' – při redukci, později než v rekurzivním sestupu' } : { en: '', cz: '' };
    const say = (en: string, cz: string) => notes.push({ placement: pl, late, text: { en: `${en}${lateNote.en} [${where.en}]`, cz: `${cz}${lateNote.cz} [${where.cz}]` } });
    try {
      switch (pl.op) {
        case 'declare': {
          const f = frames[base + 1 + pl.symbolIndex!];
          const lexeme = f?.lexeme ?? '';
          const kind = a.symbolKind || 'var';
          const type = resolveType(a.symbolType);
          const twice = !!symTab.lookupLocal(lexeme);
          const entry = symTab.addSymbol(lexeme, type, a.customData || {}, kind, steps.length);
          lastDeclared = lexeme;
          extra.declared = entry;
          say(
            `declare ${kind} '${lexeme}'${type ? ` : ${type}` : ''} in scope '${entry.scopeName}' (level ${entry.scopeLevel})${twice ? ' – already declared in this scope!' : ''}`,
            `deklarace: ${KIND_CZ[kind]} '${lexeme}'${type ? ` : ${type}` : ''} v rozsahu '${entry.scopeName}' (úroveň ${entry.scopeLevel})${twice ? ' – v tomto rozsahu už je deklarováno!' : ''}`
          );
          if (twice && lexeme !== f?.symbol) {
            redeclared.push({ name: lexeme, scopeName: entry.scopeName, step: steps.length });
            semanticFail(
              `the name '${lexeme}' is already declared in scope '${entry.scopeName}' (level ${entry.scopeLevel})`,
              `jméno '${lexeme}' je v rozsahu '${entry.scopeName}' (úroveň ${entry.scopeLevel}) už deklarováno`,
              f?.tree
            );
          }
          break;
        }
        case 'markType': {
          const lexeme = frames[base + 1 + pl.symbolIndex!]?.lexeme ?? '';
          const type = resolveType(a.symbolType);
          if (symTab.markType(lexeme, type)) say(`type of '${lexeme}' set to ${type}`, `typ '${lexeme}' nastaven na ${type}`);
          break;
        }
        case 'open': {
          const scopeName = (a.scopeName || `scope_${pl.rule.lhs}`).replace('$name', lastDeclared).trim() || `scope_${pl.rule.lhs}`;
          const sc = symTab.enterScope(scopeName);
          openedScopes.set(key, sc.id);
          say(`enter scope '${sc.name}' (level ${sc.level})`, `vstup do rozsahu '${sc.name}' (úroveň ${sc.level})`);
          break;
        }
        case 'close': {
          const id = openedScopes.get(`${base}:${pl.opens}`);
          if (id === undefined) break;
          openedScopes.delete(`${base}:${pl.opens}`);
          const closed = closeScope(id);
          if (closed.length > 0) say(`exit scope '${closed.join("', '")}'`, `konec rozsahu '${closed.join("', '")}'`);
          break;
        }
        case 'exit': {
          const closed = closeScope(undefined);
          if (closed.length > 0) say(`exit scope '${closed.join("', '")}'`, `konec rozsahu '${closed.join("', '")}'`);
          break;
        }
        case 'custom': {
          if (a.actionType === 'addSymbol' && a.symbolName) {
            symTab.addSymbol(a.symbolName, resolveType(a.symbolType), a.customData || {}, a.symbolKind || 'var', steps.length);
            say(`declare '${a.symbolName}'`, `deklarace '${a.symbolName}'`);
          } else if (a.actionType === 'markType' && a.symbolName) {
            symTab.markType(a.symbolName, resolveType(a.symbolType));
          } else if (a.jsCode) {
            new Function('ctx', a.jsCode)({ symTab, currentLookahead: input[pos], lookaheadIndex: pos, consumedTokens: input.slice(0, pos), rightParse: [...rightParse], stepIndex: steps.length });
            say('own code', 'vlastní kód');
          }
          break;
        }
      }
    } catch (err) {
      say(`the action failed: ${String(err)}`, `akce selhala: ${String(err)}`);
    }
  };

  /** Entering state r: the actions whose rule and position its kernel determines */
  const enterState = (r: number) => {
    if (!tableActive) return;
    const k = kernels[r];
    if (k.length !== 1) return;
    const [ruleId, dot] = k[0];
    const base = frames.length - 1 - dot;
    for (const pl of byRule.get(ruleId) || []) if (pl.dot === dot) runEvent(pl, base, false);
  };

  /** A terminal read into state r: the type read last; an identifier is a use, a declaration, or undecided */
  const readTerminal = (t: string, lexeme: string, r: number, f: Frame) => {
    if (isTypeKeyword(t)) lastType = lexeme;
    if (!tableActive || !isIdentifier(t)) return;
    const items = kernels[r];
    const declaring = items.filter(([p, d]) => declaresAt(p, d - 1)).length;
    if (lexeme === t) unnamedIdentifiers++;
    if (declaring === 0) lookupName(lexeme, t, f.tree, false);
    else if (declaring < items.length) {
      f.pendingIdentifier = true;
      notes.push({
        late: true,
        text: {
          en: `'${lexeme}' is a declaration in some items of ${name(r)} and a use in others: decided at the reduction`,
          cz: `'${lexeme}' je v některých položkách ${name(r)} deklarací a v jiných použitím: rozhodne se až při redukci`
        }
      });
    }
  };

  /** The reduction by p: the actions not run yet (late), undecided identifiers */
  const reduceActions = (p: Production) => {
    if (!tableActive) return;
    const base = frames.length - 1 - p.rhs.length;
    p.rhs.forEach((X, i) => {
      const f = frames[base + 1 + i];
      if (f?.pendingIdentifier && !declaresAt(p.id, i)) lookupName(f.lexeme, X, f.tree, true);
    });
    for (const pl of byRule.get(p.id) || []) runEvent(pl, base, pl.late || pl.dot < p.rhs.length);
    for (const pl of byRule.get(p.id) || []) {
      doneEvents.delete(`${base}:${pl.index}`);
      openedScopes.delete(`${base}:${pl.index}`);
    }
  };

  const forestTree = (): DerivationNode | undefined => {
    const trees = [...frames.slice(1).map(f => f.tree).filter((t): t is DerivationNode => !!t), ...(pending ? [pending] : [])];
    if (trees.length === 0) return undefined;
    if (trees.length === 1) return cloneTree(trees[0]);
    return { id: 'ra_forest_root', symbol: FOREST_ROOT_SYMBOL, isTerminal: false, isForestRoot: true, children: trees.map(cloneTree) };
  };

  const push = (step: Pick<AscentStep, 'kind' | 'state' | 'lookahead' | 'lineKeys' | 'text'> & Partial<AscentStep>) => {
    const actionText = notes.map(n => n.text);
    steps.push({
      ...step,
      text: actionText.length === 0 ? step.text : {
        en: `${step.text.en} Symbol table: ${actionText.map(x => x.en).join('; ')}.`,
        cz: `${step.text.cz} Tabulka symbolů: ${actionText.map(x => x.cz).join('; ')}.`
      },
      frames: frames.map(f => f.state),
      frameSymbols: frames.map(f => f.symbol),
      frameLexemes: frames.map(f => f.lexeme),
      position: pos,
      rightParse: [...rightParse],
      tree: forestTree(),
      activeNodeIds,
      actions: notes,
      ...(tableActive ? { symbolTable: symTab.snapshot() } : {}),
      ...extra
    });
    notes = [];
    extra = {};
    activeNodeIds = [];
    if (semantic) {
      const s = semantic;
      semantic = undefined;
      steps.push({
        ...steps[steps.length - 1],
        kind: 'error', semanticError: true, actions: [], declared: undefined, lookup: undefined, lineKeys: [], text: s
      });
    }
  };
  const done = (accepted: boolean): AscentSimulation => ({
    accepted, steps, rightParse,
    finalTree: accepted ? forestTree() : undefined,
    undeclared, redeclared, unnamedIdentifiers,
    semanticError: semanticStop || undefined
  });

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
      const q = frames[frames.length - 1].state;
      const left = count - 1;
      if (left > 0) {
        frames.pop();
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
      frames.push({ state: target, symbol: nt, lexeme: nt, tree: pending });
      if (pending) activeNodeIds = [pending.id];
      pending = undefined;
      enterState(target);
      push({
        kind: 'goto', state: q, lookahead: input[pos], nt, count: 0, target, lineKeys: [lineKey.goto(q, nt), lineKey.proc(target), lineKey.entry(target)],
        text: {
          en: `${name(q)} gets (${nt}, ${count}): ${count} − 1 = 0, the reduction ends here (${name(q)} is the top after popping |α| states). In its loop it calls g(${name(q)}, ${nt}) = ${name(target)}.`,
          cz: `${name(q)} dostane (${nt}, ${count}): ${count} − 1 = 0, redukce končí zde (${name(q)} je vrcholem po odebrání |α| stavů). Ve své smyčce zavolá g(${name(q)}, ${nt}) = ${name(target)}.`
        }
      });
      return !semanticStop;
    }
  };

  /** The tree of A over the handle (the top |α| frames), or over ε */
  const join = (p: Production): DerivationNode => {
    const children = p.rhs.length === 0
      ? [{ id: `ra_node_${nodeCounter++}`, symbol: 'ε', isTerminal: true }]
      : frames.slice(frames.length - p.rhs.length).map(f => f.tree!).filter(Boolean);
    for (const f of frames.slice(frames.length - p.rhs.length)) if (p.rhs.length > 0) f.tree = undefined;
    return { id: `ra_node_${nodeCounter++}`, symbol: p.lhs, isTerminal: false, children };
  };

  while (steps.length < maxSteps) {
    const q = frames[frames.length - 1].state;
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
          en: `${early ? `${cell} = accept, but the input has not been read` : `${cell} is empty`}: syntax error at '${la}' (ERR). The error leaves all procedures at once (an exception in JavaScript and Python, the flag ok = 0 in C, Oberon and PL/0).`,
          cz: `${early ? `${cell} = přijetí, ale vstup není přečten` : `${cell} je prázdné`}: syntaktická chyba u '${la}' (ERR). Chyba ukončí všechny procedury najednou (výjimka v JavaScriptu a Pythonu, příznak ok = 0 v C, Oberonu a PL/0).`
        }
      });
      return done(false);
    }
    if (action.kind === 'shift') {
      const lexeme = lexemes[pos];
      pos++;
      const leaf: DerivationNode = { id: `ra_node_${nodeCounter++}`, symbol: la, isTerminal: true };
      const f: Frame = { state: action.target, symbol: la, lexeme, tree: leaf };
      frames.push(f);
      activeNodeIds = [leaf.id];
      readTerminal(la, lexeme, action.target, f);
      enterState(action.target);
      const shown = lexeme !== la ? `'${la}' (${lexeme})` : `'${la}'`;
      push({
        kind: 'shift', state: q, lookahead: la, target: action.target, lineKeys: [actKey, lineKey.proc(action.target), lineKey.entry(action.target)],
        text: {
          en: `${cell} = shift: ${name(q)} reads ${shown} and calls g(${name(q)}, ${la}) = ${name(action.target)}; the call pushes ${name(action.target)}.`,
          cz: `${cell} = přesun: ${name(q)} přečte ${shown} a zavolá g(${name(q)}, ${la}) = ${name(action.target)}; volání vloží ${name(action.target)} na zásobník.`
        }
      });
      if (semanticStop) return done(false);
      continue;
    }
    if (action.kind === 'accept') {
      const start = automaton.augmentedProduction.rhs.join(' ');
      // the tree of S stays as the result
      pending = frames.pop()!.tree;
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
    reduceActions(p);
    const node = join(p);
    activeNodeIds = [node.id];
    if (p.rhs.length === 0) {
      const target = table.gotoTable.get(q)?.get(p.lhs);
      if (target === undefined) {
        push({
          kind: 'error', state: q, lookahead: la, production: p, lineKeys: [actKey],
          text: { en: `g(${name(q)}, ${p.lhs}) is empty: the table is inconsistent.`, cz: `g(${name(q)}, ${p.lhs}) je prázdné: tabulka je nekonzistentní.` }
        });
        return done(false);
      }
      frames.push({ state: target, symbol: p.lhs, lexeme: p.lhs, tree: node });
      enterState(target);
      push({
        kind: 'epsilon', state: q, lookahead: la, production: p, nt: p.lhs, count: 0, target, lineKeys: [actKey, lineKey.goto(q, p.lhs), lineKey.proc(target), lineKey.entry(target)],
        text: {
          en: `${cell} = reduce ${rule(p)}: prints ${p.id}. Nothing is popped (|α| = 0), so ${name(q)} itself does the goto: it calls g(${name(q)}, ${p.lhs}) = ${name(target)}.`,
          cz: `${cell} = redukce ${rule(p)}: vypíše ${p.id}. Nic se neodebírá (|α| = 0), přechod tedy provede sama ${name(q)}: zavolá g(${name(q)}, ${p.lhs}) = ${name(target)}.`
        }
      });
      if (semanticStop) return done(false);
      continue;
    }
    frames.pop();
    pending = node;
    const more = p.rhs.length - 1;
    push({
      kind: 'reduce', state: q, lookahead: la, production: p, nt: p.lhs, count: p.rhs.length, lineKeys: [actKey],
      text: {
        en: `${cell} = reduce ${rule(p)}: prints ${p.id}, joins the trees of ${p.rhs.join(' ')} under ${p.lhs} and returns (${p.lhs}, ${p.rhs.length}); ${name(q)} leaves the stack${more > 0 ? `, ${more} more state${more > 1 ? 's' : ''} will follow` : ''}.`,
        cz: `${cell} = redukce ${rule(p)}: vypíše ${p.id}, spojí stromy ${p.rhs.join(' ')} pod ${p.lhs} a vrací (${p.lhs}, ${p.rhs.length}); ${name(q)} opouští zásobník${more > 0 ? `, ${more === 1 ? 'odebere se ještě 1 stav' : more < 5 ? `odeberou se ještě ${more} stavy` : `odebere se ještě ${more} stavů`}` : ''}.`
      }
    });
    if (semanticStop) return done(false);
    if (!deliver(p.lhs, p.rhs.length)) return done(false);
  }
  return { ...done(false), stopped: true };
}
