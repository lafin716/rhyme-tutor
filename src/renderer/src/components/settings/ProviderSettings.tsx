import { useState } from 'react'
import { MODEL_ALIAS_RE, type AppErrorPayload } from '@shared/domain'

import { useAppStore } from '../../store/app-store'
import { useProviders } from '../../lib/use-providers'
import { ProviderList } from '../ProviderList'
import { Button, ErrorNotice, Spinner, inputClass } from '../ui'

const TIMEOUT_MIN = 30
const TIMEOUT_MAX = 900

/** Returns a Korean validation message, or null when the model alias is acceptable (empty = CLI default). */
function modelError(value: string): string | null {
  if (value.length === 0) return null
  return MODEL_ALIAS_RE.test(value) ? null : '영문, 숫자, 점(.), 밑줄(_), 콜론(:), 하이픈(-), 대괄호([ ])만 1~64자로 입력해 주세요. 하이픈(-)으로 시작할 수 없어요.'
}

function timeoutError(value: string): string | null {
  const n = Number(value)
  if (value.trim().length === 0 || !Number.isInteger(n)) return '정수로 입력해 주세요.'
  if (n < TIMEOUT_MIN || n > TIMEOUT_MAX) return `${TIMEOUT_MIN}~${TIMEOUT_MAX}초 사이로 입력해 주세요.`
  return null
}

/** AI provider detection, selection, model aliases and per-request timeout. */
export function ProviderSettings() {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const notify = useAppStore((s) => s.notify)
  const p = useProviders()
  const [claudeModel, setClaudeModel] = useState(settings.claudeModel ?? '')
  const [codexModel, setCodexModel] = useState(settings.codexModel ?? '')
  const [timeout, setTimeoutValue] = useState(String(settings.requestTimeoutSec))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppErrorPayload | null>(null)

  const claudeErr = modelError(claudeModel.trim())
  const codexErr = modelError(codexModel.trim())
  const timeErr = timeoutError(timeout)
  const invalid = claudeErr !== null || codexErr !== null || timeErr !== null

  async function save(): Promise<void> {
    if (invalid) return
    setSaving(true)
    setSaveError(null)
    const res = await saveSettings({
      claudeModel: claudeModel.trim() === '' ? null : claudeModel.trim(),
      codexModel: codexModel.trim() === '' ? null : codexModel.trim(),
      requestTimeoutSec: Number(timeout)
    })
    setSaving(false)
    if (res.ok) notify('AI 설정을 저장했어요.', 'success')
    else setSaveError(res.error)
  }

  return (
    <section aria-labelledby="provider-settings-title" data-testid="provider-settings" className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="provider-settings-title" className="text-base font-semibold text-ink">
            설치된 AI 도구
          </h2>
          <Button size="sm" variant="secondary" data-testid="settings-provider-recheck" onClick={() => void p.detect()} disabled={p.loading}>
            다시 검사
          </Button>
        </div>

        {p.loading && <Spinner label="설치된 도구를 확인하고 있어요" />}
        {p.detectError && (
          <ErrorNotice error={p.detectError} onRetry={() => void p.detect()} busy={p.loading} testId="settings-provider-detect-error" />
        )}
        {!p.loading && !p.detectError && p.providers.length === 0 && (
          <p className="text-sm text-ink-2" data-testid="settings-provider-empty">
            확인할 수 있는 AI 제공자가 없어요.
          </p>
        )}
        {!p.loading && !p.detectError && p.providers.length > 0 && (
          <ProviderList
            providers={p.providers}
            activeProvider={settings.activeProvider}
            tests={p.tests}
            testingId={p.testingId}
            selectingId={p.selectingId}
            onTest={(id) => void p.test(id)}
            onSelect={(id) => void p.select(id)}
          />
        )}
        {p.selectError && <ErrorNotice error={p.selectError} testId="settings-provider-select-error" />}
      </div>

      <form
        noValidate
        className="space-y-4 rounded-2xl border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        data-testid="provider-settings-form"
      >
        <h2 className="text-base font-semibold text-ink">실행 옵션</h2>

        <div className="space-y-1.5">
          <label htmlFor="settings-claude-model" className="text-sm font-medium text-ink">
            Claude 모델 별칭
          </label>
          <input
            id="settings-claude-model"
            data-testid="settings-claude-model"
            className={inputClass}
            value={claudeModel}
            placeholder="비워 두면 CLI 기본 모델을 사용해요"
            maxLength={64}
            aria-invalid={claudeErr !== null}
            aria-describedby="settings-claude-model-help"
            onChange={(e) => setClaudeModel(e.target.value)}
          />
          <p id="settings-claude-model-help" className="text-xs text-ink-3" data-testid="settings-claude-model-error">
            {claudeErr ?? '영문, 숫자, . _ : - 만 사용할 수 있어요.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-codex-model" className="text-sm font-medium text-ink">
            Codex 모델 별칭
          </label>
          <input
            id="settings-codex-model"
            data-testid="settings-codex-model"
            className={inputClass}
            value={codexModel}
            placeholder="비워 두면 CLI 기본 모델을 사용해요"
            maxLength={64}
            aria-invalid={codexErr !== null}
            aria-describedby="settings-codex-model-help"
            onChange={(e) => setCodexModel(e.target.value)}
          />
          <p id="settings-codex-model-help" className="text-xs text-ink-3" data-testid="settings-codex-model-error">
            {codexErr ?? '영문, 숫자, . _ : - 만 사용할 수 있어요.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="settings-timeout" className="text-sm font-medium text-ink">
            응답 제한 시간 (초)
          </label>
          <input
            id="settings-timeout"
            data-testid="settings-timeout"
            type="number"
            inputMode="numeric"
            min={TIMEOUT_MIN}
            max={TIMEOUT_MAX}
            step={1}
            className={inputClass}
            value={timeout}
            aria-invalid={timeErr !== null}
            aria-describedby="settings-timeout-help"
            onChange={(e) => setTimeoutValue(e.target.value)}
          />
          <p
            id="settings-timeout-help"
            className={timeErr ? 'text-xs text-danger' : 'text-xs text-ink-3'}
            data-testid="settings-timeout-error"
          >
            {timeErr ?? `${TIMEOUT_MIN}~${TIMEOUT_MAX}초 사이로 설정할 수 있어요.`}
          </p>
        </div>

        {saveError && <ErrorNotice error={saveError} testId="settings-save-error" />}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 rounded-b-2xl border-t border-line bg-surface px-5 py-3">
          <p className="text-xs text-ink-3">{invalid ? '입력값을 확인한 뒤 저장할 수 있어요.' : '변경한 내용은 저장 버튼을 눌러야 적용돼요.'}</p>
          <Button type="submit" variant="primary" data-testid="settings-save" disabled={invalid || saving}>
            {saving ? '저장하는 중…' : '저장'}
          </Button>
        </div>
      </form>
    </section>
  )
}
