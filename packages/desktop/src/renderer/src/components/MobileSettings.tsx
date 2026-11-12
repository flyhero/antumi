import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { MOBILE_DEFAULT_PORT, PROJECT_GITHUB_URL, type MobileAccess, type MobileDevice, type MobilePairing, type MobileStatus } from '@antumi/protocol'
import { askConfirm } from '../confirm-dialog'
import { openGuide, perform, useCore } from '../core-store'
import { t } from '../i18n'
import { agoText } from '../labels'
import { CopyButton } from './CopyButton'
import { Segmented, SettingsGroup, SettingsRow, Toggle } from './SettingsControls'
import { BellIcon, DownloadIcon, PhoneIcon } from './icons'

// 设置 → 手机 (docs/MOBILE.md): the gateway's switch and port, pairing a phone by QR code and the
// code both screens show, the paired devices, and the push address.

export function useMobileSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('mobile') ?? false)
}

function useMobileStatus(): [MobileStatus | null, (status: MobileStatus) => void] {
  const rpc = useCore((s) => s.rpc)
  const [status, setStatus] = useState<MobileStatus | null>(null)
  useEffect(() => {
    if (!rpc) return
    let live = true
    const off = rpc.on('mobile.changed', ({ status: next }) => { if (live) setStatus(next) })
    void perform((rpc) => rpc.call('mobile.status', {})).then((next) => { if (live && next) setStatus(next) })
    return () => {
      live = false
      off()
    }
  }, [rpc])
  return [status, setStatus]
}

function stateText(status: MobileStatus): string {
  if (status.state === 'running') return t('MobileSettings.running', { port: status.port })
  if (status.state === 'starting') return t('MobileSettings.starting')
  if (status.state === 'failed') return status.error === 'port-in-use' ? t('MobileSettings.portInUse', { port: status.port }) : t('MobileSettings.failed', { error: status.error ?? '' })
  return t('MobileSettings.off')
}

export function MobileSettings() {
  const [status, setStatus] = useMobileStatus()
  if (!status) return <p className="muted">{t('MobileSettings.loading')}</p>
  const apply = (next: MobileStatus | null) => next && setStatus(next)
  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label={t('MobileSettings.allow')}
          description={t('MobileSettings.allowDescription')}
          control={(labelId) => <Toggle labelId={labelId} checked={status.enabled} onChange={(enabled) => void perform((rpc) => rpc.call('mobile.setEnabled', { enabled })).then(apply)} />}
        />
        {status.enabled && (
          <SettingsRow
            label={t('MobileSettings.state')}
            description={status.addresses.length > 0 ? t('MobileSettings.addresses', { addresses: status.addresses.join('、') }) : t('MobileSettings.noAddresses')}
            control={() => <span className={status.state === 'failed' ? 'mobile-state-failed' : 'muted'} role="status">{stateText(status)}</span>}
          />
        )}
        <PortRow status={status} onStatus={apply} />
        <SettingsRow
          label={t('MobileSettings.away')}
          description={t('MobileSettings.awayDescription')}
          control={() => <button type="button" className="button" onClick={openGuide}>{t('MobileSettings.openGuide')}</button>}
        />
      </SettingsGroup>
      {status.enabled && (
        <SettingsGroup title={t('MobileSettings.devices')} icon={<PhoneIcon />}>
          <SettingsRow
            label={t('MobileSettings.addPhone')}
            description={t('MobileSettings.addPhoneDescription')}
            control={() => (
              <button type="button" className="button" disabled={status.state !== 'running'} onClick={() => void perform((rpc) => rpc.call('mobile.beginPairing', {}))}>
                {status.pairing ? t('MobileSettings.newCode') : t('MobileSettings.addPhone')}
              </button>
            )}
          />
          {status.pairing && <PairingPanel pairing={status.pairing} onStatus={apply} />}
          {status.devices.length === 0 && !status.pairing && <p className="settings-row-description mobile-empty">{t('MobileSettings.noDevices')}</p>}
          {status.devices.map((device) => <DeviceRow key={device.id} device={device} onStatus={apply} />)}
        </SettingsGroup>
      )}
      <SettingsGroup title={t('MobileSettings.push')} icon={<BellIcon />}>
        <PushRow status={status} onStatus={apply} />
      </SettingsGroup>
      <SettingsGroup title={t('MobileSettings.app')} icon={<DownloadIcon />}>
        <SettingsRow
          label={t('MobileSettings.download')}
          description={t('MobileSettings.downloadDescription')}
          control={() => <a className="button" href={`${PROJECT_GITHUB_URL}/releases`} target="_blank" rel="noreferrer">{t('MobileSettings.openReleases')}</a>}
        />
      </SettingsGroup>
    </>
  )
}

function PortRow({ status, onStatus }: { status: MobileStatus; onStatus: (status: MobileStatus | null) => void }) {
  const [draft, setDraft] = useState(String(status.port))
  useEffect(() => setDraft(String(status.port)), [status.port])
  const value = Number(draft)
  const valid = Number.isInteger(value) && value >= 1024 && value <= 65535
  return (
    <SettingsRow
      label={t('MobileSettings.port')}
      description={t('MobileSettings.portDescription', { port: MOBILE_DEFAULT_PORT })}
      control={(labelId) => (
        <form className="mobile-inline-form" onSubmit={(event) => {
          event.preventDefault()
          if (valid && value !== status.port) void perform((rpc) => rpc.call('mobile.setPort', { port: value })).then(onStatus)
        }}>
          <input className="input mobile-port" aria-labelledby={labelId} inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))} />
          <button type="submit" className="button" disabled={!valid || value === status.port}>{t('MobileSettings.save')}</button>
        </form>
      )}
    />
  )
}

