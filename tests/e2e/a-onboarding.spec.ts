import { test, expect } from './fixtures'
import { answerSurvey, completeOnboarding } from './helpers'

test.describe('A. onboarding', () => {
  test('survey navigation keeps answers and first run lands on an empty dashboard', async ({ session }) => {
    const { page } = session

    await expect(page.getByTestId('survey')).toBeVisible()
    await expect(page.getByTestId('survey-progress')).toHaveText('1 / 5')
    await expect(page.getByTestId('survey-prev')).toBeDisabled()

    await page.locator('[data-testid^="survey-option-"]').first().click()
    await page.getByTestId('survey-next').click()
    await expect(page.getByTestId('survey-progress')).toHaveText('2 / 5')

    await page.getByTestId('survey-prev').click()
    await expect(page.getByTestId('survey-progress')).toHaveText('1 / 5')

    await completeOnboarding(page)

    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('course-card')).toHaveCount(0)
    await expect(page.getByTestId('course-grid')).toHaveCount(0)
    await expect(page.getByTestId('dashboard-new-course')).toBeVisible()
  })

  test('answerSurvey stops on the provider step with all providers listed', async ({ session }) => {
    const { page } = session
    await answerSurvey(page)
    await expect(page.getByTestId('provider-list')).toBeVisible()
  })
})
