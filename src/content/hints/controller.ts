// Link-hint mode, driven from the frame where `f` (or `F`) was pressed. Every frame
// in the tab shows labels (see session.ts); this frame owns the keyboard:
//   Esc          leave without picking
//   Backspace    undo the last typed letter
//   other letters that match no label are swallowed and ignored
//   non-character keys (Tab, arrows, Enter) leave hint mode and reach the page
// Hint mode also ends on scroll, resize, mouse click, window blur and page unload.
//
// All frames derive their labels from the same total and alphabet, so this frame
// knows every label without asking: it can tell when one is complete, and only the
// frame that owns it acts. A label owned here is activated synchronously, inside the
// keypress, keeping its user activation (needed for popups and file pickers).
import { fire, send, type HintEvent, type HintMode } from '../../shared/messages';
import { grabKeys } from '../keys/grab';
import { normalizeKey } from '../keys/normalize';
import { settings } from '../settings';
import { makeLabels } from './labels';
import { endLocal, filter, onSessionEnd, pick, prepare, show } from './session';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

let cancelCurrent: (() => void) | null = null;

export function showHints(mode: HintMode = 'click'): void {
  cancelCurrent?.();
  const session = crypto.randomUUID();
  const chars = settings().hintChars;
  let labels: string[] | null = null; // null until every frame has counted
  let typed = '';
  const early: string[] = []; // letters typed before the labels were known

  const broadcast = (event: HintEvent) => fire({ type: 'hints:broadcast', event });

  const finish = () => {
    if (cancelCurrent !== cancel) return;
    cancelCurrent = null;
    ungrab();
    stopWatching();
    removeEventListener('blur', onBlur, true);
    removeEventListener('pagehide', cancel, true);
  };
  const cancel = () => {
    finish();
    endLocal(session);
    broadcast({ type: 'hints:end', session });
  };
  const onBlur = (e: Event) => e.target === window && cancel();

  const type = (key: string) => {
    if (!labels) return void early.push(key);
    const next = typed + key;
    if (!labels.some((l) => l.startsWith(next))) return;
    typed = next;
    if (labels.includes(typed)) {
      finish();
      if (!pick(session, typed)) broadcast({ type: 'hints:pick', session, label: typed });
      else broadcast({ type: 'hints:end', session });
    } else {
      filter(session, typed);
      broadcast({ type: 'hints:typed', session, typed });
    }
  };

  const ungrab = grabKeys((e) => {
    if (MODIFIERS.has(e.key)) return false;
    if (e.key === 'Escape') {
      cancel();
      return true;
    }
    if (e.key === 'Backspace') {
      if (early.length) early.pop();
      else if (labels) {
        typed = typed.slice(0, -1);
        filter(session, typed);
        broadcast({ type: 'hints:typed', session, typed });
      }
      return true;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const key = normalizeKey(e)?.toLowerCase();
    if (!key) {
      cancel(); // Tab, arrows, Enter...: the user moved on
      return false;
    }
    if (key.length === 1 && chars.includes(key)) type(key);
    return true;
  });
  const stopWatching = onSessionEnd((s) => s === session && finish());
  addEventListener('blur', onBlur, true);
  addEventListener('pagehide', cancel, true);
  cancelCurrent = cancel;

  const ready = (total: number) => {
    if (cancelCurrent !== cancel) return;
    if (!total) return finish();
    labels = makeLabels(total, chars);
    for (const key of early.splice(0)) type(key);
  };

  send({ type: 'hints:start', session, mode, chars }).then(
    (r) => ready(r.type === 'hints:started' ? r.total : 0),
    // No background worker (shouldn't happen): hint this frame on its own.
    async () => {
      const total = await prepare(session);
      show({ type: 'hints:show', session, offset: 0, total, chars, mode });
      ready(total);
    },
  );
}
