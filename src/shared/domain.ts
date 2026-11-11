/**
 * Shared domain contract (leader-owned).
 * Used by main, preload and renderer. Pure types + Zod schemas only; no Node/DOM APIs.
 */
import { z } from 'zod'

// ───────────────────────── Onboarding / learner profile ─────────────────────────

export const StartDifficulty = z.enum(['hard_to_start', 'dont_know_where', 'give_up_when_stuck', 'no_difficulty'])
export const PreferredMethod = z.enum(['theory', 'practice', 'problem_solving', 'conversation'])
export const ManagementStyle = z.enum(['strict', 'encouraging', 'autonomous', 'short_goals'])
export const DailyTime = z.enum(['10_15', '20_30', '45_60', '60_plus'])
export const MotivationStyle = z.enum(['deadline', 'small_steps', 'visual_progress', 'free_exploration'])

export const OnboardingAnswersSchema = z.object({
  startDifficulty: StartDifficulty,
  preferredMethod: PreferredMethod,
  managementStyle: ManagementStyle,
  dailyTime: DailyTime,
  motivation: MotivationStyle
})
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>

/** Learner profile = initial self-report. It only drives strategy hints, never a fixed trait label. */
export interface LearnerProfile {
  answers: OnboardingAnswers
  completedAt: string // ISO
  updatedAt: string // ISO
}

// ───────────────────────── Settings ─────────────────────────

export const ThemeSchema = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const ProviderIdSchema = z.enum(['claude-code', 'codex', 'mock'])
export type ProviderId = z.infer<typeof ProviderIdSchema>

/**
 * Model alias passed to a CLI as a separate argv element. Single source for provider, settings schema and UI.
 * No leading "-" (cannot be read as a flag); brackets allowed for aliases like `sonnet[1m]`.
 */
export const MODEL_ALIAS_RE = /^[A-Za-z0-9._:[\]][A-Za-z0-9._:\-[\]]{0,63}$/

export const AppSettingsSchema = z.object({
  theme: ThemeSchema,
  activeProvider: ProviderIdSchema.nullable(),
  /** Optional model alias passed to the CLI (validated by MODEL_ALIAS_RE). null = CLI default. */
  claudeModel: z.string().regex(MODEL_ALIAS_RE).nullable(),
  codexModel: z.string().regex(MODEL_ALIAS_RE).nullable(),
  /** Per-request timeout for AI calls, seconds. */
  requestTimeoutSec: z.number().int().min(30).max(900)
})
export type AppSettings = z.infer<typeof AppSettingsSchema>
export const AppSettingsPatchSchema = AppSettingsSchema.partial()
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  activeProvider: null,
  claudeModel: null,
  codexModel: null,
  requestTimeoutSec: 180
}

// ───────────────────────── AI providers ─────────────────────────

export interface ProviderInfo {
  id: ProviderId
  displayName: string
  /** true when the integration is a dev/experimental adapter (see docs/AI_PROVIDER.md). */
  experimental: boolean
  installed: boolean
  executablePath: string | null
  version: string | null
  /** null = unknown (could not determine). */
  authenticated: boolean | null
  /** installed && authenticated !== false */
  ready: boolean
  /** Korean, user-facing explanation of the state / next action. */
  message: string
  capabilities: ProviderCapabilities
}

export interface ProviderCapabilities {
  /** token-level streaming (Claude) vs whole-message (Codex emits one message). */
  tokenStreaming: boolean
  cancel: boolean
  structuredOutput: boolean
}

/** Stable, user-facing error codes. Renderer maps code -> Korean copy (message also included). */
export const AppErrorCodeSchema = z.enum([
  'PROVIDER_NOT_SELECTED',
  'PROVIDER_NOT_INSTALLED',
  'PROVIDER_AUTH_REQUIRED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_CANCELLED',
  'PROVIDER_FAILED',
  'INVALID_AI_OUTPUT',
  'BUSY',
  'NOT_FOUND',
  'VALIDATION',
  'COURSE_IMMUTABLE',
  'DB_ERROR',
  'UNKNOWN'
])
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>

export interface AppErrorPayload {
  code: AppErrorCode
  message: string // Korean, user-facing
  detail?: string // technical detail (no secrets)
  retryable: boolean
}

/** Every IPC invoke resolves to this envelope (never rejects across the bridge). */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload }

// ───────────────────────── Characters ─────────────────────────

export const CharacterPresetIdSchema = z.enum(['kind-explainer', 'strict-coach', 'motivator', 'researcher'])
export type CharacterPresetId = z.infer<typeof CharacterPresetIdSchema>

