// Scroll commands. Movement is animated by smooth.ts (our own loop, so a page's
// `scroll-behavior: smooth` has no effect); gg/G jump instantly.
import type { Command } from '../keys/dispatcher';
import { findScroller } from './scroller';
import * as smooth from './smooth';
import { settings } from '../settings';

function holdScroll(dy: number): (() => void) | undefined {
  const el = findScroller();
  return el ? smooth.hold(el, dy) : undefined;
}

function glide(dy: (el: Element) => number): void {
  const el = findScroller();
  if (el) smooth.impulse(el, dy(el));
}

function jump(top: (el: Element) => number): void {
  const el = findScroller();
  if (!el) return;
  smooth.stop();
  el.scrollTo({ top: top(el), behavior: 'instant' });
}

export const scrollCommands = {
  // Held: keep scrolling until keyup (OS auto-repeat is ignored).
  scrollDown: { run: () => holdScroll(settings().scrollStep) },
  scrollUp: { run: () => holdScroll(-settings().scrollStep) },
  // Each auto-repeat adds another half page to the glide.
  scrollHalfDown: { repeatable: true, run: () => glide((el) => el.clientHeight / 2) },
  scrollHalfUp: { repeatable: true, run: () => glide((el) => -el.clientHeight / 2) },
  scrollToTop: { run: () => jump(() => 0) },
  scrollToBottom: { run: () => jump((el) => el.scrollHeight) },
} satisfies Record<string, Command>;
