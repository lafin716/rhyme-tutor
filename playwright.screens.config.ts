import { defineConfig } from '@playwright/test'

/** Screenshot capture for UI review (QA-02). Not part of `npm run test:e2e`. */
export default defineConfig({
  testDir: 'tests/screens',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']]
})
