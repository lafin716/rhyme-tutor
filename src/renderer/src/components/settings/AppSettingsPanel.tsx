import { useState } from 'react'
import type { AppErrorPayload, Theme } from '@shared/domain'
import { useAppStore } from '../../store/app-store'
import { applyTheme } from '../../lib/theme'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { ErrorNotice, Toggle } from '../ui'

const THEMES: { value: Theme; label: string; icon: IconName | null }[] = [
  { value: 'system', label: '시스템 설정 따르기', icon: null },
  { value: 'light', label: '밝게', icon: 'sun' },
  { value: 'dark', label: '어둡게', icon: 'moon' }
]

/** App-wide preferences. Theme is applied to <html> immediately after the change is saved. */
export function AppSettingsPanel() {
  const theme = useAppStore((s) => s.settings.theme)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const notify = useAppStore((s) => s.notify)
  const version = useAppStore((s) => s.version)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)

  async function choose(next: Theme): Promise<void> {
    if (next === theme || saving) return
    setSaving(true)
    setError(null)
    const res = await saveSettings({ theme: next })
    setSaving(false)
    if (res.ok) {
      applyTheme(res.data.theme)
    } else {
      setError(res.error)
      notify(res.error.message, 'error')
    }
  }

  return (
    <section aria-labelledby="app-settings-title" data-testid="app-settings" className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id="app-settings-title" className="text-base font-semibold text-ink">
          화면 테마
        </h2>
        <p className="text-sm text-ink-2">밝은 화면과 어두운 화면 중 편한 쪽을 고르세요.</p>
        <div role="group" aria-label="화면 테마" className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <Toggle key={t.value} pressed={theme === t.value} onClick={() => void choose(t.value)} testId={`theme-${t.value}`}>
              <span className="inline-flex items-center gap-1.5">
                {t.icon && <Icon name={t.icon} size={16} />}
                {t.label}
              </span>
            </Toggle>
          ))}
        </div>
        {error && <ErrorNotice error={error} testId="app-theme-error" />}
      </div>

      <div className="space-y-1 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
        <h2 className="text-base font-semibold text-ink">정보</h2>
        <p data-testid="app-version">버전 {version ?? '확인 중'}</p>
      </div>
    </section>
  )
}
