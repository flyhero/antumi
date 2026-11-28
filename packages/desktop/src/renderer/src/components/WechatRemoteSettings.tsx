import { useEffect, useId, useMemo, useState } from 'react'
import { WECHAT_MAX_CONVERSATIONS, WechatRemoteNotification, canBindWechatConversation, type Conversation, type RpcConnection, type WechatRemoteNotifications, type WechatRemoteStatus } from '@antumi/protocol'
import { askConfirm } from '../confirm-dialog'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { PairingQrCode } from './PairingQrCode'
import { SettingsRow, Toggle } from './SettingsControls'

const conversationTitle = (conversation: { title: string }) => conversation.title || t('WechatRemote.untitled')

function stateText(status: WechatRemoteStatus): string {
  const { state, error } = status
  if (state === 'error' && error) return t(`WechatRemote.error.${error}`)
  return t(`WechatRemote.state.${state}`)
}

export function WechatRemoteSettings() {
  const rpc = useCore((s) => s.rpc)
  const conversations = useCore((s) => s.conversations)
  const candidates = useMemo(() => Object.values(conversations).filter(canBindWechatConversation).sort((a, b) => b.updatedAt - a.updatedAt), [conversations])
  const [status, setStatus] = useState<WechatRemoteStatus | null>(null)
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!rpc) return
    let reading = true
    const off = rpc.on('wechatRemote.changed', ({ status }) => { reading = false; setStatus(status) })
    void perform((client) => client.call('wechatRemote.status', {})).then((value) => { if (reading && value) setStatus(value) })
    return () => { reading = false; off() }
  }, [rpc])
  useEffect(() => { setSelected(status?.conversationId ?? '') }, [status?.conversationId, status?.pairing?.id])
  useEffect(() => { setPin('') }, [status?.pairing?.id, status?.state])

  const run = async (call: (client: RpcConnection) => Promise<WechatRemoteStatus>) => {
    setBusy(true)
    try {
      await perform(call)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (await askConfirm({ message: t('WechatRemote.removeConfirm'), confirm: t('WechatRemote.remove'), danger: true })) {
      await run((client) => client.call('wechatRemote.remove', {}))
    }
  }

  const pairing = status?.pairing
  const confirm = status?.state === 'confirm'
  const canPair = status && (!status.paired || status.state === 'reauth' || (status.state === 'error' && !status.enabled))
  const showPicker = confirm || (status?.paired && !pairing && !canPair)
  const authorized = status?.authorizedConversationIds
  const canSelect = candidates.some((candidate) => candidate.id === selected)
  return (
    <>
      <SettingsRow
        label={t('WechatRemote.connection')}
        description={t(status?.enabled ? 'WechatRemote.usage' : 'WechatRemote.description')}
        control={() => <span className="muted" role="status">{status ? stateText(status) : t('MobileSettings.loading')}</span>}
      />
      {!pairing && canPair && (
        <SettingsRow
          label={t('WechatRemote.account')}
          control={() => <button type="button" className="button" disabled={busy} onClick={() => void run((client) => client.call('wechatRemote.beginPairing', {}))}>{t('WechatRemote.scan')}</button>}
        />
      )}
      {pairing && (
        <div className="mobile-pairing">
          {pairing.qr && <PairingQrCode text={pairing.qr} label={t('WechatRemote.qr')} />}
          {status?.state === 'pin' && (
            <form className="mobile-inline-form" onSubmit={(event) => {
              event.preventDefault()
              void run((client) => client.call('wechatRemote.submitPin', { id: pairing.id, pin }))
            }}>
              <input className="input" aria-label={t('WechatRemote.pin')} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} />
              <button type="submit" className="button" disabled={busy || pin.length < 4}>{t('WechatRemote.submitPin')}</button>
            </form>
          )}
          <button type="button" className="button ghost" disabled={busy} onClick={() => void run((client) => client.call('wechatRemote.cancelPairing', { id: pairing.id }))}>{t('MobileSettings.cancel')}</button>
        </div>
      )}
      {showPicker && status && (
        <SettingsRow
          label={t('WechatRemote.conversation')}
          description={confirm ? t('WechatRemote.authorizeDescription') : t(authorized ? 'WechatRemote.currentDescription' : 'WechatRemote.conversationDescription')}
          control={(labelId) => (
            <form className="mobile-inline-form" onSubmit={(event) => {
              event.preventDefault()
              if (!canSelect) return
              void run((client) => confirm && pairing
                ? client.call('wechatRemote.confirmPairing', { id: pairing.id, conversationId: selected })
                : client.call('wechatRemote.bindConversation', { conversationId: selected, ...(authorized ? { retainAllowed: true } : {}) }))
            }}>
              <select className="input wechat-conversation-picker" aria-labelledby={labelId} value={canSelect ? selected : ''} onChange={(event) => setSelected(event.target.value)}>
                <option value="">{t(candidates.length ? 'WechatRemote.select' : 'WechatRemote.noConversations')}</option>
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{conversationTitle(candidate)}</option>)}
              </select>
              <button type="submit" className={confirm ? 'button primary' : 'button'} disabled={busy || !canSelect || (!confirm && selected === status.conversationId)}>
                {t(confirm ? 'WechatRemote.authorize' : 'MobileSettings.save')}
              </button>
            </form>
          )}
        />
      )}
      {authorized && status?.paired && !pairing && !canPair && (
        <WechatConversationAccess candidates={candidates} active={status.conversationId} authorized={authorized} busy={busy}
          change={(conversationId, allowed) => void run((client) => client.call('wechatRemote.setConversationAccess', { conversationId, allowed }))} />
      )}
      {status?.paired && !pairing && (
        <SettingsRow
          label={t('WechatRemote.enabled')}
          control={(labelId) => (
            <div className="mobile-inline-form">
              <Toggle labelId={labelId} checked={status.enabled} disabled={busy || !status.conversationId || Boolean(canPair)} onChange={(enabled) => void run((client) => client.call('wechatRemote.setEnabled', { enabled }))} />
              <button type="button" className="button small" disabled={busy} onClick={() => void remove()}>{t('WechatRemote.remove')}</button>
            </div>
          )}
        />
      )}
      {status?.paired && !pairing && status.notifications && (
        <WechatNotificationSettings notifications={status.notifications} busy={busy}
          change={(kind, enabled) => void run((client) => client.call('wechatRemote.setNotification', { kind, enabled }))} />
      )}
    </>
  )
}

