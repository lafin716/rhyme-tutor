import { test, expect, expectSlow } from './fixtures'
import { KUBERNETES_COURSE, completeOnboarding, fillCreateForm, quizIdOf } from './helpers'

test.describe('E. quiz', () => {
  test('answer, see the explanation, then flag the question', async ({ session }) => {
    const { page } = session

    await completeOnboarding(page)
    await fillCreateForm(page, KUBERNETES_COURSE)
    await page.getByTestId('create-submit').click()
    await expect(page.getByTestId('classroom-page')).toBeVisible()

    await expect(page.getByTestId('quiz-panel')).toBeVisible()
    await expect(page.getByTestId('quiz-generate')).toBeEnabled()
    await page.getByTestId('quiz-generate').click()

    const cards = page.getByTestId('quiz-list').locator('li[data-testid^="quiz-"]')
    await expectSlow(cards).toHaveCount(2)

    const card = cards.first()
    const quizId = await quizIdOf(card)

    // The fixture's first question is multiple choice with answerIndex 1 (second option).
    await page.getByTestId(`quiz-choice-${quizId}-1`).click()
    await page.getByTestId(`quiz-submit-${quizId}`).click()

    const result = page.getByTestId(`quiz-result-${quizId}`)
    await expect(result).toContainText('정답이에요!')
    await expect(result).toContainText('두 번째 보기가 정답이에요.')
    await expect(page.getByTestId('quiz-score')).toHaveText('정답 1 / 1')

    await page.getByTestId(`quiz-flag-open-${quizId}`).click()
    await page.getByTestId(`quiz-flag-reason-${quizId}`).fill('설명이 헷갈려요')
    await page.getByTestId(`quiz-flag-submit-${quizId}`).click()
    await expect(page.getByTestId(`quiz-flagged-${quizId}`)).toBeVisible()
  })
})
