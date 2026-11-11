/**
 * Provider registry: one instance per provider id. detectAll() never rejects, so one broken CLI
 * cannot hide the others.
 */
import type { ProviderId, ProviderInfo } from '@shared/domain'
import { createClaudeCodeProvider } from './claude-code'
import { createCodexProvider } from './codex'
import { createMockProvider } from './mock'
import { ProviderError, type AIProvider, type CreateProviderRegistry, type ProviderRegistry } from './types'

const ORDER: readonly ProviderId[] = ['claude-code', 'codex', 'mock']

export const createProviderRegistry: CreateProviderRegistry = (opts): ProviderRegistry => {
  const providers: Record<ProviderId, AIProvider> = {
    'claude-code': createClaudeCodeProvider({ tempRoot: opts.tempRoot, log: opts.log }),
    codex: createCodexProvider({ tempRoot: opts.tempRoot, log: opts.log }),
    mock: createMockProvider({ log: opts.log, mockDelayMs: opts.mockDelayMs })
  }

  return {
    get(id: ProviderId): AIProvider {
      const p = providers[id]
      if (!p) throw new ProviderError('PROVIDER_NOT_SELECTED', '알 수 없는 AI 제공자예요.', `id=${String(id)}`)
      return p
    },

    async detectAll(): Promise<ProviderInfo[]> {
      return Promise.all(
        ORDER.map(async (id): Promise<ProviderInfo> => {
          const p = providers[id]
          try {
            return await p.detect()
          } catch (err) {
            opts.log('warn', 'provider detect threw', { id, reason: err instanceof Error ? err.name : 'unknown' })
            return {
              id,
              displayName: p.displayName,
              experimental: id !== 'mock',
              installed: false,
              executablePath: null,
              version: null,
              authenticated: null,
              ready: false,
              message: '상태를 확인하지 못했어요. 다시 시도해 주세요.',
              capabilities: p.capabilities
            }
          }
        })
      )
    }
  }
}
