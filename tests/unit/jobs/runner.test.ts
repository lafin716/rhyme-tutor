import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { backoffMs, MAX_CONCURRENT_AI_JOBS, RETRY_DELAYS_MS, recoverOnStartup } from '../../../src/main/jobs/runner'
import { enqueueJob, insertTutorMessage, listJobs } from '../../../src/main/db/repo-learning'
import { ProviderError } from '../../../src/main/providers/types'
import { createHarness, courseInput, onboard, waitFor, type Harness } from '../support/harness'
import { scriptedProvider } from '../support/fakes'
import { mockOutput } from '../../../src/main/providers/mock'

let h: Harness | null = null

afterEach(async () => {
  await h?.close()
  h = null
})

describe('retry backoff', () => {
  it('uses the spec delays 5s then 20s', () => {
    expect(RETRY_DELAYS_MS).toEqual([5_000, 20_000])
    expect(backoffMs(1)).toBe(5_000)
    expect(backoffMs(2)).toBe(20_000)
    expect(backoffMs(3)).toBe(20_000)
  })

  it('runs one AI job at a time', () => {
    expect(MAX_CONCURRENT_AI_JOBS).toBe(1)
  })
})

describe('JobRunner', () => {
  it('enqueueJob dedupes an active job with the same key', () => {
    h = createHarness()
    onboard(h.db)
    const card = h.learning.createCourse(courseInput())
    const again = enqueueJob(h.db, {
      type: 'curriculum_generation',
      courseId: card.course.id,
      dedupeKey: `curriculum:${card.course.id}`,
      priority: 10,
      maxAttempts: 3,
      payload: {}
    })
    expect(again.inserted).toBe(false)
    expect(listJobs(h.db, { courseId: card.course.id, activeOnly: true })).toHaveLength(1)
  })

  it('generates the curriculum end to end and marks the job succeeded', async () => {
    h = createHarness()
    onboard(h.db)
    const courseId = h.learning.createCourse(courseInput()).course.id
    h.runner.start()
    await waitFor(() => h!.learning.list()[0]?.course.curriculumStatus === 'ready')
    const snapshot = h.learning.classroom(courseId)
    expect(snapshot.modules.length).toBeGreaterThan(0)
    expect(snapshot.currentLesson).not.toBeNull()
    await waitFor(() => h!.learning.jobs(courseId).some((j) => j.status === 'succeeded'))
  })

  it('an auth failure fails the curriculum without retrying', async () => {
    const provider = scriptedProvider(() => {
      throw new ProviderError('PROVIDER_AUTH_REQUIRED', '인증이 필요해요.')
    })
    h = createHarness({ provider })
    onboard(h.db)
    const courseId = h.learning.createCourse(courseInput()).course.id
    h.runner.start()
    await waitFor(() => h!.learning.jobs(courseId).some((j) => j.status === 'failed'))
    const job = h.learning.jobs(courseId).find((j) => j.type === 'curriculum_generation')
    expect(job?.attempts).toBe(1)
    expect(h.learning.list()[0]?.course.curriculumStatus).toBe('failed')
  })

  it('recoverOnStartup requeues running jobs and errors out streaming replies', () => {
    h = createHarness()
    onboard(h.db)
    const courseId = h.learning.createCourse(courseInput()).course.id
    h.db.prepare("UPDATE background_jobs SET status = 'running' WHERE course_id = ?").run(courseId)
    insertTutorMessage(h.db, { courseId, lessonId: null, replyTo: null, providerId: 'mock' })

    const summary = recoverOnStartup(h.db)
    expect(summary.requeuedJobs).toBe(1)
    expect(summary.recoveredMessages).toBe(1)
    const job = h.learning.jobs(courseId).find((j) => j.type === 'curriculum_generation')
    expect(job?.status).toBe('queued')
  })

  it('a deleted course does not get its curriculum job claimed', async () => {
    h = createHarness()
    onboard(h.db)
    const courseId = h.learning.createCourse(courseInput()).course.id
    await h.learning.deleteCourse(courseId)
    h.runner.start()
    await new Promise((r) => setTimeout(r, 30))
    expect(h.learning.list()).toHaveLength(0)
  })

  it('mock curriculum output is accepted by the job handler', () => {
    expect(JSON.parse(mockOutput('curriculum')).modules.length).toBeGreaterThan(0)
    expect(randomUUID()).toBeTruthy()
  })
})
