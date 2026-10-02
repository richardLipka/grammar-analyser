/**
 * A compiler for PL/0 (N. Wirth, Algorithms + Data Structures = Programs)
 * with the character input/output of the course virtual machine:
 *
 *   ? x      reads one character into x (instruction REA)
 *   ! expr   writes the character with the code expr (instruction WRI)
 *
 * The code is the P-code of Wirth's compiler with the course mnemonics
 * (JMC for the conditional jump, RET for the return, OPR 0, 6 = modulo and
 * OPR 0, 7 = odd), as run by the KIV/FJP PL/0 interpreter. It is used to
 * turn the generated recursive-descent parsers into runnable programs.
 */

export type POp = 'LIT' | 'OPR' | 'LOD' | 'STO' | 'CAL' | 'INT' | 'JMP' | 'JMC' | 'RET' | 'REA' | 'WRI';

export interface PInstruction {
  op: POp;
  l: number;
  a: number;
  /** Shown after ';' in the listing */
  comment?: string;
}

export class Pl0Error extends Error {
  constructor(message: string, public line: number) {
    super(`${message} (line ${line})`);
  }
}

const KEYWORDS = new Set(['const', 'var', 'procedure', 'call', 'begin', 'end', 'if', 'then', 'while', 'do', 'odd']);

