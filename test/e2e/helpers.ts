// Shared e2e helpers.
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, PAGES } from './fixtures';

declare global {
  interface Window {
    __events: string[];
    __log: string[];
  }
}

export interface HintInfo {
  label: string;
  target: string;
  hidden: boolean;
  text: string;
  rect: { left: number; top: number; width: number; height: number };
}

/** Reads the hint overlay (open shadow root in test builds). null when hint mode is off. */
export const readHints = (page: Page) =>
  page.evaluate((): HintInfo[] | null => {
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
  });

/** Presses the hint key (f or Shift+F) and returns the hints shown. */
export async function showHints(page: Page, key = 'f'): Promise<HintInfo[]> {
  await page.keyboard.press(key);
  // Hints appear once every frame has been asked (a background round trip).
  let hints: HintInfo[] | null = null;
  await expect.poll(async () => (hints = await readHints(page)) !== null, { timeout: 3000 }).toBe(true);
  return hints!;
}

/** Shows hints with `key`, then types the label of the hint for element #id. */
export async function pick(page: Page, id: string, key = 'f'): Promise<void> {
  const hints = await showHints(page, key);
  const hint = hints.find((h) => h.target === id);
  expect(hint, `a hint for #${id}`).toBeDefined();
  await page.keyboard.type(hint!.label);
}

/** The page's tab id, published by the test build's content script. */
export async function tabIdOf(page: Page): Promise<number> {
  let id: string | undefined;
  await expect
    .poll(async () => (id = await page.evaluate(() => document.documentElement.dataset.keynavTab)))
    .toMatch(/^\d+$/);
  return Number(id);
}

export const getTabs = (sw: Worker, ids: number[]) =>
  sw.evaluate((ids) => Promise.all(ids.map((id) => chrome.tabs.get(id))), ids);

export const activeTabId = (sw: Worker, windowId: number) =>
  sw.evaluate(async (windowId) => (await chrome.tabs.query({ active: true, windowId }))[0]?.id, windowId);

/**
 * Opens a new window whose only tabs are the given test pages, in order, with the
 * first one active. Returns their pages and tab ids.
 */
export async function openWindow(context: BrowserContext, sw: Worker, paths: string[]) {
  const urls = paths.map((p, i) => `${PAGES}/${p}${p.includes('?') ? '&' : '?'}w=${i}`);
  const before = new Set(context.pages());
  const windowId = await sw.evaluate(async (url) => (await chrome.windows.create({ url }))!.id!, urls);
  let pages: (Page | undefined)[] = [];
  await expect
    .poll(() => {
      const fresh = context.pages().filter((p) => !before.has(p));
      pages = urls.map((u) => fresh.find((p) => p.url() === u));
      return pages.every(Boolean);
    })
    .toBe(true);
  const ids: number[] = [];
  for (const p of pages) ids.push(await tabIdOf(p!));
  await sw.evaluate((id) => chrome.tabs.update(id, { active: true }), ids[0]!);
  return { windowId, pages: pages as Page[], ids };
}

export const takeLog = (page: Page) => page.evaluate(() => window.__log.splice(0));
