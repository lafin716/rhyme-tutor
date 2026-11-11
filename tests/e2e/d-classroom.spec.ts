import { test, expect, expectSlow } from './fixtures'
import {
  KUBERNETES_COURSE,
  attrOf,
  completeOnboarding,
  fillCreateForm,
  openFirstCourse,
  tutorCancelled,
  tutorComplete
} from './helpers'

test.describe('D. classroom chat', () => {
  test('chat persists across restart, cancel keeps the learner message, and retry completes', async ({ session }) => {
    const { page: firstPage } = session

    await completeOnboarding(firstPage)
    await fillCreateForm(firstPage, KUBERNETES_COURSE)
    await firstPage.getByTestId('create-submit').click()
    await expect(firstPage.getByTestId('classroom-page')).toBeVisible()

    await expect(firstPage.getByTestId('chat-start-lesson')).toBeEnabled()
    await firstPage.getByTestId('chat-start-lesson').click()
    await expect(firstPage.locator(tutorComplete).first()).toContainText('좋은 질문이에요')

    await firstPage.getByTestId('chat-input').fill('쿠버네티스가 뭐예요?')
    await firstPage.getByTestId('chat-send').click()
    await expect(firstPage.locator('[data-testid="message-learner"]').filter({ hasText: '쿠버네티스가 뭐예요?' })).toHaveCount(1)
    await expect(firstPage.locator(tutorComplete)).toHaveCount(2)

    // Restart with the same data dir; the conversation must be restored.
    const page = await session.restart()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await openFirstCourse(page)

    await expect(page.locator('[data-testid="message-learner"]').filter({ hasText: '쿠버네티스가 뭐예요?' })).toHaveCount(1)
    await expect(page.locator(tutorComplete)).toHaveCount(2)
    await expect(page.getByTestId('chat-start-lesson')).toHaveText('이어서 수업하기')
    await expect(page.getByTestId('current-lesson-title')).toBeVisible()

    // Slow mock stream: cancel mid-stream.
    const slowText = '[[mock:slow]] 천천히 설명해 주세요'
    await page.getByTestId('chat-input').fill(slowText)
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-busy')).toBeVisible()
    await page.getByTestId('chat-cancel').click()

    await expect(page.locator(tutorCancelled)).toHaveCount(1)
    const cancelledId = await attrOf(page.locator(tutorCancelled), 'data-message-id')
    await expect(page.getByTestId(`message-failed-${cancelledId}`)).toContainText('응답을 중단했어요.')
    await expect(page.locator('[data-testid="message-learner"]').filter({ hasText: '[[mock:slow]]' })).toHaveCount(1)

    // Retry the cancelled reply; it must complete this time.
    await page.getByTestId(`message-retry-${cancelledId}`).click()
    await expectSlow(page.locator(tutorComplete)).toHaveCount(3)
    await expect(page.locator('[data-testid="message-learner"]').filter({ hasText: '[[mock:slow]]' })).toHaveCount(1)
  })
})
