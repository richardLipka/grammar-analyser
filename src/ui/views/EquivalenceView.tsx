import React, { useMemo, useState } from 'react';
import { Grammar, formatGrammarForEditor } from '../../core/ast/grammar';
import { parseGrammar } from '../../core/parser/grammarParser';
import { ComparisonResult, FormProperty, checkForm, compareLanguagesSteps } from '../../core/analyser/equivalence';
import { testMembership } from '../../core/parser/membership';
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
  /** The original grammar (from the editor) */
  grammar: Grammar;
  text: string;
  onTextChange: (text: string) => void;
  eIsEpsilon: boolean;
  lang: Language;
}

/** "Is my grammar the same?": a student's grammar against the original, and the form the transformation promises. */
export const EquivalenceView: React.FC<EquivalenceViewProps> = ({ grammar, text, onTextChange, eIsEpsilon, lang }) => {
  const cz = lang === 'cz';
  const [properties, setProperties] = useState<FormProperty[]>([]);
  const [maxLength, setMaxLength] = useState(12);
  const [result, setResult] = useState<{ value: ComparisonResult; studentKey: string; originalKey: string } | null>(null);
  const runner = useSteppedJob();

  const parsed = useMemo(() => (text.trim() ? parseGrammar(text, { eIsEpsilon }) : null), [text, eIsEpsilon]);
  const student = parsed && parsed.errors.length === 0 ? parsed.grammar : undefined;
  const checks = useMemo(() => (student ? checkForm(student, properties) : []), [student, properties]);
  const keyOf = (g: Grammar) => g.productions.map(p => `${p.lhs}\u0000${p.rhs.join('\u0001')}`).join('\n');
  const originalKey = keyOf(grammar);
  const fresh = result && student && result.studentKey === keyOf(student) && result.originalKey === originalKey;

  const start = () => {
    if (!student) return;
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
            ? 'Napište gramatiku, kterou jste získali úpravou gramatiky z editoru. Kontrola porovná oba jazyky na všech slovech až do zvolené délky (od nejkratších, takže první nalezený rozdíl je nejkratší protipříklad) a ověří tvar, který úprava slibuje.'
            : 'Write the grammar you obtained by transforming the grammar in the editor. The check compares both languages on all words up to the chosen length (shortest first, so the first difference found is a shortest counterexample) and verifies the form the transformation promises.'}
        </p>

        <div className="equiv-grid">
          <div>
            <div className="equiv-label">{cz ? 'Původní gramatika (z editoru)' : 'Original grammar (from the editor)'}</div>
            <div className="equiv-original">
              {grammar.productions.map(p => (
                <div key={p.id}><ProductionText production={p} nonTerminals={grammar.nonTerminals} showId /></div>
              ))}
            </div>
          </div>
          <div>
            <div className="equiv-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="student-grammar">{cz ? 'Vaše gramatika' : 'Your grammar'}</label>
              <button type="button" className="link-button" onClick={() => onTextChange(formatGrammarForEditor(grammar))}>
                {cz ? 'Začít z původní' : 'Start from the original'}
              </button>
            </div>
            <textarea
              id="student-grammar"
              className="grammar-textarea"
              style={{ minHeight: '160px', width: '100%' }}
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

      <div className="card">
        <div className="card-title"><span>{cz ? 'Stejný jazyk?' : 'The same language?'}</span></div>
        <div className="equiv-controls">
          <label>
            {cz ? 'Nejvýše do délky slova ' : 'Up to the word length '}
            <input type="number" min={0} max={40} value={maxLength} onChange={e => setMaxLength(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} />
          </label>
          <button type="button" className="btn btn-primary" disabled={!student || runner.state.running} onClick={start}>
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
        {result && fresh && student && <ComparisonReport result={result.value} original={grammar} student={student} lang={lang} />}
      </div>
    </div>
  );
};

const ComparisonReport: React.FC<{ result: ComparisonResult; original: Grammar; student: Grammar; lang: Language }> = ({ result, original, student, lang }) => {
  const cz = lang === 'cz';
  if (result.kind === 'different') {
    const word = result.word.join(' ') || 'ε';
    const generator = result.inFirst ? original : student;
    const tree = testMembership(generator, result.word, 1).trees[0]?.tree;
    return (
      <div>
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
          </span>
        </div>
        {tree && (
          <div style={{ marginTop: '10px' }}>
            <div className="hint-text" style={{ marginBottom: '4px' }}>
              {result.inFirst ? (cz ? 'Derivační strom v původní gramatice:' : 'Derivation tree in the original grammar:') : (cz ? 'Derivační strom ve vaší gramatice:' : 'Derivation tree in your grammar:')}
            </div>
            <DerivationTreeVisualizer rootNode={tree} height="260px" filename="counterexample_tree" lang={lang} />
          </div>
        )}
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
