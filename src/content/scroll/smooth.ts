// Smooth scrolling driven by requestAnimationFrame.
//
// Scrolling is modelled as a "pending" distance that drains each frame with an
// exponential ease-out (time constant TAU_MS):
//   - a tap adds a fixed distance, which glides out over ~150 ms;
//   - holding a key keeps feeding pending at a steady speed (after a short delay so
//     taps don't overshoot, then ramping up), so motion is continuous instead of
//     following the OS key-repeat rate; on release the remainder eases out.
// Our own float position is kept so sub-pixel steps aren't lost to rounding.
// Tap distance and hold speed come from the user's settings.
import { settings } from '../settings';

const TAU_MS = 50;
const HOLD_DELAY_MS = 150;
const HOLD_RAMP_MS = 200;
const MAX_FRAME_MS = 50; // don't leap after a stalled frame

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Glide unless the user turned smooth scrolling off or asks the OS for reduced motion. */
const gliding = () => settings().smoothScroll && !reducedMotion.matches;

interface Hold {
  dir: 1 | -1;
  since: number;
}

interface Animation {
  el: Element;
  pos: number; // our float position
  lastSet: number; // scrollTop after our last write, to notice outside scrolling
  pending: number;
  hold: Hold | null;
  frame: number;
  last: number;
}

let current: Animation | null = null;

/** Glide `dy` pixels. Reversing direction drops whatever was still pending. */
export function impulse(el: Element, dy: number): void {
  const a = animationFor(el);
  if (a.pending !== 0 && Math.sign(a.pending) !== Math.sign(dy)) a.pending = 0;
  a.pending += dy;
  run(a);
}

/** Tap `dy` now and keep scrolling in that direction until the returned release(). */
export function hold(el: Element, dy: number): () => void {
  impulse(el, dy);
  const a = animationFor(el);
  const h: Hold = { dir: dy < 0 ? -1 : 1, since: performance.now() };
  a.hold = h;
  return () => {
    if (a.hold === h) a.hold = null; // a newer hold (other key) keeps going
  };
}

/** Stop immediately (before jumps like gg/G, or when changing scroller). */
export function stop(): void {
  if (current?.frame) cancelAnimationFrame(current.frame);
  current = null;
}

function animationFor(el: Element): Animation {
  if (current?.el !== el) {
    stop();
    current = { el, pos: el.scrollTop, lastSet: el.scrollTop, pending: 0, hold: null, frame: 0, last: 0 };
  }
  return current;
}

function run(a: Animation): void {
  if (a.frame) return;
  a.last = performance.now();
  a.frame = requestAnimationFrame(tick);
}

function tick(now: number): void {
  const a = current;
  if (!a) return;
  a.frame = 0;
  if (!a.el.isConnected) return stop();

  const dt = Math.min(Math.max(now - a.last, 0), MAX_FRAME_MS);
  a.last = now;

  // Someone else scrolled (wheel, page script): continue from where it is now.
  if (Math.abs(a.el.scrollTop - a.lastSet) > 2) a.pos = a.el.scrollTop;

  if (a.hold) {
    const t = now - a.hold.since - HOLD_DELAY_MS;
    if (t > 0) a.pending += a.hold.dir * settings().scrollSpeed * Math.min(1, t / HOLD_RAMP_MS) * (dt / 1000);
  }

  let step = gliding() ? a.pending * (1 - Math.exp(-dt / TAU_MS)) : a.pending;
  if (!a.hold && Math.abs(a.pending - step) < 0.5) step = a.pending; // land exactly
  a.pending -= step;

  const max = a.el.scrollHeight - a.el.clientHeight;
  const wanted = a.pos + step;
  const target = Math.min(Math.max(wanted, 0), max);
  if (target !== wanted) a.pending = 0; // ran into the top or bottom
  a.pos = target;
  a.el.scrollTo({ top: target, behavior: 'instant' });
  a.lastSet = a.el.scrollTop;

  if (a.pending !== 0 || a.hold) a.frame = requestAnimationFrame(tick);
  else current = null;
}
