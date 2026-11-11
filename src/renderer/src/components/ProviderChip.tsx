import type { ProviderId } from '@shared/domain'
import { useAppStore } from '../store/app-store'
import { Icon } from './icons'

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  mock: '체험(데모)'
}

/** Shows the active AI provider. Clicking opens provider settings. */
export function ProviderChip() {
  const active = useAppStore((s) => s.settings.activeProvider)
  const navigate = useAppStore((s) => s.navigate)
  const label = active ? PROVIDER_LABEL[active] : 'AI 미선택'
  return (
    <button
      type="button"
      data-testid="provider-chip"
      onClick={() => navigate({ name: 'settings', tab: 'provider' })}
      aria-label={`AI 제공자: ${label}. 설정 열기`}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-2 hover:text-ink"
    >
      <Icon name="terminal" size={14} />
      <span>{label}</span>
    </button>
  )
}
