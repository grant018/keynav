import { describe, expect, it } from 'vitest';
import { buildKeymap } from '../../src/shared/keymap';
import { DEFAULT_KEYS } from '../../src/shared/commands';
import {
  DEFAULT_SETTINGS,
  hintCharsError,
  normalizeSettings,
  patternToRegExp,
  siteState,
  type Settings,
} from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('fills in defaults for missing or junk input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ enabled: 'yes', scrollStep: 'big', rules: 'x' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values, clamps numbers, cleans rules', () => {
    const s = normalizeSettings({
      enabled: false,
      scrollStep: 5,
      scrollSpeed: 99999,
      smoothScroll: false,
      hintChars: 'asdf',
      rules: [{ pattern: ' mail.google.com ', passKeys: 'j k x' }, { pattern: '', passKeys: '' }, { nope: 1 }],
    });
    expect(s).toMatchObject({ enabled: false, scrollStep: 10, scrollSpeed: 10000, smoothScroll: false, hintChars: 'asdf' });
    expect(s.rules).toEqual([{ pattern: 'mail.google.com', passKeys: 'jkx' }]);
  });

  it('rejects bad hint characters', () => {
    expect(normalizeSettings({ hintChars: 'aab' }).hintChars).toBe(DEFAULT_SETTINGS.hintChars);
    expect(hintCharsError('ab')).toBeNull();
    expect(hintCharsError('a')).toMatch(/two/);
    expect(hintCharsError('aa')).toMatch(/once/);
    expect(hintCharsError('aB')).toMatch(/lowercase/);
  });
});

describe('site rules', () => {
  const at = (rules: Settings['rules'], url: string, enabled = true) =>
    siteState({ ...DEFAULT_SETTINGS, enabled, rules }, [url]);

  it('patterns: shorthand host, wildcards, full form', () => {
    expect(patternToRegExp('mail.google.com').test('https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(patternToRegExp('mail.google.com').test('https://docs.google.com/')).toBe(false);
    expect(patternToRegExp('*.google.com').test('https://docs.google.com/document/d/1')).toBe(true);
    expect(patternToRegExp('https://x.com/a/*').test('https://x.com/a/b')).toBe(true);
    expect(patternToRegExp('https://x.com/a/*').test('https://x.com/b')).toBe(false);
    expect(patternToRegExp('example.com/a?b').test('http://example.com/a?b')).toBe(true); // ? is literal
  });

  it('no rules: active, nothing passed', () => {
    expect(at([], 'https://a.com/')).toEqual({ active: true, passKeys: new Set() });
  });

  it('globally disabled: inactive', () => {
    expect(at([], 'https://a.com/', false).active).toBe(false);
  });

  it('a matching rule with no pass keys turns KeyNav off', () => {
    expect(at([{ pattern: 'a.com', passKeys: '' }], 'https://a.com/x').active).toBe(false);
    expect(at([{ pattern: 'a.com', passKeys: '' }], 'https://b.com/x').active).toBe(true);
  });

  it('pass keys from all matching rules combine', () => {
    const s = at([{ pattern: '*.a.com', passKeys: 'jk' }, { pattern: 'mail.a.com', passKeys: 'x<Esc>' }, { pattern: 'b.com', passKeys: 'q' }],
      'https://mail.a.com/');
    expect(s).toEqual({ active: true, passKeys: new Set(['j', 'k', 'x', '<Esc>']) });
  });
});

describe('buildKeymap', () => {
  it('empty text gives the defaults', () => {
    expect(buildKeymap('')).toEqual({ keys: { ...DEFAULT_KEYS }, errors: [] });
  });

  it('map, unmap, unmapAll and comments', () => {
    const { keys, errors } = buildKeymap(['# my keys', 'map gt nextTab', 'map n scrollDown  # trailing', 'unmap x', ''].join('\n'));
    expect(errors).toEqual([]);
    expect(keys.gt).toBe('nextTab');
    expect(keys.n).toBe('scrollDown');
    expect(keys.x).toBeUndefined();
    expect(keys.j).toBe('scrollDown');
    expect(buildKeymap('unmapAll\nmap j scrollUp').keys).toEqual({ j: 'scrollUp' });
    expect(buildKeymap('map # showHelp').keys['#']).toBe('showHelp');
    expect(buildKeymap('map # showHelp # the # key').errors).toEqual([]);
    expect(buildKeymap('map a b c').errors[0]).toMatch(/Line 1: expected/);
  });

  it('reports bad lines and keeps going', () => {
    const { keys, errors } = buildKeymap('map q fly\nunmap zz\nbind a b\nmap w nextTab');
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/Line 1: unknown command "fly"/);
    expect(errors[1]).toMatch(/Line 2: "zz" is not mapped/);
    expect(errors[2]).toMatch(/Line 3: expected/);
    expect(keys.w).toBe('nextTab');
    expect(keys.q).toBeUndefined();
  });

  it('drops a custom binding that clashes with an existing prefix', () => {
    const { keys, errors } = buildKeymap('map g scrollToTop');
    expect(keys.g).toBeUndefined();
    expect(keys.gg).toBe('scrollToTop');
    expect(errors[0]).toMatch(/"g" conflicts with "gg"/);
    expect(buildKeymap('unmap gg\nmap g scrollToTop')).toMatchObject({ errors: [], keys: { g: 'scrollToTop' } });
  });
});
