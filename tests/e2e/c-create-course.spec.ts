import { test, expect, expectSlow } from './fixtures'
import { KUBERNETES_COURSE, attrOf, completeOnboarding, fillCreateForm } from './helpers'

test.describe('C. create course', () => {
  test('double submit creates exactly one course and the title is read-only in settings', async ({ session }) => {
    const { page } = session

    await completeOnboarding(page)
    await fillCreateForm(page, KUBERNETES_COURSE)

    // Double-click the submit button; the course must still be created only once.
    await page.getByTestId('create-submit').dblclick()

    await expect(page.getByTestId('classroom-page')).toBeVisible()
    await expect(page.getByTestId('classroom-title')).toHaveText(KUBERNETES_COURSE.title)

    // Curriculum generation is a background job (mock), so use the slow window.
    await expectSlow(page.locator('[data-testid^="module-"]')).toHaveCount(2)
    await expectSlow(page.locator('[data-testid^="lesson-"][data-status]')).toHaveCount(3)
    await expectSlow(page.getByTestId('curriculum-generating')).toHaveCount(0)

    await page.getByTestId('back-button').click()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('course-card')).toHaveCount(1)
    await expect(page.getByTestId('course-card').first().getByTestId('course-title')).toHaveText(
      KUBERNETES_COURSE.title
    )

    const courseId = await attrOf(page.getByTestId('course-card'), 'data-course-id')

    await page.getByTestId('open-settings').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('course-manager')).toBeVisible()

    const title = page.getByTestId(`manage-title-${courseId}`)
    await expect(title).toContainText(KUBERNETES_COURSE.title)
    await expect(page.getByTestId(`manage-title-lock-${courseId}`)).toBeVisible()
    await expect(title.locator('input, textarea')).toHaveCount(0)

    await expect(page.getByTestId(`manage-goal-${courseId}`)).toBeEditable()
  })
})