function WechatConversationAccess({ candidates, active, authorized, busy, change }: {
  candidates: Conversation[]
  active: string | null
  authorized: string[]
  busy: boolean
  change: (id: string, allowed: boolean) => void
}) {
  const [selected, setSelected] = useState('')
  const remaining = candidates.filter((candidate) => !authorized.includes(candidate.id))
  const selectedAvailable = remaining.some((candidate) => candidate.id === selected)
  const full = authorized.length >= WECHAT_MAX_CONVERSATIONS
  return (
    <>
      <SettingsRow
        label={t('WechatRemote.authorizedConversations')}
        description={t(full ? 'WechatRemote.authorizedLimit' : 'WechatRemote.authorizedDescription', { max: WECHAT_MAX_CONVERSATIONS })}
        control={(labelId) => (
          <form className="mobile-inline-form" onSubmit={(event) => {
            event.preventDefault()
            if (!busy && !full && selectedAvailable) {
              change(selected, true)
              setSelected('')
            }
          }}>
            <select className="input wechat-conversation-picker" aria-labelledby={labelId} value={selectedAvailable ? selected : ''} disabled={busy || full || !remaining.length} onChange={(event) => setSelected(event.target.value)}>
              <option value="">{t('WechatRemote.select')}</option>
              {remaining.map((candidate) => <option key={candidate.id} value={candidate.id}>{conversationTitle(candidate)}</option>)}
            </select>
            <button className="button" type="submit" disabled={busy || full || !selectedAvailable}>{t('WechatRemote.addAccess')}</button>
          </form>
        )}
      />
      {authorized.map((id) => {
        const conversation = candidates.find((candidate) => candidate.id === id)
        return conversation && (
          <SettingsRow key={id} label={conversationTitle(conversation)} description={id === active ? t('WechatRemote.activeConversation') : undefined}
            control={() => <button className="button small" type="button" disabled={busy} onClick={() => change(id, false)}>{t('WechatRemote.revokeAccess')}</button>} />
        )
      })}
    </>
  )
}

function WechatNotificationSettings({ notifications, busy, change }: {
  notifications: WechatRemoteNotifications
  busy: boolean
  change: (kind: WechatRemoteNotification, enabled: boolean) => void
}) {
  const title = useId()
  return (
    <section className="wechat-notifications" aria-labelledby={title}>
      <div className="wechat-notifications-heading">
        <h4 id={title} className="settings-row-label">{t('WechatRemote.notifications')}</h4>
        <p className="settings-row-description">{t('WechatRemote.notificationsDescription')}</p>
      </div>
      {WechatRemoteNotification.options.map((kind) => (
        <SettingsRow key={kind} label={t(`WechatRemote.notification.${kind}`)}
          control={(labelId) => <Toggle labelId={labelId} checked={notifications[kind]} disabled={busy} onChange={(enabled) => change(kind, enabled)} />} />
      ))}
    </section>
  )
}
