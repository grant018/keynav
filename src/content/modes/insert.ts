// Insert mode isn't stored state: on every keydown we ask whether the focused
// element takes typing. That stays correct when pages move focus behind our back.
import { deepActiveElement } from '../dom/shadow';

const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number',
  'date', 'datetime-local', 'month', 'time', 'week',
]);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox']);

export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLSelectElement) return true; // letter keys jump between options
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el.ownerDocument.designMode === 'on') return true;
  if (TEXT_ROLES.has(el.getAttribute('role') ?? '')) return true;
  // Editors built on the EditContext API (newer Monaco etc.) aren't contenteditable.
  if ((el as { editContext?: unknown }).editContext != null) return true;
  return false;
}

export function inInsertMode(): boolean {
  return isEditable(deepActiveElement());
}

/** Leaves the focused field (Esc in insert mode). */
export function leaveInsertMode(): void {
  const el = deepActiveElement();
  if (el instanceof HTMLElement || el instanceof SVGElement) el.blur();
}
