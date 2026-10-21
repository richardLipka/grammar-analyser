import React, { useEffect, useMemo, useState } from 'react';
import { Grammar, Production } from '../../core/ast/grammar';
import { GrammarAnalysis } from '../../core/analyser/grammarAnalyser';
import { LLTable } from '../../core/ll/llTable';
import { generateRecursiveDescent } from '../../core/codegen/recursiveDescent';
import { compilePl0, formatPcode } from '../../core/codegen/pl0Compiler';
import { runPcode } from '../../core/codegen/pcodeVm';
import { scanInput, ScannedInput } from '../../core/parser/inputTokenizer';
import { parseGrammar } from '../../core/parser/grammarParser';
import { TokenizedInputNote } from '../components/TokenizedInputNote';
import { SimulatorControls, useAutoPlay } from '../components/SimulatorControls';
import { DerivationTreeVisualizer } from '../visualizer/DerivationTreeVisualizer';
import { simulateRecursiveDescent, RDSimulationResult } from '../../core/codegen/rdSimulator';
import {
  RuleActionDefinition,
  suggestSymbolActions,
  DeclarationKeywordConfig,
  DEFAULT_KEYWORD_CONFIG,
  buildScopeTree,
  ScopeTreeNode,
  Scope,
  SymbolKind,
  isIdentifierTerminal,
  tokenClasses
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
  X as XIcon,
  SlidersHorizontal,
  RotateCcw,
  Settings2,
  Info,
  GitFork
} from 'lucide-react';
import { RD_SAMPLE_GRAMMARS } from '../../core/presets/rdSampleGrammars';
import { ReferenceBar } from '../components/ReferenceBar';
import { LRTable } from '../../core/lr/lrTable';
import { RecursiveAscentView } from './RecursiveAscentView';

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

export const RECURSIVE_DESCENT_PRIMARY_REFERENCES = [
  {
    authorYear: 'Lucas (1961)',
    topicEn: 'Recursive Descent Formulation',
    topicCz: 'První formulace rekurzivního sestupu',
    citation: 'Lucas, P.: Die Strukturanalyse von Formelübersetzern. Elektronische Rechenanlagen 3(4), 159–167, 1961.',
    url: 'https://doi.org/10.1524/itit.1961.3.16.159'
  },
  {
    authorYear: 'Conway (1963)',
    topicEn: 'Separable Transition-Diagram Compiler',
    topicCz: 'Překladač s přechodovými diagramy',
    citation: 'Conway, M. E.: Design of a separable transition-diagram compiler. Communications of the ACM 6(7), 396–408, 1963.',
    url: 'https://doi.org/10.1145/366663.366704'
  },
  {
    authorYear: 'Wirth (1976)',
    topicEn: 'PL/0 Compiler & P-code Architecture',
    topicCz: 'Překladač PL/0 a architektura P-kódu',
    citation: 'Wirth, N.: Algorithms + Data Structures = Programs. Prentice-Hall, 1976.',
    url: 'https://en.wikipedia.org/wiki/Algorithms_%2B_Data_Structures_%3D_Programs'
  }
];

type CodeLang = 'pl0' | 'oberon' | 'c' | 'python' | 'js' | 'pcode';
type SubTab = 'sim' | 'code' | 'symtab' | 'ascent';
type LRVariantName = 'LR(0)' | 'SLR(1)' | 'LALR(1)' | 'IELR(1)' | 'LR(1)';
type ActionType = RuleActionDefinition['actionType'];

const FILE_NAMES: Record<CodeLang, string> = {
  pl0: 'parser.pl0',
  oberon: 'Parser.Mod',
  c: 'parser.c',
  python: 'parser.py',
  js: 'parser.js',
  pcode: 'parser.pcode.txt'
};

const KIND_NAMES: Record<SymbolKind, { en: string; cz: string }> = {
  var: { en: 'variable', cz: 'proměnná' },
  const: { en: 'constant', cz: 'konstanta' },
  procedure: { en: 'procedure', cz: 'procedura' },
  function: { en: 'function', cz: 'funkce' },
  type: { en: 'type', cz: 'typ' },
  param: { en: 'parameter', cz: 'parametr' },
  custom: { en: 'custom', cz: 'vlastní' }
};

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link that opens the P-code with its input in the interpreter (the hash is not sent to the server, so length is no problem). */
export function interpreterLink(pcode: string, input: string, page?: string): string {
  return `${pl0InterpreterUrl(page)}#code_b64=${base64Url(pcode)}&input=${encodeURIComponent(input)}`;
}

/** The rules of a grammar as one string, to recognise a sample grammar after it was analysed */
const grammarKey = (g: Grammar) => g.productions.map(p => `${p.lhs}→${p.rhs.join(' ')}`).join('\n');

let sampleKeys: { id: string; key: string }[] | null = null;
/** The keys of the sample grammars (parsed once, when first needed) */
function samplesByKey(): { id: string; key: string }[] {
  if (!sampleKeys) {
    sampleKeys = RD_SAMPLE_GRAMMARS.flatMap(s => {
      const g = parseGrammar(s.grammarText).grammar;
      return g ? [{ id: s.id, key: grammarKey(g) }] : [];
    });
  }
  return sampleKeys;
}

