// Typed protocol between content scripts and the background service worker.
// The worker learns which tab and window a message came from via `sender.tab`,
// so messages never carry tab ids.

export type Message =
  | { type: 'ping' }
  | { type: 'openTab'; url: string } // new foreground tab right after the sender's
  | { type: 'closeTab' }
  | { type: 'switchTab'; delta: 1 | -1 } // -1 = tab to the left, wraps around
  | { type: 'restoreTab' } // most recently closed tab
  | { type: 'openOptions' };

export type Reply =
  | { type: 'pong'; tabId: number | undefined; frameId: number | undefined }
  | { type: 'ok' }
  | { type: 'error'; message: string };

export function send(msg: Message): Promise<Reply> {
  return chrome.runtime.sendMessage(msg);
}

/** Send without waiting; failures (e.g. an orphaned script) are ignored. */
export function fire(msg: Message): void {
  send(msg).catch(() => {});
}
