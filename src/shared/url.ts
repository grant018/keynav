// Which link targets `F` may open in a new tab. Anything else (javascript:,
// mailto:, tel:, data:, malformed) is clicked in place instead.

const OPENABLE = new Set(['http:', 'https:']);

export function isOpenableUrl(url: string): boolean {
  try {
    return OPENABLE.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
