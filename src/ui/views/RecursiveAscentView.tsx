import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { LRTable } from '../../core/lr/lrTable';
import { AscentLang, GeneratedAscent, canGenerateAscent, generateRecursiveAscent, lineKey } from '../../core/codegen/recursiveAscent';
import { simulateRecursiveAscent, AscentSimulation, AscentStep } from '../../core/codegen/recursiveAscentSimulator';
import { compilePl0, formatPcode } from '../../core/codegen/pl0Compiler';
import { runPcode } from '../../core/codegen/pcodeVm';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { AutomatonGraphVisualizer } from '../visualizer/AutomatonGraphVisualizer';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language } from '../../i18n/translations';
import { AlertTriangle, CheckCircle2, Copy, Check, Download, ExternalLink, Play, XCircle, BookOpen, Layers } from 'lucide-react';

type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'IELR(1)' | 'LR(1)';
const VARIANTS: LRVariantName[] = ['LR(0)', 'SLR(1)', 'LALR(1)', 'IELR(1)', 'LR(1)'];

/** Automata with more states are drawn only on request (as on the tab LR automaton). */
const GRAPH_STATE_LIMIT = 150;

/**
 * Literature of recursive ascent. The metadata (authors, title, venue, pages,
 * DOI) were checked against Crossref; what the texts say about the works
 * follows Horspool's report (§5.2–5.3), the only one read in full here.
 */
export const RECURSIVE_ASCENT_REFERENCES = [
  {
    authorYear: 'Pennello (1986)',
    topicEn: 'Very fast LR parsing: the LR table as directly executed code',
    topicCz: 'Velmi rychlá analýza LR: tabulka LR jako přímo prováděný kód',
    citation: 'Pennello, T. J.: Very fast LR parsing. SIGPLAN \'86 Symposium on Compiler Construction, ACM SIGPLAN Notices 21(7), 145–151, 1986.',
    url: 'https://doi.org/10.1145/13310.13326'
  },
  {
    authorYear: 'Roberts (1988)',
    topicEn: 'Recursive ascent: an LR analog to recursive descent',
    topicCz: 'Rekurzivní vzestup jako LR obdoba rekurzivního sestupu',
    citation: 'Roberts, G. H.: Recursive ascent: an LR analog to recursive descent. ACM SIGPLAN Notices 23(8), 23–29, 1988.',
    url: 'https://doi.org/10.1145/47907.47909'
  },
  {
    authorYear: 'Kruseman Aretz (1988)',
    topicEn: 'On a recursive ascent parser',
    topicCz: 'Analyzátor rekurzivním vzestupem',
    citation: 'Kruseman Aretz, F. E. J.: On a recursive ascent parser. Information Processing Letters 29(4), 201–206, 1988.',
    url: 'https://doi.org/10.1016/0020-0190(88)90061-0'
  },
  {
    authorYear: 'Roberts (1989)',
    topicEn: 'Another note on recursive ascent',
    topicCz: 'Další poznámka k rekurzivnímu vzestupu',
    citation: 'Roberts, G. H.: Another note on recursive ascent. Information Processing Letters 32(5), 263–266, 1989.',
    url: 'https://doi.org/10.1016/0020-0190(89)90054-9'
  },
  {
    authorYear: 'Leermakers, Augusteijn & Kruseman Aretz (1992)',
    topicEn: 'A functional LR parser',
    topicCz: 'Funkcionální analyzátor LR',
    citation: 'Leermakers, R., Augusteijn, L., Kruseman Aretz, F. E. J.: A functional LR parser. Theoretical Computer Science 104(2), 313–323, 1992.',
    url: 'https://doi.org/10.1016/0304-3975(92)90128-3'
  },
  {
    authorYear: 'Horspool (1993)',
    topicEn: 'Recursive ascent-descent parsing',
    topicCz: 'Analýza rekurzivním vzestupem a sestupem',
    citation: 'Horspool, R. N.: Recursive ascent-descent parsing. Computer Languages 18(1), 1–15, 1993. Report version (University of Victoria, 11 June 1991): webhome.cs.uvic.ca/~nigelh/Publications/rad.pdf.',
    url: 'https://doi.org/10.1016/0096-0551(93)90027-X'
  }
];

/** One line of the program; memoized, so a step re-renders only the lines whose highlighting changes */
const CodeLine = React.memo(({ n, text, cls }: { n: number; text: string; cls: string }) => (
  <div data-line={n} className={`ra-line ${cls}`}>
    <span className="ra-ln">{n}</span>
    <span className="ra-text">{text || ' '}</span>
  </div>
));

