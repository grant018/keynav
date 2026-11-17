import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, PAGES } from './fixtures';
import { activeTabId, getTabs, openWindow, pick, tabIdOf, takeLog } from './helpers';

/** Waits for one new page and checks no second one follows. */
async function expectOneNewPage(context: BrowserContext, action: () => Promise<void>): Promise<Page> {
  const before = context.pages().length;
  const next = context.waitForEvent('page');
  await action();
  const page = await next;
  await page.waitForLoadState();
  await page.waitForTimeout(300);
  expect(context.pages().length).toBe(before + 1);
  return page;
}

async function expectNoNewPage(context: BrowserContext, page: Page): Promise<void> {
  const before = context.pages().length;
  await page.waitForTimeout(400);
  expect(context.pages().length).toBe(before);
}

test.describe('F: open in a new foreground tab', () => {
  test('opens the link as the active tab right after this one, same window, with opener set', async ({
    context,
    serviceWorker: sw,
  }) => {
    const { windowId, pages: [a, b], ids: [aId, bId] } = await openWindow(context, sw, ['newtab.html', 'empty.html']);

    const opened = await expectOneNewPage(context, () => pick(a!, 'relative', 'Shift+F'));
    expect(opened.url()).toBe(`${PAGES}/frame.html?relative`);
    const openedId = await tabIdOf(opened);

    const [opener, created, after] = await getTabs(sw, [aId!, openedId, bId!]);
    expect(created!.active).toBe(true);
    expect(await activeTabId(sw, windowId)).toBe(openedId);
    expect(created!.windowId).toBe(windowId);
    expect(created!.index).toBe(opener!.index + 1);
    expect(after!.index).toBe(opener!.index + 2); // inserted before the next tab, not at the end
    expect(created!.openerTabId).toBe(aId);
    expect(a!.url()).toContain('newtab.html'); // the original tab didn't navigate
    expect(b).toBeDefined();
    expect((await takeLog(a!)).filter((l) => !l.endsWith(':Shift'))).toEqual([]);
  });

  test('a target=_blank link opens exactly one tab', async ({ context, serviceWorker: sw }) => {
    const { pages: [a] } = await openWindow(context, sw, ['newtab.html']);
    const opened = await expectOneNewPage(context, () => pick(a!, 'blank', 'Shift+F'));
    expect(opened.url()).toBe(`${PAGES}/frame.html?blank`);
  });

  test('a clickable span inside a link opens the link', async ({ context, serviceWorker: sw }) => {
    const { pages: [a] } = await openWindow(context, sw, ['newtab.html']);
    const opened = await expectOneNewPage(context, () => pick(a!, 'inner', 'Shift+F'));
    expect(opened.url()).toBe(`${PAGES}/frame.html?wrapper`);
  });

  test('a javascript: link is clicked in place instead', async ({ context, serviceWorker: sw }) => {
    const { pages: [a] } = await openWindow(context, sw, ['newtab.html']);
    await pick(a!, 'js', 'Shift+F');
    await expect.poll(() => a!.evaluate(() => window.__events)).toEqual(['js']);
    await expectNoNewPage(context, a!);
  });

  test('an element without a link is clicked in place instead', async ({ context, serviceWorker: sw }) => {
    const { pages: [a] } = await openWindow(context, sw, ['newtab.html']);
    await pick(a!, 'div-handler', 'Shift+F');
    await expect.poll(() => a!.evaluate(() => window.__events)).toEqual(['div']);
    await expectNoNewPage(context, a!);
  });

  test('the new tab joins the opener’s tab group', async ({ context, serviceWorker: sw }) => {
    const { pages: [a], ids: [aId] } = await openWindow(context, sw, ['newtab.html', 'empty.html']);
    const groupId = await sw.evaluate((id) => chrome.tabs.group({ tabIds: id }), aId!);
    const opened = await expectOneNewPage(context, () => pick(a!, 'relative', 'Shift+F'));
    const [created] = await getTabs(sw, [await tabIdOf(opened)]);
    expect(created!.groupId).toBe(groupId);
  });

  // Not automated: "still works after Chrome stops the service worker". Stopping it
  // (CDP Target.closeTarget or chrome://serviceworker-internals) closes Playwright's
  // whole browser context. Check by hand: chrome://serviceworker-internals → Stop
  // on KeyNav → press F on a page. The worker keeps no state, so it should just wake.
});

test.describe('tab commands', () => {
  test('x closes the current tab', async ({ context, serviceWorker: sw }) => {
    const { pages: [a, b] } = await openWindow(context, sw, ['hotkeys.html', 'hotkeys.html']);
    await Promise.all([b!.waitForEvent('close'), b!.keyboard.down('x')]);
    expect(a!.isClosed()).toBe(false);
  });

  test('holding x closes only one tab; repeats landing in the next tab are ignored', async ({
    context,
    serviceWorker: sw,
  }) => {
    const { pages: [a, b] } = await openWindow(context, sw, ['hotkeys.html', 'hotkeys.html']);
    await Promise.all([b!.waitForEvent('close'), b!.keyboard.down('x')]);

    // The OS keeps auto-repeating x, now into tab a.
    const cdp = await context.newCDPSession(a!);
    for (let i = 0; i < 3; i++) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'x', code: 'KeyX', text: 'x', windowsVirtualKeyCode: 88, autoRepeat: true,
      });
    }
    await a!.waitForTimeout(400);
    expect(a!.isClosed()).toBe(false);
    expect(await takeLog(a!)).toEqual([]); // and the page didn't see them either
  });

  test('J and K switch to the tab on the left and right, wrapping around', async ({ context, serviceWorker: sw }) => {
    const { windowId, pages: [a, b, c], ids: [aId, bId, cId] } = await openWindow(context, sw,
      ['hotkeys.html', 'hotkeys.html', 'hotkeys.html']);
    const active = () => activeTabId(sw, windowId);

    await a!.keyboard.press('Shift+K');
    await expect.poll(active).toBe(bId);
    await b!.keyboard.press('Shift+K');
    await expect.poll(active).toBe(cId);
    await c!.keyboard.press('Shift+K');
    await expect.poll(active).toBe(aId); // wraps
    await a!.keyboard.press('Shift+J');
    await expect.poll(active).toBe(cId); // wraps back
    await c!.keyboard.press('Shift+J');
    await expect.poll(active).toBe(bId);
  });

  test('X reopens the most recently closed tab', async ({ context, serviceWorker: sw }) => {
    const { windowId, pages: [a, b] } = await openWindow(context, sw, ['hotkeys.html', 'empty.html']);
    const closedUrl = b!.url();
    await Promise.all([b!.waitForEvent('close'), b!.keyboard.down('x')]);

    const restored = await expectOneNewPage(context, () => a!.keyboard.press('Shift+X'));
    await restored.waitForURL(closedUrl);
    const [tab] = await getTabs(sw, [await tabIdOf(restored)]);
    expect(tab!.windowId).toBe(windowId);
  });
});

test('f on a javascript: link runs it (clicked from the page world)', async ({ serviceWorker: _sw, page }) => {
  await page.goto(`${PAGES}/newtab.html`);
  await pick(page, 'js');
  await expect.poll(() => page.evaluate(() => window.__events)).toEqual(['js']);
});
