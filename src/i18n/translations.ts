/**
 * Bilingual Academic Terminology (English & Czech)
 */

export type Language = 'en' | 'cz';

export const TRANSLATIONS = {
  en: {
    appTitle: 'Grammar Analyser',
    appSubtitle: 'Interactive University Laboratory for Formal Languages, Automata & Compilers',
    editorTitle: 'Grammar Specification',
    editorPlaceholder: 'Enter grammar rules (e.g. E -> E + T | T)',
    syntaxHintTitle: 'Syntax Tips:',
    syntaxNonTerminals: '• Non-terminals: uppercase or <name>',
    syntaxTerminals: '• Terminals: lowercase, "+", "*", "id"',
    syntaxEps: '• Epsilon (empty): ε, eps, epsilon, ""',
    syntaxAlts: '• Alternatives: | or newline',
    syntaxSyntaxLine: 'Syntax: -> | ::= | : | =',
    syntaxErrorTitle: 'Grammar Syntax Error',
    pleaseSpecifyGrammar: 'Please specify a valid formal grammar in the editor to view analysis results.',

    presets: 'Textbook Presets',
    loadPreset: 'Load Preset',
    transformActions: 'Transformations',
    reduceGrammar: 'Reduce Grammar',
    removeEps: 'Eliminate Epsilon (ε)',
    removeUnits: 'Eliminate Unit Rules (A -> B)',
    removeLeftRec: 'Eliminate Left Recursion',
    leftFactor: 'Left Factorize',
    toCNF: 'Chomsky Normal Form (CNF)',
    toGNF: 'Greibach Normal Form (GNF)',
    applyToEditor: 'Apply Result to Editor',
    transformedOutputTitle: 'Transformed Grammar Output',
    directGrammarRulesTitle: 'Direct Grammar Rules & Symbol Transformations',
    directTransformHint: 'Transform the grammar directly: select an available transformation from any symbol\'s combo box to apply it. Use Undo or Reset at any time.',
    chooseSymbolTransformPlaceholder: '-- Available transformations for {symbol} ({count}) --',
    noTransformationsForSymbol: 'No transformations available for this symbol',
    automaticConstructionsTitle: 'Automatic Grammar Constructions',
    btnCNF: 'Chomsky Normal Form (CNF)',
    btnGNF: 'Greibach Normal Form (GNF)',
    btnReduce: 'Reduce Grammar',
    btnRemoveEps: 'Eliminate Epsilon (ε)',
    btnRemoveUnits: 'Eliminate Unit Rules',
    btnRemoveLeftRec: 'Eliminate Left Recursion',
    btnLeftFactor: 'Left Factorize All',
    undoStep: 'Undo Step',
    resetToInitial: 'Reset to Initial Grammar',
    appliedStepsHistory: 'Step-by-Step History & Proof Log',
    rulesCountSuffix: 'rule(s)',
    startSymbolBadge: 'Start',
    recalculateAnalysis: 'Recalculate Analysis',
    recalculating: 'Recalculating...',
    outdatedResultsBanner: 'Grammar has changed. Analysis results are outdated.',
    heavyGrammarNotice: 'Analysis took {ms} ms. Auto-recalculation is paused while typing.',
    calcDuration: 'Calculated in {ms} ms',

    tabOverview: 'Overview',
    tabFirstFollow: 'FIRST & FOLLOW',
    tabTransform: 'Transformations',
    tabLL: 'LL(k) Analyser',
    tabLR: 'LR(k) Analyser',
    tabGraph: 'Automaton Graph',
    tabWords: 'Word Generator',
    tabLatex: 'LaTeX & Export',

    grammarProperties: 'Grammar Properties & Symbols',
    nonTerminals: 'Non-Terminals',
    terminals: 'Terminals',
    startSymbol: 'Start Symbol',
    nullableSymbols: 'Nullable Symbols (derive ε)',
    endableSymbols: 'Endable / Generating Symbols',
    reachableSymbols: 'Reachable Symbols',
    productionRules: 'Production Rules',
    classification: 'Automaton Classification',
    isLL1: 'LL(1) Grammar',
    isLL2: 'LL(2) Grammar',
    isLR0: 'LR(0) Grammar',
    isSLR1: 'SLR(1) Grammar',
    isLALR1: 'LALR(1) Grammar',
    isLR1: 'LR(1) Grammar',
    passZeroConflicts: 'Pass (0 conflicts)',
    conflictsCountSuffix: 'conflict(s)',

    // First & Follow
    firstFollowNtTitle: 'FIRST and FOLLOW Sets for Non-Terminals',
    predictSetsTitle: 'Production Predict / Lookahead Sets (Director Sets)',
    predictSetsDesc: 'Calculated as LOOKAHEAD₁(A → α) = FIRST₁(α · FOLLOW₁(A)). These determine the LL(1) parsing table entries.',
    colNonTerminal: 'Non-Terminal',
    colNullable: 'Nullable',
    colProduction: 'Production',
    colFirstRhs: 'FIRST₁(RHS)',
    colLookahead: 'LOOKAHEAD₁ (Director Set)',
    yesEps: 'Yes (ε)',
    no: 'No',
    none: 'none',

    // LL Analyser & Simulator
    llStatusTitle: 'LL(1) & LL(2) Status',
    ll1Valid: 'LL(1) Valid',
    ll2Valid: 'Not LL(1), but LL(2) Valid',
    notLL: 'Not LL(1) or LL(2)',
    llConflictsDetected: 'LL(1) Conflict(s) Detected:',
    firstFirstConflict: 'First/First conflict',
    firstFollowConflict: 'First/Follow conflict',
    llTableTitle: 'LL(1) Parsing Table M[A, a]',
    parsingSimulator: 'Interactive Parsing Simulator',
    inputWord: 'Input Word / Tokens',
    tokensPlaceholder: 'Space-separated tokens (e.g. id + id * id)',
    runSimulation: 'Test Word',
    stepForward: 'Step Forward',
    stepBackward: 'Step Backward',
    play: 'Play',
    pause: 'Pause',
    reset: 'Reset',
    speed: 'Speed:',
    stepCountLabel: 'Step {current} of {total}',
    stack: 'Stack',
    topOnRight: '(Top on right)',
    stateStack: 'State Stack',
    symbolStack: 'Symbol Stack',
    remainingInput: 'Remaining Input',
    action: 'Action',
    parseTree: 'Derivation / Parse Tree',
    activeTableLookup: 'Active Table Lookup (Line & Column Applied):',
    activeLineRow: 'Line (Row)',
    activeColumn: 'Column',
    topOfStackBadge: 'TOP',
    decisionSymbolBadge: 'LOOKAHEAD',
    decisionSymbolHint: 'Input symbol used for decision:',
    topOfStackHint: 'Top of stack:',

    // LR Analyser & Simulator
    variant: 'Automaton Variant',
    statusFor: 'Status for',
    statesCount: 'States:',
    conflictsInVariant: 'Conflict(s) in {variant}:',
    noConflicts: 'No conflicts detected. Grammar belongs to this class!',
    lrTableTitle: 'Parsing Table (ACTION & GOTO)',
    shiftReduceConflict: 'Shift/Reduce conflict',
    reduceReduceConflict: 'Reduce/Reduce conflict',
    bottomUpTreeLabel: 'Derivation / Parse Tree (Bottom-Up Construction)',

    // Automaton Graph
    graphTitle: 'LR Automaton State Graph',
    graphDesc: 'Interactive state transition graph (DFA of item sets). Click any state to inspect items and table row. Drag background to pan, scroll to zoom.',
    inspectingState: 'Inspecting State {id}',
    startState: '(Start State)',
    initialState: '(Initial)',
    lrItemsInState: 'LR Items in State:',
    outgoingTransitions: 'Outgoing Transitions ({count}):',
    tableRowForState: 'Parsing Table Row for State {id}:',

    // Word Generator
    generateNewExamples: 'Generate New Examples',
    wordsDesc: 'Automatically generates shortest and random valid sentences in L(G), demonstrating the exact sequence of leftmost derivation steps.',
    wordsInLanguage: 'Generated Words in L(G):',
    leftmostSequence: 'Leftmost Derivation Sequence',
    derivationStepsCount: '{count} steps',
    derivationTree: 'Derivation Tree',
    byRule: 'by',
    stepPrefix: 'Step',
    noWordsGenerated: 'No valid terminal words could be derived. Grammar may have unproductive non-terminals.',

    // LaTeX Exporter
    exportToLatex: 'Generate LaTeX Code',
    completeArticle: 'Complete Article (All Tables)',
    grammarAlign: 'Grammar (align*)',
    firstFollowTable: 'FIRST & FOLLOW Table',
    llTableTab: 'LL(1) Table',
    slrTableTab: 'SLR(1) Table',
    downloadTex: 'Download .tex',
    copyClipboard: 'Copy to Clipboard',
    copied: 'Copied!',

    // Themes & Proofs
    theme: 'Theme',
    projectorMode: 'Projector / Lecture Mode',
    dark: 'Dark Mode',
    light: 'Light Mode',
    mathProofLog: 'Step-by-Step Mathematical Explanation',
    stepTitle: 'Step {num}: {title}',
    removedRulesLabel: 'Removed rules:'
  },
  cz: {
    appTitle: 'Analyzátor gramatik',
    appSubtitle: 'Interaktivní univerzitní laboratoř formálních jazyků, automatů a překladačů',
    editorTitle: 'Zadání formální gramatiky',
    editorPlaceholder: 'Zadejte pravidla gramatiky (např. E -> E + T | T)',
    syntaxHintTitle: 'Tipy pro zápis syntaktických pravidel:',
    syntaxNonTerminals: '• Neterminály: velká písmena nebo <název>',
    syntaxTerminals: '• Terminály: malá písmena, "+", "*", "id"',
    syntaxEps: '• Epsilon (prázdné slovo): ε, eps, epsilon, ""',
    syntaxAlts: '• Alternativy: | nebo nový řádek',
    syntaxSyntaxLine: 'Syntaxe: -> | ::= | : | =',
    syntaxErrorTitle: 'Chyba v zápisu gramatiky',
    pleaseSpecifyGrammar: 'Pro zobrazení výsledků analýzy zadejte v editoru platnou formální gramatiku.',

    presets: 'Učebnicové příklady',
    loadPreset: 'Načíst příklad',
    transformActions: 'Ekvivalentní transformace',
    reduceGrammar: 'Redukovat gramatiku',
    removeEps: 'Odstranit epsilon pravidla (ε)',
    removeUnits: 'Odstranit jednoduchá pravidla (A -> B)',
    removeLeftRec: 'Odstranit levou rekurzi',
    leftFactor: 'Levá faktorizace',
    toCNF: 'Chomsky Normal Form (CNF)',
    toGNF: 'Greibach Normal Form (GNF)',
    applyToEditor: 'Vložit výsledek do editoru',
    transformedOutputTitle: 'Výstup transformované gramatiky',
    directGrammarRulesTitle: 'Pravidla gramatiky a transformace symbolů',
    directTransformHint: 'Pracujte s gramatikou přímo: vyberte dostupnou transformaci z rozbalovací nabídky u libovolného symbolu pro její okamžité provedení. Níže jsou k dispozici automatické konstrukce celé gramatiky.',
    chooseSymbolTransformPlaceholder: '-- Dostupné transformace pro {symbol} ({count}) --',
    noTransformationsForSymbol: 'Pro tento symbol není dostupná žádná transformace',
    automaticConstructionsTitle: 'Automatické konstrukce gramatiky',
    btnCNF: 'Chomského normální forma (CNF)',
    btnGNF: 'Greibachové normální forma (GNF)',
    btnReduce: 'Redukovat gramatiku',
    btnRemoveEps: 'Odstranit epsilon pravidla (ε)',
    btnRemoveUnits: 'Odstranit jednoduchá pravidla',
    btnRemoveLeftRec: 'Odstranit levou rekurzi',
    btnLeftFactor: 'Levá faktorizace všech',
    undoStep: 'Vrátit krok zpět',
    resetToInitial: 'Obnovit výchozí gramatiku',
    appliedStepsHistory: 'Historie transformací a matematický důkaz',
    rulesCountSuffix: 'pravidel',
    startSymbolBadge: 'Počáteční',
    recalculateAnalysis: 'Přepočítat analýzu',
    recalculating: 'Přepočítávám...',
    outdatedResultsBanner: 'Gramatika byla změněna. Výsledky analýzy jsou neaktuální.',
    heavyGrammarNotice: 'Analýza trvala {ms} ms. Automatický přepočet je při psaní pozastaven.',
    calcDuration: 'Vypočteno za {ms} ms',

    tabOverview: 'Přehled',
    tabFirstFollow: 'FIRST & FOLLOW',
    tabTransform: 'Transformace',
    tabLL: 'LL(k) analyzátor',
    tabLR: 'LR(k) analyzátor',
    tabGraph: 'Graf automatu',
    tabWords: 'Generátor slov',
    tabLatex: 'LaTeX a export',

    grammarProperties: 'Vlastnosti gramatiky a symboly',
    nonTerminals: 'Neterminální symboly',
    terminals: 'Terminální symboly',
    startSymbol: 'Počáteční symbol',
    nullableSymbols: 'Nulovatelné symboly (odvodí ε)',
    endableSymbols: 'Ukončitelné / generující symboly',
    reachableSymbols: 'Dosažitelné symboly',
    productionRules: 'Pravidla gramatiky',
    classification: 'Klasifikace automatů',
    isLL1: 'LL(1) gramatika',
    isLL2: 'LL(2) gramatika',
    isLR0: 'LR(0) gramatika',
    isSLR1: 'SLR(1) gramatika',
    isLALR1: 'LALR(1) gramatika',
    isLR1: 'LR(1) gramatika',
    passZeroConflicts: 'Splněno (0 konfliktů)',
    conflictsCountSuffix: 'konflikt(ů)',

    // First & Follow
    firstFollowNtTitle: 'Množiny FIRST a FOLLOW pro neterminály',
    predictSetsTitle: 'Množiny LOOKAHEAD / ředitelské množiny pravidel',
    predictSetsDesc: 'Vypočteno jako LOOKAHEAD₁(A → α) = FIRST₁(α · FOLLOW₁(A)). Tyto množiny určují položky v rozkladové tabulce LL(1).',
    colNonTerminal: 'Neterminál',
    colNullable: 'Nulovatelný',
    colProduction: 'Pravidlo',
    colFirstRhs: 'FIRST₁(pravá strana)',
    colLookahead: 'LOOKAHEAD₁ (Ředitelská množina)',
    yesEps: 'Ano (ε)',
    no: 'Ne',
    none: 'žádné',

    // LL Analyser & Simulator
    llStatusTitle: 'Stav LL(1) a LL(2)',
    ll1Valid: 'Platná LL(1)',
    ll2Valid: 'Není LL(1), ale je platná LL(2)',
    notLL: 'Není LL(1) ani LL(2)',
    llConflictsDetected: 'Detekováno LL(1) konfliktů:',
    firstFirstConflict: 'Konflikt First/First',
    firstFollowConflict: 'Konflikt First/Follow',
    llTableTitle: 'LL(1) rozkladová tabulka M[A, a]',
    parsingSimulator: 'Interaktivní simulátor syntaktické analýzy',
    inputWord: 'Vstupní slovo / tokeny',
    tokensPlaceholder: 'Mezerami oddělené tokeny (např. id + id * id)',
    runSimulation: 'Ověřit slovo',
    stepForward: 'Krok vpřed',
    stepBackward: 'Krok vzad',
    play: 'Přehrát',
    pause: 'Pozastavit',
    reset: 'Reset',
    speed: 'Rychlost:',
    stepCountLabel: 'Krok {current} z {total}',
    stack: 'Zásobník',
    topOnRight: '(Vrchol vpravo)',
    stateStack: 'Zásobník stavů',
    symbolStack: 'Zásobník symbolů',
    remainingInput: 'Zbývající vstup',
    action: 'Provedená akce',
    parseTree: 'Derivační strom',
    activeTableLookup: 'Aktivní položka rozkladu (Použitý řádek a sloupec):',
    activeLineRow: 'Řádek (linie)',
    activeColumn: 'Sloupec',
    topOfStackBadge: 'VRCHOL',
    decisionSymbolBadge: 'ČTENÝ VSTUP',
    decisionSymbolHint: 'Vstupní symbol pro rozhodnutí:',
    topOfStackHint: 'Vrchol zásobníku:',

    // LR Analyser & Simulator
    variant: 'Varianta automatu',
    statusFor: 'Stav pro',
    statesCount: 'Počet stavů:',
    conflictsInVariant: 'Počet konfliktů pro {variant}:',
    noConflicts: 'Žádné konflikty. Gramatika náleží do této třídy!',
    lrTableTitle: 'Rozkladová tabulka (ACTION a GOTO)',
    shiftReduceConflict: 'Konflikt posun/redukce (Shift/Reduce)',
    reduceReduceConflict: 'Konflikt redukce/redukce (Reduce/Reduce)',
    bottomUpTreeLabel: 'Derivační strom (zdola nahoru)',

    // Automaton Graph
    graphTitle: 'Graf stavů LR automatu',
    graphDesc: 'Interaktivní graf přechodů automatu (DFA množin položek). Klikněte na stav pro zobrazení položek a řádku tabulky. Tažením posouváte, kolečkem myši přibližujete.',
    inspectingState: 'Detail stavu {id}',
    startState: '(Počáteční stav)',
    initialState: '(Počáteční)',
    lrItemsInState: 'LR položky ve stavu:',
    outgoingTransitions: 'Výstupní přechody ({count}):',
    tableRowForState: 'Řádek rozkladové tabulky pro stav {id}:',

    // Word Generator
    generateNewExamples: 'Vygenerovat nové příklady',
    wordsDesc: 'Automaticky generuje nejkratší a náhodné platné věty jazyka L(G) s demonstrací přesné posloupnosti kroků levé derivace.',
    wordsInLanguage: 'Vygenerovaná slova v L(G):',
    leftmostSequence: 'Posloupnost levé derivace',
    derivationStepsCount: '{count} kroků',
    derivationTree: 'Derivační strom',
    byRule: 'podle',
    stepPrefix: 'Krok',
    noWordsGenerated: 'Nelze odvodit žádná terminální slova. Gramatika může obsahovat negenerující neterminály.',

    // LaTeX Exporter
    exportToLatex: 'Vygenerovat LaTeX kód',
    completeArticle: 'Kompletní dokument (všechny tabulky)',
    grammarAlign: 'Gramatika (align*)',
    firstFollowTable: 'Tabulka FIRST a FOLLOW',
    llTableTab: 'Tabulka LL(1)',
    slrTableTab: 'Tabulka SLR(1)',
    downloadTex: 'Stáhnout .tex',
    copyClipboard: 'Zkopírovat do schránky',
    copied: 'Zkopírováno!',

    // Themes & Proofs
    theme: 'Vzhled',
    projectorMode: 'Režim pro projektor / přednášky',
    dark: 'Tmavý režim',
    light: 'Světlý režim',
    mathProofLog: 'Krok za krokem: Matematické odůvodnění',
    stepTitle: 'Krok {num}: {title}',
    removedRulesLabel: 'Odstraněná pravidla:'
  }
};

