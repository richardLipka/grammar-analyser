import React, { useMemo, useState } from 'react';
import { Grammar, formatGrammarForEditor } from '../../core/ast/grammar';
import { ParseOptions, parseGrammar } from '../../core/parser/grammarParser';
import { ComparisonResult, FormProperty, checkForm, compareLanguagesSteps } from '../../core/analyser/equivalence';
import { explainWord } from '../../core/parser/derivationAttempt';
import { JobControl } from '../../core/jobs/job';
import { useSteppedJob } from '../useSteppedJob';
import { JobStatus } from '../components/JobStatus';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { ProductionText } from '../components/Symbols';
import { Language } from '../../i18n/translations';
import { ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const PROPERTIES: { id: FormProperty; cz: string; en: string }[] = [
  { id: 'reduced', cz: 'redukovaná (bez zbytečných symbolů)', en: 'reduced (no useless symbols)' },
  { id: 'epsFree', cz: 'bez ε-pravidel (S → ε jen pro S mimo pravé strany)', en: 'ε-free (S → ε only for S on no right-hand side)' },
  { id: 'noUnit', cz: 'bez jednoduchých pravidel A → B', en: 'no unit rules A → B' },
  { id: 'noLeftRecursion', cz: 'bez levé rekurze', en: 'no left recursion' },
  { id: 'leftFactored', cz: 'levě faktorizovaná (alternativy nezačínají stejným symbolem)', en: 'left-factored (no two alternatives start with the same symbol)' },
  { id: 'll1', cz: 'LL(1)', en: 'LL(1)' },
  { id: 'cnf', cz: 'Chomského normální forma', en: 'Chomsky normal form' },
  { id: 'gnf', cz: 'Greibachové normální forma', en: 'Greibach normal form' }
];

interface EquivalenceViewProps {
  /** The original grammar: the text in the editor now (null while it has errors) */
  grammar: Grammar | null;
  text: string;
  onTextChange: (text: string) => void;
  /** How the editor reads e and words such as bxc; the student's grammar is read the same way */
  parseOptions: ParseOptions;
  lang: Language;
}

/** "Is my grammar the same?": a student's grammar against the original, and the form the transformation promises. */
export const EquivalenceView: React.FC<EquivalenceViewProps> = ({ grammar, text, onTextChange, parseOptions, lang }) => {
  const cz = lang === 'cz';
  const [properties, setProperties] = useState<FormProperty[]>([]);
  const [maxLength, setMaxLength] = useState(12);
  const [result, setResult] = useState<{ value: ComparisonResult; studentKey: string; originalKey: string } | null>(null);
  const runner = useSteppedJob();

  const parsed = useMemo(() => (text.trim() ? parseGrammar(text, parseOptions) : null), [text, parseOptions]);
  const student = parsed && parsed.errors.length === 0 ? parsed.grammar : undefined;
  const checks = useMemo(() => (student ? checkForm(student, properties) : []), [student, properties]);
  const keyOf = (g: Grammar) => `${g.startSymbol}\n${g.productions.map(p => `${p.lhs}\u0000${p.rhs.join('\u0001')}`).join('\n')}`;
  const originalKey = grammar ? keyOf(grammar) : '';
  // The result is shown only while both text fields still hold the grammars that were compared
  const fresh = !!result && !!grammar && !!student && result.studentKey === keyOf(student) && result.originalKey === originalKey;
  const difference = fresh && result!.value.kind === 'different' ? result!.value : null;

  const start = () => {
    if (!student || !grammar) return;
    const control: JobControl = { stop: false };
    const keys = { studentKey: keyOf(student), originalKey };
    setResult(null);
    runner.start(compareLanguagesSteps(grammar, student, control, maxLength), control, value => setResult({ value, ...keys }));
  };

  const toggle = (p: FormProperty) => setProperties(ps => (ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p]));

  return (
    <div>
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={18} color="var(--color-primary)" />
            {cz ? 'Je moje gramatika stejná?' : 'Is my grammar the same?'}
          </span>
        </div>
        <p className="hint-text">
          {cz
            ? 'Napište gramatiku, kterou jste získali úpravou gramatiky z editoru. Kontrola porovná oba jazyky na všech slovech až do zvolené délky (od nejkratších, takže první nalezený rozdíl je nejkratší protipříklad) a ověří tvar, který úprava slibuje. Pro protipříklad se pod každou gramatikou ukáže její odvození, nebo kde se odvození přeruší.'
            : 'Write the grammar you obtained by transforming the grammar in the editor. The check compares both languages on all words up to the chosen length (shortest first, so the first difference found is a shortest counterexample) and verifies the form the transformation promises. For a counterexample, each grammar shows below it its derivation, or where the derivation breaks off.'}
        </p>

        <div className="equiv-controls">
          <label>
            {cz ? 'Nejvýše do délky slova ' : 'Up to the word length '}
            <input type="number" min={0} max={40} value={maxLength} onChange={e => setMaxLength(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} />
          </label>
          <button type="button" className="btn btn-primary" disabled={!student || !grammar || runner.state.running} onClick={start}>
            {cz ? 'Porovnat jazyky' : 'Compare the languages'}
          </button>
          {runner.state.running && !runner.state.paused && (
            <button type="button" className="btn btn-secondary" onClick={runner.stop}>{cz ? 'Zastavit' : 'Stop'}</button>
          )}
        </div>
        <p className="hint-text" style={{ margin: '6px 0' }}>
          {cz
            ? 'Počet slov roste exponenciálně s délkou. Po každých 30 s výpočtu se kontrola zastaví a zeptá, zda pokračovat.'
            : 'The number of words grows exponentially with the length. After every 30 s of computation the check pauses and asks whether to continue.'}
        </p>
        <div className="equiv-job">
          <JobStatus
            state={runner.state}
            title={{ en: 'Comparing the languages', cz: 'Porovnání jazyků' }}
            stopHint={{
              en: 'Stopping keeps the result for the lengths checked completely.',
              cz: 'Zastavení ponechá výsledek pro délky, které byly zkontrolovány celé.'
            }}
            lang={lang}
            onResume={runner.resume}
            onStop={runner.stop}
          />
        </div>
        {result && !fresh && (
          <p className="hint-text">{cz ? 'Výsledek patří k předchozí verzi gramatik; porovnejte znovu.' : 'The result belongs to an earlier version of the grammars; compare again.'}</p>
        )}
        {fresh && <ComparisonReport result={result!.value} lang={lang} />}

        <div className="equiv-grid">
          <div className="equiv-column">
            <div className="equiv-label">{cz ? 'Původní gramatika (z editoru)' : 'Original grammar (from the editor)'}</div>
            {grammar ? (
              <div className="equiv-original">
                {grammar.productions.map(p => (
                  <div key={p.id}><ProductionText production={p} nonTerminals={grammar.nonTerminals} showId /></div>
                ))}
              </div>
            ) : (
              <div className="report-box danger">
                {cz ? 'Gramatika v editoru obsahuje chyby; opravte ji, aby šla porovnat.' : 'The grammar in the editor has errors; correct it to compare.'}
              </div>
            )}
            {difference && grammar && (
              <WordPanel grammar={grammar} word={difference.word} lang={lang} filename="counterexample_original" />
            )}
          </div>
          <div className="equiv-column">
            <div className="equiv-label">
              <label htmlFor="student-grammar">{cz ? 'Vaše gramatika' : 'Your grammar'}</label>
              <button type="button" className="link-button" disabled={!grammar} onClick={() => grammar && onTextChange(formatGrammarForEditor(grammar))}>
                {cz ? 'Začít z původní' : 'Start from the original'}
              </button>
            </div>
            <textarea
              id="student-grammar"
              className="grammar-textarea equiv-student"
              value={text}
              onChange={e => onTextChange(e.target.value)}
              placeholder={cz ? 'S → a S b | ε' : 'S → a S b | ε'}
              spellCheck={false}
            />
            {parsed && parsed.errors.length > 0 && (
              <div className="report-box danger" style={{ marginTop: '6px' }}>
                {parsed.errors.map((e, i) => <div key={i}>{cz ? `Řádek ${e.line}: ${e.messageCz || e.message}` : `Line ${e.line}: ${e.message}`}</div>)}
              </div>
            )}
            {difference && student && (
              <WordPanel grammar={student} word={difference.word} lang={lang} filename="counterexample_yours" />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span>{cz ? 'Slíbený tvar' : 'Promised form'}</span></div>
        <p className="hint-text" style={{ marginBottom: '8px' }}>
          {cz ? 'Zaškrtněte vlastnosti, které má mít výsledek úpravy (např. po odstranění levé rekurze „bez levé rekurze“). Tvar se ověří přesně.' : 'Tick the properties the result of the transformation should have (e.g. "no left recursion" after removing left recursion). The form is checked exactly.'}
        </p>
        <div className="equiv-properties">
          {PROPERTIES.map(p => {
            const check = checks.find(c => c.property === p.id);
            return (
              <label key={p.id} className={`equiv-property ${check ? (check.ok ? 'ok' : 'fail') : ''}`}>
                <input type="checkbox" checked={properties.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{cz ? p.cz : p.en}</span>
                {check && (check.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />)}
                {check && !check.ok && (
                  <span className="equiv-offending">
                    {check.offending.slice(0, 6).join(', ')}{check.offending.length > 6 ? ', …' : ''}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {!student && properties.length > 0 && (
          <p className="hint-text">{cz ? 'Tvar se ověří, jakmile napíšete svou gramatiku.' : 'The form is checked once you write your grammar.'}</p>
        )}
      </div>
    </div>
  );
};

const ComparisonReport: React.FC<{ result: ComparisonResult; lang: Language }> = ({ result, lang }) => {
  const cz = lang === 'cz';
  if (result.kind === 'different') {
    const word = result.word.join(' ') || 'ε';
    return (
      <div className="report-box danger" style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
        <XCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          <strong>{cz ? 'Jazyky se liší. ' : 'The languages differ. '}</strong>
          {cz ? 'Protipříklad: slovo ' : 'Counterexample: the word '}<code className="ambiguity-word">{word}</code>{' '}
          {result.inFirst
            ? (cz ? 'generuje původní gramatika, ale vaše ne (úprava slovo ztratila).' : 'is generated by the original grammar but not by yours (the transformation lost it).')
            : (cz ? 'generuje vaše gramatika, ale původní ne (úprava slovo přidala).' : 'is generated by your grammar but not by the original one (the transformation added it).')}
          {' '}
          {result.checkedLength >= 0
            ? (cz ? `Je to nejkratší rozdíl: všechna slova do délky ${result.checkedLength} se shodují.` : `It is a shortest difference: all words up to length ${result.checkedLength} agree.`)
            : (cz ? 'Je to nejkratší možný rozdíl.' : 'It is the shortest possible difference.')}
          {' '}
          {cz ? 'Pod každou gramatikou je její odvození slova, nebo kde se pokus o něj přeruší.' : 'Below each grammar: its derivation of the word, or where the attempt at one breaks off.'}
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className={`report-box ${result.length >= 0 ? 'success' : 'warning'}`} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
        <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          {result.length >= 0
            ? (cz
              ? `Žádný rozdíl: všechna slova do délky ${result.length} patří buď do obou jazyků, nebo do žádného (zkontrolováno ${result.wordsChecked.toLocaleString('cs-CZ')} slov).`
              : `No difference: every word up to length ${result.length} is in both languages or in neither (${result.wordsChecked.toLocaleString('en-US')} words checked).`)
            : (cz ? 'Kontrola byla zastavena dříve, než prověřila i prázdné slovo.' : 'The check was stopped before it covered even the empty word.')}
          {result.stopped && (cz ? ' Kontrola byla zastavena.' : ' The check was stopped.')}
        </span>
      </div>
      <div className="notice-box warning" style={{ marginTop: '8px' }}>
        <div className="notice-title">
          <AlertTriangle size={15} />
          <span>{cz ? 'Jen náznak, ne důkaz' : 'Only a hint, not a proof'}</span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
          {cz
            ? 'Ekvivalence bezkontextových gramatik je algoritmicky nerozhodnutelná: shoda na krátkých slovech nevylučuje rozdíl na delším slově. Správnost úpravy dokazuje až zdůvodnění, že každá použitá transformace zachovává jazyk.'
            : 'Equivalence of context-free grammars is undecidable: agreement on short words does not exclude a difference on a longer word. Only an argument that every transformation used preserves the language proves the result correct.'}
        </p>
      </div>
      <p className="hint-text" style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
        <Info size={14} style={{ flexShrink: 0 }} />
        {cz
          ? 'Tip: rozdíl se často ukáže na slovech s více opakováními (a a b b b …); zkuste větší délku.'
          : 'Tip: a difference often shows on words with more repetitions (a a b b b …); try a greater length.'}
      </p>
    </div>
  );
};

/** How one grammar derives the counterexample, or the attempt of the general analyser and where it breaks off. */
const WordPanel: React.FC<{ grammar: Grammar; word: string[]; lang: Language; filename: string }> = ({ grammar, word, lang, filename }) => {
  const cz = lang === 'cz';
  const e = useMemo(() => explainWord(grammar, word), [grammar, word]);
  const code = (x: string) => <code className="ambiguity-word">{x}</code>;
  const w = word.join(' ') || 'ε';
  const or = (items: React.ReactNode[]) => items.map((x, i) => (
    <React.Fragment key={i}>{i === 0 ? '' : i === items.length - 1 ? (cz ? ' nebo ' : ' or ') : ', '}{x}</React.Fragment>
  ));

  if (e.generated) {
    const count = e.treeCount === Infinity ? (cz ? 'nekonečně mnoho' : 'infinitely many') : String(e.treeCount);
    return (
      <div className="equiv-word">
        <div className="report-box success equiv-word-verdict">
          <CheckCircle2 size={15} />
          <span>
            {cz ? <>Tato gramatika slovo {code(w)} generuje.</> : <>This grammar generates {code(w)}.</>}
            {e.treeCount !== 1 && (cz ? ` Derivačních stromů: ${count}, zobrazen první.` : ` Derivation trees: ${count}, the first one shown.`)}
          </span>
        </div>
        <div className="equiv-word-caption">{cz ? 'Derivační strom' : 'Derivation tree'}</div>
        <DerivationTreeVisualizer rootNode={e.tree} height="300px" filename={filename} lang={lang} />
        <Derivation forms={e.forms} lang={lang} />
      </div>
    );
  }

  const prefix = word.slice(0, e.matched).join(' ');
  const options = [...e.expected.map(t => code(t)), ...(e.canEnd ? [cz ? 'konec slova' : 'the end of the word'] : [])];
  const unknown = e.unknownSymbol && e.found !== undefined
    ? (cz ? <> ({code(e.found)} vůbec není terminálem této gramatiky.)</> : <> ({code(e.found)} is not a terminal of this grammar at all.)</>)
    : null;
  let explanation: React.ReactNode;
  switch (e.reason) {
    case 'empty-language':
      explanation = cz
        ? 'Tato gramatika negeneruje žádné slovo: z jejího počátečního symbolu nelze odvodit slovo z terminálů.'
        : 'This grammar generates no word at all: its start symbol derives no word of terminals.';
      break;
    case 'mismatch':
      explanation = e.matched > 0
        ? (cz
          ? <>Odvodí začátek {code(prefix)}, potom ale potřebuje {or(options)}, kdežto slovo pokračuje symbolem {code(e.found!)}.{unknown}</>
          : <>It derives the beginning {code(prefix)}, but then it needs {or(options)}, while the word continues with {code(e.found!)}.{unknown}</>)
        : (cz
          ? <>Slova této gramatiky začínají symbolem {or(e.expected.map(t => code(t)))}{e.canEnd ? ' (nebo je slovo prázdné)' : ''}, toto slovo však začíná symbolem {code(e.found!)}.{unknown}</>
          : <>The words of this grammar start with {or(e.expected.map(t => code(t)))}{e.canEnd ? ' (or are empty)' : ''}, but this word starts with {code(e.found!)}.{unknown}</>);
      break;
    case 'ends-early':
      explanation = e.matched > 0
        ? (cz
          ? <>Celé slovo je jen začátkem slov této gramatiky: za ním odvození potřebuje ještě {or(e.expected.map(t => code(t)))}.</>
          : <>The whole word is only the beginning of words of this grammar: after it the derivation needs {or(e.expected.map(t => code(t)))}.</>)
        : (cz
          ? <>Gramatika negeneruje prázdné slovo: každé její slovo začíná symbolem {or(e.expected.map(t => code(t)))}.</>
          : <>The grammar does not generate the empty word: each of its words starts with {or(e.expected.map(t => code(t)))}.</>);
      break;
    case 'goes-on':
      explanation = e.matched > 0
        ? (cz
          ? <>{code(prefix)} je celé slovo této gramatiky a nic za ním následovat nemůže, slovo však pokračuje symbolem {code(e.found!)}.{unknown}</>
          : <>{code(prefix)} is a whole word of this grammar and nothing can follow it, but the word continues with {code(e.found!)}.{unknown}</>)
        : (cz ? 'Tato gramatika generuje jen prázdné slovo ε.' : 'This grammar generates only the empty word ε.');
      break;
  }

  return (
    <div className="equiv-word">
      <div className="report-box danger equiv-word-verdict">
        <XCircle size={15} />
        <span>
          <strong>{cz ? <>Tato gramatika slovo {code(w)} negeneruje. </> : <>This grammar does not generate {code(w)}. </>}</strong>
          {explanation}
        </span>
      </div>
      {e.tree && (
        <>
          <div className="equiv-word-caption">
            {e.reason === 'goes-on'
              ? (cz ? 'Derivační strom začátku slova, za kterým odvození končí' : 'Derivation tree of the beginning of the word, where the derivation ends')
              : (cz
                ? 'Pokus o odvození (obecný analyzátor): odvozený začátek slova, potřebný symbol (červeně) a co zbývá odvodit (čárkovaně)'
                : 'Attempt at a derivation (general analyser): the beginning of the word it derives, the symbol it needs (red) and what remains to derive (dashed)')}
          </div>
          <DerivationTreeVisualizer rootNode={e.tree} height="300px" filename={filename} lang={lang} />
          <Derivation
            forms={e.forms}
            lang={lang}
            breakAt={e.reason === 'goes-on' ? undefined : e.matched}
            breakNote={e.reason === 'goes-on'
              ? (cz ? <>slovo však pokračuje: {code(word.slice(e.matched).join(' '))}</> : <>but the word goes on: {code(word.slice(e.matched).join(' '))}</>)
              : e.found === undefined
                ? (cz ? 'slovo zde končí' : 'the word ends here')
                : (cz ? <>slovo zde má {code(e.found)}</> : <>the word has {code(e.found)} here</>)}
          />
        </>
      )}
    </div>
  );
};

/** The leftmost derivation; for an attempt the last form is marked where it no longer matches the word. */
const Derivation: React.FC<{ forms: string[][]; lang: Language; breakAt?: number; breakNote?: React.ReactNode }> = ({ forms, lang, breakAt, breakNote }) => {
  const cz = lang === 'cz';
  const broken = breakNote !== undefined;
  return (
    <div className="equiv-derivation">
      <div className="equiv-word-caption">
        {broken ? (cz ? 'Levá derivace až do místa, kde se přeruší' : 'Leftmost derivation up to where it breaks off') : (cz ? 'Levá derivace' : 'Leftmost derivation')}
      </div>
      <div className="equiv-derivation-forms">
        {forms.map((form, i) => {
          const last = i === forms.length - 1;
          return (
            <span key={i} className="equiv-form">
              {i > 0 && <span className="equiv-arrow"> ⇒ </span>}
              {form.length === 0 ? 'ε' : form.map((sym, j) => (
                <span
                  key={j}
                  className={last && breakAt !== undefined ? (j === breakAt ? 'equiv-sym-mismatch' : j > breakAt ? 'equiv-sym-pending' : '') : ''}
                >
                  {j > 0 ? ' ' : ''}{sym}
                </span>
              ))}
            </span>
          );
        })}
        {broken && <span className="equiv-break"> ✗ {breakNote}</span>}
      </div>
    </div>
  );
};
