import type { LessonStatus, ObjectiveStatus, QuizType } from '@shared/domain'

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  not_started: '시작 전',
  in_progress: '진행 중',
  completed: '완료',
  needs_review: '복습 필요'
}

export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  not_started: '시작 전',
  in_progress: '진행 중',
  achieved: '달성',
  needs_review: '복습 필요'
}

export const EVIDENCE_LABEL: Record<'quiz' | 'self_report', string> = {
  quiz: '퀴즈 결과',
  self_report: '자기 점검'
}

export const QUIZ_TYPE_LABEL: Record<QuizType, string> = {
  multiple_choice: '객관식',
  ox: 'OX'
}

/** Korean label for the learner's own input. Never a trait label. */
export const TUTOR_NAME_FALLBACK = '선생님'
