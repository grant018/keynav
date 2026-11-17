// Tab actions for the background worker. Everything is derived from the sender's
// tab and fresh queries; nothing is remembered between messages.
import { isOpenableUrl } from '../shared/url';

type Tab = chrome.tabs.Tab;

/** Open `url` as the focused tab, right after `opener`, in the same window and tab group. */
export async function openTab(opener: Tab, url: string): Promise<void> {
  if (!isOpenableUrl(url)) throw new Error(`refusing to open ${url}`);
  const created = await chrome.tabs.create({
    url,
    active: true,
    index: opener.index + 1,
    openerTabId: opener.id,
    windowId: opener.windowId,
  });
  if (created.id !== undefined && opener.groupId !== undefined && opener.groupId !== -1 && created.groupId !== opener.groupId) {
    await chrome.tabs.group({ groupId: opener.groupId, tabIds: created.id }).catch(() => {});
  }
}

export async function closeTab(tab: Tab): Promise<void> {
  if (tab.id !== undefined) await chrome.tabs.remove(tab.id);
}

/** Activate the tab `delta` places away in the same window, wrapping around. */
export async function switchTab(tab: Tab, delta: 1 | -1): Promise<void> {
  const tabs = (await chrome.tabs.query({ windowId: tab.windowId })).sort((a, b) => a.index - b.index);
  const i = tabs.findIndex((t) => t.id === tab.id);
  if (i < 0 || tabs.length < 2) return;
  const next = tabs[(i + delta + tabs.length) % tabs.length]!;
  if (next.id !== undefined) await chrome.tabs.update(next.id, { active: true });
}

/** Reopen the most recently closed tab (skipping closed windows). */
export async function restoreTab(): Promise<void> {
  const recent = await chrome.sessions.getRecentlyClosed({ maxResults: chrome.sessions.MAX_SESSION_RESULTS });
  const sessionId = recent.find((s) => s.tab?.sessionId)?.tab?.sessionId;
  if (sessionId) await chrome.sessions.restore(sessionId);
}

/**
 * Go back (-1) or forward (1) in the tab's history. Done here rather than with
 * history.back() in the page so it works the same from any frame. Nothing to go
 * back or forward to is not an error.
 */
export async function goHistory(tab: Tab, delta: 1 | -1): Promise<void> {
  if (tab.id === undefined) return;
  await (delta < 0 ? chrome.tabs.goBack(tab.id) : chrome.tabs.goForward(tab.id)).catch(() => {});
}
