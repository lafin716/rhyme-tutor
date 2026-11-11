/**
 * Onboarding survey copy (leader-owned). Labels are user-facing Korean; the stored values are enum keys.
 * Note: answers describe the learner's current situation, never a permanent trait.
 */
import type { OnboardingAnswers } from './domain'

export interface SurveyOption<V extends string> {
  value: V
  label: string
}

export interface SurveyQuestion<K extends keyof OnboardingAnswers = keyof OnboardingAnswers> {
  key: K
  title: string
  helper: string
  options: SurveyOption<OnboardingAnswers[K]>[]
}

export const SURVEY: { [K in keyof OnboardingAnswers]: SurveyQuestion<K> }[keyof OnboardingAnswers][] = [
  {
    key: 'startDifficulty',
    title: '학습을 시작할 때 가장 어려운 점은 무엇인가요?',
    helper: '지금의 상황을 알려주세요. 언제든 설정에서 바꿀 수 있어요.',
    options: [
      { value: 'hard_to_start', label: '시작 자체가 귀찮게 느껴져요' },
      { value: 'dont_know_where', label: '무엇부터 공부할지 모르겠어요' },
      { value: 'give_up_when_stuck', label: '이해가 안 되면 포기하게 돼요' },
      { value: 'no_difficulty', label: '특별히 어렵지 않아요' }
    ]
  },
  {
    key: 'preferredMethod',
    title: '어떤 방식으로 배울 때 가장 잘 이해되나요?',
    helper: '선생님이 설명 방식을 정할 때 참고해요.',
    options: [
      { value: 'theory', label: '이론 중심' },
      { value: 'practice', label: '실습 중심' },
      { value: 'problem_solving', label: '문제 풀이 중심' },
      { value: 'conversation', label: '대화 중심' }
    ]
  },
  {
    key: 'managementStyle',
    title: '선생님이 어떻게 이끌어 주면 좋을까요?',
    helper: '수업의 분위기와 관리 강도를 정해요.',
    options: [
      { value: 'strict', label: '엄격하게 과제를 관리해 주세요' },
      { value: 'encouraging', label: '격려 위주로 해주세요' },
      { value: 'autonomous', label: '자율적으로 진행할게요' },
      { value: 'short_goals', label: '짧은 목표를 하나씩 주세요' }
    ]
  },
  {
    key: 'dailyTime',
    title: '하루에 학습할 수 있는 시간은 어느 정도인가요?',
    helper: '한 번의 수업 분량을 정할 때 사용해요.',
    options: [
      { value: '10_15', label: '10~15분' },
      { value: '20_30', label: '20~30분' },
      { value: '45_60', label: '45~60분' },
      { value: '60_plus', label: '60분 이상' }
    ]
  },
  {
    key: 'motivation',
    title: '목표를 이루는 데 가장 도움이 되는 방식은?',
    helper: '진도를 안내하는 방식에 반영해요.',
    options: [
      { value: 'deadline', label: '명확한 마감일' },
      { value: 'small_steps', label: '작은 단계별 목표' },
      { value: 'visual_progress', label: '성취도 시각화' },
      { value: 'free_exploration', label: '자유로운 탐구' }
    ]
  }
]

export function answerLabel<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]): string {
  const q = SURVEY.find((s) => s.key === key)
  const opt = q?.options.find((o) => o.value === value)
  return opt?.label ?? String(value)
}

export const LEVEL_LABEL = { beginner: '입문', intermediate: '중급', advanced: '고급' } as const
export const PACE_LABEL = { slow: '천천히', normal: '보통', fast: '빠르게' } as const
