/**
 * Global AI concurrency gate (MAX_CONCURRENT_AI_JOBS = 1). Shared by chat replies and background jobs,
 * so at most one provider process runs at a time in the main process.
 */
import { ProviderError } from './providers/types'

export const MAX_CONCURRENT_AI_CALLS = 1

interface Waiter {
  grant: () => void
  cancel: (err: Error) => void
  remove: () => void
}

export class AiSlot {
  private held = 0
  private readonly queue: Waiter[] = []

  constructor(private readonly limit: number = MAX_CONCURRENT_AI_CALLS) {}

  get active(): number {
    return this.held
  }

  get waiting(): number {
    return this.queue.length
  }

  /** Resolves with a release function. Rejects with PROVIDER_CANCELLED if `signal` aborts while waiting. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ProviderError('PROVIDER_CANCELLED', '응답을 취소했어요.'))
        return
      }
      let released = false
      const release = (): void => {
        if (released) return
        released = true
        this.held -= 1
        this.pump()
      }
      const waiter: Waiter = {
        grant: () => {
          this.held += 1
          signal?.removeEventListener('abort', onAbort)
          resolve(release)
        },
        cancel: (err) => {
          signal?.removeEventListener('abort', onAbort)
          reject(err)
        },
        remove: () => {
          const i = this.queue.indexOf(waiter)
          if (i >= 0) this.queue.splice(i, 1)
        }
      }
      const onAbort = (): void => {
        waiter.remove()
        waiter.cancel(new ProviderError('PROVIDER_CANCELLED', '응답을 취소했어요.'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.queue.push(waiter)
      this.pump()
    })
  }

  private pump(): void {
    while (this.held < this.limit && this.queue.length > 0) {
      const next = this.queue.shift()
      next?.grant()
    }
  }
}
