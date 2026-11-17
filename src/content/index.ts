// Content script entry. Runs at document_start in every frame, before any page
// script, so our capture listeners on window see keys before the page's do. Nothing
// here touches the DOM until a key is pressed.
import { send } from '../shared/messages';
import { resolveBindings } from './bindings';
import { Dispatcher } from './keys/dispatcher';
import { noteInteraction } from './scroll/scroller';
import { currentKeymap, currentSite, initSettings, whenSettingsChange } from './settings';

const where = window === window.top ? 'top' : 'frame';
const dispatcher = new Dispatcher(resolveBindings(currentKeymap().keys), currentSite);

// Defaults apply until the stored settings load (a few ms); then every change made
// on the options page reaches this tab immediately.
initSettings();
whenSettingsChange(() => dispatcher.setBindings(resolveBindings(currentKeymap().keys)));

const listeners: [string, (e: Event) => void][] = [
  ['keydown', (e) => (extensionAlive() ? dispatcher.onKeyDown(e as KeyboardEvent) : teardown())],
  ['keypress', (e) => dispatcher.onKeyPress(e as KeyboardEvent)],
  ['keyup', (e) => dispatcher.onKeyUp(e as KeyboardEvent)],
  ['blur', (e) => e.target === window && dispatcher.reset()],
  ['mousedown', noteInteraction],
  ['focusin', noteInteraction],
];
for (const [type, fn] of listeners) window.addEventListener(type, fn, true);

/**
 * After the extension is reloaded or removed, scripts already running in open tabs
 * are orphaned: chrome.runtime is gone. Stop handling keys so the page gets them.
 */
function extensionAlive(): boolean {
  return Boolean(chrome.runtime?.id);
}

function teardown(): void {
  for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
  dispatcher.reset();
}

if (__TEST__) {
  console.info(`[keynav] loaded (${where}) ${location.href}`);
  send({ type: 'ping' })
    .then((r) => {
      if (r.type !== 'pong') throw new Error(JSON.stringify(r));
      console.info(`[keynav] pong (${where}) frameId=${r.frameId}`);
      // Lets e2e tests find this page's tab id (the extension has no "tabs" permission to read URLs).
      if (where === 'top') document.documentElement.dataset.keynavTab = String(r.tabId);
    })
    .catch((e: unknown) => console.error(`[keynav] ping failed (${where})`, e));
}
