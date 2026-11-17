import type { Page, Worker } from '@playwright/test';
import type { Settings } from '../../src/shared/settings';
import { test, expect, PAGES } from './fixtures';
import { readHints, showHints, takeLog } from './helpers';

/** Changes stored settings (as the options page would) and waits until `page` applied them. */
async function setSettings(sw: Worker, page: Page, patch: Partial<Settings>): Promise<void> {
  const version = () => page.evaluate(() => Number(document.documentElement.dataset.keynavSettings ?? 0));
  await expect.poll(version).toBeGreaterThan(0); // initial load done
  const before = await version();
  await sw.evaluate(async (patch) => {
    const current = (await chrome.storage.sync.get('settings')).settings ?? {};
    await chrome.storage.sync.set({ settings: { ...current, ...patch } });
  }, patch);
  await expect.poll(version).toBeGreaterThan(before);
}

const toggle = (sw: Worker) =>
  sw.evaluate(() => (globalThis as unknown as { __keynavTest: { toggle(): Promise<boolean> } }).__keynavTest.toggle());
const badge = (sw: Worker) => sw.evaluate(() => chrome.action.getBadgeText({}));

/** Waits until scrolling stops, then returns window.scrollY. */
const settledY = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = scrollY;
        let still = 0;
        const frame = () => {
          still = scrollY === last ? still + 1 : 0;
          last = scrollY;
          if (still >= 10) resolve(scrollY);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );

const keydowns = async (page: Page) =>
  (await takeLog(page)).filter((l) => l.startsWith('keydown:') && !l.endsWith(':Shift'));

const HOTKEYS_RULE = '127.0.0.1:8765/hotkeys.html';

test.describe('site rules', () => {
  test.beforeEach(async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
  });

  test('a rule with no pass keys turns KeyNav off on that page, and back on when removed', async ({ serviceWorker: sw, page }) => {
    await setSettings(sw, page, { rules: [{ pattern: HOTKEYS_RULE, passKeys: '' }] });
    await page.keyboard.press('j');
    expect(await settledY(page)).toBe(0);
    expect(await keydowns(page)).toEqual(['keydown:j']);

    await setSettings(sw, page, { rules: [] });
    await page.keyboard.press('j');
    expect(await settledY(page)).toBe(60);
    expect(await keydowns(page)).toEqual([]);
  });

  test('a rule for another site changes nothing here', async ({ serviceWorker: sw, page }) => {
    await setSettings(sw, page, { rules: [{ pattern: 'mail.google.com', passKeys: '' }] });
    await page.keyboard.press('j');
    expect(await settledY(page)).toBe(60);
  });

  test('pass keys reach the page (held ones too); other keys still work', async ({ serviceWorker: sw, page }) => {
    await setSettings(sw, page, { rules: [{ pattern: HOTKEYS_RULE, passKeys: 'jx' }] });
    await page.keyboard.down('j');
    await page.keyboard.down('j'); // auto-repeat
    await page.keyboard.up('j');
    expect(await settledY(page)).toBe(0);
    expect(await keydowns(page)).toEqual(['keydown:j', 'keydown:j']);

    await page.keyboard.press('d');
    expect(await settledY(page)).toBeGreaterThan(100);
    expect(await keydowns(page)).toEqual([]);
  });
});

test('the toolbar icons are packaged in the built extension', async ({ serviceWorker: sw }) => {
  const missing = await sw.evaluate(async () => {
    const paths = ['icon', 'off'].flatMap((n) => [16, 32].map((s) => `icons/${n}-${s}.png`))
      .concat([48, 128].map((s) => `icons/icon-${s}.png`));
    const results = await Promise.all(paths.map(async (p) => ((await fetch(chrome.runtime.getURL(p))).ok ? null : p)));
    return results.filter(Boolean);
  });
  expect(missing).toEqual([]);
});

