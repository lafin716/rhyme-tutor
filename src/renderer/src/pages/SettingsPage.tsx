import { useAppStore } from '../store/app-store'
import type { SettingsTab } from '../store/app-store'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { ProviderSettings } from '../components/settings/ProviderSettings'
import { LearningSettings } from '../components/settings/LearningSettings'
import { AppSettingsPanel } from '../components/settings/AppSettingsPanel'
import { DataSettings } from '../components/settings/DataSettings'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'provider', label: 'AI 제공자' },
  { id: 'learning', label: '학습 성향' },
  { id: 'app', label: '앱 설정' },
  { id: 'data', label: '데이터 관리' }
]

interface SettingsPageProps {
  tab: SettingsTab
}

/** Settings with four tabs. "Back" returns to the page the learner came from. */
export function SettingsPage({ tab }: SettingsPageProps) {
  const navigate = useAppStore((s) => s.navigate)
  const previous = useAppStore((s) => s.previous)

  function goBack(): void {
    navigate(previous ?? { name: 'dashboard' })
  }

  return (
    <Shell title="설정" onBack={goBack} testId="settings-page">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div role="tablist" aria-label="설정 메뉴" className="flex flex-wrap gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              data-testid={`settings-tab-${t.id}`}
              onClick={() => navigate({ name: 'settings', tab: t.id })}
              className={cx(
                'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} className="space-y-6">
          {tab === 'provider' && <ProviderSettings />}
          {tab === 'learning' && <LearningSettings />}
          {tab === 'app' && <AppSettingsPanel />}
          {tab === 'data' && <DataSettings />}
        </div>
      </div>
    </Shell>
  )
}
