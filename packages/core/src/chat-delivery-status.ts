import type { ChatRecord } from './chat-driver'

// An absent receipt is uncertain, including logs written before receipts were kept.
export function chatDeliveryStatus(records: readonly ChatRecord[], ref: string): 'submitted' | 'uncertain' | 'undelivered' | null {
  let status: ReturnType<typeof chatDeliveryStatus> = null
  for (const record of records) {
    if (record.dir === 'out' && record.ref === ref) status = 'uncertain'
    else if (record.dir === 'receipt' && record.ref === ref) status = 'submitted'
    // A late error cannot undo this attempt's confirmation. A later out starts a new attempt.
    else if (record.dir === 'undelivered' && record.ref === ref && status !== 'submitted') status = 'undelivered'
  }
  return status
}
