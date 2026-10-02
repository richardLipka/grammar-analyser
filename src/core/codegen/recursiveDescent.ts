/**
 * Recursive-descent parsers generated from an LL(1) grammar, in PL/0 and in
 * Oberon, the languages of N. Wirth's compilers (the PL/0 compiler of the
 * KIV/FJP course is one).
 *
 * Every non-terminal A gets a procedure; it chooses the rule of A by the
 * current input symbol (the director sets of the LL(1) table), prints the
 * rule number (the left parse), and then for every symbol of the right-hand
 * side calls the procedure of a non-terminal or checks and reads a terminal.
 *
 * Input: every terminal is one character (its own character when it is a
 * single printable ASCII character, otherwise a substitute letter); spaces
 * and line ends are skipped and the input ends with $. Output: the left
 * parse, then OK, or ERR and the symbol where the error was found.
 *
 * Neither PL/0 nor Oberon-07 has forward declarations, so a procedure may only
 * call itself, procedures of enclosing blocks and procedures declared before
 * it. As in Wirth's PL/0 compiler (expression ⊃ term ⊃ factor), the
 * procedures are nested along a depth-first search of the calls; when that is
 * not enough for some call graph, PL/0 uses one procedure for all
 * non-terminals with the chosen non-terminal in a variable, and Oberon calls
 * through procedure variables (as ORP.Mod does for expression).
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';
import { GrammarAnalysis } from '../analyser/grammarAnalyser';

export interface TokenCode {
  terminal: string;
  /** the character standing for the terminal in the input */
  char: string;
  code: number;
  /** name of the constant in the generated program */
  name: string;
}

const PUNCT_NAMES: Record<string, string> = {
  '+': 'plus', '-': 'minus', '*': 'times', '/': 'slash', '(': 'lparen', ')': 'rparen', '[': 'lbrack', ']': 'rbrack',
  '{': 'lbrace', '}': 'rbrace', '=': 'eql', '<': 'lss', '>': 'gtr', ',': 'comma', ';': 'semicolon', '.': 'period',
  ':': 'colon', '!': 'excl', '?': 'quest', '^': 'caret', '%': 'percent', '&': 'amp', '|': 'bar', '#': 'hash',
  '@': 'at', '~': 'tilde', "'": 'quote', '"': 'dquote', '\\': 'backslash', '_': 'underscore', '`': 'backquote'
};
const PL0_KEYWORDS = new Set(['const', 'var', 'procedure', 'call', 'begin', 'end', 'if', 'then', 'while', 'do', 'odd']);
const OBERON_KEYWORDS = new Set(['ARRAY', 'BEGIN', 'BY', 'CASE', 'CONST', 'DIV', 'DO', 'ELSE', 'ELSIF', 'END', 'FALSE', 'FOR', 'IF', 'IMPORT', 'IN', 'IS', 'MOD', 'MODULE', 'NIL', 'OF', 'OR', 'POINTER', 'PROCEDURE', 'RECORD', 'REPEAT', 'RETURN', 'THEN', 'TO', 'TRUE', 'TYPE', 'UNTIL', 'VAR', 'WHILE']);
/** Names used by the generated programs themselves; avoided regardless of case (some PL/0 compilers ignore it) */
const RESERVED_NAMES = new Set(['sym', 'ok', 'want', 'num', 'dig', 'rule', 'mine', 'which', 'next', 'error', 'expect', 'writenum', 'parse', 'tend', 'parser', 'in', 'out']);
const clashes = (names: Set<string>, x: string) => names.has(x) || RESERVED_NAMES.has(x.toLowerCase());

/** Characters for the terminals: their own when single printable ASCII, otherwise substitutes. */
export function tokenCodes(g: Grammar): TokenCode[] {
  const used = new Set<string>(['$', ' ']);
  const codes: TokenCode[] = [];
  const names = new Set<string>();
  const terms = [...g.terminals];
  const own = (tm: string) => tm.length === 1 && tm.charCodeAt(0) > 32 && tm.charCodeAt(0) < 127 && tm !== '$';
  for (const tm of terms.filter(own)) used.add(tm);
  const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const tm of terms) {
    let ch = own(tm) ? tm : '';
    if (!ch) {
      const first = tm[0];
      ch = first && /[A-Za-z0-9]/.test(first) && !used.has(first) ? first : [...pool].find(c => !used.has(c)) ?? '';
      if (!ch) throw new Error('Too many terminals for single-character codes');
      used.add(ch);
    }
    let base = /^[A-Za-z][A-Za-z0-9]*$/.test(tm) ? `t${tm}` : PUNCT_NAMES[tm] ? `t${PUNCT_NAMES[tm]}` : `t${codes.length + 1}`;
    if (PL0_KEYWORDS.has(base.toLowerCase()) || OBERON_KEYWORDS.has(base)) base = `${base}0`;
    let name = base;
    for (let k = 2; clashes(names, name); k++) name = `${base}${k}`;
    names.add(name);
    codes.push({ terminal: tm, char: ch, code: ch.charCodeAt(0), name });
  }
  return codes;
}

