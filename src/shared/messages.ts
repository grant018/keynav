// Typed protocol between content scripts and the background service worker.
// The worker learns which tab and window a message came from via `sender.tab`,
// so messages never carry tab ids.

export type Message =
  | { type: 'ping' }
  | { type: 'openTab'; url: string } // new foreground tab right after the sender's
  | { type: 'closeTab' }
  | { type: 'switchTab'; delta: 1 | -1 } // -1 = tab to the left, wraps around
  | { type: 'restoreTab' } // most recently closed tab
  | { type: 'history'; delta: 1 | -1 } // -1 = back, 1 = forward
  | { type: 'openOptions' }
  // Link hints across frames (see src/content/hints/controller.ts):
  | { type: 'hints:start'; session: string; mode: HintMode; chars: string }
  | { type: 'hints:broadcast'; event: HintEvent };

export type Reply =
  | { type: 'pong'; tabId: number | undefined; frameId: number | undefined }
  | { type: 'ok' }
  | { type: 'error'; message: string }
  | { type: 'hints:started'; total: number }
  | { type: 'hints:count'; count: number };

/** f clicks; F opens links in a new tab. */
export type HintMode = 'click' | 'newTab';

/** Sent by the background worker to a tab's frames during a hint session. */
export type HintEvent =
  | { type: 'hints:prepare'; session: string } // count your hintable elements (reply hints:count)
  | { type: 'hints:show'; session: string; offset: number; total: number; chars: string; mode: HintMode }
  | { type: 'hints:typed'; session: string; typed: string }
  | { type: 'hints:pick'; session: string; label: string } // owner activates; everyone ends
  | { type: 'hints:end'; session: string };

export function send(msg: Message): Promise<Reply> {
  return chrome.runtime.sendMessage(msg);
}

/** Send without waiting; failures (e.g. an orphaned script) are ignored. */
export function fire(msg: Message): void {
  send(msg).catch(() => {});
}
