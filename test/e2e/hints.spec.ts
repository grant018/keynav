import type { Page } from '@playwright/test';
import { test, expect, PAGES } from './fixtures';
import { pick, readHints, showHints, takeLog } from './helpers';

const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id);

/** Waits two frames so scroll events from page.evaluate scrolling have fired. */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('hints page', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hints.html`);
  });

  test('f labels every clickable element, with unique uppercase labels', async ({ page }) => {
    const hints = await showHints(page);
    const expected = ['link', 'button', 'input', 'email', 'checkbox', 'select', 'ce', 'menu', 'onclick', 'summary',
      ...Array.from({ length: 20 }, (_, i) => `l${i + 1}`)];
    expect(hints.map((h) => h.target).sort()).toEqual(expected.sort());
    expect(new Set(hints.map((h) => h.label)).size).toBe(hints.length);
    for (const h of hints) expect(h.text).toBe(h.label.toUpperCase());
    expect(await takeLog(page)).toEqual([]); // the page never saw f
  });

  test('a link label follows the link', async ({ page }) => {
    await pick(page, 'link');
    await page.waitForURL(/\/frame\.html$/);
  });

  test('a button gets the full pointer/mouse sequence and one click', async ({ page }) => {
    await pick(page, 'button');
    await expect.poll(() => page.evaluate(() => window.__events)).toEqual([
      'button:pointerdown', 'button:mousedown', 'button:pointerup', 'button:mouseup', 'button:click',
    ]);
    expect(await readHints(page)).toBeNull();
  });

  test('menus that open on pointerdown open', async ({ page }) => {
    await pick(page, 'menu');
    await expect.poll(() => page.evaluate(() => window.__events)).toEqual(['menu:pointerdown']);
  });

  test('onclick elements are clicked', async ({ page }) => {
    await pick(page, 'onclick');
    await expect.poll(() => page.evaluate(() => window.__events)).toEqual(['onclick:click']);
  });

  test('an input is focused and typing goes into it (insert mode)', async ({ page }) => {
    await pick(page, 'input');
    expect(await activeId(page)).toBe('input');
    await page.keyboard.type('jkf');
    expect(await page.locator('#input').inputValue()).toBe('jkf');
    expect(await readHints(page)).toBeNull(); // f typed text instead of showing hints
  });

  test('an email input is focused (no selection-range error)', async ({ page }) => {
    await pick(page, 'email');
    expect(await activeId(page)).toBe('email');
  });

  test('contenteditable is focused with the caret at the end', async ({ page }) => {
    await pick(page, 'ce');
    await page.keyboard.type('X');
    expect(await page.locator('#ce').innerText()).toBe('editableX');
  });

  test('a checkbox toggles', async ({ page }) => {
    await pick(page, 'checkbox');
    await expect(page.locator('#checkbox')).toBeChecked();
  });

  test('a select is focused', async ({ page }) => {
    await pick(page, 'select');
    expect(await activeId(page)).toBe('select');
  });

  test('a summary opens its details', async ({ page }) => {
    await pick(page, 'summary');
    await expect(page.locator('#details')).toHaveAttribute('open');
  });

  test('typing filters hints; Backspace undoes; Esc leaves; the page sees none of it', async ({ page }) => {
    const hints = await showHints(page);
    const twoLetter = hints.find((h) => h.label.length === 2)!;
    const first = twoLetter.label[0]!;

    await page.keyboard.press(first);
    let now = (await readHints(page))!;
    for (const h of now) expect(h.hidden).toBe(!h.label.startsWith(first));
    expect(now.filter((h) => !h.hidden).length).toBeGreaterThan(1);

    await page.keyboard.press('Backspace');
    now = (await readHints(page))!;
    expect(now.every((h) => !h.hidden)).toBe(true);

    await page.keyboard.press('Escape');
    expect(await readHints(page)).toBeNull();
    expect(await takeLog(page)).toEqual([]);
    expect(await page.evaluate(() => window.__events)).toEqual([]);
  });

  test('letters that match no label are swallowed and ignored', async ({ page }) => {
    await showHints(page);
    await page.keyboard.press('x'); // not in the hint alphabet
    await page.keyboard.press('Shift'); // modifiers alone don't end hint mode
    const now = (await readHints(page))!;
    expect(now.every((h) => !h.hidden)).toBe(true);
    expect(await takeLog(page)).toEqual(['keydown:Shift', 'keyup:Shift']);
  });

  test('Tab leaves hint mode and reaches the page', async ({ page }) => {
    await showHints(page);
    await page.keyboard.press('Tab');
    expect(await readHints(page)).toBeNull();
    expect(await takeLog(page)).toContain('keydown:Tab');
  });

  test('scrolling ends hint mode', async ({ page }) => {
    await showHints(page);
    await page.evaluate(() => window.scrollBy(0, 50));
    await nextFrames(page);
    expect(await readHints(page)).toBeNull();
  });

  test('clicking ends hint mode', async ({ page }) => {
    await showHints(page);
    await page.mouse.click(5, 5);
    expect(await readHints(page)).toBeNull();
  });

  test('f again after leaving works, and j still scrolls after picking', async ({ page }) => {
    await showHints(page);
    await page.keyboard.press('Escape');
    await pick(page, 'checkbox');
    await expect(page.locator('#checkbox')).toBeChecked();
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(60);
  });
});

test('nothing to hint: f does nothing', async ({ serviceWorker: _sw, page }) => {
  await page.goto(`${PAGES}/empty.html`);
  await page.keyboard.press('f');
  expect(await readHints(page)).toBeNull();
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__log)).toEqual(['keydown:q', 'keypress:q', 'keyup:q']);
});

test('visibility: hints exactly the visible elements', async ({ serviceWorker: _sw, page }) => {
  await page.goto(`${PAGES}/visibility.html`);
  const expected = await page.evaluate(() =>
    [...document.querySelectorAll('[data-expect=hint]')].map((e) => e.id).sort(),
  );
  const hints = await showHints(page);
  expect(hints.map((h) => h.target).sort()).toEqual(expected);

  // A wrapped link is hinted at the start of its first line, not its bounding box.
  const firstLine = await page.evaluate(() => {
    const r = document.getElementById('wrapped')!.getClientRects()[0]!;
    return { left: r.left, top: r.top };
  });
  const wrapped = hints.find((h) => h.target === 'wrapped')!;
  expect(Math.abs(wrapped.rect.left - firstLine.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(wrapped.rect.top - firstLine.top)).toBeLessThanOrEqual(1);
});

test.describe('hostile page CSS', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hostile-css.html`);
  });

  test('hints stay visible, styled and on their targets (html transform, scrolled)', async ({ page }) => {
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
    await nextFrames(page);
    const hints = await showHints(page);
    expect(hints.map((h) => h.target).sort()).toEqual(['a1', 'a2', 'b1']);
    for (const h of hints) {
      const target = await page.evaluate((id) => {
        const r = document.getElementById(id)!.getClientRects()[0]!;
        return { left: r.left, top: r.top };
      }, h.target);
      expect(h.rect.width).toBeGreaterThan(0); // page's display: none didn't reach it
      expect(h.rect.height).toBeLessThan(25); // page's font-size/line-height didn't either
      expect(h.text).toBe(h.label.toUpperCase()); // nor text-transform: lowercase
      expect(Math.abs(h.rect.left - target.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.rect.top - target.top)).toBeLessThanOrEqual(1);
    }
  });

  test('with a modal dialog open, only the dialog is hinted, and hints sit above it', async ({ page }) => {
    await page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).showModal());
    const hints = await showHints(page);
    expect(hints.map((h) => h.target)).toEqual(['in-dialog']);
    expect(await page.evaluate(() => document.querySelector('keynav-hints')!.matches(':popover-open'))).toBe(true);
    await page.keyboard.type(hints[0]!.label);
    await page.waitForURL(/#d$/);
  });
});

