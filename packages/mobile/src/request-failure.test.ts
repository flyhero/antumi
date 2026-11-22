import { describe, expect, it } from 'vitest'
import { RpcError } from '@antumi/protocol'
import { z } from 'zod'
import { t } from './i18n'
import { requestFailure } from './request-failure'

describe('mobile request failures', () => {
  it('shows a short compatibility message instead of raw validation issues', () => {
    const result = z.object({ agent: z.enum(['codex']) }).safeParse({ agent: 'future-agent' })
    if (result.success) throw new Error('expected invalid response')
    expect(requestFailure(result.error)).toBe(t('incompatibleResponse'))
    expect(requestFailure(result.error)).not.toContain('invalid_value')
  })

  it('preserves the message for a request answered on another device', () => {
    expect(requestFailure(new RpcError('already answered', -32000, 'chat-request-gone'))).toBe(t('requestGone'))
  })

  it('keeps ordinary server and transport errors readable', () => {
    expect(requestFailure(new RpcError('not allowed', -32000, 'mobile-not-allowed'))).toBe(t('error', { message: 'not allowed' }))
    expect(requestFailure(new Error('connection closed'))).toBe(t('error', { message: 'connection closed' }))
  })
})
