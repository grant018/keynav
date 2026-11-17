// Playwright fixtures that launch Chromium with the unpacked extension from dist/.
// Branded Chrome no longer honours --load-extension, so this uses Chromium:
// $CHROMIUM_PATH, else /usr/bin/chromium, else Playwright's bundled Chromium.
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const extensionPath = resolve('dist');
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export const test = base.extend<{ context: BrowserContext; serviceWorker: Worker }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...(executablePath ? { executablePath } : { channel: 'chromium' }),
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
});

export const expect = test.expect;
export const PAGES = 'http://127.0.0.1:8765';