interface Token {
  kind: 'ident' | 'number' | 'sym' | 'keyword' | 'eof';
  text: string;
  line: number;
}

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // (* comments *) of extended PL/0 dialects
    if (c === '(' && src[i + 1] === '*') {
      const end = src.indexOf('*)', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
      const word = src.slice(i, j);
      toks.push({ kind: KEYWORDS.has(word) ? 'keyword' : 'ident', text: word, line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      toks.push({ kind: 'number', text: src.slice(i, j), line });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === ':=' || two === '<=' || two === '>=') {
      toks.push({ kind: 'sym', text: two, line });
      i += 2;
      continue;
    }
    if ('+-*/()=#<>,;.?!'.includes(c)) {
      toks.push({ kind: 'sym', text: c, line });
      i++;
      continue;
    }
    throw new Pl0Error(`Unexpected character '${c}'`, line);
  }
  toks.push({ kind: 'eof', text: '', line });
  return toks;
}

interface Entry {
  name: string;
  kind: 'const' | 'var' | 'procedure';
  level: number;
  /** value of a constant, address of a variable or of a procedure */
  value: number;
}

const RELOP: Record<string, number> = { '=': 8, '#': 9, '<': 10, '>=': 11, '>': 12, '<=': 13 };

export function compilePl0(src: string): PInstruction[] {
  const toks = tokenize(src);
  let pos = 0;
  const code: PInstruction[] = [];
  const table: Entry[] = [];
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const is = (text: string) => (peek().kind === 'sym' || peek().kind === 'keyword') && peek().text === text;
  const expect = (text: string) => {
    if (!is(text)) throw new Pl0Error(`'${text}' expected, found '${peek().text || 'end of file'}'`, peek().line);
    next();
  };
  const ident = () => {
    if (peek().kind !== 'ident') throw new Pl0Error(`identifier expected, found '${peek().text}'`, peek().line);
    return next();
  };
  const emit = (op: POp, l: number, a: number, comment?: string) => {
    code.push(comment ? { op, l, a, comment } : { op, l, a });
    return code.length - 1;
  };
  const lookup = (name: string, line: number): Entry => {
    for (let k = table.length - 1; k >= 0; k--) if (table[k].name === name) return table[k];
    throw new Pl0Error(`'${name}' is not declared`, line);
  };

  const block = (level: number, procName?: string, procEntry?: Entry) => {
    const tableStart = table.length;
    let dx = 3;
    const jump = emit('JMP', 0, 0);
    // As in Wirth's compiler: until the body is compiled, the procedure's address is this jump
    // over the nested procedures, so they can call it (factor → expression)
    if (procEntry) procEntry.value = jump;
    if (is('const')) {
      next();
      do {
        const id = ident();
        expect('=');
        const num = next();
        if (num.kind !== 'number') throw new Pl0Error('number expected', num.line);
        table.push({ name: id.text, kind: 'const', level, value: Number(num.text) });
      } while (is(',') && next());
      expect(';');
    }
    if (is('var')) {
      next();
      do {
        table.push({ name: ident().text, kind: 'var', level, value: dx++ });
      } while (is(',') && next());
      expect(';');
    }
    while (is('procedure')) {
      next();
      const id = ident();
      const entry: Entry = { name: id.text, kind: 'procedure', level, value: 0 };
      table.push(entry);
      expect(';');
      block(level + 1, id.text, entry);
      expect(';');
    }
    code[jump].a = code.length;
    if (procEntry) procEntry.value = code.length;
    emit('INT', 0, dx, procName ? `procedure ${procName}` : 'main program');
    statement(level);
    emit('RET', 0, 0, procName ? `end of ${procName}` : 'end of program');
    table.length = tableStart;
  };

  const statement = (level: number) => {
    const t = peek();
    if (t.kind === 'ident') {
      next();
      const e = lookup(t.text, t.line);
      if (e.kind !== 'var') throw new Pl0Error(`'${t.text}' is not a variable`, t.line);
      expect(':=');
      expression(level);
      emit('STO', level - e.level, e.value);
    } else if (is('call')) {
      next();
      const id = ident();
      const e = lookup(id.text, id.line);
      if (e.kind !== 'procedure') throw new Pl0Error(`'${id.text}' is not a procedure`, id.line);
      emit('CAL', level - e.level, e.value, `call ${id.text}`);
    } else if (is('?')) {
      next();
      const id = ident();
      const e = lookup(id.text, id.line);
      if (e.kind !== 'var') throw new Pl0Error(`'${id.text}' is not a variable`, id.line);
      emit('REA', 0, 0);
      emit('STO', level - e.level, e.value);
    } else if (is('!')) {
      next();
      expression(level);
      emit('WRI', 0, 0);
    } else if (is('begin')) {
      next();
      statement(level);
      while (is(';')) {
        next();
        statement(level);
      }
      expect('end');
    } else if (is('if')) {
      next();
      condition(level);
      expect('then');
      const jmc = emit('JMC', 0, 0);
      statement(level);
      code[jmc].a = code.length;
    } else if (is('while')) {
      next();
      const start = code.length;
      condition(level);
      expect('do');
      const jmc = emit('JMC', 0, 0);
      statement(level);
      emit('JMP', 0, start);
      code[jmc].a = code.length;
    }
    // otherwise the empty statement
  };

  const condition = (level: number) => {
    if (is('odd')) {
      next();
      expression(level);
      emit('OPR', 0, 7);
      return;
    }
    expression(level);
    const op = peek();
    if (op.kind !== 'sym' || RELOP[op.text] === undefined) throw new Pl0Error(`relational operator expected, found '${op.text}'`, op.line);
    next();
    expression(level);
    emit('OPR', 0, RELOP[op.text]);
  };

  const expression = (level: number) => {
    let negate = false;
    if (is('+') || is('-')) negate = next().text === '-';
    term(level);
    if (negate) emit('OPR', 0, 1);
    while (is('+') || is('-')) {
      const op = next().text;
      term(level);
      emit('OPR', 0, op === '+' ? 2 : 3);
    }
  };

  const term = (level: number) => {
    factor(level);
    while (is('*') || is('/')) {
      const op = next().text;
      factor(level);
      emit('OPR', 0, op === '*' ? 4 : 5);
    }
  };

  const factor = (level: number) => {
    const t = peek();
    if (t.kind === 'ident') {
      next();
      const e = lookup(t.text, t.line);
      if (e.kind === 'const') emit('LIT', 0, e.value);
      else if (e.kind === 'var') emit('LOD', level - e.level, e.value);
      else throw new Pl0Error(`'${t.text}' is a procedure`, t.line);
    } else if (t.kind === 'number') {
      next();
      emit('LIT', 0, Number(t.text));
    } else if (is('(')) {
      next();
      expression(level);
      expect(')');
    } else {
      throw new Pl0Error(`factor expected, found '${t.text}'`, t.line);
    }
  };

  block(0);
  expect('.');
  return code;
}

/** P-code as the interpreter reads it: "LIT 0, 5 ; comment", one instruction per line. */
export function formatPcode(code: PInstruction[], withAddresses = false): string {
  return code
    .map((ins, i) => {
      const text = `${ins.op} ${ins.l}, ${ins.a}`;
      const line = withAddresses ? `${String(i).padStart(4)}  ${text}` : text;
      return ins.comment ? `${line.padEnd(withAddresses ? 22 : 14)} ; ${ins.comment}` : line;
    })
    .join('\n');
}
