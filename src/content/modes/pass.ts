// Pass-through mode (`i`): every key goes to the page until Esc. For apps with their
// own keyboard handling that KeyNav can't detect as text fields (Google Docs, Figma).
// A small notice in the corner shows the mode is on.
import { grabKeys } from '../keys/grab';
import { createIsolatedHost, PANEL_CSS } from '../ui/host';

const CSS = `${PANEL_CSS}
  .panel { right: 16px; bottom: 16px; padding: 6px 12px; }
`;

let exitCurrent: (() => void) | null = null;

export function enterPassThrough(): void {
  if (exitCurrent) return;

  const ui = createIsolatedHost('keynav-pass', CSS);
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.append('Keys go to the page · ');
  const kbd = document.createElement('kbd');
  kbd.textContent = 'Esc';
  panel.append(kbd, ' to stop');
  ui.root.append(panel);

  const ungrab = grabKeys((e) => {
    if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
    exit();
    return true;
  });
  const exit = () => {
    ungrab();
    ui.remove();
    removeEventListener('pagehide', exit);
    exitCurrent = null;
  };
  addEventListener('pagehide', exit);
  exitCurrent = exit;
}
