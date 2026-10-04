/**
 * The words of the demonstrations come from the language of the grammar
 * being processed: the example word is accepted by an independent Earley
 * recognizer, has a reasonable length, reads back as the same tokens, and a
 * preset word is kept only while it belongs to the (edited) grammar.
 */
import { describe, it, expect } from 'vitest';
import { parseGrammar } from '../core/parser/grammarParser';
import { Grammar } from '../core/ast/grammar';
import { exampleWord, demonstrationWord, shortestYields, EXAMPLE_LIMIT } from '../core/generator/exampleWord';
import { tokenizeInput } from '../core/parser/inputTokenizer';
import { PRESET_GRAMMARS } from '../core/presets/presetGrammars';
import { accepts, wordsUpTo } from './earley';
import { randomGrammarText } from './randomGrammar';

const parse = (text: string): Grammar => {
  const res = parseGrammar(text);
  expect(res.errors).toEqual([]);
  return res.grammar!;
};

/** The checks every example word must pass. */
function checkWord(g: Grammar, word: string[]) {
  expect(accepts(g, word)).toBe(true);
  const shortest = shortestYields(g).len.get(g.startSymbol)!;
  expect(word.length).toBeLessThanOrEqual(Math.max(14, shortest));
  // what the simulators read back from the text is the same word
  expect(tokenizeInput(word.join(' '), g.terminals).tokens).toEqual(word);
}

describe('example word of the grammar', () => {
  it('every preset: a word of its language, of a reasonable length', () => {
    for (const preset of PRESET_GRAMMARS) {
      const g = parse(preset.grammarText);
      const word = exampleWord(g);
      expect(word, preset.id).not.toBeNull();
      checkWord(g, word!);
      // the languages of these presets are finite, with words of at most 4 symbols; the others give 6 or more
      const finite = ['lalr1_vs_lr1', 'll1_not_slr1', 'll2_not_strong'].includes(preset.id);
      expect(word!.length, `${preset.id}: ${word!.join(' ')}`).toBeGreaterThanOrEqual(finite ? 2 : 6);
    }
  });

  it('uses more rules than the shortest word', () => {
    const g = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id');
    const word = exampleWord(g)!;
    checkWord(g, word);
    for (const t of ['+', '*', '(', ')', 'id']) expect(word).toContain(t);
  });

  it('a recursive rule that comes first still ends', () => {
    const g = parse('S -> S | S S | a');
    const word = exampleWord(g)!;
    checkWord(g, word);
    expect(word.length).toBeGreaterThan(1);
  });

  it('a finite language gives one of its words; a word longer than the limit when there is no shorter', () => {
    checkWord(parse('S -> a b c'), exampleWord(parse('S -> a b c'))!);
    const long = parse(`S -> ${Array.from({ length: 20 }, () => 'a').join(' ')}`);
    expect(exampleWord(long)).toHaveLength(20);
    const eps = parse('S -> ε');
    expect(exampleWord(eps)).toEqual([]);
  });

  it('an empty language, or one with only too long words, has no example', () => {
    expect(exampleWord(parse('S -> a S'))).toBeNull();
    expect(demonstrationWord(parse('S -> a S'), 'a a')).toBe('');
    const tooLong = parse(`S -> ${Array.from({ length: EXAMPLE_LIMIT + 1 }, () => 'a').join(' ')}`);
    expect(exampleWord(tooLong)).toBeNull();
    expect(demonstrationWord(tooLong)).toBe('');
  });

  it('needs a rule that does not lengthen the word first (S → A, A → A A)', () => {
    const g = parse(['S -> ε | A | a', 'A -> S | A A | ε'].join('\n'));
    expect(exampleWord(g)).toEqual(Array.from({ length: 8 }, () => 'a'));
  });

  it('the length is one of the first three of the language that reach the target (exhaustive search)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = parse(randomGrammarText(seed));
      if (g.terminals.size > 3) continue;
      const word = exampleWord(g, { target: 4, max: 6 });
      const shortest = shortestYields(g).len.get(g.startSymbol);
      if (shortest === undefined || shortest > 6) continue;
      const lengths = new Set(wordsUpTo([...g.terminals], 6).filter(w => accepts(g, w)).map(w => w.length));
      const reaching = [4, 5, 6].filter(l => lengths.has(l));
      const expected = reaching.length > 0 ? reaching : [Math.max(...lengths)];
      expect(expected, `seed ${seed}`).toContain(word!.length);
      expect(accepts(g, word!)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is deterministic', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const text = randomGrammarText(seed);
      expect(exampleWord(parse(text))).toEqual(exampleWord(parse(text)));
    }
  });

  it('random grammars: a word of the language whenever the start symbol generates', () => {
    let words = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const g = parse(randomGrammarText(seed));
      const word = exampleWord(g);
      const shortest = shortestYields(g).len.get(g.startSymbol);
      expect(word === null, `seed ${seed}`).toBe(shortest === undefined || shortest > EXAMPLE_LIMIT);
      // independently: no example only when no short word is accepted either
      if (!word) expect(wordsUpTo([...g.terminals], 3).some(w => accepts(g, w)), `seed ${seed}`).toBe(false);
      if (word) {
        checkWord(g, word);
        words++;
      }
    }
    expect(words).toBeGreaterThan(300);
  });
});

describe('word of the demonstrations', () => {
  const expr = parse('E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id');

  it('keeps the preset word while it belongs to the language', () => {
    expect(demonstrationWord(expr, 'id + id * id')).toBe('id + id * id');
    expect(demonstrationWord(expr, 'id+id*id')).toBe('id+id*id');
  });

  it('replaces a word that is not in the language, or has unknown symbols, by a word of the grammar', () => {
    for (const preferred of ['id +', 'a b', '', '   ']) {
      const word = demonstrationWord(expr, preferred);
      expect(word).not.toBe(preferred);
      expect(accepts(expr, tokenizeInput(word, expr.terminals).tokens)).toBe(true);
    }
    // the edited grammar no longer has *
    const edited = parse('E -> E + T | T\nT -> ( E ) | id');
    const word = demonstrationWord(edited, 'id + id * id');
    expect(word).not.toContain('*');
    expect(accepts(edited, word.split(' '))).toBe(true);
  });
});
