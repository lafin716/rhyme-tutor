import type { ProviderId } from '@shared/domain'
import { useAppStore } from '../store/app-store'
import { useProviders } from '../lib/use-providers'
import { Shell } from '../components/Shell'
import { ProviderList } from '../components/ProviderList'
import { Button, ErrorNotice, Spinner } from '../components/ui'

export function ProviderSetupPage() {
  const navigate = useAppStore((s) => s.navigate)
  const activeProvider = useAppStore((s) => s.settings.activeProvider)
  const p = useProviders()

  async function choose(id: ProviderId): Promise<void> {
    const ok = await p.select(id)
    if (ok) navigate({ name: 'dashboard' })
  }

  return (
    <Shell title="AI 제공자 연결" testId="provider-setup-page">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
          <p className="font-medium text-ink">API 키는 이 앱에 입력하지 않아요.</p>
          <p>
            사용할 AI 도구를 여러분의 터미널에서 직접 로그인해 주세요. 로그인 정보는 도구가 관리하고, 이 앱은 읽지 않아요.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Claude Code: 터미널에서 <code className="font-mono text-ink">claude</code> 를 실행해 로그인
            </li>
            <li>
              Codex CLI: 터미널에서 <code className="font-mono text-ink">codex login</code> 을 실행
            </li>
          </ul>
          <p>준비가 끝나면 “다시 검사”를 누르세요. 아직 준비가 안 됐다면 체험(데모) 모드로 먼저 살펴볼 수 있어요. 체험 모드의 답변은 샘플이에요.</p>
        </section>

        {p.loading && <Spinner label="설치된 도구를 확인하고 있어요" />}

        {p.detectError && (
          <ErrorNotice
            error={p.detectError}
            onRetry={() => void p.detect()}
            busy={p.loading}
            testId="provider-detect-error"
          />
        )}

        {!p.loading && !p.detectError && p.providers.length === 0 && (
          <p className="text-sm text-ink-2" data-testid="provider-empty">
            확인할 수 있는 AI 제공자가 없어요.
          </p>
        )}

        {!p.loading && !p.detectError && p.providers.length > 0 && (
          <ProviderList
            providers={p.providers}
            activeProvider={activeProvider}
            tests={p.tests}
            testingId={p.testingId}
            selectingId={p.selectingId}
            onTest={(id) => void p.test(id)}
            onSelect={(id) => void choose(id)}
          />
        )}

        {p.selectError && <ErrorNotice error={p.selectError} testId="provider-select-error" />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            data-testid="provider-recheck"
            onClick={() => void p.detect()}
            disabled={p.loading || p.testingId !== null || p.selectingId !== null}
          >
            다시 검사
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" data-testid="provider-later" onClick={() => navigate({ name: 'dashboard' })}>
              나중에 설정하기
            </Button>
            <Button
              variant="secondary"
              data-testid="provider-continue-mock"
              onClick={() => void choose('mock')}
              disabled={p.selectingId !== null}
            >
              체험 모드로 둘러보기
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  )
}
