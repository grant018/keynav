// Decides whether an element can be seen and clicked in the viewport, and where to
// put its hint.
import { composedContains, deepElementFromPoint } from '../dom/shadow';

function inViewport(r: DOMRect): boolean {
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

/**
 * The first visible box of `el`, or null. Uses getClientRects() so a link that
 * wraps across lines is hinted at its first visible line. An element with no box
 * of its own (an <a> around a floated image) falls back to its children's boxes.
 */
export function visibleRect(el: Element, depth = 0): DOMRect | null {
  for (const r of el.getClientRects()) {
    if (inViewport(r)) {
      // Not opacity: styled file inputs and checkboxes are often opacity: 0.
      return el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) ? r : null;
    }
  }
  if (depth < 2) {
    for (const child of el.children) {
      const r = visibleRect(child, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Whether a mouse could reach `el` within box `r`: hit-test the centre and two
 * inset corners of the box's on-screen part, and accept if the topmost element at
 * any of them is `el` or inside it. This rejects elements covered by others
 * (overlays, sticky headers) and elements clipped away by an overflow container.
 */
export function isReachable(el: Element, r: DOMRect): boolean {
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, innerWidth);
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, innerHeight);
  const inset = (a: number, b: number) => Math.min(2, (b - a) / 2);
  const points: [number, number][] = [
    [(left + right) / 2, (top + bottom) / 2],
    [left + inset(left, right), top + inset(top, bottom)],
    [right - inset(left, right) - 0.5, bottom - inset(top, bottom) - 0.5],
  ];
  for (const [x, y] of points) {
    const hit = deepElementFromPoint(x, y);
    if (hit && composedContains(el, hit)) return true;
  }
  return false;
}
