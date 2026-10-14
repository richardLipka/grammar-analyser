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
import {
  SymbolTable,
  RuleActionDefinition,
  suggestSymbolActions,
  DeclarationKeywordConfig,
  DEFAULT_KEYWORD_CONFIG
} from '../../core/codegen/symbolTable';
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
  Plus,
  SlidersHorizontal,
  RotateCcw,
  Settings2,
  Info
} from 'lucide-react';
import { RD_SAMPLE_GRAMMARS } from '../../core/presets/rdSampleGrammars';

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
  onLoadGrammar?: (grammarText: string, sampleInput?: string) => void;
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
  onAttemptLL1,
  onLoadGrammar
}) => {
  const cz = lang === 'cz';
  const [subTab, setSubTab] = useState<SubTab>('sim');
  const [codeLang, setCodeLang] = useState<CodeLang>('js');
  const [inputText, setInputText] = useState(defaultInput);
  const [copied, setCopied] = useState(false);
  const [jsRunOutput, setJsRunOutput] = useState<string | null>(null);

  // Editable keywords for automated declaration & scope detection
  const [keywordConfig, setKeywordConfig] = useState<DeclarationKeywordConfig>(DEFAULT_KEYWORD_CONFIG);
  const [scopeOpenersInput, setScopeOpenersInput] = useState(DEFAULT_KEYWORD_CONFIG.scopeOpeners.join(', '));
  const [scopeClosersInput, setScopeClosersInput] = useState(DEFAULT_KEYWORD_CONFIG.scopeClosers.join(', '));
  const [declKeywordsInput, setDeclKeywordsInput] = useState(DEFAULT_KEYWORD_CONFIG.declKeywords.join(', '));
  const [typeKeywordsInput, setTypeKeywordsInput] = useState(DEFAULT_KEYWORD_CONFIG.typeKeywords.join(', '));
  const [idSymbolsInput, setIdSymbolsInput] = useState(DEFAULT_KEYWORD_CONFIG.idSymbols.join(', '));
  const [showKeywordEditor, setShowKeywordEditor] = useState(true);

  const [showPureSymTab, setShowPureSymTab] = useState(false);

  // Declarative rule-action mapping table
  const [actionPreset, setActionPreset] = useState<'none' | 'auto' | 'custom'>('auto');
  const [ruleActions, setRuleActions] = useState<RuleActionDefinition[]>(() =>
    suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG)
  );

  const isPureSyntaxMode = ruleActions.filter(a => a.actionType !== 'none').length === 0;

  useEffect(() => setInputText(defaultInput), [defaultInput]);

  // Re-generate rule actions whenever grammar or auto preset is applied
  useEffect(() => {
    if (actionPreset === 'auto') {
      setRuleActions(suggestSymbolActions(grammar, keywordConfig));
    } else if (actionPreset === 'none') {
      setRuleActions([]);
    }
  }, [grammar, actionPreset]);

  // Apply user-edited keywords and re-scan productions
  const applyKeywordChanges = () => {
    const parseList = (str: string) => str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const updatedCfg: DeclarationKeywordConfig = {
      scopeOpeners: parseList(scopeOpenersInput),
      scopeClosers: parseList(scopeClosersInput),
      declKeywords: parseList(declKeywordsInput),
      typeKeywords: parseList(typeKeywordsInput),
      idSymbols: parseList(idSymbolsInput)
    };
    setKeywordConfig(updatedCfg);
    setRuleActions(suggestSymbolActions(grammar, updatedCfg));
    setActionPreset('auto');
  };

  // Reset keywords back to defaults
  const resetKeywordsToDefault = () => {
    setScopeOpenersInput(DEFAULT_KEYWORD_CONFIG.scopeOpeners.join(', '));
    setScopeClosersInput(DEFAULT_KEYWORD_CONFIG.scopeClosers.join(', '));
    setDeclKeywordsInput(DEFAULT_KEYWORD_CONFIG.declKeywords.join(', '));
    setTypeKeywordsInput(DEFAULT_KEYWORD_CONFIG.typeKeywords.join(', '));
    setIdSymbolsInput(DEFAULT_KEYWORD_CONFIG.idSymbols.join(', '));
    setKeywordConfig(DEFAULT_KEYWORD_CONFIG);
    setRuleActions(suggestSymbolActions(grammar, DEFAULT_KEYWORD_CONFIG));
    setActionPreset('auto');
  };

  // Directly update or add a declarative action for a rule
  const updateRuleAction = (ruleId: number, patch: Partial<RuleActionDefinition>) => {
    setActionPreset('custom');
    setRuleActions(curr => {
      const existingIdx = curr.findIndex(a => a.ruleId === ruleId);
      if (existingIdx >= 0) {
        const next = [...curr];
        next[existingIdx] = { ...next[existingIdx], ...patch };
        return next;
      } else {
        return [...curr, { ruleId, actionType: patch.actionType || 'none', ...patch }];
      }
    });
  };

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

        {/* Sample Grammars Quick-Selector */}
        {onLoadGrammar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <BookOpen size={14} color="var(--color-primary)" />
              {cz ? 'Ukázkové gramatiky pro rekurzivní sestup a scoping:' : 'Sample grammars for recursive descent & scoping:'}
            </span>
            <select
              className="grammar-textarea"
              style={{ minHeight: 'unset', height: '32px', padding: '4px 10px', fontSize: '12px', width: 'auto', flex: 1, maxWidth: '440px' }}
              defaultValue=""
              onChange={e => {
                const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === e.target.value);
                if (sample) {
                  onLoadGrammar(sample.grammarText, sample.sampleInput);
                  setInputText(sample.sampleInput);
                }
              }}
            >
              <option value="" disabled>{cz ? 'Vyberte ukázkovou gramatiku...' : 'Select a sample grammar...'}</option>
              {RD_SAMPLE_GRAMMARS.map(s => (
                <option key={s.id} value={s.id}>
                  {cz ? s.nameCz : s.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}
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

          {/* Declarative Symbol Table Actions Status Banner */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', margin: '4px 0 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className={`badge ${isPureSyntaxMode ? 'badge-secondary' : 'badge-accent'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Database size={12} />
                {isPureSyntaxMode
                  ? (cz ? 'Čistý syntaktický režim: Tabulka symbolů není aktivní' : 'Pure syntax mode: Symbol table inactive')
                  : (cz
                    ? `Deklarativní akce tabulky symbolů: ${ruleActions.filter(a => a.actionType !== 'none').length} aktivních pravidel`
                    : `Declarative Symbol Table Actions: ${ruleActions.filter(a => a.actionType !== 'none').length} active rules`)}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '3px 8px', fontSize: '11.5px', gap: '4px' }}
              onClick={() => setSubTab('symtab')}
            >
              <Settings2 size={12} />
              <span>{cz ? 'Upravit pravidla a klíčová slova' : 'Edit rules & keywords'}</span>
            </button>
          </div>

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

              {/* Pure syntax mode notice if no declarations exist */}
              {isPureSyntaxMode && (
                <div className="report-box info" style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Info size={16} />
                    <span style={{ fontSize: '12px' }}>
                      {cz
                        ? 'Čistý syntaktický režim: V této gramatice nebyly nalezeny žádné deklarace proměnných ani bloky. Rekurzivní sestup funguje plně bez tabulky symbolů.'
                        : 'Pure syntactic mode: No variable declarations or block scopes were detected in this grammar. Recursive descent operates fully without a symbol table.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowPureSymTab(s => !s)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    {showPureSymTab ? (cz ? 'Skrýt prázdný zásobník' : 'Hide empty stack') : (cz ? 'Zobrazit prázdný zásobník' : 'Show empty stack')}
                  </button>
                </div>
              )}

              {(!isPureSyntaxMode || showPureSymTab) && (
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
              )}
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

      {/* SUBTAB 3: Declarative Rule-Action Table & Stack-of-Stacks Automation */}
      {subTab === 'symtab' && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="var(--color-primary)" />
              {cz
                ? 'Deklarativní tabulka akcí pravidel (Automatizace zásobníku zásobníků)'
                : 'Declarative Rule-Action Table (Stack of Stacks Automation)'}
            </span>
          </div>

          <div className="notice-box info" style={{ marginBottom: '16px' }}>
            <div className="notice-title">
              <Sparkles size={16} />
              <span>
                {cz
                  ? 'Přístup 3: Deklarativní přiřazení sémantických akcí k pravidlům gramatiky'
                  : 'Approach 3: Declarative Semantic Action Mapping for Grammar Rules'}
              </span>
            </div>
            <p style={{ margin: '6px 0', fontSize: '13px', lineHeight: 1.55 }}>
              {cz
                ? 'Každému pravidlu gramatiky můžete přiřadit deklarativní akci: Vstup do bloku (Enter Scope), Konec bloku (Exit Scope), Deklarace symbolu (Add Symbol) nebo Označení typu (Mark Type). Tyto akce automaticky řídí tabulku symbolů ("zásobník zásobníků") při běhu rekurzivního sestupu.'
                : 'Assign declarative actions to each grammar rule: Enter Scope, Exit Scope, Add Symbol, or Mark Type. These actions automatically drive the Symbol Table ("stack of stacks") during recursive descent execution.'}
            </p>
          </div>

          {/* Editable Keyword Configuration Box */}
          <div className="rd-keywords-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SlidersHorizontal size={15} color="var(--color-primary)" />
                {cz ? 'Klíčová slova pro automatickou detekci deklarací a rozsahů' : 'Keywords for automated declaration & scope detection'}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                onClick={() => setShowKeywordEditor(s => !s)}
              >
                {showKeywordEditor ? (cz ? 'Skrýt nastavení' : 'Hide settings') : (cz ? 'Zobrazit nastavení' : 'Show settings')}
              </button>
            </div>

            {showKeywordEditor && (
              <>
                <p className="hint-text" style={{ margin: '6px 0 0', fontSize: '12px' }}>
                  {cz
                    ? 'Zadejte klíčová slova oddělená čárkami. Analyzátor podle nich prohledá pravidla gramatiky a automaticky vygeneruje odpovídající akce pro tabulku symbolů.'
                    : 'Enter comma-separated keywords. The analyzer will inspect productions using these keywords to automatically generate symbol table actions.'}
                </p>

                <div className="rd-keywords-grid">
                  <div className="rd-keyword-field">
                    <label className="rd-keyword-label">{cz ? '1. Otevření bloku / rozsahu (scope openers):' : '1. Scope openers (new block):'}</label>
                    <input
                      type="text"
                      className="rd-keyword-input"
                      value={scopeOpenersInput}
                      onChange={e => setScopeOpenersInput(e.target.value)}
                      placeholder="procedure, function, begin, {, proc, block"
                    />
                  </div>

                  <div className="rd-keyword-field">
                    <label className="rd-keyword-label">{cz ? '2. Uzavření bloku / rozsahu (scope closers):' : '2. Scope closers (end of block):'}</label>
                    <input
                      type="text"
                      className="rd-keyword-input"
                      value={scopeClosersInput}
                      onChange={e => setScopeClosersInput(e.target.value)}
                      placeholder="end, }"
                    />
                  </div>

                  <div className="rd-keyword-field">
                    <label className="rd-keyword-label">{cz ? '3. Klíčová slova deklarace (var, const):' : '3. Declaration keywords:'}</label>
                    <input
                      type="text"
                      className="rd-keyword-input"
                      value={declKeywordsInput}
                      onChange={e => setDeclKeywordsInput(e.target.value)}
                      placeholder="var, const, let, val"
                    />
                  </div>

                  <div className="rd-keyword-field">
                    <label className="rd-keyword-label">{cz ? '4. Klíčová slova datových typů:' : '4. Data type keywords:'}</label>
                    <input
                      type="text"
                      className="rd-keyword-input"
                      value={typeKeywordsInput}
                      onChange={e => setTypeKeywordsInput(e.target.value)}
                      placeholder="int, real, bool, char, string, float"
                    />
                  </div>

                  <div className="rd-keyword-field">
                    <label className="rd-keyword-label">{cz ? '5. Terminály identifikátorů v gramatice:' : '5. Identifier symbols in grammar:'}</label>
                    <input
                      type="text"
                      className="rd-keyword-input"
                      value={idSymbolsInput}
                      onChange={e => setIdSymbolsInput(e.target.value)}
                      placeholder="id, ident, identifier, name"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={applyKeywordChanges}>
                    <Sparkles size={13} />
                    <span>{cz ? 'Spustit auto-detekci podle těchto klíčových slov' : 'Re-scan & auto-generate actions'}</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetKeywordsToDefault}>
                    <RotateCcw size={13} />
                    <span>{cz ? 'Obnovit výchozí klíčová slova' : 'Reset to default keywords'}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Declarative Rule Actions Table */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>
              {cz ? 'Pravidlová tabulka akcí tabulky symbolů:' : 'Declarative rule-action mapping table:'}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn ${actionPreset === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => setActionPreset('none')}
              >
                {cz ? 'Vypnout všechny akce' : 'Disable all actions'}
              </button>
              <button
                type="button"
                className={`btn ${actionPreset === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={applyKeywordChanges}
              >
                <Sparkles size={11} />
                <span>{cz ? 'Auto-detekovat z pravidel' : 'Auto-detect from rules'}</span>
              </button>
            </div>
          </div>

          {/* Informative notice for pure syntax mode */}
          {isPureSyntaxMode && (
            <div className="report-box info" style={{ margin: '8px 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} />
              <span style={{ fontSize: '12px' }}>
                {cz
                  ? 'V této gramatice nebyla automaticky rozpoznána žádná klíčová slova pro deklarace či bloky. Rekurzivní sestup běží v čistě syntaktickém režimu. Můžete pravidlům přiřadit akce ručně v tabulce níže nebo upravit klíčová slova v konfigurátoru výše.'
                  : 'No declaration or scope keywords were automatically recognized in this grammar. Recursive descent operates in pure syntactic mode. You can manually assign actions to rules in the table below or adjust keywords in the configurator above.'}
              </span>
            </div>
          )}

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>{cz ? 'Pravidlo' : 'Rule'}</th>
                  <th style={{ width: '220px' }}>{cz ? 'Produkce gramatiky' : 'Grammar production'}</th>
                  <th style={{ width: '170px' }}>{cz ? 'Přiřazená akce' : 'Assigned action'}</th>
                  <th>{cz ? 'Parametry akce (rozsah, symbol, typ)' : 'Action parameters (scope, symbol, type)'}</th>
                  <th style={{ width: '180px' }}>{cz ? 'Efekt v simulaci' : 'Effect in simulation'}</th>
                </tr>
              </thead>
              <tbody>
                {grammar.productions.map(p => {
                  const act = ruleActions.find(a => a.ruleId === p.id) || {
                    ruleId: p.id,
                    actionType: 'none'
                  };

                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{p.id}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="sym-nt">{p.lhs}</span> → {p.rhs.join(' ') || 'ε'}
                      </td>
                      <td>
                        <select
                          className="rd-action-select"
                          value={act.actionType}
                          onChange={e =>
                            updateRuleAction(p.id, {
                              actionType: e.target.value as RuleActionDefinition['actionType'],
                              scopeName: act.scopeName || `scope_${p.lhs}`,
                              symbolName: act.symbolName || 'id',
                              symbolType: act.symbolType || 'var'
                            })
                          }
                          aria-label={`Action for rule ${p.id}`}
                        >
                          <option value="none">{cz ? '– žádná akce –' : '– none –'}</option>
                          <option value="enterScope">{cz ? 'Vstup do bloku (Enter Scope)' : 'Enter Scope'}</option>
                          <option value="exitScope">{cz ? 'Konec bloku (Exit Scope)' : 'Exit Scope'}</option>
                          <option value="addSymbol">{cz ? 'Deklarace symbolu (Add Symbol)' : 'Add Symbol'}</option>
                          <option value="markType">{cz ? 'Označení typu (Mark Type)' : 'Mark Type'}</option>
                          <option value="custom">{cz ? 'Vlastní skript (Custom JS)' : 'Custom JS'}</option>
                        </select>
                      </td>
                      <td>
                        {act.actionType === 'none' && (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                            {cz ? '(pravidlo neprovádí žádnou sémantickou akci)' : '(rule has no semantic action)'}
                          </span>
                        )}

                        {act.actionType === 'enterScope' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>{cz ? 'Název bloku:' : 'Scope name:'}</span>
                            <input
                              type="text"
                              className="rd-param-input"
                              style={{ width: '130px' }}
                              value={act.scopeName || `scope_${p.lhs}`}
                              onChange={e => updateRuleAction(p.id, { scopeName: e.target.value })}
                              placeholder={`scope_${p.lhs}`}
                            />
                          </div>
                        )}

                        {act.actionType === 'exitScope' && (
                          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                            {cz ? 'Ukončí aktuální vnitřní blok a vrátí se do nadřazeného rozsahu' : 'Pops current scope and returns to parent'}
                          </span>
                        )}

                        {act.actionType === 'addSymbol' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cz ? 'Název:' : 'Name:'}</span>
                            <input
                              type="text"
                              className="rd-param-input"
                              style={{ width: '55px' }}
                              value={act.symbolName || 'id'}
                              onChange={e => updateRuleAction(p.id, { symbolName: e.target.value })}
                              placeholder="id"
                              title={cz ? 'Název symbolu nebo "id" pro hodnotu ze vstupu' : 'Symbol name or "id" for input token'}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cz ? 'Typ:' : 'Type:'}</span>
                            <input
                              type="text"
                              className="rd-param-input"
                              style={{ width: '60px' }}
                              value={act.symbolType || 'var'}
                              onChange={e => updateRuleAction(p.id, { symbolType: e.target.value })}
                              placeholder="var"
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cz ? 'Druh:' : 'Kind:'}</span>
                            <select
                              className="rd-param-input"
                              style={{ padding: '2px 4px' }}
                              value={act.symbolKind || 'var'}
                              onChange={e => updateRuleAction(p.id, { symbolKind: e.target.value as any })}
                            >
                              <option value="var">var</option>
                              <option value="const">const</option>
                              <option value="procedure">procedure</option>
                              <option value="function">function</option>
                              <option value="type">type</option>
                              <option value="custom">custom</option>
                            </select>
                          </div>
                        )}

                        {act.actionType === 'markType' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cz ? 'Symbol:' : 'Symbol:'}</span>
                            <input
                              type="text"
                              className="rd-param-input"
                              style={{ width: '55px' }}
                              value={act.symbolName || 'id'}
                              onChange={e => updateRuleAction(p.id, { symbolName: e.target.value })}
                              placeholder="id"
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cz ? 'Nový typ:' : 'New type:'}</span>
                            <input
                              type="text"
                              className="rd-param-input"
                              style={{ width: '60px' }}
                              value={act.symbolType || 'int'}
                              onChange={e => updateRuleAction(p.id, { symbolType: e.target.value })}
                              placeholder="int"
                            />
                          </div>
                        )}

                        {act.actionType === 'custom' && (
                          <input
                            type="text"
                            className="rd-param-input"
                            style={{ width: '220px' }}
                            value={act.jsCode || ''}
                            onChange={e => updateRuleAction(p.id, { jsCode: e.target.value })}
                            placeholder="ctx.symTab.addSymbol('x', 'int')"
                          />
                        )}
                      </td>
                      <td>
                        {act.actionType === 'none' && (
                          <span className="badge badge-secondary" style={{ fontSize: '10.5px' }}>–</span>
                        )}
                        {act.actionType === 'enterScope' && (
                          <span className="badge badge-accent" style={{ fontSize: '10.5px' }}>
                            enterScope("{act.scopeName || `scope_${p.lhs}`}")
                          </span>
                        )}
                        {act.actionType === 'exitScope' && (
                          <span className="badge badge-warning" style={{ fontSize: '10.5px' }}>
                            exitScope()
                          </span>
                        )}
                        {act.actionType === 'addSymbol' && (
                          <span className="badge badge-primary" style={{ fontSize: '10.5px' }}>
                            addSymbol("{act.symbolName || 'id'}", "{act.symbolType || 'var'}")
                          </span>
                        )}
                        {act.actionType === 'markType' && (
                          <span className="badge badge-info" style={{ fontSize: '10.5px' }}>
                            markType("{act.symbolName || 'id'}", "{act.symbolType || 'int'}")
                          </span>
                        )}
                        {act.actionType === 'custom' && (
                          <span className="badge badge-primary" style={{ fontSize: '10.5px' }}>
                            eval(jsCode)
                          </span>
                        )}
                      </td>
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

