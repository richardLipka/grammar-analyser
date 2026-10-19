import React, { useEffect, useMemo, useState } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { testMembership } from '../../core/parser/membership';
import {
  cnfViolations, cykTable, cykCellAtStep, countCYKTrees, extractCYKTrees, CykWitness, simulateCYKParse, CYKSimulationResult, CYKStep
} from '../../core/parser/cyk';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { convertToChomsky } from '../../core/processor/grammarProcessor';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { LatexExportButton } from '../components/LatexExportButton';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { ProductionText } from '../components/Symbols';
import { Language } from '../../i18n/translations';
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, Grid3x3, SearchCheck, ExternalLink } from 'lucide-react';
import { ReferenceBar } from '../components/ReferenceBar';

export const MEMBERSHIP_PRIMARY_REFERENCES = {
  general: [
    {
      authorYear: 'Earley (1970)',
      topicEn: 'Context-Free Parsing & Dynamic Programming',
      topicCz: 'Syntaktická analýza BKG a dynamické programování',
      citation: 'Earley, J.: An efficient context-free parsing algorithm. Communications of the ACM 13(2), 94–102, 1970.',
      url: 'https://doi.org/10.1145/362007.362035'
    }
  ],
  cyk: [
    {
      authorYear: 'Cocke (1969), Cocke & Schwartz (1970)',
      topicEn: 'CYK Parsing Algorithm',
      topicCz: 'Algoritmus CYK',
      citation: 'Cocke, J., Schwartz, J. T.: Programming Languages and Their Compilers: Preliminary Notes. Courant Institute of Mathematical Sciences, New York University, 1970.',
      url: 'https://softwarepreservation.computerhistory.org/SETL/precursors/Cocke_Schwartz-Programming_Languages_and_Their_Compilers-1970.pdf'
    },
    {
      authorYear: 'Younger (1967)',
      topicEn: 'Recognition in Time O(n³)',
      topicCz: 'Rozpoznávání BKG v čase O(n³)',
      citation: 'Younger, D. H.: Recognition and parsing of context-free languages in time n³. Information and Control 10(2), 189–208, 1967.',
      url: 'https://doi.org/10.1016/S0019-9958(67)80007-X'
    },
    {
      authorYear: 'Kasami (1965)',
      topicEn: 'Efficient Syntax-Analysis Algorithm',
      topicCz: 'Efektivní syntaktická analýza BKG',
      citation: 'Kasami, T.: An efficient recognition and syntax-analysis algorithm for context-free languages. Scientific Report AFCRL-65-758, Air Force Cambridge Research Laboratory, Bedford, MA, 1965 (DTIC AD0631692).',
      url: 'https://apps.dtic.mil/sti/citations/AD0631692'
    }
  ]
};

interface MembershipViewProps {
  grammar: Grammar;
  defaultInput?: string;
  lang: Language;
  /** Converts the grammar in the editor to CNF (one undoable step) */
  onConvertToCNF?: () => void;
}

/** Words longer than this are not analysed automatically (the table grows with n³). */
const MAX_WORD = 60;
const MAX_TREES = 20;

/**
 * Membership of a word for any grammar with all its derivation trees, and the
 * CYK table for a grammar in Chomsky normal form (or its CNF).
 */
