import type { Frame, Page } from '@playwright/test';
import { test, expect, PAGES } from './fixtures';
import type { HintInfo } from './helpers';

/** Hints shown in one frame (open shadow root in test builds); null when none. */
const hintsIn = (frame: Frame) =>
  frame
    .evaluate((): HintInfo[] | null => {
      const root = document.querySelector('keynav-hints')?.shadowRoot;
      if (!root) return null;
      return [...root.querySelectorAll<HTMLElement>('.hint')].map((h) => {
        const r = h.getBoundingClientRect();
        return {
          label: h.dataset.label!,
          target: h.dataset.target!,
          hidden: h.hidden === true,
          text: h.innerText,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      });
    })
    .catch(() => null);

/** Every frame's hints, keyed by a short frame name. */
async function allHints(page: Page): Promise<Record<string, HintInfo[]>> {
  const out: Record<string, HintInfo[]> = {};
  for (const frame of page.frames()) {
    const hints = await hintsIn(frame);
    if (hints) out[frameName(frame)] = hints;
  }
  return out;
}

function frameName(frame: Frame): string {
  const url = frame.url();
  if (frame === frame.page().mainFrame()) return 'top';
  if (url === 'about:srcdoc') return 'srcdoc';
  return new URL(url).search.slice(1) || new URL(url).pathname.slice(1);
}

const frameByName = (page: Page, name: string) => page.frames().find((f) => frameName(f) === name)!;

async function showAll(page: Page): Promise<Record<string, HintInfo[]>> {
  await page.keyboard.press('f');
  await expect.poll(async () => Object.keys(await allHints(page)).length, { timeout: 3000 }).toBeGreaterThanOrEqual(5);
  return allHints(page);
}

async function pickIn(page: Page, frame: string, target: string, key = 'f'): Promise<void> {
  if (key !== 'f') await page.keyboard.press(key);
  const hints = key === 'f' ? await showAll(page) : await (async () => {
    await expect.poll(async () => Object.keys(await allHints(page)).length, { timeout: 3000 }).toBeGreaterThanOrEqual(5);
    return allHints(page);
  })();
  const hint = hints[frame]?.find((h) => h.target === target);
  expect(hint, `a hint for #${target} in ${frame}`).toBeDefined();
  await page.keyboard.type(hint!.label);
}

const events = (frame: Frame) => frame.evaluate(() => (window as { __events?: string[] }).__events ?? []);

test.describe('hints across frames', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/iframes.html`);
    // Every frame's content script is running.
    await expect.poll(() => page.frames().length).toBe(8);
    await page.waitForLoadState('load');
  });

  test('every visible frame is hinted with labels unique across the tab; hidden and off-screen frames are not', async ({ page }) => {
    const hints = await showAll(page);
    expect(Object.keys(hints).sort()).toEqual(['cross', 'nested', 'same', 'srcdoc', 'top']);
    expect(hints.top!.map((h) => h.target).sort()).toEqual(['top-button', 'top-link']);
    for (const name of ['same', 'cross', 'nested']) {
      expect(hints[name]!.map((h) => h.target).sort()).toEqual(['f-button', 'f-input', 'f-link']);
    }
    const labels = Object.values(hints).flat().map((h) => h.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const a of labels) for (const b of labels) if (a !== b) expect(b.startsWith(a)).toBe(false);
    // The top frame is asked first, so it gets the first labels.
    expect(hints.top!.map((h) => h.label).sort()).toEqual(['a', 's']);
  });

  test('typing filters labels in every frame', async ({ serviceWorker: sw, page }) => {
    // Two hint letters, so 12 targets need multi-letter labels.
    await sw.evaluate(() => chrome.storage.sync.set({ settings: { hintChars: 'ab' } }));
    await page.reload();
    await expect.poll(() => page.frames().length).toBe(8);
    // The page has loaded its settings (otherwise f would still use the default letters).
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.keynavSettings)).toBeTruthy();
    const hints = await showAll(page);
    expect(Object.values(hints).flat().every((h) => /^[ab]+$/.test(h.label))).toBe(true);
    const twoLetter = Object.values(hints).flat().find((h) => h.label.length >= 2)!;
    const first = twoLetter.label[0]!;
    await page.keyboard.press(first);
    await expect
      .poll(async () => {
        const now = await allHints(page);
        return Object.values(now).flat().every((h) => h.hidden === !h.label.startsWith(first));
      })
      .toBe(true);
  });

  test('a label in a cross-origin frame clicks its element', async ({ page }) => {
    await pickIn(page, 'cross', 'f-button');
    await expect.poll(() => events(frameByName(page, 'cross'))).toEqual(['f-button']);
    await expect.poll(async () => Object.keys(await allHints(page))).toEqual([]);
  });

  test('a button in a srcdoc frame is clicked', async ({ page }) => {
    await pickIn(page, 'srcdoc', 'srcdoc-button');
    await expect.poll(() => events(frameByName(page, 'srcdoc'))).toEqual(['srcdoc-button']);
  });

  test('a link in a nested cross-origin frame is followed in that frame', async ({ page }) => {
    const nested = frameByName(page, 'nested');
    await pickIn(page, 'nested', 'f-link');
    await expect.poll(() => nested.url()).toBe(`${PAGES}/frame.html?from-frame`);
    expect(page.url()).toBe(`${PAGES}/iframes.html`);
  });

  test('Esc removes the labels from every frame, and the page sees nothing', async ({ page }) => {
    await showAll(page);
    await page.keyboard.press('Escape');
    await expect.poll(async () => Object.keys(await allHints(page))).toEqual([]);
  });

  test('scrolling the page ends hints in every frame', async ({ page }) => {
    await showAll(page);
    await page.evaluate(() => scrollBy(0, 40));
    await expect.poll(async () => Object.keys(await allHints(page))).toEqual([]);
  });

  test('pressing f inside an iframe hints the whole tab; a top-level link can be picked', async ({ page }) => {
    const box = (await page.locator('#cross').boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 80); // empty area inside the frame
    expect(await frameByName(page, 'cross').evaluate(() => document.hasFocus())).toBe(true);
    await pickIn(page, 'top', 'top-link');
    await page.waitForURL(`${PAGES}/frame.html?top`);
  });

  for (const name of ['same', 'cross']) {
    test(`typing into a ${name}-origin frame’s input after picking it`, async ({ page }) => {
      await pickIn(page, name, 'f-input');
      const frame = frameByName(page, name);
      await expect.poll(() => frame.evaluate(() => document.activeElement?.id)).toBe('f-input');
      await page.keyboard.type('hello');
      expect(await frame.evaluate(() => (document.getElementById('f-input') as HTMLInputElement).value)).toBe('hello');
    });
  }

  test('F on a link inside a cross-origin frame opens it as the new tab', async ({ context, page }) => {
    const opened = context.waitForEvent('page');
    await pickIn(page, 'cross', 'f-link', 'Shift+F');
    const tab = await opened;
    await tab.waitForURL('http://localhost:8765/frame.html?from-frame');
  });
});
