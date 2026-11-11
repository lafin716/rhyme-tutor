import type { ReactNode } from 'react'
import { IconButton } from './ui'

interface ShellProps {
  title: string
  onBack?: () => void
  actions?: ReactNode
  children: ReactNode
  testId?: string
}

/** Page frame: sticky header + scrollable body. */
export function Shell({ title, onBack, actions, children, testId }: ShellProps) {
  return (
    <div className="flex h-full flex-col" data-testid={testId}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
        {onBack && <IconButton label="뒤로" icon="chevron-left" onClick={onBack} data-testid="back-button" />}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{title}</h1>
        {actions}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
