/**
 * GLLView: the GLL parser (Scott & Johnstone 2010/2013) with BSR sets (2019) step by step —
 * descriptors R and U, the GSS with its pop set P, the BSR set Υ and the subtree of the newest
 * element — and the shared packed forest of all derivation trees (from the BSR set, or from
 * the Earley chart for comparison).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grammar } from '../../core/ast/grammar';
import { parseGLL, GLLResult, formatDescriptor, gssNodeName } from '../../core/gll/gllParser';
import { bsrTrees, formatBSRElement, BSRRuleElement } from '../../core/gll/bsr';
import { GLL_PRIMARY_REFERENCES, GLL_THEORY_GUIDE, describeGLLAction } from '../../core/gll/gllExplain';
import { bsrToForest, earleyChartToBSR, treeInForest } from '../../core/forest/sppf';
import { simulateEarleyParse } from '../../core/earley/earleyParser';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { withUniqueIds } from '../../core/earley/earleyTrees';
import { exportParseTreeToTikz } from '../../core/export/latexExport';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { ReferenceBar } from '../components/ReferenceBar';
import { LatexExportButton } from '../components/LatexExportButton';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { GLLGSSVisualizer } from '../visualizer/GLLGSSVisualizer';
import { ForestVisualizer } from '../visualizer/ForestVisualizer';
import { Language } from '../../i18n/translations';
import { BookOpen, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, GitBranch, Network, ListOrdered, Boxes, Trees } from 'lucide-react';

interface GLLViewProps {
  grammar: Grammar;
  defaultInput?: string;
  lang: Language;
}

const nodeName = gssNodeName;

export const GLLView: React.FC<GLLViewProps> = ({ grammar, defaultInput = '', lang }) => {
  const cz = lang === 'cz';
  const [inputText, setInputText] = useState(defaultInput);
  useEffect(() => setInputText(defaultInput), [defaultInput]);
  const [lookahead, setLookahead] = useState(true);
  const [showTheory, setShowTheory] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [treeMode, setTreeMode] = useState<'step' | 'full'>('step');
  const [treeIdx, setTreeIdx] = useState(0);
  const [binarised, setBinarised] = useState(false);
  const [forestSource, setForestSource] = useState<'gll' | 'earley'>('gll');
  const [highlightTree, setHighlightTree] = useState(true);

  const tokenized = useMemo(() => tokenizeInput(inputText, grammar.terminals), [inputText, grammar]);
  const tokens = tokenized.tokens;
  const result: GLLResult = useMemo(() => parseGLL(grammar, tokens, { lookahead }), [grammar, tokens, lookahead]);
  const total = result.steps.length;

  useEffect(() => {
    setStepIdx(0);
    setIsPlaying(false);
    setTreeIdx(0);
  }, [result]);
  useAutoPlay(isPlaying, stepIdx, total, speed, setStepIdx, () => setIsPlaying(false));

  const step = result.steps[stepIdx];
  const isLast = stepIdx === total - 1;
  const processed = step?.descriptor !== undefined ? result.descriptors[step.descriptor] : undefined;

  // R after this step: added up to now, not yet taken; the top of the stack first
  const pending = useMemo(
    () => result.descriptors.filter(d => d.addedAt <= stepIdx && (d.processedAt === undefined || d.processedAt > stepIdx)).sort((a, b) => b.id - a.id),
    [result, stepIdx]
  );
  const uSize = useMemo(() => result.descriptors.filter(d => d.addedAt <= stepIdx).length, [result, stepIdx]);
  const bsrNow = useMemo(() => result.bsr.elements.filter(e => e.createdAt <= stepIdx), [result, stepIdx]);
  const popNow = useMemo(() => result.popSet.filter(p => p.createdAt <= stepIdx), [result, stepIdx]);
  const popped = useMemo(() => new Set(step?.actions.flatMap(a => (a.type === 'pop' && !a.base ? [a.node] : [])) ?? []), [step]);

  // The subtree of the newest rule element (up to this step)
  const stepTree = useMemo(() => {
    let element: BSRRuleElement | undefined;
    for (const e of result.bsr.elements) if (e.kind === 'rule' && e.createdAt <= stepIdx) element = e;
    if (!element) return undefined;
    const set = result.bsr.upTo(stepIdx);
    const first = bsrTrees(set, grammar, tokens, element.production.lhs, element.i, element.j, element).next();
    return first.done ? undefined : { tree: withUniqueIds(first.value), element };
  }, [result, stepIdx, grammar, tokens]);
  const fullTree = result.trees.length > 0 ? withUniqueIds(result.trees[Math.min(treeIdx, result.trees.length - 1)]) : undefined;
  const shownTree = treeMode === 'full' ? fullTree : stepTree?.tree;

  // Forest of the whole word
  const earleyBSR = useMemo(() => {
    if (forestSource !== 'earley') return null;
    const sim = simulateEarleyParse(tokens, grammar, { maxSteps: 200000 });
    return earleyChartToBSR(grammar, tokens, sim.sets.map(s => s.items));
  }, [forestSource, tokens, grammar]);
  const forest = useMemo(
    () => bsrToForest(forestSource === 'earley' && earleyBSR ? earleyBSR : result.bsr, grammar, tokens, { binarised, maxNodes: 600 }),
    [forestSource, earleyBSR, result, grammar, tokens, binarised]
  );
  const forestHighlight = useMemo(
    () => (highlightTree && result.trees.length > 0 ? treeInForest(result.trees[Math.min(treeIdx, result.trees.length - 1)], grammar, binarised) : undefined),
    [highlightTree, result, treeIdx, grammar, binarised]
  );

  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.querySelector('[data-latest="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [stepIdx]);

  const theory = cz ? GLL_THEORY_GUIDE.cz : GLL_THEORY_GUIDE.en;
  const countText = (c: number) => (c === Infinity ? '∞' : Number.isNaN(c) ? '?' : String(c));

  const resultText = result.accepted
    ? (cz
      ? `Υ obsahuje prvek (${grammar.startSymbol} ::= α, 0, k, ${tokens.length}): slovo patří do L(G). Derivačních stromů: ${countText(result.treeCount)}.`
      : `Υ contains an element (${grammar.startSymbol} ::= α, 0, k, ${tokens.length}): the word is in L(G). Derivation trees: ${countText(result.treeCount)}.`)
    : (cz
      ? `R je prázdná a Υ nemá prvek (${grammar.startSymbol} ::= α, 0, k, ${tokens.length}): slovo do L(G) nepatří.`
      : `R is empty and Υ has no element (${grammar.startSymbol} ::= α, 0, k, ${tokens.length}): the word is not in L(G).`);

  const cell: React.CSSProperties = { fontFamily: 'monospace', fontSize: '11px', padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <ReferenceBar
        references={GLL_PRIMARY_REFERENCES}
        lang={lang}
        extraRight={
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }} onClick={() => setShowTheory(s => !s)}>
            <BookOpen size={12} style={{ marginRight: '4px' }} />
            {cz ? (showTheory ? 'Skrýt teorii GLL' : 'Jak funguje GLL (teorie)') : showTheory ? 'Hide the GLL theory' : 'How GLL works (theory)'}
            {showTheory ? <ChevronDown size={12} style={{ marginLeft: '4px' }} /> : <ChevronRight size={12} style={{ marginLeft: '4px' }} />}
          </button>
        }
      />

      {showTheory && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div className="card-title" style={{ justifyContent: 'flex-start', gap: '8px' }}>
            <BookOpen size={18} color="var(--color-primary)" />
            <span>{theory.title}</span>
          </div>
          <p style={{ fontSize: '13px', margin: '8px 0 14px', lineHeight: 1.5 }}>{theory.overview}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            {theory.sections.map((sec, idx) => (
              <div key={idx} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--color-primary)' }}>{sec.heading}</h4>
                <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>{sec.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '15px' }}>{cz ? 'GLL — zobecněná analýza LL' : 'GLL — generalised LL parsing'}</span>
          <span className="badge badge-success">{cz ? 'libovolná CFG, i levá rekurze' : 'any CFG, left recursion too'}</span>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="text-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={cz ? 'Zadejte slovo k analýze (oddělené mezerami)...' : 'Enter a word to parse (space-separated)...'}
              style={{ width: '100%', fontSize: '13px', padding: '6px 10px' }}
              aria-label={cz ? 'Vstupní slovo' : 'Input word'}
            />
          </div>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}
            title={cz ? 'test(a, X, α) z článku 2010: alternativa se začne (a neterminál uprostřed pravidla zavolá), jen když a ∈ FIRST(α), nebo α ⇒* ε a a ∈ FOLLOW(X).' : 'test(a, X, α) of the 2010 paper: an alternative is started (and a non-terminal in the middle of a rule called) only if a ∈ FIRST(α), or α ⇒* ε and a ∈ FOLLOW(X).'}
          >
            <input type="checkbox" checked={lookahead} onChange={e => setLookahead(e.target.checked)} />
            {cz ? 'test výhledu (FIRST/FOLLOW)' : 'look-ahead test (FIRST/FOLLOW)'}
          </label>
        </div>
        <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--color-text-secondary)' }} data-testid="gll-stats">
          {cz
            ? `Deskriptorů: ${result.stats.descriptors} (opakovaných add: ${result.stats.duplicateAdds}) · uzlů GSS: ${result.stats.gssNodes}, hran: ${result.stats.gssEdges} · |P| = ${result.stats.popEntries} · |Υ| = ${result.stats.bsrElements} · derivačních stromů: ${countText(result.treeCount)}`
            : `Descriptors: ${result.stats.descriptors} (repeated adds: ${result.stats.duplicateAdds}) · GSS nodes: ${result.stats.gssNodes}, edges: ${result.stats.gssEdges} · |P| = ${result.stats.popEntries} · |Υ| = ${result.stats.bsrElements} · derivation trees: ${countText(result.treeCount)}`}
        </div>
        <TokenizedInputNote tokenized={tokenized} lang={lang} />
      </div>

      <div className="sim-sticky">
        <SimulatorControls stepIdx={stepIdx} total={total} isPlaying={isPlaying} speed={speed} lang={lang} onStep={setStepIdx} onTogglePlay={() => setIsPlaying(p => !p)} onSpeed={setSpeed} />
        <div className="card" style={{ padding: '10px 14px', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12.5px' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{cz ? `Krok ${stepIdx + 1} z ${total}: ` : `Step ${stepIdx + 1} of ${total}: `}</span>
              {processed ? (
                <span>
                  {cz ? 'z R se vybere deskriptor ' : 'the descriptor taken from R is '}
                  <code style={{ fontWeight: 700 }}>{formatDescriptor(processed)}</code>
                </span>
              ) : (
                <span>{cz ? `inicializace: u₀ = (L₀, 0), alternativy ${grammar.startSymbol} na pozici 0` : `initialisation: u₀ = (L₀, 0), the alternatives of ${grammar.startSymbol} at position 0`}</span>
              )}
            </div>
            {isLast && (
              <span className={`badge ${result.accepted ? 'badge-success' : 'badge-danger'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {result.accepted ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {result.accepted ? (cz ? 'Slovo PŘIJATO' : 'Word ACCEPTED') : cz ? 'Slovo ZAMÍTNUTO' : 'Word REJECTED'}
              </span>
            )}
          </div>
          <ol style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '12px', lineHeight: 1.4, maxHeight: '7.2em', overflowY: 'auto' }} data-testid="gll-actions">
            {step?.actions.map((a, k) => (
              <li key={k} style={{ color: a.type === 'mismatch' || a.type === 'testFail' || a.type === 'selectFail' ? 'var(--color-danger)' : a.type === 'bsrAdd' ? 'var(--color-success)' : undefined }}>
                {describeGLLAction(a, result, cz)}
              </li>
            ))}
            {step && step.actions.length === 0 && <li>{cz ? 'Nic se nepřidá.' : 'Nothing is added.'}</li>}
          </ol>
          {isLast && (
            <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: result.accepted ? 'var(--color-success)' : 'var(--color-danger)' }}>{resultText}</p>
          )}
          {result.truncated && (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--color-danger)' }}>
              {cz ? 'Výpočet byl zastaven po 20 000 deskriptorech; výsledek není úplný.' : 'The run was stopped after 20,000 descriptors; the result is incomplete.'}
            </p>
          )}
        </div>
      </div>

      <div className="gll-grid">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }} ref={activeRef}>
          <div className="card-title" style={{ justifyContent: 'flex-start', gap: '6px', marginBottom: '6px', fontSize: '13px' }}>
            <ListOrdered size={15} color="var(--color-primary)" />
            <span>{cz ? `R (čeká ${pending.length}) · |U| = ${uSize} · |P| = ${popNow.length}` : `R (${pending.length} waiting) · |U| = ${uSize} · |P| = ${popNow.length}`}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '130px', overflowY: 'auto' }}>
            {processed && (
              <div style={{ ...cell, borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary-subtle)' }} title={cz ? 'zpracovaný v tomto kroku' : 'processed in this step'}>
                ✓ {formatDescriptor(processed)}
              </div>
            )}
            {pending.map((d, k) => (
              <div key={d.id} style={{ ...cell, borderStyle: d.addedAt === stepIdx ? 'solid' : undefined, borderColor: d.addedAt === stepIdx ? 'var(--color-success)' : undefined }} title={k === 0 ? (cz ? 'vrchol R: zpracuje se jako další' : 'top of R: processed next') : undefined}>
                {k === 0 ? '▸ ' : ''}
                {formatDescriptor(d)}
              </div>
            ))}
            {pending.length === 0 && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{cz ? 'R je prázdná.' : 'R is empty.'}</span>}
          </div>
          <div className="card-title" style={{ justifyContent: 'flex-start', gap: '6px', marginBottom: '6px', fontSize: '13px', marginTop: '4px' }}>
            <Boxes size={15} color="var(--color-primary)" />
            <span>{cz ? `Množina BSR Υ (${bsrNow.length} prvků)` : `BSR set Υ (${bsrNow.length} elements)`}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '190px', overflowY: 'auto' }}>
            {bsrNow.map((e, k) => {
              const isNew = e.createdAt === stepIdx;
              const isTreeRoot = stepTree?.element === e;
              return (
                <div
                  key={k}
                  data-latest={isNew ? 'true' : undefined}
                  style={{ ...cell, fontWeight: e.kind === 'rule' ? 600 : 400, borderColor: isNew ? 'var(--color-success)' : isTreeRoot ? 'var(--color-primary)' : undefined, backgroundColor: isNew ? 'var(--color-success-subtle)' : undefined }}
                  title={e.kind === 'rule'
                    ? (cz ? `pravidlo ${e.production.lhs} ::= ${e.production.rhs.join(' ') || 'ε'} odvodí ${tokens.slice(e.i, e.j).join(' ') || 'ε'}; poslední symbol od pozice ${e.k}` : `the rule ${e.production.lhs} ::= ${e.production.rhs.join(' ') || 'ε'} derives ${tokens.slice(e.i, e.j).join(' ') || 'ε'}; its last symbol starts at ${e.k}`)
                    : (cz ? `předpona ${e.symbols.join(' ')} odvodí ${tokens.slice(e.i, e.j).join(' ')}; poslední symbol od pozice ${e.k}` : `the prefix ${e.symbols.join(' ')} derives ${tokens.slice(e.i, e.j).join(' ')}; its last symbol starts at ${e.k}`)}
                >
                  {formatBSRElement(e)}
                </div>
              );
            })}
            {bsrNow.length === 0 && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{cz ? 'Zatím prázdná.' : 'Empty so far.'}</span>}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="card-title" style={{ justifyContent: 'flex-start', gap: '6px', marginBottom: '6px', fontSize: '13px' }}>
            <Network size={15} color="var(--color-primary)" />
            <span>{cz ? 'Graf zásobníků GSS' : 'Graph-structured stack (GSS)'}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>
              {processed ? (cz ? `deskriptor u ${nodeName(processed.node)}` : `descriptor at ${nodeName(processed.node)}`) : ''}
              {popped.size > 0 ? (cz ? ` · pop ${[...popped].map(nodeName).join(', ')}` : ` · pop ${[...popped].map(nodeName).join(', ')}`) : ''}
            </span>
          </div>
          <GLLGSSVisualizer result={result} step={stepIdx} activeNode={processed?.node} poppedNodes={popped} lang={lang} height="370px" />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="card-title" style={{ justifyContent: 'flex-start', gap: '6px', marginBottom: '6px', fontSize: '13px', flexWrap: 'wrap' }}>
            <GitBranch size={15} color="var(--color-primary)" />
            <span>{cz ? 'Derivační strom' : 'Derivation tree'}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button type="button" className={`btn btn-sm ${treeMode === 'step' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 0 }} onClick={() => setTreeMode('step')}>
                  {cz ? 'Krok' : 'Step'}
                </button>
                <button type="button" className={`btn btn-sm ${treeMode === 'full' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 0 }} onClick={() => setTreeMode('full')} disabled={!result.accepted}>
                  {cz ? 'Celé slovo' : 'Whole word'}
                </button>
              </div>
              {treeMode === 'full' && result.trees.length > 1 && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} disabled={treeIdx === 0} onClick={() => setTreeIdx(t => t - 1)}>◀</button>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>
                    {`${treeIdx + 1}/${result.trees.length}${result.moreTrees ? (cz ? ` z ${countText(result.treeCount)}` : ` of ${countText(result.treeCount)}`) : ''}`}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} disabled={treeIdx >= result.trees.length - 1} onClick={() => setTreeIdx(t => t + 1)}>▶</button>
                </>
              )}
              {shownTree && <LatexExportButton getLatex={() => exportParseTreeToTikz(shownTree)} filename="gll_parse_tree.tex" lang={lang} title={cz ? 'Exportovat strom do LaTeXu (TikZ)' : 'Export the tree as LaTeX (TikZ)'} />}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px', minHeight: '1.4em' }}>
            {treeMode === 'step'
              ? stepTree
                ? (cz ? `Podstrom nejnovějšího prvku pravidla ${formatBSRElement(stepTree.element)}, přečtený z Υ v tomto kroku.` : `Subtree of the newest rule element ${formatBSRElement(stepTree.element)}, read from Υ at this step.`)
                : (cz ? 'Zatím žádný prvek pravidla v Υ.' : 'No rule element in Υ yet.')
              : (cz ? 'Strom celého slova přečtený z Υ shora od (S ::= α, 0, k, n).' : 'A tree of the whole word read from Υ top-down from (S ::= α, 0, k, n).')}
          </div>
          <div style={{ flex: 1, minHeight: '330px', display: 'flex' }}>
            {shownTree ? (
              <DerivationTreeVisualizer rootNode={shownTree} lang={lang} height="340px" />
            ) : (
              <div style={{ margin: 'auto', fontSize: '12px', color: 'var(--color-text-muted)' }}>{cz ? 'Strom zatím není.' : 'No tree yet.'}</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <Trees size={16} color="var(--color-primary)" />
          <span>{cz ? 'Sdílený zabalený les (SPPF) všech derivačních stromů' : 'Shared packed forest (SPPF) of all derivation trees'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', fontWeight: 400 }}>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button type="button" className={`btn btn-sm ${!binarised ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 0 }} onClick={() => setBinarised(false)} title={cz ? 'zabalený uzel = pravidlo a rozdělení úseku mezi všechny symboly (Tomita)' : 'packed node = a rule and a cut of the part among all its symbols (Tomita)'}>
                {cz ? 'po pravidlech' : 'by rules'}
              </button>
              <button type="button" className={`btn btn-sm ${binarised ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 0 }} onClick={() => setBinarised(true)} title={cz ? 'binarizovaný SPPF (Scott & Johnstone 2013): zabalený uzel má nejvýš dva potomky, předpony jsou mezilehlé uzly' : 'binarised SPPF (Scott & Johnstone 2013): a packed node has at most two children, prefixes are intermediate nodes'}>
                {cz ? 'binarizovaný' : 'binarised'}
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={cz ? 'Les z Earleyho tabulky (položky převedené na prvky BSR) musí být stejný jako les z GLL.' : 'The forest of the Earley chart (items turned into BSR elements) must be the same as the GLL one.'}>
              {cz ? 'zdroj:' : 'source:'}
              <select value={forestSource} onChange={e => setForestSource(e.target.value as 'gll' | 'earley')} style={{ fontSize: '12px' }}>
                <option value="gll">{cz ? 'množina BSR z GLL' : 'BSR set of GLL'}</option>
                <option value="earley">{cz ? 'tabulka Earley' : 'Earley chart'}</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={highlightTree} onChange={e => setHighlightTree(e.target.checked)} disabled={!result.accepted} />
              {cz ? `zvýraznit strom ${Math.min(treeIdx, Math.max(0, result.trees.length - 1)) + 1}` : `highlight tree ${Math.min(treeIdx, Math.max(0, result.trees.length - 1)) + 1}`}
            </label>
          </div>
        </div>
        {forest.root ? (
          <>
            <p style={{ margin: '4px 0 8px', fontSize: '12px', color: 'var(--color-text-secondary)' }} data-testid="forest-stats">
              {cz
                ? `Uzlů: ${forest.nodes.size} (zabalených ${[...forest.nodes.values()].filter(x => x.kind === 'packed').length}) · nejednoznačných uzlů: ${forest.ambiguous.length} · stromů v lese: ${countText(forest.treeCount)}. Jeden les zastupuje všechny stromy: společné podstromy jsou v něm jen jednou.`
                : `Nodes: ${forest.nodes.size} (${[...forest.nodes.values()].filter(x => x.kind === 'packed').length} packed) · ambiguous nodes: ${forest.ambiguous.length} · trees in the forest: ${countText(forest.treeCount)}. One forest stands for all trees: common subtrees occur in it once.`}
              {forest.ambiguous.length === 0 && (cz ? ' Slovo má jediný derivační strom, les je strom.' : ' The word has a single derivation tree, the forest is a tree.')}
            </p>
            {forest.truncated ? (
              <p style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{cz ? 'Les má víc než 600 uzlů, nezobrazuje se.' : 'The forest has more than 600 nodes and is not drawn.'}</p>
            ) : (
              <ForestVisualizer forest={forest} tokens={tokens} highlight={forestHighlight} lang={lang} height="460px" />
            )}
          </>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{cz ? 'Slovo nepatří do L(G): les je prázdný.' : 'The word is not in L(G): the forest is empty.'}</p>
        )}
      </div>
    </div>
  );
};
