import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('icons', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

  it('every icon the manifest names exists at its declared size', () => {
    const declared = { ...manifest.icons, ...manifest.action.default_icon } as Record<string, string>;
    for (const [size, path] of Object.entries(declared)) {
      expect(pngSize(path), path).toEqual([Number(size), Number(size)]);
    }
  });

  it('the grey "off" icons the background worker switches to exist', () => {
    for (const size of [16, 32]) expect(pngSize(`icons/off-${size}.png`)).toEqual([size, size]);
  });
});
