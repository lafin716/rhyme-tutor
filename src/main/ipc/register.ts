/**
 * Registers the handler table on ipcMain. Kept free of the `electron` import so tests can drive it with a fake
 * ipcMain. Every listener checks the sender before running, and every listener resolves to a Result envelope.
 */
import type { Result } from '@shared/domain'
import type { ProviderLogger } from '../providers/types'
import { runSafely, type HandlerFn, type IpcChannelName } from './handlers'

/** Structural subset of the Electron IpcMainInvokeEvent that we rely on. */
export interface IpcInvokeEventLike {
  senderFrame?: { url?: string } | null
}

/** Structural subset of Electron's ipcMain used here. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcInvokeEventLike, ...args: unknown[]) => unknown): void
  removeHandler?(channel: string): void
}

export interface RegisterOptions {
  /** Returns true only for the app's own renderer (see src/main/index.ts). */
  isTrustedSender: (event: IpcInvokeEventLike) => boolean
  log: ProviderLogger
}

export const UNTRUSTED_SENDER_MESSAGE = '허용되지 않은 요청이에요.'

export function registerIpc(
  ipcMain: IpcMainLike,
  handlers: Record<IpcChannelName, HandlerFn>,
  opts: RegisterOptions
): IpcChannelName[] {
  const channels = Object.keys(handlers) as IpcChannelName[]
  for (const channel of channels) {
    const handler = handlers[channel]
    ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
      if (!opts.isTrustedSender(event)) {
        opts.log('warn', 'rejected ipc from untrusted sender', { channel })
        return { ok: false, error: { code: 'VALIDATION', message: UNTRUSTED_SENDER_MESSAGE, retryable: false } }
      }
      return runSafely(channel, opts.log, () => handler(...args))
    })
  }
  return channels
}
