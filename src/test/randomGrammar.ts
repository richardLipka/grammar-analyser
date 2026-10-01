/** Seeded random grammars for the randomised tests. */

/** Small deterministic PRNG (mulberry32). */
export function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2–4 non-terminals, 2–3 terminals, 1–3 alternatives of length 0–3 (ε included). */
export function randomGrammarText(seed: number): string {
  const rand = prng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const nts = ['S', 'A', 'B', 'C'].slice(0, 2 + Math.floor(rand() * 3));
  const ts = ['a', 'b', 'c'].slice(0, 2 + Math.floor(rand() * 2));
  return nts.map(nt => {
    const alts: string[] = [];
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const len = Math.floor(rand() * 4);
      alts.push(len === 0 ? 'ε' : Array.from({ length: len }, () => (rand() < 0.45 ? pick(nts) : pick(ts))).join(' '));
    }
    return `${nt} -> ${alts.join(' | ')}`;
  }).join('\n');
}
