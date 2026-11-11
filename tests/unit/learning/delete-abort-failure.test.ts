import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHarness, courseInput, onboard, waitFor, type Harness } from '../support/harness'
import { enqueueJob } from '../../../src/main/db/repo-learning'

/** REV-01 follow-up: deleteCourse must not leave a course blocked when the job abort fails. */

let h: Harness
let courseId: string

beforeEach(() => {
  h = createHarness()
  onboard(h.db)
  courseId = h.learning.createCourse(courseInput()).course.id
})

afterEach(async () => {
  vi.restoreAllMocks()
  await h.close()
})

function courseCount(id: string): number {
  const row = h.db.prepare('SELECT COUNT(*) AS c FROM courses WHERE id = ?').get(id) as { c: number | bigint }
  return Number(row.c)
}

function jobStatus(id: string): string | undefined {
  const row = h.db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(id) as { status: string } | undefined
  return row?.status
}

function runnerBlocks(id: string): boolean {
  return (h.runner as unknown as { blockedCourses: Set<string> }).blockedCourses.has(id)
}

/** Puts a running job for the course in the runner whose completion promise is rejected by the returned function. */
function fakeRunningJobThatFailsToStop(id: string): (reason: Error) => void {
  let failDone: (reason: Error) => void = () => undefined
  const done = new Promise<void>((_, reject) => {
    failDone = reject
  })
  ;(h.runner as unknown as { current: unknown }).current = { courseId: id, controller: new AbortController(), done }
  return failDone
}

describe('deleteCourse when the job abort fails', () => {
  it('deletes the course and clears the runner block when the running job fails to stop', async () => {
    const failDone = fakeRunningJobThatFailsToStop(courseId)

    const deleting = h.learning.deleteCourse(courseId)
    expect(runnerBlocks(courseId)).toBe(true)
    failDone(new Error('job did not stop'))

    await expect(deleting).resolves.toBeUndefined()
    expect(courseCount(courseId)).toBe(0)
    expect(runnerBlocks(courseId)).toBe(false)
  })

  it('still deletes the course when abortJobs itself rejects (defensive), and the slot stays free', async () => {
    vi.spyOn(h.runner, 'abortCourse').mockRejectedValueOnce(new Error('abort failed'))

    await expect(h.learning.deleteCourse(courseId)).resolves.toBeUndefined()
    expect(courseCount(courseId)).toBe(0)
    expect(runnerBlocks(courseId)).toBe(false)
    expect(h.slot.active).toBe(0)
    expect(h.slot.waiting).toBe(0)
  })

  it('keeps a queued job for the course from running until the delete transaction ends, even when the abort fails', async () => {
    const job = enqueueJob(h.db, {
      type: 'session_summary',
      courseId,
      dedupeKey: `summary:${courseId}`,
      priority: 1,
      maxAttempts: 3,
      payload: {}
    }).row
    const execute = vi.spyOn(h.runner as unknown as { execute: (row: unknown) => Promise<void> }, 'execute')

    // Hold settle() open so deleteCourse stays in the window between the failed abort and the delete transaction.
    let settleStarted = false
    let releaseSettle: () => void = () => undefined
    vi.spyOn(h.orchestrator, 'settle').mockImplementation(() => {
      settleStarted = true
      return new Promise<void>((resolve) => {
        releaseSettle = resolve
      })
    })

    const failDone = fakeRunningJobThatFailsToStop(courseId)
    // Block is set synchronously by deleteCourse. Only then does the worker loop start and poll the queue.
    const deleting = h.learning.deleteCourse(courseId)
    h.runner.start()
    failDone(new Error('job did not stop'))

    await waitFor(() => settleStarted)
    // Several poll cycles (pollMs is 5ms in the harness) while the course is blocked and not yet deleted.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(execute).not.toHaveBeenCalled()
    expect(runnerBlocks(courseId)).toBe(true)
    expect(jobStatus(job.id)).not.toBe('running')
    expect(jobStatus(job.id)).not.toBe('succeeded')

    releaseSettle()
    await expect(deleting).resolves.toBeUndefined()

    expect(execute).not.toHaveBeenCalled()
    expect(courseCount(courseId)).toBe(0)
    expect(runnerBlocks(courseId)).toBe(false)
    // Cancelled by the claim-time block or removed with the course.
    expect(['cancelled', undefined]).toContain(jobStatus(job.id))
  })
})
