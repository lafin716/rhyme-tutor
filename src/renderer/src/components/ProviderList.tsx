import type { ProviderId, ProviderInfo } from '@shared/domain'
import { PROVIDER_LABEL } from './ProviderChip'
import { Badge, Button, ErrorNotice } from './ui'
import type { TestOutcome } from '../lib/use-providers'

interface ProviderListProps {
  providers: ProviderInfo[]
  activeProvider: ProviderId | null
  tests: Partial<Record<ProviderId, TestOutcome>>
  testingId: ProviderId | null
  selectingId: ProviderId | null
  onTest: (id: ProviderId) => void
  onSelect: (id: ProviderId) => void
}

function authBadge(info: ProviderInfo): { tone: 'success' | 'warn' | 'neutral'; label: string } {
  if (info.authenticated === true) return { tone: 'success', label: '로그인됨' }
  if (info.authenticated === false) return { tone: 'warn', label: '로그인 필요' }
  return { tone: 'neutral', label: '로그인 상태 미확인' }
}

/**
 * Real CLI providers first; the Mock provider sits in its own demo section with sample-answer copy
 * and no install/login badges. Only one row is primary: the recommended one (first ready real CLI,
 * when nothing is active yet).
 */
export function ProviderList({
  providers,
  activeProvider,
  tests,
  testingId,
  selectingId,
  onTest,
  onSelect
}: ProviderListProps) {
  const anyBusy = testingId !== null || selectingId !== null
  const real = providers.filter((p) => p.id !== 'mock')
  const demo = providers.filter((p) => p.id === 'mock')
  const recommendedId =
    activeProvider === null ? (real.find((p) => p.ready)?.id ?? null) : null

  function renderRow(info: ProviderInfo, isDemo: boolean) {
    const active = activeProvider === info.id
    const outcome = tests[info.id]
    const auth = authBadge(info)
    const recommended = info.id === recommendedId
    const selectLabel = active
      ? isDemo
        ? '체험 중'
        : '사용 중'
      : selectingId === info.id
        ? '선택 중…'
        : isDemo
          ? '체험 모드로 사용'
          : '선택'
    return (
      <li
        key={info.id}
        data-testid={`provider-row-${info.id}`}
        data-ready={info.ready}
        data-demo={isDemo || undefined}
        className={
          isDemo
            ? 'flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-dashed border-line bg-surface-2 p-4'
            : 'flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-4'
        }
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{isDemo ? '체험(데모) 모드' : PROVIDER_LABEL[info.id]}</h3>
            {active && <Badge tone="accent" testId={`provider-active-${info.id}`}>{isDemo ? '체험 중' : '사용 중'}</Badge>}
            {recommended && <Badge tone="accent">추천</Badge>}
            {info.experimental && <Badge>실험적</Badge>}
          </div>
          {isDemo ? (
            <p className="text-sm text-ink-2" data-testid="provider-demo-copy">
              설치 없이 화면과 흐름을 살펴볼 수 있어요. 답변은 실제 AI가 만든 것이 아니라 샘플이에요.
            </p>
          ) : (
            <p className="text-sm text-ink-2">{info.message}</p>
          )}
          {!isDemo && (
            <div className="flex flex-wrap gap-2">
              <Badge tone={info.installed ? 'success' : 'danger'} testId={`provider-installed-${info.id}`}>
                {info.installed ? '설치됨' : '설치되지 않음'}
              </Badge>
              {info.installed && info.version && <Badge testId={`provider-version-${info.id}`}>{info.version}</Badge>}
              {info.installed && (
                <Badge tone={auth.tone} testId={`provider-auth-${info.id}`}>
                  {auth.label}
                </Badge>
              )}
            </div>
          )}
          {outcome?.kind === 'ok' && (
            <p role="status" data-testid={`provider-test-result-${info.id}`} className="text-sm font-medium text-success">
              {isDemo ? '샘플 응답 확인 완료' : '연결 확인 완료'} · 응답 {outcome.latencyMs}ms
            </p>
          )}
          {outcome?.kind === 'error' && <ErrorNotice error={outcome.error} testId={`provider-test-error-${info.id}`} />}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="secondary"
            data-testid={`provider-test-${info.id}`}
            onClick={() => onTest(info.id)}
            disabled={!info.installed || anyBusy}
          >
            {testingId === info.id ? '테스트 중…' : isDemo ? '샘플 응답 보기' : '연결 테스트'}
          </Button>
          <Button
            size="sm"
            variant={recommended && !active ? 'primary' : 'secondary'}
            data-testid={`provider-select-${info.id}`}
            onClick={() => onSelect(info.id)}
            disabled={!info.ready || active || anyBusy}
          >
            {selectLabel}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-5" data-testid="provider-list">
      {real.length > 0 && (
        <section aria-labelledby="provider-real-title" className="space-y-3">
          <h3 id="provider-real-title" className="text-sm font-semibold text-ink-2">
            실제 AI 도구
          </h3>
          <ul className="flex flex-col gap-3">{real.map((info) => renderRow(info, false))}</ul>
        </section>
      )}
      {demo.length > 0 && (
        <section aria-labelledby="provider-demo-title" className="space-y-3" data-testid="provider-demo-section">
          <h3 id="provider-demo-title" className="text-sm font-semibold text-ink-2">
            체험(데모) 모드
          </h3>
          <ul className="flex flex-col gap-3">{demo.map((info) => renderRow(info, true))}</ul>
        </section>
      )}
    </div>
  )
}
