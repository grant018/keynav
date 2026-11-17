// Helpers for walking the composed tree (through open and closed shadow roots).

export function shadowRootOf(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  // Content scripts can read closed shadow roots through chrome.dom.
  return el instanceof HTMLElement ? (chrome.dom?.openOrClosedShadowRoot?.(el) ?? null) : null;
}

/**
 * Faster shadowRootOf() for hot loops: only asks chrome.dom (a slow extension API
 * call) about custom elements, which is where closed shadow roots nearly always
 * live. Built-in hosts (a <div> with a closed root) are missed.
 */
export function likelyShadowRootOf(el: Element): ShadowRoot | null {
  return el.shadowRoot ?? (el.localName.includes('-') ? shadowRootOf(el) : null);
}

/** The element that really has focus, looking inside shadow roots. */
export function deepActiveElement(doc: Document = document): Element | null {
  let el = doc.activeElement;
  while (el) {
    const inner = shadowRootOf(el)?.activeElement;
    if (!inner) break;
    el = inner;
  }
  return el;
}

/** Parent element, stepping out of a shadow root to its host. */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Whether `inner` is `outer` or inside it, across shadow boundaries. */
export function composedContains(outer: Element, inner: Element): boolean {
  for (let n: Element | null = inner; n; n = composedParent(n)) if (n === outer) return true;
  return false;
}

/** Like Element.closest(), but continues past shadow roots into their hosts. */
export function composedClosest(el: Element, selector: string): Element | null {
  for (let n: Element | null = el; n; n = composedParent(n)) if (n.matches(selector)) return n;
  return null;
}

/** The topmost element at a viewport point, looking inside shadow roots. */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let hit = document.elementFromPoint(x, y);
  while (hit) {
    const inner = likelyShadowRootOf(hit)?.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return hit;
}
