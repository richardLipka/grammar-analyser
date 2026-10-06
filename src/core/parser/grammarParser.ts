/**
 * Multi-syntax Formal Grammar Parser
 *
 * Three input formats are recognised automatically:
 *
 * 1. Textbook / BNF notation (line oriented)
 *    - Arrows: ->, -->, =>, →, ⟶; BNF/EBNF: ::=, :==, :=; also : and =
 *    - Alternatives: | or one alternative per (indented) line
 *    - A trailing ; or . (or a line holding only ; or .) ends a rule
 *    - The left-hand side may stand alone on the line before the operator
 *    - Quoted terminals "..." / '...' (always terminals, never ε or non-terminals)
 *    - Non-terminals: <...> or any symbol that appears on a left-hand side,
 *      including the bracketed names of the lectures ([Ba] after absorbing a,
 *      [A-X] of the left-corner transformation)
 *    - An arrow inside a right-hand side is an error (a line whose left-hand
 *      side was not recognised); a terminal -> has to be quoted
 *    - Epsilon: ε, ϵ, eps, epsilon, λ, lambda, %empty, "", '' and # as a whole
 *      alternative; a standalone e (KIV/FJP notation) unless options.eIsEpsilon
 *      is false, and the result reports that e occurred (bareE)
 *    - Course notation (every left-hand side a capital letter with optional
 *      digits and primes, or a [bracketed] name):
 *      - compact words "S → aSb | ab", "E' → +TE'", "A1 → aA2": when some word
 *        glues a non-terminal to other symbols, or options.splitWords is set,
 *        words are split into the defined non-terminals (longest match) and
 *        single characters; otherwise a word such as bxc or id stays one
 *        terminal and the result lists it (multiLetterWords) so that the UI
 *        can ask
 *      - a capital letter without rules (D, A2, B') is a non-terminal that
 *        generates nothing, with a warning
 *    - Rule numbers are labels, not symbols: "S --> aAS (1)", "(1) S -> a",
 *      "1. S -> a"; a ; followed by a new rule separates rules on one line
 *    - Comments: // and # to the end of the line, /* ... *\/ blocks
 *    - Optional Yacc precedence: lines %left / %right / %nonassoc /
 *      %precedence with tokens (lowest precedence first) and "%prec X" at the
 *      end of an alternative; they resolve conflicts of the LR tables
 *
 * 2. Yacc / Bison (.y): declarations with %token, %left, %right, %nonassoc,
 *    %start, %union, %{ %}, the %% sections, { actions }, %prec, %empty, rules
 *    with or without ; and with the left-hand side on its own line.
 *
 * 3. ANTLR 4 (.g4): "grammar X;" header, options/tokens/@actions blocks,
 *    parser rules with EBNF (...), *, +, ? (expanded into auxiliary
 *    non-terminals), labels x= / x+= / # Alt, lexer rules (taken as tokens;
 *    a lexer rule that is one literal is unified with that literal), EOF.
 */

import { Grammar, Production, END_MARKER, Associativity, PrecedenceLevel } from '../ast/grammar';

export interface ParseError {
  line: number;
  message: string;
  messageCz?: string;
}

export type GrammarDialect = 'plain' | 'yacc' | 'antlr';

export interface ParseResult {
  grammar?: Grammar;
  errors: ParseError[];
  /** Non-fatal remarks (undefined symbols, duplicate rules, ...). */
  warnings: ParseError[];
  /** Neutral notes about how the input was read (format, EBNF expansion, ...). */
  info: ParseError[];
  dialect: GrammarDialect;
  /** A standalone `e` occurs; it was read as ε or as a terminal according to `ParseOptions.eIsEpsilon`. */
  bareE: boolean;
  /**
   * Course notation without a non-terminal glued into a word: the unquoted words of several
   * characters (bxc, id) with the symbols they split into (b x c); split or kept whole
   * according to `ParseOptions.splitWords`.
   */
  multiLetterWords: { word: string; symbols: string[] }[];
  /** Some right-hand side separates its symbols by spaces (then a word is most likely meant whole). */
  spacedSymbols: boolean;
}

export interface ParseOptions {
  /** Read a standalone `e` as the empty word (KIV/FJP notation, default) or as the terminal e. */
  eIsEpsilon?: boolean;
  /** Course notation: split words such as bxc into b x c even when no non-terminal is glued into a word. */
  splitWords?: boolean;
}

// 'bracket': [Ba] before it is known to be a left-hand side; 'arrow': -> inside a right-hand side
type TokenKind = 'bare' | 'quoted' | 'angle' | 'eps' | 'bracket' | 'arrow';

interface RhsToken {
  text: string;
  kind: TokenKind;
  /** Written right after the previous token, without white space. */
  glued?: boolean;
}

interface RawRule {
  lineNum: number;
  lhs: string;
  /** label: the rule number written in the input, e.g. 3 for "A --> a (3)" */
  alts: { tokens: RhsToken[]; lineNum: number; label?: number; prec?: string }[];
}

interface PlainContext {
  eIsEpsilon: boolean;
  bareE: boolean;
  splitWords: boolean;
  multiLetterWords: { word: string; symbols: string[] }[];
  spacedSymbols: boolean;
}

interface FrontEndResult {
  rules: RawRule[];
  startSymbol?: string;
  /** Tokens declared as terminals (%token, lexer rules, tokens { }). */
  declaredTerminals: Set<string>;
  /** Renaming of right-hand side symbols, keyed "kind:text" (ANTLR literal tokens, Bison aliases). */
  aliases: Map<string, string>;
  /** Extra non-terminals created by EBNF expansion (no "undefined symbol" warning). */
  auxiliary: Set<string>;
  /** Yacc precedence levels, lowest first (%left, %right, %nonassoc, %precedence). */
  precedenceLevels?: PrecedenceLevel[];
  /** Course notation: an undefined capital letter (D, A2) is a non-terminal without rules. */
  courseNotation?: boolean;
}

const PLAIN_EPSILON_TOKENS = new Set([
  'epsilon', 'eps', 'EPS', 'EPSILON', 'Epsilon', 'ε', 'ϵ', 'λ', 'lambda', '#'
]);

// Rule numbers: "(3)" or "[3]" after a right-hand side, "(3)", "[3]", "3." or "3)" before a rule
const TRAILING_LABEL_RE = /^(.*\S)\s+[([](\d+)[)\]]$/s;
const LEADING_LABEL_RE = /^(?:\(\d+\)|\[\d+\]|\d+[.)])\s+/;

// Longer operators first so that '::=' wins over ':' and '-->' over '->'.
const RULE_OPERATORS = ['::=', ':==', ':=', '-->', '->', '=>', '→', '⟶', ':', '='];

