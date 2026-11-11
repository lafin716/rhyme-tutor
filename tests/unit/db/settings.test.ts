import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings, updateSettings } from '../../../src/main/db/repo-core'
import { DEFAULT_SETTINGS } from '@shared/domain'
import { createHarness, type Harness } from '../support/harness'

let h: Harness
beforeEach(() => {
  h = createHarness()
})
afterEach(async () => {
  await h.close()
})

describe('settings load repair', () => {
  it('resets only an invalid stored key (legacy leading-dash model alias), keeping the rest', () => {
    updateSettings(h.db, { theme: 'dark', claudeModel: 'sonnet' })
    h.db.prepare('UPDATE app_settings SET value_json = ? WHERE key = ?').run(JSON.stringify('-m'), 'claudeModel')
    const s = getSettings(h.db)
    expect(s.theme).toBe('dark')
    expect(s.claudeModel).toBe(DEFAULT_SETTINGS.claudeModel)
  })
})
