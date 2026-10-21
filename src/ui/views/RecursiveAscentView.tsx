import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { LRTable } from '../../core/lr/lrTable';
import { AscentLang, GeneratedAscent, canGenerateAscent, generateRecursiveAscent, lineKey } from '../../core/codegen/recursiveAscent';
import { simulateRecursiveAscent, AscentSimulation, AscentStep } from '../../core/codegen/recursiveAscentSimulator';
import { ascentEvents, placeEvents, placementText, describeEvent, EventPlacement } from '../../core/codegen/recursiveAscentActions';
import { DeclarationKeywordConfig, RuleActionDefinition, Scope } from '../../core/codegen/symbolTable';
import { compilePl0 } from '../../core/codegen/pl0Compiler';
import { runPcode } from '../../core/codegen/pcodeVm';
import { ScannedInput } from '../../core/parser/inputTokenizer';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { AutomatonGraphVisualizer } from '../visualizer/AutomatonGraphVisualizer';
import { ReferenceBar } from '../components/ReferenceBar';
import { Language } from '../../i18n/translations';
import { AlertTriangle, CheckCircle2, Copy, Check, Download, ExternalLink, Play, XCircle, BookOpen, Layers, Database, Settings2 } from 'lucide-react';

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

const FILE_NAMES: Record<AscentLang, string> = { js: 'parser.js', python: 'parser.py', c: 'parser.c', oberon: 'Parser.Mod', pl0: 'parser.pl0', pcode: 'parser.pcode.txt' };
const LANG_LABELS: Record<AscentLang, [string, string]> = { js: ['JavaScript', 'JavaScript'], python: ['Python', 'Python'], c: ['C', 'C'], oberon: ['Oberon', 'Oberon'], pl0: ['PL/0', 'PL/0'], pcode: ['P-kód', 'P-code'] };
const LANGS: AscentLang[] = ['js', 'python', 'c', 'oberon', 'pl0', 'pcode'];

interface RecursiveAscentViewProps {
  grammar: Grammar;
  tables: Record<LRVariantName, LRTable | undefined>;
  selectedVariant: LRVariantName;
  onSelectVariant: (v: LRVariantName) => void;
  lang: Language;
  /** A link that opens a P-code program with its input in the PL/0 interpreter */
  interpreterLink: (pcode: string, input: string) => string;
  /** The input field of recursive descent (the same word on both sub-tabs) */
  inputField: React.ReactNode;
  /** The input read as in recursive descent: names and numbers as the identifier and number terminals, with their texts */
  tokenized: ScannedInput;
  /** The symbol-table actions of recursive descent and their keywords */
  keywords: DeclarationKeywordConfig;
  ruleActions: RuleActionDefinition[];
  stopOnSemanticErrors: boolean;
  onStopOnSemanticErrorsChange: (v: boolean) => void;
  /** Opens the editor of the actions */
  onEditActions?: () => void;
}

