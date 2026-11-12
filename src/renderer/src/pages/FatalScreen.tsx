import { useAppStore } from '../store/app-store'
import { Button, ErrorNotice } from '../components/ui'

export function FatalScreen() {
  const fatal = useAppStore((s) => s.fatal)
  const boot = useAppStore((s) => s.boot)

  return (
    <main
      data-testid="fatal-screen"
      className="flex h-full flex-col items-center justify-center gap-5 bg-canvas p-6 text-ink"
    >
      <h1 className="text-xl font-semibold">앱을 시작하지 못했어요</h1>
      <p className="max-w-md text-center text-sm text-ink-2">
        잠시 후 다시 시도해 주세요. 계속 같은 문제가 생기면 데이터 폴더를 확인해 주세요.
      </p>
      {fatal ? (
        <div className="w-full max-w-md">
          <ErrorNotice error={fatal} testId="fatal-error" />
        </div>
      ) : (
        <p className="text-sm text-ink-2">알 수 없는 오류가 발생했어요.</p>
      )}
      <Button variant="primary" data-testid="fatal-retry" onClick={() => void boot()}>
        다시 시도
      </Button>
    </main>
  )
}
