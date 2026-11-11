import { isValidElement, useState } from 'react'
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@shared/domain'
import { cx } from '../../lib/cx'
import { errorCopy } from '../../lib/errors'
import { Button } from '../ui'

interface MessageBubbleProps {
  message: ChatMessage
  tutorName: string
  onRetry?: () => void
  retrying?: boolean
}

/** Flattens React children to plain text (used to read code block source). */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-end border-b border-line px-2 py-1">
        <button
          type="button"
          aria-label="코드 복사"
          data-testid="code-copy"
          onClick={() => void copy()}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-ink">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

/** No rehype-raw: raw HTML in tutor output is rendered as text, never as markup. Links are not navigable. */
const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children }) => <CodeBlock code={textOf(children).replace(/\n$/, '')} />,
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  a: ({ children }) => <span className="underline decoration-dotted underline-offset-2">{children}</span>,
  img: ({ alt }) => <span className="text-ink-3">{alt && alt.length > 0 ? alt : '이미지'}</span>
}

export function MessageBubble({ message, tutorName, onRetry, retrying = false }: MessageBubbleProps) {
  if (message.kind === 'notice' || message.role === 'system') {
    return (
      <p className="text-center text-xs text-ink-3" data-testid={`notice-${message.id}`}>
        {message.content}
      </p>
    )
  }

  const learner = message.role === 'learner'
  const streaming = message.status === 'streaming'
  const cancelled = message.status === 'cancelled'
  const failed = message.status === 'error' || cancelled
  const reason = cancelled ? '응답을 중단했어요.' : message.status === 'error' ? errorCopy(message.errorCode) : null

  return (
    <div
      data-testid={`message-${message.role}`}
      data-message-id={message.id}
      data-status={message.status}
      className={cx('flex flex-col gap-1', learner ? 'items-end' : 'items-start')}
    >
      <span className="px-1 text-xs text-ink-3">{learner ? '나' : tutorName}</span>
      <div
        className={cx(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]',
          learner
            ? 'rounded-br-sm whitespace-pre-wrap bg-accent text-accent-ink'
            : 'rounded-bl-sm border border-line bg-surface text-ink',
          streaming && !learner && 'caret'
        )}
      >
        {learner ? (
          message.content
        ) : (
          <div className="space-y-2 break-words [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
            <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {message.content}
            </Markdown>
          </div>
        )}
        {streaming && message.content.length === 0 && <span className="sr-only">응답 생성 중</span>}
      </div>
      {failed && (
        <div
          data-testid={`message-failed-${message.id}`}
          className="flex max-w-[85%] flex-wrap items-center gap-2 text-xs text-danger"
        >
          <span>{reason}</span>
          {onRetry && (
            <Button
              size="sm"
              variant="secondary"
              data-testid={`message-retry-${message.id}`}
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? '다시 시도 중…' : '다시 시도'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