/** Procedure names: identifiers derived from the non-terminals (E' → Eprime, <if-stmt> → ifstmt). */
function procedureNames(nts: string[], taken: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const names = new Set(taken);
  for (const nt of nts) {
    const primes = (nt.match(/'+$/)?.[0].length ?? 0);
    let base = nt.replace(/'+$/, '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
    if (!/^[A-Za-z]/.test(base)) base = `N${base}`;
    base += primes === 0 ? '' : primes === 1 ? 'prime' : `prime${primes}`;
    if (PL0_KEYWORDS.has(base.toLowerCase()) || OBERON_KEYWORDS.has(base.toUpperCase())) base = `${base}0`;
    let name = base;
    for (let k = 2; clashes(names, name); k++) name = `${base}${k}`;
    names.add(name);
    out.set(nt, name);
  }
  return out;
}

export interface GeneratedParser {
  tokens: TokenCode[];
  /** the non-terminals in the order of their procedures */
  nonTerminals: string[];
  procNames: Map<string, string>;
  /** procedures nested along the calls (false: one dispatching procedure / procedure variables) */
  nested: boolean;
  pl0: string;
  oberon: string;
}

/** Calls of each non-terminal (the non-terminals of its right-hand sides, in order). */
function callGraph(g: Grammar, nts: string[]): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  for (const A of nts) {
    const list: string[] = [];
    for (const p of g.productions) if (p.lhs === A) for (const X of p.rhs) if (g.nonTerminals.has(X) && !list.includes(X)) list.push(X);
    calls.set(A, list);
  }
  return calls;
}

interface Nest {
  parent: Map<string, string | null>;
  children: Map<string, string[]>;
}

/** Nesting along a depth-first search from the start symbol. */
function dfsNesting(start: string, calls: Map<string, string[]>): Nest {
  const parent = new Map<string, string | null>([[start, null]]);
  const children = new Map<string, string[]>();
  const visit = (A: string) => {
    children.set(A, []);
    for (const B of calls.get(A) || []) {
      if (parent.has(B)) continue;
      parent.set(B, A);
      children.get(A)!.push(B);
      visit(B);
    }
  };
  visit(start);
  return { parent, children };
}

/** Can A call B in the nesting? B is A, an enclosing procedure, a local one, or declared earlier in an enclosing block. */
function visible(nest: Nest, A: string, B: string): boolean {
  if (A === B) return true;
  if (nest.children.get(A)?.includes(B)) return true;
  // walk up from A: at every level, B may be the enclosing procedure or an earlier sibling
  let x: string | null = A;
  while (x !== null) {
    const up: string | null = nest.parent.get(x) ?? null;
    if (B === up) return true;
    const siblings = up === null ? [] : nest.children.get(up)!;
    const idx = siblings.indexOf(x);
    if (siblings.indexOf(B) !== -1 && siblings.indexOf(B) < idx) return true;
    x = up;
  }
  return false;
}

export function generateRecursiveDescent(g: Grammar, analysis: GrammarAnalysis): GeneratedParser {
  const tokens = tokenCodes(g);
  const tokenOf = new Map(tokens.map(t => [t.terminal, t]));
  // the non-terminals reachable from the start symbol
  const reach = [g.startSymbol];
  for (let i = 0; i < reach.length; i++) {
    for (const p of g.productions) if (p.lhs === reach[i]) for (const X of p.rhs) if (g.nonTerminals.has(X) && !reach.includes(X)) reach.push(X);
  }
  const procNames = procedureNames(reach, new Set(tokens.map(t => t.name)));
  const calls = callGraph(g, reach);
  const nest = dfsNesting(g.startSymbol, calls);
  const nested = reach.every(A => (calls.get(A) || []).every(B => visible(nest, A, B)));
  const rules = (A: string) => g.productions.filter(p => p.lhs === A);
  const predict = (p: Production) => [...(analysis.predict1.get(p.id) || [])];
  const constOf = (la: string) => (la === END_MARKER ? 'tend' : tokenOf.get(la)!.name);

  return {
    tokens,
    nonTerminals: reach,
    procNames,
    nested,
    pl0: generatePl0(g, reach, nest, nested, tokens, procNames, rules, predict, constOf),
    oberon: generateOberon(g, reach, nest, nested, tokens, procNames, rules, predict)
  };
}

const ruleText = (p: Production) => `${p.lhs} -> ${p.rhs.join(' ') || 'eps'}`;

function generatePl0(
  g: Grammar,
  nts: string[],
  nest: Nest,
  nested: boolean,
  tokens: TokenCode[],
  names: Map<string, string>,
  rules: (A: string) => Production[],
  predict: (p: Production) => string[],
  constOf: (la: string) => string
): string {
  const out: string[] = [];
  const consts = [...tokens.map(t => `${t.name} = ${t.code}`), 'tend = 36'];
  out.push(`const ${consts.join(', ')};`);
  out.push('var sym, ok, want, num, dig, which;');
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
  out.push('  end');
  out.push('end;');
  out.push('');
  out.push('procedure expect;');
  out.push('begin');
  out.push('  if ok = 1 then');
  out.push('  begin');
  out.push('    if sym # want then call error;');
  out.push('    if sym = want then call next');
  out.push('  end');
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

  /** The body choosing and expanding a rule of A; `call(B)` is the PL/0 call of B. */
  const body = (A: string, indent: string, call: (B: string) => string[]): string[] => {
    const lines: string[] = [];
    lines.push(`${indent}if ok = 1 then`);
    lines.push(`${indent}begin`);
    lines.push(`${indent}  rule := 0;`);
    for (const p of rules(A)) {
      for (const la of predict(p)) lines.push(`${indent}  if sym = ${constOf(la)} then rule := ${p.id};`);
    }
    lines.push(`${indent}  if rule = 0 then call error;`);
    for (const p of rules(A)) {
      const stmts: string[] = [`num := ${p.id}`, 'call writenum'];
      for (const X of p.rhs) {
        if (g.nonTerminals.has(X)) stmts.push(...call(X));
        else stmts.push(`want := ${constOf(X)}`, 'call expect');
      }
      lines.push(`${indent}  if rule = ${p.id} then`);
      lines.push(`${indent}  begin`);
      lines.push(...stmts.map((st, k) => `${indent}    ${st}${k < stmts.length - 1 ? ';' : ''}`));
      lines.push(`${indent}  end;`);
    }
    // the last statement of a block has no ';' before end
    lines[lines.length - 1] = lines[lines.length - 1].replace(/;$/, '');
    lines.push(`${indent}end`);
    return lines;
  };

  if (nested) {
    const emitProc = (A: string, depth: number) => {
      const ind = '  '.repeat(depth);
      out.push(`${ind}procedure ${names.get(A)};`);
      out.push(`${ind}var rule;`);
      for (const C of nest.children.get(A) || []) emitProc(C, depth + 1);
      out.push(`${ind}begin`);
      out.push(...body(A, `${ind}  `, B => [`call ${names.get(B)}`]));
      out.push(`${ind}end;`);
      if (depth === 0) out.push('');
    };
    emitProc(g.startSymbol, 0);
  } else {
    // One procedure for all non-terminals: which selects it, mine keeps it for this activation
    const num = new Map(nts.map((A, i) => [A, i + 1]));
    out.push('procedure parse;');
    out.push('var mine, rule;');
    out.push('begin');
    out.push('  mine := which;');
    nts.forEach((A, i) => {
      out.push(`  if mine = ${num.get(A)} then`);
      out.push('  begin');
      out.push(...body(A, '    ', B => [`which := ${num.get(B)}`, 'call parse']));
      out.push(`  end${i < nts.length - 1 ? ';' : ''}`);
    });
    out.push('end;');
    out.push('');
  }

  out.push('begin');
  out.push('  ok := 1;');
  out.push('  call next;');
  out.push(...(nested ? [`  call ${names.get(g.startSymbol)};`] : ['  which := 1;', '  call parse;']));
  out.push('  if ok = 1 then');
  out.push('  begin');
  out.push('    if sym # tend then call error');
  out.push('  end;');
  out.push('  if ok = 1 then');
  out.push('  begin');
  out.push('    ! 10; ! 79; ! 75');
  out.push('  end');
  out.push('end.');
  return out.join('\n');
}

function oberonChar(code: number): string {
  return code >= 32 && code < 127 && code !== 34 ? `"${String.fromCharCode(code)}"` : `${code.toString(16).toUpperCase().padStart(2, '0')}X`;
}

function generateOberon(
  g: Grammar,
  nts: string[],
  nest: Nest,
  nested: boolean,
  tokens: TokenCode[],
  names: Map<string, string>,
  rules: (A: string) => Production[],
  predict: (p: Production) => string[]
): string {
  const out: string[] = [];
  out.push('MODULE Parser; (* recursive descent, generated from an LL(1) grammar *)');
  out.push('  IMPORT In, Out;');
  out.push('');
  out.push('  (* every terminal is one input character; the input ends with $ *)');
  out.push('  CONST');
  for (const t of tokens) out.push(`    ${t.name} = ${oberonChar(t.code)}; (* ${t.terminal.replace(/\*\)/g, '* )')} *)`);
  out.push('    tend = "$";');
  out.push('');
  out.push('  VAR sym: CHAR; ok: BOOLEAN;');
  if (!nested) {
    out.push('    (* procedure variables: a procedure may call one declared after it, as in ORP.Mod *)');
    for (const A of nts) out.push(`    p${names.get(A)}: PROCEDURE;`);
  }
  out.push('');
  out.push('  PROCEDURE Next;');
  out.push('  BEGIN');
  out.push('    REPEAT In.Char(sym) UNTIL ~In.Done OR (sym > " ");');
  out.push('    IF ~In.Done THEN sym := tend END');
  out.push('  END Next;');
  out.push('');
  out.push('  PROCEDURE Error;');
  out.push('  BEGIN');
  out.push('    IF ok THEN Out.Ln; Out.String("ERR "); Out.Char(sym); ok := FALSE END');
  out.push('  END Error;');
  out.push('');
  out.push('  PROCEDURE Expect(want: CHAR);');
  out.push('  BEGIN');
  out.push('    IF ok THEN');
  out.push('      IF sym = want THEN Next ELSE Error END');
  out.push('    END');
  out.push('  END Expect;');
  out.push('');

  const nameOf = (la: string) => (la === END_MARKER ? 'tend' : tokens.find(t => t.terminal === la)!.name);
  const procBody = (A: string, ind: string, call: (B: string) => string): string[] => {
    const lines: string[] = [];
    lines.push(`${ind}IF ok THEN`);
    rules(A).forEach((p, i) => {
      const cond = predict(p).map(la => `(sym = ${nameOf(la)})`).join(' OR ') || 'FALSE';
      lines.push(`${ind}  ${i === 0 ? 'IF' : 'ELSIF'} ${cond} THEN (* ${p.id}: ${ruleText(p).replace(/\*\)/g, '* )')} *)`);
      const stmts = [`Out.Int(${p.id}, 0); Out.Char(" ")`];
      for (const X of p.rhs) stmts.push(g.nonTerminals.has(X) ? call(X) : `Expect(${nameOf(X)})`);
      lines.push(`${ind}    ${stmts.join('; ')}`);
    });
    lines.push(`${ind}  ELSE Error`);
    lines.push(`${ind}  END`);
    lines.push(`${ind}END`);
    return lines;
  };

  if (nested) {
    const emitProc = (A: string, depth: number) => {
      const ind = '  '.repeat(depth + 1);
      out.push(`${ind}PROCEDURE ${names.get(A)};`);
      for (const C of nest.children.get(A) || []) emitProc(C, depth + 1);
      out.push(`${ind}BEGIN`);
      out.push(...procBody(A, `${ind}  `, B => names.get(B)!));
      out.push(`${ind}END ${names.get(A)};`);
      out.push('');
    };
    emitProc(g.startSymbol, 0);
  } else {
    for (const A of nts) {
      out.push(`  PROCEDURE ${names.get(A)};`);
      out.push('  BEGIN');
      out.push(...procBody(A, '    ', B => `p${names.get(B)}`));
      out.push(`  END ${names.get(A)};`);
      out.push('');
    }
  }

  out.push('BEGIN');
  if (!nested) for (const A of nts) out.push(`  p${names.get(A)} := ${names.get(A)};`);
  out.push(`  ok := TRUE; In.Open; Next; ${names.get(g.startSymbol)};`);
  out.push('  IF ok & (sym # tend) THEN Error END;');
  out.push('  IF ok THEN Out.Ln; Out.String("OK") END;');
  out.push('  Out.Ln');
  out.push('END Parser.');
  return out.join('\n');
}
