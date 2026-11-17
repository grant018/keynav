// Renders icons/icon.svg to the PNG sizes Chrome uses, plus a grey "off" set shown
// while KeyNav is switched off. Run after editing the SVG: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const SIZES = [16, 32, 48, 128];
const OFF_COLORS = { '#fff785': '#eaeef2', '#ffc542': '#c4ccd4', '#c38a22': '#6e7781', '#302505': '#424a53' };

const svg = await readFile('icons/icon.svg', 'utf8');
const off = Object.entries(OFF_COLORS).reduce((s, [from, to]) => s.replaceAll(from, to), svg);

const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, source] of [['icon', svg], ['off', off]]) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
    await page.screenshot({ path: `icons/${name}-${size}.png`, omitBackground: true });
  }
}
await browser.close();
console.log(`wrote icons/{icon,off}-{${SIZES.join(',')}}.png`);
