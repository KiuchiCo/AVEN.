import { defineConfig } from 'vitest/config';

// Rendered-component tests (jsdom). The logic tests in tests/ run with node:test and stay as they are.
export default defineConfig({
  test: { environment: 'jsdom', include: ['component-tests/**/*.test.tsx'], setupFiles: ['component-tests/setup.ts'], css: false, restoreMocks: true },
});