export const RecursiveAscentView: React.FC<RecursiveAscentViewProps> = ({
  grammar,
  tables,
  selectedVariant,
  onSelectVariant,
  lang,
  interpreterLink,
  inputField,
  tokenized,
  keywords,
  ruleActions,
  stopOnSemanticErrors,
  onStopOnSemanticErrorsChange,
  onEditActions
}) => {
  const cz = lang === 'cz';
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

  // Where the actions of recursive descent can run in this automaton
  const placements: EventPlacement[] = useMemo(
    () => (ok ? placeEvents(grammar, table!, ascentEvents(grammar, ruleActions)) : []),
    [grammar, table, ok, ruleActions]
  );
  const generated = useMemo((): { gen: GeneratedAscent; pcode: ReturnType<typeof compilePl0>; pcodeText: string } | { error: string } | null => {
    if (!ok) return null;
    try {
      const gen = generateRecursiveAscent(grammar, table!, { placements });
      return { gen, pcode: compilePl0(gen.code.pl0), pcodeText: gen.code.pcode };
    } catch (err) {
      return { error: String(err) };
    }
  }, [grammar, table, ok, placements]);
  const gen = generated && 'gen' in generated ? generated.gen : null;

  const simulation: AscentSimulation | null = useMemo(
    () => (gen && tokenized.unknown.length === 0
      ? simulateRecursiveAscent(tokenized.tokens, gen, table!, { lexemes: tokenized.lexemes, placements, keywords, stopOnSemanticErrors })
      : null),
    [gen, tokenized, table, placements, keywords, stopOnSemanticErrors]
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

  const comparison: [string, string, string][] = cz
    ? [
      ['Gramatiky', 'LL(1): tabulka LL(1) bez kolizí, bez levé rekurze', 'tabulka LR bez kolizí (LR(0), SLR(1), LALR(1), IELR(1), LR(1)); levá rekurze nevadí, LR(1) zahrnuje LL(1)'],
      ['Procedura', 'pro každý neterminál', 'pro každý stav LR automatu'],
      ['Rozhodnutí', 'na začátku pravidla podle aktuálního symbolu (množiny řídicích symbolů)', 'po přečtení části pravé strany podle stavu a aktuálního symbolu (tabulka f)'],
      ['Zásobník volání', 'neterminály od kořene k aktuálnímu uzlu, každý s pozicí v pravidle', 'zásobník stavů LR: každá aktivace je jeden stav'],
      ['Návrat', 'po zpracování pravé strany o jednu úroveň', 'po redukci o |α| úrovní (počet ve výsledku)'],
      ['Výstup', 'levý rozklad (pravidla při expanzi)', 'pravý rozklad (pravidla při redukci)'],
      ['Derivační strom', 'shora dolů: kořen první, větve se doplňují', 'zdola nahoru: les na zásobníku, redukce spojují stromy, kořen poslední'],
      ['Sémantické akce', 'kdekoli v pravidle – pravidlo je známo od začátku', 'jen kde jádro stavu určuje pravidlo, jinak až při redukci (Yacc: značky M → ε na volných místech)'],
      ['Velikost programu', 'úměrná gramatice', 'úměrná počtu stavů (obvykle mnohem víc)'],
      ['Psaní ručně', 'běžné', 'prakticky nemožné – stavy se počítají z automatu']
    ]
    : [
      ['Grammars', 'LL(1): a conflict-free LL(1) table, no left recursion', 'a conflict-free LR table (LR(0), SLR(1), LALR(1), IELR(1), LR(1)); left recursion is fine, LR(1) contains LL(1)'],
      ['Procedure', 'one per non-terminal', 'one per state of the LR automaton'],
      ['Decision', 'at the start of the rule, by the current symbol (the director sets)', 'after reading part of the right-hand side, by the state and the current symbol (the table f)'],
      ['Call stack', 'the non-terminals from the root to the current node, each with its position in the rule', 'the LR state stack: every activation is one state'],
      ['Return', 'one level, after the right-hand side', '|α| levels after a reduction (the count in the result)'],
      ['Output', 'the left parse (rules at expansion)', 'the right parse (rules at reduction)'],
      ['Derivation tree', 'top down: the root first, branches filled in', 'bottom up: a forest on the stack, reductions join trees, the root last'],
      ['Semantic actions', 'anywhere in the rule – the rule is known from the start', 'only where the kernel of a state fixes the rule, otherwise at the reduction (Yacc: markers M → ε at free positions)'],
      ['Size of the program', 'proportional to the grammar', 'proportional to the number of states (usually much more)'],
      ['Written by hand', 'common', 'practically impossible – the states come from the automaton']
    ];

  const helpCan = cz
    ? [
      'Pro každou tabulku LR bez kolizí (i s konflikty vyřešenými prioritami) vygeneruje analyzátor rekurzivním vzestupem v JavaScriptu, Pythonu, C, Oberonu a PL/0 a ukáže P-kód; JavaScript a P-kód spustí zde, P-kód otevře v interpretu PL/0.',
      'Krokuje volání a návraty procedur: zásobník volání vedle zásobníku stavů, návrat (A, |α|) a snižování počtu, přechod g, provedený řádek kódu, stav v automatu a les derivačních stromů, který redukce spojují.',
      'Vstup čte stejně jako rekurzivní sestup (jména a čísla jako terminály identifikátoru a čísla) a nabízí stejné ukázkové gramatiky a programy.',
      'Akce tabulky symbolů rekurzivního sestupu provede tam, kde analyzátor LR zná pravidlo: při vstupu do stavu, jehož jádro tvoří jen položka akce, jinak při redukci. U každé akce řekne, kde a proč proběhla, označí akce, které proběhnou později než v sestupu, a ověří, zda by šly posunout značkou M → ε (volné místo).',
      'Identifikátor je deklarace, nebo použití podle pravidla; nerozhodne-li to stav, rozhodne až redukce. Nedeklarované a dvakrát deklarované jméno je sémantická chyba (stejný přepínač jako v sestupu).'
    ]
    : [
      'For every conflict-free LR table (also with conflicts resolved by precedence) it generates a recursive-ascent parser in JavaScript, Python, C, Oberon and PL/0 and shows the P-code; it runs the JavaScript and the P-code here and opens the P-code in the PL/0 interpreter.',
      'It steps through the calls and returns of the procedures: the call stack beside the state stack, the return (A, |α|) and the decrements, the goto g, the line of code executed, the state in the automaton, and the forest of derivation trees that the reductions join.',
      'It reads the input as recursive descent does (names and numbers as the identifier and number terminals) and offers the same sample grammars and programs.',
      'It runs the symbol-table actions of recursive descent where the LR parser knows the rule: on entering a state whose kernel is just the item of the action, otherwise at the reduction. For every action it says where and why it ran, marks the actions that run later than in descent, and checks whether a marker M → ε could move them (a free position).',
      'An identifier is a declaration or a use according to its rule; where the state does not decide it, the reduction does. An undeclared name and a name declared twice are semantic errors (the same switch as in descent).'
    ];
  const helpCannot = cz
    ? [
      'Značkové neterminály (akce Yaccu uprostřed pravidla) nevkládá: akci, kterou stav neurčí, provede až při redukci a jen ohlásí, že je pozdě. Rozsah otevřený až při redukci tak neobsahuje jména deklarovaná uvnitř pravidla a jejich použití mohou skončit chybou.',
      'Akce na začátku pravidla (pozice 1 u rozsahu, vlastní kód při výběru pravidla) proběhnou vždy až při redukci: analyzátor LR pravidlo předem nezná.',
      'Generované programy kontrolují jen syntaxi, tabulku symbolů nemají (akce jsou v nich jen v komentářích); JavaScript má háčky onEnter, onMatch, onRule. Oberon zde nelze přeložit ani spustit.',
      'Tabulka symbolů je stejná demonstrace jako v rekurzivním sestupu: žádné typy, druhy jmen, adresy ani kód; žádné zotavení z chyb.',
      'Jen deterministické tabulky (bez kolizí); krokování nejvýše 2 000 + 100 kroků na symbol vstupu.'
    ]
    : [
      'It does not insert marker non-terminals (Yacc\'s mid-rule actions): an action that no state determines runs at the reduction, and the step only says that it is late. A scope opened at the reduction does not hold the names declared inside the rule, and their uses may end in an error.',
      'Actions at the start of a rule (a scope from position 1, own code when the rule is chosen) always run at the reduction: the LR parser does not know the rule in advance.',
      'The generated programs check the syntax only and have no symbol table (the actions are only in comments); the JavaScript has the hooks onEnter, onMatch, onRule. Oberon cannot be compiled or run here.',
      'The symbol table is the same demonstration as in recursive descent: no types, kinds of names, addresses or code; no error recovery.',
      'Deterministic (conflict-free) tables only; the step simulator stops after 2,000 + 100 steps per input symbol.'
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
          {inputField}
          <div className="ra-options">
            <span className="hint-text">
              <Database size={12} />{' '}
              {placements.length === 0
                ? (cz ? 'Bez akcí tabulky symbolů: jen syntaktická analýza.' : 'No symbol-table actions: parsing only.')
                : (cz
                  ? `Akce tabulky symbolů z rekurzivního sestupu: ${placements.filter(p => p.where === 'transition').length} při vstupu do stavu, ${placements.filter(p => p.where !== 'transition').length} až při redukci (${placements.filter(p => p.late).length} později než v sestupu).`
                  : `Symbol-table actions of recursive descent: ${placements.filter(p => p.where === 'transition').length} on entering a state, ${placements.filter(p => p.where !== 'transition').length} at the reduction (${placements.filter(p => p.late).length} later than in descent).`)}
            </span>
            {onEditActions && (
              <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={onEditActions}>
                <Settings2 size={12} /> <span>{cz ? 'Upravit akce' : 'Edit the actions'}</span>
              </button>
            )}
            {placements.length > 0 && (
              <label className="rd-check">
                <input type="checkbox" checked={stopOnSemanticErrors} onChange={e => onStopOnSemanticErrorsChange(e.target.checked)} />
                <span>{cz ? 'Nedeklarované a dvakrát deklarované jméno zastaví analýzu' : 'An undeclared name or a name declared twice stops the parse'}</span>
              </label>
            )}
          </div>

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
                      {LANGS.map(l => (
                        <button key={l} type="button" className={`btn ${codeLang === l ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '3px 8px', fontSize: '11px' }} aria-pressed={codeLang === l} onClick={() => setCodeLang(l)}>
                          {LANG_LABELS[l][cz ? 0 : 1]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {codeLang === 'pcode' && (
                    <p className="hint-text" style={{ margin: 0 }}>
                      {cz ? 'P-kód programu v PL/0; řádky kroku se zvýrazňují jen ve zdrojových jazycích.' : 'The P-code of the PL/0 program; the lines of a step are highlighted in the source languages only.'}
                    </p>
                  )}
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

                <div className="ra-col ra-col-middle">
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
                      height="330px"
                      followZoom={0.8}
                    />
                  )}
                  <div className="ra-tree" data-testid="ra-tree">
                    {step.tree ? (
                      <DerivationTreeVisualizer rootNode={step.tree} height="300px" lang={lang} highlightNodeIds={step.activeNodeIds} filename="recursive_ascent_tree" />
                    ) : (
                      <p className="hint-text" style={{ padding: '10px' }}>
                        {cz ? 'Zásobník je zatím prázdný: strom začne prvním přesunem.' : 'The stack is empty so far: the tree starts with the first shift.'}
                      </p>
                    )}
                    <p className="hint-text" style={{ margin: '2px 0 0' }}>
                      {cz
                        ? 'Strom roste zdola: každý rámec drží strom svého symbolu, redukce spojí stromy rukojeti pod A (⋯ = několik stromů na zásobníku).'
                        : 'The tree grows bottom up: every frame holds the tree of its symbol, a reduction joins the trees of the handle under A (⋯ = several trees on the stack).'}
                    </p>
                  </div>
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
                    {step.actions.length > 0 && (
                      <div className="ra-action-notes">
                        <div className="ra-mini-title">{cz ? 'Akce v tomto kroku' : 'Actions in this step'}</div>
                        <ul>
                          {step.actions.map((a, i) => (
                            <li key={i} className={a.late ? 'late' : ''}>{cz ? a.text.cz : a.text.en}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {step.symbolTable && (
                      <div className="ra-symtab" data-testid="ra-symtab">
                        <div className="ra-mini-title">{cz ? 'Tabulka symbolů (otevřené rozsahy)' : 'Symbol table (open scopes)'}</div>
                        {[...step.symbolTable.scopeStack].reverse().map((sc: Scope) => (
                          <div key={sc.id} className="ra-scope">
                            <div className="ra-scope-head">{sc.name} <span className="hint-text">({cz ? 'úroveň' : 'level'} {sc.level})</span></div>
                            {sc.symbols.length === 0 ? <div className="hint-text">–</div> : sc.symbols.map((sy, i) => (
                              <div
                                key={i}
                                className={`ra-symbol ${step.declared && step.declared.scopeId === sc.id && step.declared.name === sy.name && i === sc.symbols.length - 1 ? 'new' : ''} ${step.lookup?.scopeId === sc.id && step.lookup.name === sy.name ? 'found' : ''}`}
                              >
                                <code>{sy.name}</code> <span className="hint-text">{sy.kind}{sy.type ? ` : ${sy.type}` : ''}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
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
                      : simulation.semanticError
                        ? (cz ? 'Slovo odmítnuto pro sémantickou chybu (tabulka symbolů), ne pro syntaxi.' : 'Word rejected for a semantic error (the symbol table), not for its syntax.')
                        : (cz ? 'Slovo odmítnuto.' : 'Word rejected.')}
                  {simulation.undeclared.length > 0 && !stopOnSemanticErrors && (cz ? ` Nedeklarováno: ${[...new Set(simulation.undeclared.map(u => u.name))].join(', ')}.` : ` Not declared: ${[...new Set(simulation.undeclared.map(u => u.name))].join(', ')}.`)}
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
                  : codeLang === 'oberon'
                    ? (cz ? 'Oberon-07 (moduly In a Out) nemá dopředné deklarace a funkční procedura smí mít jen jeden RETURN na konci. Proto je jediná funkce State(q): stavy jsou větve příkazu CASE, větev nastaví count (|α| po redukci, výsledek volání minus jedna po přesunu nebo přechodu) a přechodová smyčka WHILE běží, dokud je count nula. Překladačem Oberonu zde ověřen není.' : 'Oberon-07 (modules In and Out) has no forward declarations, and a function procedure may have only one RETURN, at its end. So there is one function State(q): the states are the branches of a CASE, a branch sets count (|α| after a reduction, the result of the call minus one after a shift or a goto) and the goto loop WHILE runs while count is zero. It is not checked by an Oberon compiler here.')
                    : codeLang === 'pcode'
                      ? (cz ? 'P-kód programu v PL/0 přeložený jako ve Wirthově překladači, ve tvaru pro interpret PL/0 z předmětu KIV/FJP (tlačítko níže jej otevře se vstupem).' : 'The P-code of the PL/0 program, compiled as by Wirth\'s compiler, in the form read by the PL/0 interpreter of the KIV/FJP course (the button below opens it with the input).')
                  : (cz ? 'PL/0 nemá návratové hodnoty ani dopředné deklarace (přechody automatu tvoří cykly, nestačilo by ani vnoření procedur). Proto je jediná procedura state: číslo stavu dostane v proměnné which a uchová si je v lokální proměnné mine – její aktivační záznamy na zásobníku P-stroje jsou doslova zásobník stavů. Výsledek redukce je v globálních proměnných lhs a cnt. PL/0 nemá else: procedura nejdřív do act určí akci, pak ji provede.' : 'PL/0 has neither function results nor forward declarations (the transitions of the automaton form cycles, so not even nested procedures would do). There is one procedure state: it gets the state number in the variable which and keeps it in its local variable mine – its activation records on the stack of the P-machine are literally the state stack. The result of a reduction is in the global variables lhs and cnt. PL/0 has no else: the procedure first determines the action in act, then performs it.')}
            {' '}
            {cz ? 'Programy kontrolují jen syntaxi; akce tabulky symbolů provádí krokování, v kódu jsou u stavů a redukcí v komentářích (kde by proběhly).' : 'The programs check the syntax only; the symbol-table actions are run by the step simulator, and the code says in comments at the states and reductions where they would run.'}
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

      {gen && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--color-primary)" />
              {cz ? 'Kde mohou proběhnout akce tabulky symbolů' : 'Where the symbol-table actions can run'}
            </span>
            {onEditActions && (
              <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={onEditActions}>
                <Settings2 size={12} /> <span>{cz ? 'Upravit akce' : 'Edit the actions'}</span>
              </button>
            )}
          </div>
          <p className="hint-text">
            {cz
              ? 'Rekurzivní sestup zná pravidlo od chvíle, kdy je vybere, akci tedy provede na kterékoli pozici pravé strany. Analyzátor LR pravidlo zná, až když jádro stavu tvoří jediná položka: akce na pozici d pravidla p proběhne při vstupu do stavu s jádrem {p, tečka na pozici d}; v ostatních stavech (a vždy na začátku pravidla) počká na redukci podle p. Taková akce proběhne později – po zbytku pravé strany. Yacc ji umisťuje značkovým neterminálem M → ε, ale jen na volném místě, kde značka nezpůsobí kolizi (Horspool 1991, §4.1; Purdom a Brown 1980); sloupec Volné místo to ověřuje sestrojením tabulky se značkou.'
              : 'Recursive descent knows the rule from the moment it chooses it, so it can do an action at any position of the right-hand side. An LR parser knows the rule only where a single item makes up the kernel of a state: an action at position d of rule p runs on entering a state whose kernel is {p with the dot at d}; in other states (and always at the start of a rule) it waits for the reduction by p. Such an action runs later – after the rest of the right-hand side. Yacc places it by a marker non-terminal M → ε, but only at a free position, where the marker causes no conflict (Horspool 1991, §4.1; Purdom and Brown 1980); the column Free position checks this by building the table with the marker.'}
          </p>
          {placements.length === 0 ? (
            <p className="hint-text" style={{ fontWeight: 600 }}>
              {cz ? 'Gramatika nemá žádné akce (rozpoznané ani ručně zadané); analýza je jen syntaktická.' : 'The grammar has no actions (detected or entered by hand); the parse is syntactic only.'}
            </p>
          ) : (
            <div className="data-table-container">
              <table className="data-table ra-placements" data-testid="ra-placements">
                <thead>
                  <tr>
                    <th>{cz ? 'Pravidlo' : 'Rule'}</th>
                    <th>{cz ? 'Akce' : 'Action'}</th>
                    <th>{cz ? 'Kdy proběhne' : 'When it runs'}</th>
                    <th>{cz ? 'Proč' : 'Why'}</th>
                    <th>{cz ? 'Volné místo' : 'Free position'}</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map(pl => (
                    <tr key={pl.index} className={pl.late ? 'ra-late' : ''}>
                      <td style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {pl.rule.id}: {pl.rule.lhs} → {pl.rule.rhs.map((x, i) => (i === pl.dot ? `• ${x}` : x)).join(' ')}{pl.dot === pl.rule.rhs.length ? ' •' : ''}{pl.rule.rhs.length === 0 ? 'ε' : ''}
                      </td>
                      <td>{cz ? describeEvent(pl).cz : describeEvent(pl).en}</td>
                      <td>
                        <span className={`badge ${pl.where === 'transition' ? 'badge-success' : pl.late ? 'badge-warning' : 'badge-secondary'}`}>
                          {pl.where === 'transition'
                            ? (cz ? `při vstupu do ${pl.knownStates.map(name).join(', ')}` : `on entering ${pl.knownStates.map(name).join(', ')}`)
                            : pl.where === 'mixed'
                              ? (cz ? 'při vstupu, jinde až při redukci' : 'on entering, elsewhere at the reduction')
                              : (cz ? 'při redukci' : 'at the reduction')}
                        </span>
                        {pl.late && <div className="hint-text">{cz ? 'později než v sestupu' : 'later than in descent'}</div>}
                      </td>
                      <td style={{ fontSize: '11.5px' }}>{cz ? placementText(pl, name).cz : placementText(pl, name).en}</td>
                      <td>{pl.late ? (pl.freePosition === true ? (cz ? 'ano – značka by šla' : 'yes – a marker would do') : pl.freePosition === false ? (cz ? 'ne – značka by způsobila kolizi' : 'no – a marker causes a conflict') : (cz ? 'neověřeno' : 'not tested')) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--color-primary)" />
            {cz ? 'Rekurzivní sestup a rekurzivní vzestup' : 'Recursive descent and recursive ascent'}
          </span>
        </div>
        <div className="data-table-container">
          <table className="data-table ra-correspondence" data-testid="ra-comparison">
            <thead>
              <tr>
                <th></th>
                <th>{cz ? 'Rekurzivní sestup' : 'Recursive descent'}</th>
                <th>{cz ? 'Rekurzivní vzestup' : 'Recursive ascent'}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(([a, b, c], i) => (
                <tr key={i}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="rd-help" open>
          <summary>{cz ? 'Rekurzivní vzestup: co ukázka umí a co ne' : 'Recursive ascent: what this demonstration can and cannot do'}</summary>
          <p className="rd-help-lead">
            {cz
              ? 'Jde o demonstrační nástroj: ukazuje, jak analyzátor LR vypadá jako program z procedur a jak se v něm projeví známé pravidlo – ne o generátor analyzátorů pro praxi.'
              : 'This is a demonstration tool: it shows what an LR parser looks like as a program of procedures and what knowing the rule means in it – not a parser generator for practice.'}
          </p>
          <div className="rd-help-columns">
            <div>
              <h4>{cz ? 'Umí' : 'Can'}</h4>
              <ul>{helpCan.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
            <div>
              <h4>{cz ? 'Neumí' : 'Cannot'}</h4>
              <ul>{helpCannot.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          </div>
        </details>
      </div>

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
