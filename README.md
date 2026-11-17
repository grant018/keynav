# KeyNav

Navigate the web with the keyboard. Chrome extension, Manifest V3.

## Use

Press `?` on any page for the keys. Defaults: `j`/`k` scroll (hold to keep going), `d`/`u` half
page, `gg`/`G` top/bottom, `f` click a link or control, `F` open a link in a new tab and switch to it,
`x`/`X` close/reopen a tab, `J`/`K` tab left/right, `H`/`L` back/forward, `i` send keys to the page until `Esc`.

Settings (right-click the toolbar button → Options): site rules, key mappings, hint characters,
scrolling. Clicking the toolbar button, or `Alt+Shift+K`, turns KeyNav on/off everywhere.

## Develop

```sh
npm install
npm run watch        # rebuilds dist/ on change
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → pick `dist/`.
After a rebuild, click the reload icon on the extension card and refresh the page.

## Test

```sh
npm run typecheck
npm test             # unit tests (Vitest), test/unit
npm run e2e          # test build + Playwright in headless Chromium, test/e2e
npm run perf         # hint-collection timing tests (@perf), run alone, one at a time
npm run serve        # serve test/pages on http://127.0.0.1:8765 for manual checks
```

The icon's source is `icons/icon.svg`; after editing it, `npm run icons` re-renders the PNGs
(normal and grey "off" sets) with headless Chromium.

E2E uses `$CHROMIUM_PATH`, else `/usr/bin/chromium`, else Playwright's bundled Chromium
(`npx playwright install chromium`). Branded Chrome no longer accepts `--load-extension`.

`npm run e2e` leaves a test build in `dist/`; run `npm run build` before loading it by hand.

## License

MIT. See [LICENSE](LICENSE).
