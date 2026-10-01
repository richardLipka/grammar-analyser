/**
 * Multi-syntax Formal Grammar Parser
 * Supports:
 * - Arrows: ->, -->, =>, →
 * - BNF/EBNF: ::=, :==, :=
 * - Yacc/Bison/ANTLR: :
 * - Equality: =
 * - Alternatives: | or newline indentation
 * - Terminators: a trailing ; or . (or a line holding only ; or .) ends a rule
 * - Quoted terminals: "..." or '...' (always terminals, never ε or non-terminals)
 * - Non-terminals: <...> or any symbol that appears on a left-hand side
 * - Epsilon: ε, eps, epsilon, EPS, λ, lambda, #, "", ''
 * - Comments: // and # to the end of the line, /* ... *\/ blocks
 */

import { Grammar, Production, END_MARKER } from '../ast/grammar';

export interface ParseError {
  line: number;
  message: string;
  messageCz?: string;
}

export interface ParseResult {
  grammar?: Grammar;
  errors: ParseError[];
  /** Non-fatal remarks (undefined symbols, duplicate rules, ...). */
  warnings: ParseError[];
}

type TokenKind = 'bare' | 'quoted' | 'angle' | 'eps';

interface RhsToken {
  text: string;
  kind: TokenKind;
}

const EPSILON_TOKENS = new Set([
  'epsilon', 'eps', 'EPS', 'EPSILON', 'Epsilon', 'ε', 'λ', 'lambda', '#'
]);

// Longer operators first so that '::=' wins over ':' and '-->' over '->'.
const RULE_OPERATORS = ['::=', ':==', ':=', '-->', '->', '=>', '→', ':', '='];

