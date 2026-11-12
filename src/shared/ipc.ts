/**
 * IPC contract (leader-owned). The preload exposes exactly `TutorApi` as `window.tutor`.
 * Every invoke channel returns `Result<T>`; main never throws across the bridge.
 * Inputs are validated with Zod in main (preload does a cheap shape check only).
 */
import type {
  AnswerQuizInput,
  AppBootstrap,
  AppSettings,
  AppSettingsPatch,
  BackgroundJob,
  ChatMessage,
  ChatStreamEvent,
  ClassroomSnapshot,
  Course,
  CourseCard,
  CreateCourseInput,
  ExportResult,
  FlagQuizInput,
  LearnerProfile,
  OnboardingAnswers,
  ProviderId,
  ProviderInfo,
  QuizAttemptResult,
  QuizQuestion,
  Result,
  SendMessageInput,
  UpdateCourseInput
} from './domain'

/** Invoke channel names. Keep in sync with TutorApi. */
export const IPC = {
  appBootstrap: 'app:bootstrap',
  appOpenDataDir: 'app:openDataDir',
  appExportData: 'app:exportData',

  profileGet: 'profile:get',
  profileSave: 'profile:save',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  providersDetect: 'providers:detect',
  providersSelect: 'providers:select',
  providersTest: 'providers:test',

  coursesList: 'courses:list',
  coursesCreate: 'courses:create',
  coursesUpdate: 'courses:update',
  coursesDelete: 'courses:delete',
  coursesRetryCurriculum: 'courses:retryCurriculum',

  classroomGet: 'classroom:get',
  lessonsSelect: 'lessons:select',
  lessonsComplete: 'lessons:complete',
  objectivesSelfCheck: 'objectives:selfCheck',

  chatHistory: 'chat:history',
  chatSend: 'chat:send',
  chatStartLesson: 'chat:startLesson',
  chatCancel: 'chat:cancel',
  chatRetry: 'chat:retry',

  quizGenerate: 'quiz:generate',
  quizAnswer: 'quiz:answer',
  quizFlag: 'quiz:flag',

  jobsList: 'jobs:list',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggleMaximize',
  windowClose: 'window:close',
  windowState: 'window:getState'
} as const

/** Main -> renderer push channels. */
export const EVENTS = {
  chat: 'chat:event',
  jobs: 'jobs:event',
  courses: 'courses:event',
  windowState: 'window:state'
} as const

export type JobEvent = { type: 'job'; job: BackgroundJob }
/** Emitted when course/curriculum data changed in background (e.g. curriculum generated). */
export type CourseEvent = { type: 'course-updated'; courseId: string } | { type: 'course-deleted'; courseId: string }

/** Main-window state for the frameless in-app title bar. Pushed on maximize/restore and full-screen changes. */
export type WindowStateEvent = { maximized: boolean; fullScreen: boolean }

export type Unsubscribe = () => void

export interface TutorApi {
  app: {
    bootstrap(): Promise<Result<AppBootstrap>>
    /** Opens the app data directory in the OS file manager (main-side, fixed path). */
    openDataDir(): Promise<Result<null>>
    /** Shows a native save dialog in main and writes a JSON export. Resolves null data if user cancelled. */
    exportData(): Promise<Result<ExportResult | null>>
  }
  profile: {
    get(): Promise<Result<LearnerProfile | null>>
    save(answers: OnboardingAnswers): Promise<Result<LearnerProfile>>
  }
  settings: {
    get(): Promise<Result<AppSettings>>
    update(patch: AppSettingsPatch): Promise<Result<AppSettings>>
  }
  providers: {
    detect(): Promise<Result<ProviderInfo[]>>
    /** Sets settings.activeProvider. Does not touch learning data. */
    select(id: ProviderId): Promise<Result<AppSettings>>
    /** Sends a tiny prompt to verify the provider end-to-end. */
    test(id: ProviderId): Promise<Result<{ ok: true; latencyMs: number; sample: string }>>
  }
  courses: {
    list(): Promise<Result<CourseCard[]>>
    /** Creates course + tutor in one transaction and enqueues curriculum generation. Idempotent by requestId. */
    create(input: CreateCourseInput): Promise<Result<CourseCard>>
    update(courseId: string, patch: UpdateCourseInput): Promise<Result<Course>>
    /** Deletes course and all dependent data (FK cascade). Renderer must confirm first. */
    delete(courseId: string): Promise<Result<null>>
    retryCurriculum(courseId: string): Promise<Result<BackgroundJob>>
  }
  classroom: {
    get(courseId: string): Promise<Result<ClassroomSnapshot>>
  }
  lessons: {
    /** Sets the course's current lesson (marks it in_progress if not_started). */
    select(courseId: string, lessonId: string): Promise<Result<ClassroomSnapshot>>
    /** Explicit learner action. Marks lesson completed, advances current lesson, enqueues session summary. */
    complete(courseId: string, lessonId: string): Promise<Result<ClassroomSnapshot>>
  }
  objectives: {
    /** Learner self-check ("이해했어요"). Recorded as evidence kind 'self_report'. */
    selfCheck(objectiveId: string, understood: boolean): Promise<Result<ClassroomSnapshot>>
  }
  chat: {
    /** Older messages before `beforeMessageId` (pagination). */
    history(courseId: string, beforeMessageId: string | null, limit: number): Promise<Result<{ messages: ChatMessage[]; hasMore: boolean }>>
    /** Saves learner message (idempotent by clientMessageId) and starts streaming the tutor reply via EVENTS.chat. Resolves once started. */
    send(input: SendMessageInput): Promise<Result<{ learnerMessage: ChatMessage; tutorMessage: ChatMessage }>>
    /** Tutor opens/resumes the lesson without a learner message. */
    startLesson(courseId: string): Promise<Result<{ tutorMessage: ChatMessage }>>
    cancel(courseId: string): Promise<Result<null>>
    /** Re-runs a failed/cancelled tutor message IN PLACE (same message id, no duplicate rows). */
    retry(tutorMessageId: string): Promise<Result<{ tutorMessage: ChatMessage }>>
  }
  quiz: {
    /** Generates 3 questions (MC/OX) for the lesson via QuizSkill. Blocking call (shows progress in UI). */
    generate(courseId: string, lessonId: string): Promise<Result<QuizQuestion[]>>
    /** Graded in main against the stored answer key. */
    answer(input: AnswerQuizInput): Promise<Result<QuizAttemptResult>>
    flag(input: FlagQuizInput): Promise<Result<QuizQuestion>>
  }
  jobs: {
    list(courseId: string | null): Promise<Result<BackgroundJob[]>>
  }
  /** Frameless window controls for the in-app title bar. Always acts on the main window. */
  window: {
    /** Host `process.platform` ('darwin' | 'win32' | 'linux' ...). Synchronous, available before bootstrap. */
    platform: string
    minimize(): Promise<Result<null>>
    /** Maximizes, or restores when already maximized. Resolves with the new maximized state. */
    toggleMaximize(): Promise<Result<boolean>>
    close(): Promise<Result<null>>
    state(): Promise<Result<WindowStateEvent>>
  }
  on: {
    chat(listener: (event: ChatStreamEvent) => void): Unsubscribe
    jobs(listener: (event: JobEvent) => void): Unsubscribe
    courses(listener: (event: CourseEvent) => void): Unsubscribe
    windowState(listener: (event: WindowStateEvent) => void): Unsubscribe
  }
}
