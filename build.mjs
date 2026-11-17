// Bundles the extension into dist/.
//   node build.mjs           production build
//   node build.mjs --test    test build (__TEST__ = true: open shadow roots, test hooks)
//   node build.mjs --watch   rebuild on change
import * as esbuild from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

const args = new Set(process.argv.slice(2));
const isTest = args.has('--test');
const watch = args.has('--watch');
const outdir = 'dist';

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  bundle: true,
  target: 'chrome120',
  sourcemap: isTest || watch ? 'inline' : false,
  define: { __TEST__: String(isTest) },
  minifySyntax: !isTest, // drops `if (__TEST__)` blocks from production builds
  logLevel: 'info',
};

const copyStatic = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async () => {
      await copyFile('manifest.json', `${outdir}/manifest.json`);
      await copyFile('src/options/options.html', `${outdir}/options.html`);
    });
  },
};

const configs = [
  // Manifest-declared content scripts can't be ES modules, so bundle to an IIFE.
  { ...common, entryPoints: ['src/content/index.ts'], outfile: `${outdir}/content.js`, format: 'iife' },
  // Page-world helper (manifest "world": "MAIN"); see src/main/index.ts.
  { ...common, entryPoints: ['src/main/index.ts'], outfile: `${outdir}/main.js`, format: 'iife' },
  { ...common, entryPoints: ['src/background/index.ts'], outfile: `${outdir}/background.js`, format: 'esm', plugins: [copyStatic] },
  { ...common, entryPoints: ['src/options/options.ts'], outfile: `${outdir}/options.js`, format: 'iife' },
];

if (watch) {
  for (const c of configs) await (await esbuild.context(c)).watch();
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
}
