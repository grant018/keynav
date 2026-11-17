import type { Page } from '@playwright/test';
import { test, expect, PAGES } from './fixtures';
import { pick, readHints, showHints } from './helpers';

const expectedHints = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-expect=hint]')].map((e) => e.id).sort());

const events = (page: Page) => page.evaluate(() => (window as { __events?: string[] }).__events ?? []);

for (const name of ['clickable-divs', 'covered']) {
  test(`${name}: hints exactly the expected elements`, async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/${name}.html`);
    const expected = await expectedHints(page);
    const hints = await showHints(page);
    expect(hints.map((h) => h.target).sort()).toEqual(expected);
  });
}

test.describe('clickable divs', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/clickable-divs.html`);
  });

  for (const id of ['cursor-div', 'tabindex-div', 'jsaction']) {
    test(`${id} is clicked`, async ({ page }) => {
      await pick(page, id);
      await expect.poll(() => events(page)).toEqual([id]);
    });
  }

  test('a button filling a link: the click lands on the button and bubbles to the link', async ({ page }) => {
    await pick(page, 'inner-same');
    await page.waitForURL(/#same$/);
  });
});

test.describe('shadow DOM', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/shadow.html`);
  });

  test('hints elements in open, closed and nested shadow roots, and slotted ones once', async ({ page }) => {
    const hints = await showHints(page);
    expect(hints.map((h) => h.target).sort()).toEqual(
      ['closed-button', 'light', 'nested-pointer', 'open-button', 'open-link', 'slotted'].sort(),
    );
  });

  for (const id of ['open-button', 'closed-button', 'nested-pointer']) {
    test(`${id} is clicked`, async ({ page }) => {
      await pick(page, id);
      await expect.poll(() => events(page)).toEqual([id]);
    });
  }

  test('a link inside a shadow root is followed', async ({ page }) => {
    await pick(page, 'open-link');
    await page.waitForURL(`${PAGES}/frame.html?shadow`);
  });

  test('F on a link inside a shadow root opens it in a new tab', async ({ context, page }) => {
    const next = context.waitForEvent('page');
    await pick(page, 'open-link', 'Shift+F');
    const opened = await next;
    await opened.waitForURL(`${PAGES}/frame.html?shadow`);
  });
});

test('modal dialog: elements behind it are not hinted', async ({ serviceWorker: _sw, page }) => {
  await page.goto(`${PAGES}/hostile-css.html`);
  await page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).showModal());
  const hints = await showHints(page);
  expect(hints.map((h) => h.target)).toEqual(['in-dialog']);
});

async function collectionTimes(page: Page, expectedHints: (n: number) => void): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const hints = await showHints(page);
    expectedHints(hints.length);
    times.push(Number(await page.evaluate(() => document.documentElement.dataset.keynavHintMs)));
    await page.keyboard.press('Escape');
    expect(await readHints(page)).toBeNull();
  }
  return times;
}

// Tagged @perf: excluded from `npm run e2e` (timings are meaningless under parallel
// load); run alone with `npm run perf`.
test.describe('performance @perf', () => {
  test.describe.configure({ mode: 'serial' });

  test('2000-link page, ~400 links on screen: hints collected in under 50 ms', async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/many.html`);
    const times = await collectionTimes(page, (n) => expect(n).toBeGreaterThan(300));
    console.log(`many.html: ${times.join(', ')} ms`);
    expect(Math.min(...times)).toBeLessThan(50);
  });

  test('worst case, all 2000 links on screen: under 150 ms', async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/many.html?dense`);
    const times = await collectionTimes(page, (n) => expect(n).toBe(2000));
    console.log(`many.html?dense: ${times.join(', ')} ms`);
    expect(Math.min(...times)).toBeLessThan(150);
  });
});
