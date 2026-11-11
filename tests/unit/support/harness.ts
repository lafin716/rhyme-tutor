import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CreateCourseInput } from '../../../src/shared/domain'
import { openDatabase } from '../../../src/main/db/connection'
import type { Db } from '../../../src/main/db/util'
import { saveProfile, updateSettings } from '../../../src/main/db/repo-core'
import { AiSlot } from '../../../src/main/ai-slot'
import { CourseDeleteGate } from '../../../src/main/course-gate'
import { createMockProvider } from '../../../src/main/providers/mock'
import type { AIProvider, ProviderLogger, ProviderRegistry } from '../../../src/main/providers/types'
import { LearningService } from '../../../src/main/learning/service'
import { TutorOrchestrator } from '../../../src/main/tutor/orchestrator'
import { JobRunner } from '../../../src/main/jobs/runner'

export const noopLog: ProviderLogger = () => undefined

export function registryOf(provider: AIProvider): ProviderRegistry {
  return { get: () => provider, detectAll: async () => [] }
}

export function mockProvider(): AIProvider {
  return createMockProvider({ log: noopLog, mockDelayMs: 0 })
}

export interface Harness {
  dir: string
  db: Db
  slot: AiSlot
  providers: ProviderRegistry
  events: unknown[]
  orchestrator: TutorOrchestrator
  runner: JobRunner
  learning: LearningService
  close(): Promise<void>
}

export function createHarness(opts: { provider?: AIProvider; select?: boolean } = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'tutor-unit-'))
  const { db } = openDatabase({ filePath: join(dir, 'test.db'), log: noopLog })
  if (opts.select !== false) updateSettings(db, { activeProvider: 'mock' })
  const providers = registryOf(opts.provider ?? mockProvider())
  const slot = new AiSlot()
  const gate = new CourseDeleteGate()
  const events: unknown[] = []
  const orchestrator = new TutorOrchestrator({
    db,
    providers,
    slot,
    emit: (event) => events.push(event),
    log: noopLog,
    gate
  })
  const runner = new JobRunner({ db, providers, slot, emit: () => undefined, log: noopLog, pollMs: 5 })
  const learning = new LearningService({
    db,
    providers,
    slot,
    orchestrator,
    gate,
    abortJobs: (courseId) => runner.abortCourse(courseId)
  })
  return {
    dir,
    db,
    slot,
    providers,
    events,
    orchestrator,
    runner,
    learning,
    async close() {
      await runner.stop()
      await orchestrator.shutdown()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

export function onboard(db: Db): void {
  saveProfile(db, {
    startDifficulty: 'no_difficulty',
    preferredMethod: 'practice',
    managementStyle: 'encouraging',
    dailyTime: '20_30',
    motivation: 'small_steps'
  })
}

export function courseInput(overrides: Partial<CreateCourseInput> = {}): CreateCourseInput {
  return {
    requestId: randomUUID(),
    title: '대수 입문',
    topicPrompt: '일차방정식 풀이',
    goal: '일차방정식을 혼자 풀기',
    level: 'beginner',
    pace: 'normal',
    presetId: 'kind-explainer',
    ...overrides
  }
}

export async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`)
  return value
}
