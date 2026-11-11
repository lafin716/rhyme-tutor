import { useAppStore } from '../../store/app-store'
import { EmptyState } from '../ui'
import { SurveyFlow } from '../SurveyFlow'

/** Edits the learner's self-reported situation. Saved through profile.save. */
export function LearningSettings() {
  const profile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)
  const notify = useAppStore((s) => s.notify)

  if (!profile) {
    return (
      <div data-testid="learning-empty">
        <EmptyState title="학습 성향을 아직 저장하지 않았어요" body="처음 시작할 때 설문을 마치면 여기서 수정할 수 있어요." />
      </div>
    )
  }

  return (
    <section aria-label="학습 성향 수정" data-testid="learning-settings" className="rounded-2xl border border-line bg-surface p-5">
      <SurveyFlow
        key={profile.updatedAt}
        mode="edit"
        initialAnswers={profile.answers}
        onSaved={(next) => {
          setProfile(next)
          notify('학습 성향을 저장했어요.', 'success')
        }}
      />
    </section>
  )
}
