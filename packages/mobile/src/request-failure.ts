import { RpcError } from '@antumi/protocol'
import { ZodError } from 'zod'
import { t } from './i18n'

export function requestFailure(error: unknown): string {
  if (error instanceof ZodError) return t('incompatibleResponse')
  if (error instanceof RpcError && error.reason === 'chat-request-gone') return t('requestGone')
  return t('error', { message: error instanceof Error ? error.message : String(error) })
}
