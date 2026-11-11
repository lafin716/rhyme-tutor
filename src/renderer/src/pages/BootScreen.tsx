import { Spinner } from '../components/ui'

export function BootScreen() {
  return (
    <main
      data-testid="boot-screen"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-ink"
    >
      <p className="text-lg font-semibold">AI 개인 튜터</p>
      <Spinner label="준비하고 있어요" />
    </main>
  )
}
