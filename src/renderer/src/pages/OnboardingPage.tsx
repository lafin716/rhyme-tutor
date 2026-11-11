import { useAppStore } from '../store/app-store'
import { Shell } from '../components/Shell'
import { SurveyFlow } from '../components/SurveyFlow'

interface OnboardingPageProps {
  mode: 'initial' | 'edit'
}

/** First-run survey. Edit mode is reachable from Settings; initial mode continues to provider setup. */
export function OnboardingPage({ mode }: OnboardingPageProps) {
  const profile = useAppStore((s) => s.profile)
  const navigate = useAppStore((s) => s.navigate)
  const previous = useAppStore((s) => s.previous)
  const isEdit = mode === 'edit'
  const back = (): void => navigate(previous ?? { name: 'settings', tab: 'learning' })

  return (
    <Shell
      title={isEdit ? '학습 성향' : '시작하기'}
      onBack={isEdit ? back : undefined}
      testId="onboarding-page"
    >
      <SurveyFlow
        mode={mode}
        initialAnswers={isEdit ? profile?.answers : undefined}
        onSaved={() => navigate(isEdit ? { name: 'settings', tab: 'learning' } : { name: 'provider' })}
        onCancel={isEdit ? back : undefined}
      />
    </Shell>
  )
}
