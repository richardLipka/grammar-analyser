/**
 * Recursive ascent: an LR parser written as one procedure per LR state, the
 * LR analogue of recursive descent (Roberts 1988, Kruseman Aretz 1988,
 * Leermakers, Augusteijn & Kruseman Aretz 1992; Horspool 1991/1993, §5.2).
 *
 * The procedure of state q is called after the shift into q (the caller has
 * read the terminal, or it is a goto over a non-terminal). It looks at the
 * current input symbol and
 * - shift t (to r): reads t and calls the procedure of r;
 * - reduce by A → α, |α| > 0: prints the rule number (the right parse) and
 *   returns (A, |α|): q's own return pops q, and every caller decrements the
 *   count and returns as long as it is not 0 — Horspool's multi-level
 *   "return* k" simulated by ordinary returns;
 * - reduce by A → ε: nothing is popped, so q does the goto itself;
 * - accept: the reduction by rule 0 S' → S, returning (S', 1) to the initial
 *   state #, which has no goto over S' and ends the parse.
 * The caller in which the count reaches 0 is the state on top of the LR stack
 * after popping |α| states: it calls the procedure of goto(state, A) and
 * repeats this in a loop for the result of that call (Horspool's
 * `while (TRUE)` part). So the call stack is the LR state stack, and the
 * returned count is the number of states that still have to be popped.
 *
 * Targets: JavaScript (run in the app), Python, C and PL/0. PL/0 has neither
 * function results nor forward declarations: the result is in the global
 * variables lhs and cnt, and one procedure `state` gets the state number in
 * `which` and keeps it in its local `mine` (its activation records are the
 * LR stack). Oberon is not generated: it has function procedures and
 * procedure variables, so it would be the C program in other words, and it
 * could not be run here.
 *
 * The input is the one of the recursive-descent programs (tokenCodes): every
 * terminal one character, spaces skipped, $ at the end. Output: the right
 * parse (the rule numbers of the reductions in their order, as the
 * table-driven LR parser lists them), then OK, or ERR and the symbol where
 * the error was found.
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { LRTable, LRAction } from '../lr/lrTable';
import { LRState } from '../lr/lrAutomaton';
import { groupLR1Items } from '../lr/lrItem';
import {
  TokenCode,
  tokenCodes,
  PUNCT_NAMES,
  RESERVED_NAMES,
  isKeyword,
  ruleText,
  inParens,
  inC,
  cChar,
  pyChar,
  jsChar
} from './recursiveDescent';

/** One branch of a state procedure: what the state does on some input symbols. */
export type AscentAction =
  | { kind: 'shift'; terminal: string; target: number }
  | { kind: 'reduce'; production: Production; columns: string[] }
  | { kind: 'accept' };

export interface AscentState {
  id: number;
  /** Lecture name: E₁, # */
  name: string;
  /** ASCII form of the lecture name (E1, start), used for PL/0 */
  asciiName: string;
  /** Identifier of the procedure */
  proc: string;
  /** Items, kernel first, as text (with lookaheads for LALR(1), IELR(1) and LR(1)) */
  items: string[];
  /** Branches in the order of the columns of the table */
  actions: AscentAction[];
  /** The only branch, taken whatever the input symbol (a reduce state of LR(0)) */
  unconditional: boolean;
  /** goto(state, A) for the non-terminals A */
  gotos: { nt: string; target: number }[];
}

/** Code lines (1-based) of the parts of the program, by key: see lineKey. */
export type LineMap = Map<string, number>;

/**
 * Keys of the line map:
 * - proc:q — the header of the procedure of q (PL/0: its `if mine = q`);
 * - act:q:t — the branch of q for the input symbol t ($ included); act:q:* for an unconditional one;
 * - err:q — the syntax error of q; goto:q:A — the goto of q over A; ret:q — q returns the count;
 * - head:q, end:q — the first line (the comment) and the last line of the procedure of q;
 * - main — the start of the parse.
 */
export const lineKey = {
  proc: (q: number) => `proc:${q}`,
  act: (q: number, t: string) => `act:${q}:${t}`,
  err: (q: number) => `err:${q}`,
  goto: (q: number, A: string) => `goto:${q}:${A}`,
  ret: (q: number) => `ret:${q}`,
  /** the first line (the comment with the items) and the last line of the procedure of q */
  head: (q: number) => `head:${q}`,
  end: (q: number) => `end:${q}`,
  main: 'main'
};

export type AscentLang = 'js' | 'python' | 'c' | 'pl0';