export const EmotionSchema = z.enum(['idle', 'thinking', 'talking', 'happy', 'concerned'])
export type Emotion = z.infer<typeof EmotionSchema>

export interface TutorCharacter {
  id: string
  courseId: string
  presetId: CharacterPresetId
  name: string
  archetype: string // e.g. '친절한 설명형'
  personality: string
  speakingStyle: string
  teachingStyle: string
  expertise: string
  approach: string // how the tutor approaches this learner (derived from profile)
  appearance: string
  defaultEmotion: Emotion
  /** Reserved for phase 2/3 (voice, Live2D/VRM). Always null in MVP. */
  voice: null
  promptVersion: string
  createdAt: string
}

// ───────────────────────── Courses ─────────────────────────

export const CourseLevelSchema = z.enum(['beginner', 'intermediate', 'advanced'])
export type CourseLevel = z.infer<typeof CourseLevelSchema>
export const CoursePaceSchema = z.enum(['slow', 'normal', 'fast'])
export type CoursePace = z.infer<typeof CoursePaceSchema>
export const CurriculumStatusSchema = z.enum(['pending', 'generating', 'ready', 'failed'])
export type CurriculumStatus = z.infer<typeof CurriculumStatusSchema>

export interface Course {
  id: string
  /** IMMUTABLE after creation (enforced by repository + DB trigger). */
  title: string
  /** IMMUTABLE original natural-language request. */
  topicPrompt: string
  goal: string // mutable
  level: CourseLevel // mutable
  pace: CoursePace // mutable
  curriculumStatus: CurriculumStatus
  curriculumError: string | null
  currentLessonId: string | null
  createdAt: string
  updatedAt: string
  lastStudiedAt: string | null
}

export const CreateCourseInputSchema = z.object({
  /** Client-generated UUID used as idempotency key: same requestId => same course, never a duplicate. */
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(60),
  topicPrompt: z.string().trim().min(2).max(500),
  goal: z.string().trim().min(1).max(300),
  level: CourseLevelSchema,
  pace: CoursePaceSchema,
  presetId: CharacterPresetIdSchema,
  /** Optional custom tutor name; defaults to preset name. */
  tutorName: z.string().trim().min(1).max(20).optional()
})
export type CreateCourseInput = z.infer<typeof CreateCourseInputSchema>

/** Only these fields are updatable. title/topicPrompt/id are NOT part of the patch on purpose. */
export const UpdateCourseInputSchema = z
  .object({
    goal: z.string().trim().min(1).max(300).optional(),
    level: CourseLevelSchema.optional(),
    pace: CoursePaceSchema.optional()
  })
  .strict()
export type UpdateCourseInput = z.infer<typeof UpdateCourseInputSchema>

// ───────────────────────── Curriculum ─────────────────────────

export const LessonStatusSchema = z.enum(['not_started', 'in_progress', 'completed', 'needs_review'])
export type LessonStatus = z.infer<typeof LessonStatusSchema>
export const ObjectiveStatusSchema = z.enum(['not_started', 'in_progress', 'achieved', 'needs_review'])
export type ObjectiveStatus = z.infer<typeof ObjectiveStatusSchema>

export interface LearningObjective {
  id: string
  lessonId: string
  position: number
  description: string
  status: ObjectiveStatus
  /** Evidence trail: objective may only become 'achieved' via quiz or explicit learner self-check. */
  evidence: ObjectiveEvidence[]
}

export interface ObjectiveEvidence {
  id: string
  kind: 'quiz' | 'self_report'
  refId: string | null // quiz_attempt id for kind=quiz
  note: string
  createdAt: string
}

export interface Lesson {
  id: string
  moduleId: string
  courseId: string
  position: number
  title: string
  summary: string
  status: LessonStatus
  startedAt: string | null
  completedAt: string | null
  objectives: LearningObjective[]
}

export interface CurriculumModule {
  id: string
  courseId: string
  position: number
  title: string
  summary: string
  lessons: Lesson[]
}

// ───────────────────────── Chat ─────────────────────────

export const MessageRoleSchema = z.enum(['tutor', 'learner', 'system'])
export type MessageRole = z.infer<typeof MessageRoleSchema>
export const MessageStatusSchema = z.enum(['complete', 'streaming', 'error', 'cancelled'])
export type MessageStatus = z.infer<typeof MessageStatusSchema>
export const MessageKindSchema = z.enum(['chat', 'notice'])
export type MessageKind = z.infer<typeof MessageKindSchema>