test('the on/off switch turns KeyNav off everywhere and shows OFF on the toolbar button', async ({ serviceWorker: sw, page }) => {
  await page.goto(`${PAGES}/hotkeys.html`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.keynavSettings)).toBeTruthy();
  expect(await badge(sw)).toBe('');

  const before = Number(await page.evaluate(() => document.documentElement.dataset.keynavSettings));
  expect(await toggle(sw)).toBe(false);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.keynavSettings))).toBeGreaterThan(before);
  await expect.poll(() => badge(sw)).toBe('OFF');
  await page.keyboard.press('j');
  expect(await settledY(page)).toBe(0);
  expect(await keydowns(page)).toEqual(['keydown:j']);

  expect(await toggle(sw)).toBe(true);
  await expect.poll(() => badge(sw)).toBe('');
  await expect.poll(async () => {
    await page.keyboard.press('j');
    return settledY(page);
  }).toBeGreaterThan(0);
});

test.describe('preferences', () => {
  test('key mappings apply live: remapped and unmapped keys', async ({ serviceWorker: sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await setSettings(sw, page, { keyMappings: 'map n scrollDown\nunmap j' });
    await page.keyboard.press('n');
    expect(await settledY(page)).toBe(60);
    await page.keyboard.press('j');
    expect(await settledY(page)).toBe(60);
    expect(await keydowns(page)).toEqual(['keydown:j']);
  });

  test('hint characters', async ({ serviceWorker: sw, page }) => {
    await page.goto(`${PAGES}/hints.html`);
    await setSettings(sw, page, { hintChars: 'ab' });
    const hints = await showHints(page);
    expect(hints.length).toBeGreaterThan(20);
    for (const h of hints) expect(h.label).toMatch(/^[ab]+$/);
  });

  test('scroll step, with smooth scrolling off', async ({ serviceWorker: sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await setSettings(sw, page, { scrollStep: 100, smoothScroll: false });
    const samples = page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          const t0 = performance.now();
          const frame = () => {
            out.push(scrollY);
            if (performance.now() - t0 < 300) requestAnimationFrame(frame);
            else resolve(out);
          };
          requestAnimationFrame(frame);
        }),
    );
    await page.keyboard.press('j');
    const ys = await samples;
    expect(ys.filter((y) => y > 0 && y < 100)).toEqual([]); // no glide
    expect(ys.at(-1)).toBe(100);
  });
});

test.describe('pass-through mode (i)', () => {
  const notice = (page: Page) => page.evaluate(() => document.querySelector('keynav-pass')?.shadowRoot?.textContent ?? null);

  test('sends every key to the page until Esc', async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await page.keyboard.press('i');
    expect(await notice(page)).toContain('Keys go to the page');
    for (const k of ['j', 'f', 'x', 'Shift+G']) await page.keyboard.press(k);
    expect(await settledY(page)).toBe(0);
    expect(await readHints(page)).toBeNull();
    expect(await keydowns(page)).toEqual(['keydown:j', 'keydown:f', 'keydown:x', 'keydown:G']);

    await page.keyboard.press('Escape');
    expect(await notice(page)).toBeNull();
    expect(await keydowns(page)).toEqual([]); // the Esc was ours
    await page.keyboard.press('j');
    expect(await settledY(page)).toBe(60);
  });
});

