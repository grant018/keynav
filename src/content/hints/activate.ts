// Activates a hinted element the way a mouse would: move onto it (hover), then
// press and click. Many menu and button libraries react to pointerdown/mousedown
// rather than click, so the whole sequence is sent.
//
// Hover menus: like a touchscreen browser's first tap, if hovering reveals new
// clickable elements (a dropdown opening), stop there instead of clicking: the user
// sees the menu and can hint its items. Hinting the same element again clicks it,
// because hovering it again reveals nothing new.
//
// Text fields and selects skip that check and are focused at once.
import { MAIN_CLICK_EVENT } from '../../shared/main-world';
import { composedParent } from '../dom/shadow';
import { isEditable } from '../modes/insert';
import { collectTargets } from './candidates';

/**
 * How long to watch for a hover menu before clicking. Every click waits at least
 * QUIET_MS (and two frames); if the page changed meanwhile, SETTLE_MS more, for
 * menus rendered asynchronously (React state updates, short timers). Menus behind
 * deliberate hover-intent delays (~300ms) are not caught: those links are followed.
 */
const QUIET_MS = 50;
const SETTLE_MS = 100;

export function activate(el: Element): void {
  if (!el.isConnected) return;

  if (el instanceof HTMLSelectElement || isEditable(el)) {
    hover(el);
    press(el);
    if (el instanceof HTMLSelectElement) openPicker(el);
    else caretToEnd(el);
    return;
  }

  const before = new Set(collectTargets().map((t) => t.el));
  let mutated = false;
  const observer = new MutationObserver(() => (mutated = true));
  observer.observe(document, { subtree: true, childList: true, attributes: true });
  hover(el);

  void (async () => {
    await Promise.all([frames(2), sleep(QUIET_MS)]);
    if (mutated) await sleep(SETTLE_MS);
    observer.disconnect();
    if (!el.isConnected) return;
    if (mutated && collectTargets().some((t) => !before.has(t.el))) return; // hover opened something
    press(el); // still has the keypress's user activation (it lasts several seconds)
  })();
}

// --- Mouse simulation ---------------------------------------------------------

/** The element our simulated pointer is over, so the next hover can leave it. */
let hovered: Element | null = null;

function pointAt(el: Element) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + Math.min(r.width / 2, 8), clientY: r.top + r.height / 2 };
}

function mouse(type: string, target: Element, init: MouseEventInit = {}): boolean {
  const base = { view: window, composed: true, ...pointAt(target), ...init };
  const pointerType = type.replace(/^mouse/, 'pointer');
  if (pointerType !== type) {
    target.dispatchEvent(new PointerEvent(pointerType, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  return target.dispatchEvent(new MouseEvent(type, base));
}

/** Ancestors from `el` up to <html>, crossing shadow roots. */
function lineage(el: Element): Element[] {
  const out: Element[] = [];
  for (let n: Element | null = el; n; n = composedParent(n)) out.push(n);
  return out;
}

/** Move the simulated pointer onto `el`: out/leave on the previous element, over/enter/move on this one. */
function hover(el: Element): void {
  const prev = hovered?.isConnected ? hovered : null;
  if (prev === el) return;

  if (prev) {
    mouse('mouseout', prev, { bubbles: true, cancelable: true, relatedTarget: el });
    for (const a of lineage(prev)) if (!a.contains(el)) mouse('mouseleave', a, { relatedTarget: el });
  }
  mouse('mouseover', el, { bubbles: true, cancelable: true, relatedTarget: prev });
  for (const a of lineage(el).reverse()) if (!prev || !a.contains(prev)) mouse('mouseenter', a, { relatedTarget: prev });
  mouse('mousemove', el, { bubbles: true, cancelable: true });
  hovered = el;
}

/** Press and release on `el`, focusing it like a real click, then click it. */
function press(el: Element): void {
  const opts = { bubbles: true, cancelable: true };
  const focusAllowed = mouse('mousedown', el, { ...opts, button: 0, buttons: 1 });
  if (focusAllowed && (el instanceof HTMLElement || el instanceof SVGElement)) el.focus({ preventScroll: true });
  mouse('mouseup', el, { ...opts, button: 0 });

  // .click() runs the element's default action (follow link, toggle checkbox, submit).
  // javascript: links are clicked from the page's own world (see src/main/index.ts).
  if (isInJavascriptLink(el)) el.dispatchEvent(new CustomEvent(MAIN_CLICK_EVENT, { bubbles: true, composed: true }));
  else if (el instanceof HTMLElement) el.click();
  else el.dispatchEvent(new MouseEvent('click', { ...opts, composed: true, view: window, ...pointAt(el) }));
}

function isInJavascriptLink(el: Element): boolean {
  const link = el.closest('a[href]');
  return link instanceof HTMLAnchorElement && link.protocol === 'javascript:';
}

// --- Fields -------------------------------------------------------------------

function openPicker(select: HTMLSelectElement): void {
  try {
    select.showPicker();
  } catch {
    // Needs user activation, which cross-origin frames may not have; focus is enough.
  }
}

function caretToEnd(el: Element): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // email/number inputs don't support selection ranges
    }
  } else if (el instanceof HTMLElement && el.isContentEditable) {
    const sel = getSelection();
    if (!sel) return;
    sel.selectAllChildren(el);
    sel.collapseToEnd();
  }
}

// --- Timing -------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}
