import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chat-store'
import { Button, ErrorNotice, Spinner } from '../ui'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'

/** Auto-scroll only while the learner is near the bottom, so reading older messages is never interrupted. */
const NEAR_BOTTOM_PX = 96

interface ChatPanelProps {
  tutorName: string
  lessonReady: boolean
  busy: boolean
}

export function ChatPanel({ tutorName, lessonReady, busy }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages)
  const hasMore = useChatStore((s) => s.hasMore)
  const loadingOlder = useChatStore((s) => s.loadingOlder)
  const error = useChatStore((s) => s.error)
  const loadOlder = useChatStore((s) => s.loadOlder)
  const send = useChatStore((s) => s.send)
  const startLesson = useChatStore((s) => s.startLesson)
  const cancel = useChatStore((s) => s.cancel)
  const retry = useChatStore((s) => s.retry)
  const clearError = useChatStore((s) => s.clearError)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  // Reuse the same clientMessageId while the same text is retried after a failure (idempotent send).
  const pendingRef = useRef<{ content: string; id: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const hasChat = messages.some((m) => m.kind === 'chat')

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function onScroll(): void {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  function onLoadOlder(): void {
    const el = scrollRef.current
    const before = el?.scrollHeight ?? 0
    stickRef.current = false
    void loadOlder().then(() => {
      // Keep the viewport on the same message after older history is prepended.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before
      })
    })
  }

  async function submit(content: string): Promise<boolean> {
    const pending = pendingRef.current
    const id = pending && pending.content === content ? pending.id : crypto.randomUUID()
    pendingRef.current = { content, id }
    stickRef.current = true
    const res = await send(content, id)
    if (res.ok) pendingRef.current = null
    return res.ok
  }

  async function onStart(): Promise<void> {
    setStarting(true)
    stickRef.current = true
    await startLesson()
    setStarting(false)
  }

  async function onRetry(messageId: string): Promise<void> {
    setRetryingId(messageId)
    await retry(messageId)
    setRetryingId(null)
  }

  async function onCancel(): Promise<void> {
    setCancelling(true)
    await cancel()
    setCancelling(false)
  }

  return (
    <section aria-label="대화" data-testid="chat-panel" className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-testid="chat-scroll"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      >
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <Button size="sm" variant="ghost" data-testid="chat-load-older" onClick={onLoadOlder} disabled={loadingOlder}>
              {loadingOlder ? '불러오는 중…' : '이전 대화 더 보기'}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-2" data-testid="chat-empty">
            아직 대화가 없어요. 수업을 시작하면 {tutorName} 튜터가 먼저 설명을 시작해요.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((m) => {
            const failed = m.role === 'tutor' && (m.status === 'error' || m.status === 'cancelled')
            return (
              <MessageBubble
                key={m.id}
                message={m}
                tutorName={tutorName}
                onRetry={failed ? () => void onRetry(m.id) : undefined}
                retrying={retryingId === m.id}
              />
            )
          })}
        </div>
      </div>

      {busy && (
        <div
          data-testid="chat-busy"
          className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2 sm:px-6"
        >
          <Spinner label="응답 생성 중" />
          <Button size="sm" variant="ghost" data-testid="chat-cancel" onClick={() => void onCancel()} disabled={cancelling}>
            중단
          </Button>
        </div>
      )}

      {error && (
        <div className="flex shrink-0 items-start gap-2 px-4 pt-2 sm:px-6">
          <div className="min-w-0 flex-1">
            <ErrorNotice error={error} testId="chat-error" />
          </div>
          <Button size="sm" variant="ghost" data-testid="chat-error-dismiss" onClick={clearError}>
            닫기
          </Button>
        </div>
      )}

      {!busy && (
        <div className="flex shrink-0 justify-end px-4 pt-2 sm:px-6">
          <Button
            size="sm"
            variant="secondary"
            data-testid="chat-start-lesson"
            onClick={() => void onStart()}
            disabled={!lessonReady || starting}
          >
            {starting ? '시작하는 중…' : hasChat ? '이어서 수업하기' : '수업 시작하기'}
          </Button>
        </div>
      )}

      <Composer disabled={busy} onSubmit={submit} />
    </section>
  )
}
