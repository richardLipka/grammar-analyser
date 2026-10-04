import React, { useEffect, useMemo, useState } from 'react';
import { Grammar, formatProduction } from '../../core/ast/grammar';
import { testMembership } from '../../core/parser/membership';
import { cnfViolations, cykTable, CykWitness } from '../../core/parser/cyk';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { convertToChomsky } from '../../core/processor/grammarProcessor';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { LatexExportButton } from '../components/LatexExportButton';
import { ProductionText } from '../components/Symbols';
import { Language } from '../../i18n/translations';
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, Grid3x3, SearchCheck } from 'lucide-react';

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
      </div>

      <CykCard grammar={grammar} tokens={tooLong ? null : tokenized.tokens} lang={lang} onConvertToCNF={onConvertToCNF} />
    </div>
  );
};

/** The CYK table: of the grammar if it is in CNF, otherwise of its CNF on request. */
const CykCard: React.FC<{ grammar: Grammar; tokens: string[] | null; lang: Language; onConvertToCNF?: () => void }> = ({
  grammar, tokens, lang, onConvertToCNF
}) => {
  const cz = lang === 'cz';
  const violations = useMemo(() => cnfViolations(grammar), [grammar]);
  const [useConverted, setUseConverted] = useState(false);
  const cnf = useMemo(
    () => (violations.length > 0 && useConverted ? convertToChomsky(grammar).transformedGrammar : null),
    [grammar, violations, useConverted]
  );
  const g = violations.length === 0 ? grammar : cnf;
  const table = useMemo(() => (g && tokens ? cykTable(g, tokens) : null), [g, tokens]);
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null);
  const [hoverWitness, setHoverWitness] = useState<CykWitness | null>(null);
  useEffect(() => {
    setSelected(null);
    setHoverWitness(null);
  }, [table]);
  const V = (i: number, j: number) => `V(${i}, ${j})`;

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
          ? 'Pro gramatiku v Chomského normální formě (A → B C, A → a, případně S → ε). V(i, j) je množina neterminálů, které generují úsek wᵢ … wⱼ: pro jeden symbol A s pravidlem A → wᵢ, pro delší úsek A s pravidlem A → B C, kde B ∈ V(i, k) a C ∈ V(k+1, j). Slovo patří do jazyka, právě když S ∈ V(1, n). Kliknutím na buňku zobrazíte, odkud se její neterminály vzaly.'
          : 'For a grammar in Chomsky normal form (A → B C, A → a, possibly S → ε). V(i, j) is the set of non-terminals that derive the part wᵢ … wⱼ: for one symbol the A with A → wᵢ, for a longer part the A with A → B C where B ∈ V(i, k) and C ∈ V(k+1, j). The word belongs to the language iff S ∈ V(1, n). Click a cell to see where its non-terminals come from.'}
      </p>

      {violations.length > 0 && (
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
                {cz ? 'Ukázat CYK pro ekvivalentní gramatiku v CNF' : 'Show CYK for an equivalent grammar in CNF'}
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
        <details className="cnf-rules">
          <summary>{cz ? `Gramatika v CNF (${cnf.productions.length} pravidel)` : `The grammar in CNF (${cnf.productions.length} rules)`}</summary>
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
              ? `Prázdné slovo: patří do jazyka, právě když existuje pravidlo ${g.startSymbol} → ε${table.accepted ? ' (existuje).' : ' (neexistuje).'}`
              : `The empty word belongs to the language iff there is a rule ${g.startSymbol} → ε${table.accepted ? ' (there is).' : ' (there is not).'}`}
          </div>
        ) : (
          <>
            <div className="data-table-container">
              <table className="cyk-table">
                <tbody>
                  {Array.from({ length: table.n }, (_, r) => table.n - r).map(len => (
                    <tr key={len}>
                      <th>{cz ? `délka ${len}` : `length ${len}`}</th>
                      {Array.from({ length: table.n }, (_, c) => {
                        const i = c + 1;
                        const j = i + len - 1;
                        if (j > table.n) return <td key={c} className="cyk-none" />;
                        const cell = table.cells[i][j];
                        const isSel = selected?.i === i && selected?.j === j;
                        const isWitness = !!hoverWitness && selected && hoverWitness.k !== undefined &&
                          ((i === selected.i && j === hoverWitness.k) || (i === hoverWitness.k + 1 && j === selected.j));
                        const isTop = i === 1 && j === table.n;
                        return (
                          <td
                            key={c}
                            className={['cyk-cell', isSel ? 'selected' : '', isWitness ? 'witness' : '', isTop ? 'top' : ''].join(' ')}
                            onClick={() => setSelected({ i, j })}
                            title={V(i, j)}
                          >
                            {cell.size === 0 ? <span className="cyk-empty">∅</span> : [...cell.keys()].map(A => (
                              <span key={A} className={isTop && A === g.startSymbol ? 'cyk-start' : ''}>{A}</span>
                            ))}
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
            <div className={`report-box ${table.accepted ? 'success' : 'danger'}`} style={{ marginTop: '10px' }}>
              {table.accepted
                ? (cz ? `${g.startSymbol} ∈ ${V(1, table.n)}: slovo do jazyka patří.` : `${g.startSymbol} ∈ ${V(1, table.n)}: the word belongs to the language.`)
                : (cz ? `${g.startSymbol} ∉ ${V(1, table.n)}: slovo do jazyka nepatří.` : `${g.startSymbol} ∉ ${V(1, table.n)}: the word does not belong to the language.`)}
            </div>
            {selected && (
              <div className="cyk-detail">
                <strong>{V(selected.i, selected.j)} = {'{'} {[...table.cells[selected.i][selected.j].keys()].join(', ')} {'}'}</strong>
                {table.cells[selected.i][selected.j].size === 0 && (
                  <div className="hint-text">
                    {selected.i === selected.j
                      ? (cz ? `Žádné pravidlo A → ${tokens![selected.i - 1]}.` : `No rule A → ${tokens![selected.i - 1]}.`)
                      : (cz ? 'Pro žádné k neexistuje pravidlo A → B C s B ∈ V(i, k) a C ∈ V(k+1, j).' : 'For no k is there a rule A → B C with B ∈ V(i, k) and C ∈ V(k+1, j).')}
                  </div>
                )}
                <ul>
                  {[...table.cells[selected.i][selected.j]].flatMap(([A, wits]) => wits.map((wit, idx) => (
                    <li key={`${A}_${idx}`} onMouseEnter={() => setHoverWitness(wit)} onMouseLeave={() => setHoverWitness(null)}>
                      {wit.k === undefined
                        ? `${A} → ${wit.production.rhs[0]}`
                        : `${A} → ${wit.production.rhs[0]} ${wit.production.rhs[1]}: ${wit.production.rhs[0]} ∈ ${V(selected.i, wit.k)}, ${wit.production.rhs[1]} ∈ ${V(wit.k + 1, selected.j)} (k = ${wit.k})`}
                    </li>
                  )))}
                </ul>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
};
