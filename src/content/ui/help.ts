// The `?` help panel: every command with its current keys, grouped. Reflects the
// user's own key mappings. Esc or ? closes it; j/k scroll it; a click outside closes it.
import { COMMANDS, type CommandName } from '../../shared/commands';
import type { Keymap } from '../../shared/keymap';
import { fire } from '../../shared/messages';
import { grabKeys } from '../keys/grab';
import { createIsolatedHost, PANEL_CSS } from './host';

const CSS = `${PANEL_CSS}
  .panel {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(680px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow: auto;
    padding: 16px 20px 12px;
    pointer-events: auto;
  }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  h1 { margin: 0; font-size: 16px; font-weight: 650; }
  .hint { color: #656d76; font-size: 12px; }
  .groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 4px 28px; }
  h2 { margin: 10px 0 4px; font-size: 11px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: #656d76; }
  .row { display: flex; gap: 10px; align-items: baseline; padding: 2px 0; }
  .keys { flex: 0 0 76px; display: flex; flex-wrap: wrap; gap: 3px; }
  footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #d0d7de; font-size: 12px; }
  button { font: inherit; color: #0969da; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    .hint, h2 { color: #8d96a0; }
    footer { border-color: #30363d; }
    button { color: #4493f8; }
  }
`;

let closeCurrent: (() => void) | null = null;

export function showHelp(keymap: Keymap): void {
  if (closeCurrent) return closeCurrent();

  const ui = createIsolatedHost('keynav-help', CSS);
  const panel = el('div', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'KeyNav keyboard shortcuts');

  const header = el('header');
  header.append(el('h1', '', 'KeyNav shortcuts'), el('span', 'hint', 'Esc or ? to close'));
  panel.append(header);

  const keysFor = new Map<CommandName, string[]>();
  for (const [keys, command] of Object.entries(keymap.keys)) {
    keysFor.set(command, [...(keysFor.get(command) ?? []), keys]);
  }
  const groups = el('div', 'groups');
  const byGroup = new Map<string, HTMLElement>();
  for (const [name, { group, description }] of Object.entries(COMMANDS) as [CommandName, (typeof COMMANDS)[CommandName]][]) {
    const keys = keysFor.get(name);
    if (!keys) continue; // unmapped
    let section = byGroup.get(group);
    if (!section) {
      section = el('section');
      section.append(el('h2', '', group));
      byGroup.set(group, section);
      groups.append(section);
    }
    const row = el('div', 'row');
    const keyCell = el('span', 'keys');
    for (const k of keys) keyCell.append(el('kbd', '', k));
    row.append(keyCell, el('span', '', description));
    if (__TEST__) row.dataset.command = name;
    section.append(row);
  }
  panel.append(groups);

  const footer = el('footer');
  const options = el('button', '', 'Change keys and site rules');
  options.addEventListener('click', () => {
    fire({ type: 'openOptions' });
    close();
  });
  footer.append(options);
  panel.append(footer);
  ui.root.append(panel);

  const ungrab = grabKeys((e) => {
    if (e.key === 'Escape' || e.key === '?') close();
    else if (e.key === 'j') panel.scrollBy({ top: 40 });
    else if (e.key === 'k') panel.scrollBy({ top: -40 });
    else if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return false;
    return true; // everything else is swallowed while help is open
  });
  const onMouseDown = (e: Event) => {
    if (!e.composedPath().includes(ui.host)) close();
  };
  addEventListener('mousedown', onMouseDown, true);
  addEventListener('pagehide', close);

  function close(): void {
    ungrab();
    ui.remove();
    removeEventListener('mousedown', onMouseDown, true);
    removeEventListener('pagehide', close);
    closeCurrent = null;
  }
  closeCurrent = close;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
