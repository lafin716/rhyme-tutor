import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'

export const KUBERNETES_COURSE = {
  topic: 'Kubernetes',
  title: 'Kubernetes',
  goal: '클러스터의 기본 구성을 이해하고 싶어요'
} as const

/** Answers the 5 survey questions (step 1 to 5) and stops on the provider step. */
export async function answerSurvey(page: Page): Promise<void> {
  await expect(page.getByTestId('survey')).toBeVisible()
  for (let step = 1; step <= 5; step++) {
    await expect(page.getByTestId('survey-progress')).toHaveText(`${step} / 5`)
    await page.locator('[data-testid^="survey-option-"]').first().click()
    await page.getByTestId(step < 5 ? 'survey-next' : 'survey-save').click()
  }
  await expect(page.getByTestId('provider-list')).toBeVisible()
}

/** Full first-run path: survey, mock provider, lands on the dashboard. */
export async function completeOnboarding(page: Page): Promise<void> {
  await answerSurvey(page)
  await page.getByTestId('provider-continue-mock').click()
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
}

/** Fills the 4-step create form up to the confirm step. Does not submit. */
export async function fillCreateForm(
  page: Page,
  input: { topic: string; title: string; goal: string }
): Promise<void> {
  await page.getByTestId('dashboard-new-course').click()
  await expect(page.getByTestId('create-course-page')).toBeVisible()
  await page.getByTestId('create-topic').fill(input.topic)
  await page.getByTestId('create-title').fill(input.title)
  await page.getByTestId('create-next').click()
  await expect(page.getByTestId('create-step-goal')).toBeVisible()
  await page.getByTestId('create-goal').fill(input.goal)
  await page.getByTestId('create-next').click()
  await expect(page.getByTestId('create-step-tutor')).toBeVisible()
  await page.getByTestId('create-next').click()
  await expect(page.getByTestId('create-step-confirm')).toBeVisible()
  await expect(page.getByTestId('confirm-title')).toHaveText(input.title)
}

/** Opens the first course card on the dashboard and waits for the classroom. */
export async function openFirstCourse(page: Page): Promise<void> {
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
  await page.getByTestId('course-card').first().getByTestId('course-open').click()
  await expect(page.getByTestId('classroom-page')).toBeVisible()
}

/** Reads a data-* attribute from a locator, waiting for it to be attached first. */
export async function attrOf(locator: Locator, attribute: string): Promise<string> {
  await expect(locator.first()).toBeAttached()
  const value = await locator.first().getAttribute(attribute)
  if (!value) throw new Error(`expected attribute ${attribute} on ${String(locator)}`)
  return value
}

/** Quiz card testid is `quiz-{quizId}`; returns the quiz id. */
export async function quizIdOf(card: Locator): Promise<string> {
  const testId = await attrOf(card, 'data-testid')
  return testId.slice('quiz-'.length)
}

/** Tutor messages in a final state (complete, error, or cancelled). */
export const tutorComplete = '[data-testid="message-tutor"][data-status="complete"]'
export const tutorError = '[data-testid="message-tutor"][data-status="error"]'
export const tutorCancelled = '[data-testid="message-tutor"][data-status="cancelled"]'