test.describe('hover menus (touchscreen rule: a hover that reveals a menu does not click)', () => {
  const visible = (page: Page, id: string) => page.locator(`#${id}`).isVisible();

  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hovermenu.html`);
  });

  for (const [link, menu, item] of [
    ['arts', 'arts-menu', 'books'], // opens on mouseenter, synchronously
    ['opinion', 'opinion-menu', 'columns'], // opens a moment after mouseover
    ['portal', 'portal-menu', 'portal-link'], // rendered at the end of <body>
  ] as const) {
    test(`${link}: f opens the menu without following the link; its items can then be picked`, async ({ page }) => {
      await pick(page, link);
      await expect.poll(() => visible(page, menu)).toBe(true);
      await page.waitForTimeout(300);
      expect(page.url()).toBe(`${PAGES}/hovermenu.html`);

      await pick(page, item);
      await page.waitForURL(`${PAGES}/frame.html?${item}`);
    });

    test(`${link}: picking the link again while its menu is open follows it`, async ({ page }) => {
      await pick(page, link);
      await expect.poll(() => visible(page, menu)).toBe(true);
      await pick(page, link);
      await page.waitForURL(`${PAGES}/frame.html?${link}`);
    });
  }

  test('a link without a menu is followed at once, even while the page keeps changing', async ({ page }) => {
    await pick(page, 'plain');
    await page.waitForURL(`${PAGES}/frame.html?plain`);
  });

  test('picking something else closes the menu (the pointer leaves it)', async ({ page }) => {
    await pick(page, 'arts');
    await expect.poll(() => visible(page, 'arts-menu')).toBe(true);
    await pick(page, 'other');
    await expect.poll(() => visible(page, 'arts-menu')).toBe(false);
  });
});