/**
 * Format simulator action strings bilingually
 */
export function formatLLAction(
  type: 'expand' | 'match' | 'accept' | 'error_empty' | 'error_end' | 'error_match' | 'error_table' | 'error_unknown',
  params: { rule?: string; sym?: string; expected?: string; found?: string; nt?: string; lookahead?: string },
  lang: Language
): string {
  if (lang === 'cz') {
    switch (type) {
      case 'expand':
        return `Aplikovat pravidlo: ${params.rule}`;
      case 'match':
        return `Shoda terminálu '${params.sym}'`;
      case 'accept':
        return 'Přijato: Slovo bylo úspěšně analyzováno!';
      case 'error_empty':
        return `Chyba: Zásobník je prázdný, ale zbývá nezpracovaný vstup '${params.found}'`;
      case 'error_end':
        return `Chyba: Očekáván konec vstupu, nalezeno '${params.found}'`;
      case 'error_match':
        return `Chyba: Očekáván terminál '${params.expected}', nalezeno '${params.found}'`;
      case 'error_table':
        return `Chyba: V rozkladové tabulce neexistuje pravidlo pro M[${params.nt}, ${params.lookahead}]`;
      case 'error_unknown':
        return `Chyba: Neznámý symbol '${params.sym}' na zásobníku`;
    }
  } else {
    switch (type) {
      case 'expand':
        return `Apply: ${params.rule}`;
      case 'match':
        return `Match terminal '${params.sym}'`;
      case 'accept':
        return 'Accept: Input successfully parsed!';
      case 'error_empty':
        return `Error: Stack empty but unconsumed input '${params.found}'`;
      case 'error_end':
        return `Error: Expected end of input, found '${params.found}'`;
      case 'error_match':
        return `Error: Expected terminal '${params.expected}', found '${params.found}'`;
      case 'error_table':
        return `Error: No production for M[${params.nt}, ${params.lookahead}]`;
      case 'error_unknown':
        return `Error: Unknown symbol '${params.sym}' on stack`;
    }
  }
}