test.describe('help (?)', () => {
  const rows = (page: Page) =>
    page.evaluate(() => {
      const root = document.querySelector('keynav-help')?.shadowRoot;
      if (!root) return null;
      return Object.fromEntries(
        [...root.querySelectorAll<HTMLElement>('[data-command]')].map((r) => [
          r.dataset.command!,
          [...r.querySelectorAll('kbd')].map((k) => k.textContent),
        ]),
      );
    });

  test('lists commands with their keys, reflecting the user’s mappings', async ({ serviceWorker: sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await setSettings(sw, page, { keyMappings: 'map n scrollDown\nunmap x' });
    await page.keyboard.press('Shift+?');
    const help = await rows(page);
    expect(help).not.toBeNull();
    expect(help!.scrollDown).toEqual(['j', 'n']);
    expect(help!.linkHintsNewTab).toEqual(['F']);
    expect(help!.closeTab).toBeUndefined(); // unmapped
    expect(help!.showHelp).toEqual(['?']);
  });

  test('keys while open stay inside it; Esc and ? close it', async ({ serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await page.keyboard.press('Shift+?');
    await page.keyboard.press('j');
    await page.keyboard.press('x');
    expect(await settledY(page)).toBe(0);
    expect(await keydowns(page)).toEqual([]);
    await page.keyboard.press('Escape');
    expect(await rows(page)).toBeNull();

    await page.keyboard.press('Shift+?');
    expect(await rows(page)).not.toBeNull();
    await page.keyboard.press('Shift+?');
    expect(await rows(page)).toBeNull();
    expect(await keydowns(page)).toEqual([]);
  });

  test('its link opens the settings page', async ({ context, serviceWorker: _sw, page }) => {
    await page.goto(`${PAGES}/hotkeys.html`);
    await page.keyboard.press('Shift+?');
    const opened = context.waitForEvent('page');
    await page.locator('keynav-help').getByRole('button', { name: 'Change keys and site rules' }).click();
    expect((await opened).url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\/options\.html$/);
    expect(await rows(page)).toBeNull();
  });
});

test.describe('settings page', () => {
  const stored = (sw: Worker) => sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings as Settings | undefined);

  async function openOptions(page: Page, sw: Worker): Promise<void> {
    await page.goto(new URL('options.html', sw.url()).href);
    await expect(page.locator('body[data-ready]')).toBeAttached();
  }

  test('adding a site rule saves it', async ({ serviceWorker: sw, page }) => {
    await openOptions(page, sw);
    await page.getByRole('button', { name: 'Add rule' }).click();
    await page.getByLabel('Rule 1 pattern').fill('mail.google.com');
    await page.getByLabel(/Rule 1 pass keys/).fill('jkx');
    await expect.poll(async () => (await stored(sw))?.rules).toEqual([{ pattern: 'mail.google.com', passKeys: 'jkx' }]);
    await expect(page.getByRole('status')).toHaveText('Saved');

    await page.getByRole('button', { name: 'Remove rule 1' }).click();
    await expect.poll(async () => (await stored(sw))?.rules).toEqual([]);
  });

  test('bad hint characters are rejected with a message; good ones are saved', async ({ serviceWorker: sw, page }) => {
    await openOptions(page, sw);
    await page.getByLabel(/Hint characters/).fill('aab');
    await expect(page.locator('#hint-chars-error')).toHaveText(/only once/);
    await page.waitForTimeout(500);
    expect((await stored(sw))?.hintChars ?? 'sadfjklewcmpgh').toBe('sadfjklewcmpgh');

    await page.getByLabel(/Hint characters/).fill('asdf');
    await expect(page.locator('#hint-chars-error')).toHaveText('');
    await expect.poll(async () => (await stored(sw))?.hintChars).toBe('asdf');
  });

  test('key mapping mistakes are listed; the text is saved', async ({ serviceWorker: sw, page }) => {
    await openOptions(page, sw);
    await page.locator('#keymap').fill('map q fly\nmap gt nextTab');
    await expect(page.locator('#keymap-errors li')).toHaveText([/Line 1: unknown command "fly"/]);
    await expect.poll(async () => (await stored(sw))?.keyMappings).toBe('map q fly\nmap gt nextTab');
  });

  test('scroll numbers are kept within limits', async ({ serviceWorker: sw, page }) => {
    await openOptions(page, sw);
    await page.getByLabel(/^Step/).fill('5');
    await page.getByLabel(/^Step/).blur();
    await expect(page.getByLabel(/^Step/)).toHaveValue('10');
    await expect.poll(async () => (await stored(sw))?.scrollStep).toBe(10);
  });

  test('the on/off switch follows the toolbar button', async ({ serviceWorker: sw, page }) => {
    await openOptions(page, sw);
    await expect(page.getByLabel('On', { exact: true })).toBeChecked();
    await toggle(sw);
    await expect(page.getByLabel('On', { exact: true })).not.toBeChecked();
  });
});

test('picking still works with custom settings (sanity)', async ({ serviceWorker: sw, page }) => {
  await page.goto(`${PAGES}/hints.html`);
  await setSettings(sw, page, { hintChars: 'jk', keyMappings: 'unmap f\nmap ; linkHints' });
  await showHints(page, ';');
  await page.keyboard.press('Escape');
  const target = (await showHints(page, ';')).find((h) => h.target === 'checkbox')!;
  await page.keyboard.type(target.label);
  await expect(page.locator('#checkbox')).toBeChecked();
});