const LHS_RE = /^(<[^<>]+>|[\p{L}_][\p{L}\p{N}_]*'*)$/u;
const IDENT_START = /[\p{L}\p{N}_]/u;
const IDENT_PART = /[\p{L}\p{N}_']/u;
const IDENT_CHAR_BEFORE_PRIME = /[\p{L}\p{N}_']/u;

export function parseGrammar(text: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];

  // 1. Strip block comments while preserving line breaks for accurate error reporting
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, match => '\n'.repeat((match.match(/\n/g) || []).length));

  const rawLines = cleaned.split(/\r?\n/);
  const lines: { lineNum: number; content: string }[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = stripLineComment(rawLines[i]).trim();
    if (line.length > 0) {
      lines.push({ lineNum: i + 1, content: line });
    }
  }

  if (lines.length === 0) {
    return {
      errors: [{ line: 1, message: 'Grammar text is empty.', messageCz: 'Gramatika je prázdná.' }],
      warnings
    };
  }

  const rawRules: { lineNum: number; lhs: string; alts: { tokens: RhsToken[]; lineNum: number }[] }[] = [];
  let current: (typeof rawRules)[number] | null = null;
  let ruleClosed = false;

  for (const item of lines) {
    let line = item.content;

    // A line holding only a terminator closes the current rule (Yacc style).
    if (line === ';' || line === '.') {
      ruleClosed = true;
      continue;
    }

    // Optional trailing terminator: ends the rule after this line.
    let endsRule = false;
    if (line.endsWith(';') || line.endsWith('.')) {
      if (!endsInsideQuotes(line)) {
        line = line.slice(0, -1).trim();
        endsRule = true;
      }
    }

    const op = line.startsWith('|') ? null : findRuleOperator(line);
    if (op) {
      const potentialLhs = line.slice(0, op.index).trim();
      const rhsPart = line.slice(op.index + op.op.length).trim();
      current = { lineNum: item.lineNum, lhs: cleanSymbol(potentialLhs), alts: [] };
      rawRules.push(current);
      ruleClosed = false;
      if (rhsPart.length > 0) {
        for (const alt of splitAlternatives(rhsPart)) {
          current.alts.push({ tokens: tokenizeRhs(alt), lineNum: item.lineNum });
        }
      }
    } else if (current !== null && !ruleClosed) {
      // Continuation line: alternatives introduced by '|' or by indentation/newline
      let rhsPart = line;
      if (rhsPart.startsWith('|')) {
        rhsPart = rhsPart.slice(1).trim();
      }
      for (const alt of splitAlternatives(rhsPart)) {
        current.alts.push({ tokens: tokenizeRhs(alt), lineNum: item.lineNum });
      }
    } else {
      errors.push({
        line: item.lineNum,
        message: ruleClosed && current !== null
          ? `Alternative after the rule for '${current.lhs}' was already terminated by ';' or '.': '${item.content}'`
          : `Expected production rule (e.g. 'S -> a S b | ε'), found: '${item.content}'`,
        messageCz: ruleClosed && current !== null
          ? `Alternativa za pravidlem pro '${current.lhs}', které již bylo ukončeno znakem ';' nebo '.': '${item.content}'`
          : `Očekáváno přepisovací pravidlo (např. 'S -> a S b | ε'), nalezeno: '${item.content}'`
      });
    }

    if (endsRule) ruleClosed = true;
  }

  if (rawRules.length === 0) {
    if (errors.length === 0) {
      errors.push({ line: 1, message: 'No valid grammar rules found.', messageCz: 'Nebylo nalezeno žádné platné pravidlo.' });
    }
    return { errors, warnings };
  }

  // Non-terminals: every left-hand side plus every <bracketed> symbol
  const nonTerminals = new Set<string>();
  for (const rule of rawRules) nonTerminals.add(rule.lhs);
  for (const rule of rawRules) {
    for (const alt of rule.alts) {
      for (const tok of alt.tokens) {
        if (tok.kind === 'angle' && !nonTerminals.has(tok.text)) {
          nonTerminals.add(tok.text);
          warnings.push({
            line: alt.lineNum,
            message: `Non-terminal <${tok.text}> has no rules, so it cannot generate any word.`,
            messageCz: `Neterminál <${tok.text}> nemá žádná pravidla, nemůže tedy generovat žádné slovo.`
          });
        }
      }
    }
  }

  const terminals = new Set<string>();
  const productions: Production[] = [];
  const seenProductions = new Set<string>();
  const warnedUndefined = new Set<string>();
  const reportedSymbols = new Set<string>();
  let prodId = 1;

  for (const rule of rawRules) {
    const alts = rule.alts.length === 0 ? [{ tokens: [] as RhsToken[], lineNum: rule.lineNum }] : rule.alts;
    for (const alt of alts) {
      const rhs: string[] = [];
      for (const tok of alt.tokens) {
        if (tok.kind === 'eps') continue; // ε inside a sequence is the neutral element

        const sym = tok.text;
        if (tok.kind === 'quoted') {
          if (nonTerminals.has(sym) && !reportedSymbols.has(sym)) {
            reportedSymbols.add(sym);
            errors.push({
              line: alt.lineNum,
              message: `Symbol '${sym}' is used both as a quoted terminal and as a non-terminal.`,
              messageCz: `Symbol '${sym}' je použit jako terminál v uvozovkách i jako neterminál.`
            });
          }
          if (/\s/.test(sym) && !reportedSymbols.has(sym)) {
            reportedSymbols.add(sym);
            errors.push({
              line: alt.lineNum,
              message: `Terminal "${sym}" contains whitespace; terminal names must be single tokens.`,
              messageCz: `Terminál "${sym}" obsahuje mezeru; názvy terminálů musí být jednotlivé tokeny.`
            });
          }
        } else if (tok.kind === 'bare' && !nonTerminals.has(sym) && /^\p{Lu}/u.test(sym) && !warnedUndefined.has(sym)) {
          warnedUndefined.add(sym);
          warnings.push({
            line: alt.lineNum,
            message: `'${sym}' looks like a non-terminal but has no rules; it is treated as a terminal. Add rules for it, or quote it ("${sym}") if it is a token.`,
            messageCz: `'${sym}' vypadá jako neterminál, ale nemá žádná pravidla; je považován za terminál. Doplňte jeho pravidla, nebo jej uzavřete do uvozovek ("${sym}"), jde-li o token.`
          });
        }

        if (sym === END_MARKER && !nonTerminals.has(sym) && !reportedSymbols.has(sym)) {
          reportedSymbols.add(sym);
          errors.push({
            line: alt.lineNum,
            message: `'$' is reserved for the end-of-input marker and cannot be used as a terminal.`,
            messageCz: `Symbol '$' je vyhrazen pro konec vstupu a nelze jej použít jako terminál.`
          });
        }

        rhs.push(sym);
        if (!nonTerminals.has(sym)) {
          terminals.add(sym);
        }
      }

      const key = `${rule.lhs}\u0000${rhs.join('\u0000')}`;
      if (seenProductions.has(key)) {
        warnings.push({
          line: alt.lineNum,
          message: `Duplicate rule ${rule.lhs} -> ${rhs.join(' ') || 'ε'} was ignored.`,
          messageCz: `Duplicitní pravidlo ${rule.lhs} -> ${rhs.join(' ') || 'ε'} bylo vynecháno.`
        });
        continue;
      }
      seenProductions.add(key);
      productions.push({ id: prodId++, lhs: rule.lhs, rhs });
    }
  }

  return {
    grammar: {
      nonTerminals,
      terminals,
      startSymbol: rawRules[0].lhs,
      productions
    },
    errors,
    warnings
  };
}

/**
 * Tracks quotes the same way the tokenizer does: double quotes always pair,
 * a single quote opens a literal only when it is not a prime (E') and a
 * closing quote follows on the same line.
 */
function scanQuotes(line: string, onChar: (idx: number, inQuote: boolean) => boolean | void): void {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const inQuote = inDouble || inSingle;
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      if (inSingle) {
        inSingle = false;
      } else {
        const isPrime = i > 0 && IDENT_CHAR_BEFORE_PRIME.test(line[i - 1]);
        if (!isPrime && line.indexOf("'", i + 1) !== -1) {
          inSingle = true;
        }
      }
    }
    if (onChar(i, inQuote) === true) return;
  }
}

