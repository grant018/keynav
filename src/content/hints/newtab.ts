// `F`: open a hinted link as the new focused tab.
import { fire } from '../../shared/messages';
import { isOpenableUrl } from '../../shared/url';
import { activate } from './activate';

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
