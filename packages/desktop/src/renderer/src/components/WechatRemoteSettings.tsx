import { useEffect, useMemo, useState } from 'react'
import { canBindWechatConversation, type RpcConnection, type WechatRemoteStatus } from '@antumi/protocol'
import { askConfirm } from '../confirm-dialog'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { PairingQrCode } from './PairingQrCode'
import { SettingsGroup, SettingsRow, Toggle } from './SettingsControls'

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
  const canSelect = candidates.some((candidate) => candidate.id === selected)
  return (
    <SettingsGroup title={t('WechatRemote.title')}>
      <SettingsRow
        label={t('WechatRemote.connection')}
        description={t('WechatRemote.description')}
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
          description={confirm ? t('WechatRemote.authorizeDescription') : t('WechatRemote.conversationDescription')}
          control={(labelId) => (
            <form className="mobile-inline-form" onSubmit={(event) => {
              event.preventDefault()
              if (!canSelect) return
              void run((client) => confirm && pairing
                ? client.call('wechatRemote.confirmPairing', { id: pairing.id, conversationId: selected })
                : client.call('wechatRemote.bindConversation', { conversationId: selected }))
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
    </SettingsGroup>
  )
}
