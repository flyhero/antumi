import { useState } from 'react'
import { RpcError, type Conversation } from '@antumi/protocol'
import { composerDraft, EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { useCore } from '../core-store'
import { t } from '../i18n'
import { currentShortcutLabel } from '../keyboard-shortcuts'
import { reasonText } from '../labels'
import type { ManagedInput } from '../managed-input'
import { usePreferences } from '../preferences'
import { sendsMessage, steersMessage } from './ChatComposer'

// Why the message did not go, in words for someone who still holds it.
function refusal(error: unknown): string {
  if (error instanceof RpcError && error.reason === 'chat-no-steer') return t('ManagedComposer.notTaken')
  if (error instanceof RpcError && error.reason) return reasonText(error.reason, error.message)
  return error instanceof Error ? error.message : String(error)
}

// The one thing the user says to a member at work for another conversation: a message into the
// turn it runs. Either send key does it, as there is no other way for it to go. Refused (the turn
// just ended, say), the words stay in the input with the reason under them.
export function ManagedComposer({ conversation, way }: { conversation: Conversation; way: ManagedInput }) {
  const { id } = conversation
  const draftKey = `managed:${id}`
  const [text, setText] = useState(() => composerDraft(draftKey).text)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const sendKey = currentShortcutLabel('send-message', usePreferences((state) => state.panelShortcuts))
  const said = text.trim()
  const send = async () => {
    const { rpc } = useCore.getState()
    if (busy || !said || !rpc) return
    setBusy(true)
    setFailed(null)
    try {
      await rpc.call('conversations.send', { id, text: said, steer: true })
      setText('')
      saveComposerDraft(draftKey, EMPTY_DRAFT)
    } catch (error) {
      setFailed(refusal(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="chat-input-card managed-composer" data-way={way} data-working>
      <textarea
        className="chat-input"
        aria-label={t('ManagedComposer.messageToMember')}
        placeholder={t('ManagedComposer.steerPlaceholder', { keys: sendKey ? `（${sendKey}）` : '' })}
        value={text}
        readOnly={busy}
        onChange={(event) => {
          setText(event.target.value)
          setFailed(null)
          saveComposerDraft(draftKey, { ...EMPTY_DRAFT, text: event.target.value })
        }}
        onKeyDown={(event) => {
          if (!sendsMessage(event) && !steersMessage(event)) return
          event.preventDefault()
          void send()
        }}
      />
      <div className="chat-options">
        <span className="chat-options-note managed-composer-note" role="status" data-failed={failed ? true : undefined}>{failed ?? t('ManagedComposer.steerHint')}</span>
        <span className="chat-dock-spacer" />
        <button type="button" className="button ghost chat-steer-button" disabled={busy || !said} onClick={() => void send()}>{t('ChatComposer.insertNow')}</button>
      </div>
    </div>
  )
}