interface RecursiveDescentViewProps {
  grammar: Grammar;
  analysis: GrammarAnalysis;
  llTable: LLTable;
  defaultInput?: string;
  lang: Language;
  onAttemptLL1?: () => void;
  /** Loads a sample grammar as a new grammar (with its word of terminals and its name) */
  onLoadGrammar?: (grammarText: string, sampleInput: string, title: { en: string; cz: string }) => void;
  /** The LR tables, for recursive ascent (the sub-tab works for any grammar with a conflict-free LR table) */
  lrTables?: Record<LRVariantName, LRTable | undefined>;
  lrVariant?: LRVariantName;
  onSelectLrVariant?: (v: LRVariantName) => void;
  /** The sub-tab to open first (a link with tab=ascent opens recursive ascent) */
  initialSubTab?: SubTab;
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
  onLoadGrammar,
  lrTables,
  lrVariant = 'SLR(1)',
  onSelectLrVariant,
  initialSubTab
}) => {
  const cz = lang === 'cz';
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab ?? 'sim');
  const [ownLrVariant, setOwnLrVariant] = useState<LRVariantName>(lrVariant);
  const activeLrVariant = onSelectLrVariant ? lrVariant : ownLrVariant;
  const [codeLang, setCodeLang] = useState<CodeLang>('pl0');
  const [inputText, setInputText] = useState(defaultInput);
  const [copied, setCopied] = useState(false);
  const [jsRunOutput, setJsRunOutput] = useState<string | null>(null);

  // Editable keywords for automated declaration & scope detection
  const [keywordConfig, setKeywordConfig] = useState<DeclarationKeywordConfig>(DEFAULT_KEYWORD_CONFIG);
  const keywordInputsOf = (c: DeclarationKeywordConfig) => ({
    procKeywords: c.procKeywords.join(', '),
    scopeOpeners: c.scopeOpeners.join(', '),
    scopeClosers: c.scopeClosers.join(', '),
    declKeywords: c.declKeywords.join(', '),
    typeKeywords: c.typeKeywords.join(', '),
    idSymbols: c.idSymbols.join(', ')
  });
  const [keywordInputs, setKeywordInputs] = useState(() => keywordInputsOf(DEFAULT_KEYWORD_CONFIG));
  const [showKeywordEditor, setShowKeywordEditor] = useState(true);
  const [showPureSymTab, setShowPureSymTab] = useState(false);
  // A name missing in the symbol table or declared twice in one scope stops the descent (semantic error), or is only reported
  const [stopOnSemanticErrors, setStopOnSemanticErrors] = useState(true);

  // Rule actions: detected from the keywords, switched off, or edited by hand
  const [actionMode, setActionMode] = useState<'none' | 'auto' | 'custom'>('auto');
  const [customActions, setCustomActions] = useState<RuleActionDefinition[]>([]);
  const autoActions = useMemo(() => suggestSymbolActions(grammar, keywordConfig), [grammar, keywordConfig]);
  const ruleActions = actionMode === 'none' ? [] : actionMode === 'custom' ? customActions : autoActions;
  const activeActionCount = ruleActions.filter(a => a.actionType !== 'none').length;
  const isPureSyntaxMode = activeActionCount === 0;

  // Hand-edited actions belong to the rules of one grammar: another grammar is detected again
  useEffect(() => {
    setActionMode(m => (m === 'custom' ? 'auto' : m));
  }, [grammar]);

  const key = useMemo(() => grammarKey(grammar), [grammar]);
  const currentSample = useMemo(() => {
    const id = samplesByKey().find(s => s.key === key)?.id;
    return RD_SAMPLE_GRAMMARS.find(s => s.id === id);
  }, [key]);
  // A sample grammar starts with its program with names (x, y), the others with the word of the grammar
  useEffect(() => {
    setInputText(currentSample && (defaultInput === currentSample.sampleInput || !defaultInput) ? currentSample.namedInput : defaultInput);
  }, [defaultInput, currentSample]);

  const applyKeywordChanges = () => {
    const parseList = (str: string) => str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    setKeywordConfig({
      procKeywords: parseList(keywordInputs.procKeywords),
      scopeOpeners: parseList(keywordInputs.scopeOpeners),
      scopeClosers: parseList(keywordInputs.scopeClosers),
      declKeywords: parseList(keywordInputs.declKeywords),
      typeKeywords: parseList(keywordInputs.typeKeywords),
      // identifier terminals keep their case (they are matched without it)
      idSymbols: keywordInputs.idSymbols.split(',').map(s => s.trim()).filter(Boolean)
    });
    setActionMode('auto');
  };

  const resetKeywordsToDefault = () => {
    setKeywordInputs(keywordInputsOf(DEFAULT_KEYWORD_CONFIG));
    setKeywordConfig(DEFAULT_KEYWORD_CONFIG);
    setActionMode('auto');
  };

  /** Edits the action list; the first edit starts from the actions in use */
  const editActions = (f: (list: RuleActionDefinition[]) => RuleActionDefinition[]) => {
    setCustomActions(f(ruleActions));
    setActionMode('custom');
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

  // Names and numbers in the input are read as the identifier and number terminals of the grammar
  const classes = useMemo(() => tokenClasses(grammar.terminals, keywordConfig.idSymbols), [grammar, keywordConfig]);
  const tokenized: ScannedInput = useMemo(() => scanInput(inputText, grammar.terminals, classes), [inputText, grammar, classes]);
  const namedTokens = useMemo(() => {
    const pairs = tokenized.tokens.map((tok, i) => ({ tok, lex: tokenized.lexemes[i] })).filter(p => p.tok !== p.lex);
    return [...new Map(pairs.map(p => [`${p.tok}\u0000${p.lex}`, p])).values()];
  }, [tokenized]);

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
  const [scopeDisplayMode, setScopeDisplayMode] = useState<'tree' | 'stack' | 'all'>('tree');

  const simulation = useMemo(() => {
    if (!llTable.isLL1 || tokenized.unknown.length > 0) {
      const none: RDSimulationResult = { accepted: false, steps: [], leftParse: [], lexemes: [], undeclared: [], redeclared: [], unnamedIdentifiers: 0 };
      return none;
    }
    return simulateRecursiveDescent(tokenized.tokens, grammar, analysis, {
      ruleActions,
      keywords: keywordConfig,
      lexemes: tokenized.lexemes,
      stopOnSemanticErrors
    });
  }, [tokenized, grammar, analysis, llTable, ruleActions, keywordConfig, stopOnSemanticErrors]);

  // Reset simulation step on new input
  useEffect(() => {
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [simulation]);

  useAutoPlay(isPlaying, currentStepIdx, simulation.steps.length, playSpeed, setCurrentStepIdx, () => setIsPlaying(false));

  const currentStep = simulation.steps[currentStepIdx] ?? simulation.steps[simulation.steps.length - 1];
  const isSimulationFinished = simulation.steps.length > 0 && currentStepIdx >= simulation.steps.length - 1;
  const undeclaredNames = [...new Set(simulation.undeclared.map(u => u.name))];
  const redeclaredNames = [...new Set(simulation.redeclared.map(r => `${r.name} (${r.scopeName})`))];

  const totalPreservedSymbols = useMemo(() => {
    if (!currentStep?.symbolTableSnapshot?.allScopes) return 0;
    return currentStep.symbolTableSnapshot.allScopes.reduce((sum, s) => sum + s.symbols.length, 0);
  }, [currentStep]);

  const scopeTree = useMemo(() => {
    if (!currentStep?.symbolTableSnapshot?.allScopes) return [];
    return buildScopeTree(currentStep.symbolTableSnapshot.allScopes);
  }, [currentStep]);

  const topScopeId = currentStep?.symbolTableSnapshot.scopeStack[currentStep.symbolTableSnapshot.scopeStack.length - 1]?.id;

  const renderScopeCard = (scope: Scope, isTopStack: boolean = false) => {
    const isClosed = !scope.isOpen;
    const lookup = currentStep?.lookup;
    // The entry a name resolves to is the last one with that name in its scope
    const usedIdx = lookup?.scopeId === scope.id ? scope.symbols.map(s => s.name).lastIndexOf(lookup.name) : -1;
    return (
      <div
        key={scope.id}
        className={`rd-scope-card ${isTopStack ? 'active-top' : ''} ${isClosed ? 'rd-scope-closed' : ''}`}
      >
        <div className="rd-scope-header">
          <span className="rd-scope-name">
            {scope.parentId ? <GitFork size={13} color="var(--color-primary)" /> : <Database size={13} color="var(--color-accent)" />}
            <span>{scope.name}</span>
          </span>
          <span className="rd-scope-badges">
            {isTopStack && (
              <span className="badge badge-accent" title={cz ? 'Nová jména se deklarují sem' : 'New names are declared here'}>
                {cz ? 'aktuální' : 'current'}
              </span>
            )}
            {isClosed && (
              <span className="badge badge-secondary" title={cz ? 'Rozsah skončil, jeho jména už nejsou viditelná' : 'The scope has ended, its names are no longer visible'}>
                {cz ? 'uzavřený' : 'closed'}
              </span>
            )}
            <span className="rd-scope-badge">
              {cz ? `úroveň ${scope.level}` : `level ${scope.level}`}
            </span>
          </span>
        </div>

        {scope.symbols.length === 0 ? (
          <div className="hint-text" style={{ fontStyle: 'italic', fontSize: '11px', padding: '4px' }}>
            {cz ? '(žádná jména)' : '(no names)'}
          </div>
        ) : (
          <table className="rd-symbol-table">
            <thead>
              <tr>
                <th>{cz ? 'Jméno' : 'Name'}</th>
                <th>{cz ? 'Druh' : 'Kind'}</th>
                <th>{cz ? 'Typ' : 'Type'}</th>
              </tr>
            </thead>
            <tbody>
              {scope.symbols.map((sym, symIdx) => {
                const isNew = currentStep?.declared?.scopeId === scope.id && currentStep.declared.declaredAtStep === sym.declaredAtStep && currentStep.declared.name === sym.name;
                const isUsed = symIdx === usedIdx;
                const extra = Object.entries(sym.customData).filter(([k]) => k !== 'redeclared');
                return (
                  <tr
                    key={`${sym.name}_${symIdx}`}
                    className={isNew ? 'rd-symbol-new' : isUsed ? 'rd-symbol-used' : ''}
                    title={isUsed ? (cz ? 'Sem se odkazuje právě přečtené jméno' : 'The name just read refers to this entry') : undefined}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {sym.name}
                      {sym.customData.redeclared === true && (
                        <span className="rd-meta-pill warning">{cz ? 'znovu deklarováno' : 'redeclared'}</span>
                      )}
                      {extra.map(([k, v]) => (
                        <span key={k} className="rd-meta-pill">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span className="rd-kind-tag">{cz ? KIND_NAMES[sym.kind].cz : KIND_NAMES[sym.kind].en}</span>
                    </td>
                    <td>
                      {sym.type ? <span className="rd-type-tag">{sym.type}</span> : <span className="hint-text">–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderScopeTreeNode = (node: ScopeTreeNode): React.ReactNode => (
    <div key={node.scope.id} className="rd-tree-node">
      {renderScopeCard(node.scope, topScopeId === node.scope.id)}
      {node.children.length > 0 && (
        <div className="rd-tree-children">
          {node.children.map(child => renderScopeTreeNode(child))}
        </div>
      )}
    </div>
  );

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
  useEffect(() => setJsRunOutput(null), [vmInput, generated]);

  const subTabBar = (
    <div className="rd-subtabs" style={{ marginTop: '12px' }}>
      {([
        ['sim', <Play size={15} key="i" />, cz ? 'Krokování a tabulka symbolů' : 'Step simulator & symbol table'],
        ['code', <Code2 size={15} key="i" />, cz ? 'Generovaný kód (PL/0, C, Python, JS…)' : 'Generated code (PL/0, C, Python, JS…)'],
        ['symtab', <Database size={15} key="i" />, cz ? 'Akce tabulky symbolů' : 'Symbol table actions'],
        ['ascent', <Layers size={15} key="i" />, cz ? 'Rekurzivní vzestup (LR)' : 'Recursive ascent (LR)']
      ] as [SubTab, React.ReactNode, string][]).map(([id, icon, label]) => (
        <button
          key={id}
          type="button"
          className={`rd-subtab-btn ${subTab === id ? 'active' : ''}`}
          onClick={() => setSubTab(id)}
          title={id === 'ascent' ? (cz ? 'Analyzátor LR jako procedura pro každý stav – pro gramatiky s tabulkou LR bez kolizí, i když nejsou LL(1)' : 'The LR parser as a procedure per state – for grammars with a conflict-free LR table, also when they are not LL(1)') : undefined}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );

  // Recursive ascent needs an LR table, not LL(1)
  if (subTab === 'ascent' && lrTables) {
    return (
      <div>
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} color="var(--color-primary)" />
              {cz ? 'Rekurzivní sestup a vzestup' : 'Recursive descent and ascent'}
            </span>
          </div>
          {subTabBar}
        </div>
        <RecursiveAscentView
          grammar={grammar}
          tables={lrTables}
          selectedVariant={activeLrVariant}
          onSelectVariant={onSelectLrVariant ?? setOwnLrVariant}
          defaultInput={defaultInput}
          lang={lang}
          interpreterLink={interpreterLink}
        />
      </div>
    );
  }

  if (!llTable.isLL1) {
    return (
      <div className="card">
        <div className="card-title"><span>{cz ? 'Rekurzivní sestup' : 'Recursive descent'}</span></div>
        {lrTables && subTabBar}
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onAttemptLL1 && (
              <button type="button" className="btn btn-accent" onClick={onAttemptLL1}>
                {cz ? 'Zkusit převést na LL(1)' : 'Try to transform to LL(1)'}
              </button>
            )}
            {lrTables && (
              <button type="button" className="btn btn-secondary" onClick={() => setSubTab('ascent')}>
                {cz ? 'Rekurzivní vzestup (stačí tabulka LR bez kolizí)' : 'Recursive ascent (a conflict-free LR table is enough)'}
              </button>
            )}
          </div>
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

  // The word to parse: shared by the simulator and the generated programs
  const inputField = (
    <>
      <input
        type="text"
        className="grammar-textarea"
        style={{ minHeight: 'unset', height: '38px', padding: '6px 12px', marginBottom: '6px' }}
        value={inputText}
        onChange={e => setInputText(e.target.value)}
        placeholder={(cz ? 'Slovo: tokeny oddělené mezerami, nebo bez mezer' : 'Word: tokens separated by spaces, or without spaces') + (defaultInput ? (cz ? ` (např. ${defaultInput})` : ` (e.g. ${defaultInput})`) : '')}
        aria-label={cz ? 'Slovo' : 'Word'}
      />
      <TokenizedInputNote tokenized={tokenized} lang={lang} />
      {namedTokens.length > 0 && (
        <div className="tokenized-note" role="status">
          <span>{cz ? 'Jména a čísla ze vstupu jsou terminály gramatiky: ' : 'Names and numbers in the input are terminals of the grammar: '}</span>
          {namedTokens.slice(0, 12).map(p => (
            <span key={`${p.tok}_${p.lex}`} className="token-chip">{p.lex} → {p.tok}</span>
          ))}
          {namedTokens.length > 12 && <span> …</span>}
        </div>
      )}
    </>
  );

  // One token of the input ribbon: the name with its terminal (x id), or the terminal
  const tokenText = (pos: number) => {
    const tok = currentStep ? [...currentStep.consumedTokens, ...currentStep.remainingTokens][pos] : '';
    const lex = simulation.lexemes[pos] ?? tok;
    return lex !== tok ? <>{lex}<sub className="rd-token-class">{tok}</sub></> : tok;
  };

  /** What an action does, in words */
  const describeAction = (act: RuleActionDefinition, p: Production): string => {
    const at = (i: number | undefined) => (i !== undefined && i < p.rhs.length ? `${p.rhs[i]} (${i + 1})` : '?');
    const type = act.symbolType === '$type' ? (cz ? 'typ přečtený naposled' : 'the type read last') : act.symbolType;
    const kind = KIND_NAMES[act.symbolKind ?? 'var'][cz ? 'cz' : 'en'];
    switch (act.actionType) {
      case 'addSymbol':
        return act.position === undefined
          ? (cz ? `deklaruje jméno ${act.symbolName ?? ''} (${kind})` : `declares the name ${act.symbolName ?? ''} (${kind})`)
          : (cz ? `po přečtení ${at(act.position)} deklaruje jeho jméno: ${kind}${type ? `, typ: ${type}` : ''}` : `after reading ${at(act.position)} declares its name: ${kind}${type ? `, type: ${type}` : ''}`);
      case 'markType':
        return cz ? `po přečtení ${at(act.position)} nastaví typ jména na ${type || '?'}` : `after reading ${at(act.position)} sets the type of the name to ${type || '?'}`;
      case 'enterScope': {
        const from = act.position ?? 0;
        const to = Math.min(act.closeAfter ?? p.rhs.length - 1, p.rhs.length - 1);
        return cz
          ? `rozsah „${act.scopeName ?? ''}“ od ${at(from)} do ${at(to)}`
          : `scope "${act.scopeName ?? ''}" from ${at(from)} to ${at(to)}`;
      }
      case 'exitScope':
        return cz ? `po ${at(act.position ?? p.rhs.length - 1)} ukončí vnitřní rozsah` : `after ${at(act.position ?? p.rhs.length - 1)} closes the innermost scope`;
      case 'custom':
        return cz ? 'vlastní kód při výběru pravidla (ctx.symTab, ctx.currentLookahead…)' : 'own code when the rule is chosen (ctx.symTab, ctx.currentLookahead…)';
      default:
        return '';
    }
  };

  /** A new action of the given type for a rule, with sensible positions */
  const newAction = (p: Production, actionType: ActionType): RuleActionDefinition => {
    const idPos = p.rhs.findIndex(s => grammar.terminals.has(s) && isIdentifierTerminal(s, keywordConfig.idSymbols));
    const termPos = p.rhs.findIndex(s => grammar.terminals.has(s));
    switch (actionType) {
      case 'addSymbol':
        return { ruleId: p.id, actionType, position: idPos >= 0 ? idPos : Math.max(termPos, 0), symbolKind: 'var', symbolType: '' };
      case 'markType':
        return { ruleId: p.id, actionType, position: idPos >= 0 ? idPos : Math.max(termPos, 0), symbolType: '$type' };
      case 'enterScope':
        return { ruleId: p.id, actionType, position: 0, closeAfter: p.rhs.length - 1, scopeName: `scope_${p.lhs}` };
      case 'exitScope':
        return { ruleId: p.id, actionType, position: p.rhs.length - 1 };
      default:
        return { ruleId: p.id, actionType };
    }
  };

  const positionSelect = (
    p: Production,
    value: number | undefined,
    onChange: (v: number) => void,
    terminalsOnly: boolean,
    label: string
  ) => (
    <select className="rd-param-input" value={value ?? ''} onChange={e => onChange(Number(e.target.value))} aria-label={label} title={label}>
      {p.rhs.map((s, i) => (!terminalsOnly || grammar.terminals.has(s)) && (
        <option key={i} value={i}>{`${i + 1}: ${s}`}</option>
      ))}
    </select>
  );

  const renderActionEditor = (p: Production, act: RuleActionDefinition, index: number) => {
    const update = (patch: Partial<RuleActionDefinition>) =>
      editActions(list => list.map(a => (a === act ? { ...a, ...patch } : a)));
    const remove = () => editActions(list => list.filter(a => a !== act));
    const empty = p.rhs.length === 0;
    return (
      <div key={index} className="rd-action-row">
        <select
          className="rd-action-select"
          value={act.actionType}
          onChange={e => editActions(list => list.map(a => (a === act ? newAction(p, e.target.value as ActionType) : a)))}
          aria-label={cz ? `Akce pravidla ${p.id}` : `Action of rule ${p.id}`}
        >
          {!empty && <option value="addSymbol">{cz ? 'Deklarace jména' : 'Declare a name'}</option>}
          {!empty && <option value="enterScope">{cz ? 'Rozsah (blok)' : 'Scope (block)'}</option>}
          {!empty && <option value="exitScope">{cz ? 'Konec rozsahu' : 'End of scope'}</option>}
          {!empty && <option value="markType">{cz ? 'Nastavení typu' : 'Set the type'}</option>}
          <option value="custom">{cz ? 'Vlastní kód (JS)' : 'Own code (JS)'}</option>
        </select>

        {(act.actionType === 'addSymbol' || act.actionType === 'markType') && (
          <>
            <span className="rd-param-label">{cz ? 'jméno z' : 'name from'}</span>
            {positionSelect(p, act.position, v => update({ position: v }), true, cz ? 'Symbol, jehož jméno ze vstupu se použije' : 'The symbol whose name in the input is used')}
            <span className="rd-param-label">{cz ? 'typ' : 'type'}</span>
            <input
              type="text"
              className="rd-param-input"
              style={{ width: '64px' }}
              value={act.symbolType ?? ''}
              onChange={e => update({ symbolType: e.target.value })}
              placeholder="$type"
              title={cz ? '$type = typové klíčové slovo přečtené naposled (int, float)' : '$type = the type keyword read last (int, float)'}
            />
            {act.actionType === 'addSymbol' && (
              <select
                className="rd-param-input"
                value={act.symbolKind ?? 'var'}
                onChange={e => update({ symbolKind: e.target.value as SymbolKind })}
                aria-label={cz ? 'Druh jména' : 'Kind of the name'}
              >
                {(Object.keys(KIND_NAMES) as SymbolKind[]).map(k => (
                  <option key={k} value={k}>{cz ? KIND_NAMES[k].cz : KIND_NAMES[k].en}</option>
                ))}
              </select>
            )}
          </>
        )}

        {act.actionType === 'enterScope' && (
          <>
            <input
              type="text"
              className="rd-param-input"
              style={{ width: '120px' }}
              value={act.scopeName ?? ''}
              onChange={e => update({ scopeName: e.target.value })}
              placeholder={`scope_${p.lhs}`}
              title={cz ? 'Název rozsahu; $name = jméno deklarované naposled' : 'Scope name; $name = the name declared last'}
            />
            <span className="rd-param-label">{cz ? 'od' : 'from'}</span>
            {positionSelect(p, act.position ?? 0, v => update({ position: v }), false, cz ? 'Rozsah začíná před tímto symbolem' : 'The scope starts before this symbol')}
            <span className="rd-param-label">{cz ? 'do' : 'to'}</span>
            {positionSelect(p, act.closeAfter ?? p.rhs.length - 1, v => update({ closeAfter: v }), false, cz ? 'Rozsah končí po tomto symbolu' : 'The scope ends after this symbol')}
          </>
        )}

        {act.actionType === 'exitScope' && (
          <>
            <span className="rd-param-label">{cz ? 'po' : 'after'}</span>
            {positionSelect(p, act.position ?? p.rhs.length - 1, v => update({ position: v }), false, cz ? 'Rozsah končí po tomto symbolu' : 'The scope ends after this symbol')}
          </>
        )}

        {act.actionType === 'custom' && (
          <input
            type="text"
            className="rd-param-input"
            style={{ width: '230px' }}
            value={act.jsCode || ''}
            onChange={e => update({ jsCode: e.target.value })}
            placeholder="ctx.symTab.addSymbol('x', 'int')"
          />
        )}

        <button type="button" className="rd-icon-btn" onClick={remove} title={cz ? 'Odebrat akci' : 'Remove the action'} aria-label={cz ? 'Odebrat akci' : 'Remove the action'}>
          <XIcon size={13} />
        </button>
      </div>
    );
  };

  /** Opens the help on what the symbol table can and cannot do */
  const showHelp = () => {
    setSubTab('symtab');
    requestAnimationFrame(() => document.getElementById('rd-symtab-help')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const helpCan = cz
    ? [
      'Jména a čísla ze vstupu čte jako terminál identifikátoru a čísla gramatiky (x → ident, 10 → number). Lexikální analýza je jednoduchá: slova oddělená mezerami, uvnitř slova nejdelší shoda; klíčová slova jsou terminály gramatiky, které vypadají jako jména.',
      'Jméno deklaruje ve chvíli, kdy procedura pravidla přečte jeho identifikátor: proměnné a konstanty (i seznamy var x, y), procedury a funkce (v obklopujícím rozsahu), parametry.',
      'Rozsahy: procedura nebo funkce má vlastní rozsah, blok { } nebo begin … end jen tehdy, když v něm mohou být deklarace. Ukáže vnoření, zastínění jména ve vnitřním rozsahu, zásobník otevřených rozsahů i uzavřené rozsahy (strom).',
      'Každý jiný přečtený identifikátor je použití jména: hledá se od nejvnitřnějšího otevřeného rozsahu ven a krok ukáže, kde bylo nalezeno. Nenalezené jméno je sémantická chyba, která zastaví analýzu, i když je slovo syntakticky správné; stejně tak jméno deklarované v jednom rozsahu podruhé (obě kontroly lze vypnout, pak se jen ohlásí). Kontrolují se jen skutečná jména: terminál id napsaný místo jména nic nepojmenovává.',
      'Typ jména je typové klíčové slovo přečtené naposled před jménem (int x, Type x).',
      'Akce rozpozná podle klíčových slov a názvů terminálů; v tabulce níže je lze upravit (pozice v pravé straně, druh, typ, vlastní kód).'
    ]
    : [
      'Names and numbers in the input are read as the identifier and number terminals of the grammar (x → ident, 10 → number). The lexical analysis is simple: words separated by spaces, longest match within a word; keywords are the terminals of the grammar that look like names.',
      'A name is declared when the procedure of a rule reads its identifier: variables and constants (also lists var x, y), procedures and functions (in the enclosing scope), parameters.',
      'Scopes: a procedure or function has its own scope, a block { } or begin … end only when declarations can occur in it. Nesting, shadowing in an inner scope, the stack of open scopes and the closed scopes (tree) are shown.',
      'Every other identifier read is a use of a name: it is looked up from the innermost open scope outwards, and the step shows where it was found. A name that is not found is a semantic error that stops the analysis even of a syntactically correct word, and so is a name declared a second time in one scope (both checks can be switched off; they are then only reported). Only real names are checked: the terminal id written instead of a name names nothing.',
      'The type of a name is the type keyword read last before it (int x, Type x).',
      'The actions are detected from keywords and names of terminals; they can be edited in the table below (position in the right-hand side, kind, type, own code).'
    ];
  const helpCannot = cz
    ? [
      'Nepřekládá: pro analyzovaný program negeneruje kód, nepřiděluje adresy, úrovně a velikosti proměnných (to, k čemu tabulka v překladači PL/0 slouží u instrukcí LOD, STO, CAL) a program neprovádí.',
      'Nekontroluje typy (přiřazení, výrazy, parametry), druhy jmen (volání proměnné, přiřazení do konstanty nebo procedury) ani počet a pořadí parametrů.',
      'Jméno musí být deklarováno dřív, než se v textu použije: dopředné odkazy, kde je jazyk dovoluje, moduly a jmenné prostory, položky záznamů a struktur (a.b), přetěžování ani návěští nezná.',
      'Typ zapsaný za jménem (x : integer v Pascalu) ani typy definované programem (typedef, type T = …) nerozpozná.',
      'Rozpoznání akcí je heuristika: identifikátor je terminál s názvem jako id, ident, name, deklarace se poznají jen podle klíčových slov. U jiné gramatiky může být potřeba akce upravit ručně; ručně upravené akce platí jen pro tuto gramatiku.',
      'Lexikální analýza nezná komentáře, řetězce ani znakové konstanty; víceznakový operátor je jedním symbolem, jen je-li terminálem gramatiky.',
      'Programy v záložce Generovaný kód (PL/0, Oberon, C, Python, JavaScript) kontrolují jen syntaxi: čtou jeden znak za terminál a tabulku symbolů nemají.',
      'Jen gramatiky LL(1); krokování má nejvýše 2 000 kroků. Vlastní kód v JavaScriptu běží v prohlížeči bez omezení – jen pro vlastní pokusy.'
    ]
    : [
      'It does not compile: no code is generated for the analysed program, variables get no addresses, levels or sizes (what the table of a PL/0 compiler provides for the instructions LOD, STO, CAL), and the program is not run.',
      'Types (assignments, expressions, parameters), kinds of names (calling a variable, assigning to a constant or a procedure) and the number and order of parameters are not checked.',
      'A name must be declared before it is used in the text: forward references where a language allows them, modules and namespaces, fields of records and structures (a.b), overloading and labels are not supported.',
      'A type written after the name (x : integer in Pascal) and types defined by the program (typedef, type T = …) are not recognised.',
      'The detection of actions is a heuristic: an identifier is a terminal named like id, ident, name, and declarations are recognised only by keywords. Another grammar may need its actions edited by hand; edited actions belong to that grammar only.',
      'The lexical analysis knows no comments, strings or character constants; a multi-character operator is one symbol only when it is a terminal of the grammar.',
      'The programs on the tab Generated code (PL/0, Oberon, C, Python, JavaScript) check the syntax only: they read one character per terminal and have no symbol table.',
      'LL(1) grammars only; the step simulator stops after 2,000 steps. Own JavaScript code runs in the browser without restrictions – for one\'s own experiments only.'
    ];
  const symbolTableHelp = (
    <details className="rd-help" id="rd-symtab-help" open>
      <summary>{cz ? 'Tabulka symbolů: co ukázka umí a co ne' : 'Symbol table: what this demonstration can and cannot do'}</summary>
      <p className="rd-help-lead">
        {cz
          ? 'Jde o demonstrační nástroj, ne o překladač. Ukazuje, jak syntaktický analyzátor rekurzivním sestupem při čtení programu zakládá a používá tabulku symbolů: kdy vzniká a končí rozsah, kdy se jméno deklaruje a kde se hledá. Program se nepřekládá ani neprovádí a většina kontrol skutečného překladače chybí.'
          : 'This is a demonstration tool, not a compiler. It shows how a recursive-descent parser builds and uses a symbol table while it reads a program: when a scope starts and ends, when a name is declared and where it is looked up. The program is neither compiled nor run, and most checks of a real compiler are missing.'}
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
  );

  const verdict = simulation.accepted
    ? (cz
      ? `Slovo přijato v ${simulation.steps.length} krocích. Levý rozklad: ${simulation.leftParse.join(' ')}`
      : `Word accepted in ${simulation.steps.length} steps. Left parse: ${simulation.leftParse.join(' ')}`)
    : simulation.errorMessage
      ? (cz ? simulation.errorMessageCz || simulation.errorMessage : simulation.errorMessage)
      : '';

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
            ? 'Každý neterminál má proceduru. Ta podle aktuálního symbolu vstupu (množiny řídicích symbolů z tabulky LL(1)) vybere pravidlo, vypíše jeho číslo (vzniká levý rozklad) a pak pro každý symbol pravé strany zavolá proceduru neterminálu, nebo zkontroluje a přečte terminál. Krokování ukazuje zásobník volání, rozkladový strom a tabulku symbolů (zásobník rozsahů, v každém jeho jména); záložka Generovaný kód obsahuje tentýž analyzátor v šesti jazycích.'
            : 'Every non-terminal has a procedure. It chooses the rule by the current input symbol (the director sets of the LL(1) table), prints the rule number (giving the left parse), and then for every symbol of the right-hand side calls the procedure of a non-terminal or checks and reads a terminal. The step simulator shows the call stack, the parse tree and the symbol table (a stack of scopes, each with its names); the tab Generated code holds the same parser in six languages.'}
        </p>

        {/* Primary Literature Reference Bar */}
        <ReferenceBar
          references={RECURSIVE_DESCENT_PRIMARY_REFERENCES}
          lang={lang}
          label={cz ? 'Primární literatura (rekurzivní sestup a architektura překladače):' : 'Primary literature (recursive descent & compiler architecture):'}
        />

        {/* Subtabs selector */}
        {subTabBar}

        {/* Sample Grammars Quick-Selector */}
        {onLoadGrammar && (
          <div className="rd-sample-row">
            <span className="rd-sample-label">
              <BookOpen size={14} color="var(--color-primary)" />
              {cz ? 'Ukázkové gramatiky s deklaracemi a rozsahy:' : 'Sample grammars with declarations and scopes:'}
            </span>
            <select
              className="grammar-textarea"
              style={{ minHeight: 'unset', height: '32px', padding: '4px 10px', fontSize: '12px', width: 'auto', flex: 1, maxWidth: '460px' }}
              value={currentSample?.id ?? ''}
              onChange={e => {
                const sample = RD_SAMPLE_GRAMMARS.find(s => s.id === e.target.value);
                if (sample) {
                  onLoadGrammar(sample.grammarText, sample.sampleInput, { en: sample.nameEn, cz: sample.nameCz });
                  setInputText(sample.namedInput);
                }
              }}
            >
              <option value="" disabled>{cz ? 'Vyberte ukázkovou gramatiku…' : 'Select a sample grammar…'}</option>
              {RD_SAMPLE_GRAMMARS.map(s => (
                <option key={s.id} value={s.id}>
                  {cz ? s.nameCz : s.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}
        {currentSample && (
          <p className="hint-text" style={{ marginTop: '6px' }}>{cz ? currentSample.descriptionCz : currentSample.descriptionEn}</p>
        )}
      </div>

      {/* SUBTAB 1: Visual Simulator */}
      {subTab === 'sim' && (
        <div className="card rd-workspace-host">
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

          {inputField}

          {/* Verdict Banner */}
          {verdict && (
            <div
              className={`report-box ${simulation.accepted ? 'success' : 'danger'}`}
              style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {simulation.accepted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <span style={{ fontWeight: 600 }}>{verdict}</span>
            </div>
          )}
          {simulation.semanticError && (
            <p className="hint-text" style={{ margin: '-4px 0 10px' }}>
              {cz
                ? 'Gramatika slovo připouští, nesedí ale tabulka symbolů. Překladač kontroluje kromě syntaxe i to, zda je každé použité jméno deklarováno a zda není v jednom rozsahu deklarováno dvakrát; tyto kontroly jde vypnout níže (pak se chybná jména jen vypíšou).'
                : 'The grammar allows the word, but the symbol table does not agree. Besides the syntax, a compiler checks that every name used is declared and that no name is declared twice in one scope; these checks can be switched off below (the names are then only listed).'}
            </p>
          )}
          {simulation.unnamedIdentifiers > 0 && (
            <div className="report-box info" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Info size={16} />
              <span>
                {cz
                  ? `Vstup obsahuje místo jmen terminál ${classes.identifier ?? 'identifikátoru'} (${simulation.unnamedIdentifiers}×). Pro tabulku symbolů pište skutečná jména (např. x, y, p) – čtou se jako ${classes.identifier ?? 'identifikátor'}. Terminál ${classes.identifier ?? ''} sám nic nepojmenovává, proto se u něj deklarace ani použití nekontrolují.`
                  : `The input has the terminal ${classes.identifier ?? 'identifier'} instead of names (${simulation.unnamedIdentifiers}×). For the symbol table write real names (e.g. x, y, p) – they are read as ${classes.identifier ?? 'the identifier'}. The terminal ${classes.identifier ?? ''} itself names nothing, so its declarations and uses are not checked.`}
              </span>
            </div>
          )}
          {!stopOnSemanticErrors && (undeclaredNames.length > 0 || redeclaredNames.length > 0) && (
            <div className="report-box warning" style={{ margin: '0 0 10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertTriangle size={16} />
              <span>
                {undeclaredNames.length > 0 && (
                  <span style={{ display: 'block' }}>
                    {cz
                      ? `Tato jména nejsou v místě použití deklarována v žádném viditelném rozsahu: ${undeclaredNames.join(', ')}`
                      : `These names are not declared in any scope visible where they are used: ${undeclaredNames.join(', ')}`}
                  </span>
                )}
                {redeclaredNames.length > 0 && (
                  <span style={{ display: 'block' }}>
                    {cz
                      ? `Tato jména jsou v jednom rozsahu deklarována dvakrát: ${redeclaredNames.join(', ')}`
                      : `These names are declared twice in one scope: ${redeclaredNames.join(', ')}`}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Declarative Symbol Table Actions Status Banner */}
          <div className="rd-mode-row">
            <span className={`badge ${isPureSyntaxMode ? 'badge-secondary' : 'badge-accent'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Database size={12} />
              {isPureSyntaxMode
                ? (cz ? 'Jen syntaxe: tabulka symbolů se nepoužívá' : 'Syntax only: no symbol table')
                : (cz
                  ? `Tabulka symbolů – akce u pravidel: ${activeActionCount} (${actionMode === 'custom' ? 'upravené ručně' : 'rozpoznané'})`
                  : `Symbol table – rule actions: ${activeActionCount} (${actionMode === 'custom' ? 'edited by hand' : 'detected'})`)}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '3px 8px', fontSize: '11.5px', gap: '4px' }}
              onClick={() => setSubTab('symtab')}
            >
              <Settings2 size={12} />
              <span>{cz ? 'Akce a klíčová slova' : 'Actions & keywords'}</span>
            </button>
          </div>
          {!isPureSyntaxMode && (
            <div className="rd-mode-row">
              <label className="rd-check">
                <input type="checkbox" checked={stopOnSemanticErrors} onChange={e => setStopOnSemanticErrors(e.target.checked)} />
                <span>{cz ? 'Sémantické chyby (nedeklarované jméno, jméno deklarované v rozsahu dvakrát) zastaví analýzu i syntakticky správného slova' : 'Semantic errors (an undeclared name, a name declared twice in a scope) stop the analysis even of a syntactically correct word'}</span>
              </label>
              <button type="button" className="link-button" onClick={showHelp}>
                {cz ? 'Co tabulka symbolů umí a neumí' : 'What the symbol table can and cannot do'}
              </button>
            </div>
          )}

          {/* TOP SECTION: Input Streamer, Position in Input, and Action Note */}
          {currentStep && (
            <>
              <div className="rd-input-top-ribbon">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                    {cz ? 'Vstup:' : 'Input:'}
                  </span>
                  {currentStep.consumedTokens.map((_, i) => (
                    <span key={`cons_${i}`} className="rd-token-consumed" title={cz ? 'Přečtený symbol' : 'Symbol read'}>
                      {tokenText(i)}
                    </span>
                  ))}
                  <span className="rd-token-lookahead" title={cz ? 'Aktuální symbol' : 'Current symbol'}>
                    <span>sym =</span>
                    <code>{tokenText(currentStep.consumedTokens.length)}</code>
                  </span>
                  {currentStep.remainingTokens.slice(1).map((_, i) => (
                    <span key={`rem_${i}`} className="rd-token-remaining">
                      {tokenText(currentStep.consumedTokens.length + 1 + i)}
                    </span>
                  ))}
                </div>
                <span
                  className="badge badge-secondary"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', padding: '3px 8px' }}
                  title={cz ? 'Pozice aktuálního symbolu ve vstupu (včetně $)' : 'Position of the current symbol in the input ($ included)'}
                >
                  {cz ? 'Pozice' : 'Position'} {currentStep.consumedTokens.length + 1} / {currentStep.consumedTokens.length + currentStep.remainingTokens.length}
                </span>
              </div>

              <div className="rd-step-note">
                <strong>{cz ? 'Krok' : 'Step'} {currentStep.step + 1}: </strong>
                <span>{cz ? currentStep.actionDescriptionCz : currentStep.actionDescription}</span>
              </div>
            </>
          )}

          {/* MAIN SYNCHRONOUS WORKSPACE: Stack (Left) | Tree (Middle) | Table (Right) */}
          {currentStep && (
            <div className="rd-workspace-grid">
              {/* LEFT COLUMN: Call Stack & Active Function / Branch */}
              <div className="rd-col-left">
                <div className="rd-panel">
                  <div className="rd-panel-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} color="var(--color-primary)" />
                      {cz ? 'Zásobník volání' : 'Call stack'}
                    </span>
                    <span className="badge badge-secondary">
                      {cz ? `hloubka ${currentStep.callStack.length}` : `depth ${currentStep.callStack.length}`}
                    </span>
                  </div>

                  <div className="rd-callstack-list">
                    {currentStep.callStack.length === 0 ? (
                      <div className="hint-text" style={{ padding: '12px', textAlign: 'center' }}>
                        {currentStep.step === 0
                          ? (cz ? 'Zásobník je prázdný (hlavní program ještě nevolal první proceduru)' : 'The stack is empty (the main program has not called the first procedure yet)')
                          : (cz ? 'Zásobník je prázdný (všechny procedury se vrátily)' : 'The stack is empty (all procedures have returned)')}
                      </div>
                    ) : (
                      // the list is drawn bottom-up (column-reverse): the top of the stack is at the top
                      currentStep.callStack.map(frame => {
                        const isTop = frame.depth === currentStep.callStack.length - 1;
                        return (
                          <div key={frame.id} className={`rd-frame-card ${isTop ? 'active' : ''}`}>
                            <div className="rd-frame-header">
                              <span className="rd-frame-title">
                                {isTop && <span style={{ color: 'var(--color-accent)', marginRight: '4px' }}>▶</span>}
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
                                    className={`rd-rhs-symbol ${sIdx === frame.rhsIndex ? 'current' : ''}`}
                                    title={sIdx === frame.rhsIndex ? (cz ? 'Právě zpracovávaný symbol' : 'Symbol being processed') : undefined}
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
                      {cz ? 'Právě prováděná procedura' : 'Procedure being executed'}
                    </span>
                  </div>

                  <div className="rd-branch-box">
                    {currentStep.activeFunction === 'main' ? (
                      <>
                        <div><code>main() &#123;</code></div>
                        <div style={{ paddingLeft: '16px' }}>{cz ? 'sym = první symbol vstupu;' : 'sym = first input symbol;'}</div>
                        <div style={{ paddingLeft: '16px' }}>{grammar.startSymbol}();</div>
                        <div style={{ paddingLeft: '16px' }}>if (sym != $) error();</div>
                        <div><code>&#125;</code></div>
                      </>
                    ) : (
                      <>
                        <div><code>{currentStep.activeFunction}() &#123;</code></div>
                        {grammar.productions
                          .filter(p => p.lhs === currentStep.activeFunction)
                          .map(p => {
                            const activeFrame = currentStep.callStack[currentStep.callStack.length - 1];
                            const isChosen = activeFrame?.rule?.id === p.id;
                            const predictList = [...(analysis.predict1.get(p.id) || [])];
                            return (
                              <div key={p.id} className={`rd-branch-line ${isChosen ? 'rd-branch-active' : ''}`} style={{ paddingLeft: '16px', margin: '2px 0' }}>
                                <span>if (sym ∈ &#123;{predictList.join(', ')}&#125;) // {p.id}: {p.lhs} → {p.rhs.join(' ') || 'ε'}</span>
                                {isChosen && <span style={{ marginLeft: '6px', fontWeight: 800 }}>← {cz ? 'vybráno' : 'chosen'}</span>}
                              </div>
                            );
                          })}
                        <div style={{ paddingLeft: '16px', color: 'var(--color-text-muted)' }}>else error();</div>
                        <div><code>&#125;</code></div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* MIDDLE COLUMN: Derivation Parse Tree Visualizer */}
              <div className="rd-col-middle">
                <div className="rd-panel" style={{ height: '100%', minHeight: '520px' }}>
                  <div className="rd-panel-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} color="var(--color-primary)" />
                      {cz ? 'Rozkladový strom (zvýrazněná cesta k aktivnímu uzlu)' : 'Parse tree (path to the active node highlighted)'}
                    </span>
                  </div>
                  <DerivationTreeVisualizer
                    rootNode={currentStep.parseTree}
                    height="500px"
                    filename="rd_parse_tree"
                    lang={lang}
                  />
                </div>
              </div>

              {/* RIGHT COLUMN: Symbol Table & Lexical Scopes ("Stack of Stacks" & "Scope Tree") */}
              <div className="rd-col-right">
                <div className="rd-panel" style={{ height: '100%', minHeight: '520px' }}>
                  <div className="rd-panel-title" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Database size={15} color="var(--color-accent)" />
                      {cz ? 'Tabulka symbolů' : 'Symbol table'}
                    </span>
                    <span style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="badge badge-secondary" title={cz ? 'Otevřené rozsahy (výška zásobníku)' : 'Open scopes (height of the stack)'}>
                        {cz ? `otevřené rozsahy: ${currentStep.symbolTableSnapshot.scopeStack.length}` : `open scopes: ${currentStep.symbolTableSnapshot.scopeStack.length}`}
                      </span>
                      <span className="badge badge-primary">
                        {cz ? `jmen: ${totalPreservedSymbols}` : `names: ${totalPreservedSymbols}`}
                      </span>
                    </span>
                  </div>

                  {/* View Mode Toggle: Tree vs Active Stack vs All Scopes */}
                  <div className="rd-scope-mode-toggle" role="group" aria-label={cz ? 'Zobrazení rozsahů' : 'Scope display'}>
                    <button
                      type="button"
                      className={`rd-scope-mode-btn ${scopeDisplayMode === 'tree' ? 'active' : ''}`}
                      onClick={() => setScopeDisplayMode('tree')}
                      title={cz ? 'Strom vnoření všech rozsahů, i uzavřených' : 'Nesting tree of all scopes, closed ones included'}
                    >
                      <GitFork size={12} />
                      {cz ? 'Strom' : 'Tree'}
                    </button>
                    <button
                      type="button"
                      className={`rd-scope-mode-btn ${scopeDisplayMode === 'stack' ? 'active' : ''}`}
                      onClick={() => setScopeDisplayMode('stack')}
                      title={cz ? 'Zásobník otevřených rozsahů: jména, která jsou teď viditelná' : 'Stack of open scopes: the names visible now'}
                    >
                      <Layers size={12} />
                      {cz ? 'Zásobník' : 'Stack'}
                    </button>
                    <button
                      type="button"
                      className={`rd-scope-mode-btn ${scopeDisplayMode === 'all' ? 'active' : ''}`}
                      onClick={() => setScopeDisplayMode('all')}
                      title={cz ? 'Všechny rozsahy v pořadí, v jakém vznikly' : 'All scopes in the order they were created'}
                    >
                      <Database size={12} />
                      {cz ? 'Vše' : 'All'}
                    </button>
                  </div>

                  <p className="hint-text" style={{ margin: '0 0 8px', fontSize: '11px' }}>
                    {cz ? 'Ukázka tvorby tabulky při analýze, ne překladač: typy ani druhy jmen se nekontrolují. ' : 'A demonstration of building the table while parsing, not a compiler: types and kinds of names are not checked. '}
                    <button type="button" className="link-button" style={{ fontSize: '11px' }} onClick={showHelp}>
                      {cz ? 'Více' : 'More'}
                    </button>
                  </p>

                  {isSimulationFinished && !isPureSyntaxMode && (
                    <div className="report-box success" style={{ margin: '0 0 10px', padding: '6px 10px', fontSize: '11.5px' }}>
                      {cz
                        ? `Konec: ${totalPreservedSymbols} jmen v ${currentStep.symbolTableSnapshot.allScopes.length} rozsazích. Uzavřené rozsahy zůstávají zobrazené ve stromu.`
                        : `Finished: ${totalPreservedSymbols} names in ${currentStep.symbolTableSnapshot.allScopes.length} scopes. Closed scopes stay in the tree.`}
                    </div>
                  )}

                  {isPureSyntaxMode && (
                    <div className="report-box info" style={{ margin: '0 0 10px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                        <Info size={14} />
                        {cz ? 'V gramatice nejsou rozpoznány deklarace; analýza je čistě syntaktická.' : 'No declarations recognised in the grammar; the analysis is purely syntactic.'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowPureSymTab(s => !s)}
                        style={{ fontSize: '10.5px', padding: '2px 6px' }}
                      >
                        {showPureSymTab ? (cz ? 'Skrýt' : 'Hide') : (cz ? 'Zobrazit' : 'Show')}
                      </button>
                    </div>
                  )}

                  {(!isPureSyntaxMode || showPureSymTab) && (
                    <div className="rd-symtab-container">
                      {scopeDisplayMode === 'tree' && (
                        <div className="rd-tree-container">
                          {scopeTree.map(rootNode => renderScopeTreeNode(rootNode))}
                        </div>
                      )}

                      {scopeDisplayMode === 'stack' && (
                        <div className="rd-scope-stack">
                          {[...currentStep.symbolTableSnapshot.scopeStack].reverse().map(scope => renderScopeCard(scope, scope.id === topScopeId))}
                          <div className="hint-text" style={{ fontSize: '11px', textAlign: 'center' }}>
                            {cz ? 'Vrchol zásobníku je nahoře; jméno se hledá shora dolů.' : 'The top of the stack is first; a name is looked up from the top down.'}
                          </div>
                        </div>
                      )}

                      {scopeDisplayMode === 'all' && (
                        <div className="rd-scope-stack">
                          {currentStep.symbolTableSnapshot.allScopes.map(scope => renderScopeCard(scope, scope.id === topScopeId))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM CONTROLS: VCR Simulator Controls below the main workspace */}
          {simulation.steps.length > 0 && (
            <div className="rd-controls-footer">
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
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: Generated Code */}
      {subTab === 'code' && (
        <>
          <div className="card">
            <p className="hint-text">
              {cz
                ? 'Výstupem programu je levý rozklad a OK, nebo ERR a symbol, u kterého analyzátor chybu zjistil. Komentáře uvádějí nad každou procedurou její pravidla a u každé větve pravidlo, které provádí. Všechny jazyky vypisují pro stejný vstup totéž.'
                : 'The program prints the left parse and OK, or ERR and the symbol where the parser found the error. Comments give the rules above every procedure and the rule of every branch. All languages print the same for the same input.'}
            </p>
            <p className="hint-text" style={{ marginTop: '4px' }}>
              {gen.nested
                ? (cz
                  ? 'PL/0 ani Oberon-07 nemají dopředné deklarace, procedura tedy smí volat jen sebe, procedury obklopujících bloků a procedury deklarované před ní. Procedury jsou proto vnořeny podle volání, stejně jako expression ⊃ term ⊃ factor ve Wirthově překladači PL/0. V C (prototypy), v Pythonu a v JavaScriptu (jméno se hledá až při volání) vnoření potřeba není.'
                  : 'Neither PL/0 nor Oberon-07 has forward declarations, so a procedure may only call itself, procedures of enclosing blocks and procedures declared before it. The procedures are therefore nested along the calls, like expression ⊃ term ⊃ factor in Wirth\'s PL/0 compiler. C (prototypes), Python and JavaScript (a name is looked up when it is called) need no nesting.')
                : (cz
                  ? 'Vnoření procedur nestačí na volání této gramatiky (PL/0 ani Oberon-07 nemají dopředné deklarace). PL/0 proto používá jednu proceduru parse, která neterminál dostane v proměnné which, a Oberon volá procedury přes procedurové proměnné (jako ORP.Mod u expression). V C, v Pythonu a v JavaScriptu je každý neterminál samostatnou funkcí.'
                  : 'Nesting the procedures is not enough for the calls of this grammar (neither PL/0 nor Oberon-07 has forward declarations). PL/0 therefore uses one procedure parse that gets the non-terminal in the variable which, and Oberon calls through procedure variables (as ORP.Mod does for expression). In C, Python and JavaScript every non-terminal is a function of its own.')}
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
                {(['pl0', 'oberon', 'c', 'python', 'js', 'pcode'] as const).map(l => (
                  <button
                    key={l}
                    type="button"
                    className={`btn ${codeLang === l ? 'btn-primary' : 'btn-secondary'}`}
                    aria-pressed={codeLang === l}
                    onClick={() => setCodeLang(l)}
                  >
                    {l === 'js' ? 'JavaScript' : l === 'pl0' ? 'PL/0' : l === 'oberon' ? 'Oberon' : l === 'c' ? 'C' : l === 'python' ? 'Python' : (cz ? 'P-kód' : 'P-code')}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                  ? 'PL/0 podle Wirtha se znakovým vstupem a výstupem: ? x přečte jeden znak (instrukce REA), ! v vypíše znak s kódem v (WRI). PL/0 nemá else ani or, proto procedura nejdřív do proměnné rule určí pravidlo a pak je provede. Komentáře (* … *) Wirthův původní PL/0 nemá; pro překladač bez komentářů je smažte.'
                  : 'Wirth\'s PL/0 with character input and output: ? x reads one character (instruction REA), ! v writes the character with the code v (WRI). PL/0 has neither else nor or, so a procedure first determines the rule in the variable rule and then expands it. Wirth\'s original PL/0 has no comments (* … *); delete them for a compiler without comments.')
                : codeLang === 'oberon'
                  ? (cz
                    ? 'Oberon-07 s moduly In a Out (Oakwood): In.Char čte znak, Out.Int a Out.String vypisují.'
                    : 'Oberon-07 with the modules In and Out (Oakwood): In.Char reads a character, Out.Int and Out.String write.')
                  : codeLang === 'c'
                    ? (cz
                      ? 'C99 se standardní knihovnou stdio: getchar čte znak, printf vypisuje (gcc -std=c99 parser.c). Funkce jsou nejdřív deklarovány prototypy, takže se mohou volat v libovolném pořadí; každá vybírá pravidlo příkazem switch podle aktuálního symbolu. Návratový kód programu je 0 pro přijaté slovo.'
                      : 'C99 with the standard library stdio: getchar reads a character, printf writes (gcc -std=c99 parser.c). The functions are declared first by prototypes, so they can call each other in any order; each one chooses the rule with a switch on the current symbol. The exit status is 0 for an accepted word.')
                    : codeLang === 'python'
                      ? (cz
                        ? 'Python 3: vstup se čte ze standardního vstupu (python parser.py < vstup). Jméno funkce se hledá až při volání, na pořadí funkcí tedy nezáleží; pravidlo se vybírá podle aktuálního symbolu příkazy if a elif.'
                        : 'Python 3: the input is read from the standard input (python parser.py < input). A function name is looked up when it is called, so the order of the functions does not matter; the rule is chosen by the current symbol with if and elif.')
                      : codeLang === 'js'
                        ? (cz
                          ? 'JavaScript (ES2020): funkce parse(vstup, hooks) vrací { ok, leftParse, output }; volitelné háčky onEnter, onRule, onMatch, onExit se volají při vstupu do procedury, výběru pravidla, přečtení terminálu a návratu. Spuštění z příkazové řádky: node parser.js < vstup.'
                          : 'JavaScript (ES2020): the function parse(input, hooks) returns { ok, leftParse, output }; the optional hooks onEnter, onRule, onMatch, onExit are called when a procedure starts, a rule is chosen, a terminal is read and a procedure returns. From the command line: node parser.js < input.')
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
            {inputField}
            {tokenized.unknown.length === 0 && (
              <>
                <div className="rd-run">
                  <span className="hint-text">{cz ? 'Vstup programu:' : 'Program input:'}</span> <code>{vmInput}</code>
                </div>
                {run && (
                  <div className={`report-box ${run.output.endsWith('OK') ? 'success' : 'danger'}`} style={{ marginTop: '8px' }}>
                    <div style={{ fontWeight: 700 }}>{cz ? 'Výstup programu v PL/0 (spuštěno zde, stejný P-kód):' : 'Output of the PL/0 program (run here, the same P-code):'}</div>
                    <pre className="rd-output">{run.output}{run.error ? `\n[${run.error}]` : ''}</pre>
                    <div className="hint-text">
                      {cz
                        ? 'Čísla jsou levý rozklad – stejný jako v krokování i v simulaci v záložce LL. Programy v ostatních jazycích vypíšou pro stejný vstup totéž.'
                        : 'The numbers are the left parse – the same as in the step simulator and on the LL tab. The programs in the other languages print the same for the same input.'}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <a className="btn btn-primary rd-link" href={interpreterLink(pcodeText, vmInput)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} />
                    <span>{cz ? 'Otevřít v interpretu PL/0 (P-kód a vstup)' : 'Open in the PL/0 interpreter (P-code and input)'}</span>
                  </a>
                  <button type="button" className="btn btn-secondary rd-link" onClick={runGeneratedJs}>
                    <Play size={13} />
                    <span>{cz ? 'Spustit JavaScript v prohlížeči' : 'Run the JavaScript in the browser'}</span>
                  </button>
                </div>
                {jsRunOutput !== null && (
                  <div className={`report-box ${jsRunOutput.endsWith('OK') ? 'success' : 'danger'}`} style={{ marginTop: '8px' }}>
                    <div style={{ fontWeight: 700 }}>{cz ? 'Výstup programu v JavaScriptu:' : 'Output of the JavaScript program:'}</div>
                    <pre className="rd-output">{jsRunOutput}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* SUBTAB 3: Rule actions of the symbol table */}
      {subTab === 'symtab' && (
        <div className="card">
          <div className="card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="var(--color-primary)" />
              {cz ? 'Akce tabulky symbolů u pravidel gramatiky' : 'Symbol table actions of the grammar rules'}
            </span>
          </div>

          <p className="hint-text" style={{ marginBottom: '12px' }}>
            {cz
              ? 'Procedura pravidla může kromě syntaktické analýzy pracovat s tabulkou symbolů: po přečtení identifikátoru deklarovat jeho jméno (jméno je text ze vstupu, např. x pro terminál id), otevřít rozsah před některým symbolem pravé strany a zavřít ho po jiném. Každý jiný přečtený identifikátor je použití jména: hledá se od nejvnitřnějšího otevřeného rozsahu ven. Akce se rozpoznají podle klíčových slov níže; v tabulce je lze upravit.'
              : 'Besides parsing, the procedure of a rule can work with the symbol table: declare the name of an identifier after reading it (the name is the text of the input, e.g. x for the terminal id), and open a scope before one symbol of the right-hand side and close it after another. Every other identifier read is a use of a name: it is looked up from the innermost open scope outwards. The actions are detected from the keywords below and can be edited in the table.'}
          </p>

          {symbolTableHelp}

          <label className="rd-check" style={{ margin: '0 0 12px' }}>
            <input type="checkbox" checked={stopOnSemanticErrors} onChange={e => setStopOnSemanticErrors(e.target.checked)} />
            <span>{cz ? 'Nedeklarované jméno a jméno deklarované v jednom rozsahu dvakrát jsou sémantické chyby, které zastaví rekurzivní sestup' : 'An undeclared name and a name declared twice in one scope are semantic errors that stop the recursive descent'}</span>
          </label>

          {/* Editable Keyword Configuration Box */}
          <div className="rd-keywords-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SlidersHorizontal size={15} color="var(--color-primary)" />
                {cz ? 'Klíčová slova pro rozpoznání deklarací a rozsahů' : 'Keywords for detecting declarations and scopes'}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                onClick={() => setShowKeywordEditor(s => !s)}
              >
                {showKeywordEditor ? (cz ? 'Skrýt' : 'Hide') : (cz ? 'Zobrazit' : 'Show')}
              </button>
            </div>

            {showKeywordEditor && (
              <>
                <div className="rd-keywords-grid">
                  {([
                    ['procKeywords', cz ? 'Procedury a funkce (za slovem následuje jméno a vlastní rozsah)' : 'Procedures and functions (followed by the name; own scope)'],
                    ['scopeOpeners', cz ? 'Začátek bloku (rozsahem je, jen když jsou v něm deklarace)' : 'Start of a block (a scope only when it contains declarations)'],
                    ['scopeClosers', cz ? 'Konec bloku' : 'End of a block'],
                    ['declKeywords', cz ? 'Deklarace (var, const – const a val jsou konstanty)' : 'Declarations (var, const – const and val are constants)'],
                    ['typeKeywords', cz ? 'Datové typy (int x deklaruje x typu int)' : 'Data types (int x declares x of type int)'],
                    ['idSymbols', cz ? 'Terminály identifikátorů (jména ze vstupu)' : 'Identifier terminals (names in the input)']
                  ] as [keyof typeof keywordInputs, string][]).map(([field, label]) => (
                    <label key={field} className="rd-keyword-field">
                      <span className="rd-keyword-label">{label}</span>
                      <input
                        type="text"
                        className="rd-keyword-input"
                        value={keywordInputs[field]}
                        onChange={e => setKeywordInputs(k => ({ ...k, [field]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') applyKeywordChanges(); }}
                      />
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" onClick={applyKeywordChanges}>
                    <Sparkles size={13} />
                    <span>{cz ? 'Rozpoznat akce podle těchto slov' : 'Detect the actions with these words'}</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetKeywordsToDefault}>
                    <RotateCcw size={13} />
                    <span>{cz ? 'Výchozí klíčová slova' : 'Default keywords'}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', margin: '14px 0 8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>
              {actionMode === 'none'
                ? (cz ? 'Akce jsou vypnuté (jen syntaktická analýza)' : 'Actions are off (parsing only)')
                : actionMode === 'custom'
                  ? (cz ? 'Akce upravené ručně' : 'Actions edited by hand')
                  : (cz ? 'Rozpoznané akce' : 'Detected actions')}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn ${actionMode === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => setActionMode('none')}
              >
                {cz ? 'Vypnout akce' : 'Switch actions off'}
              </button>
              <button
                type="button"
                className={`btn ${actionMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => setActionMode('auto')}
              >
                <Sparkles size={11} />
                <span>{cz ? 'Rozpoznat znovu' : 'Detect again'}</span>
              </button>
            </div>
          </div>

          {isPureSyntaxMode && actionMode !== 'none' && (
            <div className="report-box info" style={{ margin: '8px 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} />
              <span style={{ fontSize: '12px' }}>
                {cz
                  ? 'V gramatice nebyly rozpoznány deklarace ani bloky s deklaracemi, simulace je jen syntaktická. Akce lze přidat v tabulce ručně nebo upravit klíčová slova výše.'
                  : 'No declarations or blocks with declarations were recognised in the grammar, so the simulation is purely syntactic. Add actions in the table by hand or adjust the keywords above.'}
              </span>
            </div>
          )}

          <div className="data-table-container">
            <table className="data-table rd-actions-table">
              <thead>
                <tr>
                  <th style={{ width: '44px' }}>{cz ? 'Č.' : 'No.'}</th>
                  <th>{cz ? 'Pravidlo' : 'Rule'}</th>
                  <th>{cz ? 'Akce' : 'Actions'}</th>
                  <th>{cz ? 'Co provede' : 'What it does'}</th>
                </tr>
              </thead>
              <tbody>
                {grammar.productions.map(p => {
                  const acts = ruleActions.filter(a => a.ruleId === p.id && a.actionType !== 'none');
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{p.id}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="sym-nt">{p.lhs}</span> → {p.rhs.map((s, i) => <span key={i} title={`${i + 1}`}>{s} </span>)}{p.rhs.length === 0 && 'ε'}
                      </td>
                      <td>
                        {acts.map((act, k) => renderActionEditor(p, act, k))}
                        {actionMode !== 'none' && (
                          <button
                            type="button"
                            className="rd-icon-btn rd-add-action"
                            onClick={() => editActions(list => [...list, newAction(p, p.rhs.length === 0 ? 'custom' : 'addSymbol')])}
                            title={cz ? 'Přidat akci' : 'Add an action'}
                          >
                            <Plus size={12} />
                            <span>{cz ? 'akce' : 'action'}</span>
                          </button>
                        )}
                      </td>
                      <td style={{ fontSize: '11.5px' }}>
                        {acts.length === 0
                          ? <span className="hint-text">–</span>
                          : acts.map((act, k) => <div key={k}>{describeAction(act, p)}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint-text" style={{ marginTop: '8px', fontSize: '11.5px' }}>
            <ArrowRight size={11} />{' '}
            {cz
              ? 'Pozice jsou pořadí symbolů pravé strany (1 = první). $type = typové klíčové slovo přečtené naposled, $name = jméno deklarované naposled (název rozsahu procedury). Vlastní kód (JS) se provede při výběru pravidla s objektem ctx (ctx.symTab je tabulka symbolů).'
              : 'Positions count the symbols of the right-hand side (1 = the first). $type = the type keyword read last, $name = the name declared last (the scope name of a procedure). Own code (JS) runs when the rule is chosen, with the object ctx (ctx.symTab is the symbol table).'}
          </p>
        </div>
      )}
    </div>
  );
};
