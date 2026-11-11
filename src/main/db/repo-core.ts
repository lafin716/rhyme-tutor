import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  OnboardingAnswersSchema,
  type AppSettings,
  type AppSettingsPatch,
  type Course,
  type CourseLevel,
  type CoursePace,
  type CurriculumStatus,
  type Emotion,
  type LearnerProfile,
  type TutorCharacter,
  type CharacterPresetId
} from '@shared/domain'
import type { Db } from './util'
import { many, nowIso, one, RepoError } from './util'
import { withTx } from './connection'

// ───────────── profile ─────────────

interface ProfileRow {
  answers_json: string
  completed_at: string
  updated_at: string
}

export function getProfile(db: Db): LearnerProfile | null {
  const row = one<ProfileRow>(db.prepare('SELECT answers_json, completed_at, updated_at FROM user_profile WHERE id = 1'))
  if (!row) return null
  const parsed = OnboardingAnswersSchema.safeParse(JSON.parse(row.answers_json))
  if (!parsed.success) return null
  return { answers: parsed.data, completedAt: row.completed_at, updatedAt: row.updated_at }
}

export function saveProfile(db: Db, answersInput: unknown): LearnerProfile {
  const parsed = OnboardingAnswersSchema.safeParse(answersInput)
  if (!parsed.success) throw new RepoError('VALIDATION', '설문 응답 형식이 올바르지 않아요.')
  const now = nowIso()
  const existing = getProfile(db)
  db.prepare(
    `INSERT INTO user_profile (id, answers_json, completed_at, updated_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET answers_json = excluded.answers_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(parsed.data), existing?.completedAt ?? now, now)
  return getProfile(db) as LearnerProfile
}

// ───────────── settings ─────────────

export function getSettings(db: Db): AppSettings {
  const rows = many<{ key: string; value_json: string }>(db.prepare('SELECT key, value_json FROM app_settings'))
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) {
    try {
      merged[r.key] = JSON.parse(r.value_json)
    } catch {
      /* ignore corrupt value; default applies */
    }
  }
  const parsed = AppSettingsSchema.safeParse(merged)
  if (parsed.success) return parsed.data
  // Reset only the invalid keys (e.g. a model alias stored before validation tightened), keep the rest.
  const defaults = DEFAULT_SETTINGS as Record<string, unknown>
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string') merged[key] = defaults[key]
  }
  const repaired = AppSettingsSchema.safeParse(merged)
  return repaired.success ? repaired.data : { ...DEFAULT_SETTINGS }
}

export function updateSettings(db: Db, patch: AppSettingsPatch): AppSettings {
  const next = AppSettingsSchema.safeParse({ ...getSettings(db), ...patch })
  if (!next.success) throw new RepoError('VALIDATION', '설정 값이 올바르지 않아요.')
  const now = nowIso()
  withTx(db, () => {
    const stmt = db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
      stmt.run(key, JSON.stringify(next.data[key]), now)
    }
  })
  return next.data
}

// ───────────── courses ─────────────

export interface CourseRow {
  id: string
  request_id: string
  title: string
  topic_prompt: string
  goal: string
  level: CourseLevel
  pace: CoursePace
  curriculum_status: CurriculumStatus
  curriculum_error: string | null
  current_lesson_id: string | null
  created_at: string
  updated_at: string
  last_studied_at: string | null
}

export function rowToCourse(r: CourseRow): Course {
  return {
    id: r.id,
    title: r.title,
    topicPrompt: r.topic_prompt,
    goal: r.goal,
    level: r.level,
    pace: r.pace,
    curriculumStatus: r.curriculum_status,
    curriculumError: r.curriculum_error,
    currentLessonId: r.current_lesson_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastStudiedAt: r.last_studied_at
  }
}

export function getCourse(db: Db, id: string): Course | null {
  const row = one<CourseRow>(db.prepare('SELECT * FROM courses WHERE id = ?'), id)
  return row ? rowToCourse(row) : null
}

export function getCourseByRequestId(db: Db, requestId: string): Course | null {
  const row = one<CourseRow>(db.prepare('SELECT * FROM courses WHERE request_id = ?'), requestId)
  return row ? rowToCourse(row) : null
}

export function listCourses(db: Db): Course[] {
  return many<CourseRow>(db.prepare('SELECT * FROM courses ORDER BY created_at DESC, id DESC')).map(rowToCourse)
}

export interface NewCourseRecord {
  id: string
  requestId: string
  title: string
  topicPrompt: string
  goal: string
  level: CourseLevel
  pace: CoursePace
}

/** Inserts a course row. Caller provides the transaction. Identity fields are never updated after this. */
export function insertCourse(db: Db, c: NewCourseRecord, now: string): void {
  db.prepare(
    `INSERT INTO courses (id, request_id, title, topic_prompt, goal, level, pace, curriculum_status,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(c.id, c.requestId, c.title, c.topicPrompt, c.goal, c.level, c.pace, now, now)
}

/** Mutable fields only. Identity columns are not part of this signature. */
export function updateCourseMutable(
  db: Db,
  id: string,
  patch: { goal?: string; level?: CourseLevel; pace?: CoursePace }
): void {
  const sets: string[] = []
  const params: (string | null)[] = []
  if (patch.goal !== undefined) {
    sets.push('goal = ?')
    params.push(patch.goal)
  }
  if (patch.level !== undefined) {
    sets.push('level = ?')
    params.push(patch.level)
  }
  if (patch.pace !== undefined) {
    sets.push('pace = ?')
    params.push(patch.pace)
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(nowIso())
  db.prepare(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`).run(...params, id)
}

export function setCurriculumStatus(db: Db, id: string, status: CurriculumStatus, error: string | null): void {
  db.prepare('UPDATE courses SET curriculum_status = ?, curriculum_error = ?, updated_at = ? WHERE id = ?').run(
    status,
    error,
    nowIso(),
    id
  )
}

/**
 * Records a chat turn: bumps the course's last_studied_at / updated_at and moves the current lesson
 * not_started -> in_progress. Never changes any other lesson status (completed / needs_review are kept).
 * Objective status is not touched here; it still requires evidence rows.
 */
export function recordStudyActivity(db: Db, courseId: string, lessonId: string | null): void {
  const now = nowIso()
  db.prepare('UPDATE courses SET last_studied_at = ?, updated_at = ? WHERE id = ?').run(now, now, courseId)
  if (!lessonId) return
  db.prepare(
    `UPDATE curriculum_lessons SET status = 'in_progress', started_at = COALESCE(started_at, ?)
     WHERE id = ? AND course_id = ? AND status = 'not_started'`
  ).run(now, lessonId, courseId)
}

export function setCurrentLesson(db: Db, courseId: string, lessonId: string | null): void {
  db.prepare('UPDATE courses SET current_lesson_id = ?, last_studied_at = ?, updated_at = ? WHERE id = ?').run(
    lessonId,
    nowIso(),
    nowIso(),
    courseId
  )
}

export function deleteCourse(db: Db, id: string): boolean {
  const res = db.prepare('DELETE FROM courses WHERE id = ?').run(id)
  return Number(res.changes) > 0
}

// ───────────── tutor characters ─────────────

interface CharacterRow {
  id: string
  course_id: string
  preset_id: CharacterPresetId
  name: string
  archetype: string
  personality: string
  speaking_style: string
  teaching_style: string
  expertise: string
  approach: string
  appearance: string
  default_emotion: Emotion
  voice_json: string | null
  prompt_version: string
  created_at: string
}

export function getTutorByCourse(db: Db, courseId: string): TutorCharacter | null {
  const r = one<CharacterRow>(db.prepare('SELECT * FROM tutor_characters WHERE course_id = ?'), courseId)
  if (!r) return null
  return {
    id: r.id,
    courseId: r.course_id,
    presetId: r.preset_id,
    name: r.name,
    archetype: r.archetype,
    personality: r.personality,
    speakingStyle: r.speaking_style,
    teachingStyle: r.teaching_style,
    expertise: r.expertise,
    approach: r.approach,
    appearance: r.appearance,
    defaultEmotion: r.default_emotion,
    voice: null,
    promptVersion: r.prompt_version,
    createdAt: r.created_at
  }
}

export function insertTutor(db: Db, t: TutorCharacter): void {
  db.prepare(
    `INSERT INTO tutor_characters (id, course_id, preset_id, name, archetype, personality, speaking_style,
       teaching_style, expertise, approach, appearance, default_emotion, voice_json, prompt_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    t.id,
    t.courseId,
    t.presetId,
    t.name,
    t.archetype,
    t.personality,
    t.speakingStyle,
    t.teachingStyle,
    t.expertise,
    t.approach,
    t.appearance,
    t.defaultEmotion,
    t.promptVersion,
    t.createdAt
  )
}
