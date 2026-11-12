/**
 * IPC handler table (BE-05). One entry per channel in src/shared/ipc.ts. Every entry validates its arguments
 * with Zod (or the domain schemas) and delegates to a service. Errors are turned into Result envelopes by
 * `runSafely`, so nothing throws across the bridge.
 */
import { z } from 'zod'
import {
  AnswerQuizInputSchema,
  AppSettingsPatchSchema,
  FlagQuizInputSchema,
  OnboardingAnswersSchema,
  ProviderIdSchema,
  SendMessageInputSchema,
  type AppSettings,
  type ProviderId,
  type Result
} from '@shared/domain'
import { IPC, type CourseEvent, type WindowStateEvent } from '@shared/ipc'
import type { Db } from '../db/util'
import { RepoError } from '../db/util'
import { getProfile, getSettings, updateSettings, saveProfile } from '../db/repo-core'
import type { LearningService } from '../learning/service'
import type { TutorOrchestrator } from '../tutor/orchestrator'
import { toErrorPayload } from '../tutor/orchestrator'
import type { AiSlot } from '../ai-slot'
import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type ProviderLogger,
  type ProviderRegistry
} from '../providers/types'
import { writeExport } from './export'

export const PROVIDER_TEST_TIMEOUT_MS = 30_000
export const CHAT_HISTORY_MAX_LIMIT = 100

export type IpcChannelName = (typeof IPC)[keyof typeof IPC]
export type HandlerFn = (...args: unknown[]) => unknown

/** Main-window operations for the frameless title bar. Kept abstract so tests need no BrowserWindow. */
export interface WindowControls {
  minimize(): void
  /** Returns the new maximized state. */
  toggleMaximize(): boolean
  close(): void
  state(): WindowStateEvent
}

export interface IpcDeps {
  db: Db
  learning: LearningService
  orchestrator: TutorOrchestrator
  providers: ProviderRegistry
  slot: AiSlot
  appVersion: string
  dataDir: string
  /** Korean startup notices (recovery summary). */
  notices: string[]
  /** Wakes the JobRunner after new work was enqueued. */
  kickJobs: () => void
  /** Pushes course-level changes to the renderer. */
  emitCourse: (event: CourseEvent) => void
  /** Opens the app data directory in the OS file manager. */
  openDataDir: () => Promise<void>
  /** Shows the native save dialog. Resolves null when cancelled. */
  chooseExportPath: (defaultName: string) => Promise<string | null>
  /** Frameless title bar controls (main window). */
  window: WindowControls
  now: () => string
  log: ProviderLogger
}

const IdSchema = z.string().min(1).max(64)
const NullableIdSchema = IdSchema.nullable()
const LimitSchema = z.number().int().min(1).max(CHAT_HISTORY_MAX_LIMIT)

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new RepoError('VALIDATION', '요청 값을 확인해 주세요.')
  return result.data
}

/** Model alias for the active provider (null = CLI default, or mock). */
function modelFor(settings: AppSettings, providerId: ProviderId): string | null {
  if (providerId === 'claude-code') return settings.claudeModel
  if (providerId === 'codex') return settings.codexModel
  return null
}

