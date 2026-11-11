import { useState } from 'react'
import type {
  AppErrorPayload,
  ClassroomSnapshot,
  Emotion,
  Lesson,
  LearningObjective,
  ObjectiveStatus,
  Result,
  TutorCharacter
} from '@shared/domain'
import { EVIDENCE_LABEL, LESSON_STATUS_LABEL, OBJECTIVE_STATUS_LABEL } from '../../lib/labels'
import { Avatar } from '../Avatar'
import { Badge, Button, ErrorNotice } from '../ui'

const STATUS_LINE: Record<Emotion, string> = {
  idle: '준비됐어요',
  thinking: '생각하는 중이에요',
  talking: '설명하고 있어요',
  happy: '잘하고 있어요!',
  concerned: '함께 다시 확인해 볼까요?'
}

const OBJECTIVE_TONE: Record<ObjectiveStatus, 'neutral' | 'accent' | 'success' | 'warn'> = {
  not_started: 'neutral',
  in_progress: 'accent',
  achieved: 'success',
  needs_review: 'warn'
}

interface TutorPanelProps {
  tutor: TutorCharacter
  emotion: Emotion
  lesson: Lesson | null
  onSelfCheck: (objectiveId: string, understood: boolean) => Promise<Result<ClassroomSnapshot>>
  onComplete: (lessonId: string) => Promise<Result<ClassroomSnapshot>>
}

/** Tutor character, current lesson objectives with evidence, self-check and lesson completion. */
export function TutorPanel({ tutor, emotion, lesson, onSelfCheck, onComplete }: TutorPanelProps) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)

  async function check(objectiveId: string, understood: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    const res = await onSelfCheck(objectiveId, understood)
    setBusy(false)
    if (!res.ok) setError(res.error)
  }

  async function complete(lessonId: string): Promise<void> {
    setBusy(true)
    setError(null)
    const res = await onComplete(lessonId)
    setBusy(false)
    setConfirming(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <section aria-label="튜터와 단원 정보" data-testid="tutor-panel" className="flex flex-col gap-5 p-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Avatar presetId={tutor.presetId} emotion={emotion} size="lg" label={`${tutor.name} 튜터`} />
        <p className="font-semibold text-ink" data-testid="tutor-name">
          {tutor.name}
        </p>
        <p className="text-xs font-medium text-accent">{tutor.archetype}</p>
        <p className="text-xs text-ink-2" data-testid="tutor-status">
          {STATUS_LINE[emotion]}
        </p>
      </div>

      {error && <ErrorNotice error={error} testId="tutor-error" />}

      {lesson ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-ink-3">현재 단원 · {LESSON_STATUS_LABEL[lesson.status]}</p>
            <h2 className="font-semibold text-ink" data-testid="current-lesson-title">
              {lesson.title}
            </h2>
            {lesson.summary && <p className="text-sm text-ink-2">{lesson.summary}</p>}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink">학습 목표</h3>
            {lesson.objectives.length === 0 && <p className="text-sm text-ink-2">등록된 목표가 없어요.</p>}
            <ul className="space-y-3" aria-label="학습 목표 목록">
              {lesson.objectives.map((o) => (
                <ObjectiveItem key={o.id} objective={o} busy={busy} onSelfCheck={check} />
              ))}
            </ul>
          </div>

          {lesson.status === 'completed' ? (
            <p className="text-sm font-medium text-success" data-testid="lesson-completed">
              완료한 단원이에요.
            </p>
          ) : confirming ? (
            <div className="space-y-2 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-ink" data-testid="complete-confirm">
              <p>이 단원을 완료로 표시할까요? 완료한 뒤에도 다시 볼 수 있어요.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" data-testid="lesson-complete-confirm" disabled={busy} onClick={() => void complete(lesson.id)}>
                  완료하기
                </Button>
                <Button size="sm" variant="ghost" data-testid="lesson-complete-cancel" onClick={() => setConfirming(false)} disabled={busy}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" data-testid="lesson-complete" disabled={busy} onClick={() => setConfirming(true)}>
              단원 완료
            </Button>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-ink-2" data-testid="tutor-no-lesson">
          단원을 선택하면 학습 목표가 여기에 보여요.
        </p>
      )}
    </section>
  )
}

interface ObjectiveItemProps {
  objective: LearningObjective
  busy: boolean
  onSelfCheck: (objectiveId: string, understood: boolean) => Promise<void>
}

function ObjectiveItem({ objective, busy, onSelfCheck }: ObjectiveItemProps) {
  return (
    <li
      data-testid={`objective-${objective.id}`}
      data-status={objective.status}
      className="space-y-2 rounded-xl border border-line bg-canvas p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink">{objective.description}</p>
        <Badge tone={OBJECTIVE_TONE[objective.status]} testId={`objective-status-${objective.id}`}>
          {OBJECTIVE_STATUS_LABEL[objective.status]}
        </Badge>
      </div>
      {objective.evidence.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-2">
          {objective.evidence.map((e) => (
            <li key={e.id}>
              <span className="font-medium">근거: {EVIDENCE_LABEL[e.kind]}</span>
              {e.note && <span> · {e.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {objective.status !== 'achieved' && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            data-testid={`objective-understood-${objective.id}`}
            disabled={busy}
            onClick={() => void onSelfCheck(objective.id, true)}
          >
            이해했어요
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid={`objective-hard-${objective.id}`}
            disabled={busy}
            onClick={() => void onSelfCheck(objective.id, false)}
          >
            아직 어려워요
          </Button>
        </div>
      )}
    </li>
  )
}
