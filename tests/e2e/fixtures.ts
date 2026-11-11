import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect as baseExpect, test as base } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Built main-process entry. `npm run test:e2e` runs `npm run build` first.
 * Playwright runs from the repo root, so process.cwd() is the project root.
 */
export const MAIN_ENTRY = resolve(process.cwd(), 'out/main/index.js')

/** Default polling window for UI assertions (Electron cold start, IPC round trips). */
export const expect = baseExpect.configure({ timeout: 15_000 })
/** Longer window for background jobs (curriculum generation) and slow mock streams. */
export const expectSlow = baseExpect.configure({ timeout: 45_000 })

/** Launches the built app against an explicit data dir with the deterministic mock provider. */
export function launchApp(dataDir: string): Promise<ElectronApplication> {
  const inherited: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) inherited[key] = value
  }
  return electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...inherited,
      TUTOR_USER_DATA_DIR: dataDir,
      TUTOR_ENABLE_MOCK: '1',
      TUTOR_MOCK_DELAY_MS: '5'
    }
  })
}

export interface Session {
  readonly app: ElectronApplication
  readonly page: Page
  readonly dataDir: string
  /**
   * Closes the running app (single-instance lock must be released first) and relaunches
   * with the same TUTOR_USER_DATA_DIR. Returns the new first window.
   */
  restart(): Promise<Page>
}

export const test = base.extend<{ session: Session }>({
  // Playwright requires an object destructuring pattern for fixture deps.
  // eslint-disable-next-line no-empty-pattern
  session: async ({}, use) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'tutor-e2e-'))
    let app = await launchApp(dataDir)
    let page = await app.firstWindow()
    const session: Session = {
      get app() {
        return app
      },
      get page() {
        return page
      },
      dataDir,
      async restart() {
        await app.close()
        app = await launchApp(dataDir)
        page = await app.firstWindow()
        return page
      }
    }
    try {
      await use(session)
    } finally {
      await app.close().catch(() => undefined)
      await rm(dataDir, { recursive: true, force: true })
    }
  }
})