function stripLineComment(line: string): string {
  let cut = -1;
  scanQuotes(line, (i, inQuote) => {
    if (inQuote) return;
    if (line[i] === '/' && line[i + 1] === '/') {
      cut = i;
      return true;
    }
    if (line[i] === '#' && !isEpsilonHash(line, i)) {
      cut = i;
      return true;
    }
  });
  return cut === -1 ? line : line.slice(0, cut);
}

/**
 * '#' denotes ε when it forms a whole alternative ("S -> a S | #"),
 * i.e. it follows an operator or '|' and is followed only by '|', a
 * terminator, or the end of the line. Elsewhere it starts a comment.
 */
function isEpsilonHash(line: string, idx: number): boolean {
  const before = line.slice(0, idx).trimEnd();
  const after = line.slice(idx + 1).trimStart();
  if (before.length === 0) return false;
  const prev = before[before.length - 1];
  if (!['|', '>', '=', ':', '→'].includes(prev)) return false;
  return after.length === 0 || after[0] === '|' || after === ';' || after === '.';
}

function endsInsideQuotes(line: string): boolean {
  let last = false;
  scanQuotes(line, (i, inQuote) => {
    if (i === line.length - 1) last = inQuote;
  });
  return last;
}

/** Finds the first rule operator outside quotes whose left side is a single symbol. */
function findRuleOperator(line: string): { index: number; op: string } | null {
  // A bracketed left-hand side may itself contain operator characters (<if-then>).
  const angle = line.match(/^<[^<>]+>/);
  const from = angle ? angle[0].length : 0;
  let found: { index: number; op: string } | null = null;
  scanQuotes(line, (i, inQuote) => {
    if (i < from || inQuote || line[i] === '"' || line[i] === "'") return;
    const op = RULE_OPERATORS.find(o => line.startsWith(o, i));
    if (op) {
      found = { index: i, op };
      return true;
    }
  });
  if (!found) return null;
  const { index, op } = found as { index: number; op: string };
  return LHS_RE.test(line.slice(0, index).trim()) ? { index, op } : null;
}

function cleanSymbol(sym: string): string {
  if (sym.startsWith('<') && sym.endsWith('>') && sym.length > 2) {
    return sym.slice(1, -1).trim();
  }
  return sym.trim();
}

function splitAlternatives(rhs: string): string[] {
  const alts: string[] = [];
  let start = 0;
  scanQuotes(rhs, (i, inQuote) => {
    if (!inQuote && rhs[i] === '|') {
      alts.push(rhs.slice(start, i).trim());
      start = i + 1;
    }
  });
  alts.push(rhs.slice(start).trim());
  return alts;
}

function tokenizeRhs(altStr: string): RhsToken[] {
  const tokens: RhsToken[] = [];
  let i = 0;

  while (i < altStr.length) {
    const ch = altStr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Quoted literal "..." or '...' (a single quote needs a closing partner)
    if (ch === '"' || (ch === "'" && altStr.indexOf("'", i + 1) !== -1)) {
      let j = i + 1;
      while (j < altStr.length && altStr[j] !== ch) {
        if (altStr[j] === '\\' && j + 1 < altStr.length) j++;
        j++;
      }
      const raw = altStr.slice(i + 1, j).replace(/\\(.)/g, '$1');
      tokens.push(raw === '' ? { text: '', kind: 'eps' } : { text: raw, kind: 'quoted' });
      i = j + 1;
      continue;
    }

    // Angle-bracketed non-terminal <...>; a lone '<' is an ordinary terminal
    if (ch === '<') {
      const close = altStr.indexOf('>', i + 1);
      const inner = close === -1 ? '' : altStr.slice(i + 1, close);
      if (close !== -1 && inner.trim().length > 0 && !inner.includes('<')) {
        tokens.push({ text: inner.trim(), kind: 'angle' });
        i = close + 1;
        continue;
      }
    }

    // Unquoted identifier (with primes, e.g. E', T'', expr_list, Výraz)
    if (IDENT_START.test(ch) && ch !== 'ε' && ch !== 'λ') {
      let j = i;
      while (j < altStr.length && IDENT_PART.test(altStr[j]) && altStr[j] !== 'ε' && altStr[j] !== 'λ') {
        j++;
      }
      const word = altStr.slice(i, j);
      tokens.push({ text: word, kind: EPSILON_TOKENS.has(word) ? 'eps' : 'bare' });
      i = j;
      continue;
    }

    // Standalone punctuation/operator symbol (e.g. +, *, -, (, ), ε, #)
    tokens.push({ text: ch, kind: EPSILON_TOKENS.has(ch) ? 'eps' : 'bare' });
    i++;
  }

  return tokens;
}