export const MembershipView: React.FC<MembershipViewProps> = ({ grammar, defaultInput = '', lang, onConvertToCNF }) => {
  const cz = lang === 'cz';
  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);
  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const tooLong = tokenized.tokens.length > MAX_WORD;
  const result = useMemo(
    () => (tooLong ? null : testMembership(grammar, tokenized.tokens, MAX_TREES)),
    [grammar, tokenized, tooLong]
  );
  const [treeIdx, setTreeIdx] = useState(0);
  useEffect(() => setTreeIdx(0), [result]);
  const word = tokenized.tokens.join(' ') || 'ε';

  const countText = (c: number) =>
    c === Infinity ? (cz ? 'nekonečně mnoho' : 'infinitely many') : c.toLocaleString(cz ? 'cs-CZ' : 'en-US');

  return (
    <div>
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SearchCheck size={18} color="var(--color-primary)" />
            {cz ? 'Příslušnost slova k jazyku L(G)' : 'Does the word belong to L(G)?'}
          </span>
        </div>
        <p className="hint-text" style={{ marginBottom: '10px' }}>
          {cz
            ? 'Obecný algoritmus pro libovolnou bezkontextovou gramatiku – i nejednoznačnou, s ε-pravidly a cykly, která není LL ani LR. Pro každý úsek slova zjistí, které neterminály jej generují (dynamické programování jako v CYK, ale přes celé pravé strany), spočte derivační stromy a vypíše je.'
            : 'A general algorithm for any context-free grammar – also an ambiguous one with ε-rules and cycles that is neither LL nor LR. For every part of the word it finds the non-terminals that derive it (dynamic programming as in CYK, but over whole right-hand sides), counts the derivation trees and lists them.'}
        </p>
        <input
          type="text"
          className="grammar-textarea"
          style={{ minHeight: 'unset', height: '38px', padding: '6px 12px', marginBottom: '10px' }}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={(cz ? 'Slovo: tokeny oddělené mezerami, nebo bez mezer' : 'Word: tokens separated by spaces, or without spaces') + (defaultInput ? (cz ? ` (např. ${defaultInput})` : ` (e.g. ${defaultInput})`) : '')}
          aria-label={cz ? 'Slovo' : 'Word'}
        />
        <TokenizedInputNote tokenized={tokenized} lang={lang} />

        {tooLong && (
          <div className="report-box warning">
            {cz ? `Slovo má ${tokenized.tokens.length} symbolů; analyzují se slova do ${MAX_WORD} symbolů.` : `The word has ${tokenized.tokens.length} symbols; words up to ${MAX_WORD} symbols are analysed.`}
          </div>
        )}

        {result && (result.accepted ? (
          <div className="report-box success" style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              <strong>{word} ∈ L(G).</strong>{' '}
              {cz ? 'Počet derivačních stromů: ' : 'Number of derivation trees: '}<strong>{countText(result.treeCount)}</strong>
              {result.treeCount === 1
                ? (cz ? ' – slovo má jediný strom (jedinou levou derivaci).' : ' – the word has a single tree (a single leftmost derivation).')
                : result.treeCount === Infinity
                  ? (cz ? ' – gramatika obsahuje cyklus A ⇒⁺ A; vypsány jsou stromy, které cyklus neopakují.' : ' – the grammar has a cycle A ⇒⁺ A; the trees listed do not repeat it.')
                  : (cz ? ' – slovo má více stromů, gramatika je tedy nejednoznačná.' : ' – the word has several trees, so the grammar is ambiguous.')}
            </span>
          </div>
        ) : (
          <div className="report-box danger" style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <XCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              <strong>{word} ∉ L(G).</strong>{' '}
              {result.viablePrefix === tokenized.tokens.length
                ? (cz
                  ? 'Slovo je začátkem některého slova jazyka, ale samo do jazyka nepatří (vstup skončil předčasně).'
                  : 'The word is the beginning of some word of the language, but does not belong to it (the input ends too early).')
                : (cz
                  ? `Chyba na ${result.viablePrefix + 1}. symbolu '${tokenized.tokens[result.viablePrefix]}': ${result.viablePrefix === 0 ? 'žádné slovo jazyka jím nezačíná' : `'${tokenized.tokens.slice(0, result.viablePrefix).join(' ')}' je začátkem některého slova jazyka, s tímto symbolem už ne`}.`
                  : `Error at symbol ${result.viablePrefix + 1} '${tokenized.tokens[result.viablePrefix]}': ${result.viablePrefix === 0 ? 'no word of the language starts with it' : `'${tokenized.tokens.slice(0, result.viablePrefix).join(' ')}' begins some word of the language, with this symbol none`}.`)}
            </span>
          </div>
        ))}

        {result && result.trees.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div className="membership-tree-head">
              <div className="membership-pager">
                <button type="button" className="btn btn-secondary" disabled={treeIdx === 0} onClick={() => setTreeIdx(i => i - 1)} aria-label={cz ? 'Předchozí strom' : 'Previous tree'}>
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {cz ? 'Strom ' : 'Tree '}{treeIdx + 1}{cz ? ' z ' : ' of '}{result.trees.length}
                  {result.moreTrees && (cz ? ` (vypsáno prvních ${result.trees.length})` : ` (first ${result.trees.length} listed)`)}
                </span>
                <button type="button" className="btn btn-secondary" disabled={treeIdx >= result.trees.length - 1} onClick={() => setTreeIdx(i => i + 1)} aria-label={cz ? 'Další strom' : 'Next tree'}>
                  <ChevronRight size={14} />
                </button>
              </div>
              <LatexExportButton
                getLatex={() => exportParseTreeToTikz(result.trees[treeIdx].tree)}
                filename="parse_tree.tex"
                label="LaTeX (forest)"
                lang={lang}
              />
            </div>
            <div className="hint-text" style={{ margin: '4px 0 8px', fontFamily: 'var(--font-mono)' }}>
              <strong>{cz ? 'Levý rozklad' : 'Left parse'}:</strong> {result.trees[treeIdx].leftParse.join(' ') || '–'}
            </div>
            <DerivationTreeVisualizer rootNode={result.trees[treeIdx].tree} height="340px" filename={`parse_tree_${treeIdx + 1}`} lang={lang} />
          </div>
        )}

        {/* Primary Literature Reference Bar */}
        <ReferenceBar
          references={MEMBERSHIP_PRIMARY_REFERENCES.general}
          lang={lang}
          label={cz ? 'Primární literatura (obecná syntaktická analýza BKG):' : 'Primary literature (general CFG parsing):'}
        />
      </div>

      <CykCard grammar={grammar} tokens={tooLong ? null : tokenized.tokens} lang={lang} onConvertToCNF={onConvertToCNF} />
    </div>
  );
};

