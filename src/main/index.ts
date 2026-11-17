// Runs in the page's own JavaScript world (manifest "world": "MAIN"), not the
// content script's isolated world.
//
// Why: the isolated world has its own Content Security Policy, which blocks
// javascript: URLs. A javascript: link clicked from the content script does
// nothing, so the content script asks this script to do the click instead, and the
// page's own CSP applies, exactly as for a real click.
//
// Any page script could dispatch this event too, but that only lets a page click
// its own elements, which it can do anyway.
import { MAIN_CLICK_EVENT } from '../shared/main-world';

window.addEventListener(
  MAIN_CLICK_EVENT,
  (e) => {
    e.stopImmediatePropagation();
    const target = e.composedPath()[0];
    if (target instanceof HTMLElement) target.click();
  },
  true,
);
