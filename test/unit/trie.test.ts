import { describe, expect, it } from 'vitest';
import { KeySequencer, parseKeys } from '../../src/content/keys/trie';

function make(bindings: Record<string, string> = { j: 'down', gg: 'top', G: 'bottom', '<Esc>x': 'esc-x' }) {
  let t = 0;
  const seq = new KeySequencer(bindings, 1000, () => t);
  return { seq, advance: (ms: number) => (t += ms) };
}

describe('parseKeys', () => {
  it('splits single characters and <named> keys', () => {
    expect(parseKeys('gg')).toEqual(['g', 'g']);
    expect(parseKeys('g<Esc>x')).toEqual(['g', '<Esc>', 'x']);
    expect(parseKeys('')).toEqual([]);
  });
});

describe('KeySequencer', () => {
  it('fires single-key commands immediately', () => {
    const { seq } = make();
    expect(seq.feed('j')).toEqual({ kind: 'command', command: 'down' });
    expect(seq.feed('G')).toEqual({ kind: 'command', command: 'bottom' });
  });

  it('is case-sensitive', () => {
    expect(make().seq.feed('J')).toEqual({ kind: 'none' });
  });

  it('holds a prefix as pending, then fires on the last key', () => {
    const { seq } = make();
    expect(seq.feed('g')).toEqual({ kind: 'pending' });
    expect(seq.pending).toBe(true);
    expect(seq.feed('g')).toEqual({ kind: 'command', command: 'top' });
    expect(seq.pending).toBe(false);
  });

  it('handles named keys inside sequences', () => {
    const { seq } = make();
    expect(seq.feed('<Esc>')).toEqual({ kind: 'pending' });
    expect(seq.feed('x')).toEqual({ kind: 'command', command: 'esc-x' });
  });

  it('drops a dead-end prefix and retries the key on its own', () => {
    const { seq } = make();
    seq.feed('g');
    expect(seq.feed('j')).toEqual({ kind: 'command', command: 'down' });
    seq.feed('g');
    expect(seq.feed('q')).toEqual({ kind: 'none' });
    expect(seq.pending).toBe(false);
  });

  it('expires a half-typed sequence after the timeout', () => {
    const { seq, advance } = make();
    seq.feed('g');
    advance(1001);
    expect(seq.feed('g')).toEqual({ kind: 'pending' }); // starts over instead of firing gg
    advance(999);
    expect(seq.feed('g')).toEqual({ kind: 'command', command: 'top' });
  });

  it('isBindingStart() tells which keys begin a binding', () => {
    const { seq } = make();
    expect(seq.isBindingStart('j')).toBe(true);
    expect(seq.isBindingStart('g')).toBe(true);
    expect(seq.isBindingStart('q')).toBe(false);
  });

  it('reset() clears a pending sequence', () => {
    const { seq } = make();
    seq.feed('g');
    seq.reset();
    expect(seq.pending).toBe(false);
  });

  it('rejects bindings that are prefixes of each other', () => {
    expect(() => new KeySequencer({ g: 1, gg: 2 })).toThrow(/extends another/);
    expect(() => new KeySequencer({ gg: 2, g: 1 })).toThrow(/conflicts/);
    expect(() => new KeySequencer({ '': 1 })).toThrow(/empty/);
  });
});