/** Trees of the CYK card listed with a pager. */
const MAX_CYK_TREES = 5;
/** Longest word that can be stepped through (the number of steps grows with n³/6). */
const MAX_STEP_WORD = 60;

/** The CYK table: of the grammar if it is in CNF, otherwise of its CNF G′ on request. */
const CykCard: React.FC<{ grammar: Grammar; tokens: string[] | null; lang: Language; onConvertToCNF?: () => void }> = ({
  grammar, tokens, lang, onConvertToCNF
}) => {
  const cz = lang === 'cz';
  const violations = useMemo(() => cnfViolations(grammar), [grammar]);
  const converted = violations.length > 0;
  const [useConverted, setUseConverted] = useState(false);
  const cnf = useMemo(
    () => (converted && useConverted ? convertToChomsky(grammar).transformedGrammar : null),
    [grammar, converted, useConverted]
  );
  const g = converted ? cnf : grammar;
  const G = converted ? 'G′' : 'G';
  const LG = converted ? 'L(G′) = L(G)' : 'L(G)';
  const table = useMemo(() => (g && tokens ? cykTable(g, tokens) : null), [g, tokens]);
  const trees = useMemo(() => (g && tokens && table ? extractCYKTrees(g, tokens, table, MAX_CYK_TREES) : []), [g, tokens, table]);
  const treeCount = useMemo(() => (g && table ? countCYKTrees(g, table) : 0n), [g, table]);

  const [stepMode, setStepMode] = useState(false);
  const canStep = !!table && table.n > 0 && table.n <= MAX_STEP_WORD;
  // The simulation only in step mode: its steps grow with n³
  const sim: CYKSimulationResult | null = useMemo(
    () => (stepMode && canStep && g && tokens ? simulateCYKParse(g, tokens, { converted }) : null),
    [stepMode, canStep, g, tokens, converted]
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null);
  const [hoverWitness, setHoverWitness] = useState<CykWitness | null>(null);
  const [treeIdx, setTreeIdx] = useState(0);

  useEffect(() => {
    setSelected(null);
    setHoverWitness(null);
    setStepIdx(0);
    setIsPlaying(false);
    setTreeIdx(0);
  }, [table, sim]);

  useAutoPlay(isPlaying, stepIdx, sim?.totalSteps ?? 0, playSpeed, setStepIdx, () => setIsPlaying(false));

  const currentStep: CYKStep | undefined = stepMode ? sim?.steps[stepIdx] : undefined;
  const V = (i: number, j: number) => `V(${i}, ${j})`;
  /** The cell as it is at the current step (null: not computed yet) */
  const cellAt = (i: number, j: number): Map<string, CykWitness[]> | null => {
    if (!table) return null;
    return currentStep ? cykCellAtStep(table, currentStep, i, j) : table.cells[i][j];
  };
  const showFullTrees = !!table?.accepted && (!currentStep || currentStep.phase === 'accept');
  const shownTree = showFullTrees ? trees[Math.min(treeIdx, trees.length - 1)] : currentStep?.derivationTree;
  const isSame = (c: { i: number; j: number } | undefined, i: number, j: number) => !!c && c.i === i && c.j === j;
  const selectedCell = selected ? cellAt(selected.i, selected.j) : null;

  const stepLabel = (s: CYKStep): string => {
    if (s.phase === 'init') return cz ? 'Začátek' : 'Start';
    if (s.phase === 'accept') return cz ? 'Výsledek' : 'Result';
    if (s.phase === 'base') return cz ? `Délka 1 · ${V(s.i, s.j)}` : `Length 1 · ${V(s.i, s.j)}`;
    return cz ? `Délka ${s.length} · ${V(s.i, s.j)} · k = ${s.k}` : `Length ${s.length} · ${V(s.i, s.j)} · k = ${s.k}`;
  };

  return (
    <div className="card">
      <div className="card-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Grid3x3 size={18} color="var(--color-primary)" />
          {cz ? 'Algoritmus CYK (Cocke–Younger–Kasami)' : 'The CYK algorithm (Cocke–Younger–Kasami)'}
        </span>
      </div>
      <p className="hint-text" style={{ marginBottom: '10px' }}>
        {cz
          ? 'Pro gramatiku v Chomského normální formě (A → B C, A → a, případně S → ε, pokud S není na žádné pravé straně). V(i, j) je množina neterminálů, které generují úsek wᵢ … wⱼ: pro jeden symbol A s pravidlem A → wᵢ, pro delší úsek A s pravidlem A → B C, kde B ∈ V(i, k) a C ∈ V(k+1, j) pro některé k = i … j−1. Tabulka se plní podle délky úseku; slovo patří do jazyka, právě když S ∈ V(1, n). Kliknutím na buňku zobrazíte, odkud se její neterminály vzaly.'
          : 'For a grammar in Chomsky normal form (A → B C, A → a, possibly S → ε when S is on no right-hand side). V(i, j) is the set of non-terminals that derive the part wᵢ … wⱼ: for one symbol the A with A → wᵢ, for a longer part the A with A → B C where B ∈ V(i, k) and C ∈ V(k+1, j) for some k = i … j−1. The table is filled by the length of the part; the word belongs to the language iff S ∈ V(1, n). Click a cell to see where its non-terminals come from.'}
      </p>

      {converted && (
        <div className="notice-box info" style={{ marginBottom: '10px' }}>
          <div className="notice-title">
            <span>{cz ? 'Gramatika není v Chomského normální formě' : 'The grammar is not in Chomsky normal form'}</span>
          </div>
          <p style={{ margin: '4px 0 6px', fontSize: '12px' }}>
            {cz ? 'Pravidla mimo CNF: ' : 'Rules not in CNF: '}
            {violations.slice(0, 8).map(p => formatProduction(p).replace('->', '→')).join(', ')}{violations.length > 8 ? ', …' : ''}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <label className="precedence-switch" style={{ margin: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="checkbox" checked={useConverted} onChange={e => setUseConverted(e.target.checked)} />
                {cz ? 'Ukázat CYK pro ekvivalentní gramatiku G′ v CNF' : 'Show CYK for an equivalent grammar G′ in CNF'}
              </span>
            </label>
            {onConvertToCNF && (
              <button type="button" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={onConvertToCNF}>
                {cz ? 'Převést gramatiku v editoru do CNF' : 'Convert the grammar in the editor to CNF'}
              </button>
            )}
          </div>
        </div>
      )}

      {cnf && (
        <details className="cnf-rules" open>
          <summary>{cz ? `Gramatika G′ v CNF (${cnf.productions.length} pravidel)` : `The grammar G′ in CNF (${cnf.productions.length} rules)`}</summary>
          <p className="hint-text" style={{ margin: '4px 0 0' }}>
            {cz
              ? 'L(G′) = L(G). Tabulka, kroky i derivační stromy níže jsou v gramatice G′ (X_a → a nahrazuje terminál a v dlouhých pravidlech, C_n jsou pomocné neterminály rozkladu pravidel délky ≥ 3); stromy v gramatice z editoru jsou v kartě výše.'
              : 'L(G′) = L(G). The table, the steps and the derivation trees below are in the grammar G′ (X_a → a stands for the terminal a inside long rules, C_n are the auxiliary non-terminals splitting rules of length ≥ 3); the trees in the grammar of the editor are in the card above.'}
          </p>
          <div className="cnf-rule-list">
            {cnf.productions.map(p => (
              <span key={p.id}><ProductionText production={p} nonTerminals={cnf.nonTerminals} showId /></span>
            ))}
          </div>
        </details>
      )}

      {g && table && (
        table.n === 0 ? (
          <div className={`report-box ${table.accepted ? 'success' : 'danger'}`}>
            {cz
              ? `Prázdné slovo nemá v tabulce žádné buňky: ε ∈ ${LG}, právě když ${G} obsahuje pravidlo ${g.startSymbol} → ε${table.accepted ? ' (obsahuje).' : ' (neobsahuje).'}`
              : `The empty word has no cells in the table: ε ∈ ${LG} iff ${G} has the rule ${g.startSymbol} → ε${table.accepted ? ' (it has).' : ' (it has not).'}`}
          </div>
        ) : (
          <>
            <div className="cyk-toolbar">
              <label className="precedence-switch" style={{ margin: 0, fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={stepMode} disabled={!canStep} onChange={e => setStepMode(e.target.checked)} />
                  {cz ? 'Krokovat algoritmus CYK (postupné plnění tabulky)' : 'Step through the CYK algorithm (filling the table)'}
                </span>
              </label>
              {!canStep && (
                <span className="hint-text">
                  {cz ? `Krokovat lze slova do ${MAX_STEP_WORD} symbolů.` : `Words up to ${MAX_STEP_WORD} symbols can be stepped through.`}
                </span>
              )}
            </div>

            {stepMode && sim && (
              <SimulatorControls
                stepIdx={stepIdx}
                total={sim.totalSteps}
                isPlaying={isPlaying}
                speed={playSpeed}
                lang={lang}
                onStep={setStepIdx}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                onSpeed={setPlaySpeed}
              />
            )}

            <div className="cyk-layout">
              <div className="cyk-main">
                <div className="data-table-container cyk-table-container">
                  <table className="cyk-table">
                    <tbody>
                      {Array.from({ length: table.n }, (_, r) => table.n - r).map(len => (
                        <tr key={len}>
                          <th>{cz ? `délka ${len}` : `length ${len}`}</th>
                          {Array.from({ length: table.n }, (_, c) => {
                            const i = c + 1;
                            const j = i + len - 1;
                            if (j > table.n) return <td key={c} className="cyk-none" />;
                            const cell = cellAt(i, j);
                            const symbols = cell ? [...cell.keys()] : [];
                            const isTop = i === 1 && j === table.n;
                            const witnessLeft = !!hoverWitness && !!selected && hoverWitness.k !== undefined && i === selected.i && j === hoverWitness.k;
                            const witnessRight = !!hoverWitness && !!selected && hoverWitness.k !== undefined && i === hoverWitness.k + 1 && j === selected.j;
                            const classNames = [
                              'cyk-cell',
                              isSame(selected ?? undefined, i, j) ? 'selected' : '',
                              witnessLeft ? 'witness-left' : '',
                              witnessRight ? 'witness-right' : '',
                              isTop ? 'top' : '',
                              isSame(currentStep?.targetCell, i, j) ? 'active-target' : '',
                              isSame(currentStep?.leftCell, i, j) ? 'active-left' : '',
                              isSame(currentStep?.rightCell, i, j) ? 'active-right' : '',
                              currentStep && !cell ? 'dimmed' : ''
                            ].filter(Boolean).join(' ');
                            return (
                              <td key={c} className={classNames} onClick={() => setSelected({ i, j })} title={V(i, j)}>
                                {!cell ? (
                                  <span className="cyk-empty">·</span>
                                ) : symbols.length === 0 ? (
                                  <span className="cyk-empty">∅</span>
                                ) : (
                                  symbols.map(A => (
                                    <span
                                      key={A}
                                      className={[
                                        isTop && A === g.startSymbol ? 'cyk-start' : '',
                                        currentStep?.phase !== 'accept' && isSame(currentStep?.targetCell, i, j) && currentStep?.addedNonTerminals.includes(A) ? 'cyk-new' : ''
                                      ].filter(Boolean).join(' ') || undefined}
                                    >{A}</span>
                                  ))
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="cyk-word">
                        <th />
                        {tokens!.map((tok, c) => (
                          <td key={c}><span className="cyk-index">{c + 1}</span>{tok}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {(!currentStep || currentStep.phase === 'accept') && (
                  <div className={`report-box ${table.accepted ? 'success' : 'danger'}`} style={{ marginTop: '10px' }}>
                    {table.accepted
                      ? (cz ? `${g.startSymbol} ∈ ${V(1, table.n)}: slovo patří do jazyka ${LG}.` : `${g.startSymbol} ∈ ${V(1, table.n)}: the word belongs to ${LG}.`)
                      : (cz ? `${g.startSymbol} ∉ ${V(1, table.n)}: slovo nepatří do jazyka ${LG}.` : `${g.startSymbol} ∉ ${V(1, table.n)}: the word does not belong to ${LG}.`)}
                  </div>
                )}

                {selected && (
                  <div className="cyk-detail">
                    {!selectedCell ? (
                      <strong>{cz ? `${V(selected.i, selected.j)} v tomto kroku ještě není spočtena.` : `${V(selected.i, selected.j)} is not computed yet at this step.`}</strong>
                    ) : (
                      <>
                        <strong>
                          {V(selected.i, selected.j)} = {selectedCell.size === 0 ? '∅' : `{${[...selectedCell.keys()].join(', ')}}`}
                          {currentStep && isSame(currentStep.targetCell, selected.i, selected.j) && currentStep.phase === 'combine' && currentStep.k! < selected.j - 1
                            ? (cz ? ` (zatím, do k = ${currentStep.k})` : ` (so far, up to k = ${currentStep.k})`)
                            : ''}
                        </strong>
                        {selectedCell.size === 0 && (
                          <div className="hint-text">
                            {selected.i === selected.j
                              ? (cz ? `Žádné pravidlo A → ${tokens![selected.i - 1]}.` : `No rule A → ${tokens![selected.i - 1]}.`)
                              : (cz ? 'Pro žádné k neexistuje pravidlo A → B C s B ∈ V(i, k) a C ∈ V(k+1, j).' : 'For no k is there a rule A → B C with B ∈ V(i, k) and C ∈ V(k+1, j).')}
                          </div>
                        )}
                        <ul>
                          {[...selectedCell].flatMap(([A, wits]) => wits.map((wit, idx) => (
                            <li key={`${A}_${idx}`} onMouseEnter={() => setHoverWitness(wit)} onMouseLeave={() => setHoverWitness(null)}>
                              {wit.k === undefined
                                ? `${A} → ${wit.production.rhs[0]}`
                                : `${A} → ${wit.production.rhs[0]} ${wit.production.rhs[1]}: ${wit.production.rhs[0]} ∈ ${V(selected.i, wit.k)}, ${wit.production.rhs[1]} ∈ ${V(wit.k + 1, selected.j)} (k = ${wit.k})`}
                            </li>
                          )))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="cyk-side">
                {currentStep && sim && (
                  <div className={`cyk-step-box ${currentStep.phase === 'accept' ? (sim.accepted ? 'accepted' : 'rejected') : ''}`}>
                    <div className="cyk-step-head">
                      <strong>{stepLabel(currentStep)}</strong>
                      {currentStep.leftCell && (
                        <span className="cyk-badge cyk-badge-left">{cz ? 'levá' : 'left'} {V(currentStep.leftCell.i, currentStep.leftCell.j)}</span>
                      )}
                      {currentStep.rightCell && (
                        <span className="cyk-badge cyk-badge-right">{cz ? 'pravá' : 'right'} {V(currentStep.rightCell.i, currentStep.rightCell.j)}</span>
                      )}
                    </div>
                    <div>{cz ? currentStep.descriptionCz : currentStep.descriptionEn}</div>
                  </div>
                )}

                {(showFullTrees || (currentStep && currentStep.phase !== 'accept')) && (
                  <div className="cyk-tree-panel">
                    <div className="cyk-tree-head">
                      {showFullTrees ? (
                        <>
                          <div className="membership-pager">
                            <button type="button" className="btn btn-secondary" disabled={treeIdx === 0} onClick={() => setTreeIdx(i => i - 1)} aria-label={cz ? 'Předchozí strom' : 'Previous tree'}>
                              <ChevronLeft size={14} />
                            </button>
                            <span>
                              {cz ? 'Strom ' : 'Tree '}{Math.min(treeIdx, trees.length - 1) + 1}{cz ? ' z ' : ' of '}{trees.length}
                              {BigInt(trees.length) < treeCount && (cz ? ` (slovo má ${treeCount.toLocaleString('cs-CZ')} stromů)` : ` (the word has ${treeCount.toLocaleString('en-US')} trees)`)}
                            </span>
                            <button type="button" className="btn btn-secondary" disabled={treeIdx >= trees.length - 1} onClick={() => setTreeIdx(i => i + 1)} aria-label={cz ? 'Další strom' : 'Next tree'}>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                          {shownTree && (
                            <LatexExportButton
                              getLatex={() => exportParseTreeToTikz(shownTree)}
                              filename="cyk_tree.tex"
                              label={cz ? 'TikZ strom' : 'TikZ Tree'}
                              title={cz ? 'Export derivačního stromu do LaTeXu (TikZ)' : 'Export derivation tree to LaTeX (TikZ)'}
                              lang={lang}
                            />
                          )}
                        </>
                      ) : (
                        <strong>
                          {currentStep?.targetCell && currentStep.phase !== 'init'
                            ? (cz ? `Podstromy vytvořené v tomto kroku pro ${V(currentStep.targetCell.i, currentStep.targetCell.j)}` : `Subtrees built in this step for ${V(currentStep.targetCell.i, currentStep.targetCell.j)}`)
                            : (cz ? 'Podstromy vytvořené v tomto kroku' : 'Subtrees built in this step')}
                        </strong>
                      )}
                    </div>
                    <div className="hint-text" style={{ marginBottom: '6px' }}>
                      {showFullTrees
                        ? (converted
                          ? (cz ? 'Binární derivační strom v gramatice G′ v CNF (ne v gramatice z editoru).' : 'A binary derivation tree in the grammar G′ in CNF (not in the grammar of the editor).')
                          : (cz ? 'Binární derivační strom gramatiky v CNF.' : 'A binary derivation tree of the grammar in CNF.'))
                        : (cz ? `Jeden strom pro každé použité pravidlo; podstromy operandů jsou ty první nalezené (v ${G}).` : `One tree for every rule applied; the subtrees of the operands are the first ones found (in ${G}).`)}
                    </div>
                    {shownTree ? (
                      <DerivationTreeVisualizer
                        rootNode={shownTree}
                        height="300px"
                        filename={showFullTrees ? `cyk_tree_${treeIdx + 1}` : `cyk_step_${stepIdx}`}
                        lang={lang}
                      />
                    ) : (
                      <div className="cyk-no-tree">
                        {cz ? 'V tomto kroku nevzniká žádný nový podstrom.' : 'No new subtree in this step.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      )}

      {/* Primary Literature Reference Bar */}
      <ReferenceBar
        references={MEMBERSHIP_PRIMARY_REFERENCES.cyk}
        lang={lang}
        label={cz ? 'Primární literatura (algoritmus CYK):' : 'Primary literature (CYK algorithm):'}
      />
    </div>
  );
};
