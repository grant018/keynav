// Draws hint labels in an isolated, top-layer container (see ui/host.ts).
import { createIsolatedHost } from '../ui/host';

const CSS = `
  .hint {
    position: absolute;
    box-sizing: border-box;
    padding: 1px 3px;
    font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
    color: #302505;
    background: linear-gradient(#fff785, #ffc542);
    border: 1px solid #c38a22;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .hint[hidden] { display: none; }
  .typed { color: #b48a1c; }
`;

export interface Overlay {
  add(label: string, rect: DOMRect, el: Element): HTMLElement;
  update(tag: HTMLElement, label: string, typed: string): void;
  remove(): void;
}

export function createOverlay(): Overlay {
  const { root, remove } = createIsolatedHost('keynav-hints', CSS);

  const render = (tag: HTMLElement, label: string, typed: string) => {
    const typedSpan = document.createElement('span');
    typedSpan.className = 'typed';
    typedSpan.textContent = typed;
    tag.replaceChildren(typedSpan, label.slice(typed.length));
  };

  return {
    add(label, rect, el) {
      const tag = document.createElement('div');
      tag.className = 'hint';
      tag.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - 24))}px`;
      tag.style.top = `${Math.max(0, Math.min(rect.top, innerHeight - 16))}px`;
      render(tag, label, '');
      if (__TEST__) {
        tag.dataset.label = label;
        tag.dataset.target = el.id;
      }
      root.append(tag);
      return tag;
    },
    update(tag, label, typed) {
      tag.hidden = !label.startsWith(typed);
      if (!tag.hidden) render(tag, label, typed);
    },
    remove,
  };
}