const LHS_RE = /^(<[^<>]+>|[\p{L}_][\p{L}\p{N}_]*'*)$/u;
// Bracketed names of the lectures: [Ba] (absorption), [A-X] (left corner), nested [[Ba]b]
const BRACKET_NAME_SRC = String.raw`\[(?:[^\s\[\]|"<>]|\[(?:[^\s\[\]|"<>]|\[[^\s\[\]|"<>]*\])*\])+\]`;
const BRACKET_HEAD_RE = new RegExp(`^${BRACKET_NAME_SRC}`, 'u');
// A capital letter with optional digits and primes: the non-terminals of the course notation
const COURSE_NT_RE = /^\p{Lu}\p{N}*'*$/u;
// Arrows that cannot be terminals of a right-hand side unless quoted (':=', ':' and '=' can)
const RHS_ARROWS = ['-->', '->', '→', '::=', '=>'];

/** [Ba], [A-X]; [1] is a rule number, not a name. */
function isBracketName(sym: string): boolean {
  const m = sym.match(BRACKET_HEAD_RE);
  return !!m && m[0] === sym && !/^\[\d+\]$/.test(sym);
}

function isLhsName(sym: string): boolean {
  return LHS_RE.test(sym) || isBracketName(sym);
}

/** Every left-hand side is a capital letter with optional digits and primes, or a [bracketed] name. */
function isCourseNotation(rules: RawRule[]): boolean {
  return rules.length > 0 && rules.every(r => COURSE_NT_RE.test(r.lhs) || isBracketName(r.lhs));
}

const IDENT_START = /[\p{L}\p{N}_]/u;
const IDENT_PART = /[\p{L}\p{N}_']/u;
const IDENT_CHAR_BEFORE_PRIME = /[\p{L}\p{N}_']/u;

const msg = (line: number, message: string, messageCz: string): ParseError => ({ line, message, messageCz });

const PRECEDENCE_LINE_RE = /^\s*%(left|right|nonassoc|precedence)\b/m;
// "… %prec UMINUS" or "… %prec '-'" at the end of an alternative
const PREC_SUFFIX_RE = /^(.*?)\s*%prec\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)\s*$/s;

/** Recognises the input format from its characteristic declarations. */
export function detectDialect(text: string): GrammarDialect {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  if (/^\s*(?:(?:lexer|parser)\s+)?grammar\s+[\p{L}_][\p{L}\p{N}_]*\s*;/mu.test(noComments)) return 'antlr';
  if (/^\s*%(?:%|\{|token\b|start\b|type\b|union\b|define\b|expect\b|nterm\b|code\b)/m.test(noComments)) {
    return 'yacc';
  }
  // %left / %right / … alone: Yacc rules (A : …), or arrow rules with optional precedence lines
  if (PRECEDENCE_LINE_RE.test(noComments)) {
    const rules = noComments.split('\n').filter(l => !/^\s*%/.test(l)).join('\n');
    return /(->|→|⟶|::=|=>)/.test(rules) ? 'plain' : 'yacc';
  }
  return 'plain';
}

export function parseGrammar(text: string, options: ParseOptions = {}): ParseResult {
  const errors: ParseError[] = [];
  const warnings: ParseError[] = [];
  const info: ParseError[] = [];
  const dialect = detectDialect(text);
  const ctx: PlainContext = {
    eIsEpsilon: options.eIsEpsilon ?? true,
    bareE: false,
    splitWords: options.splitWords ?? false,
    multiLetterWords: [],
    spacedSymbols: false
  };

  const front = dialect === 'plain'
    ? parsePlain(text, errors, warnings, info, ctx)
    : parseTerminated(text, dialect, errors, warnings, info);
  const notes = { dialect, bareE: ctx.bareE, multiLetterWords: ctx.multiLetterWords, spacedSymbols: ctx.spacedSymbols };

  if (!front) {
    return { errors, warnings, info, ...notes };
  }
  if (front.rules.length === 0) {
    if (errors.length === 0) {
      errors.push(msg(1, 'No valid grammar rules found.', 'Nebylo nalezeno žádné platné pravidlo.'));
    }
    return { errors, warnings, info, ...notes };
  }

  const grammar = assemble(front, dialect, errors, warnings);
  return { grammar, errors, warnings, info, ...notes };
}

// ---------------------------------------------------------------------------
// Common back end: symbol classification and productions
// ---------------------------------------------------------------------------

function assemble(front: FrontEndResult, dialect: GrammarDialect, errors: ParseError[], warnings: ParseError[]): Grammar {
  const { rules, declaredTerminals, aliases, auxiliary } = front;

  // Non-terminals: every left-hand side plus every <bracketed> symbol
  const nonTerminals = new Set<string>();
  for (const rule of rules) nonTerminals.add(rule.lhs);
  for (const rule of rules) {
    for (const alt of rule.alts) {
      for (const tok of alt.tokens) {
        if (tok.kind === 'angle' && !nonTerminals.has(tok.text)) {
          nonTerminals.add(tok.text);
          warnings.push(msg(alt.lineNum,
            `Non-terminal <${tok.text}> has no rules, so it cannot generate any word.`,
            `Neterminál <${tok.text}> nemá žádná pravidla, nemůže tedy generovat žádné slovo.`));
        }
      }
    }
  }
  // Course notation: D without rules is a non-terminal that generates nothing (nenormovaný symbol)
  if (front.courseNotation) {
    for (const rule of rules) {
      for (const alt of rule.alts) {
        for (const tok of alt.tokens) {
          if (tok.kind === 'bare' && COURSE_NT_RE.test(tok.text) && !nonTerminals.has(tok.text)) {
            nonTerminals.add(tok.text);
            warnings.push(msg(alt.lineNum,
              `'${tok.text}' has no rules. As the left-hand sides are capital letters (the notation of the lectures), '${tok.text}' is a non-terminal that generates no word. Quote it ("${tok.text}") if it is a terminal.`,
              `'${tok.text}' nemá žádná pravidla. Levé strany jsou velká písmena (zápis z přednášek), proto je '${tok.text}' neterminál, který negeneruje žádné slovo. Je-li to terminál, uzavřete jej do uvozovek ("${tok.text}").`));
          }
        }
      }
    }
  }

  const terminals = new Set<string>();
  const productions: Production[] = [];
  const seenProductions = new Set<string>();
  const warnedUndefined = new Set<string>();
  const reportedSymbols = new Set<string>();
  // production id -> the rule number written in the input and its line
  const labels = new Map<number, { label: number; line: number }>();
  // production id -> %prec symbol
  const precOf = new Map<number, { sym: string; line: number }>();
  let prodId = 1;

  for (const rule of rules) {
    const alts = rule.alts.length === 0 ? [{ tokens: [] as RhsToken[], lineNum: rule.lineNum }] : rule.alts;
    for (const alt of alts) {
      const rhs: string[] = [];
      for (const tok0 of alt.tokens) {
        if (tok0.kind === 'eps') continue; // ε inside a sequence is the neutral element
        // ANTLR: token reference PLUS -> literal '+'; Bison: string alias "number" -> token NUM
        const alias = aliases.get(`${tok0.kind}:${tok0.text}`);
        const tok: RhsToken = alias === undefined ? tok0 : { text: alias, kind: dialect === 'antlr' ? 'quoted' : 'bare' };
        const sym = tok.text;

        if (tok.kind === 'quoted') {
          if (nonTerminals.has(sym) && !reportedSymbols.has(sym)) {
            reportedSymbols.add(sym);
            errors.push(msg(alt.lineNum,
              `Symbol '${sym}' is used both as a quoted terminal and as a non-terminal.`,
              `Symbol '${sym}' je použit jako terminál v uvozovkách i jako neterminál.`));
          }
          if (/\s/.test(sym) && !reportedSymbols.has(sym)) {
            reportedSymbols.add(sym);
            errors.push(msg(alt.lineNum,
              `Terminal "${sym}" contains whitespace; terminal names must be single tokens.`,
              `Terminál "${sym}" obsahuje mezeru; názvy terminálů musí být jednotlivé tokeny.`));
          }
        } else if (tok.kind === 'bare' && !nonTerminals.has(sym) && !declaredTerminals.has(sym) && !auxiliary.has(sym) && !warnedUndefined.has(sym)) {
          if (dialect === 'plain' && /^\p{Lu}/u.test(sym)) {
            warnedUndefined.add(sym);
            warnings.push(msg(alt.lineNum,
              `'${sym}' looks like a non-terminal but has no rules; it is treated as a terminal. Add rules for it, or quote it ("${sym}") if it is a token.`,
              `'${sym}' vypadá jako neterminál, ale nemá žádná pravidla; je považován za terminál. Doplňte jeho pravidla, nebo jej uzavřete do uvozovek ("${sym}"), jde-li o token.`));
          } else if (dialect === 'yacc' && sym !== 'error') {
            warnedUndefined.add(sym);
            warnings.push(msg(alt.lineNum,
              `'${sym}' is neither declared by %token nor defined by a rule; it is treated as a token.`,
              `'${sym}' není deklarován direktivou %token ani definován pravidlem; je považován za token.`));
          } else if (dialect === 'antlr') {
            warnedUndefined.add(sym);
            warnings.push(msg(alt.lineNum,
              /^\p{Lu}/u.test(sym)
                ? `Token '${sym}' has no lexer rule (implicit token definition).`
                : `Rule '${sym}' is not defined; it is treated as a token.`,
              /^\p{Lu}/u.test(sym)
                ? `Token '${sym}' nemá lexikální pravidlo (implicitní definice tokenu).`
                : `Pravidlo '${sym}' není definováno; je považováno za token.`));
          }
        }

        if (sym === END_MARKER && !nonTerminals.has(sym) && !reportedSymbols.has(sym)) {
          reportedSymbols.add(sym);
          errors.push(msg(alt.lineNum,
            `'$' is reserved for the end-of-input marker and cannot be used as a terminal.`,
            `Symbol '$' je vyhrazen pro konec vstupu a nelze jej použít jako terminál.`));
        }

        rhs.push(sym);
        if (!nonTerminals.has(sym)) terminals.add(sym);
      }

      const key = `${rule.lhs}\u0000${rhs.join('\u0000')}`;
      if (seenProductions.has(key)) {
        warnings.push(msg(alt.lineNum,
          `Duplicate rule ${rule.lhs} -> ${rhs.join(' ') || 'ε'} was ignored.`,
          `Duplicitní pravidlo ${rule.lhs} -> ${rhs.join(' ') || 'ε'} bylo vynecháno.`));
        continue;
      }
      seenProductions.add(key);
      if (alt.label !== undefined) labels.set(prodId, { label: alt.label, line: alt.lineNum });
      if (alt.prec !== undefined) precOf.set(prodId, { sym: alt.prec, line: alt.lineNum });
      productions.push({ id: prodId++, lhs: rule.lhs, rhs });
    }
  }

  let startSymbol = rules[0].lhs;
  if (front.startSymbol) {
    if (nonTerminals.has(front.startSymbol)) {
      startSymbol = front.startSymbol;
    } else {
      errors.push(msg(1,
        `The start symbol '${front.startSymbol}' has no rules.`,
        `Počáteční symbol '${front.startSymbol}' nemá žádná pravidla.`));
    }
  }

  // Keep the start symbol's rules first so that rule (1) belongs to S
  const ordered = [
    ...productions.filter(p => p.lhs === startSymbol),
    ...productions.filter(p => p.lhs !== startSymbol)
  ];

  // Tables and parse traces refer to rule numbers, so say when they differ from the written ones
  const renumbered = ordered.flatMap((p, idx) => {
    const written = labels.get(p.id);
    return written && written.label !== idx + 1 ? [{ ...written, id: idx + 1 }] : [];
  });
  if (renumbered.length > 0) {
    const list = renumbered.slice(0, 4);
    const more = renumbered.length > list.length ? ', …' : '';
    warnings.push(msg(renumbered[0].line,
      `The rule numbers in the input differ from the numbering used here (rules of the start symbol first, then in the written order): ${list.map(r => `(${r.label}) is rule ${r.id}`).join(', ')}${more}.`,
      `Čísla pravidel ve vstupu se liší od číslování použitého zde (nejprve pravidla počátečního symbolu, pak v pořadí zápisu): ${list.map(r => `(${r.label}) je pravidlo ${r.id}`).join(', ')}${more}.`));
  }

  const grammar: Grammar = { nonTerminals, terminals, startSymbol, productions: ordered.map((p, idx) => ({ ...p, id: idx + 1 })) };
  const precedence = assemblePrecedence(front, ordered, precOf, nonTerminals, warnings);
  if (precedence) grammar.precedence = precedence;
  return grammar;
}

/** Precedence levels and %prec of the rules (renumbered like the productions), with warnings. */
function assemblePrecedence(
  front: FrontEndResult,
  ordered: Production[],
  precOf: Map<number, { sym: string; line: number }>,
  nonTerminals: Set<string>,
  warnings: ParseError[]
): Grammar['precedence'] {
  const alias = (s: string) => front.aliases.get(`quoted:${s}`) ?? front.aliases.get(`bare:${s}`) ?? s;
  const levels = (front.precedenceLevels || []).map(l => ({ assoc: l.assoc, symbols: l.symbols.map(alias) }));
  const declared = new Map<string, number>();
  levels.forEach((l, i) => l.symbols.forEach(sym => {
    if (declared.has(sym)) {
      warnings.push(msg(1, `'${sym}' has more than one precedence declaration; the last one is used.`, `'${sym}' má více deklarací priority; platí poslední.`));
    }
    if (nonTerminals.has(sym)) {
      warnings.push(msg(1, `Precedence is declared for the non-terminal '${sym}'; only tokens (terminals) have precedence.`, `Priorita je deklarována pro neterminál '${sym}'; prioritu mají jen tokeny (terminály).`));
    }
    declared.set(sym, i);
  }));
  const rulePrec = new Map<number, string>();
  ordered.forEach((p, idx) => {
    const prec = precOf.get(p.id);
    if (!prec) return;
    const sym = alias(prec.sym);
    if (!declared.has(sym)) {
      warnings.push(msg(prec.line, `%prec ${sym}: '${sym}' has no declared precedence (%left, %right, %nonassoc), so it has no effect.`, `%prec ${sym}: '${sym}' nemá deklarovanou prioritu (%left, %right, %nonassoc), nemá tedy žádný účinek.`));
    }
    rulePrec.set(idx + 1, sym);
  });
  return levels.length > 0 || rulePrec.size > 0 ? { levels, rulePrec } : undefined;
}

// ---------------------------------------------------------------------------
// Front end 1: textbook / BNF notation (line oriented)
// ---------------------------------------------------------------------------

function normalizeTypography(text: string): string {
  return text
    .replace(/(?<=[\p{L}\p{N}_'])[’′]/gu, "'") // typographic primes: E’ -> E'
    .replace(/[“”„]/g, '"')
    .replace(/⟶/g, '→');
}

function parsePlain(
  text: string,
  errors: ParseError[],
  warnings: ParseError[],
  info: ParseError[],
  ctx: PlainContext
): FrontEndResult | null {
  // 1. Strip block comments while preserving line breaks for accurate error reporting
  const cleaned = normalizeTypography(text)
    .replace(/\/\*[\s\S]*?\*\//g, match => '\n'.repeat((match.match(/\n/g) || []).length));

  const rawLines = cleaned.split(/\r?\n/);
  let lines: { lineNum: number; content: string }[] = [];
  let labelled = false;
  const precedenceLevels: PrecedenceLevel[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const stripped = stripLineComment(rawLines[i]).trim();
    // "%left + -": a precedence level (Yacc), lowest first
    const precLine = stripped.match(/^%(left|right|nonassoc|precedence)\b(.*)$/s);
    if (precLine) {
      const symbols = tokenizeRhs(precLine[2], { ...ctx, eIsEpsilon: false }, false).filter(t => t.kind !== 'eps').map(t => t.text);
      if (symbols.length === 0) {
        warnings.push(msg(i + 1, `%${precLine[1]} without symbols was ignored.`, `%${precLine[1]} bez symbolů byl vynechán.`));
      } else {
        precedenceLevels.push({ assoc: precLine[1] as Associativity, symbols });
      }
      continue;
    }
    // "S -> aAS | b; A -> a | bSA": several rules on one line (handy in URLs)
    for (let segment of splitRulesOnLine(stripped)) {
      // "(1) S -> a", "1. S -> a": the number is a label, not a symbol
      const unlabelled = segment.replace(LEADING_LABEL_RE, '');
      if (unlabelled !== segment && findRuleOperator(unlabelled)) {
        segment = unlabelled;
        labelled = true;
      }
      if (segment.length > 0) {
        lines.push({ lineNum: i + 1, content: segment });
      }
    }
  }

  if (lines.length === 0) {
    errors.push(msg(1, 'Grammar text is empty.', 'Gramatika je prázdná.'));
    return null;
  }

  // "A --> a   (3)": a trailing number labels the alternative; "… %prec X" gives it the precedence of X
  const readAlternative = (alt: string, lineNum: number) => {
    const m = alt.match(TRAILING_LABEL_RE);
    if (m) labelled = true;
    let body = m ? m[1] : alt;
    let prec: string | undefined;
    const pm = body.match(PREC_SUFFIX_RE);
    if (pm) {
      body = pm[1];
      prec = tokenizeRhs(pm[2], { ...ctx, eIsEpsilon: false }, false)[0]?.text;
    }
    return { tokens: tokenizeRhs(body, ctx), lineNum, label: m ? Number(m[2]) : undefined, prec };
  };

  // A left-hand side standing alone on its line, operator on the next one (GNU/Yacc style)
  const merged: typeof lines = [];
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (next && isLhsName(lines[i].content) && RULE_OPERATORS.some(op => next.content.startsWith(op))) {
      merged.push({ lineNum: lines[i].lineNum, content: `${lines[i].content} ${next.content}` });
      i++;
    } else {
      merged.push(lines[i]);
    }
  }
  lines = merged;

  const rawRules: (RawRule & { emptyHead?: boolean })[] = [];
  let current: (typeof rawRules)[number] | null = null;
  let ruleClosed = false;

  // "[Ba] --> a" whose left-hand side was not recognised becomes alternatives of the previous
  // rule with the terminals - - >; an arrow in a right-hand side is therefore an error
  const checkArrows = (alts: RawRule['alts'], lineNum: number, content: string, lhs: string, newRule: boolean) => {
    const arrow = alts.flatMap(a => a.tokens).find(t => t.kind === 'arrow');
    if (!arrow) return;
    const a = arrow.text;
    errors.push(newRule
      ? msg(lineNum,
        `'${a}' inside the right-hand side of ${lhs}: '${content}'. A rule has one symbol on the left of the arrow; write further rules on their own lines or separate them by ';', and quote a terminal '${a}' ("${a}").`,
        `'${a}' uvnitř pravé strany pravidla pro ${lhs}: '${content}'. Pravidlo má vlevo od šipky jediný symbol; další pravidla pište na samostatné řádky nebo je oddělte středníkem a terminál '${a}' uzavřete do uvozovek ("${a}").`)
      : msg(lineNum,
        `'${a}' inside a right-hand side: the line '${content}' was read as alternatives of ${lhs}, because what stands before '${a}' is not one symbol. A rule needs one symbol on the left (A, A', A1, <name>, [Ba]); a terminal '${a}' has to be quoted ("${a}").`,
        `'${a}' uvnitř pravé strany: řádek '${content}' byl přečten jako alternativy ${lhs}, protože před '${a}' nestojí jediný symbol. Pravidlo musí mít vlevo jediný symbol (A, A', A1, <název>, [Ba]); terminál '${a}' je třeba uzavřít do uvozovek ("${a}").`));
    for (const alt of alts) {
      alt.tokens = alt.tokens.map(t => (t.kind === 'arrow' ? { ...t, kind: 'bare' } : t));
    }
  };

  for (const item of lines) {
    let line = item.content;

    // A line holding only a terminator closes the current rule (Yacc style).
    if (line === ';' || line === '.') {
      ruleClosed = true;
      continue;
    }

    // Optional trailing terminator: ends the rule after this line.
    let endsRule = false;
    if ((line.endsWith(';') || line.endsWith('.')) && !endsInsideQuotes(line)) {
      line = line.slice(0, -1).trim();
      endsRule = true;
    }

    const op = line.startsWith('|') ? null : findRuleOperator(line);
    if (op) {
      const potentialLhs = line.slice(0, op.index).trim();
      const rhsPart = line.slice(op.index + op.op.length).trim();
      current = { lineNum: item.lineNum, lhs: cleanSymbol(potentialLhs), alts: [] };
      rawRules.push(current);
      ruleClosed = false;
      if (rhsPart.length > 0) {
        const alts = splitAlternatives(rhsPart).map(alt => readAlternative(alt, item.lineNum));
        checkArrows(alts, item.lineNum, item.content, current.lhs, true);
        current.alts.push(...alts);
      } else {
        // "S :" followed by "| x" means S -> ε | x (Yacc); indented alternatives do not
        current.emptyHead = true;
      }
    } else if (current !== null && !ruleClosed) {
      let rhsPart = line;
      if (rhsPart.startsWith('|')) {
        if (current.emptyHead && current.alts.length === 0) {
          current.alts.push({ tokens: [], lineNum: current.lineNum });
        }
        rhsPart = rhsPart.slice(1).trim();
      }
      current.emptyHead = false;
      const alts = splitAlternatives(rhsPart).map(alt => readAlternative(alt, item.lineNum));
      checkArrows(alts, item.lineNum, item.content, current.lhs, false);
      current.alts.push(...alts);
    } else {
      errors.push(ruleClosed && current !== null
        ? msg(item.lineNum,
          `Alternative after the rule for '${current.lhs}' was already terminated by ';' or '.': '${item.content}'`,
          `Alternativa za pravidlem pro '${current.lhs}', které již bylo ukončeno znakem ';' nebo '.': '${item.content}'`)
        : msg(item.lineNum,
          `Expected production rule (e.g. 'S -> a S b | ε'), found: '${item.content}'`,
          `Očekáváno přepisovací pravidlo (např. 'S -> a S b | ε'), nalezeno: '${item.content}'`));
    }

    if (endsRule) ruleClosed = true;
  }

  if (labelled) {
    info.push(msg(rawRules[0]?.lineNum ?? 1,
      'Rule numbers such as (1) or 1. were read as labels, not as symbols.',
      'Čísla pravidel jako (1) nebo 1. byla brána jako označení pravidel, ne jako symboly.'));
  }

  resolveBracketNames(rawRules, ctx);
  const courseNotation = isCourseNotation(rawRules);
  if (courseNotation) applyCompactNotation(rawRules, info, ctx);

  return {
    rules: rawRules,
    declaredTerminals: new Set(),
    aliases: new Map(),
    auxiliary: new Set(),
    precedenceLevels,
    courseNotation
  };
}

/**
 * [Ba] is a non-terminal when it has rules; otherwise it is read as before, the
 * terminals [ and ] around their contents (an index a[i] of a programming language).
 */
function resolveBracketNames(rules: RawRule[], ctx: PlainContext) {
  const lhsSet = new Set(rules.map(r => r.lhs));
  const resolve = (t: RhsToken): RhsToken[] => {
    if (t.kind !== 'bracket') return [t];
    if (lhsSet.has(t.text)) return [{ text: t.text, kind: 'bare', glued: t.glued }];
    const inner = tokenizeRhs(t.text.slice(1, -1), ctx).flatMap(resolve);
    if (inner.length > 0) inner[0] = { ...inner[0], glued: true };
    return [{ text: '[', kind: 'bare', glued: t.glued }, ...inner, { text: ']', kind: 'bare', glued: true }];
  };
  for (const r of rules) {
    for (const a of r.alts) a.tokens = a.tokens.flatMap(resolve);
  }
}

/**
 * Compact textbook notation "S → aSb | ab", "E' → +TE'", "A1 → aA2" (the rules
 * are in course notation): when some unquoted word glues a non-terminal to
 * further symbols, or the user said so (ctx.splitWords), words are split into
 * the defined non-terminals (longest match, E' before E, A1 before A) and single
 * characters; an undefined capital keeps its digits and primes (E'', A2).
 * Without that, a word such as bxc or id stays one terminal and is reported in
 * ctx.multiLetterWords, since it may mean either.
 */
function applyCompactNotation(rules: RawRule[], info: ParseError[], ctx: PlainContext) {
  const lhsSet = new Set(rules.map(r => r.lhs));
  const names = [...lhsSet].sort((a, b) => b.length - a.length);
  const splitWord = (w: string): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < w.length) {
      const nt = names.find(n => w.startsWith(n, i) && w[i + n.length] !== "'");
      const piece = nt ?? w.slice(i).match(/^(?:\p{Lu}\p{N}*'*|\p{L}'*|.)/su)![0];
      out.push(piece);
      i += piece.length;
    }
    return out;
  };
  const splittable = (t: RhsToken) =>
    t.kind === 'bare' && IDENT_START.test(t.text[0]) && !lhsSet.has(t.text) && splitWord(t.text).length > 1;
  const isNonTerminal = (t?: RhsToken) => !!t && (t.kind === 'bare' || t.kind === 'angle') && lhsSet.has(t.text);

  // aSb, +TE', or a word glued to a [bracketed] non-terminal (ab[Ba])
  const evidence = rules.some(r => r.alts.some(a => a.tokens.some((t, k) => splittable(t) && (
    splitWord(t.text).some(piece => lhsSet.has(piece)) ||
    (k > 0 && t.glued && isNonTerminal(a.tokens[k - 1])) ||
    (a.tokens[k + 1]?.glued && isNonTerminal(a.tokens[k + 1]))
  ))));
  ctx.spacedSymbols = rules.some(r => r.alts.some(a => a.tokens.some((t, k) => k > 0 && !t.glued)));
  if (!evidence) {
    const seen = new Set<string>();
    for (const r of rules) {
      for (const a of r.alts) {
        for (const t of a.tokens) {
          if (splittable(t) && !seen.has(t.text)) {
            seen.add(t.text);
            ctx.multiLetterWords.push({ word: t.text, symbols: splitWord(t.text) });
          }
        }
      }
    }
    if (!ctx.splitWords || ctx.multiLetterWords.length === 0) return;
  }

  for (const r of rules) {
    for (const a of r.alts) {
      a.tokens = a.tokens.flatMap(t =>
        splittable(t)
          ? splitWord(t.text).map((ch, k) => ({ text: ch, kind: 'bare' as TokenKind, glued: k > 0 || t.glued }))
          : [t]);
    }
  }
  info.push(msg(rules[0].lineNum,
    'Compact notation: words are split into the non-terminals of the left-hand sides (including primes and digits, e.g. E\', A1) and single characters, so aSb = a S b and +TE\' = + T E\'. Separate symbols by spaces or quote multi-letter terminals ("id") to use whole words.',
    'Kompaktní zápis: slova se dělí na neterminály z levých stran (včetně čárek a číslic, např. E\', A1) a jednotlivé znaky, tedy aSb = a S b a +TE\' = + T E\'. Pro víceznakové symboly oddělte symboly mezerami nebo terminály uzavřete do uvozovek ("id").'));
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
    // Inside a literal a backslash escapes the next character ("\"", "\\"), as in the tokenizer
    if (inQuote && ch === '\\' && i + 1 < line.length) {
      if (onChar(i, true) === true || onChar(i + 1, true) === true) return;
      i++;
      continue;
    }
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
  // A bracketed left-hand side may itself contain operator characters (<if-then>, [B:]).
  const head = line.match(/^<[^<>]+>/) ?? line.match(BRACKET_HEAD_RE);
  const from = head ? head[0].length : 0;
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
  return isLhsName(line.slice(0, index).trim()) ? { index, op } : null;
}

// A new rule "A ->" after white space inside a right-hand side; only arrows, since ':' and '=' are common terminals
const NEXT_RULE_RE = new RegExp(String.raw`\s+(?:<[^<>]+>|[\p{L}_][\p{L}\p{N}_]*'*|${BRACKET_NAME_SRC})\s*(?:-->|->|→|⟶|::=)`, 'uy');

/**
 * Where further rules start on one line: after a ';' that is followed by a rule
 * ("S -> aAS | b; A -> a | bSA"), or at white space before "A ->" once the
 * current rule has a right-hand side ("S -> aAS | b A -> a | bSA").
 */
function ruleBreaks(line: string): { at: number; semicolon: boolean }[] {
  const breaks: { at: number; semicolon: boolean }[] = [];
  let start = 0;
  let rhsFrom = -1; // where the right-hand side of the current rule begins
  const updateRhs = () => {
    const seg = line.slice(start);
    let from = start + seg.length - seg.trimStart().length;
    const label = line.slice(from).match(LEADING_LABEL_RE);
    if (label && findRuleOperator(line.slice(from + label[0].length))) from += label[0].length;
    const op = findRuleOperator(line.slice(from));
    rhsFrom = op ? from + op.index + op.op.length : -1;
  };
  updateRhs();
  scanQuotes(line, (i, inQuote) => {
    if (inQuote) return;
    if (line[i] === ';') {
      if (findRuleOperator(line.slice(i + 1).trim().replace(LEADING_LABEL_RE, ''))) {
        breaks.push({ at: i + 1, semicolon: true });
        start = i + 1;
        updateRhs();
      }
      return;
    }
    if (rhsFrom !== -1 && i > rhsFrom && /\s/.test(line[i]) && !/\s/.test(line[i - 1])) {
      NEXT_RULE_RE.lastIndex = i;
      const rhs = line.slice(rhsFrom, i).trim();
      if (NEXT_RULE_RE.test(line) && rhs.length > 0 && !rhs.endsWith('|')) {
        breaks.push({ at: i, semicolon: false });
        start = i;
        updateRhs();
      }
    }
  });
  return breaks;
}

/** Splits a line holding several rules; a separating ; stays at the end of its rule as the terminator. */
function splitRulesOnLine(line: string): string[] {
  const cuts = [0, ...ruleBreaks(line).map(b => b.at), line.length];
  return cuts.slice(1).map((end, k) => line.slice(cuts[k], end).trim());
}

/**
 * Puts every rule of a textbook-notation grammar on its own line (alternatives
 * stay together): "S-->aAS|b;A-->a|bSA" becomes "S-->aAS|b" and "A-->a|bSA".
 * Used for grammars that arrive in a link. Yacc and ANTLR input is returned unchanged.
 */
export function oneRulePerLine(text: string): string {
  if (detectDialect(text) !== 'plain') return text;
  return text.split(/\r?\n/).flatMap(line => {
    const breaks = ruleBreaks(stripLineComment(line));
    if (breaks.length === 0) return [line];
    const cuts = [0, ...breaks.map(b => b.at), line.length];
    return cuts.slice(1).map((end, k) => {
      const piece = line.slice(cuts[k], end).trim();
      return breaks[k]?.semicolon ? piece.replace(/;$/, '').trimEnd() : piece;
    });
  }).join('\n');
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

/**
 * The symbols of one alternative. In a right-hand side (`rhs`, not a %left line)
 * [Ba] is a 'bracket' token and an arrow an 'arrow' token.
 */
function tokenizeRhs(altStr: string, ctx: PlainContext, rhs = true): RhsToken[] {
  const tokens: RhsToken[] = [];
  let i = 0;
  let prevEnd = -1; // where the previous token ended
  const push = (text: string, kind: TokenKind, start: number, end: number) => {
    tokens.push({ text, kind, glued: tokens.length > 0 && prevEnd === start });
    prevEnd = end;
    i = end;
  };

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
      push(raw, raw === '' ? 'eps' : 'quoted', i, j + 1);
      continue;
    }

    // Bison's explicit empty alternative
    if (altStr.startsWith('%empty', i)) {
      push('', 'eps', i, i + '%empty'.length);
      continue;
    }

    // Angle-bracketed non-terminal <...>; a lone '<' is an ordinary terminal
    if (ch === '<') {
      const close = altStr.indexOf('>', i + 1);
      const inner = close === -1 ? '' : altStr.slice(i + 1, close);
      if (close !== -1 && inner.trim().length > 0 && !inner.includes('<')) {
        push(inner.trim(), 'angle', i, close + 1);
        continue;
      }
    }

    // [Ba]: a non-terminal of the lectures if it has rules, else the terminals [ Ba ] (resolveBracketNames)
    if (rhs && ch === '[') {
      const m = altStr.slice(i).match(BRACKET_HEAD_RE);
      if (m && isBracketName(m[0])) {
        push(m[0], 'bracket', i, i + m[0].length);
        continue;
      }
    }

    // Unquoted identifier (with primes, e.g. E', T'', expr_list, Výraz)
    if (IDENT_START.test(ch) && !'εϵλ'.includes(ch)) {
      let j = i;
      while (j < altStr.length && IDENT_PART.test(altStr[j]) && !'εϵλ'.includes(altStr[j])) {
        j++;
      }
      const word = altStr.slice(i, j);
      if (word === 'e') {
        // KIV/FJP lectures write the empty word as e; the UI asks whether that is meant
        ctx.bareE = true;
        push(word, ctx.eIsEpsilon ? 'eps' : 'bare', i, j);
      } else {
        push(word, PLAIN_EPSILON_TOKENS.has(word) ? 'eps' : 'bare', i, j);
      }
      continue;
    }

    // An arrow: the next rule did not start on its own line, or a terminal that should be quoted
    const arrow = rhs ? RHS_ARROWS.find(a => altStr.startsWith(a, i)) : undefined;
    if (arrow) {
      push(arrow, 'arrow', i, i + arrow.length);
      continue;
    }

    // Standalone punctuation/operator symbol (e.g. +, *, -, (, ), ε, #)
    push(ch, PLAIN_EPSILON_TOKENS.has(ch) ? 'eps' : 'bare', i, i + 1);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Front end 2: Yacc / Bison and ANTLR (rules terminated by ';')
// ---------------------------------------------------------------------------

type STokKind = 'ident' | 'quoted' | 'punct' | 'directive' | 'number';

interface STok {
  kind: STokKind;
  text: string;
  line: number;
}

/** Tokenizer shared by the Yacc and ANTLR front ends (comments, literals, directives). */
function scanTerminated(text: string, dialect: 'yacc' | 'antlr'): STok[] {
  const toks: STok[] = [];
  let line = 1;
  let i = 0;
  const identRe = dialect === 'yacc' ? /[\p{L}\p{N}_.]/u : /[\p{L}\p{N}_]/u;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let raw = '';
      while (j < text.length && text[j] !== ch && text[j] !== '\n') {
        if (text[j] === '\\' && j + 1 < text.length) {
          // Control characters keep their escape as the visible terminal name ('\n' -> \n)
          const esc = text[j + 1];
          raw += 'ntrfbv0'.includes(esc) ? `\\${esc}` : esc;
          j += 2;
          continue;
        }
        raw += text[j];
        j++;
      }
      if (text[j] === ch) {
        toks.push({ kind: 'quoted', text: raw === ' ' ? '␣' : raw, line });
        i = j + 1;
      } else {
        toks.push({ kind: 'punct', text: ch, line }); // stray apostrophe (e.g. in C code)
        i++;
      }
      continue;
    }
    if (dialect === 'yacc' && ch === '%') {
      if (text[i + 1] === '{') {
        const end = text.indexOf('%}', i + 2);
        const stop = end === -1 ? text.length : end + 2;
        for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
        i = stop;
        continue;
      }
      if (text[i + 1] === '%') {
        toks.push({ kind: 'directive', text: '%%', line });
        i += 2;
        continue;
      }
      let j = i + 1;
      while (j < text.length && /[\p{L}\p{N}_-]/u.test(text[j])) j++;
      toks.push({ kind: 'directive', text: text.slice(i, j), line });
      i = j;
      continue;
    }
    if (ch === '<') {
      // <type> tags (Yacc) and <assoc=right> element options (ANTLR) are irrelevant here
      const close = text.indexOf('>', i + 1);
      if (close !== -1 && !text.slice(i + 1, close).includes('\n') && /^[\w\s=:.,*&]*$/.test(text.slice(i + 1, close))) {
        i = close + 1;
        continue;
      }
    }
    if (/\p{N}/u.test(ch)) {
      let j = i;
      while (j < text.length && /\p{N}/u.test(text[j])) j++;
      toks.push({ kind: 'number', text: text.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      let j = i;
      while (j < text.length && identRe.test(text[j])) j++;
      toks.push({ kind: 'ident', text: text.slice(i, j), line });
      i = j;
      continue;
    }
    if (ch === '+' && text[i + 1] === '=') {
      toks.push({ kind: 'punct', text: '+=', line });
      i += 2;
      continue;
    }
    if (ch === '-' && text[i + 1] === '>') {
      toks.push({ kind: 'punct', text: '->', line });
      i += 2;
      continue;
    }
    if (ch === ':' && text[i + 1] === ':') {
      toks.push({ kind: 'punct', text: '::', line });
      i += 2;
      continue;
    }
    toks.push({ kind: 'punct', text: ch, line });
    i++;
  }
  return toks;
}

/** Index just after the balanced group that opens at `i` ('{' … '}' or '[' … ']'). */
function skipGroup(toks: STok[], i: number): number {
  const open = toks[i].text;
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (toks[j].kind !== 'punct') continue;
    if (toks[j].text === open) depth++;
    else if (toks[j].text === close && --depth === 0) return j + 1;
  }
  return toks.length;
}

/** Removes { actions } and {predicates}? from a token list. */
function removeActions(toks: STok[]): STok[] {
  const out: STok[] = [];
  for (let i = 0; i < toks.length; ) {
    if (toks[i].kind === 'punct' && toks[i].text === '{') {
      i = skipGroup(toks, i);
      if (toks[i]?.kind === 'punct' && toks[i].text === '?') i++;
      continue;
    }
    out.push(toks[i]);
    i++;
  }
  return out;
}

function parseTerminated(
  text: string,
  dialect: 'yacc' | 'antlr',
  errors: ParseError[],
  warnings: ParseError[],
  info: ParseError[]
): FrontEndResult | null {
  const all = scanTerminated(text, dialect);
  const declaredTerminals = new Set<string>();
  const aliases = new Map<string, string>();
  const precedenceLevels: PrecedenceLevel[] = [];
  let startSymbol: string | undefined;

  interface RuleSlice { lhs: string; line: number; body: STok[]; lexer: boolean; fragment: boolean }
  const slices: RuleSlice[] = [];

  if (dialect === 'yacc') {
    const firstSep = all.findIndex(t => t.kind === 'directive' && t.text === '%%');
    const secondSep = firstSep === -1 ? -1 : all.findIndex((t, k) => k > firstSep && t.kind === 'directive' && t.text === '%%');
    const decl = firstSep === -1 ? [] : all.slice(0, firstSep);
    const body = removeActions(firstSep === -1 ? all : all.slice(firstSep + 1, secondSep === -1 ? all.length : secondSep));

    // Declarations section
    for (let i = 0; i < decl.length; ) {
      const t = decl[i];
      if (t.kind === 'punct' && t.text === '{') {
        i = skipGroup(decl, i);
        continue;
      }
      if (t.kind !== 'directive') {
        i++;
        continue;
      }
      let j = i + 1;
      const args: STok[] = [];
      while (j < decl.length && decl[j].kind !== 'directive') {
        if (decl[j].kind === 'punct' && decl[j].text === '{') {
          j = skipGroup(decl, j);
          continue;
        }
        args.push(decl[j]);
        j++;
      }
      if (['%left', '%right', '%nonassoc', '%precedence'].includes(t.text)) {
        const symbols = args.filter(a => a.kind === 'ident' || a.kind === 'quoted').map(a => a.text);
        if (symbols.length > 0) precedenceLevels.push({ assoc: t.text.slice(1) as Associativity, symbols });
      }
      if (['%token', '%left', '%right', '%nonassoc', '%precedence'].includes(t.text)) {
        let lastName: string | undefined;
        for (const a of args) {
          if (a.kind === 'ident') {
            declaredTerminals.add(a.text);
            lastName = a.text;
          } else if (a.kind === 'quoted') {
            if (t.text === '%token' && lastName && a.text.length > 1) aliases.set(`quoted:${a.text}`, lastName); // %token NUM "number"
            else declaredTerminals.add(a.text);
          }
        }
      } else if (t.text === '%start') {
        startSymbol = args.find(a => a.kind === 'ident')?.text;
      }
      i = j;
    }

    // Rules section: "lhs : body [;]", a new rule starts with "ident :"
    let i = 0;
    while (i < body.length) {
      const t = body[i];
      if (t.kind === 'directive' && t.text !== '%empty' && t.text !== '%prec') {
        // directives between rules (no %% given): treat like declarations
        let j = i + 1;
        const args: STok[] = [];
        while (j < body.length && !(body[j].kind === 'ident' && body[j + 1]?.text === ':') && body[j].kind !== 'directive') {
          args.push(body[j]);
          j++;
        }
        if (['%token', '%left', '%right', '%nonassoc', '%precedence'].includes(t.text)) {
          args.filter(a => a.kind === 'ident' || a.kind === 'quoted').forEach(a => declaredTerminals.add(a.text));
          if (t.text !== '%token') {
            const symbols = args.filter(a => a.kind === 'ident' || a.kind === 'quoted').map(a => a.text);
            if (symbols.length > 0) precedenceLevels.push({ assoc: t.text.slice(1) as Associativity, symbols });
          }
        } else if (t.text === '%start') {
          startSymbol = args.find(a => a.kind === 'ident')?.text;
        }
        i = j;
        continue;
      }
      if (t.kind === 'ident' && body[i + 1]?.kind === 'punct' && body[i + 1].text === ':') {
        let j = i + 2;
        const ruleBody: STok[] = [];
        while (j < body.length) {
          const u = body[j];
          if (u.kind === 'punct' && u.text === ';') {
            j++;
            break;
          }
          if (u.kind === 'ident' && body[j + 1]?.kind === 'punct' && body[j + 1].text === ':') break;
          if (u.kind === 'directive' && !['%empty', '%prec', '%dprec', '%merge', '%expect', '%expect-rr'].includes(u.text)) break;
          ruleBody.push(u);
          j++;
        }
        slices.push({ lhs: t.text, line: t.line, body: ruleBody, lexer: false, fragment: false });
        i = j;
        continue;
      }
      if (!(t.kind === 'punct' && t.text === ';')) {
        errors.push(msg(t.line, `Unexpected '${t.text}' outside of a rule.`, `Neočekávaný symbol '${t.text}' mimo pravidlo.`));
      }
      i++;
    }
    info.push(msg(1,
      'Yacc/Bison grammar: declarations, %% sections, { actions } and %prec were read; character literals are terminals.',
      'Gramatika ve formátu Yacc/Bison: zpracovány deklarace, sekce %%, { akce } a %prec; znakové literály jsou terminály.'));
  } else {
    // ANTLR 4
    let toks = all;
    const header = toks.findIndex(t => t.kind === 'ident' && t.text === 'grammar');
    let grammarKind = 'combined';
    if (header !== -1 && toks[header + 2]?.text === ';') {
      if (header > 0 && toks[header - 1].kind === 'ident' && (toks[header - 1].text === 'lexer' || toks[header - 1].text === 'parser')) {
        grammarKind = toks[header - 1].text;
      }
      toks = toks.slice(header + 3);
    }
    if (grammarKind === 'lexer') {
      errors.push(msg(1, 'This is an ANTLR lexer grammar; it has no parser rules to analyse.', 'Toto je lexikální gramatika ANTLR; neobsahuje žádná syntaktická pravidla k analýze.'));
      return null;
    }

    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.kind === 'ident' && ['options', 'tokens', 'channels'].includes(t.text) && toks[i + 1]?.text === '{') {
        const end = skipGroup(toks, i + 1);
        if (t.text === 'tokens') {
          toks.slice(i + 2, end - 1).filter(x => x.kind === 'ident').forEach(x => declaredTerminals.add(x.text));
        }
        i = end;
        continue;
      }
      if (t.kind === 'punct' && t.text === '@') {
        // @header { … }, @parser::members { … }
        let j = i + 1;
        while (j < toks.length && !(toks[j].kind === 'punct' && toks[j].text === '{')) j++;
        i = j < toks.length ? skipGroup(toks, j) : j;
        continue;
      }
      if (t.kind === 'ident' && (t.text === 'import' || t.text === 'mode')) {
        while (i < toks.length && toks[i].text !== ';') i++;
        i++;
        continue;
      }
      if (t.kind === 'ident' && (t.text === 'catch' || t.text === 'finally')) {
        i++;
        while (i < toks.length && toks[i].kind === 'punct' && (toks[i].text === '[' || toks[i].text === '{')) i = skipGroup(toks, i);
        continue;
      }
      if (t.kind === 'ident') {
        let fragment = false;
        let j = i;
        if (t.text === 'fragment') {
          fragment = true;
          j++;
        }
        const name = toks[j];
        if (!name || name.kind !== 'ident') {
          i = j + 1;
          continue;
        }
        // Rule header: [args] returns [..] locals [..] throws X options {..} @init {..}
        j++;
        while (j < toks.length && !(toks[j].kind === 'punct' && toks[j].text === ':')) {
          if (toks[j].kind === 'punct' && (toks[j].text === '[' || toks[j].text === '{')) j = skipGroup(toks, j);
          else if (toks[j].kind === 'punct' && toks[j].text === ';') break;
          else j++;
        }
        if (toks[j]?.text !== ':') {
          errors.push(msg(name.line, `Rule '${name.text}' has no ':'.`, `Pravidlo '${name.text}' nemá ':'.`));
          i = j + 1;
          continue;
        }
        j++;
        const ruleBody: STok[] = [];
        let depth = 0;
        while (j < toks.length) {
          const u = toks[j];
          if (u.kind === 'punct' && (u.text === '{' || u.text === '[')) {
            const end = skipGroup(toks, j);
            j = end;
            if (toks[j]?.kind === 'punct' && toks[j].text === '?') j++;
            continue;
          }
          if (u.kind === 'punct' && u.text === '(') depth++;
          if (u.kind === 'punct' && u.text === ')') depth--;
          if (u.kind === 'punct' && u.text === ';' && depth <= 0) {
            j++;
            break;
          }
          ruleBody.push(u);
          j++;
        }
        const lexer = /^\p{Lu}/u.test(name.text);
        slices.push({ lhs: name.text, line: name.line, body: ruleBody, lexer, fragment });
        i = j;
        continue;
      }
      i++;
    }

    // Lexer rules define tokens; a rule that is a single literal is unified with it
    for (const s of slices.filter(x => x.lexer && !x.fragment)) {
      declaredTerminals.add(s.lhs);
      const arrow = s.body.findIndex(x => x.kind === 'punct' && x.text === '->');
      const core = arrow === -1 ? s.body : s.body.slice(0, arrow);
      if (core.length === 1 && core[0].kind === 'quoted' && core[0].text.length > 0) {
        aliases.set(`bare:${s.lhs}`, core[0].text);
      }
    }
    const lexerCount = slices.filter(x => x.lexer).length;
    info.push(msg(1,
      `ANTLR grammar: ${lexerCount} lexer rule(s) were taken as tokens (a rule that is one literal, e.g. PLUS : '+', is replaced by the literal); EBNF operators ( ) * + ? were expanded into auxiliary non-terminals; EOF stands for the end marker $.`,
      `Gramatika ANTLR: lexikální pravidla (počet: ${lexerCount}) byla převzata jako tokeny (pravidlo tvořené jedním literálem, např. PLUS : '+', je nahrazeno literálem); operátory EBNF ( ) * + ? byly rozepsány pomocnými neterminály; EOF označuje konec vstupu $.`));
  }

  // Bodies of parser rules: EBNF → BNF
  const parserSlices = slices.filter(s => !s.lexer && !s.fragment);
  const taken = new Set<string>([...slices.map(s => s.lhs), ...declaredTerminals]);
  const auxiliary = new Set<string>();
  const rules: RawRule[] = [];

  for (const s of parserSlices) {
    const ctx: EbnfContext = {
      lhs: s.lhs,
      line: s.line,
      dialect,
      errors,
      aux: [],
      newName: (kind: string) => {
        let name = `${s.lhs}_${kind}`;
        for (let n = 2; taken.has(name); n++) name = `${s.lhs}_${kind}${n}`;
        taken.add(name);
        auxiliary.add(name);
        return name;
      },
      onEof: () => undefined
    };
    const [items, , precs] = parseEbnfAlternatives(s.body, 0, ctx);
    const alts = items.map((seq, k) => ({ tokens: seq.flatMap(item => expandEbnfItem(item, ctx)), lineNum: s.line, prec: precs[k] }));
    rules.push({ lhs: s.lhs, lineNum: s.line, alts });
    rules.push(...ctx.aux);
  }

  if (dialect === 'antlr' && startSymbol === undefined && parserSlices.length > 0) startSymbol = parserSlices[0].lhs;
  if (parserSlices.length === 0 && errors.length === 0) {
    errors.push(msg(1, 'No parser rules found.', 'Nebyla nalezena žádná syntaktická pravidla.'));
    return null;
  }

  return { rules, startSymbol, declaredTerminals, aliases, auxiliary, precedenceLevels };
}

// ---------------------------------------------------------------------------
// EBNF bodies (ANTLR; Yacc bodies are the plain sequence subset)
// ---------------------------------------------------------------------------

type EbnfElem = { kind: 'sym'; tok: RhsToken } | { kind: 'group'; alts: EbnfItem[][] };

interface EbnfItem {
  elem: EbnfElem;
  suffix: '' | '*' | '+' | '?';
}

interface EbnfContext {
  lhs: string;
  line: number;
  dialect: 'yacc' | 'antlr';
  errors: ParseError[];
  aux: RawRule[];
  newName: (kind: string) => string;
  onEof: () => void;
}

function parseEbnfAlternatives(toks: STok[], start: number, ctx: EbnfContext): [EbnfItem[][], number, (string | undefined)[]] {
  const alts: EbnfItem[][] = [[]];
  // %prec X of each alternative (Yacc)
  const precs: (string | undefined)[] = [];
  let i = start;
  while (i < toks.length) {
    const t = toks[i];
    if (t.kind === 'punct' && t.text === ')') break;
    if (t.kind === 'punct' && t.text === '|') {
      alts.push([]);
      i++;
      continue;
    }
    if (t.kind === 'punct' && t.text === '#') {
      i += toks[i + 1]?.kind === 'ident' ? 2 : 1; // ANTLR alternative label
      continue;
    }
    if (t.kind === 'directive') {
      if (t.text === '%prec' || t.text === '%dprec' || t.text === '%merge') {
        if (t.text === '%prec' && toks[i + 1]) precs[alts.length - 1] = toks[i + 1].text;
        i += 2;
      } else {
        i++; // %empty and anything else
      }
      continue;
    }
    if (t.kind === 'ident' && toks[i + 1]?.kind === 'punct' && (toks[i + 1].text === '=' || toks[i + 1].text === '+=')) {
      i += 2; // element label x=expr, xs+=ID
      continue;
    }

    let elem: EbnfElem | null = null;
    if (t.kind === 'punct' && t.text === '(') {
      const [inner, j] = parseEbnfAlternatives(toks, i + 1, ctx);
      i = toks[j]?.text === ')' ? j + 1 : j;
      elem = { kind: 'group', alts: inner };
    } else if (t.kind === 'ident') {
      i++;
      if (t.text === 'EOF' && ctx.dialect === 'antlr') {
        ctx.onEof();
        continue;
      }
      elem = { kind: 'sym', tok: { text: t.text, kind: 'bare' } };
    } else if (t.kind === 'quoted') {
      i++;
      elem = { kind: 'sym', tok: t.text === '' ? { text: '', kind: 'eps' } : { text: t.text, kind: 'quoted' } };
    } else {
      ctx.errors.push(msg(t.line,
        t.text === '.' || t.text === '~'
          ? `The ANTLR operator '${t.text}' (wildcard / negation) cannot be converted to a context-free rule.`
          : `Unexpected '${t.text}' in the rule for '${ctx.lhs}'.`,
        t.text === '.' || t.text === '~'
          ? `Operátor ANTLR '${t.text}' (libovolný symbol / negace) nelze převést na bezkontextové pravidlo.`
          : `Neočekávaný symbol '${t.text}' v pravidle pro '${ctx.lhs}'.`));
      i++;
      continue;
    }

    let suffix: EbnfItem['suffix'] = '';
    const s = toks[i];
    if (s?.kind === 'punct' && (s.text === '*' || s.text === '+' || s.text === '?')) {
      suffix = s.text;
      i++;
      if (toks[i]?.kind === 'punct' && toks[i].text === '?') i++; // non-greedy *? +? ??
    }
    alts[alts.length - 1].push({ elem, suffix });
  }
  return [alts, i, precs];
}

function expandEbnfItem(item: EbnfItem, ctx: EbnfContext): RhsToken[] {
  const flattenAlts = (alts: EbnfItem[][]) => alts.map(seq => seq.flatMap(x => expandEbnfItem(x, ctx)));
  const addRule = (name: string, alts: RhsToken[][]) => {
    ctx.aux.push({ lhs: name, lineNum: ctx.line, alts: alts.map(tokens => ({ tokens, lineNum: ctx.line })) });
  };

  let base: RhsToken[];
  if (item.elem.kind === 'sym') {
    base = [item.elem.tok];
  } else if (item.elem.alts.length === 1 && item.suffix === '') {
    return flattenAlts(item.elem.alts)[0];
  } else if (item.elem.alts.length === 1) {
    base = flattenAlts(item.elem.alts)[0];
  } else {
    const g = ctx.newName('grp');
    // Register the rule before expanding the alternatives so that nested groups follow it
    const rule: RawRule = { lhs: g, lineNum: ctx.line, alts: [] };
    ctx.aux.push(rule);
    rule.alts = flattenAlts(item.elem.alts).map(tokens => ({ tokens, lineNum: ctx.line }));
    base = [{ text: g, kind: 'bare' }];
  }

  switch (item.suffix) {
    case '':
      return base;
    case '?': {
      const n = ctx.newName('opt');
      addRule(n, [base, []]);
      return [{ text: n, kind: 'bare' }];
    }
    case '*': {
      const n = ctx.newName('list');
      addRule(n, [[...base, { text: n, kind: 'bare' }], []]);
      return [{ text: n, kind: 'bare' }];
    }
    case '+': {
      const n = ctx.newName('list');
      addRule(n, [[...base, { text: n, kind: 'bare' }], []]);
      return [...base, { text: n, kind: 'bare' }];
    }
  }
}
