import { describe, expect, it } from 'vitest'
import { AppSettingsSchema, MODEL_ALIAS_RE } from '@shared/domain'

/** Provider (resolve.ts), settings schema and settings UI all use MODEL_ALIAS_RE; keep them in agreement. */
describe('MODEL_ALIAS_RE', () => {
  it.each(['sonnet', 'claude-opus-5-5', 'gpt-5.4', 'sonnet[1m]', 'a:b_c'])('accepts %s', (alias) => {
    expect(MODEL_ALIAS_RE.test(alias)).toBe(true)
  })

  it.each(['', '-m', '--help', 'a b', 'a;b', 'a&b', 'a"b', 'x'.repeat(65)])('rejects %j', (alias) => {
    expect(MODEL_ALIAS_RE.test(alias)).toBe(false)
  })

  it('settings schema rejects a leading-dash alias the provider would reject', () => {
    const shape = AppSettingsSchema.shape
    expect(shape.claudeModel.safeParse('-m').success).toBe(false)
    expect(shape.codexModel.safeParse('sonnet[1m]').success).toBe(true)
  })
})
