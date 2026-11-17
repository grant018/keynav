import { test, expect, PAGES } from './fixtures';

test('background service worker starts', async ({ serviceWorker }) => {
  expect(serviceWorker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
});

test('content script runs in the top frame and the iframe, and both reach the background', async ({ serviceWorker: _sw, page }) => {
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[keynav]')) logs.push(m.text());
  });

  await page.goto(`${PAGES}/basic.html`);

  await expect
    .poll(() => logs)
    .toEqual(
      expect.arrayContaining([
        `[keynav] loaded (top) ${PAGES}/basic.html`,
        `[keynav] loaded (frame) ${PAGES}/frame.html`,
        '[keynav] pong (top) frameId=0',
        expect.stringMatching(/^\[keynav\] pong \(frame\) frameId=[1-9]\d*$/),
      ]),
    );
  expect(logs.filter((l) => l.includes('failed'))).toEqual([]);
});
