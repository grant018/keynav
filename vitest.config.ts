import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'], passWithNoTests: true },
  define: { __TEST__: 'true' },
});