export interface ChatMessage {
  id: string
  courseId: string
  lessonId: string | null
  role: MessageRole
  kind: MessageKind
  content: string
  status: MessageStatus
  /** tutor message -> learner message it answers (null for lesson kickoff). */
  replyTo: string | null
  providerId: ProviderId | null
  errorCode: AppErrorCode | null
  createdAt: string
}

export const SendMessageInputSchema = z.object({
  courseId: z.string().uuid(),
  /** Client-generated id = idempotency key for the learner message. */
  clientMessageId: z.string().uuid(),
  content: z.string().trim().min(1).max(8000)
})
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>

/** Streamed from main to renderer on channel 'chat:event'. */
export type ChatStreamEvent =
  | { type: 'started'; courseId: string; learnerMessage: ChatMessage | null; tutorMessage: ChatMessage }
  | { type: 'delta'; courseId: string; messageId: string; delta: string }
  | { type: 'completed'; courseId: string; message: ChatMessage }
  | { type: 'failed'; courseId: string; message: ChatMessage; error: AppErrorPayload }
  | { type: 'cancelled'; courseId: string; message: ChatMessage }

// ───────────────────────── Quizzes ─────────────────────────

export const QuizTypeSchema = z.enum(['multiple_choice', 'ox'])
export type QuizType = z.infer<typeof QuizTypeSchema>

/** Quiz as exposed to the renderer BEFORE answering: no answer, no explanation. */
export interface QuizQuestion {
  id: string
  courseId: string
  lessonId: string
  objectiveId: string | null
  type: QuizType
  question: string
  choices: string[] // OX => ['O', 'X']
  flagged: boolean
  createdAt: string
  /** Present once the learner has answered (latest attempt). */
  lastAttempt: QuizAttemptResult | null
}

export interface QuizAttemptResult {
  attemptId: string
  quizId: string
  selectedIndex: number
  correct: boolean
  correctIndex: number
  explanation: string
  createdAt: string
}

export const AnswerQuizInputSchema = z.object({
  quizId: z.string().uuid(),
  selectedIndex: z.number().int().min(0).max(5)
})
export type AnswerQuizInput = z.infer<typeof AnswerQuizInputSchema>

export const FlagQuizInputSchema = z.object({
  quizId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300)
})
export type FlagQuizInput = z.infer<typeof FlagQuizInputSchema>

// ───────────────────────── Sessions / memory ─────────────────────────

export interface LearningSummary {
  id: string
  courseId: string
  lessonId: string | null
  summary: string
  nextSteps: string
  /** Last message id covered by this summary (context builder only sends messages after it). */
  coveredUntilMessageId: string | null
  createdAt: string
}

export interface LearningMemory {
  id: string
  courseId: string
  kind: 'strength' | 'difficulty' | 'note'
  content: string
  /** 'evidence' = derived from graded quiz data; 'ai_inferred' = AI summary judgement (not authoritative). */
  confidence: 'evidence' | 'ai_inferred'
  source: 'summary' | 'quiz'
  sourceRef: string | null
  createdAt: string
}

// ───────────────────────── Background jobs ─────────────────────────

export const JobTypeSchema = z.enum(['curriculum_generation', 'session_summary'])
export type JobType = z.infer<typeof JobTypeSchema>
export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export type JobStatus = z.infer<typeof JobStatusSchema>

export interface BackgroundJob {
  id: string
  type: JobType
  courseId: string | null
  status: JobStatus
  priority: number // higher runs first
  attempts: number
  maxAttempts: number
  /** de-duplication key: at most one queued/running job per key. */
  dedupeKey: string
  error: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

// ───────────────────────── Composite views ─────────────────────────

export interface CourseCard {
  course: Course
  tutor: TutorCharacter
  totalLessons: number
  completedLessons: number
  currentLessonTitle: string | null
  nextLessonTitle: string | null
  lastLessonTitle: string | null
}

export interface ClassroomSnapshot {
  course: Course
  tutor: TutorCharacter
  modules: CurriculumModule[]
  currentLesson: Lesson | null
  messages: ChatMessage[] // latest page, ascending by createdAt
  hasMoreMessages: boolean
  quizzes: QuizQuestion[] // for current lesson
  latestSummary: LearningSummary | null
  activeJobs: BackgroundJob[]
  /** true while a chat request for this course is running in main. */
  chatBusy: boolean
}

export interface AppBootstrap {
  version: string
  onboardingCompleted: boolean
  profile: LearnerProfile | null
  settings: AppSettings
  dataDir: string
  /** Non-fatal startup notices (e.g. recovered jobs / interrupted messages). Korean. */
  notices: string[]
}

export interface ExportResult {
  filePath: string
  bytes: number
}
