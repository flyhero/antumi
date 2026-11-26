import { describe, expect, it } from 'vitest'
import { chatDeliveryStatus } from './chat-delivery-status'
import type { ChatRecord } from './chat-driver'

describe('chat delivery status', () => {
  it('allows a clearly rejected attempt to become confirmed after retry', () => {
    const records: ChatRecord[] = [
      { dir: 'out', at: 1, frame: {}, ref: 'retry' },
      { dir: 'undelivered', at: 2, ref: 'retry' },
      { dir: 'out', at: 3, frame: {}, ref: 'retry' },
      { dir: 'receipt', at: 4, ref: 'retry' }
    ]
    expect(chatDeliveryStatus(records.slice(0, 2), 'retry')).toBe('undelivered')
    expect(chatDeliveryStatus(records.slice(0, 3), 'retry')).toBe('uncertain')
    expect(chatDeliveryStatus(records, 'retry')).toBe('submitted')
  })

  it('keeps a confirmation despite a late failure marker until a new attempt begins', () => {
    const records: ChatRecord[] = [
      { dir: 'out', at: 1, frame: {}, ref: 'once' },
      { dir: 'receipt', at: 2, ref: 'once' },
      { dir: 'undelivered', at: 3, ref: 'once' },
      { dir: 'out', at: 4, frame: {}, ref: 'once' },
      { dir: 'undelivered', at: 5, ref: 'other' }
    ]
    expect(chatDeliveryStatus(records.slice(0, 3), 'once')).toBe('submitted')
    expect(chatDeliveryStatus(records, 'once')).toBe('uncertain')
    expect(chatDeliveryStatus(records, 'other')).toBe('undelivered')
    expect(chatDeliveryStatus(records, 'missing')).toBeNull()
  })
})
