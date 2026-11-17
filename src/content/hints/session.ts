// One frame's part in a link-hint session. Every frame in the tab (the one where
// `f` was pressed included) runs this when the background worker asks it to:
//
//   prepare  count the visible clickable elements in this frame
//   show     draw labels offset..offset+count of the shared label sequence
//   typed    hide labels that no longer match
//   pick     if the label is ours, activate its element; in any case, end
//   end      remove the labels
//
// Scrolling, resizing or clicking in a frame ends the session in every frame.
import { fire, type HintEvent, type HintMode } from '../../shared/messages';
import * as smooth from '../scroll/smooth';
import { activate } from './activate';
import { collectTargets, type Target } from './candidates';
import { makeLabels } from './labels';
import { openInNewTab } from './newtab';
import { createOverlay, type Overlay } from './overlay';

type Show = Extract<HintEvent, { type: 'hints:show' }>;

interface Active {
  session: string;
  mode: HintMode;
  overlay: Overlay;
  hints: { el: Element; label: string; tag: HTMLElement }[];
  listeners: [string, EventListener][];
}

let prepared: { session: string; targets: Target[]; region: DOMRectReadOnly } | null = null;
let active: Active | null = null;
const endWatchers = new Set<(session: string) => void>();

/** Lets the frame driving a session learn that it ended (here or in another frame). */
export function onSessionEnd(fn: (session: string) => void): () => void {
  endWatchers.add(fn);
  return () => endWatchers.delete(fn);
}

export async function prepare(session: string): Promise<number> {
  endLocal();
  smooth.stop(); // a glide still running would fire scroll events and end hint mode
  const region = await visibleRegion();
  const t0 = performance.now();
  const targets = region ? collectTargets().filter((t) => intersects(t.rect, region)) : [];
  if (__TEST__ && window === window.top) {
    const ms = performance.now() - t0;
    document.documentElement.dataset.keynavHintMs = ms.toFixed(1);
    console.debug(`[keynav] ${targets.length} hints in ${ms.toFixed(1)} ms`);
  }
  prepared = region ? { session, targets, region } : null;
  return targets.length;
}

export function show(ev: Show): void {
  if (prepared?.session !== ev.session || !prepared.targets.length) return;
  const { targets, region } = prepared;
  const labels = makeLabels(ev.total, ev.chars).slice(ev.offset, ev.offset + targets.length);
  const overlay = createOverlay();
  const hints = targets.map((t, i) => {
    const label = labels[i]!;
    // Keep the label inside the part of this frame that is actually on screen.
    const at = new DOMRect(Math.max(t.rect.left, region.left), Math.max(t.rect.top, region.top), t.rect.width, t.rect.height);
    return { el: t.el, label, tag: overlay.add(label, at, t.el) };
  });

  const endEverywhere = () => {
    const session = ev.session;
    endLocal();
    fire({ type: 'hints:broadcast', event: { type: 'hints:end', session } });
  };
  const onScroll = (e: Event) => {
    const t = e.target;
    if (t === document || t === document.scrollingElement || (t instanceof Node && hints.some((h) => t.contains(h.el)))) {
      endEverywhere();
    }
  };
  const listeners: [string, EventListener][] = [
    ['scroll', onScroll],
    ['resize', endEverywhere],
    ['mousedown', endEverywhere],
    ['pagehide', endEverywhere],
  ];
  for (const [type, fn] of listeners) addEventListener(type, fn, true);
  active = { session: ev.session, mode: ev.mode, overlay, hints, listeners };
}

export function filter(session: string, typed: string): void {
  if (active?.session !== session) return;
  for (const h of active.hints) active.overlay.update(h.tag, h.label, typed);
}

/** Activates the element labelled `label` if this frame has it. Ends the session here either way. */
export function pick(session: string, label: string): boolean {
  if (active?.session !== session) {
    endLocal(session);
    return false;
  }
  const hit = active.hints.find((h) => h.label === label);
  const mode = active.mode;
  endLocal(session);
  if (!hit) return false;
  if (mode === 'newTab') openInNewTab(hit.el);
  else activate(hit.el);
  return true;
}

/** Removes this frame's labels. With a session id, only if it is that session. */
export function endLocal(session?: string): void {
  const ending = session ?? active?.session ?? prepared?.session;
  if (session && active && active.session !== session) return;
  if (active) {
    for (const [type, fn] of active.listeners) removeEventListener(type, fn, true);
    active.overlay.remove();
  }
  active = null;
  prepared = null;
  if (ending) for (const fn of endWatchers) fn(ending);
}

export function handleHintEvent(ev: HintEvent): void {
  switch (ev.type) {
    case 'hints:show':
      return show(ev);
    case 'hints:typed':
      return filter(ev.session, ev.typed);
    case 'hints:pick':
      void pick(ev.session, ev.label);
      return;
    case 'hints:end':
      return endLocal(ev.session);
  }
}

// --- Frame visibility ---------------------------------------------------------------

function intersects(r: DOMRect, region: DOMRectReadOnly): boolean {
  return r.right > region.left && r.left < region.right && r.bottom > region.top && r.top < region.bottom;
}

/**
 * The part of this frame's viewport that is visible on screen, in this frame's
 * coordinates, or null if none is. An iframe can be scrolled out of view or clipped
 * by its parents while its own viewport looks fine, so measure it: an
 * IntersectionObserver with no root reports intersection with the top-level
 * viewport, even across origins. The probe is a fixed element covering this frame's
 * viewport.
 */
async function visibleRegion(): Promise<DOMRectReadOnly | null> {
  if (!innerWidth || !innerHeight) return null;
  const whole = new DOMRect(0, 0, innerWidth, innerHeight);
  if (window === window.top) return whole;

  const probe = document.createElement('keynav-probe');
  probe.style.cssText = ['all: initial', 'display: block', 'position: fixed', 'inset: 0', 'visibility: hidden', 'pointer-events: none']
    .map((d) => `${d} !important`).join('; ');
  document.documentElement.append(probe);
  try {
    return await new Promise((resolve) => {
      const io = new IntersectionObserver(([entry]) => {
        io.disconnect();
        resolve(entry?.isIntersecting ? entry.intersectionRect : null);
      });
      io.observe(probe);
      setTimeout(() => {
        io.disconnect();
        resolve(whole); // no answer (shouldn't happen): assume visible
      }, 200);
    });
  } finally {
    probe.remove();
  }
}
