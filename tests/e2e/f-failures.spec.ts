import { test, expect, expectSlow } from './fixtures'
import { KUBERNETES_COURSE, attrOf, completeOnboarding, fillCreateForm, openFirstCourse, tutorError } from './helpers'

test.describe('F. failures', () => {
  test('a failed chat reply shows a friendly error and can be retried', async ({ session }) => {
    const { page } = session

    await completeOnboarding(page)
    await fillCreateForm(page, KUBERNETES_COURSE)
    await page.getByTestId('create-submit').click()
    await expect(page.getByTestId('classroom-page')).toBeVisible()

    const failText = '[[mock:fail]] 오류를 확인해 주세요'
    await expect(page.getByTestId('chat-input')).toBeEnabled()
    await page.getByTestId('chat-input').fill(failText)
    await page.getByTestId('chat-send').click()

    await expect(page.locator(tutorError)).toHaveCount(1)
    const errorId = await attrOf(page.locator(tutorError), 'data-message-id')
    const failed = page.getByTestId(`message-failed-${errorId}`)
    await expect(failed).toBeVisible()
    await expect(failed).not.toContainText('PROVIDER_FAILED')
    await expect(page.locator('[data-testid="message-learner"]').filter({ hasText: '[[mock:fail]]' })).toHaveCount(1)

    await page.getByTestId(`message-retry-${errorId}`).click()
    await expect(page.locator('[data-testid="message-learner"]').filter({ hasText: '[[mock:fail]]' })).toHaveCount(1)
    await expect(page.getByTestId('chat-busy')).toHaveCount(0)
    await expect(page.getByTestId('chat-input')).toBeEnabled()
  })

  test('a failed curriculum shows status and retry on dashboard and in classroom', async ({ session }) => {
    const { page } = session

    await completeOnboarding(page)
    await fillCreateForm(page, {
      topic: '[[mock:fail]] 테스트',
      title: '실패 테스트',
      goal: '실패 처리를 확인하고 싶어요'
    })
    await page.getByTestId('create-submit').click()

    // Creating a course opens the classroom; the failed curriculum job surfaces there.
    await expect(page.getByTestId('classroom-page')).toBeVisible()
    await expectSlow(page.getByTestId('curriculum-failed')).toBeVisible()
    await expect(page.getByTestId('curriculum-retry')).toBeVisible()

    await page.getByTestId('back-button').click()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expectSlow(page.getByTestId('course-status-failed').first()).toBeVisible()

    await page.getByTestId('course-retry').first().click()
    await expectSlow(page.getByTestId('course-status-failed').first()).toBeVisible()

    await openFirstCourse(page)
    await expectSlow(page.getByTestId('curriculum-failed')).toBeVisible()
    await page.getByTestId('curriculum-retry').click()
    await expectSlow(page.getByTestId('curriculum-failed')).toBeVisible()
  })
})
