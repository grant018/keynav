import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  reporter: 'list',
  // Timing tests run separately (npm run perf), one at a time.
  grepInvert: process.env.PERF ? undefined : /@perf/,
  grep: process.env.PERF ? /@perf/ : undefined,
  webServer: {
    command: 'node test/serve.mjs 8765',
    url: 'http://127.0.0.1:8765/basic.html',
    reuseExistingServer: true,
  },
});
