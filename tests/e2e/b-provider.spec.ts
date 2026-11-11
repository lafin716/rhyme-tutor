import { test, expect } from './fixtures'
import { answerSurvey } from './helpers'

test.describe('B. provider selection', () => {
  test('mock provider can be selected and tested during onboarding and in settings', async ({ session }) => {
    const { page } = session

    await answerSurvey(page)

    await expect(page.getByTestId('provider-row-claude-code')).toBeVisible()
    await expect(page.getByTestId('provider-row-codex')).toBeVisible()
    await expect(page.getByTestId('provider-row-mock')).toBeVisible()

    // Test the connection first; in onboarding, selecting a provider finishes setup and opens the dashboard.
    await page.getByTestId('provider-test-mock').click()
    await expect(page.getByTestId('provider-test-result-mock')).toBeVisible()

    await page.getByTestId('provider-select-mock').click()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    await page.getByTestId('open-settings').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await page.getByTestId('settings-tab-provider').click()
    await expect(page.getByTestId('provider-active-mock')).toBeVisible()
  })
})
