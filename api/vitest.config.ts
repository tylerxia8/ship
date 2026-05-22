import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Run test files sequentially to prevent database conflicts
    // Tests within each file can still run in parallel
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // text → stdout summary, html → coverage/index.html browseable report,
      // json-summary → coverage/coverage-summary.json (machine-readable, what
      // we commit under shipshape/improvements/raw/coverage-summary.json).
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'node_modules',
        'dist',
        'src/test/**',
        // Build/migration scripts have their own integration coverage path:
        'src/db/migrate.ts',
        'src/db/seed.ts',
        'src/scripts/**',
        // Generated/declarative files:
        '**/*.d.ts',
        '**/*.config.{ts,js}',
      ],
      // Thresholds floor below current measured baseline so CI catches
      // regression. Baseline as measured 2026-05-22 was statements 40.49%,
      // branches 33.69%, functions 41.1%, lines 40.64% — committed under
      // shipshape/improvements/raw/coverage-summary.json. Floors set ~5pt
      // below baseline so a transient env-difference variance doesn't fail
      // CI; bumping these requires adding tests, which is the point.
      //
      // Ship has a lot of route handlers that are E2E-tested (Playwright)
      // but not unit-tested at the api layer — that's why globals trail
      // 50%. The honest answer is "we measure it, we have a floor, we'll
      // raise the floor as more unit coverage lands."
      thresholds: {
        statements: 35,
        branches: 30,
        functions: 35,
        lines: 35,
      },
    },
  },
})
