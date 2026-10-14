import React, { useEffect, useMemo, useState } from 'react';
import { Grammar, Production } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { generateRecursiveDescent } from '../../core/codegen/recursiveDescent';
import { compilePl0, formatPcode } from '../../core/codegen/pl0Compiler';
import { runPcode } from '../../core/codegen/pcodeVm';
import { tokenizeInput } from '../../core/parser/inputTokenizer';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { simulateRecursiveDescent, CustomActionConfig } from '../../core/codegen/rdSimulator';
import { SymbolTable, RuleActionDefinition, suggestSymbolActions } from '../../core/codegen/symbolTable';
import { Language } from '../../i18n/translations';
import {
  Code2,
  Copy,
  Check,
  Download,
  ExternalLink,
  Play,
  AlertTriangle,
  Layers,
  Database,
  Sparkles,
  CheckCircle2,
  XCircle,
  Cpu,
  ArrowRight,
  BookOpen,
  Plus
} from 'lucide-react';

/** The KIV/FJP PL/0 interpreter (P-code virtual machine); a program is passed in the hash. */
export const PL0_INTERPRETER_URL = 'https://richardlipka.github.io/online-pl0-interpreter/';

/**
 * The interpreter next to this page: on home.zcu.cz the course pages hold the same version
 * as fjp/pl0 beside fjp/grammar-analyser, elsewhere (GitHub Pages, development) the GitHub copy.
 */
export function pl0InterpreterUrl(page: string = window.location.href): string {
  const url = new URL(page);
  return url.hostname === 'home.zcu.cz' ? new URL('../pl0/', url).href : PL0_INTERPRETER_URL;
}

type CodeLang = 'pl0' | 'oberon' | 'c' | 'python' | 'js' | 'pcode';
type SubTab = 'sim' | 'code' | 'symtab';

const FILE_NAMES: Record<CodeLang, string> = {
  pl0: 'parser.pl0',
  oberon: 'Parser.Mod',
  c: 'parser.c',
  python: 'parser.py',
  js: 'parser.js',
  pcode: 'parser.pcode.txt'
};

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link that opens the P-code with its input in the interpreter. */
export function interpreterLink(pcode: string, input: string, page?: string): string {
  return `${pl0InterpreterUrl(page)}#code_b64=${base64Url(pcode)}&input=${encodeURIComponent(input)}`;
}

interface RecursiveDescentViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  defaultInput?: string;
  lang: Language;
  onAttemptLL1?: () => void;
}

/**
 * Interactive Recursive Descent Simulator & Code Generator
 * Supports JavaScript, C, Python, Oberon, PL/0, and P-code.
 * Includes interactive call stack inspection, tree visualization,
 * and Symbol Table stack-of-stacks management with custom action commands.
 */
