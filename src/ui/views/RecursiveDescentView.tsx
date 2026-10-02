import React, { useEffect, useMemo, useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { generateRecursiveDescent } from '../../core/codegen/recursiveDescent';
import { compilePl0, formatPcode } from '../../core/codegen/pl0Compiler';
import { runPcode } from '../../core/codegen/pcodeVm';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { Language } from '../../i18n/translations';
import { Code2, Copy, Check, Download, ExternalLink, Play, AlertTriangle } from 'lucide-react';

/** The KIV/FJP PL/0 interpreter (P-code virtual machine); a program is passed in the hash. */
export const PL0_INTERPRETER_URL = 'https://richardlipka.github.io/online-pl0-interpreter/';

type CodeLang = 'pl0' | 'oberon' | 'pcode';

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link that opens the P-code with its input in the interpreter (the hash is not sent to the server, so length is no problem). */
export function interpreterLink(pcode: string, input: string): string {
  return `${PL0_INTERPRETER_URL}#code_b64=${base64Url(pcode)}&input=${encodeURIComponent(input)}`;
}

interface RecursiveDescentViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  defaultInput?: string;
  lang: Language;
  onAttemptLL1?: () => void;
}

/** Recursive-descent parsers in PL/0 and Oberon generated from an LL(1) grammar, runnable in the PL/0 interpreter. */
export const RecursiveDescentView: React.FC<RecursiveDescentViewProps> = ({ grammar, analysis, llTable, defaultInput = '', lang, onAttemptLL1 }) => {
  const cz = lang === 'cz';
  const [codeLang, setCodeLang] = useState<CodeLang>('pl0');
  const [inputText, setInputText] = useState(defaultInput);
  const [copied, setCopied] = useState(false);
  useEffect(() => setInputText(defaultInput), [defaultInput]);

  type Generated =
    | { gen: ReturnType<typeof generateRecursiveDescent>; pcode: ReturnType<typeof compilePl0>; pcodeText: string }
    | { error: string };
  const generated = useMemo((): Generated | null => {
    if (!llTable.isLL1) return null;
    try {
      const gen = generateRecursiveDescent(grammar, analysis);
      const pcode = compilePl0(gen.pl0);
      return { gen, pcode, pcodeText: formatPcode(pcode) };
    } catch (err) {
      return { error: String(err) };
    }
  }, [grammar, analysis, llTable]);

  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const vmInput = useMemo(() => {
    if (!generated || !('gen' in generated)) return '';
    const charOf = new Map(generated.gen.tokens.map(t => [t.terminal, t.char]));
    return `${tokenized.tokens.map(tok => charOf.get(tok) ?? '?').join('')}$`;
  }, [generated, tokenized]);
  const run = useMemo(
    () => (generated && 'pcode' in generated && tokenized.unknown.length === 0 ? runPcode(generated.pcode, vmInput) : null),
    [generated, vmInput, tokenized]
  );

  if (!llTable.isLL1) {
    return (
      <div className="card">
        <div className="card-title"><span>{cz ? 'Rekurzivní sestup' : 'Recursive descent'}</span></div>
        <div className="notice-box warning">
          <div className="notice-title">
            <AlertTriangle size={15} />
            <span>{cz ? `Gramatika není LL(1) (kolize: ${llTable.conflicts.length})` : `The grammar is not LL(1) (${llTable.conflicts.length} conflicts)`}</span>
          </div>
          <p style={{ margin: '4px 0 8px', fontSize: '12.5px' }}>
            {cz
              ? 'Procedura neterminálu vybírá pravidlo podle jednoho symbolu vstupu; při kolizi v rozkladové tabulce by nevěděla, které pravidlo použít. Gramatiku lze upravit (záložka Úpravy gramatiky) nebo zkusit automatický převod.'
              : 'The procedure of a non-terminal chooses the rule by one input symbol; with a conflict in the parse table it would not know which rule to use. Transform the grammar (tab Transformations) or try the automatic transformation.'}
          </p>
          {onAttemptLL1 && (
            <button type="button" className="btn btn-accent" onClick={onAttemptLL1}>{cz ? 'Zkusit převést na LL(1)' : 'Try to transform to LL(1)'}</button>
          )}
        </div>
      </div>
    );
  }
  if (!generated || 'error' in generated) {
    return <div className="card"><div className="report-box danger">{generated && 'error' in generated ? generated.error : ''}</div></div>;
  }
  const { gen, pcodeText } = generated;
  const text = codeLang === 'pl0' ? gen.pl0 : codeLang === 'oberon' ? gen.oberon : pcodeText;
  const fileName = codeLang === 'pl0' ? 'parser.pl0' : codeLang === 'oberon' ? 'Parser.Mod' : 'parser.pcode.txt';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code2 size={18} color="var(--color-primary)" />
            {cz ? 'Syntaktický analyzátor rekurzivním sestupem' : 'Recursive-descent parser'}
          </span>
        </div>
        <p className="hint-text">
          {cz
            ? 'Každý neterminál má proceduru. Ta podle aktuálního symbolu vstupu (množiny řídicích symbolů z tabulky LL(1)) vybere pravidlo, vypíše jeho číslo (vzniká levý rozklad) a pak pro každý symbol pravé strany zavolá proceduru neterminálu, nebo zkontroluje a přečte terminál. Výstupem je levý rozklad a OK, nebo ERR a symbol, u kterého analyzátor chybu zjistil.'
            : 'Every non-terminal has a procedure. It chooses the rule by the current input symbol (the director sets of the LL(1) table), prints the rule number (giving the left parse), and then for every symbol of the right-hand side calls the procedure of a non-terminal or checks and reads a terminal. The output is the left parse and OK, or ERR and the symbol where the parser found the error.'}
        </p>
        <p className="hint-text" style={{ marginTop: '4px' }}>
          {gen.nested
            ? (cz
              ? 'PL/0 ani Oberon-07 nemají dopředné deklarace, procedura tedy smí volat jen sebe, procedury obklopujících bloků a procedury deklarované před ní. Procedury jsou proto vnořeny podle volání, stejně jako expression ⊃ term ⊃ factor ve Wirthově překladači PL/0.'
              : 'Neither PL/0 nor Oberon-07 has forward declarations, so a procedure may only call itself, procedures of enclosing blocks and procedures declared before it. The procedures are therefore nested along the calls, like expression ⊃ term ⊃ factor in Wirth\'s PL/0 compiler.')
            : (cz
              ? 'Vnoření procedur nestačí na volání této gramatiky (PL/0 ani Oberon-07 nemají dopředné deklarace). PL/0 proto používá jednu proceduru parse, která neterminál dostane v proměnné which, a Oberon volá procedury přes procedurové proměnné (jako ORP.Mod u expression).'
              : 'Nesting the procedures is not enough for the calls of this grammar (neither PL/0 nor Oberon-07 has forward declarations). PL/0 therefore uses one procedure parse that gets the non-terminal in the variable which, and Oberon calls through procedure variables (as ORP.Mod does for expression).')}
        </p>

        <div className="rd-tokens">
          <span className="hint-text">{cz ? 'Terminály na vstupu (každý jedním znakem, vstup končí znakem $):' : 'Terminals in the input (one character each, the input ends with $):'}</span>
          {gen.tokens.map(t => (
            <span key={t.terminal} className="rd-token">
              {t.terminal === t.char ? <code>{t.char}</code> : <><span>{t.terminal}</span> = <code>{t.char}</code></>}
              <span className="rd-token-code">{t.code}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="rd-toolbar">
          <div className="construction-modes" role="group" aria-label={cz ? 'Jazyk' : 'Language'}>
            {(['pl0', 'oberon', 'pcode'] as const).map(l => (
              <button key={l} type="button" className={`btn ${codeLang === l ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={codeLang === l} onClick={() => setCodeLang(l)}>
                {l === 'pl0' ? 'PL/0' : l === 'oberon' ? 'Oberon' : (cz ? 'P-kód' : 'P-code')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? (cz ? 'Zkopírováno' : 'Copied') : (cz ? 'Kopírovat' : 'Copy')}</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={download}>
              <Download size={13} />
              <span>{fileName}</span>
            </button>
          </div>
        </div>
        <p className="hint-text" style={{ margin: '8px 0' }}>
          {codeLang === 'pl0'
            ? (cz
              ? 'PL/0 podle Wirtha se znakovým vstupem a výstupem: ? x přečte jeden znak (instrukce REA), ! v vypíše znak s kódem v (WRI). PL/0 nemá else ani or, proto procedura nejdřív do proměnné rule určí pravidlo a pak je provede.'
              : 'Wirth\'s PL/0 with character input and output: ? x reads one character (instruction REA), ! v writes the character with the code v (WRI). PL/0 has neither else nor or, so a procedure first determines the rule in the variable rule and then expands it.')
            : codeLang === 'oberon'
              ? (cz
                ? 'Oberon-07 s moduly In a Out (Oakwood): In.Char čte znak, Out.Int a Out.String vypisují.'
                : 'Oberon-07 with the modules In and Out (Oakwood): In.Char reads a character, Out.Int and Out.String write.')
              : (cz
                ? 'P-kód programu v PL/0 přeložený jako ve Wirthově překladači (JMC, RET, OPR 0, 8–13 pro relace), ve tvaru pro interpret PL/0 z předmětu KIV/FJP.'
                : 'The P-code of the PL/0 program compiled as by Wirth\'s compiler (JMC, RET, OPR 0, 8–13 for the relations), in the form read by the PL/0 interpreter of the KIV/FJP course.')}
        </p>
        <pre className="rd-code">{text}</pre>
      </div>

      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Play size={16} color="var(--color-primary)" />
            {cz ? 'Spuštění analyzátoru' : 'Running the parser'}
          </span>
        </div>
        <input
          type="text"
          className="grammar-textarea"
          style={{ minHeight: 'unset', height: '38px', padding: '6px 12px', marginBottom: '10px' }}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={cz ? 'Slovo: tokeny oddělené mezerami, nebo bez mezer' : 'Word: tokens separated by spaces, or without spaces'}
          aria-label={cz ? 'Slovo' : 'Word'}
        />
        <TokenizedInputNote tokenized={tokenized} lang={lang} />
        {tokenized.unknown.length === 0 && (
          <>
            <div className="rd-run">
              <span className="hint-text">{cz ? 'Vstup programu:' : 'Program input:'}</span> <code>{vmInput}</code>
            </div>
            {run && (
              <div className={`report-box ${run.output.endsWith('OK') ? 'success' : 'danger'}`} style={{ marginTop: '8px' }}>
                <div style={{ fontWeight: 700 }}>{cz ? 'Výstup (spuštěno zde, stejný P-kód):' : 'Output (run here, the same P-code):'}</div>
                <pre className="rd-output">{run.output}{run.error ? `\n[${run.error}]` : ''}</pre>
                <div className="hint-text">
                  {cz
                    ? 'Čísla jsou levý rozklad – stejný jako v simulaci v záložce Analýza LL(k).'
                    : 'The numbers are the left parse – the same as in the simulation on the LL(k) tab.'}
                </div>
              </div>
            )}
            <a className="btn btn-primary rd-link" href={interpreterLink(pcodeText, vmInput)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <span>{cz ? 'Otevřít v interpretu PL/0 (P-kód a vstup)' : 'Open in the PL/0 interpreter (P-code and input)'}</span>
            </a>
          </>
        )}
      </div>
    </div>
  );
};
