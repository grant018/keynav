import { describe, expect, it } from 'vitest';
import { normalizeKey, type KeyLike } from '../../src/content/keys/normalize';

const ev = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key, code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods,
});

describe('normalizeKey', () => {
  it('lowercase and shifted letters', () => {
    expect(normalizeKey(ev('j', 'KeyJ'))).toBe('j');
    expect(normalizeKey(ev('J', 'KeyJ', { shiftKey: true }))).toBe('J');
  });

  it('ignores CapsLock: case comes from Shift', () => {
    expect(normalizeKey(ev('J', 'KeyJ'))).toBe('j');
    expect(normalizeKey(ev('j', 'KeyJ', { shiftKey: true }))).toBe('J');
  });

  it('uses the printed letter on Latin layouts (Dvorak)', () => {
    expect(normalizeKey(ev('h', 'KeyJ'))).toBe('h');
  });

  it('falls back to key position on non-Latin layouts', () => {
    expect(normalizeKey(ev('о', 'KeyJ'))).toBe('j');
    expect(normalizeKey(ev('О', 'KeyJ', { shiftKey: true }))).toBe('J');
  });

  it('names Escape', () => {
    expect(normalizeKey(ev('Escape', 'Escape'))).toBe('<Esc>');
  });

  it('keeps other printable characters', () => {
    expect(normalizeKey(ev('?', 'Slash', { shiftKey: true }))).toBe('?');
    expect(normalizeKey(ev('5', 'Digit5'))).toBe('5');
  });

  it('returns null for keys we never handle', () => {
    expect(normalizeKey(ev('j', 'KeyJ', { ctrlKey: true }))).toBeNull();
    expect(normalizeKey(ev('j', 'KeyJ', { altKey: true }))).toBeNull();
    expect(normalizeKey(ev('j', 'KeyJ', { metaKey: true }))).toBeNull();
    expect(normalizeKey(ev(' ', 'Space'))).toBeNull();
    expect(normalizeKey(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
    expect(normalizeKey(ev('ArrowDown', 'ArrowDown'))).toBeNull();
    expect(normalizeKey(ev('Dead', 'BracketLeft'))).toBeNull();
  });
});