const FILE_NAMES: Record<AscentLang, string> = { js: 'parser.js', python: 'parser.py', c: 'parser.c', pl0: 'parser.pl0' };
const LANG_LABELS: Record<AscentLang, string> = { js: 'JavaScript', python: 'Python', c: 'C', pl0: 'PL/0' };

interface RecursiveAscentViewProps {
  grammar: Grammar;
  tables: Record<LRVariantName, LRTable | undefined>;
  selectedVariant: LRVariantName;
  onSelectVariant: (v: LRVariantName) => void;
  defaultInput?: string;
  lang: Language;
  /** A link that opens a P-code program with its input in the PL/0 interpreter */
  interpreterLink: (pcode: string, input: string) => string;
}

export const RecursiveAscentView: React.FC<RecursiveAscentViewProps> = ({
  grammar,
  tables,
  selectedVariant,
  onSelectVariant,
  defaultInput = '',
  lang,
  interpreterLink
}) => {
  const cz = lang === 'cz';
  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);
  const [codeLang, setCodeLang] = useState<AscentLang>('js');
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [copied, setCopied] = useState(false);
  const [jsRun, setJsRun] = useState<string | null>(null);
  const [showLargeGraph, setShowLargeGraph] = useState(false);

  const table = tables[selectedVariant];
  const usable = VARIANTS.filter(v => tables[v] && canGenerateAscent(tables[v]!));
  const ok = !!table && canGenerateAscent(table);

  const generated = useMemo((): { gen: GeneratedAscent; pcode: ReturnType<typeof compilePl0>; pcodeText: string } | { error: string } | null => {
    if (!ok) return null;
    try {
      const gen = generateRecursiveAscent(grammar, table!);
      const pcode = compilePl0(gen.code.pl0);
      return { gen, pcode, pcodeText: formatPcode(pcode) };
    } catch (err) {
      return { error: String(err) };
    }
  }, [grammar, table, ok]);
  const gen = generated && 'gen' in generated ? generated.gen : null;

  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const simulation: AscentSimulation | null = useMemo(
    () => (gen && tokenized.unknown.length === 0 ? simulateRecursiveAscent(tokenized.tokens, gen, table!) : null),
    [gen, tokenized, table]
  );
  useEffect(() => {
    setStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);
  const total = simulation?.steps.length ?? 0;
  useAutoPlay(isPlaying, stepIdx, total, speed, setStepIdx, () => setIsPlaying(false));
  const step: AscentStep | undefined = simulation?.steps[Math.min(stepIdx, total - 1)];

  const vmInput = useMemo(() => {
    if (!gen) return '';
    const charOf = new Map(gen.tokens.map(t => [t.terminal, t.char]));
    return `${tokenized.tokens.map(tok => charOf.get(tok) ?? '?').join('')}$`;
  }, [gen, tokenized]);
  const vmRun = useMemo(
    () => (generated && 'pcode' in generated && tokenized.unknown.length === 0 ? runPcode(generated.pcode, vmInput) : null),
    [generated, vmInput, tokenized]
  );
  useEffect(() => setJsRun(null), [vmInput, generated]);

  // The code panel: lines of the step, the procedure that acted, scrolled to the first line of the step
  const codeRef = useRef<HTMLDivElement>(null);
  const code = gen ? gen.code[codeLang] : '';
  const codeLines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const lines = gen?.lines[codeLang];
  const activeLines = useMemo(() => new Set((step?.lineKeys ?? []).map(k => lines?.get(k)).filter((n): n is number => n !== undefined)), [step, lines]);
  const procRange = step && lines ? [lines.get(lineKey.head(step.state)) ?? 0, lines.get(lineKey.end(step.state)) ?? 0] : [0, 0];
  const enteredRange = step?.target !== undefined && lines ? [lines.get(lineKey.head(step.target)) ?? 0, lines.get(lineKey.proc(step.target)) ?? 0] : [0, 0];
  useEffect(() => {
    const box = codeRef.current;
    const first = Math.min(...activeLines);
    if (!box || !Number.isFinite(first)) return;
    const row = box.querySelector(`[data-line="${first}"]`) as HTMLElement | null;
    if (!row) return;
    // the box is position: relative, so offsetTop is measured from it
    const top = row.offsetTop;
    if (top < box.scrollTop + 20 || top > box.scrollTop + box.clientHeight - 60) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }, [activeLines]);

  const name = (q: number) => gen?.states[q]?.name ?? String(q);
  const nodeTitles = useMemo(() => gen?.states.map(s => s.name), [gen]);
  const automaton = table?.automaton;
  const focusEdge = step && step.target !== undefined
    ? { from: step.state, symbol: step.kind === 'shift' ? step.lookahead : step.nt! }
    : undefined;
  const topState = step ? step.frames[step.frames.length - 1] : 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = FILE_NAMES[codeLang];
    a.click();
    URL.revokeObjectURL(url);
  };
  const runJs = () => {
    if (!gen) return;
    try {
      const parse = new Function(gen.code.js.replace('export function parse', 'function parse') + '\nreturn parse;')();
      setJsRun(parse(vmInput).output);
    } catch (err) {
      setJsRun(`Execution error: ${String(err)}`);
    }
  };

  const variantButtons = (
    <div className="construction-modes" role="group" aria-label={cz ? 'Tabulka' : 'Table'}>
      {VARIANTS.map(v => {
        const t = tables[v];
        const free = !!t && canGenerateAscent(t);
        return (
          <button
            key={v}
            type="button"
            className={`btn ${selectedVariant === v ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '3px 8px', fontSize: '11px' }}
            aria-pressed={selectedVariant === v}
            onClick={() => onSelectVariant(v)}
            title={!t ? (cz ? 'Nespočteno – výpočet byl zastaven' : 'Not computed – the computation was stopped') : free ? (cz ? 'Bez kolizí' : 'No conflicts') : (cz ? `Kolize: ${t.conflicts.length}` : `Conflicts: ${t.conflicts.length}`)}
          >
            {v} {t ? (free ? '✓' : '✗') : ''}
          </button>
        );
      })}
    </div>
  );

  const correspondence: [string, string][] = cz
    ? [
      ['stav M na vrcholu zásobníku', 'právě běžící procedura M (volaná po přesunu do M)'],
      ['zásobník stavů # E₁ +₁ T₂', 'zásobník volání start → E1 → plus → T2: každá aktivace procedury je jedna položka'],
      ['f(M, a) = P (přesun), g(M, a) = N', 'přečti a, zavolej proceduru stavu N'],
      ['f(M, a) = R i, i: A → α – odeber |α| stavů, pak vlož g(M′, A)', 'vypiš i a vrať (A, |α|); každý volající sníží počet o 1 a vrací dál, dokud není 0; procedura M′, u které klesne na 0, zavolá g(M′, A) – a ve smyčce totéž s výsledkem tohoto volání'],
      ['redukce A → ε (nic se neodebírá)', 'procedura M zavolá g(M, A) sama, bez návratu'],
      ['f(M, $) = A (přijetí)', 'pravidlo 0 S′ → S jako redukce: návrat (S′, 1) do #, kde přechod podle S′ neexistuje – analýza končí'],
      ['prázdná položka f: chyba', 'výjimka (JavaScript, Python) nebo příznak ok (C, PL/0) ukončí všechna volání'],
      ['pravý rozklad', 'čísla pravidel vypsaná při redukcích, ve stejném pořadí']
    ]
    : [
      ['state M on top of the stack', 'the running procedure M (called after the shift into M)'],
      ['the state stack # E₁ +₁ T₂', 'the call stack start → E1 → plus → T2: every activation of a procedure is one entry'],
      ['f(M, a) = shift, g(M, a) = N', 'read a, call the procedure of state N'],
      ['f(M, a) = reduce i, i: A → α – pop |α| states, then push g(M′, A)', 'print i and return (A, |α|); every caller decrements the count and returns it until it is 0; the procedure M′ where it reaches 0 calls g(M′, A) – and in a loop does the same with the result of that call'],
      ['a reduction A → ε (nothing is popped)', 'the procedure M calls g(M, A) itself, without returning'],
      ['f(M, $) = accept', 'the rule 0 S′ → S as a reduction: it returns (S′, 1) to #, which has no goto over S′ – the parse ends'],
      ['an empty entry of f: error', 'an exception (JavaScript, Python) or the flag ok (C, PL/0) ends all calls'],
      ['the right parse', 'the rule numbers printed at the reductions, in the same order']
    ];

  const stepKindLabel = (s: AscentStep): string => {
    const labels: Record<AscentStep['kind'], [string, string]> = {
      call: ['volání', 'call'], shift: ['přesun', 'shift'], reduce: ['redukce: návrat', 'reduce: return'],
      epsilon: ['ε-redukce', 'ε-reduction'], return: ['návrat', 'return'], goto: ['přechod (goto)', 'goto'],
      accept: ['přijetí', 'accept'], error: ['chyba', 'error']
    };
    return labels[s.kind][cz ? 0 : 1];
  };

  return (
    <div>
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--color-primary)" />
            {cz ? 'Rekurzivní vzestup: analyzátor LR jako procedury' : 'Recursive ascent: an LR parser as procedures'}
          </span>
          {variantButtons}
        </div>
        <p className="hint-text">
          {cz
            ? 'Rekurzivní vzestup je obdobou rekurzivního sestupu pro analýzu zdola nahoru: místo procedury pro každý neterminál má procedura každý stav LR automatu. Procedura stavu se volá po přesunu do něj, podle symbolu vstupu (tabulka f) přečte terminál a zavolá proceduru dalšího stavu, nebo při redukci podle A → α vrátí dvojici (A, |α|). Každý volající počet sníží o jedna; kde klesne na nulu, je stav na vrcholu po odebrání |α| stavů a ten zavolá proceduru stavu g(stav, A). Zásobník volání je tedy přesně zásobník stavů analyzátoru LR.'
            : 'Recursive ascent is the bottom-up counterpart of recursive descent: instead of a procedure per non-terminal, every state of the LR automaton has a procedure. The procedure of a state is called after the shift into it; by the input symbol (the table f) it reads a terminal and calls the procedure of the next state, or after a reduction by A → α it returns the pair (A, |α|). Every caller decrements the count; where it reaches zero is the state on top after popping |α| states, and that one calls the procedure of g(state, A). So the call stack is exactly the state stack of the LR parser.'}
        </p>
        <ReferenceBar
          references={RECURSIVE_ASCENT_REFERENCES}
          lang={lang}
          label={cz ? 'Literatura (rekurzivní vzestup):' : 'Literature (recursive ascent):'}
        />

        {!ok && (
          <div className="notice-box warning" style={{ marginTop: '10px' }}>
            <div className="notice-title">
              <AlertTriangle size={15} />
              <span>
                {!table
                  ? (cz ? `Tabulka ${selectedVariant} nebyla spočtena (výpočet byl zastaven).` : `The ${selectedVariant} table was not computed (the computation was stopped).`)
                  : (cz ? `Tabulka ${selectedVariant} má kolize (${table.conflicts.length}).` : `The ${selectedVariant} table has conflicts (${table.conflicts.length}).`)}
              </span>
            </div>
            <p style={{ margin: '4px 0 8px', fontSize: '12.5px' }}>
              {cz
                ? 'Procedura stavu se podle symbolu vstupu rozhoduje jednoznačně; při kolizi by nevěděla, zda přesunout, nebo podle kterého pravidla redukovat. Rekurzivní vzestup proto potřebuje tabulku bez kolizí (konflikty vyřešené prioritami %left/%right se počítají jako vyřešené).'
                : 'The procedure of a state decides by the input symbol; with a conflict it would not know whether to shift or by which rule to reduce. Recursive ascent therefore needs a table without conflicts (conflicts decided by %left/%right precedence count as resolved).'}
            </p>
            {usable.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="hint-text">{cz ? 'Bez kolizí:' : 'Without conflicts:'}</span>
                {usable.map(v => (
                  <button key={v} type="button" className="btn btn-accent" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => onSelectVariant(v)}>{v}</button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 600 }}>
                {cz ? 'Žádná z tabulek není bez kolizí: gramatika není LR(1) (záložka LR analyzátory nabízí úpravy).' : 'None of the tables is conflict-free: the grammar is not LR(1) (the tab LR parsers offers transformations).'}
              </p>
            )}
          </div>
        )}
        {generated && 'error' in generated && <div className="report-box danger" style={{ marginTop: '10px' }}>{generated.error}</div>}
        {ok && table && table.resolvedConflicts.length > 0 && (
          <p className="hint-text" style={{ marginTop: '6px' }}>
            {cz
              ? `Tabulka ${selectedVariant} je bez kolizí díky prioritám (vyřešeno konfliktů: ${table.resolvedConflicts.length}); program se řídí vyřešenou tabulkou.`
              : `The ${selectedVariant} table is conflict-free thanks to the precedence (${table.resolvedConflicts.length} conflict(s) resolved); the program follows the resolved table.`}
          </p>
        )}
      </div>

      {gen && table && automaton && (
        <div className="card ra-workspace-host">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Play size={16} color="var(--color-primary)" />
              {cz ? 'Krokování: zásobník volání = zásobník stavů' : 'Step simulator: the call stack = the state stack'}
            </span>
            {simulation && (
              <span className={`badge ${simulation.accepted ? 'badge-success' : 'badge-danger'}`}>
                {simulation.accepted ? (cz ? 'přijato' : 'accepted') : (cz ? 'odmítnuto' : 'rejected')}
              </span>
            )}
          </div>
          <input
            type="text"
            className="grammar-textarea"
            style={{ minHeight: 'unset', height: '38px', padding: '6px 12px', marginBottom: '6px' }}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={cz ? 'Slovo: tokeny oddělené mezerami, nebo bez mezer' : 'Word: tokens separated by spaces, or without spaces'}
            aria-label={cz ? 'Slovo' : 'Word'}
          />
          <TokenizedInputNote tokenized={tokenized} lang={lang} />

          {simulation && step && (
            <>
              <div className="sim-sticky">
                <SimulatorControls stepIdx={stepIdx} total={total} isPlaying={isPlaying} speed={speed} lang={lang} onStep={setStepIdx} onTogglePlay={() => setIsPlaying(p => !p)} onSpeed={setSpeed} />
                <div className="card ra-step" style={{ padding: '10px 14px', borderLeft: `4px solid ${step.kind === 'error' ? 'var(--color-danger)' : step.kind === 'accept' ? 'var(--color-success)' : 'var(--color-primary)'}` }}>
                  <div style={{ fontSize: '12.5px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {cz ? `Krok ${stepIdx + 1} z ${total} (${stepKindLabel(step)}): ` : `Step ${stepIdx + 1} of ${total} (${stepKindLabel(step)}): `}
                    </span>
                    <span>{cz ? step.text.cz : step.text.en}</span>
                  </div>
                </div>
              </div>

              <div className="ra-grid">
                <div className="ra-col">
                  <div className="ra-panel-head">
                    <div className="construction-modes" role="group" aria-label={cz ? 'Jazyk' : 'Language'}>
                      {(['js', 'python', 'c', 'pl0'] as const).map(l => (
                        <button key={l} type="button" className={`btn ${codeLang === l ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '3px 8px', fontSize: '11px' }} aria-pressed={codeLang === l} onClick={() => setCodeLang(l)}>
                          {LANG_LABELS[l]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ra-code" ref={codeRef} data-testid="ra-code">
                    {codeLines.map((text, i) => {
                      const n = i + 1;
                      const cls = [
                        activeLines.has(n) ? 'active' : '',
                        n >= procRange[0] && n <= procRange[1] ? 'in-proc' : '',
                        n >= enteredRange[0] && n <= enteredRange[1] ? 'entered' : ''
                      ].filter(Boolean).join(' ');
                      return <CodeLine key={n} n={n} text={text} cls={cls} />;
                    })}
                  </div>
                </div>

                <div className="ra-col">
                  {automaton.states.length > GRAPH_STATE_LIMIT && !showLargeGraph ? (
                    <div className="notice-box warning">
                      <p style={{ margin: '0 0 8px', fontSize: '12.5px' }}>
                        {cz ? `Automat má ${automaton.states.length} stavů; vykreslení může trvat.` : `The automaton has ${automaton.states.length} states; drawing it may take a while.`}
                      </p>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowLargeGraph(true)}>{cz ? 'Přesto vykreslit' : 'Draw it anyway'}</button>
                    </div>
                  ) : (
                    <AutomatonGraphVisualizer
                      automaton={automaton}
                      selectedStateId={topState}
                      nodeTitles={nodeTitles}
                      focusEdge={focusEdge}
                      lang={lang}
                      height="560px"
                      followZoom={0.8}
                    />
                  )}
                </div>

                <div className="ra-col ra-col-right">
                  <div className="ra-stacks" data-testid="ra-stacks">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{cz ? 'Zásobník volání' : 'Call stack'}</th>
                          <th>{cz ? 'Zásobník stavů LR' : 'LR state stack'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...step.frames].map((q, i) => ({ q, i })).reverse().map(({ q, i }) => {
                          const isTop = i === step.frames.length - 1;
                          return (
                            <tr key={i} className={isTop ? 'table-row-active' : ''}>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>
                                {gen.states[q].proc}()
                                {isTop && <span className="badge badge-primary" style={{ marginLeft: '6px' }}>{cz ? 'běží' : 'running'}</span>}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>{step.frameSymbols[i] || '–'}</span> <strong>{name(q)}</strong>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(step.kind === 'reduce' || step.kind === 'return') && step.nt !== undefined && (
                      <div className="ra-returning">
                        {cz ? 'Vrací se ' : 'Returning '}<code>({step.nt}, {step.count})</code>
                        {cz ? ` z ${name(step.state)} volajícímu ${name(step.frames[step.frames.length - 1])}` : ` from ${name(step.state)} to its caller ${name(step.frames[step.frames.length - 1])}`}
                      </div>
                    )}
                    <div className="ra-facts">
                      <div>
                        <span className="hint-text">{cz ? 'Vstup: ' : 'Input: '}</span>
                        <code>
                          <span style={{ color: 'var(--color-text-muted)' }}>{tokenized.tokens.slice(0, step.position).join(' ')}</span>
                          {step.position > 0 ? ' • ' : '• '}
                          <strong>{[...tokenized.tokens.slice(step.position), '$'].join(' ')}</strong>
                        </code>
                      </div>
                      <div>
                        <span className="hint-text">{cz ? 'Pravý rozklad: ' : 'Right parse: '}</span>
                        <code>{step.rightParse.join(' ') || '–'}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`report-box ${simulation.accepted ? 'success' : 'danger'}`} style={{ marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                {simulation.accepted ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span>
                  {simulation.accepted
                    ? (cz ? `Slovo přijato. Pravý rozklad: ${simulation.rightParse.join(' ') || '–'} (stejný jako v záložce LR analyzátory).` : `Word accepted. Right parse: ${simulation.rightParse.join(' ') || '–'} (the same as on the tab LR parsers).`)
                    : simulation.stopped
                      ? (cz ? 'Zastaveno po limitu kroků.' : 'Stopped at the step limit.')
                      : (cz ? 'Slovo odmítnuto.' : 'Word rejected.')}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {gen && generated && 'pcodeText' in generated && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Play size={16} color="var(--color-primary)" />
              {cz ? 'Program a jeho spuštění' : 'The program and its run'}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={copy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? (cz ? 'Zkopírováno' : 'Copied') : (cz ? 'Kopírovat' : 'Copy')}</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={download}>
                <Download size={13} />
                <span>{FILE_NAMES[codeLang]}</span>
              </button>
            </div>
          </div>
          <p className="hint-text">
            {codeLang === 'js'
              ? (cz ? 'JavaScript: funkce parse(vstup) vrací { ok, rightParse, output }; chyba je výjimka, která ukončí všechna volání. Z příkazové řádky: node parser.js < vstup.' : 'JavaScript: the function parse(input) returns { ok, rightParse, output }; an error is an exception that leaves all calls. From the command line: node parser.js < input.')
              : codeLang === 'python'
                ? (cz ? 'Python 3: python parser.py < vstup. Funkce vrací dvojici (A, počet); chyba je výjimka ParseError. Hloubka rekurze je zvýšena na 10 000 (zásobník stavů roste s délkou vstupu).' : 'Python 3: python parser.py < input. A function returns the pair (A, count); an error is the exception ParseError. The recursion limit is raised to 10,000 (the state stack grows with the input).')
                : codeLang === 'c'
                  ? (cz ? 'C99 (gcc -std=c99 parser.c): funkce vrací počet a neterminál je v globální proměnné lhs, protože C nevrací dvojice. Chyba nastaví ok = 0 a funkce se vracejí bez dalších akcí. Návratový kód programu je 0 pro přijaté slovo.' : 'C99 (gcc -std=c99 parser.c): a function returns the count and the non-terminal is in the global variable lhs, since C returns no pairs. An error sets ok = 0 and the functions return without further actions. The exit status is 0 for an accepted word.')
                  : (cz ? 'PL/0 nemá návratové hodnoty ani dopředné deklarace (přechody automatu tvoří cykly, nestačilo by ani vnoření procedur). Proto je jediná procedura state: číslo stavu dostane v proměnné which a uchová si je v lokální proměnné mine – její aktivační záznamy na zásobníku P-stroje jsou doslova zásobník stavů. Výsledek redukce je v globálních proměnných lhs a cnt. PL/0 nemá else: procedura nejdřív do act určí akci, pak ji provede.' : 'PL/0 has neither function results nor forward declarations (the transitions of the automaton form cycles, so not even nested procedures would do). There is one procedure state: it gets the state number in the variable which and keeps it in its local variable mine – its activation records on the stack of the P-machine are literally the state stack. The result of a reduction is in the global variables lhs and cnt. PL/0 has no else: the procedure first determines the action in act, then performs it.')}
            {' '}
            {cz ? 'Oberon se negeneruje: má funkční procedury a procedurové proměnné, šlo by tedy o program v C jinými slovy, a zde jej nelze spustit.' : 'Oberon is not generated: it has function procedures and procedure variables, so it would be the C program in other words, and it cannot be run here.'}
          </p>
          <div className="rd-tokens">
            <span className="hint-text">{cz ? 'Terminály na vstupu (každý jedním znakem, vstup končí znakem $):' : 'Terminals in the input (one character each, the input ends with $):'}</span>
            {gen.tokens.map(t => (
              <span key={t.terminal} className="rd-token">
                {t.terminal === t.char ? <code>{t.char}</code> : <><span>{t.terminal}</span> = <code>{t.char}</code></>}
              </span>
            ))}
          </div>
          {tokenized.unknown.length === 0 && (
            <>
              <div className="rd-run" style={{ marginTop: '8px' }}>
                <span className="hint-text">{cz ? 'Vstup programu:' : 'Program input:'}</span> <code>{vmInput}</code>
              </div>
              {vmRun && (
                <div className={`report-box ${vmRun.output.endsWith('OK') ? 'success' : 'danger'}`} style={{ marginTop: '8px' }}>
                  <div style={{ fontWeight: 700 }}>{cz ? 'Výstup programu v PL/0 (P-kód spuštěný zde):' : 'Output of the PL/0 program (its P-code run here):'}</div>
                  <pre className="rd-output">{vmRun.output}{vmRun.error ? `\n[${vmRun.error}]` : ''}</pre>
                  <div className="hint-text">
                    {cz ? 'Čísla jsou pravý rozklad: pravidla redukcí v jejich pořadí. Programy v ostatních jazycích vypíšou totéž.' : 'The numbers are the right parse: the rules of the reductions in their order. The programs in the other languages print the same.'}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                <a className="btn btn-primary rd-link" href={interpreterLink(generated.pcodeText, vmInput)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  <span>{cz ? 'Otevřít v interpretu PL/0 (P-kód a vstup)' : 'Open in the PL/0 interpreter (P-code and input)'}</span>
                </a>
                <button type="button" className="btn btn-secondary rd-link" onClick={runJs}>
                  <Play size={13} />
                  <span>{cz ? 'Spustit JavaScript v prohlížeči' : 'Run the JavaScript in the browser'}</span>
                </button>
              </div>
              {jsRun !== null && (
                <div className={`report-box ${jsRun.endsWith('OK') ? 'success' : 'danger'}`} style={{ marginTop: '8px' }}>
                  <div style={{ fontWeight: 700 }}>{cz ? 'Výstup programu v JavaScriptu:' : 'Output of the JavaScript program:'}</div>
                  <pre className="rd-output">{jsRun}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--color-primary)" />
            {cz ? 'Jak si odpovídají analyzátor LR a rekurzivní vzestup' : 'How the LR parser and recursive ascent correspond'}
          </span>
        </div>
        <div className="data-table-container">
          <table className="data-table ra-correspondence">
            <thead>
              <tr>
                <th>{cz ? 'Analyzátor LR řízený tabulkou' : 'Table-driven LR parser'}</th>
                <th>{cz ? 'Rekurzivní vzestup' : 'Recursive ascent'}</th>
              </tr>
            </thead>
            <tbody>
              {correspondence.map(([a, b], i) => (
                <tr key={i}><td>{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ra-theory">
          <h4>{cz ? 'Počet v návratové hodnotě' : 'The count in the result'}</h4>
          <p>
            {cz
              ? 'Redukce podle A → α má odebrat |α| stavů, tedy ukončit |α| procedur najednou. Horspool (zpráva 1991, §5.2) to zapisuje jako víceúrovňový návrat return* k s neterminálem v globální proměnné lhs; v jazycích bez takového příkazu se simuluje počtem: procedura vrátí |α|, každý volající odečte jedničku a vrací dál, dokud počet není nula. Kde je nula, analýza pokračuje přechodem g – v cyklu, protože i procedura nového stavu se může vrátit s neterminálem, pro který je přechod zde. Krokování proto ukazuje redukci jako |α| návratů a jedno volání, kde tabulkový analyzátor má jeden krok.'
              : 'A reduction by A → α has to pop |α| states, that is, end |α| procedures at once. Horspool (1991 report, §5.2) writes this as a multi-level return return* k with the non-terminal in a global variable lhs; in languages without such a statement it is simulated by the count: the procedure returns |α|, every caller subtracts one and returns again until the count is zero. Where it is zero, the parse goes on with the goto g – in a loop, because the procedure of the new state may also return with a non-terminal whose goto is here. The step simulator therefore shows a reduction as |α| returns and one call where the table-driven parser has one step.'}
          </p>
          <h4>{cz ? 'K čemu je a k čemu ne' : 'What it is good for and what not'}</h4>
          <p>
            {cz
              ? 'Program nepotřebuje tabulku ani explicitní zásobník a běží rychleji než analyzátor řízený tabulkou, je ale mnohem větší (kód pro každý stav; skutečné gramatiky mají stovky stavů). Horspool uvádí, že jiné přímo prováděné analyzátory LR – mezi nimi Pennellův (1986) – jsou ještě rychlejší a podstatně menší, a že sémantické akce se do procedur stavů vkládají obtížně: tatáž akce by se opakovala v mnoha stavech a není zřejmé, kam patří. Ruční psaní, hlavní výhoda rekurzivního sestupu, zde nepřichází v úvahu – stavy se počítají z LR automatu.'
              : 'The program needs neither a table nor an explicit stack and runs faster than a table-driven parser, but it is much larger (code for every state; real grammars have hundreds of states). Horspool notes that other directly executed LR parsers – among them Pennello\'s (1986) – are faster still and considerably smaller, and that semantic actions are hard to insert into the state procedures: the same action would be repeated in many states, and where it belongs is not obvious. Writing the parser by hand, the main advantage of recursive descent, is out of the question – the states come from the LR automaton.'}
          </p>
          <h4>{cz ? 'Rekurzivní vzestup a sestup (Horspool 1993)' : 'Recursive ascent-descent (Horspool 1993)'}</h4>
          <p>
            {cz
              ? 'Horspool spojuje oba přístupy pomocí zobecněné analýzy levého rohu (Demers 1977), kterou rozšířil z SLR(1) na LALR(1) a LR(1). Analyzátor postupuje zdola nahoru jen do chvíle, kdy je jasné, podle kterého pravidla se analyzuje – do prvního „volného místa“ (free position, Purdom a Brown 1980) pravé strany, kam by šlo vložit sémantickou akci, tj. ε-neterminál, aniž by gramatika přestala patřit do dané třídy. Tehdy pravidlo „ohlásí“ a zbytek pravé strany zpracuje procedura pravidla shora dolů, jako rekurzivní sestup; neterminály ve zbytku spouštějí novou analýzu od jejich vstupního stavu. Řídicí část může být tabulková, nebo napsaná rekurzivním vzestupem – odtud název. Výsledek má obvykle mnohem méně stavů než LALR(1) a sémantický kód se píše přímo do procedur pravidel, na každé volné místo, aniž by se znovu spouštěl generátor.'
              : 'Horspool combines both approaches by generalised left-corner parsing (Demers 1977), which he extends from SLR(1) to LALR(1) and LR(1). The parser works bottom-up only until it is clear by which rule it is parsing – up to the first "free position" (Purdom and Brown 1980) of the right-hand side, where a semantic action, i.e. an ε-non-terminal, could be inserted without the grammar leaving its class. Then it "announces" the rule, and a procedure of the rule parses the rest of the right-hand side top-down, like recursive descent; the non-terminals in the rest start a new parse from their entry states. The control part can be table-driven or written as recursive ascent – hence the name. The result usually has far fewer states than LALR(1), and semantic code is written directly into the rule procedures, at every free position, without running the generator again.'}
          </p>
          <p className="hint-text">
            {cz
              ? 'Popis vychází z Horspoolovy zprávy z roku 1991 (§5.2–5.3; časopisecká verze 1993 se v podrobnostech může lišit). Ostatní práce zde nebyly čteny v plném znění; jejich bibliografické údaje jsou ověřeny v Crossrefu. Horspool řadí k původcům rekurzivního vzestupu Kruseman Aretze (1988), Barnarda a Cordyho (1988) a Robertse (1988, 1989); Leermakers, Augusteijn a Kruseman Aretz (1992) jej formulují funkcionálně. Pennello (1986) je jiný přímo prováděný analyzátor LR.'
              : 'The description follows Horspool\'s 1991 report (§5.2–5.3; the 1993 journal version may differ in details). The other works were not read in full here; their bibliographic data are checked against Crossref. Horspool names Kruseman Aretz (1988), Barnard and Cordy (1988) and Roberts (1988, 1989) as the sources of recursive ascent; Leermakers, Augusteijn and Kruseman Aretz (1992) give it a functional formulation. Pennello (1986) is another directly executed LR parser.'}
          </p>
        </div>
      </div>
    </div>
  );
};
