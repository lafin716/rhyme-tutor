import { useCallback, useEffect, useState } from 'react'
import type { AppErrorPayload, ProviderId, ProviderInfo } from '@shared/domain'
import { run } from './result'
import { useAppStore } from '../store/app-store'

export type TestOutcome = { kind: 'ok'; latencyMs: number; sample: string } | { kind: 'error'; error: AppErrorPayload }

/** Provider detection, selection and connection test. Shared by onboarding setup and settings. */
export function useProviders() {
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [detectError, setDetectError] = useState<AppErrorPayload | null>(null)
  const [testingId, setTestingId] = useState<ProviderId | null>(null)
  const [selectingId, setSelectingId] = useState<ProviderId | null>(null)
  const [tests, setTests] = useState<Partial<Record<ProviderId, TestOutcome>>>({})
  const [selectError, setSelectError] = useState<AppErrorPayload | null>(null)
  const setSettings = useAppStore((s) => s.setSettings)
  const notify = useAppStore((s) => s.notify)

  const detect = useCallback(async () => {
    setLoading(true)
    const res = await run(() => window.tutor.providers.detect())
    if (res.ok) {
      setProviders(res.data)
      setDetectError(null)
    } else {
      setDetectError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void detect()
  }, [detect])

  const test = useCallback(
    async (id: ProviderId) => {
      setTestingId(id)
      const res = await run(() => window.tutor.providers.test(id))
      setTests((prev) => ({
        ...prev,
        [id]: res.ok ? { kind: 'ok', latencyMs: res.data.latencyMs, sample: res.data.sample } : { kind: 'error', error: res.error }
      }))
      setTestingId(null)
    },
    []
  )

  const select = useCallback(
    async (id: ProviderId) => {
      setSelectingId(id)
      setSelectError(null)
      const res = await run(() => window.tutor.providers.select(id))
      setSelectingId(null)
      if (res.ok) {
        setSettings(res.data)
        notify('AI 제공자를 선택했어요.', 'success')
      } else {
        setSelectError(res.error)
      }
      return res.ok
    },
    [notify, setSettings]
  )

  return { loading, providers, detectError, detect, testingId, selectingId, tests, test, select, selectError }
}
