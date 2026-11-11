import { defineConfig } from '@playwright/test'

/** QA-03 local performance measurement (Mock provider). Not part of `npm run test:e2e`. */
export default defineConfig({
  testDir: 'tests/perf',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']]
})
