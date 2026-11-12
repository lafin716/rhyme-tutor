import { test, expect } from './fixtures'
import { completeOnboarding } from './helpers'
const OUT = process.env.SCREENS_DIR ?? 'test-results/titlebar'
/** Frameless window: in-app title bar controls drive the real BrowserWindow (Windows/Linux only). */
test.skip(process.platform === 'darwin', 'macOS uses native traffic lights')

test('in-app title bar minimizes, maximizes/restores and closes the window', async ({ session }) => {
  const { app, page } = session
  const win = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]!; return { max: w.isMaximized(), min: w.isMinimized(), visible: w.isVisible() } })
  await expect(page.getByTestId('title-bar')).toBeVisible()
  await page.screenshot({ path: OUT + '/1-survey.png' })
  await completeOnboarding(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + '/2-dashboard.png' })
  await page.getByTestId('window-maximize').click()
  await expect.poll(async () => (await win()).max).toBe(true)
  await expect(page.getByTestId('window-maximize')).toHaveAttribute('aria-label', '이전 크기로 복원')
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + '/3-maximized.png' })
  await page.getByTestId('window-maximize').click()
  await expect.poll(async () => (await win()).max).toBe(false)
  await expect(page.getByTestId('window-maximize')).toHaveAttribute('aria-label', '최대화')
  await page.getByTestId('window-close').hover()
  await page.waitForTimeout(200)
  await page.screenshot({ path: OUT + '/4-close-hover.png' })
  await page.getByTestId('open-settings').click()
  await page.getByTestId('settings-tab-app').click()
  await page.getByTestId('theme-dark').click()
  await page.getByTestId('back-button').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT + '/5-dark.png' })
  await page.getByTestId('window-minimize').click()
  await expect.poll(async () => (await win()).min).toBe(true)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore())
  const closed = app.waitForEvent('close')
  await page.getByTestId('window-close').click()
  await closed
})
