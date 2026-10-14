/**
 * Curated Sample Grammars specifically designed for demonstrating
 * Recursive Descent Parsing, Scoping (Stack of Stacks), and Pure Syntax Parsing.
 */

export interface RDSampleGrammar {
  id: string;
  nameEn: string;
  nameCz: string;
  descriptionEn: string;
  descriptionCz: string;
  grammarText: string;
  sampleInput: string;
  type: 'pure' | 'c_blocks' | 'pascal_pl0' | 'modern';
}

export const RD_SAMPLE_GRAMMARS: RDSampleGrammar[] = [
  {
    id: 'rd_sample_pure_arithmetic',
    nameEn: '1. Arithmetic Expressions (Pure Syntax / No Symbol Table)',
    nameCz: '1. Aritmetické výrazy (Čistá syntaxe / bez tabulky symbolů)',
    descriptionEn: 'Classic factored LL(1) arithmetic expression grammar with zero declarations or scopes. Proves recursive descent runs fully without a symbol table.',
    descriptionCz: 'Klasická faktorizovaná LL(1) gramatika aritmetických výrazů bez jakýchkoliv deklarací či bloků. Demonstruje rekurzivní sestup bez tabulky symbolů.',
    grammarText: `Expr -> Term Expr'
Expr' -> "+" Term Expr' | "-" Term Expr' | ε
Term -> Factor Term'
Term' -> "*" Factor Term' | "/" Factor Term' | ε
Factor -> "(" Expr ")" | "id" | "num"`,
    sampleInput: 'id + num * ( id - num )',
    type: 'pure'
  },
  {
    id: 'rd_sample_c_blocks',
    nameEn: '2. C-Style Nested Block Scoping ({ ... }, int/float/char)',
    nameCz: '2. C-bloky a vnořené rozsahy ({ ... }, int/float/char)',
    descriptionEn: 'Nested lexical blocks with curly braces and typed variable declarations. Demonstrates scope stacking, variable declaration, shadowing, and scope popping.',
    descriptionCz: 'Vnořené lexikální bloky ve složených závorkách s typovanými proměnnými. Demonstruje vrstvení zásobníků rozsahů, deklarace, stínění (shadowing) a rušení bloků.',
    grammarText: `Program -> Block
Block -> "{" Decls Stmts "}"
Decls -> Decl Decls | ε
Decl -> Type "id" ";"
Type -> "int" | "float" | "char"
Stmts -> Stmt Stmts | ε
Stmt -> Block | "id" "=" "num" ";"`,
    sampleInput: '{ int id ; { float id ; char id ; id = num ; } id = num ; }',
    type: 'c_blocks'
  },
  {
    id: 'rd_sample_pascal_pl0',
    nameEn: '3. Pascal / PL/0 Procedures & Variables (var, procedure, begin..end)',
    nameCz: '3. PL/0 procedury a proměnné (var, procedure, begin..end)',
    descriptionEn: 'Classic Pascal/PL/0 structure with global variables, nested procedure declarations, local scopes, and compound statements (begin ... end).',
    descriptionCz: 'Klasická Pascal/PL/0 struktura s globálními proměnnými, deklaracemi procedur, lokálními rozsahy a složenými příkazy (begin ... end).',
    grammarText: `Program -> Block "."
Block -> VarPart ProcPart Statement
VarPart -> "var" "id" VarRest ";" | ε
VarRest -> "," "id" VarRest | ε
ProcPart -> "procedure" "id" ";" Block ";" ProcPart | ε
Statement -> "begin" Stmts "end" | "id" ":=" "num" | "call" "id" | ε
Stmts -> Statement StmtRest
StmtRest -> ";" Statement StmtRest | ε`,
    sampleInput: 'var id , id ; procedure id ; var id ; begin id := num end ; begin call id end .',
    type: 'pascal_pl0'
  },
  {
    id: 'rd_sample_modern_script',
    nameEn: '4. Modern Scripting Declarations (let, const, function, { ... })',
    nameCz: '4. Moderní skriptovací deklarace (let, const, function, { ... })',
    descriptionEn: 'Modern language syntax distinguishing immutable constants (const) and mutable variables (let) within functions and block scopes.',
    descriptionCz: 'Moderní syntaxe rozlišující neměnné konstanty (const) a proměnné (let) v tělech funkcí a lexikálních blocích.',
    grammarText: `Script -> ItemList
ItemList -> Item ItemList | ε
Item -> VarDecl | FuncDecl | Block | Stmt
VarDecl -> "let" "id" ";" | "const" "id" ";"
FuncDecl -> "function" "id" "{" ItemList "}"
Block -> "{" ItemList "}"
Stmt -> "id" "=" "num" ";"`,
    sampleInput: 'const id ; let id ; function id { let id ; { const id ; id = num ; } }',
    type: 'modern'
  }
];
