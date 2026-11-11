import { writeFile, mkdir } from 'node:fs/promises'
import { test, expect, expectSlow } from '../e2e/fixtures'
import { KUBERNETES_COURSE, completeOnboarding, fillCreateForm, openFirstCourse, tutorComplete } from '../e2e/helpers'

/**
 * QA-03 local performance (Mock provider, TUTOR_MOCK_DELAY_MS=5) — app/DB/UI cost only, NOT AI latency.
 * Real AI latency is measured separately by tests/unit/providers/real.smoke.test.ts.
 */
const OUT = process.env.PERF_OUT ?? 'test-results/perf.json'
const RUNS = 5

function stats(xs: number[]): { min: number; median: number; max: number; samples: number[] } {
  const s = [...xs].sort((a, b) => a - b)
  return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s[s.length - 1] ?? 0, samples: xs }
}

test('local performance', async ({ session }) => {
  const result: Record<string, unknown> = {}

  // First launch (fresh DB, migrations) → survey visible. The fixture already launched; measure from relaunch below.
  let page = session.page
  await expect(page.getByTestId('survey')).toBeVisible()
  await completeOnboarding(page)
  await fillCreateForm(page, KUBERNETES_COURSE)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('classroom-page')).toBeVisible()
  await expectSlow(page.getByTestId('current-lesson-title')).toBeVisible()
  await page.getByTestId('chat-start-lesson').click()
  await expect(page.locator(tutorComplete).first()).toBeVisible()

  // Chat round trip with a 5 ms mock: local pipeline cost (persist user msg, context build, stream, persist).
  const chat: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const before = await page.locator(tutorComplete).count()
    const t0 = Date.now()
    await page.getByTestId('chat-input').fill(`질문 ${i + 1}: Pod가 무엇인가요?`)
    await page.getByTestId('chat-send').click()
    await expect(page.locator(tutorComplete)).toHaveCount(before + 1)
    chat.push(Date.now() - t0)
  }
  result.chatRoundTripMockMs = stats(chat)
  await page.getByTestId('back-button').click()
  await expect(page.getByTestId('dashboard-page')).toBeVisible()

  // Warm restart with existing data → dashboard with course card visible.
  const restart: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now()
    page = await session.restart()
    await expect(page.getByTestId('course-card').first()).toBeVisible()
    restart.push(Date.now() - t0)
  }
  result.restartToDashboardMs = stats(restart)

  // Dashboard → classroom with restored history visible.
  const open: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now()
    await openFirstCourse(page)
    await expect(page.getByTestId('current-lesson-title')).toBeVisible()
    await expect(page.locator(tutorComplete).first()).toBeVisible()
    open.push(Date.now() - t0)
    await page.getByTestId('back-button').click()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  }
  result.classroomOpenMs = stats(open)
  result.messagesInCourse = RUNS + 1

  result.note = 'Mock provider (5 ms delay); excludes AI latency. Machine: ' + process.platform + '/' + process.arch
  await mkdir('test-results', { recursive: true })
  await writeFile(OUT, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
})
