// Finds elements to hint, in the document and inside shadow roots.
//
// Two tiers:
//   certain  - links, buttons, form fields, interactive ARIA roles, onclick
//   likely   - things that only look clickable: tabindex >= 0, Google's jsaction,
//              aria-haspopup, or the topmost element with `cursor: pointer` (cursor
//              is inherited, so only where the parent's cursor isn't pointer)
// Content scripts can't see addEventListener handlers, so "likely" is the best
// available signal for div-based buttons.
//
// Then duplicates are removed:
//   - a likely element inside another candidate is dropped (the outer one covers it)
//   - a likely wrapper around a certain element is dropped (a clickable card
//     around its link: hint the link)
//   - nested certain elements filling the same box keep only the innermost; a
//     click on it bubbles to the outer one, as a real click would
//   - a <label> is dropped when its control is hinted
import {
  composedClosest,
  composedContains,
  composedParent,
  likelyShadowRootOf,
} from '../dom/shadow';
import { isReachable, visibleRect } from './visibility';

const CERTAIN = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable=false])',
  '[onclick]',
  ...['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio',
    'switch', 'combobox', 'textbox'].map((r) => `[role=${r}]`),
].join(',');

const NEVER = new Set(['html', 'body', 'head', 'script', 'style', 'link', 'meta', 'title', 'noscript', 'template', 'br']);

export interface Target {
  el: Element;
  rect: DOMRect;
}

interface Found extends Target {
  certain: boolean;
}

function looksClickable(el: Element): boolean {
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && Number(tabindex) >= 0) return true;
  const jsaction = el.getAttribute('jsaction');
  if (jsaction && (/(^|;)\s*click:/.test(jsaction) || !jsaction.includes(':'))) return true;
  const haspopup = el.getAttribute('aria-haspopup');
  if (haspopup && haspopup !== 'false') return true;
  if (getComputedStyle(el).cursor !== 'pointer') return false;
  const parent = composedParent(el);
  return !parent || getComputedStyle(parent).cursor !== 'pointer';
}

function isEnabled(el: Element): boolean {
  return !el.matches(':disabled') && !composedClosest(el, '[inert]') && el.getAttribute('aria-disabled') !== 'true';
}

function sameBox(a: DOMRect, b: DOMRect): boolean {
  return Math.abs(a.left - b.left) <= 2 && Math.abs(a.top - b.top) <= 2 &&
    Math.abs(a.right - b.right) <= 2 && Math.abs(a.bottom - b.bottom) <= 2;
}

export function collectTargets(): Target[] {
  // With a modal dialog (or fullscreen element) open, everything else is inert.
  const modal = document.querySelector(':modal');
  const vw = innerWidth;
  const vh = innerHeight;
  const found: Found[] = [];

  const roots: (Document | ShadowRoot)[] = [document];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!;
    const certain = new Set(root.querySelectorAll(CERTAIN));
    for (const el of root.querySelectorAll('*')) {
      const shadow = likelyShadowRootOf(el);
      if (shadow) roots.push(shadow);

      // Cheapest checks first: attributes and cursor (styles are already computed)
      // rule out most elements before any geometry; hit-testing comes last.
      const isCertain = certain.has(el);
      if (!isCertain && (NEVER.has(el.localName) || !looksClickable(el))) continue;
      const box = el.getBoundingClientRect();
      if (box.bottom < 0 || box.right < 0 || box.top > vh || box.left > vw) continue;
      if (modal && !composedContains(modal, el)) continue;
      if (!isEnabled(el)) continue;
      const rect = visibleRect(el);
      if (!rect || !isReachable(el, rect)) continue;
      found.push({ el, rect, certain: isCertain });
    }
  }

  return dedupe(found).map(({ el, rect }) => ({ el, rect }));
}

function dedupe(found: Found[]): Found[] {
  const byEl = new Map(found.map((f) => [f.el, f]));
  const drop = new Set<Element>();

  for (const f of found) {
    let a = composedParent(f.el);
    while (a && !byEl.has(a)) a = composedParent(a);
    if (!a) continue;
    const outer = byEl.get(a)!;
    if (!f.certain) drop.add(f.el);
    else if (!outer.certain || sameBox(outer.rect, f.rect)) drop.add(a);
  }
  for (const f of found) {
    const control = f.el instanceof HTMLLabelElement ? f.el.control : null;
    if (control && byEl.has(control) && !drop.has(control)) drop.add(f.el);
  }
  return found.filter((f) => !drop.has(f.el));
}