export function formatLRActionMsg(
  type: 'shift' | 'reduce' | 'accept' | 'error_action' | 'error_goto',
  params: { tok?: string; state?: number; rule?: string; gotoState?: number; lookahead?: string; nt?: string },
  lang: Language
): string {
  if (lang === 'cz') {
    switch (type) {
      case 'shift':
        return `Posun: načten token '${params.tok}', přechod do stavu ${params.state}`;
      case 'reduce':
        return `Redukce: ${params.rule} -> GOTO stav ${params.gotoState}`;
      case 'accept':
        return 'Přijato: Slovo bylo úspěšně analyzováno!';
      case 'error_action':
        return `Chyba: V tabulce ACTION pro stav ${params.state} a symbol '${params.lookahead}' neexistuje akce`;
      case 'error_goto':
        return `Chyba: V tabulce GOTO chybí přechod pro neterminál '${params.nt}' ze stavu ${params.state}`;
    }
  } else {
    switch (type) {
      case 'shift':
        return `Shift: push token '${params.tok}', transition to State ${params.state}`;
      case 'reduce':
        return `Reduce: ${params.rule} -> GOTO State ${params.gotoState}`;
      case 'accept':
        return 'Accept: Word successfully parsed!';
      case 'error_action':
        return `Error: No action in ACTION[State ${params.state}, '${params.lookahead}']`;
      case 'error_goto':
        return `Error: Missing GOTO[State ${params.state}, '${params.nt}']`;
    }
  }
}
