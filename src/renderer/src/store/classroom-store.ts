import { create } from 'zustand'
import type {
  AppErrorPayload,
  BackgroundJob,
  ClassroomSnapshot,
  Emotion,
  QuizAttemptResult,
  QuizQuestion,
  Result
} from '@shared/domain'
import { localFailure, run } from '../lib/result'
import { useChatStore } from './chat-store'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

const HINT_MS = 4000
let hintTimer: number | undefined

interface ClassroomState {
  courseId: string | null
  status: LoadStatus
  error: AppErrorPayload | null
  snapshot: ClassroomSnapshot | null
  /** Quiz set for the current lesson (generated or loaded). */
  quizzes: QuizQuestion[]
  /** Short-lived emotion cue after a quiz answer. */
  quizHint: Emotion | null
  load: (courseId: string) => Promise<void>
  refresh: () => Promise<void>
  clear: () => void
  selectLesson: (lessonId: string) => Promise<Result<ClassroomSnapshot>>
  completeLesson: (lessonId: string) => Promise<Result<ClassroomSnapshot>>
  selfCheck: (objectiveId: string, understood: boolean) => Promise<Result<ClassroomSnapshot>>
  retryCurriculum: () => Promise<Result<BackgroundJob>>
  generateQuiz: (lessonId: string) => Promise<Result<QuizQuestion[]>>
  answerQuiz: (quizId: string, selectedIndex: number) => Promise<Result<QuizAttemptResult>>
  flagQuiz: (quizId: string, reason: string) => Promise<Result<QuizQuestion>>
}

function setQuizHint(hint: Emotion): void {
  window.clearTimeout(hintTimer)
  useClassroomStore.setState({ quizHint: hint })
  hintTimer = window.setTimeout(() => useClassroomStore.setState({ quizHint: null }), HINT_MS)
}

export const useClassroomStore = create<ClassroomState>((set, get) => ({
  courseId: null,
  status: 'idle',
  error: null,
  snapshot: null,
  quizzes: [],
  quizHint: null,

  async load(courseId) {
    set({ courseId, status: 'loading', error: null, snapshot: null, quizzes: [], quizHint: null })
    const res = await run(() => window.tutor.classroom.get(courseId))
    if (get().courseId !== courseId) return
    if (!res.ok) {
      set({ status: 'error', error: res.error })
      return
    }
    useChatStore.getState().hydrate(courseId, res.data.messages, res.data.hasMoreMessages)
    set({ status: 'ready', snapshot: res.data, quizzes: res.data.quizzes })
  },

  /** Silent reload of course/curriculum state; chat messages are owned by the chat store. */
  async refresh() {
    const courseId = get().courseId
    if (!courseId) return
    const res = await run(() => window.tutor.classroom.get(courseId))
    if (!res.ok || get().courseId !== courseId) return
    set({ snapshot: res.data, quizzes: res.data.quizzes, status: 'ready' })
  },

  clear() {
    window.clearTimeout(hintTimer)
    set({ courseId: null, status: 'idle', error: null, snapshot: null, quizzes: [], quizHint: null })
  },

  async selectLesson(lessonId) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.lessons.select(courseId, lessonId))
    if (res.ok && get().courseId === courseId) set({ snapshot: res.data, quizzes: res.data.quizzes })
    return res
  },

  async completeLesson(lessonId) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.lessons.complete(courseId, lessonId))
    if (res.ok && get().courseId === courseId) set({ snapshot: res.data, quizzes: res.data.quizzes })
    return res
  },

  async selfCheck(objectiveId, understood) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.objectives.selfCheck(objectiveId, understood))
    if (res.ok && get().courseId === courseId) set({ snapshot: res.data })
    return res
  },

  async retryCurriculum() {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.courses.retryCurriculum(courseId))
    if (res.ok) void get().refresh()
    return res
  },

  async generateQuiz(lessonId) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.quiz.generate(courseId, lessonId))
    if (res.ok && get().courseId === courseId) set({ quizzes: res.data })
    return res
  },

  async answerQuiz(quizId, selectedIndex) {
    const res = await run(() => window.tutor.quiz.answer({ quizId, selectedIndex }))
    if (!res.ok) return res
    set((s) => ({
      quizzes: s.quizzes.map((q) => (q.id === quizId ? { ...q, lastAttempt: res.data } : q))
    }))
    setQuizHint(res.data.correct ? 'happy' : 'concerned')
    // Grading can change objective status and evidence, so re-read the classroom state.
    void get().refresh()
    return res
  },

  async flagQuiz(quizId, reason) {
    const res = await run(() => window.tutor.quiz.flag({ quizId, reason }))
    if (res.ok) {
      set((s) => ({ quizzes: s.quizzes.map((q) => (q.id === quizId ? res.data : q)) }))
    }
    return res
  }
}))
