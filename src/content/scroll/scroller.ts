// Finds the element that should scroll. On app-shell pages (Gmail, many docs sites)
// the window doesn't scroll at all; an inner element does. Order:
//   1. nearest scrollable ancestor of whatever was last clicked or focused
//   2. the document itself
//   3. the largest visible scrollable element
// The result is cached until the next click or focus change.
import { composedParent } from '../dom/shadow';

let anchor: Element | null = null;
let cached: Element | null = null;

/** mousedown / focusin listener: remembers where the user is working. */
export function noteInteraction(e: Event): void {
  const target = e.composedPath()[0];
  anchor = target instanceof Element ? target : null;
  cached = null;
}

export function findScroller(): Element | null {
  if (cached?.isConnected && cached.scrollHeight > cached.clientHeight) return cached;
  cached = fromAnchor() ?? fromDocument() ?? largest();
  return cached;
}

function fromAnchor(): Element | null {
  for (let el = anchor; el; el = composedParent(el)) {
    if (el === document.body || el === document.documentElement) return null;
    if (isScrollable(el)) return el;
  }
  return null;
}

function fromDocument(): Element | null {
  const root = document.scrollingElement;
  return root && isScrollable(root) ? root : null;
}

function largest(): Element | null {
  const candidates: { el: Element; area: number }[] = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (w > 0 && h > 0) candidates.push({ el, area: w * h });
  }
  candidates.sort((a, b) => b.area - a.area);
  return candidates.find((c) => isScrollable(c.el))?.el ?? null;
}

const SCROLLING_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

function isScrollable(el: Element): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  if (el !== document.scrollingElement && !SCROLLING_OVERFLOW.has(getComputedStyle(el).overflowY)) return false;
  // Styles can lie (overflow: hidden on <body> while a modal is open), so nudge it 1px.
  const before = el.scrollTop;
  el.scrollTo({ top: before + 1, behavior: 'instant' });
  if (el.scrollTop === before) el.scrollTo({ top: before - 1, behavior: 'instant' });
  const moved = el.scrollTop !== before;
  el.scrollTo({ top: before, behavior: 'instant' });
  return moved;
}
