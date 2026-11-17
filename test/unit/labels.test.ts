import { describe, expect, it } from 'vitest';
import { HINT_ALPHABET, makeLabels } from '../../src/content/hints/labels';

const prefixFree = (labels: string[]) =>
  labels.every((a, i) => labels.every((b, j) => i === j || !b.startsWith(a)));

describe('makeLabels', () => {
  it('returns nothing for zero elements', () => {
    expect(makeLabels(0)).toEqual([]);
  });

  it('uses single letters while they suffice', () => {
    expect(makeLabels(1)).toEqual(['s']);
    expect(makeLabels(HINT_ALPHABET.length)).toEqual([...HINT_ALPHABET]);
  });

  it('goes to two letters only as needed, shortest first', () => {
    const labels = makeLabels(15);
    expect(labels.slice(0, 13)).toEqual([...HINT_ALPHABET.slice(1)]); // "s" became a prefix
    expect(labels.slice(13)).toEqual(['ss', 'sa']);
  });

  for (const n of [1, 2, 14, 15, 100, 196, 197, 3000]) {
    it(`${n} labels: right count, unique, prefix-free, alphabet only`, () => {
      const labels = makeLabels(n);
      expect(labels).toHaveLength(n);
      expect(new Set(labels).size).toBe(n);
      expect(prefixFree(labels)).toBe(true);
      expect(labels.every((l) => [...l].every((c) => HINT_ALPHABET.includes(c)))).toBe(true);
      // lengths never decrease, so earlier elements get the short labels
      expect(labels.every((l, i) => i === 0 || l.length >= labels[i - 1]!.length)).toBe(true);
    });
  }

  it('196 targets fit in two letters with 14 characters', () => {
    expect(Math.max(...makeLabels(196).map((l) => l.length))).toBe(2);
    expect(Math.max(...makeLabels(197).map((l) => l.length))).toBe(3);
  });

  it('supports a custom alphabet', () => {
    expect(makeLabels(3, 'ab')).toEqual(['b', 'aa', 'ab']);
    expect(() => makeLabels(3, 'a')).toThrow();
  });
});
