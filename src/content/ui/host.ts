// A container for KeyNav's on-page UI (hints, the pass-through notice, help),
// isolated from the page:
//   - the host element carries inline `all: initial !important` (inline !important
//     beats any page stylesheet) and holds a shadow root the page's CSS can't reach;
//   - it is shown as a manual popover, so it sits in the browser's top layer: above
//     modal dialogs and fullscreen elements, and positioned against the viewport even
//     when the page puts a transform on <html> or <body>.

const HOST_CSS = [
  'all: initial',
  'display: block',
  'position: fixed',
  'inset: 0',
  'width: auto',
  'height: auto',
  'max-width: none',
  'max-height: none',
  'margin: 0',
  'padding: 0',
  'border: 0',
  'background: transparent',
  'overflow: visible',
  'pointer-events: none',
  'z-index: 2147483647',
].map((d) => `${d} !important`).join('; ');

export interface IsolatedHost {
  host: HTMLElement;
  root: ShadowRoot;
  remove(): void;
}

export function createIsolatedHost(tag: string, css: string): IsolatedHost {
  const host = document.createElement(tag);
  host.style.cssText = HOST_CSS;
  const root = host.attachShadow({ mode: __TEST__ ? 'open' : 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet]; // not subject to the page's CSP
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    root.append(style);
  }
  document.documentElement.append(host);
  try {
    host.setAttribute('popover', 'manual');
    host.showPopover();
  } catch {
    // No top layer: fixed + max z-index still covers most pages.
  }
  return { host, root, remove: () => host.remove() };
}

/** Shared look for KeyNav panels (pass-through notice, help). */
export const PANEL_CSS = `
  :host { color-scheme: light dark; }
  .panel {
    position: absolute;
    box-sizing: border-box;
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1f2328;
    background: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
  }
  kbd {
    display: inline-block;
    min-width: 1.4em;
    padding: 0 5px;
    font: 600 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-align: center;
    color: #302505;
    background: linear-gradient(#fff785, #ffc542);
    border: 1px solid #c38a22;
    border-radius: 3px;
  }
  @media (prefers-color-scheme: dark) {
    .panel { color: #e6edf3; background: #161b22; border-color: #30363d; box-shadow: 0 8px 24px rgb(0 0 0 / 0.6); }
  }
`;