export interface GeneratedAscent {
  tokens: TokenCode[];
  states: AscentState[];
  /** The added start symbol S' and its constant name */
  augmentedStart: string;
  ntNames: Map<string, string>;
  code: Record<AscentLang, string>;
  lines: Record<AscentLang, LineMap>;
}

/** Names the programs use themselves (besides those of recursive descent) */
/** Names the programs use themselves besides those of recursive descent (the locals nt, count of JS and Python; the PL/0 globals) */
const ASCENT_RESERVED = new Set(['nt', 'count', 'lhs', 'cnt', 'mine', 'act', 'rightParse', 'ParseError', 'state']);
const clashes = (names: Set<string>, x: string) =>
  names.has(x) || RESERVED_NAMES.has(x.toLowerCase()) || ASCENT_RESERVED.has(x) || isKeyword(x);

/** An identifier for a grammar symbol: E' → Eprime, + → plus, if-stmt → ifstmt */
function symbolIdentifier(sym: string): string {
  if (PUNCT_NAMES[sym]) return PUNCT_NAMES[sym];
  const primes = sym.match(/'+$/)?.[0].length ?? 0;
  let base = sym.replace(/'+$/, '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  if (!base) base = 'sym';
  if (!/^[A-Za-z]/.test(base)) base = `s${base}`;
  return base + (primes === 0 ? '' : primes === 1 ? 'prime' : `prime${primes}`);
}

/** A fresh name; `sep` precedes the number of a repeated one (PL/0 identifiers have no '_') */
const unique = (names: Set<string>, base: string, sep = '_') => {
  let name = base;
  for (let k = 2; clashes(names, name); k++) name = `${base}${sep}${k}`;
  names.add(name);
  return name;
};

/** Is the table usable: no conflict left (precedence may have resolved some) */
export function canGenerateAscent(table: LRTable): boolean {
  return table.isConflictFree && !!table.automaton;
}

/** The states with their branches, from the ACTION/GOTO table (the Dragon Book layout holds the shift targets). */
export function ascentStates(g: Grammar, table: LRTable, taken: Set<string>): AscentState[] {
  const automaton = table.automaton!;
  const withLookaheads = automaton.variant === 'LALR(1)' || automaton.variant === 'IELR(1)' || automaton.variant === 'LR(1)';
  const names = new Set(taken);
  return automaton.states.map(s => {
    const sn = table.stateNames[s.id];
    const asciiBase = s.id === 0 ? 'start' : symbolIdentifier(sn.symbol);
    const asciiName = sn.index !== undefined ? `${asciiBase}${sn.index}` : asciiBase;
    const row = table.actionTable.get(s.id)!;
    const actions: AscentAction[] = [];
    for (const t of table.terminals) {
      const cell: LRAction[] = row.get(t) || [];
      if (cell.length === 0) continue;
      if (cell.length > 1) throw new Error(`Conflict in state ${sn.text} on ${t}`);
      const a = cell[0];
      if (a.type === 'shift') actions.push({ kind: 'shift', terminal: t, target: a.targetState! });
      else if (a.type === 'accept') {
        // LR(0) accepts in every column, but only the end of the input is acceptance (as in the table-driven parser)
        if (t === END_MARKER) actions.push({ kind: 'accept' });
      } else {
        const same = actions.find(x => x.kind === 'reduce' && x.production.id === a.production!.id);
        if (same && same.kind === 'reduce') same.columns.push(t);
        else actions.push({ kind: 'reduce', production: a.production!, columns: [t] });
      }
    }
    const only = actions.length === 1 ? actions[0] : undefined;
    const unconditional = !!only && only.kind === 'reduce' && only.columns.length === table.terminals.length;
    const gotos = [...(table.gotoTable.get(s.id) || new Map<string, number>())].map(([nt, target]) => ({ nt, target }));
    return {
      id: s.id,
      name: sn.text,
      asciiName,
      proc: unique(names, asciiName),
      items: itemTexts(s, withLookaheads),
      actions,
      unconditional,
      gotos
    };
  });
}

function itemTexts(s: LRState, withLookaheads: boolean): string[] {
  const las = new Map(groupLR1Items(s.items1 || []).map(gi => [`${gi.production.id}@${gi.dotIndex}`, gi.lookaheads]));
  const kernel = (dot: number, id: number) => dot > 0 || id === 0;
  const items = [...s.items0].sort((a, b) => Number(kernel(b.dotIndex, b.production.id)) - Number(kernel(a.dotIndex, a.production.id)));
  return items.map(it => {
    const rhs = [...it.production.rhs.slice(0, it.dotIndex), '•', ...it.production.rhs.slice(it.dotIndex)].join(' ');
    const la = withLookaheads ? `, ${(las.get(`${it.production.id}@${it.dotIndex}`) || []).join(' / ') || '∅'}` : '';
    return `${it.production.lhs} -> ${rhs}${la}`;
  });
}

/** Text lines with the keys of some of them */
class Emitter {
  lines: string[] = [];
  map: LineMap = new Map();
  push(line: string, ...keys: string[]) {
    this.lines.push(line);
    for (const k of keys) if (!this.map.has(k)) this.map.set(k, this.lines.length);
  }
  /** Gives the last line a key */
  mark(key: string) {
    if (!this.map.has(key)) this.map.set(key, this.lines.length);
  }
  text() {
    return this.lines.join('\n') + '\n';
  }
}

export function generateRecursiveAscent(g: Grammar, table: LRTable): GeneratedAscent {
  if (!canGenerateAscent(table)) throw new Error('The table has conflicts');
  const tokens = tokenCodes(g);
  const automaton = table.automaton!;
  const augmentedStart = automaton.augmentedProduction.lhs;
  const taken = new Set<string>(tokens.map(t => t.name));
  // Constants of the non-terminals (C and PL/0)
  const ntNames = new Map<string, string>();
  for (const A of [...g.nonTerminals, augmentedStart]) ntNames.set(A, unique(taken, `n${symbolIdentifier(A)}`, 'x'));
  const states = ascentStates(g, table, taken);
  const tokenOf = new Map(tokens.map(t => [t.terminal, t]));
  const constOf = (t: string) => (t === END_MARKER ? 'tend' : tokenOf.get(t)!.name);
  const ctx: Ctx = { g, table, tokens, states, augmentedStart, ntNames, constOf };
  const js = generateJs(ctx);
  const python = generatePython(ctx);
  const c = generateC(ctx);
  const pl0 = generatePl0(ctx);
  return {
    tokens,
    states,
    augmentedStart,
    ntNames,
    code: { js: js.text(), python: python.text(), c: c.text(), pl0: pl0.text() },
    lines: { js: js.map, python: python.map, c: c.map, pl0: pl0.map }
  };
}

interface Ctx {
  g: Grammar;
  table: LRTable;
  tokens: TokenCode[];
  states: AscentState[];
  augmentedStart: string;
  ntNames: Map<string, string>;
  constOf: (t: string) => string;
}

/** The variant of the table, for the header comment */
const variantOf = (ctx: Ctx) => ctx.table.variant;
const stateTitle = (s: AscentState) => `state ${s.name} (${s.id})`;
const reduceText = (p: Production) => `reduce ${ruleText(p)}`;
const hasCount = (s: AscentState) => s.actions.some(a => a.kind === 'shift' || (a.kind === 'reduce' && a.production.rhs.length === 0)) || s.gotos.length > 0;

function generateJs(ctx: Ctx): Emitter {
  const { states, augmentedStart, constOf } = ctx;
  const out = new Emitter();
  const procOf = (q: number) => states[q].proc;
  const name = (q: number) => states[q].name;
  out.push(`// Recursive ascent, generated from the ${variantOf(ctx)} table: one function per LR state.`);
  out.push('// Every terminal is one input character; the input ends with $.');
  out.push('// Output: the right parse (the rules of the reductions), then OK, or ERR');
  out.push('// and the symbol where the error was found.');
  out.push('//');
  out.push('// A function is called after the shift into its state. After a reduction');
  out.push('// by A -> α it returns [A, |α|]: every caller decrements the count and');
  out.push('// returns it until it is 0; there it calls the state goto(state, A).');
  out.push('');
  out.push('// The terminals and their characters');
  for (const t of ctx.tokens) out.push(`const ${t.name} = ${jsChar(t.code)}; // ${t.terminal}`);
  out.push("const tend = '$';");
  out.push('');
  out.push('/**');
  out.push(' * @param {string} input - one character per terminal, ending with $');
  out.push(' * @returns {{ ok: boolean, rightParse: number[], output: string }}');
  out.push(' */');
  out.push("export function parse(input = '') {");
  out.push('  const data = String(input);');
  out.push('  let pos = 0;');
  out.push('  let sym = tend; // the current input symbol');
  out.push('  const rightParse = [];');
  out.push('  const ParseError = {};');
  out.push('');
  out.push('  function next() {');
  out.push('    while (pos < data.length && data.charCodeAt(pos) <= 32) pos++;');
  out.push('    sym = pos < data.length ? data[pos++] : tend;');
  out.push('  }');
  out.push('');
  out.push('  function error() {');
  out.push('    throw ParseError;');
  out.push('  }');
  for (const s of states) {
    out.push('');
    out.push(`  // ${stateTitle(s)}`, lineKey.head(s.id));
    for (const it of s.items) out.push(`  //   ${it}`);
    out.push(`  function ${s.proc}() {`, lineKey.proc(s.id));
    if (hasCount(s)) out.push('    let nt, count;');
    const branch = (a: AscentAction): string => {
      if (a.kind === 'shift') return `next(); [nt, count] = ${procOf(a.target)}(); count--; break; // shift ${a.terminal}: g(${s.name}, ${a.terminal}) = ${name(a.target)}`;
      if (a.kind === 'accept') return `return [${JSON.stringify(augmentedStart)}, 1]; // accept: ${ruleText(ctx.table.automaton!.augmentedProduction)}, back to #`;
      const p = a.production;
      if (p.rhs.length === 0) return `rightParse.push(${p.id}); nt = ${JSON.stringify(p.lhs)}; count = 0; break; // ${reduceText(p)}: goto here`;
      return `rightParse.push(${p.id}); return [${JSON.stringify(p.lhs)}, ${p.rhs.length}]; // ${reduceText(p)}`;
    };
    if (s.unconditional) {
      out.push(`    ${branch(s.actions[0]).replace(/ break;/, '')} (whatever the input symbol)`, lineKey.act(s.id, '*'));
    } else {
      out.push('    switch (sym) {');
      for (const a of s.actions) {
        const cols = a.kind === 'shift' ? [a.terminal] : a.kind === 'accept' ? [END_MARKER] : a.columns;
        out.push(`      ${cols.map(t => `case ${constOf(t)}:`).join(' ')} ${branch(a)}`, ...cols.map(t => lineKey.act(s.id, t)));
      }
      out.push('      default: error();', lineKey.err(s.id));
      out.push('    }');
    }
    if (!hasCount(s)) {
      out.push('  }', lineKey.end(s.id));
      continue;
    }
    if (s.gotos.length > 0 || s.id === 0) {
      out.push(`    while (count === 0) { // the reduction ends here: goto(${s.name}, nt)`);
      out.push('      switch (nt) {');
      for (const { nt, target } of s.gotos) out.push(`        case ${JSON.stringify(nt)}: [nt, count] = ${procOf(target)}(); break; // g(${s.name}, ${nt}) = ${name(target)}`, lineKey.goto(s.id, nt));
      if (s.id === 0) out.push(`        case ${JSON.stringify(augmentedStart)}: return [nt, 0]; // accepted`, lineKey.goto(s.id, augmentedStart));
      out.push('        default: error();');
      out.push('      }');
      out.push('      count--;');
      out.push('    }');
    }
    out.push('    return [nt, count];', lineKey.ret(s.id));
    out.push('  }', lineKey.end(s.id));
  }
  out.push('');
  out.push('  let ok = true;');
  out.push('  try {', lineKey.main);
  out.push('    next();');
  out.push(`    ${states[0].proc}();`);
  out.push('  } catch (e) {');
  out.push('    if (e !== ParseError) throw e;');
  out.push('    ok = false;');
  out.push('  }');
  out.push('  const parseStr = rightParse.length > 0 ? `${rightParse.join(" ")} ` : "";');
  out.push('  const output = `${parseStr}\\n${ok ? "OK" : `ERR ${sym}`}`;');
  out.push('  return { ok, rightParse, output };');
  out.push('}');
  out.push('');
  out.push('// From the command line: node parser.js < input.txt');
  out.push('if (typeof process !== "undefined" && process.argv && process.argv[1]?.endsWith("parser.js")) {');
  out.push('  (async () => {');
  out.push('    const fs = typeof require !== "undefined" ? require("fs") : (await import("fs")).default;');
  out.push('    const res = parse(fs.readFileSync(0, "utf-8"));');
  out.push('    process.stdout.write(res.output + "\\n");');
  out.push('    process.exit(res.ok ? 0 : 1);');
  out.push('  })();');
  out.push('}');
  return out;
}

function generatePython(ctx: Ctx): Emitter {
  const { states, augmentedStart, constOf } = ctx;
  const out = new Emitter();
  const procOf = (q: number) => states[q].proc;
  const name = (q: number) => states[q].name;
  const str = (x: string) => JSON.stringify(x);
  out.push(`# Recursive ascent, generated from the ${variantOf(ctx)} table: one function per LR state.`);
  out.push('# Every terminal is one input character; the input ends with $.');
  out.push('# Output: the right parse (the rules of the reductions), then OK, or ERR');
  out.push('# and the symbol where the error was found.');
  out.push('#');
  out.push('# A function is called after the shift into its state. After a reduction');
  out.push('# by A -> α it returns (A, |α|): every caller decrements the count and');
  out.push('# returns it until it is 0; there it calls the state goto(state, A).');
  out.push('import sys');
  out.push('');
  out.push('# the terminals and their characters');
  for (const t of ctx.tokens) out.push(`${t.name} = ${pyChar(t.code)}  # ${t.terminal}`);
  out.push("tend = '$'");
  out.push('');
  out.push('data = sys.stdin.read()');
  out.push('pos = 0');
  out.push('sym = tend  # the current input symbol');
  out.push('');
  out.push('');
  out.push('class ParseError(Exception):');
  out.push('    pass');
  out.push('');
  out.push('');
  out.push('def next():');
  out.push('    global sym, pos');
  out.push("    while pos < len(data) and data[pos] <= ' ':");
  out.push('        pos += 1');
  out.push('    if pos < len(data):');
  out.push('        sym = data[pos]');
  out.push('        pos += 1');
  out.push('    else:');
  out.push('        sym = tend');
  out.push('');
  out.push('');
  out.push('def error():');
  out.push('    raise ParseError()');
  for (const s of states) {
    out.push('');
    out.push('');
    out.push(`# ${stateTitle(s)}`, lineKey.head(s.id));
    for (const it of s.items) out.push(`#   ${it}`);
    out.push(`def ${s.proc}():`, lineKey.proc(s.id));
    const body = (a: AscentAction, ind: string, keys: string[]) => {
      if (a.kind === 'shift') {
        out.push(`${ind}next()`);
        out.push(`${ind}nt, count = ${procOf(a.target)}()`);
        out.push(`${ind}count -= 1`);
      } else if (a.kind === 'accept') {
        out.push(`${ind}return ${str(augmentedStart)}, 1`, ...keys);
      } else if (a.production.rhs.length === 0) {
        out.push(`${ind}print(${a.production.id}, end=' ')`);
        out.push(`${ind}nt, count = ${str(a.production.lhs)}, 0`);
      } else {
        out.push(`${ind}print(${a.production.id}, end=' ')`);
        out.push(`${ind}return ${str(a.production.lhs)}, ${a.production.rhs.length}`);
      }
    };
    const comment = (a: AscentAction) =>
      a.kind === 'shift' ? `shift ${a.terminal}: g(${s.name}, ${a.terminal}) = ${name(a.target)}`
        : a.kind === 'accept' ? `accept: ${ruleText(ctx.table.automaton!.augmentedProduction)}, back to #`
          : a.production.rhs.length === 0 ? `${reduceText(a.production)}: goto here` : reduceText(a.production);
    if (s.unconditional) {
      out.push(`    # ${comment(s.actions[0])} (whatever the input symbol)`, lineKey.act(s.id, '*'));
      body(s.actions[0], '    ', []);
    } else {
      s.actions.forEach((a, i) => {
        const cols = a.kind === 'shift' ? [a.terminal] : a.kind === 'accept' ? [END_MARKER] : a.columns;
        const cond = cols.length === 1 ? `sym == ${constOf(cols[0])}` : `sym in (${cols.map(constOf).join(', ')})`;
        out.push(`    ${i === 0 ? 'if' : 'elif'} ${cond}:  # ${comment(a)}`, ...cols.map(t => lineKey.act(s.id, t)));
        body(a, '        ', []);
      });
      if (s.actions.length === 0) out.push('    error()', lineKey.err(s.id));
      else {
        out.push('    else:', lineKey.err(s.id));
        out.push('        error()');
      }
    }
    if (!hasCount(s)) {
      out.mark(lineKey.end(s.id));
      continue;
    }
    if (s.gotos.length > 0 || s.id === 0) {
      out.push(`    while count == 0:  # the reduction ends here: goto(${s.name}, nt)`);
      s.gotos.forEach(({ nt, target }, i) => {
        out.push(`        ${i === 0 ? 'if' : 'elif'} nt == ${str(nt)}:  # g(${s.name}, ${nt}) = ${name(target)}`, lineKey.goto(s.id, nt));
        out.push(`            nt, count = ${procOf(target)}()`);
      });
      if (s.id === 0) {
        out.push(`        ${s.gotos.length === 0 ? 'if' : 'elif'} nt == ${str(augmentedStart)}:  # accepted`, lineKey.goto(s.id, augmentedStart));
        out.push('            return nt, 0');
      }
      out.push('        else:');
      out.push('            error()');
      out.push('        count -= 1');
    }
    out.push('    return nt, count', lineKey.ret(s.id), lineKey.end(s.id));
  }
  out.push('');
  out.push('');
  out.push('sys.setrecursionlimit(10000)');
  out.push('try:', lineKey.main);
  out.push('    next()');
  out.push(`    ${states[0].proc}()`);
  out.push("    print('\\nOK', end='')");
  out.push('except ParseError:');
  out.push("    print('\\nERR', sym, end='')");
  out.push('print()');
  return out;
}

function generateC(ctx: Ctx): Emitter {
  const { states, augmentedStart, constOf, ntNames } = ctx;
  const out = new Emitter();
  const procOf = (q: number) => states[q].proc;
  const name = (q: number) => states[q].name;
  out.push(`/* Recursive ascent, generated from the ${variantOf(ctx)} table: one function per LR state.`);
  out.push(' * Every terminal is one input character; the input ends with $.');
  out.push(' * Output: the right parse (the rules of the reductions), then OK, or ERR');
  out.push(' * and the symbol where the error was found.');
  out.push(' *');
  out.push(' * A function is called after the shift into its state. After a reduction');
  out.push(' * by A -> α it sets lhs = A and returns |α|: every caller decrements the');
  out.push(' * count and returns it until it is 0; there it calls the state goto(state, A). */');
  out.push('#include <stdio.h>');
  out.push('');
  out.push('/* the terminals and their characters */');
  out.push('enum {');
  for (const t of ctx.tokens) out.push(`  ${t.name} = ${cChar(t.code)}, /* ${inC(t.terminal)} */`);
  out.push("  tend = '$'");
  out.push('};');
  out.push('');
  out.push('/* the non-terminals */');
  out.push('enum {');
  const nts = [...ntNames];
  nts.forEach(([A, n], i) => out.push(`  ${n}${i === 0 ? ' = 1' : ''}${i < nts.length - 1 ? ',' : ''} /* ${inC(A)} */`));
  out.push('};');
  out.push('');
  out.push('static int sym;    /* the current input symbol */');
  out.push('static int ok = 1; /* no error found yet */');
  out.push('static int lhs;    /* the left-hand side of the reduction being returned */');
  out.push('');
  out.push('static void next(void)');
  out.push('{');
  out.push("  do sym = getchar(); while (sym != EOF && sym <= ' ');");
  out.push('  if (sym == EOF) sym = tend;');
  out.push('}');
  out.push('');
  out.push('static void error(void)');
  out.push('{');
  out.push('  if (ok) {');
  out.push('    printf("\\nERR %c", sym);');
  out.push('    ok = 0;');
  out.push('  }');
  out.push('}');
  out.push('');
  out.push('/* one function per state; the prototypes allow any order of calls */');
  for (const s of states) out.push(`static int ${s.proc}(void);`);
  for (const s of states) {
    out.push('');
    out.push(`/* ${stateTitle(s)}`, lineKey.head(s.id));
    for (const it of s.items) out.push(` *   ${inC(it)}`);
    out.push(' */');
    out.push(`static int ${s.proc}(void)`, lineKey.proc(s.id));
    out.push('{');
    if (hasCount(s)) out.push('  int count = 0;');
    const branch = (a: AscentAction): string => {
      if (a.kind === 'shift') return `next(); count = ${procOf(a.target)}() - 1; break; /* shift ${inC(a.terminal)}: g(${inC(s.name)}, ${inC(a.terminal)}) = ${inC(name(a.target))} */`;
      if (a.kind === 'accept') return `lhs = ${ntNames.get(augmentedStart)}; return 1; /* accept: ${inC(ruleText(ctx.table.automaton!.augmentedProduction))}, back to # */`;
      const p = a.production;
      if (p.rhs.length === 0) return `printf("${p.id} "); lhs = ${ntNames.get(p.lhs)}; count = 0; break; /* ${inC(reduceText(p))}: goto here */`;
      return `printf("${p.id} "); lhs = ${ntNames.get(p.lhs)}; return ${p.rhs.length}; /* ${inC(reduceText(p))} */`;
    };
    if (s.unconditional) {
      out.push(`  ${branch(s.actions[0]).replace(/ break;/, '').replace(/ \*\/$/, ' (whatever the input symbol) */')}`, lineKey.act(s.id, '*'));
    } else {
      out.push('  switch (sym) {');
      for (const a of s.actions) {
        const cols = a.kind === 'shift' ? [a.terminal] : a.kind === 'accept' ? [END_MARKER] : a.columns;
        out.push(`  ${cols.map(t => `case ${constOf(t)}:`).join(' ')} ${branch(a)}`, ...cols.map(t => lineKey.act(s.id, t)));
      }
      out.push('  default: error(); return 0;', lineKey.err(s.id));
      out.push('  }');
    }
    if (!hasCount(s)) {
      out.push('}', lineKey.end(s.id));
      continue;
    }
    if (s.gotos.length > 0 || s.id === 0) {
      out.push(`  while (ok && count == 0) { /* the reduction ends here: goto(${inC(s.name)}, lhs) */`);
      out.push('    switch (lhs) {');
      for (const { nt, target } of s.gotos) out.push(`    case ${ntNames.get(nt)}: count = ${procOf(target)}() - 1; break; /* g(${inC(s.name)}, ${inC(nt)}) = ${inC(name(target))} */`, lineKey.goto(s.id, nt));
      if (s.id === 0) out.push(`    case ${ntNames.get(augmentedStart)}: return 0; /* accepted */`, lineKey.goto(s.id, augmentedStart));
      out.push('    default: error(); return 0;');
      out.push('    }');
      out.push('  }');
    }
    out.push('  return count;', lineKey.ret(s.id));
    out.push('}', lineKey.end(s.id));
  }
  out.push('');
  out.push('int main(void)');
  out.push('{', lineKey.main);
  out.push('  next();');
  out.push(`  ${states[0].proc}();`);
  out.push('  if (ok) printf("\\nOK");');
  out.push('  printf("\\n");');
  out.push('  return ok ? 0 : 1;');
  out.push('}');
  return out;
}

/** The lines of a sequence of statements, each but the last followed by ';' */
function sequence(stmts: [string, string[]][][]): [string, string[]][] {
  return stmts.flatMap((st, i) => st.map(([x, k], j): [string, string[]] => [i < stmts.length - 1 && j === st.length - 1 ? `${x};` : x, k]));
}

/** PL/0: comments are ASCII only (E1 for E₁, . for the dot) */
function generatePl0(ctx: Ctx): Emitter {
  const { states, augmentedStart, constOf, ntNames } = ctx;
  const out = new Emitter();
  const ascii = (q: number) => states[q].asciiName;
  const asciiItem = (it: string) => inParens(it.replace(/•/g, '.').replace(/∅/g, '{}'));
  out.push(`(* recursive ascent, generated from the ${variantOf(ctx)} table *)`);
  out.push('(* every terminal is one input character; the input ends with $ *)');
  out.push('(* PL/0 has no function results and no forward declarations: one *)');
  out.push('(* procedure state gets the state in which and keeps it in mine; *)');
  out.push('(* a reduction by A -> alpha returns lhs = A and cnt = |alpha| *)');
  for (const t of ctx.tokens) out.push(`(* ${t.name} = ${t.code}: ${inParens(t.terminal)} *)`);
  const nts = [...ntNames];
  for (const [A, n] of nts) out.push(`(* ${n}: ${inParens(A)} *)`);
  const consts = [...ctx.tokens.map(t => `${t.name} = ${t.code}`), 'tend = 36', ...nts.map(([, n], i) => `${n} = ${i + 1}`)];
  out.push(`const ${consts.join(', ')};`);
  out.push('var sym, ok, num, dig, which, lhs, cnt;');
  out.push('');
  out.push('procedure next;');
  out.push('begin');
  out.push('  ? sym;');
  out.push('  while sym <= 32 do ? sym');
  out.push('end;');
  out.push('');
  out.push('procedure error;');
  out.push('begin');
  out.push('  if ok = 1 then');
  out.push('  begin');
  out.push('    ! 10; ! 69; ! 82; ! 82; ! 32; ! sym;');
  out.push('    ok := 0');
  out.push('  end;');
  out.push('  cnt := -1');
  out.push('end;');
  out.push('');
  out.push('procedure writenum;');
  out.push('begin');
  out.push('  dig := 1;');
  out.push('  while dig * 10 <= num do dig := dig * 10;');
  out.push('  while dig > 0 do');
  out.push('  begin');
  out.push('    ! 48 + num / dig;');
  out.push('    num := num - num / dig * dig;');
  out.push('    dig := dig / 10');
  out.push('  end;');
  out.push('  ! 32');
  out.push('end;');
  out.push('');
  out.push('procedure state;');
  out.push('var mine, act;');
  out.push('begin');
  out.push('  mine := which;');
  // Every state block ends with ';' except the last one before end
  states.forEach((s, si) => {
    const last = si === states.length - 1;
    out.push(`  (* ${stateTitle({ ...s, name: s.asciiName })} *)`, lineKey.head(s.id));
    for (const it of s.items) out.push(`  (*   ${asciiItem(it)} *)`);
    out.push(`  if mine = ${s.id} then`, lineKey.proc(s.id));
    out.push('  begin');
    const stmts = (a: AscentAction): string[] => {
      if (a.kind === 'shift') return ['call next', `which := ${a.target}`, 'call state', 'cnt := cnt - 1'];
      if (a.kind === 'accept') return [`lhs := ${ntNames.get(augmentedStart)}`, 'cnt := 1'];
      return [`num := ${a.production.id}`, 'call writenum', `lhs := ${ntNames.get(a.production.lhs)}`, `cnt := ${a.production.rhs.length}`];
    };
    const comment = (a: AscentAction) =>
      a.kind === 'shift' ? `shift ${a.terminal}: g(${s.asciiName}, ${a.terminal}) = ${ascii(a.target)}`
        : a.kind === 'accept' ? `accept: ${ruleText(ctx.table.automaton!.augmentedProduction)}`
          : a.production.rhs.length === 0 ? `${reduceText(a.production)}, goto here` : reduceText(a.production);
    // A statement is one or more lines; statements of a sequence are separated by ';'
    type Line = [string, string[]];
    const body: Line[][] = [];
    if (s.unconditional) {
      const st = stmts(s.actions[0]);
      body.push([[`(* ${inParens(comment(s.actions[0]))}, whatever the input symbol *)`, [lineKey.act(s.id, '*')]], [st[0], []]]);
      for (const x of st.slice(1)) body.push([[x, []]]);
    } else {
      body.push([['act := 0', []]]);
      s.actions.forEach((a, i) => {
        const cols = a.kind === 'shift' ? [a.terminal] : a.kind === 'accept' ? [END_MARKER] : a.columns;
        for (const t of cols) body.push([[`if sym = ${constOf(t)} then act := ${i + 1}`, [lineKey.act(s.id, t)]]]);
      });
      body.push([['if act = 0 then call error', [lineKey.err(s.id)]]]);
      s.actions.forEach((a, i) => {
        body.push([[`if act = ${i + 1} then (* ${inParens(comment(a))} *)`, []], [`  begin ${stmts(a).join('; ')} end`, []]]);
      });
    }
    if (s.gotos.length > 0 || s.id === 0) {
      const inner: Line[][] = [[['which := -1', []]]];
      for (const { nt, target } of s.gotos) inner.push([[`if lhs = ${ntNames.get(nt)} then which := ${target} (* g(${s.asciiName}, ${inParens(nt)}) = ${ascii(target)} *)`, [lineKey.goto(s.id, nt)]]]);
      if (s.id === 0) inner.push([[`if lhs = ${ntNames.get(augmentedStart)} then which := -2 (* accepted *)`, [lineKey.goto(s.id, augmentedStart)]]]);
      inner.push([['if which = -1 then call error', []]]);
      if (s.id === 0) inner.push([['if which = -2 then cnt := 1', []]]);
      inner.push([['if which >= 0 then begin call state; cnt := cnt - 1 end', []]]);
      body.push([
        [`while cnt = 0 do (* the reduction ends here: goto(${ascii(s.id)}, lhs) *)`, []],
        ['begin', []],
        ...sequence(inner).map(([x, k]): Line => [`  ${x}`, k]),
        ['end', [lineKey.ret(s.id)]]
      ]);
    }
    for (const [x, keys] of sequence(body)) out.push(`    ${x}`, ...keys);
    // the end of the block is the return when there is no goto loop
    out.push(`  end${last ? '' : ';'}`, lineKey.ret(s.id), lineKey.end(s.id));
  });
  out.push('end;');
  out.push('');
  out.push('begin', lineKey.main);
  out.push('  ok := 1;');
  out.push('  call next;');
  out.push('  which := 0;');
  out.push('  call state;');
  out.push('  if ok = 1 then');
  out.push('  begin');
  out.push('    ! 10; ! 79; ! 75');
  out.push('  end');
  out.push('end.');
  return out;
}
