import { describe, it, expect } from 'vitest';
import { readUrlState, buildShareUrl } from '../ui/urlState';
import { parseGrammar } from '../core/parser/grammarParser';

const BASE = 'https://richardlipka.github.io/grammar-analyser/';

describe('Grammar links', () => {
  it('reads a percent-encoded grammar with new lines, primes and arrows', () => {
    const text = "E  --> TE'     (1)\n\nE' --> +TE'    (2)\nE' --> e";
    const state = readUrlState(`?g=${encodeURIComponent(text)}&w=a%20%2B%20a`, '');
    expect(state.grammar).toBe(text);
    expect(state.word).toBe('a + a');
  });

  it("keeps '+' as a plus sign and a stray % as it is (hand-written links)", () => {
    const state = readUrlState("?g=E'->+TE'|%empty;E->TE'&w=a+a", '');
    expect(state.grammar).toBe("E'->+TE'|%empty;E->TE'");
    expect(state.word).toBe('a+a');
  });

  it('accepts the parameters after # and prefers them to the query', () => {
    expect(readUrlState('', '#g=S%20-%3E%20a').grammar).toBe('S -> a');
    expect(readUrlState('?g=S->a', '#g=S->b').grammar).toBe('S->b');
    expect(readUrlState('', '#section-2')).toEqual({});
  });

  it('reads tab, e, language, theme and preset with their aliases', () => {
    expect(readUrlState('?grammar=S->a&tab=LL&e=eps&lang=cs&theme=projector&preset=strong_ll2', '')).toEqual({
      grammar: 'S->a', tab: 'll', e: 'epsilon', lang: 'cz', theme: 'projector', preset: 'strong_ll2'
    });
    expect(readUrlState('?tab=first-follow&e=terminal&lang=EN', '')).toEqual({ tab: 'firstFollow', e: 'terminal', lang: 'en' });
    expect(readUrlState('?tab=nonsense&e=maybe&theme=pink&g=%20', '')).toEqual({});
  });

  it('builds links that read back to the same state', () => {
    const state = {
      grammar: "S --> aAS    (1)\nS --> b      (2)\nA --> a | bSA & \"x\" # 100%",
      word: 'a b b a b',
      e: 'terminal' as const,
      tab: 'lr' as const
    };
    const url = buildShareUrl(BASE, state);
    expect(url.startsWith(`${BASE}?g=`)).toBe(true);
    expect(url).not.toMatch(/[\s"#|>]/);
    const { search, hash } = new URL(url);
    expect(readUrlState(search, hash)).toEqual(state);
  });

  it('leaves out empty values and the overview tab', () => {
    expect(buildShareUrl(BASE, { grammar: 'S -> a', word: '', tab: 'overview' })).toBe(`${BASE}?g=S%20-%3E%20a`);
  });

  it('a one-line grammar from a link is analysed like the multi-line one', () => {
    const state = readUrlState('?g=S-->aAS|b;A-->a|bSA', '');
    const res = parseGrammar(state.grammar!);
    expect(res.errors).toEqual([]);
    expect(res.grammar!.productions.map(p => `${p.lhs} -> ${p.rhs.join(' ')}`))
      .toEqual(['S -> a A S', 'S -> b', 'A -> a', 'A -> b S A']);
  });
});
