/**
 * Multi-syntax Formal Grammar Parser
 * Supports:
 * - Arrows: ->, -->, =>
 * - BNF/EBNF: ::=, :==, :=
 * - Yacc/Bison/ANTLR: :
 * - Equality: =
 * - Alternatives: | or newline indentation
 * - Terminators: ;, ., or newline
 * - Quoted terminals: "..." or '...'
 * - Nonterminals: <...> or inferred from LHS
 * - Epsilon: ε, eps, epsilon, EPS, λ, #, "", ''
 * - Comments: single-line //, # and block comments
 */

import { Grammar, Production, EPSILON } from '../ast/grammar';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  grammar?: Grammar;
  errors: ParseError[];
}

const EPSILON_TOKENS = new Set([
  'epsilon', 'eps', 'EPS', 'EPSILON', 'ε', 'λ', 'lambda', '#', '""', "''", "e"
]);

export function parseGrammar(text: string): ParseResult {
  const errors: ParseError[] = [];
  
  // 1. Strip comments while preserving line breaks for accurate error reporting
  let cleaned = text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
  
  const rawLines = cleaned.split('\n');
  const lines: { lineNum: number; content: string }[] = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    // Remove single line comments // or #
    line = line.replace(/(\/\/|#).*$/, '').trim();
    if (line.length > 0) {
      lines.push({ lineNum: i + 1, content: line });
    }
  }

  if (lines.length === 0) {
    return {
      errors: [{ line: 1, message: 'Grammar text is empty.' }]
    };
  }

  // Tokenize line by line or as a continuous rule stream
  // We identify rules by looking for an LHS followed by an assignment operator
  // Regex for assignment operators: ::= | :== | := | -> | --> | => | : | =
  const ruleOpRegex = /(::=|:==|:=|-->|->|=>|:|=)/;

  const rawProductions: { lineNum: number; lhs: string; rhsList: string[][] }[] = [];
  let currentLhs: string | null = null;
  let currentAlts: string[][] = [];
  let currentRuleLine = 1;

  for (const item of lines) {
    let line = item.content;
    // Check for optional trailing terminator . or ;
    if (line.endsWith('.') || line.endsWith(';')) {
      line = line.slice(0, -1).trim();
    }

    const opMatch = line.match(ruleOpRegex);
    
    // Check if this line starts a new rule with an operator
    if (opMatch && opMatch.index !== undefined) {
      const potentialLhs = line.slice(0, opMatch.index).trim();
      const rhsPart = line.slice(opMatch.index + opMatch[0].length).trim();

      if (potentialLhs.length > 0) {
        // Commit previous rule if any
        if (currentLhs !== null) {
          rawProductions.push({
            lineNum: currentRuleLine,
            lhs: currentLhs,
            rhsList: currentAlts
          });
        }

        currentLhs = cleanSymbol(potentialLhs);
        currentRuleLine = item.lineNum;
        currentAlts = [];

        // Parse alternatives from rhsPart
        if (rhsPart.length > 0) {
          const alts = splitAlternatives(rhsPart);
          for (const alt of alts) {
            currentAlts.push(tokenizeRhs(alt));
          }
        }
        continue;
      }
    }

    // If no assignment operator, this line might be an alternative continuation (with '|' or indented)
    if (currentLhs !== null) {
      let rhsPart = line;
      if (rhsPart.startsWith('|')) {
        rhsPart = rhsPart.slice(1).trim();
      }
      if (rhsPart.length > 0) {
        const alts = splitAlternatives(rhsPart);
        for (const alt of alts) {
          currentAlts.push(tokenizeRhs(alt));
        }
      } else {
        // Empty continuation -> epsilon
        currentAlts.push([]);
      }
    } else {
      errors.push({
        line: item.lineNum,
        message: `Expected production rule (e.g. 'S -> a S b | ε'), found: '${item.content}'`
      });
    }
  }

  // Commit last rule
  if (currentLhs !== null) {
    rawProductions.push({
      lineNum: currentRuleLine,
      lhs: currentLhs,
      rhsList: currentAlts
    });
  }

  if (rawProductions.length === 0) {
    if (errors.length === 0) {
      errors.push({ line: 1, message: 'No valid grammar rules found.' });
    }
    return { errors };
  }

  // Build sets of Non-terminals and Terminals
  const nonTerminals = new Set<string>();
  for (const rule of rawProductions) {
    nonTerminals.add(rule.lhs);
  }

  const terminals = new Set<string>();
  const productions: Production[] = [];
  let prodId = 1;
  const startSymbol = rawProductions[0].lhs;

  for (const rule of rawProductions) {
    if (rule.rhsList.length === 0) {
      // Empty RHS implies epsilon
      productions.push({
        id: prodId++,
        lhs: rule.lhs,
        rhs: []
      });
      continue;
    }

    for (const rawRhs of rule.rhsList) {
      const processedRhs: string[] = [];
      for (const token of rawRhs) {
        if (EPSILON_TOKENS.has(token) || token === EPSILON) {
          continue; // Epsilon represented as empty array
        }
        processedRhs.push(token);
        if (!nonTerminals.has(token)) {
          terminals.add(token);
        }
      }

      productions.push({
        id: prodId++,
        lhs: rule.lhs,
        rhs: processedRhs
      });
    }
  }

  return {
    grammar: {
      nonTerminals,
      terminals,
      startSymbol,
      productions
    },
    errors
  };
}

function cleanSymbol(sym: string): string {
  // If wrapped in <...>, remove brackets
  if (sym.startsWith('<') && sym.endsWith('>') && sym.length > 2) {
    return sym.slice(1, -1).trim();
  }
  return sym.trim();
}

function splitAlternatives(rhs: string): string[] {
  // Split on '|' while respecting quoted strings "..." or '...'
  const alts: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < rhs.length; i++) {
    const ch = rhs[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (ch === "'" && !inDouble) {
      if (inSingle) {
        inSingle = false;
      } else {
        const isPrime = i > 0 && /[a-zA-Z0-9_']/.test(rhs[i - 1]);
        if (!isPrime && rhs.indexOf("'", i + 1) !== -1) {
          inSingle = true;
        }
      }
      current += ch;
    } else if (ch === '|' && !inDouble && !inSingle) {
      alts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0 || alts.length > 0) {
    alts.push(current.trim());
  }

  return alts;
}

function tokenizeRhs(altStr: string): string[] {
  if (altStr.length === 0) return [];

  const tokens: string[] = [];
  let i = 0;

  while (i < altStr.length) {
    const ch = altStr[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Quoted string "..."
    if (ch === '"') {
      let j = i + 1;
      while (j < altStr.length && altStr[j] !== '"') {
        if (altStr[j] === '\\' && j + 1 < altStr.length) j++;
        j++;
      }
      const raw = altStr.slice(i + 1, j);
      tokens.push(raw === '' ? EPSILON : raw);
      i = j + 1;
      continue;
    }

    // Quoted string '...' only if there is a closing quote
    if (ch === "'" && altStr.indexOf("'", i + 1) !== -1) {
      let j = i + 1;
      while (j < altStr.length && altStr[j] !== "'") {
        if (altStr[j] === '\\' && j + 1 < altStr.length) j++;
        j++;
      }
      const raw = altStr.slice(i + 1, j);
      tokens.push(raw === '' ? EPSILON : raw);
      i = j + 1;
      continue;
    }

    // Angle bracketed non-terminal <...>
    if (ch === '<') {
      let j = i + 1;
      while (j < altStr.length && altStr[j] !== '>') {
        j++;
      }
      tokens.push(altStr.slice(i + 1, j).trim());
      i = j + 1;
      continue;
    }

    // Unquoted symbol or word (identifier with primes e.g. E', T', expr)
    if (/[a-zA-Z0-9_]/.test(ch)) {
      let j = i;
      while (j < altStr.length && /[a-zA-Z0-9_']/.test(altStr[j])) {
        j++;
      }
      tokens.push(altStr.slice(i, j));
      i = j;
      continue;
    }

    // Standalone punctuation/operator symbol (e.g. +, *, -, (, ), ,, etc.)
    tokens.push(ch);
    i++;
  }

  return tokens;
}
