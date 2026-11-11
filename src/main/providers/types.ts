/**
 * AI provider contract (leader-owned). Implemented by ClaudeCodeProvider, CodexProvider, MockProvider.
 * Providers are STATELESS w.r.t. learning data: every call receives the full, already-built context.
 * Provider-internal sessions are never relied upon (Claude: --no-session-persistence, Codex: --ephemeral).
 */
import type { AppErrorCode, ProviderCapabilities, ProviderId, ProviderInfo } from '@shared/domain'

/** What the call is for. Used for logging/metrics and by MockProvider to return deterministic, schema-valid output. */
export type CompletionTask = 'chat' | 'curriculum' | 'quiz' | 'summary' | 'ping'

export interface CompletionRequest {
  task: CompletionTask
  /** System / tutor instructions (sections already joined by the PromptBuilder). */
  system: string
  /** The user-turn prompt (conversation transcript + task). Delivered via stdin, never argv / shell. */
  prompt: string
  /** Optional validated model alias. */
  model?: string | null
  /** Hard timeout in ms; provider kills the process tree on expiry. */
  timeoutMs: number
  /** Abort -> provider kills the process and rejects with ProviderError('PROVIDER_CANCELLED'). */
  signal: AbortSignal
  /** Called with incremental text. Providers without token streaming call it once with the full text. */
  onDelta?: (text: string) => void
}

export interface CompletionResult {
  text: string
  durationMs: number
}

export class ProviderError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface AIProvider {
  readonly id: ProviderId
  readonly displayName: string
  readonly capabilities: ProviderCapabilities
  /** Detect install + auth via official commands only (e.g. `claude auth status`, `codex login status`). Never reads credential files. */
  detect(): Promise<ProviderInfo>
  /** Runs one completion. Must resolve/reject exactly once and leave no child process behind. */
  complete(req: CompletionRequest): Promise<CompletionResult>
}

export interface ProviderRegistry {
  get(id: ProviderId): AIProvider
  detectAll(): Promise<ProviderInfo[]>
}

/** Minimal logger injected by main. Never log prompts, model output bodies, env, or credentials. */
export type ProviderLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void

export interface ProviderRegistryOptions {
  /** App-owned directory for per-call scratch dirs (system prompt files, empty cwd). */
  tempRoot: string
  log: ProviderLogger
  /** Mock per-chunk delay in ms (default 15; E2E may set via TUTOR_MOCK_DELAY_MS). */
  mockDelayMs?: number
}

/** Implemented in ./registry.ts: `export function createProviderRegistry(opts: ProviderRegistryOptions): ProviderRegistry` */
export type CreateProviderRegistry = (opts: ProviderRegistryOptions) => ProviderRegistry
