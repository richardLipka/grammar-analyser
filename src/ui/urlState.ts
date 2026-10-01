/**
 * Grammar links: ?g=<grammar>&w=<word>&tab=ll&e=eps&preset=<id>&lang=en&theme=projector
 *
 * - Values are percent-encoded (encodeURIComponent). A '+' stays a plus sign
 *   (E' -> +TE'), it is not read as a space as in HTML forms.
 * - A stray '%' typed by hand (%empty, %token) is kept as it is.
 * - The same parameters are accepted after '#', which some course systems keep
 *   when they drop the query string; the hash wins over the query.
 * - Rules can be separated by encoded new lines (%0A) or by ';' (S->aAS|b;A->a|bSA).
 */

export type UrlTab = 'overview' | 'firstFollow' | 'transformations' | 'll' | 'lr' | 'graph' | 'words' | 'latex';

export interface UrlState {
  grammar?: string;
  preset?: string;
  word?: string;
  tab?: UrlTab;
  /** How a standalone e is read; undefined = ask. */
  e?: 'epsilon' | 'terminal';
  lang?: 'en' | 'cz';
  theme?: 'light' | 'dark' | 'projector';
}

const TAB_ALIASES: Record<string, UrlTab> = {
  overview: 'overview',
  firstfollow: 'firstFollow', 'first-follow': 'firstFollow', ff: 'firstFollow', first: 'firstFollow',
  transformations: 'transformations', transform: 'transformations',
  ll: 'll', lr: 'lr',
  graph: 'graph', automaton: 'graph',
  words: 'words', derivations: 'words',
  latex: 'latex'
};

const E_ALIASES: Record<string, 'epsilon' | 'terminal'> = {
  eps: 'epsilon', epsilon: 'epsilon', 'ε': 'epsilon', '1': 'epsilon', true: 'epsilon', yes: 'epsilon',
  term: 'terminal', terminal: 'terminal', '0': 'terminal', false: 'terminal', no: 'terminal'
};

/** Decodes every valid %XX sequence and keeps anything else literally. */
function decodeLenient(raw: string): string {
  return raw.replace(/(?:%[0-9A-Fa-f]{2})+/g, seq => {
    try {
      return decodeURIComponent(seq);
    } catch {
      return seq;
    }
  });
}

function readParams(query: string, into: Map<string, string>) {
  for (const part of query.replace(/^[?#]/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    into.set(decodeLenient(part.slice(0, eq)).toLowerCase(), decodeLenient(part.slice(eq + 1)));
  }
}

export function readUrlState(search: string, hash: string): UrlState {
  const params = new Map<string, string>();
  readParams(search, params);
  readParams(hash, params);
  const get = (...keys: string[]) => keys.map(k => params.get(k)).find(v => v !== undefined);

  const state: UrlState = {};
  const grammar = get('g', 'grammar');
  if (grammar !== undefined && grammar.trim() !== '') state.grammar = grammar;
  const preset = get('preset', 'p');
  if (preset) state.preset = preset;
  const word = get('w', 'word', 'input');
  if (word !== undefined) state.word = word;
  const tab = TAB_ALIASES[(get('tab', 't') ?? '').toLowerCase()];
  if (tab) state.tab = tab;
  const e = E_ALIASES[(get('e') ?? '').toLowerCase()];
  if (e) state.e = e;
  const lang = (get('lang', 'l') ?? '').toLowerCase();
  if (lang === 'en') state.lang = 'en';
  else if (lang === 'cz' || lang === 'cs') state.lang = 'cz';
  const theme = (get('theme') ?? '').toLowerCase();
  if (theme === 'light' || theme === 'dark' || theme === 'projector') state.theme = theme;
  return state;
}

/** A link to `base` (origin + path) that opens the grammar; empty fields and the overview tab are left out. */
export function buildShareUrl(base: string, state: UrlState): string {
  const pairs: [string, string | undefined][] = [
    ['g', state.grammar],
    ['w', state.word || undefined],
    ['e', state.e === undefined ? undefined : state.e === 'epsilon' ? 'eps' : 'term'],
    ['tab', state.tab === 'overview' ? undefined : state.tab],
    ['preset', state.preset],
    ['lang', state.lang],
    ['theme', state.theme]
  ];
  const query = pairs
    .filter((p): p is [string, string] => p[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
}