function QrCode({ text }: { text: string }) {
  // One path of squares, drawn from the code's modules: no image, no innerHTML.
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let row = 0; row < modules.size; row++) {
      for (let column = 0; column < modules.size; column++) {
        if (modules.get(row, column)) d += `M${column} ${row}h1v1h-1z`
      }
    }
    return { size: modules.size, path: d }
  }, [text])
  return (
    <svg className="mobile-qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={t('MobileSettings.qrLabel')} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={size + 8} height={size + 8} className="mobile-qr-back" />
      <path d={path} className="mobile-qr-modules" />
    </svg>
  )
}

function useNow(every: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

function PairingPanel({ pairing, onStatus }: { pairing: MobilePairing; onStatus: (status: MobileStatus | null) => void }) {
  const now = useNow(1000)
  const left = Math.max(0, Math.round((pairing.expiresAt - now) / 1000))
  const answer = (access: MobileAccess | null) => void perform((rpc) => rpc.call('mobile.confirmPairing', { pairingId: pairing.id, access })).then(onStatus)
  if (pairing.request) {
    const { request } = pairing
    return (
      <div className="mobile-pairing" role="alertdialog" aria-labelledby="mobile-confirm-title">
        <p id="mobile-confirm-title" className="settings-row-label">{t('MobileSettings.confirmTitle', { name: request.name })}</p>
        <p className="mobile-code" aria-label={t('MobileSettings.codeLabel')}>{request.code.slice(0, 3)} {request.code.slice(3)}</p>
        <p className="settings-row-description">{t('MobileSettings.confirmHint')}</p>
        <p className="settings-row-description">{t('MobileSettings.operateWarning')}</p>
        <div className="mobile-pairing-actions">
          <button type="button" className="button" onClick={() => answer('view')}>{t('MobileSettings.allowView')}</button>
          <button type="button" className="button primary" onClick={() => answer('operate')}>{t('MobileSettings.allowOperate')}</button>
          <button type="button" className="button ghost" onClick={() => answer(null)}>{t('MobileSettings.refuse')}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="mobile-pairing">
      <QrCode text={pairing.uri} />
      <div className="mobile-pairing-text">
        <p className="settings-row-label">{t('MobileSettings.scan')}</p>
        <p className="settings-row-description">{t('MobileSettings.scanHint', { minutes: Math.floor(left / 60), seconds: String(left % 60).padStart(2, '0') })}</p>
        <div className="mobile-pairing-actions">
          <CopyButton text={pairing.uri} label={t('MobileSettings.copyLink')}>{t('MobileSettings.copyLink')}</CopyButton>
          <button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('mobile.cancelPairing', {})).then(onStatus)}>{t('MobileSettings.cancel')}</button>
        </div>
      </div>
    </div>
  )
}

function DeviceRow({ device, onStatus }: { device: MobileDevice; onStatus: (status: MobileStatus | null) => void }) {
  const seen = device.online ? t('MobileSettings.online') : device.lastSeenAt ? t('MobileSettings.lastSeen', { ago: agoText(device.lastSeenAt) }) : t('MobileSettings.neverSeen')
  const revoke = async () => {
    const confirmed = await askConfirm({ message: t('MobileSettings.revokeConfirm', { name: device.name }), confirm: t('MobileSettings.revoke'), danger: true })
    if (confirmed) onStatus(await perform((rpc) => rpc.call('mobile.revoke', { deviceId: device.id })))
  }
  return (
    <SettingsRow
      label={device.name}
      description={`${platformName(device.platform)} · ${seen} · ${t('MobileSettings.pairedAgo', { ago: agoText(device.pairedAt) })}`}
      control={(labelId) => (
        <div className="mobile-device-controls">
          <Segmented
            labelId={labelId}
            value={device.access}
            options={[{ value: 'view', label: t('MobileSettings.view') }, { value: 'operate', label: t('MobileSettings.operate') }]}
            onChange={(access) => void perform((rpc) => rpc.call('mobile.setAccess', { deviceId: device.id, access })).then(onStatus)}
          />
          <button type="button" className="button small" onClick={() => void revoke()}>{t('MobileSettings.revoke')}</button>
        </div>
      )}
    />
  )
}

function platformName(platform: MobileDevice['platform']): string {
  return platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : platform === 'web' ? t('MobileSettings.web') : t('MobileSettings.otherPlatform')
}

function PushRow({ status, onStatus }: { status: MobileStatus; onStatus: (status: MobileStatus | null) => void }) {
  const [draft, setDraft] = useState(status.pushUrl ?? '')
  useEffect(() => setDraft(status.pushUrl ?? ''), [status.pushUrl])
  const trimmed = draft.trim()
  const valid = trimmed === '' || /^https?:\/\/\S+$/i.test(trimmed)
  return (
    <SettingsRow
      label={t('MobileSettings.pushUrl')}
      description={t('MobileSettings.pushDescription')}
      control={(labelId) => (
        <form className="mobile-inline-form" onSubmit={(event) => {
          event.preventDefault()
          if (valid) void perform((rpc) => rpc.call('mobile.setPushUrl', { url: trimmed || null })).then(onStatus)
        }}>
          <input className="input mobile-push" aria-labelledby={labelId} placeholder="https://ntfy.sh/…" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="button" disabled={!valid || trimmed === (status.pushUrl ?? '')}>{t('MobileSettings.save')}</button>
        </form>
      )}
    />
  )
}
