/**
 * Tutor character builder (BE-03). Pure: builds the TutorCharacter row shape from a preset,
 * the course, and the learner profile snapshot. Persistence is done by the caller (repo-core insertTutor).
 */
import { getPreset } from '@shared/presets'
import type { CharacterPresetId, Course, LearnerProfile, OnboardingAnswers, TutorCharacter } from '@shared/domain'
import { newId, nowIso } from '../db/util'

/** Stored in tutor_characters.prompt_version. Bump together with prompts.ts section text. */
export const PROMPT_VERSION = 'tutor-v1'
export const TUTOR_NAME_MAX = 20

const START_HINT: Record<OnboardingAnswers['startDifficulty'], string> = {
  hard_to_start: '처음 시작이 어려우니 아주 작은 첫 단계부터 제안한다.',
  dont_know_where: '어디서 시작할지 막막해하니 전체 흐름을 먼저 짚어 준다.',
  give_up_when_stuck: '막히면 포기하기 쉬우니 힌트를 단계적으로 준다.',
  no_difficulty: '시작에 큰 어려움이 없으니 바로 핵심으로 들어간다.'
}

const METHOD_HINT: Record<OnboardingAnswers['preferredMethod'], string> = {
  theory: '개념과 원리 설명을 먼저 제공한다.',
  practice: '예시와 실습 위주로 진행한다.',
  problem_solving: '문제를 먼저 풀어 보게 하고 피드백한다.',
  conversation: '대화로 질문을 주고받으며 이해를 확인한다.'
}

const MANAGEMENT_HINT: Record<OnboardingAnswers['managementStyle'], string> = {
  strict: '다음 행동을 구체적으로 정해 준다.',
  encouraging: '격려하는 톤으로 다음 행동을 부드럽게 제안한다.',
  autonomous: '선택지를 주고 학습자가 고르게 한다.',
  short_goals: '짧은 목표 단위로 나누어 제시한다.'
}

const MOTIVATION_HINT: Record<OnboardingAnswers['motivation'], string> = {
  deadline: '기한과 진행 상황을 자주 짚는다.',
  small_steps: '작은 성공을 구체적으로 칭찬한다.',
  visual_progress: '완료한 단원과 목표를 요약해 보여 준다.',
  free_exploration: '학습자의 호기심을 따라가는 질문을 던진다.'
}

/**
 * Derives the learner-approach sentence from the onboarding snapshot (a snapshot: later profile edits
 * never change an existing tutor). Null profile yields a neutral default.
 */
export function deriveApproach(profile: LearnerProfile | null): string {
  if (!profile) return '학습자의 질문을 중심으로 차근차근 진행한다.'
  const a = profile.answers
  return [START_HINT[a.startDifficulty], METHOD_HINT[a.preferredMethod], MANAGEMENT_HINT[a.managementStyle], MOTIVATION_HINT[a.motivation]].join(' ')
}

export function resolveTutorName(presetId: CharacterPresetId, tutorName?: string): string {
  const preset = getPreset(presetId)
  const trimmed = tutorName?.trim()
  if (trimmed && trimmed.length > 0) {
    if (trimmed.length > TUTOR_NAME_MAX) throw new RangeError(`tutor name exceeds ${TUTOR_NAME_MAX} chars`)
    return trimmed
  }
  return preset.defaultName
}

export function buildTutorCharacter(
  presetId: CharacterPresetId,
  course: Pick<Course, 'id'>,
  profile: LearnerProfile | null,
  tutorName?: string
): TutorCharacter {
  const preset = getPreset(presetId)
  return {
    id: newId(),
    courseId: course.id,
    presetId: preset.id,
    name: resolveTutorName(presetId, tutorName),
    archetype: preset.archetype,
    personality: preset.personality,
    speakingStyle: preset.speakingStyle,
    teachingStyle: preset.teachingStyle,
    expertise: '해당 주제의 튜터',
    approach: deriveApproach(profile),
    appearance: preset.appearance,
    defaultEmotion: preset.defaultEmotion,
    voice: null,
    promptVersion: PROMPT_VERSION,
    createdAt: nowIso()
  }
}
