// Background service worker: a stateless relay. Chrome may stop and restart it at
// any time, so listeners are registered synchronously at top level and nothing is
// kept in memory between events; settings live in chrome.storage.
import type { Message, Reply } from '../shared/messages';
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/settings';
import { broadcast, startHints } from './hints';
import { closeTab, openTab, restoreTab, switchTab } from './tabs';

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<Reply> {
  const tab = sender.tab;
  if (msg.type === 'ping') return { type: 'pong', tabId: tab?.id, frameId: sender.frameId };
  if (msg.type === 'openOptions') {
    await chrome.runtime.openOptionsPage();
    return { type: 'ok' };
  }
  if (!tab) throw new Error('message did not come from a tab');

  switch (msg.type) {
    case 'openTab':
      await openTab(tab, msg.url);
      break;
    case 'closeTab':
      await closeTab(tab);
      break;
    case 'switchTab':
      await switchTab(tab, msg.delta);
      break;
    case 'restoreTab':
      await restoreTab();
      break;
    case 'hints:start':
      return { type: 'hints:started', total: await startHints(tab, msg.session, msg.mode, msg.chars) };
    case 'hints:broadcast':
      broadcast(tab, msg.event);
      break;
  }
  return { type: 'ok' };
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse: (r: Reply) => void) => {
  handle(msg, sender).then(sendResponse, (e: unknown) => sendResponse({ type: 'error', message: String(e) }));
  return true; // reply asynchronously
});

// --- On/off switch -----------------------------------------------------------------
// The toolbar button and the "toggle" shortcut turn KeyNav off everywhere; the badge
// says OFF while it is. Open tabs pick the change up from storage immediately.

async function toggle(): Promise<boolean> {
  const settings = await loadSettings();
  settings.enabled = !settings.enabled;
  await saveSettings(settings);
  return settings.enabled;
}

async function showBadge(enabled: boolean): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#6e7781' });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  const icon = enabled ? 'icon' : 'off'; // grey keycap while off
  await chrome.action.setIcon({ path: { 16: `icons/${icon}-16.png`, 32: `icons/${icon}-32.png` } });
  await chrome.action.setTitle({ title: enabled ? 'KeyNav is on (click to turn off)' : 'KeyNav is off (click to turn on)' });
}

const refreshBadge = () => loadSettings().then((s) => showBadge(s.enabled), () => {});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
onSettingsChanged((s) => void showBadge(s.enabled));
chrome.action.onClicked.addListener(() => void toggle());

// Keyboard shortcuts set in chrome://extensions/shortcuts. These work everywhere,
// including pages KeyNav can't run on (the new tab page, chrome:// pages).
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle') {
    await toggle();
  } else if ((command === 'previous-tab' || command === 'next-tab') && tab) {
    await switchTab(tab, command === 'next-tab' ? 1 : -1);
  }
});

if (__TEST__) {
  // Lets e2e tests drive what a browser shortcut or toolbar click would.
  (globalThis as { __keynavTest?: unknown }).__keynavTest = { toggle };
}
