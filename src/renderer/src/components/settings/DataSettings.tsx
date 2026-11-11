import { useState } from 'react'
import type { AppErrorPayload, ExportResult } from '@shared/domain'
import { useAppStore } from '../../store/app-store'
import { run } from '../../lib/result'
import { formatBytes } from '../../lib/format'
import { Button, ErrorNotice } from '../ui'
import { Icon } from '../icons'
import { CourseManager } from './CourseManager'

/** Data folder, export, and per-course management. */
export function DataSettings() {
  const dataDir = useAppStore((s) => s.dataDir)
  const notify = useAppStore((s) => s.notify)
  const [opening, setOpening] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [error, setError] = useState<AppErrorPayload | null>(null)

  async function openFolder(): Promise<void> {
    setOpening(true)
    setError(null)
    const res = await run(() => window.tutor.app.openDataDir())
    setOpening(false)
    if (!res.ok) {
      setError(res.error)
      notify(res.error.message, 'error')
    }
  }

  async function exportData(): Promise<void> {
    setExporting(true)
    setError(null)
    const res = await run(() => window.tutor.app.exportData())
    setExporting(false)
    if (!res.ok) {
      setError(res.error)
      notify(res.error.message, 'error')
      return
    }
    // null = the learner cancelled the save dialog; show nothing in that case.
    if (res.data) {
      setExported(res.data)
      notify('데이터를 내보냈어요.', 'success')
    }
  }

  return (
    <section aria-labelledby="data-settings-title" data-testid="data-settings" className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 id="data-settings-title" className="text-base font-semibold text-ink">
          데이터 폴더와 내보내기
        </h2>
        <p className="break-all text-sm text-ink-2" data-testid="data-dir">
          {dataDir ?? '데이터 위치를 확인하고 있어요.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            data-testid="data-open-folder"
            onClick={() => void openFolder()}
            disabled={opening || dataDir === null}
          >
            <Icon name="folder" size={16} />
            {opening ? '여는 중…' : '데이터 폴더 열기'}
          </Button>
          <Button variant="secondary" data-testid="data-export" onClick={() => void exportData()} disabled={exporting}>
            <Icon name="download" size={16} />
            {exporting ? '내보내는 중…' : '데이터 내보내기'}
          </Button>
        </div>
        {exported && (
          <p role="status" className="text-sm text-success" data-testid="data-export-result">
            저장했어요: <span className="break-all font-mono text-xs">{exported.filePath}</span> ({formatBytes(exported.bytes)})
          </p>
        )}
        {error && <ErrorNotice error={error} testId="data-error" />}
      </div>

      <CourseManager />
    </section>
  )
}
