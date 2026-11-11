import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect, expectSlow } from '../e2e/fixtures'
import { KUBERNETES_COURSE, answerSurvey, fillCreateForm, openFirstCourse, tutorComplete } from '../e2e/helpers'

/** QA-02 screenshot capture against the built app with the Mock provider. */
const OUT = process.env.SCREENS_DIR ?? 'test-results/screens'
const SIZES = [
  [1024, 700],
  [1280, 820],
  [1600, 1000]
] as const

async function resize(app: ElectronApplication, w: number, h: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [width, height]) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(width, height)
    },
    [w, h] as const
  )
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('settings-page')).toBeVisible()
  await page.getByTestId('settings-tab-app').click()
  await page.getByTestId(`theme-${theme}`).click()
  await page.getByTestId('back-button').click()
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
}

test('capture screens', async ({ session }) => {
  const { app, page } = session
  await resize(app, 1280, 820)

  await expect(page.getByTestId('survey')).toBeVisible()
  await shot(page, 'onboarding-survey-1280')
  await answerSurvey(page)
  await shot(page, 'onboarding-provider-1280')
  await page.getByTestId('provider-continue-mock').click()
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
  await shot(page, 'dashboard-empty-1280')

  await fillCreateForm(page, KUBERNETES_COURSE)
  await shot(page, 'create-confirm-1280')
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('classroom-page')).toBeVisible()
  await expectSlow(page.getByTestId('current-lesson-title')).toBeVisible()
  await page.getByTestId('chat-start-lesson').click()
  await expect(page.locator(tutorComplete).first()).toBeVisible()
  await page.getByTestId('chat-input').fill('Pod와 Deployment의 차이를 코드 예시로 보여 주세요')
  await page.getByTestId('chat-send').click()
  await expect(page.locator(tutorComplete)).toHaveCount(2)
  await page.getByTestId('quiz-generate').click()
  const cards = page.getByTestId('quiz-list').locator('li[data-testid^="quiz-"]')
  await expectSlow(cards).toHaveCount(2)
  const testId = await cards.first().getAttribute('data-testid')
  const quizId = (testId ?? '').slice('quiz-'.length)
  await page.getByTestId(`quiz-choice-${quizId}-0`).click()
  await page.getByTestId(`quiz-submit-${quizId}`).click()
  await page.getByTestId('back-button').click()

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    for (const [w, h] of SIZES) {
      await resize(app, w, h)
      await shot(page, `${theme}-dashboard-${w}`)
      await openFirstCourse(page)
      await shot(page, `${theme}-classroom-${w}`)
      await page.getByTestId('back-button').click()
      await page.getByTestId('open-settings').click()
      await expect(page.getByTestId('settings-page')).toBeVisible()
      await shot(page, `${theme}-settings-${w}`)
      await page.getByTestId('back-button').click()
      await expect(page.getByTestId('dashboard-page')).toBeVisible()
    }
  }
})
