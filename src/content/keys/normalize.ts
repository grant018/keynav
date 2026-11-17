// Turns a KeyboardEvent into the key name used in bindings, or null for keys the
// extension never handles (they always reach the page).
//
// Letters: use event.key when it is a Latin letter, so Dvorak/Colemak users get the
// letter printed on the key. Otherwise (Cyrillic, Greek, ...) fall back to the
// physical position from event.code. Case always comes from shiftKey, so CapsLock
// doesn't turn `j` into `J`.

export interface KeyLike {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function normalizeKey(e: KeyLike): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === 'Escape') return '<Esc>';

  let letter: string | undefined;
  if (/^[a-z]$/i.test(e.key)) letter = e.key.toLowerCase();
  else letter = /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase();
  if (letter) return e.shiftKey ? letter.toUpperCase() : letter;

  // Other printable characters (digits, punctuation, `?`), but not space.
  if (e.key.length === 1 && e.key !== ' ') return e.key;
  return null;
}