export const RecursiveDescentView: React.FC<RecursiveDescentViewProps> = ({
  grammar,
  analysis,
  llTable,
  defaultInput = '',
  lang,
  onAttemptLL1
}) => {
  const cz = lang === 'cz';
  const [subTab, setSubTab] = useState<SubTab>('sim');
  const [codeLang, setCodeLang] = useState<CodeLang>('js');
  const [inputText, setInputText] = useState(defaultInput);
  const [copied, setCopied] = useState(false);
  const [jsRunOutput, setJsRunOutput] = useState<string | null>(null);

  // Symbol table action rules configuration
  const [actionPreset, setActionPreset] = useState<'none' | 'auto' | 'custom'>('auto');
  const [ruleActions, setRuleActions] = useState<RuleActionDefinition[]>(() => suggestSymbolActions(grammar));

  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Update suggested actions when grammar changes
  useEffect(() => {
    if (actionPreset === 'auto') {
      setRuleActions(suggestSymbolActions(grammar));
    } else if (actionPreset === 'none') {
      setRuleActions([]);
    }
  }, [grammar, actionPreset]);

  // Code generator
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

  // P-code VM input
  const vmInput = useMemo(() => {
    if (!generated || !('gen' in generated)) return '';
    const charOf = new Map(generated.gen.tokens.map(t => [t.terminal, t.char]));
    return `${tokenized.tokens.map(tok => charOf.get(tok) ?? '?').join('')}$`;
  }, [generated, tokenized]);

  const run = useMemo(
    () => (generated && 'pcode' in generated && tokenized.unknown.length === 0 ? runPcode(generated.pcode, vmInput) : null),
    [generated, vmInput, tokenized]
  );

  // Interactive Simulator State
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(600);

  // Simulation execution with custom action hooks
  const simulation = useMemo(() => {
    if (!llTable.isLL1 || tokenized.unknown.length > 0) {
      return { accepted: false, steps: [], leftParse: [] };
    }
    const actionConfig: CustomActionConfig = {
      ruleActions: actionPreset !== 'none' ? ruleActions : undefined
    };
    return simulateRecursiveDescent(tokenized.tokens, grammar, analysis, actionConfig);
  }, [tokenized.tokens, grammar, analysis, llTable, actionPreset, ruleActions]);

  // Reset simulation step on new input
  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [tokenized.tokens, grammar, actionPreset, ruleActions]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  const currentStep = simulation.steps[currentStepIdx] ?? simulation.steps[simulation.steps.length - 1];

  // Run generated JS in browser
  const runGeneratedJs = () => {
    if (!generated || !('gen' in generated)) return;
    try {
      const code = generated.gen.js.replace('export function parse', 'function parse') + '\nreturn parse;';
      const parseFn = new Function(code)();
      const res = parseFn(vmInput);
      setJsRunOutput(res.output);
    } catch (err) {
      setJsRunOutput(`Execution error: ${String(err)}`);
    }
  };

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
            <button type="button" className="btn btn-accent" onClick={onAttemptLL1}>
              {cz ? 'Zkusit převést na LL(1)' : 'Try to transform to LL(1)'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!generated || 'error' in generated) {
    return (
      <div className="card">
        <div className="report-box danger">{generated && 'error' in generated ? generated.error : ''}</div>
      </div>
    );
  }

  const { gen, pcodeText } = generated;
  const text = codeLang === 'pcode' ? pcodeText : gen[codeLang];
  const fileName = FILE_NAMES[codeLang];

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
      {/* View Header */}
      <div className="card">
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="var(--color-primary)" />
            {cz ? 'Syntaktický analyzátor rekurzivním sestupem' : 'Recursive-descent parser'}
          </span>
        </div>
        <p className="hint-text">
          {cz
            ? 'Každý neterminál má proceduru. Ta podle aktuálního symbolu vstupu (množiny řídicích symbolů z tabulky LL(1)) vybere pravidlo, vypíše jeho číslo a rekurzivně volá další procedury nebo srovnává terminály. V této záložce můžete sledovat krokování se zásobníkem volání, rozkladovým stromem a tabulkou symbolů (zásobník zásobníků).'
            : 'Every non-terminal has a procedure. It chooses the rule by the current input symbol (director sets of LL(1)), outputs its number, and recursively calls procedures or matches terminals. Here you can inspect step-by-step execution with call stack, parse tree, and symbol table (stack of stacks).'}
        </p>

        {/* Subtabs selector */}
        <div className="rd-subtabs" style={{ marginTop: '12px' }}>
          <button
            type="button"
            className={`rd-subtab-btn ${subTab === 'sim' ? 'active' : ''}`}
            onClick={() => setSubTab('sim')}
          >
            <Play size={15} />
            <span>{cz ? 'Vizuální simulátor a zásobník' : 'Visual simulator & stack'}</span>
          </button>
          <button
            type="button"
            className={`rd-subtab-btn ${subTab === 'code' ? 'active' : ''}`}
            onClick={() => setSubTab('code')}
          >
            <Code2 size={15} />
            <span>{cz ? 'Generovaný kód (JS, C, Python, PL/0...)' : 'Generated code (JS, C, Python, PL/0...)'}</span>
          </button>
          <button
            type="button"
            className={`rd-subtab-btn ${subTab === 'symtab' ? 'active' : ''}`}
            onClick={() => setSubTab('symtab')}
          >
            <Database size={15} />
            <span>{cz ? 'Tabulka symbolů a uživatelské akce' : 'Symbol table & custom commands'}</span>
          </button>
        </div>
      </div>

      {/* SUBTAB 1: Visual Simulator */}
      {subTab === 'sim' && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={17} color="var(--color-primary)" />
              {cz ? 'Krokování rekurzivního sestupu' : 'Recursive descent step simulator'}
            </span>
            {currentStep && (
              <span className="badge badge-primary">
                {cz ? `Krok ${currentStep.step + 1} / ${simulation.steps.length}` : `Step ${currentStep.step + 1} / ${simulation.steps.length}`}
              </span>
            )}
          </div>

          {/* Input word input */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              className="grammar-textarea"
              style={{ minHeight: 'unset', height: '38px', padding: '6px 12px' }}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={(cz ? 'Slovo: tokeny oddělené mezerami' : 'Word: tokens separated by spaces') + (defaultInput ? ` (např. ${defaultInput})` : '')}
              aria-label={cz ? 'Slovo' : 'Word'}
            />
          </div>
          <TokenizedInputNote tokenized={tokenized} lang={lang} />

          {/* Verdict Banner */}
          {simulation.steps.length > 0 && (
            <div
              className={`report-box ${simulation.accepted ? 'success' : simulation.errorMessage ? 'danger' : 'info'}`}
              style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {simulation.accepted ? (
                <CheckCircle2 size={16} />
              ) : simulation.errorMessage ? (
                <XCircle size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              <span style={{ fontWeight: 600 }}>
                {simulation.accepted
                  ? (cz
                    ? `Slovo přijato v ${simulation.steps.length} krocích! Levý rozklad: [${simulation.leftParse.join(', ')}]`
                    : `Word accepted in ${simulation.steps.length} steps! Left parse: [${simulation.leftParse.join(', ')}]`)
                  : simulation.errorMessage
                    ? (cz ? simulation.errorMessageCz || simulation.errorMessage : simulation.errorMessage)
                    : (cz ? 'Probíhá analýza...' : 'Parsing in progress...')}
              </span>
            </div>
          )}

          {/* VCR Simulator Controls */}
          {simulation.steps.length > 0 && (
            <SimulatorControls
              stepIdx={currentStepIdx}
              total={simulation.steps.length}
              isPlaying={isPlaying}
              speed={playSpeed}
              lang={lang}
              onStep={idx => {
                setIsPlaying(false);
                setCurrentStepIdx(idx);
              }}
              onTogglePlay={() => {
                if (!isPlaying && currentStepIdx >= simulation.steps.length - 1) setCurrentStepIdx(0);
                setIsPlaying(p => !p);
              }}
              onSpeed={setPlaySpeed}
            />
          )}

          {/* Input Streamer: Consumed, Active Lookahead, Remaining */}
          {currentStep && (
            <div className="rd-streamer">
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                {cz ? 'Vstupní páska:' : 'Input stream:'}
              </span>
              {/* Consumed tokens */}
              {currentStep.consumedTokens.map((tok, i) => (
                <span key={`cons_${i}`} className="rd-token-consumed" title={cz ? 'Zpracovaný token' : 'Consumed token'}>
                  {tok}
                </span>
              ))}
              {/* Current Lookahead */}
              <span className="rd-token-lookahead" title={cz ? 'Aktuální řídicí symbol (lookahead)' : 'Current lookahead symbol'}>
                <span>sym =</span>
                <code>{currentStep.currentLookahead}</code>
              </span>
              {/* Remaining tokens */}
              {currentStep.remainingTokens.slice(1).map((tok, i) => (
                <span key={`rem_${i}`} className="rd-token-remaining">
                  {tok}
                </span>
              ))}
            </div>
          )}

          {/* Action Step Note */}
          {currentStep && (
            <div
              style={{
                padding: '8px 12px',
                marginBottom: '12px',
                backgroundColor: 'var(--color-bg-elevated)',
                borderLeft: '4px solid var(--color-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px'
              }}
            >
              <strong>{cz ? 'Krok' : 'Step'} {currentStep.step + 1}: </strong>
              <span>{cz ? currentStep.actionDescriptionCz : currentStep.actionDescription}</span>
            </div>
          )}

          {/* Main Simulation Grid: Call Stack & Branch vs Parse Tree */}
          {currentStep && (
            <div className="rd-sim-grid">
              {/* Left Column: Call Stack & Active Function Branch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Simulated Call Stack */}
                <div className="rd-panel">
                  <div className="rd-panel-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} color="var(--color-primary)" />
                      {cz ? 'Simulovaný zásobník volání (aktivační záznamy)' : 'Simulated call stack (activation records)'}
                    </span>
                    <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                      {cz ? `Hloubka: ${currentStep.callStack.length}` : `Depth: ${currentStep.callStack.length}`}
                    </span>
                  </div>

                  <div className="rd-callstack-list">
                    {currentStep.callStack.length === 0 ? (
                      <div className="hint-text" style={{ padding: '12px', textAlign: 'center' }}>
                        {cz ? 'Zásobník je prázdný (hlavní program main skončil)' : 'Stack is empty (main program finished)'}
                      </div>
                    ) : (
                      currentStep.callStack.map((frame, idx) => {
                        const isTop = idx === currentStep.callStack.length - 1;
                        return (
                          <div key={frame.id} className={`rd-frame-card ${isTop ? 'active' : ''}`}>
                            <div className="rd-frame-header">
                              <span className="rd-frame-title">
                                {isTop && <span style={{ color: 'var(--color-accent, #8b5cf6)', marginRight: '4px' }}>▶</span>}
                                {frame.functionName}()
                              </span>
                              <span className="rd-frame-depth">
                                {isTop ? (cz ? 'vrchol' : 'top') : `#${frame.depth}`}
                              </span>
                            </div>
                            {frame.rule && (
                              <div className="rd-frame-rule">
                                <strong>{cz ? 'Pravidlo' : 'Rule'} {frame.rule.id}: </strong>
                                <span>{frame.rule.lhs} → {frame.rule.rhs.join(' ') || 'ε'}</span>
                              </div>
                            )}
                            {frame.rule && frame.rule.rhs.length > 0 && (
                              <div className="rd-frame-rhs">
                                {frame.rule.rhs.map((sym, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className={`rd-rhs-symbol ${isTop && sIdx === frame.rhsIndex ? 'current' : ''}`}
                                    title={isTop && sIdx === frame.rhsIndex ? (cz ? 'Právě zpracovávaný symbol' : 'Currently expanding symbol') : undefined}
                                  >
                                    {sym}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Active Branch Tracker */}
                <div className="rd-panel">
                  <div className="rd-panel-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Code2 size={15} color="var(--color-primary)" />
                      {cz ? 'Aktivní funkce a větev' : 'Active function & branch'}
                    </span>
                    <span className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                      {currentStep.activeFunction}()
                    </span>
                  </div>

                  <div className="rd-branch-box">
                    <div><code>function {currentStep.activeFunction}() &#123;</code></div>
                    {grammar.productions
                      .filter(p => p.lhs === currentStep.activeFunction)
                      .map(p => {
                        const isChosen = currentStep.branchChoice?.rule.id === p.id;
                        const predictList = [...(analysis.predict1.get(p.id) || [])];
                        return (
                          <div
                            key={p.id}
                            className={`rd-branch-line ${isChosen ? 'rd-branch-active' : ''}`}
                            style={{ paddingLeft: '16px', margin: '2px 0' }}
                          >
                            <span>if (sym ∈ &#123;{predictList.join(', ')}&#125;) &#123; // {p.id}: {p.lhs} → {p.rhs.join(' ') || 'ε'}</span>
                            {isChosen && <span style={{ marginLeft: '6px', fontWeight: 800 }}>← {cz ? 'ZVOLENÁ VĚTEV' : 'ACTIVE BRANCH'}</span>}
                          </div>
                        );
                      })}
                    <div style={{ paddingLeft: '16px', color: 'var(--color-text-muted)' }}>else &#123; error(); &#125;</div>
                    <div><code>&#125;</code></div>
                  </div>
                </div>
              </div>

              {/* Right Column: Parse Tree Visualizer */}
              <div className="rd-panel" style={{ minHeight: '440px' }}>
                <div className="rd-panel-title">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} color="var(--color-primary)" />
                    {cz ? 'Generovaný rozkladový strom (fialově: aktivní větev)' : 'Derivation parse tree (active branch in purple)'}
                  </span>
                </div>
                <DerivationTreeVisualizer
                  rootNode={currentStep.parseTree}
                  height="420px"
                  filename="rd_parse_tree"
                  lang={lang}
                />
              </div>
            </div>
          )}

          {/* Symbol Table Visualizer ("Stack of Stacks") */}
          {currentStep && (
            <div className="rd-panel" style={{ marginTop: '16px' }}>
              <div className="rd-panel-title">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={16} color="var(--color-accent, #8b5cf6)" />
                  {cz ? 'Tabulka symbolů: Zásobník lexikálních rozsahů (Stack of Stacks)' : 'Symbol Table: Lexical scope stack (Stack of Stacks)'}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="badge badge-secondary">
                    {cz ? `Aktivní bloky: ${currentStep.symbolTableSnapshot.scopeStack.length}` : `Active scopes: ${currentStep.symbolTableSnapshot.scopeStack.length}`}
                  </span>
                  <span className="badge badge-primary">
                    {cz ? `Symboly: ${currentStep.symbolTableSnapshot.totalActiveSymbols}` : `Symbols: ${currentStep.symbolTableSnapshot.totalActiveSymbols}`}
                  </span>
                </div>
              </div>

              <p className="hint-text" style={{ margin: '0 0 10px' }}>
                {cz
                  ? 'Zásobník zásobníků: Vnější zásobník představuje vnořené bloky (úrovně zanoření). Každý blok má svůj vnitřní zásobník deklarovaných identifikátorů, jejich typů a uživatelských metadat. Při vyhledávání se postupuje od vrcholu k bazi (lexikální překrývání).'
                  : 'Stack of stacks: The outer stack represents nested lexical scopes (nesting levels). Each scope contains its own stack of declared identifiers, types, and metadata. Lookups proceed from top to bottom (lexical shadowing).'}
              </p>

              <div className="rd-symtab-container">
                <div className="rd-scope-stack">
                  {currentStep.symbolTableSnapshot.scopeStack.map((scope, sIdx) => {
                    const isTop = sIdx === currentStep.symbolTableSnapshot.scopeStack.length - 1;
                    return (
                      <div key={scope.id} className={`rd-scope-card ${isTop ? 'active-top' : ''}`}>
                        <div className="rd-scope-header">
                          <span className="rd-scope-name">
                            <Database size={13} color={isTop ? 'var(--color-accent, #8b5cf6)' : 'var(--color-text-secondary)'} />
                            <span>{scope.name}</span>
                            {isTop && (
                              <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                                {cz ? 'aktuální blok' : 'current scope'}
                              </span>
                            )}
                          </span>
                          <span className="rd-scope-badge">
                            {cz ? `Úroveň ${scope.level}` : `Level ${scope.level}`} · {scope.symbols.length} {cz ? 'položek' : 'symbols'}
                          </span>
                        </div>

                        {scope.symbols.length === 0 ? (
                          <div className="hint-text" style={{ fontStyle: 'italic', fontSize: '11px', padding: '4px' }}>
                            {cz ? '(žádné symboly deklarované v tomto bloku)' : '(no symbols declared in this scope)'}
                          </div>
                        ) : (
                          <table className="rd-symbol-table">
                            <thead>
                              <tr>
                                <th>{cz ? 'Název symbolu' : 'Symbol name'}</th>
                                <th>{cz ? 'Typ' : 'Type'}</th>
                                <th>{cz ? 'Druh' : 'Kind'}</th>
                                <th>{cz ? 'Vlastní data' : 'Custom data'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scope.symbols.map((sym, symIdx) => {
                                const isLatest = currentStep.symbolTableSnapshot.lastModifiedSymbol?.name === sym.name;
                                return (
                                  <tr key={`${sym.name}_${symIdx}`} className={isLatest ? 'rd-symbol-new' : ''}>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                      {sym.name}
                                    </td>
                                    <td>
                                      <span className="rd-type-tag">{sym.type}</span>
                                    </td>
                                    <td>
                                      <span className="rd-kind-tag">{sym.kind}</span>
                                    </td>
                                    <td>
                                      {Object.entries(sym.customData).map(([k, v]) => (
                                        <span key={k} className="rd-meta-pill">
                                          {k}: {String(v)}
                                        </span>
                                      ))}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: Generated Code */}
      {subTab === 'code' && (
        <div className="card">
          <div className="rd-toolbar">
            <div className="construction-modes" role="group" aria-label={cz ? 'Jazyk' : 'Language'}>
              {(['js', 'pl0', 'oberon', 'c', 'python', 'pcode'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  className={`btn ${codeLang === l ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={codeLang === l}
                  onClick={() => setCodeLang(l)}
                >
                  {l === 'js'
                    ? 'JavaScript'
                    : l === 'pl0'
                      ? 'PL/0'
                      : l === 'oberon'
                        ? 'Oberon'
                        : l === 'c'
                          ? 'C'
                          : l === 'python'
                            ? 'Python'
                            : (cz ? 'P-kód' : 'P-code')}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {codeLang === 'js' && (
                <button type="button" className="btn btn-primary" onClick={runGeneratedJs} title={cz ? 'Spustit v prohlížeči' : 'Run in browser'}>
                  <Play size={13} />
                  <span>{cz ? 'Spustit JS v prohlížeči' : 'Run JS in browser'}</span>
                </button>
              )}
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
            {codeLang === 'js'
              ? (cz
                ? 'Moderní JavaScript (ES6+): Čistý rekurzivní sestup, který lze spustit v Node.js (CLI) i v prohlížeči. Podporuje volitelné sémantické háčky (hooks: onEnter, onRule, onMatch, onExit, symTab).'
                : 'Modern JavaScript (ES6+): Pure recursive-descent parser runnable in Node.js (CLI) and in the browser. Supports optional semantic hooks (onEnter, onRule, onMatch, onExit, symTab).')
              : codeLang === 'pl0'
                ? (cz
                  ? 'PL/0 podle Wirtha se znakovým vstupem a výstupem: ? x přečte znak, ! v vypíše znak. Procedury jsou vnořené podle volání (DFS).'
                  : 'Wirth\'s PL/0 with character input and output: ? x reads character, ! v writes. Procedures nested along calls.')
                : codeLang === 'oberon'
                  ? (cz
                    ? 'Oberon-07 s moduly In a Out (Oakwood): In.Char čte znak, Out.Int a Out.String vypisují.'
                    : 'Oberon-07 with modules In and Out (Oakwood): In.Char reads, Out.Int and Out.String write.')
                  : codeLang === 'c'
                    ? (cz
                      ? 'C99 se standardní knihovnou stdio: getchar čte znak, printf vypisuje (gcc -std=c99 parser.c). Funkce mají dopředné prototypy.'
                      : 'C99 with standard library stdio: getchar reads, printf writes (gcc -std=c99 parser.c). Functions declared with prototypes.')
                    : codeLang === 'python'
                      ? (cz
                        ? 'Python 3: vstup se čte ze standardního vstupu (python parser.py < vstup). Pravidla se vybírají pomocí if/elif.'
                        : 'Python 3: input read from stdin (python parser.py < input). Rules chosen with if/elif.')
                      : (cz
                        ? 'P-kód programu v PL/0 přeložený jako ve Wirthově překladači (pro interpret PL/0 z předmětu KIV/FJP).'
                        : 'P-code of the PL/0 program compiled as by Wirth\'s compiler (for the KIV/FJP course interpreter).')}
          </p>

          <pre className="rd-code">{text}</pre>

          {/* JS In-Browser Execution Output */}
          {codeLang === 'js' && jsRunOutput && (
            <div className={`report-box ${jsRunOutput.includes('OK') ? 'success' : 'danger'}`} style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                {cz ? 'Výsledek spuštění JavaScriptu v prohlížeči:' : 'JavaScript execution result in browser:'}
              </div>
              <pre className="rd-output">{jsRunOutput}</pre>
            </div>
          )}

          {/* PL/0 external link */}
          {codeLang === 'pl0' && (
            <a className="btn btn-primary rd-link" href={interpreterLink(pcodeText, vmInput)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <span>{cz ? 'Otevřít v interpretu PL/0 (P-kód a vstup)' : 'Open in the PL/0 interpreter (P-code and input)'}</span>
            </a>
          )}
        </div>
      )}

      {/* SUBTAB 3: Symbol Table & Custom Commands Guide */}
      {subTab === 'symtab' && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="var(--color-primary)" />
              {cz ? 'Tabulka symbolů a uživatelské příkazy: Analýza a automatizace' : 'Symbol table & custom commands: Analysis and automation'}
            </span>
          </div>

          <div className="notice-box info" style={{ marginBottom: '16px' }}>
            <div className="notice-title">
              <Sparkles size={16} />
              <span>{cz ? 'Doporučený přístup pro provádění uživatelských příkazů' : 'Recommended approach for executing custom commands'}</span>
            </div>
            <p style={{ margin: '6px 0', fontSize: '13px', lineHeight: 1.55 }}>
              {cz
                ? 'V teorii překladačů existují tři hlavní přístupy k sémantickým akcím při syntaktické analýze:'
                : 'In compiler construction theory, three primary paradigms exist for semantic actions during syntax analysis:'}
            </p>
            <ul style={{ margin: '4px 0 8px 20px', fontSize: '12.5px', lineHeight: 1.6 }}>
              <li>
                <strong>{cz ? '1. Vložené sémantické akce přímo v gramatice (Translation Schemes / Yacc / ANTLR style):' : '1. Inlined semantic actions in grammar rules (Translation Schemes / Yacc / ANTLR style):'}</strong>{' '}
                {cz
                  ? 'Zápis ve stylu A -> B { symTab.addSymbol($2); } C. Výhodou je přímé provázání s pravidlem, nevýhodou je narušení čisté bezkontextové gramatiky pro LL(1) kontrolu a horší přenositelnost mezi cílovými jazyky.'
                  : 'Syntax like A -> B { symTab.addSymbol($2); } C. Directly tied to productions, but pollutes the pure CFG for LL(1) analysis and hinders cross-language portability.'}
              </li>
              <li>
                <strong>{cz ? '2. Oddělené sémantické háčky (Event-driven Visitor / Listener Hooks):' : '2. Decoupled Semantic Hooks (Event-driven Visitor / Listener Hooks):'}</strong>{' '}
                {cz
                  ? 'Generovaný kód volá obslužné metody onEnter, onRule, onMatch, onExit. Gramatika zůstává 100% čistá a sémantický analyzátor je nezávislý modul.'
                  : 'Generated parser invokes callback hooks onEnter, onRule, onMatch, onExit. Grammar remains 100% pure CFG and semantics is cleanly decoupled.'}
              </li>
              <li>
                <strong>{cz ? '3. Deklarativní pravidlová tabulka akcí (Doporučený přístup pro výuku a automatizaci):' : '3. Declarative Rule-Action Mapping (Recommended for Education & Automation):'}</strong>{' '}
                {cz
                  ? 'Uživatel nebo automatický analyzátor namapuje na pravidla gramatiky deklarativní akce (Vstup do bloku, Opuštění bloku, Přidání symbolu, Označení typu). Nevyžaduje ruční programování a umožňuje 100% vizualizaci.'
                  : 'The user or an automatic analyzer maps high-level actions (Enter Scope, Exit Scope, Add Symbol, Mark Type) to productions. Maximizes automation without boilerplate.'}
              </li>
            </ul>
          </div>

          {/* Action Automation Configuration */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{cz ? 'Režim automatizace akcí:' : 'Action automation mode:'}</span>
              <div className="construction-modes" role="group">
                <button
                  type="button"
                  className={`btn ${actionPreset === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActionPreset('auto')}
                >
                  <Sparkles size={13} />
                  <span>{cz ? 'Auto-detekce deklarací' : 'Auto-detect declarations'}</span>
                </button>
                <button
                  type="button"
                  className={`btn ${actionPreset === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActionPreset('none')}
                >
                  <span>{cz ? 'Vypnuto (čistá syntaxe)' : 'Disabled (pure syntax)'}</span>
                </button>
                <button
                  type="button"
                  className={`btn ${actionPreset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActionPreset('custom')}
                >
                  <span>{cz ? 'Uživatelské akce' : 'Custom actions'}</span>
                </button>
              </div>
            </div>

            {actionPreset === 'custom' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const firstRule = grammar.productions[0];
                  if (!firstRule) return;
                  setRuleActions(curr => [
                    ...curr,
                    {
                      ruleId: firstRule.id,
                      actionType: 'addSymbol',
                      symbolName: 'x',
                      symbolType: 'int',
                      description: 'Custom symbol declaration'
                    }
                  ]);
                }}
              >
                <Plus size={13} />
                <span>{cz ? 'Přidat pravidlovou akci' : 'Add rule action'}</span>
              </button>
            )}
          </div>

          {/* Rule Actions Table */}
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>{cz ? 'Pravidlo' : 'Rule'}</th>
                  <th>{cz ? 'Produkce gramatiky' : 'Grammar production'}</th>
                  <th style={{ width: '180px' }}>{cz ? 'Typ akce' : 'Action type'}</th>
                  <th>{cz ? 'Parametry / Popis' : 'Parameters / Description'}</th>
                  {actionPreset === 'custom' && <th style={{ width: '80px' }}>{cz ? 'Smazat' : 'Delete'}</th>}
                </tr>
              </thead>
              <tbody>
                {grammar.productions.map(p => {
                  const acts = ruleActions.filter(a => a.ruleId === p.id);
                  if (acts.length === 0 && actionPreset !== 'custom') return null;
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{p.id}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="sym-nt">{p.lhs}</span> → {p.rhs.join(' ') || 'ε'}
                      </td>
                      <td>
                        {acts.length === 0 ? (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{cz ? 'bez akce' : 'none'}</span>
                        ) : (
                          acts.map((act, i) => (
                            <span
                              key={i}
                              className={`badge ${act.actionType === 'enterScope' ? 'badge-accent' : act.actionType === 'exitScope' ? 'badge-warning' : 'badge-primary'}`}
                              style={{ marginRight: '4px' }}
                            >
                              {act.actionType}
                            </span>
                          ))
                        )}
                      </td>
                      <td>
                        {acts.map((act, i) => (
                          <div key={i} style={{ fontSize: '12px' }}>
                            {act.description || (act.actionType === 'addSymbol' ? `Add symbol '${act.symbolName}' [${act.symbolType}]` : `Scope action`)}
                          </div>
                        ))}
                      </td>
                      {actionPreset === 'custom' && (
                        <td>
                          {acts.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '10.5px' }}
                              onClick={() => setRuleActions(curr => curr.filter(a => a.ruleId !== p.id))}
                            >
                              {cz ? 'Odebrat' : 'Remove'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
