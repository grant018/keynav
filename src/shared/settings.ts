// User settings: shape, defaults, validation and site-rule matching. Stored as one
// object under "settings" in chrome.storage.sync. Pure apart from the two storage
// helpers at the bottom.
import { parseKeys } from '../content/keys/trie';

/** A site rule. Empty passKeys turns KeyNav off on matching pages. */
export interface Rule {
  pattern: string;
  passKeys: string;
}

export interface Settings {
  enabled: boolean;
  rules: Rule[];
  keyMappings: string;
  hintChars: string;
  scrollStep: number; // px per tap of j/k
  scrollSpeed: number; // px per second while j/k is held
  smoothScroll: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  enabled: true,
  rules: [],
  keyMappings: '',
  hintChars: 'sadfjklewcmpgh',
  scrollStep: 60,
  scrollSpeed: 1200,
  smoothScroll: true,
};

export const LIMITS = {
  scrollStep: [10, 1000],
  scrollSpeed: [100, 10000],
} as const;

/** Hint characters: at least two distinct lowercase letters. Returns an error or null. */
export function hintCharsError(chars: string): string | null {
  if (!/^[a-z]+$/.test(chars)) return 'Use lowercase letters only.';
  if (new Set(chars).size !== chars.length) return 'Each letter can appear only once.';
  if (chars.length < 2) return 'Use at least two letters.';
  return null;
}

/** Whatever is in storage (missing, old, hand-edited) becomes valid settings. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const num = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    rules: Array.isArray(r.rules)
      ? r.rules
          .filter((x): x is Rule => !!x && typeof x.pattern === 'string' && typeof x.passKeys === 'string')
          .map((x) => ({ pattern: x.pattern.trim(), passKeys: x.passKeys.replace(/\s+/g, '') }))
          .filter((x) => x.pattern)
      : [],
    keyMappings: typeof r.keyMappings === 'string' ? r.keyMappings : d.keyMappings,
    hintChars: typeof r.hintChars === 'string' && !hintCharsError(r.hintChars) ? r.hintChars : d.hintChars,
    scrollStep: num(r.scrollStep, LIMITS.scrollStep, d.scrollStep),
    scrollSpeed: num(r.scrollSpeed, LIMITS.scrollSpeed, d.scrollSpeed),
    smoothScroll: typeof r.smoothScroll === 'boolean' ? r.smoothScroll : d.smoothScroll,
  };
}

// --- Site rules -----------------------------------------------------------------
//
// Patterns are URL globs, `*` matching anything:
//   *://mail.google.com/*      exact form
//   mail.google.com            shorthand for *://mail.google.com/*
//   *.google.com               any subdomain, any path

export function patternToRegExp(pattern: string): RegExp {
  let p = pattern.trim();
  if (!p.includes('://')) p = `*://${p}`;
  if (!/:\/\/[^/]*\//.test(p)) p += '/*'; // host only: any path
  const body = p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}$`, 'i');
}

export interface SiteState {
  /** KeyNav handles keys on this page at all. */
  active: boolean;
  /** Keys left to the page (only as the first key of a sequence). */
  passKeys: ReadonlySet<string>;
}

/**
 * Combines every rule matching any of `urls` (a frame checks its own URL and its
 * top page's origin). Any matching rule with no pass keys turns KeyNav off.
 */
export function siteState(settings: Settings, urls: string[]): SiteState {
  if (!settings.enabled) return { active: false, passKeys: new Set() };
  const passKeys = new Set<string>();
  for (const rule of settings.rules) {
    let re: RegExp;
    try {
      re = patternToRegExp(rule.pattern);
    } catch {
      continue;
    }
    if (!urls.some((u) => re.test(u))) continue;
    if (!rule.passKeys) return { active: false, passKeys: new Set() };
    for (const k of parseKeys(rule.passKeys)) passKeys.add(k);
  }
  return { active: true, passKeys };
}

// --- Storage ----------------------------------------------------------------------

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings((await chrome.storage.sync.get(KEY))[KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: settings });
}

/** Calls `fn` with the new settings whenever they change in storage. */
export function onSettingsChanged(fn: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) fn(normalizeSettings(changes[KEY].newValue));
  });
}
