import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from '../../lib/cx'
import { IconButton, inputClass } from '../ui'

const MAX_LENGTH = 8000

interface ComposerProps {
  disabled: boolean
  onSubmit: (content: string) => Promise<boolean>
}

/** Enter sends, Shift+Enter inserts a newline, and IME composition never sends. */
export function Composer({ disabled, onSubmit }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const trimmed = text.trim()
  const canSend = !disabled && !sending && trimmed.length > 0 && trimmed.length <= MAX_LENGTH

  async function send(): Promise<void> {
    if (!canSend) return
    setSending(true)
    const ok = await onSubmit(trimmed)
    setSending(false)
    if (ok) setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void send()
  }

  return (
    <form
      className="shrink-0 border-t border-line bg-surface p-3 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          data-testid="chat-input"
          aria-label="메시지 입력"
          rows={2}
          maxLength={MAX_LENGTH}
          value={text}
          disabled={disabled}
          placeholder={disabled ? '응답이 끝나면 입력할 수 있어요' : '배우면서 궁금한 점을 적어 보세요'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className={cx(inputClass, 'max-h-40 resize-none')}
        />
        <IconButton
          type="submit"
          label="보내기"
          icon="send"
          data-testid="chat-send"
          disabled={!canSend}
          className="h-10 w-10 bg-accent text-accent-ink hover:bg-accent-strong hover:text-accent-ink"
        />
      </div>
      <p className="mt-1 text-xs text-ink-3">Enter 보내기 · Shift+Enter 줄바꿈</p>
    </form>
  )
}
