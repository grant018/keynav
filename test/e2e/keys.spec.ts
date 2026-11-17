import type { Page } from '@playwright/test';
import { test, expect, PAGES } from './fixtures';

declare global {
  interface Window {
    __log: string[];
    __closedInput: HTMLInputElement;
  }
}

/** Returns and clears what the page's own key listeners saw, minus modifier keys. */
const takeLog = (page: Page) =>
  page.evaluate(() => window.__log.splice(0).filter((l) => !/:(Shift|Control|Alt|Meta)$/.test(l)));

/** Waits until scrolling stops (no change for 10 frames), then returns the position. */
const settled = (page: Page, id?: string) =>
  page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const read = () => (id ? document.getElementById(id)!.scrollTop : window.scrollY);
        let last = read();
        let still = 0;
        const frame = () => {
          const v = read();
          still = v === last ? still + 1 : 0;
          last = v;
          if (still >= 10) resolve(v);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    id,
  );

/** Records window.scrollY every frame for `ms`. Start it, then press keys, then await it. */
const sampleScroll = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const t0 = performance.now();
        const frame = () => {
          out.push(window.scrollY);
          if (performance.now() - t0 < ms) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );

const maxScrollY = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

test.describe('hotkeys page', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
  });

  test('bound keys are hidden from the page; unbound keys reach it', async ({ page }) => {
    for (const k of ['j', 'k', 'd', 'u', 'g', 'g', 'Shift+G', 'g', 'g']) await page.keyboard.press(k);
    expect(await takeLog(page)).toEqual([]);

    await page.keyboard.press('q');
    expect(await takeLog(page)).toEqual(['keydown:q', 'keypress:q', 'keyup:q']);
  });

  test('scrolls the window', async ({ page }) => {
    const half = await page.evaluate(() => document.documentElement.clientHeight / 2);
    await page.keyboard.press('j');
    expect(await settled(page)).toBe(60);
    await page.keyboard.press('k');
    expect(await settled(page)).toBe(0);
    await page.keyboard.press('d');
    expect(Math.abs((await settled(page)) - half)).toBeLessThanOrEqual(1);
    await page.keyboard.press('u');
    expect(await settled(page)).toBe(0);
    await page.keyboard.press('Shift+G');
    expect(await settled(page)).toBe(await maxScrollY(page));
    await page.keyboard.press('g');
    await page.keyboard.press('g');
    expect(await settled(page)).toBe(0);
  });

  test('a tap glides over several frames and lands exactly on the step', async ({ page }) => {
    const samples = sampleScroll(page, 400);
    await page.keyboard.press('j');
    const ys = await samples;
    const between = new Set(ys.filter((y) => y > 0 && y < 60));
    expect(between.size).toBeGreaterThanOrEqual(3); // not a single jump
    expect(ys.every((y, i) => i === 0 || y >= ys[i - 1]!)).toBe(true); // never moves backwards
    expect(ys.at(-1)).toBe(60);
  });

  test('holding j scrolls continuously and stops soon after release', async ({ page }) => {
    await page.keyboard.down('j');
    await page.keyboard.down('j'); // OS auto-repeat events are ignored
    await page.waitForTimeout(600);
    const y1 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(200);
    const y2 = await page.evaluate(() => window.scrollY);
    expect(y1).toBeGreaterThan(200);
    expect(y2 - y1).toBeGreaterThan(150); // still moving at full speed
    await page.keyboard.up('j');
    const stoppedAt = await settled(page);
    expect(stoppedAt - y2).toBeLessThan(150); // eases out quickly, no runaway
    expect(await takeLog(page)).toEqual([]);
  });

  test('G during a glide lands on the bottom and stays there', async ({ page }) => {
    await page.keyboard.press('d');
    await page.keyboard.press('Shift+G');
    expect(await settled(page)).toBe(await maxScrollY(page));
  });

  test('reversing direction mid-glide goes the new way at once', async ({ page }) => {
    await page.keyboard.press('Shift+G');
    const bottom = await settled(page);
    await page.keyboard.press('k');
    await page.keyboard.press('j'); // drops the pending upward glide
    expect(await settled(page)).toBe(bottom);
  });

  test('prefers-reduced-motion: taps move without gliding', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const samples = sampleScroll(page, 300);
    await page.keyboard.press('j');
    const ys = await samples;
    expect(ys.filter((y) => y > 0 && y < 60)).toEqual([]);
    expect(ys.at(-1)).toBe(60);
  });

  test('a half-typed sequence then an unbound key passes the key through', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('q');
    expect(await takeLog(page)).toEqual(['keydown:q', 'keypress:q', 'keyup:q']);
  });

  test('Esc is passed through unless it cancelled a sequence', async ({ page }) => {
    await page.keyboard.press('Escape');
    expect(await takeLog(page)).toEqual(['keydown:Escape', 'keyup:Escape']);
    await page.keyboard.press('g');
    await page.keyboard.press('Escape');
    expect(await takeLog(page)).toEqual([]);
  });

  test('ignores keys with Ctrl/Alt/Meta held', async ({ page }) => {
    await page.keyboard.press('Alt+j');
    expect(await settled(page)).toBe(0);
  });

  test('ignores synthetic key events dispatched by the page', async ({ page }) => {
    await page.evaluate(() =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true })),
    );
    expect(await settled(page)).toBe(0);
    expect(await takeLog(page)).toEqual(['keydown:j']);
  });

  const fields: [string, (page: Page) => Promise<void>, ((page: Page) => Promise<string>) | null][] = [
    ['text input', (p) => p.locator('#text').focus(), (p) => p.locator('#text').inputValue()],
    ['textarea', (p) => p.locator('#textarea').focus(), (p) => p.locator('#textarea').inputValue()],
    ['contenteditable', (p) => p.locator('#ce').focus(), (p) => p.locator('#ce').innerText()],
    ['open shadow-DOM input', (p) => p.locator('#open-input').focus(), (p) => p.locator('#open-input').inputValue()],
    [
      'closed shadow-DOM input',
      (p) => p.evaluate(() => window.__closedInput.focus()),
      (p) => p.evaluate(() => window.__closedInput.value),
    ],
    ['role=textbox', (p) => p.locator('#role-textbox').focus(), null],
    ['select', (p) => p.locator('#select').focus(), null],
  ];

  for (const [name, focus, value] of fields) {
    test(`typing in a ${name} passes keys through; Esc leaves it`, async ({ page }) => {
      await focus(page);
      await page.keyboard.type('jkdG');
      if (value) expect(await value(page)).toBe('jkdG');
      expect(await settled(page)).toBe(0);
      const log = await takeLog(page);
      for (const k of ['j', 'k', 'd', 'G']) expect(log).toContain(`keydown:${k}`);

      await page.keyboard.press('Escape');
      expect(await takeLog(page)).toEqual([]); // Esc was ours
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press('j');
      expect(await settled(page)).toBe(60);
    });
  }

  for (const id of ['checkbox', 'readonly']) {
    test(`a focused ${id} is not insert mode`, async ({ page }) => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('j');
      expect(await settled(page)).toBe(60);
    });
  }

  test('stops handling keys once the extension is reloaded (orphaned script)', async ({ page, serviceWorker }) => {
    await serviceWorker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await expect
      .poll(async () => {
        await page.keyboard.press('j');
        return (await takeLog(page)).includes('keydown:j');
      })
      .toBe(true);
    const y = await settled(page);
    await page.keyboard.press('j');
    expect(await settled(page)).toBe(y);
  });
});

test.describe('app-shell page (inner scrollers)', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/scroll.html`);
  });

  test('scrolls the largest inner scroller', async ({ page }) => {
    await page.keyboard.press('j');
    expect(await settled(page, 'main')).toBe(60);
    expect(await settled(page)).toBe(0);
    await page.keyboard.press('Shift+G');
    expect(await settled(page, 'main')).toBe(
      await page.evaluate(() => {
        const m = document.getElementById('main')!;
        return m.scrollHeight - m.clientHeight;
      }),
    );
  });

  test('scrolls whichever scroller was clicked last', async ({ page }) => {
    await page.locator('#side-top').click();
    await page.keyboard.press('j');
    expect(await settled(page, 'side')).toBe(60);
    expect(await settled(page, 'main')).toBe(0);

    await page.locator('#main-top').click();
    await page.keyboard.press('j');
    expect(await settled(page, 'main')).toBe(60);
    expect(await settled(page, 'side')).toBe(60);
  });
});
