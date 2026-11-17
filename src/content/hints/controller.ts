// Link-hint mode: label every visible clickable element; typing a label picks it.
//   Esc          leave without picking
//   Backspace    undo the last typed letter
//   other letters that match no label are swallowed and ignored
//   non-character keys (Tab, arrows, Enter) leave hint mode and reach the page
// Hint mode also ends on scroll, resize, mouse click, window blur and page unload.
import { grabKeys } from '../keys/grab';
import { normalizeKey } from '../keys/normalize';
import * as smooth from '../scroll/smooth';
import { activate } from './activate';
import { collectTargets } from './candidates';
import { makeLabels } from './labels';
import { settings } from '../settings';
import { createOverlay } from './overlay';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

let session: { exit(): void } | null = null;

export function showHints(onPick: (el: Element) => void = activate): void {
  session?.exit();
  smooth.stop(); // a glide still running would fire scroll events and end hint mode

  const t0 = performance.now();
  const targets = collectTargets();
  if (__TEST__) {
    const ms = performance.now() - t0;
    document.documentElement.dataset.keynavHintMs = ms.toFixed(1);
    console.debug(`[keynav] ${targets.length} hints in ${ms.toFixed(1)} ms`);
  }
  if (!targets.length) return;

  const alphabet = settings().hintChars;
  const labels = makeLabels(targets.length, alphabet);
  const overlay = createOverlay();
  const hints = targets.map((t, i) => {
    const label = labels[i]!;
    return { el: t.el, label, tag: overlay.add(label, t.rect, t.el) };
  });
  let typed = '';

  const render = () => {
    for (const h of hints) overlay.update(h.tag, h.label, typed);
  };

  const onKey = (e: KeyboardEvent): boolean => {
    if (MODIFIERS.has(e.key)) return false;
    if (e.key === 'Escape') {
      exit();
      return true;
    }
    if (e.key === 'Backspace') {
      typed = typed.slice(0, -1);
      render();
      return true;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return false;

    const key = normalizeKey(e)?.toLowerCase();
    if (!key) {
      exit(); // Tab, arrows, Enter...: the user moved on
      return false;
    }
    if (key.length !== 1 || !alphabet.includes(key)) return true;

    const next = typed + key;
    if (!hints.some((h) => h.label.startsWith(next))) return true;
    typed = next;

    const picked = hints.find((h) => h.label === typed); // unique: labels are prefix-free
    if (picked) {
      exit();
      onPick(picked.el);
    } else {
      render();
    }
    return true;
  };

  const onScroll = (e: Event) => {
    const t = e.target;
    if (t === document || t === document.scrollingElement || (t instanceof Node && hints.some((h) => t.contains(h.el)))) {
      exit();
    }
  };
  const onBlur = (e: Event) => e.target === window && exit();

  const listeners: [string, EventListener][] = [
    ['scroll', onScroll],
    ['resize', exit],
    ['mousedown', exit],
    ['blur', onBlur],
    ['pagehide', exit],
  ];
  for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
  const ungrab = grabKeys(onKey);

  function exit(): void {
    if (session !== current) return;
    session = null;
    ungrab();
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    overlay.remove();
  }
  const current = { exit };
  session = current;
}
