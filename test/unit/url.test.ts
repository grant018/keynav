import { describe, expect, it } from 'vitest';
import { isOpenableUrl } from '../../src/shared/url';

describe('isOpenableUrl', () => {
  it('opens http and https', () => {
    expect(isOpenableUrl('https://example.com/a?b#c')).toBe(true);
    expect(isOpenableUrl('http://127.0.0.1:8765/x.html')).toBe(true);
  });

  it('clicks everything else in place', () => {
    for (const url of [
      'javascript:void(0)',
      'JavaScript:alert(1)',
      'mailto:someone@example.com',
      'tel:+15555550100',
      'data:text/html,hi',
      'file:///etc/hosts',
      'chrome://settings',
      '',
      'not a url',
      '/relative/path', // .href is always absolute; a relative string means something went wrong
    ]) {
      expect(isOpenableUrl(url), url).toBe(false);
    }
  });
});
