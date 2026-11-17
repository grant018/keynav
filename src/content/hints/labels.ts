// Hint label generation. Pure: no DOM.
//
// Labels are prefix-free (no label is the start of another), so a label fires the
// moment its last letter is typed. Built breadth-first: start from [""], and keep
// replacing the oldest entry with itself + each alphabet letter until there are
// enough. Shorter labels come first, so earlier elements (in DOM order) get them.

/** Vimium's default hint characters: home row plus easy reaches (also the settings default). */
export const HINT_ALPHABET = 'sadfjklewcmpgh';

export function makeLabels(n: number, alphabet: string = HINT_ALPHABET): string[] {
  if (n <= 0) return [];
  if (alphabet.length < 2) throw new Error('hint alphabet needs at least two characters');
  const queue = [''];
  let offset = 0;
  while (queue.length - offset < n || queue[offset] === '') {
    const prefix = queue[offset++]!;
    for (const ch of alphabet) queue.push(prefix + ch);
  }
  return queue.slice(offset, offset + n);
}
