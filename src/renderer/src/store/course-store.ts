import { create } from 'zustand'
import type { AppErrorPayload, BackgroundJob, CourseCard } from '@shared/domain'
import { run } from '../lib/result'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface CourseState {
  cards: CourseCard[]
  status: LoadStatus
  error: AppErrorPayload | null
  /** Known background jobs keyed by id (curriculum generation, summaries). */
  jobs: Record<string, BackgroundJob>
  loadCards: () => Promise<void>
  loadJobs: () => Promise<void>
  setJob: (job: BackgroundJob) => void
}

export const useCourseStore = create<CourseState>((set, get) => ({
  cards: [],
  status: 'idle',
  error: null,
  jobs: {},

  async loadCards() {
    if (get().status !== 'ready') set({ status: 'loading' })
    const res = await run(() => window.tutor.courses.list())
    if (res.ok) set({ cards: res.data, status: 'ready', error: null })
    else set({ status: 'error', error: res.error })
  },

  async loadJobs() {
    const res = await run(() => window.tutor.jobs.list(null))
    if (!res.ok) return
    const jobs: Record<string, BackgroundJob> = {}
    for (const job of res.data) jobs[job.id] = job
    set({ jobs })
  },

  setJob(job) {
    set((s) => ({ jobs: { ...s.jobs, [job.id]: job } }))
  }
}))

/** Whether a curriculum job for this course is still queued or running. */
export function hasActiveCurriculumJob(jobs: Record<string, BackgroundJob>, courseId: string): boolean {
  return Object.values(jobs).some(
    (job) =>
      job.courseId === courseId &&
      job.type === 'curriculum_generation' &&
      (job.status === 'queued' || job.status === 'running')
  )
}
