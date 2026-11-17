// Tab commands (handled by the background worker) and `F`: open a hinted link as
// the new focused tab.
import { fire } from '../shared/messages';
import { isOpenableUrl } from '../shared/url';
import { activate } from './hints/activate';
import { showHints } from './hints/controller';
import type { Command } from './keys/dispatcher';

/**
 * Open the hinted element's link in a new foreground tab. Elements without an
 * http(s) link (buttons, div click handlers, javascript:/mailto: links) are clicked
 * in place instead; that decision is made here, synchronously, so the click still
 * has the keypress's user activation.
 */
export function openInNewTab(el: Element): void {
  const link = el.closest('a[href], area[href]');
  const url = link instanceof HTMLAnchorElement || link instanceof HTMLAreaElement ? link.href : '';
  if (isOpenableUrl(url)) fire({ type: 'openTab', url });
  else activate(el);
}

export const tabCommands = {
  linkHintsNewTab: { run: () => showHints(openInNewTab) },
  closeTab: { run: () => fire({ type: 'closeTab' }) },
  restoreTab: { run: () => fire({ type: 'restoreTab' }) },
  previousTab: { run: () => fire({ type: 'switchTab', delta: -1 }) },
  nextTab: { run: () => fire({ type: 'switchTab', delta: 1 }) },
} satisfies Record<string, Command>;
