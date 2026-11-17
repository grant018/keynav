// The content script's live view of the user's settings: loaded at startup and
// updated whenever they change, so open tabs follow the options page immediately.
import { buildKeymap, type Keymap } from '../shared/keymap';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  siteState,
  type Settings,
  type SiteState,
} from '../shared/settings';

let current: Settings = { ...DEFAULT_SETTINGS };
let keymap: Keymap = buildKeymap(current.keyMappings);
const listeners = new Set<() => void>();

export function settings(): Settings {
  return current;
}

export function currentKeymap(): Keymap {
  return keymap;
}

/** Runs `fn` now and after every settings change. */
export function whenSettingsChange(fn: () => void): void {
  listeners.add(fn);
  fn();
}

function apply(next: Settings): void {
  if (next.keyMappings !== current.keyMappings) keymap = buildKeymap(next.keyMappings);
  current = next;
  siteCache = null;
  for (const fn of listeners) fn();
  if (__TEST__ && window === window.top) {
    const el = document.documentElement;
    el.dataset.keynavSettings = String(Number(el.dataset.keynavSettings ?? 0) + 1);
  }
}

export function initSettings(): void {
  try {
    loadSettings().then(apply, () => {});
    onSettingsChanged(apply);
  } catch {
    // Orphaned script (extension reloaded): keep the defaults.
  }
}

// Site rules are matched against this frame's URL and, inside an iframe, its top
// page's origin (a Gmail rule should also cover Gmail's frames). Single-page apps
// change the URL without reloading, so the result is cached per URL.
let siteCache: { href: string; state: SiteState } | null = null;

export function currentSite(): SiteState {
  const href = location.href;
  if (siteCache?.href !== href) {
    const urls = [href];
    const origins = location.ancestorOrigins;
    if (origins?.length) urls.push(`${origins[origins.length - 1]}/`);
    siteCache = { href, state: siteState(current, urls) };
  }
  return siteCache.state;
}
