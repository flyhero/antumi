import { t } from './i18n'
import { currentShortcutLabel } from './keyboard-shortcuts'

type ComposerKeys = { send: string; steer: string; interrupt: string }

export function workingPlaceholder({ awaiting, queueable, steerable }: { awaiting: boolean; queueable: boolean; steerable: boolean }, keys: ComposerKeys = {
  send: currentShortcutLabel('send-message'), steer: currentShortcutLabel('steer-message'), interrupt: currentShortcutLabel('interrupt-turn')
}): string {
  if (!queueable && awaiting) return t('composerPlaceholder.answerTheRequestAboveFirst')
  const interrupt = keys.interrupt ? t('composerPlaceholder.interruptKey', { keys: keys.interrupt }) : ''
  if (!queueable) return t('composerPlaceholder.workingWithKeys', { interrupt })
  return t('composerPlaceholder.queueWithKeys', {
    prefix: awaiting ? t('composerPlaceholder.answerTheRequestAboveFirst_2252') : '',
    send: keys.send ? t('composerPlaceholder.queueKey', { keys: keys.send }) : '',
    steer: steerable && keys.steer ? t('composerPlaceholder.steerKey', { keys: keys.steer }) : '', interrupt
  })
}
