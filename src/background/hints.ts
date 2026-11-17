// Relays link-hint sessions between a tab's frames. The frames hold all the state;
// this only routes messages, so a service-worker restart mid-session is harmless.
//
// Start: ask every frame how many elements it would hint, then give each frame its
// slice of one shared label sequence (top frame first, so it gets the short labels).
// After that, the frame where keys are typed broadcasts what was typed.
import type { HintEvent, HintMode } from '../shared/messages';

/** A frame that doesn't answer in time (no content script, still loading) counts as empty. */
const PREPARE_TIMEOUT_MS = 400;

export async function startHints(tab: chrome.tabs.Tab, session: string, mode: HintMode, chars: string): Promise<number> {
  const tabId = tab.id!;
  const frames = ((await chrome.webNavigation.getAllFrames({ tabId })) ?? [])
    .map((f) => f.frameId)
    .sort((a, b) => a - b); // 0 = top frame

  const counts = await Promise.all(
    frames.map((frameId) =>
      withTimeout(sendToFrame(tabId, frameId, { type: 'hints:prepare', session }), PREPARE_TIMEOUT_MS).then(
        (r) => (r && typeof r === 'object' && 'count' in r && typeof r.count === 'number' ? r.count : 0),
        () => 0,
      ),
    ),
  );

  const total = counts.reduce((a, b) => a + b, 0);
  let offset = 0;
  await Promise.all(
    frames.map((frameId, i) => {
      const count = counts[i]!;
      const event: HintEvent = { type: 'hints:show', session, offset, total, chars, mode };
      offset += count;
      return count ? sendToFrame(tabId, frameId, event).catch(() => {}) : null;
    }),
  );
  return total;
}

/** Send to every frame in the tab. */
export function broadcast(tab: chrome.tabs.Tab, event: HintEvent): void {
  if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, event).catch(() => {});
}

function sendToFrame(tabId: number, frameId: number, event: HintEvent): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, event, { frameId });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}