/** Runs one provider round-trip with a tiny prompt. Shares the AI slot, so it fails with BUSY while another call runs. */
async function pingProvider(deps: IpcDeps, providerId: ProviderId): Promise<{ ok: true; latencyMs: number; sample: string }> {
  const { db, providers, slot } = deps
  const provider: AIProvider = providers.get(providerId)
  if (slot.active > 0 || slot.waiting > 0) throw new RepoError('BUSY', '다른 AI 작업이 끝난 뒤 다시 시도해 주세요.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS)
  const release = await slot.acquire(controller.signal)
  const started = Date.now()
  try {
    const request: CompletionRequest = {
      task: 'ping',
      system: 'You are a connectivity check. Reply with the single word OK.',
      prompt: 'ping',
      model: modelFor(getSettings(db), providerId),
      timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
      signal: controller.signal
    }
    const result = await provider.complete(request)
    return { ok: true, latencyMs: Date.now() - started, sample: result.text.trim().slice(0, 80) }
  } finally {
    clearTimeout(timer)
    release()
  }
}

export function createHandlers(deps: IpcDeps): Record<IpcChannelName, HandlerFn> {
  const { db, learning, orchestrator } = deps

  return {
    [IPC.appBootstrap]: () => {
      const profile = getProfile(db)
      return {
        version: deps.appVersion,
        onboardingCompleted: profile !== null,
        profile,
        settings: getSettings(db),
        dataDir: deps.dataDir,
        notices: deps.notices
      }
    },
    [IPC.appOpenDataDir]: async () => {
      await deps.openDataDir()
      return null
    },
    [IPC.appExportData]: async () => {
      const now = deps.now()
      const target = await deps.chooseExportPath(`tutor-export-${now.slice(0, 10)}.json`)
      if (!target) return null
      return writeExport(db, target, now)
    },

    [IPC.profileGet]: () => getProfile(db),
    [IPC.profileSave]: (answers: unknown) => saveProfile(db, parse(OnboardingAnswersSchema, answers)),

    [IPC.settingsGet]: () => getSettings(db),
    [IPC.settingsUpdate]: (patch: unknown) => updateSettings(db, parse(AppSettingsPatchSchema, patch)),

    [IPC.providersDetect]: () => deps.providers.detectAll(),
    [IPC.providersSelect]: (id: unknown) => {
      const providerId = parse(ProviderIdSchema, id)
      return updateSettings(db, { activeProvider: providerId })
    },
    [IPC.providersTest]: (id: unknown) => pingProvider(deps, parse(ProviderIdSchema, id)),

    [IPC.coursesList]: () => learning.list(),
    [IPC.coursesCreate]: (input: unknown) => {
      const card = learning.createCourse(input)
      deps.kickJobs()
      return card
    },
    [IPC.coursesUpdate]: (courseId: unknown, patch: unknown) =>
      learning.updateCourse(parse(IdSchema, courseId), patch),
    [IPC.coursesDelete]: async (courseId: unknown) => {
      const id = parse(IdSchema, courseId)
      await learning.deleteCourse(id)
      deps.emitCourse({ type: 'course-deleted', courseId: id })
      return null
    },
    [IPC.coursesRetryCurriculum]: (courseId: unknown) => {
      const job = learning.retryCurriculum(parse(IdSchema, courseId))
      deps.kickJobs()
      return job
    },

    [IPC.classroomGet]: (courseId: unknown) => learning.classroom(parse(IdSchema, courseId)),
    [IPC.lessonsSelect]: (courseId: unknown, lessonId: unknown) =>
      learning.selectLesson(parse(IdSchema, courseId), parse(IdSchema, lessonId)),
    [IPC.lessonsComplete]: (courseId: unknown, lessonId: unknown) => {
      const snapshot = learning.completeLesson(parse(IdSchema, courseId), parse(IdSchema, lessonId))
      deps.kickJobs()
      return snapshot
    },
    [IPC.objectivesSelfCheck]: (objectiveId: unknown, understood: unknown) =>
      learning.selfCheck(parse(IdSchema, objectiveId), parse(z.boolean(), understood)),

    [IPC.chatHistory]: (courseId: unknown, beforeMessageId: unknown, limit: unknown) =>
      learning.history(parse(IdSchema, courseId), parse(NullableIdSchema, beforeMessageId), parse(LimitSchema, limit)),
    [IPC.chatSend]: (input: unknown) => orchestrator.send(parse(SendMessageInputSchema, input)),
    [IPC.chatStartLesson]: (courseId: unknown) => orchestrator.startLesson(parse(IdSchema, courseId)),
    [IPC.chatCancel]: (courseId: unknown) => {
      orchestrator.cancel(parse(IdSchema, courseId))
      return null
    },
    [IPC.chatRetry]: (tutorMessageId: unknown) => orchestrator.retry(parse(IdSchema, tutorMessageId)),

    [IPC.quizGenerate]: (courseId: unknown, lessonId: unknown) =>
      learning.generateQuiz(parse(IdSchema, courseId), parse(IdSchema, lessonId)),
    [IPC.quizAnswer]: (input: unknown) => learning.answerQuiz(parse(AnswerQuizInputSchema, input)),
    [IPC.quizFlag]: (input: unknown) => learning.flagQuiz(parse(FlagQuizInputSchema, input)),

    [IPC.jobsList]: (courseId: unknown) => learning.jobs(parse(NullableIdSchema, courseId)),

    [IPC.windowMinimize]: () => {
      deps.window.minimize()
      return null
    },
    [IPC.windowToggleMaximize]: () => deps.window.toggleMaximize(),
    [IPC.windowClose]: () => {
      deps.window.close()
      return null
    },
    [IPC.windowState]: () => deps.window.state()
  }
}

/** Converts any outcome into the Result envelope. Unexpected (non-app) errors are logged without details. */
export async function runSafely<T>(channel: string, log: ProviderLogger, fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (!(err instanceof RepoError) && !isProviderError(err)) {
      log('error', 'ipc handler failed', { channel, reason: err instanceof Error ? err.name : 'unknown' })
    }
    return { ok: false, error: toErrorPayload(err) }
  }
}

function isProviderError(err: unknown): boolean {
  return err instanceof ProviderError
}
