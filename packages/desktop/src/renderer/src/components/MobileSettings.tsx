import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  MOBILE_BRIDGE_DEFAULT_PORT, MOBILE_DEFAULT_PORT, MOBILE_EXTRA_HOSTS_MAX, MOBILE_RELAY_DEFAULT_PORT, MobileBridgeAddress, MobileExtraHost, PROJECT_GITHUB_URL,
  type MobileAccess, type MobileBridge, type MobileDevice, type MobilePairing, type MobileRelay, type MobileRelaySetup, type MobileStatus
} from '@antumi/protocol'
import { askConfirm } from '../confirm-dialog'
import { openGuide, perform, useCore } from '../core-store'
import { t } from '../i18n'
import { agoText } from '../labels'
import { CopyButton } from './CopyButton'
import { Segmented, SettingsGroup, SettingsRow, Toggle } from './SettingsControls'
import { BellIcon, DownloadIcon, GlobeIcon, PhoneIcon } from './icons'

// 设置 → 手机 (docs/MOBILE.md): the gateway's switch and port, the ways a phone reaches this computer
// (the same Wi‑Fi, Tailscale, the user's own server), pairing a phone by QR code and the code both
// screens show, the paired devices, and the push address.

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
      </SettingsGroup>
      <SettingsGroup title={t('MobileSettings.ways')} icon={<GlobeIcon />}>
        <WifiRow status={status} />
        <TailscaleRow status={status} />
        {status.relay !== undefined && <RelayRow relay={status.relay} onStatus={apply} />}
        {status.bridge !== undefined && <BridgeRow bridge={status.bridge} onStatus={apply} />}
        {status.extraHosts && <ExtraHostsRow saved={status.extraHosts} onStatus={apply} />}
        <SettingsRow
          label={t('MobileSettings.guide')}
          description={t('MobileSettings.guideDescription')}
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

// Addresses of this machine's own networks: not Tailscale's, the relay's or ones the user added.
// 100.64/10 is left out too, being Tailscale's and other VPNs'.
function localAddresses(status: MobileStatus): string[] {
  const added = new Set([status.relay?.address, ...(status.extraHosts ?? [])])
  return status.addresses.filter((address) => !address.endsWith('.ts.net') && !added.has(address) && !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address))
}

function WifiRow({ status }: { status: MobileStatus }) {
  const local = localAddresses(status)
  return (
    <SettingsRow
      label={t('MobileSettings.wifi')}
      description={t('MobileSettings.wifiDescription')}
      control={() => <span className="muted">{local.length > 0 ? local.join('、') : t('MobileSettings.wifiNone')}</span>}
    />
  )
}

function TailscaleRow({ status }: { status: MobileStatus }) {
  const name = status.addresses.find((address) => address.endsWith('.ts.net'))
  return (
    <SettingsRow
      label="Tailscale"
      description={t('MobileSettings.tailscaleDescription')}
      control={() => name
        ? <span className="mobile-ready">{t('MobileSettings.tailscaleReady', { name })}</span>
        : <a className="button" href="https://tailscale.com/download" target="_blank" rel="noreferrer">{t('MobileSettings.tailscaleDownload')}</a>}
    />
  )
}

function relayStateText(relay: MobileRelay): string {
  if (relay.state === 'off') return t('MobileSettings.relayOff')
  if (relay.state === 'downloading') return t('MobileSettings.relayDownloading')
  if (relay.state === 'connected') return t('MobileSettings.relayConnected', { ago: relay.handshakeAt ? agoText(relay.handshakeAt) : '' })
  if (relay.state === 'waiting') return t('MobileSettings.relayWaiting', { port: relay.port })
  if (relay.error === 'unsupported-platform') return t('MobileSettings.relayUnsupported')
  if (relay.error === 'download-failed') return t('MobileSettings.relayDownloadFailed')
  return t('MobileSettings.relayExited', { error: relay.error ?? '' })
}

function RelayRow({ relay, onStatus }: { relay: MobileRelay | null; onStatus: (status: MobileStatus | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingsRow
        label={t('MobileSettings.relay')}
        description={relay && !open
          ? <span className={relay.state === 'failed' ? 'mobile-field-error' : relay.state === 'connected' ? 'mobile-ready' : undefined}>{relayStateText(relay)}</span>
          : t('MobileSettings.relayDescription')}
        control={() => (
          <button type="button" className="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('MobileSettings.relayHide') : relay ? t('MobileSettings.relayShow') : t('MobileSettings.relaySetUp')}
          </button>
        )}
      />
      {open && <RelayPanel relay={relay} onStatus={onStatus} />}
    </>
  )
}

function RelayForm({ relay, onStatus, onDone }: { relay: MobileRelay | null; onStatus: (status: MobileStatus | null) => void; onDone: () => void }) {
  const [server, setServer] = useState(relay?.server ?? '')
  const [port, setPort] = useState(String(relay?.port ?? MOBILE_RELAY_DEFAULT_PORT))
  const [bandwidth, setBandwidth] = useState(relay?.bandwidth ? String(relay.bandwidth) : '')
  const host = MobileExtraHost.safeParse(server)
  const portNumber = Number(port)
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535
  const mbps = bandwidth.trim() ? Number(bandwidth) : null
  const bandwidthValid = mbps === null || (Number.isFinite(mbps) && mbps > 0 && mbps <= 100_000)
  const problem = server.trim() && !host.success ? t('MobileSettings.extraHostsInvalid', { host: server.trim() }) : null
  return (
    <form className="mobile-relay-step" onSubmit={(event) => {
      event.preventDefault()
      if (!host.success || !portValid || !bandwidthValid) return
      void perform((rpc) => rpc.call('mobile.setRelay', { server: host.data, port: portNumber, bandwidth: mbps })).then((next) => {
        onStatus(next)
        if (next) onDone()
      })
    }}>
      <p className="settings-row-label">{t('MobileSettings.relayServer')}</p>
      <p className="settings-row-description">{problem ? <span className="mobile-field-error" role="alert">{problem}</span> : t('MobileSettings.relayServerDescription')}</p>
      <div className="mobile-inline-form">
        <input className="input mobile-hosts" aria-label={t('MobileSettings.relayServer')} placeholder="8.8.8.8" value={server} onChange={(event) => setServer(event.target.value)} />
        <input className="input mobile-port" aria-label={t('MobileSettings.relayPort')} title={t('MobileSettings.relayPort')} inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))} />
        <input className="input mobile-port" aria-label={t('MobileSettings.relayBandwidth')} title={t('MobileSettings.relayBandwidth')} placeholder={t('MobileSettings.relayBandwidthPlaceholder')} inputMode="decimal" value={bandwidth} onChange={(event) => setBandwidth(event.target.value.replace(/[^\d.]/g, ''))} />
        <button type="submit" className="button primary" disabled={!host.success || !portValid || !bandwidthValid}>{relay ? t('MobileSettings.save') : t('MobileSettings.relayCreate')}</button>
        {relay && <button type="button" className="button ghost" onClick={onDone}>{t('MobileSettings.cancel')}</button>}
      </div>
    </form>
  )
}

function RelayPanel({ relay, onStatus }: { relay: MobileRelay | null; onStatus: (status: MobileStatus | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [setup, setSetup] = useState<MobileRelaySetup | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const server = relay?.server
  const port = relay?.port
  useEffect(() => {
    if (!server) return
    let live = true
    void perform((rpc) => rpc.call('mobile.relaySetup', {})).then((next) => { if (live) setSetup(next) })
    return () => { live = false }
  }, [server, port])
  if (!relay || editing) return <div className="mobile-relay"><RelayForm relay={relay} onStatus={onStatus} onDone={() => setEditing(false)} /></div>
  const stop = async () => {
    const confirmed = await askConfirm({ message: t('MobileSettings.relayRemoveConfirm'), confirm: t('MobileSettings.relayRemove'), danger: true })
    if (confirmed) onStatus(await perform((rpc) => rpc.call('mobile.removeRelay', {})))
  }
  return (
    <div className="mobile-relay">
      <div className="mobile-relay-step">
        <p className="settings-row-label">{t('MobileSettings.relayStep1', { server: relay.server })}</p>
        <p className="settings-row-description">{t('MobileSettings.relayStep1Description', { port: relay.port })}</p>
        <div className="mobile-pairing-actions">
          {setup && <CopyButton text={setup.serverScript} label={t('MobileSettings.relayCopyScript')}>{t('MobileSettings.relayCopyScript')}</CopyButton>}
        </div>
      </div>
      <div className="mobile-relay-step">
        <p className="settings-row-label">{t('MobileSettings.relayStep2')}</p>
        <p className="settings-row-description" role="status">{relayStateText(relay)}</p>
        {relay.state === 'failed' && (
          <div className="mobile-pairing-actions">
            <button type="button" className="button" onClick={() => void perform((rpc) => rpc.call('mobile.setRelay', { server: relay.server, port: relay.port, bandwidth: relay.bandwidth ?? null })).then(onStatus)}>{t('MobileSettings.relayRetry')}</button>
          </div>
        )}
      </div>
      <div className="mobile-relay-step">
        <p className="settings-row-label">{t('MobileSettings.relayStep3')}</p>
        <p className="settings-row-description">{t('MobileSettings.relayStep3Description')}</p>
        <div className="mobile-relay-codes">
          <figure>
            <QrCode text={WIREGUARD_INSTALL_URL} label={t('MobileSettings.relayInstallCode')} />
            <figcaption className="settings-row-description">{t('MobileSettings.relayInstallCode')}</figcaption>
          </figure>
          <figure>
            {showConfig && setup
              ? <QrCode text={setup.phoneConfig} label={t('MobileSettings.relayConfigCode')} />
              : <button type="button" className="button mobile-relay-reveal" onClick={() => setShowConfig(true)}>{t('MobileSettings.relayShowConfig')}</button>}
            <figcaption className="settings-row-description">{t('MobileSettings.relayConfigCode')}</figcaption>
          </figure>
        </div>
      </div>
      <div className="mobile-pairing-actions">
        <button type="button" className="button" onClick={() => setEditing(true)}>{t('MobileSettings.relayChangeServer')}</button>
        <button type="button" className="button ghost" onClick={() => void stop()}>{t('MobileSettings.relayRemove')}</button>
      </div>
    </div>
  )
}

const WIREGUARD_INSTALL_URL = 'https://www.wireguard.com/install/'

// The author's own bridge is shared by invitation: its address is given over WeChat, never built in.
const AUTHOR_WECHAT = 'Wang_hero2014'

function bridgeStateText(bridge: MobileBridge): string {
  if (bridge.state === 'off') return t('MobileSettings.bridgeOff')
  if (bridge.state === 'connecting') return t('MobileSettings.bridgeConnecting')
  if (bridge.state === 'connected') return t('MobileSettings.bridgeConnected', { address: bridge.address })
  if (bridge.error === 'wrong-secret') return t('MobileSettings.bridgeWrongSecret')
  return t('MobileSettings.bridgeFailed', { error: bridge.error ?? '' })
}

function BridgeRow({ bridge, onStatus }: { bridge: MobileBridge | null; onStatus: (status: MobileStatus | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingsRow
        label={t('MobileSettings.bridge')}
        description={bridge && !open
          ? <span className={bridge.state === 'failed' ? 'mobile-field-error' : bridge.state === 'connected' ? 'mobile-ready' : undefined}>{bridgeStateText(bridge)}</span>
          : t('MobileSettings.bridgeDescription')}
        control={() => (
          <button type="button" className="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('MobileSettings.relayHide') : bridge ? t('MobileSettings.relayShow') : t('MobileSettings.relaySetUp')}
          </button>
        )}
      />
      {open && <BridgePanel bridge={bridge} onStatus={onStatus} />}
    </>
  )
}

function BridgePanel({ bridge, onStatus }: { bridge: MobileBridge | null; onStatus: (status: MobileStatus | null) => void }) {
  const [script, setScript] = useState<string | null>(null)
  const [address, setAddress] = useState(bridge?.address ?? '')
  useEffect(() => setAddress(bridge?.address ?? ''), [bridge?.address])
  useEffect(() => {
    let live = true
    void perform((rpc) => rpc.call('mobile.bridgeInstallScript', {})).then((next) => { if (live && next) setScript(next.script) })
    return () => { live = false }
  }, [])
  const parsed = MobileBridgeAddress.safeParse(address)
  const changed = address.trim() !== (bridge?.address ?? '')
  const stop = async () => {
    const confirmed = await askConfirm({ message: t('MobileSettings.bridgeRemoveConfirm'), confirm: t('MobileSettings.relayRemove'), danger: true })
    if (confirmed) onStatus(await perform((rpc) => rpc.call('mobile.removeBridge', {})))
  }
  return (
    <div className="mobile-relay">
      <div className="mobile-relay-step">
        <p className="settings-row-label">{t('MobileSettings.bridgeAuthor')}</p>
        <p className="settings-row-description">{t('MobileSettings.bridgeAuthorDescription', { wechat: AUTHOR_WECHAT })}</p>
        <div className="mobile-pairing-actions">
          <CopyButton text={AUTHOR_WECHAT} label={t('MobileSettings.bridgeCopyWechat')}>{t('MobileSettings.bridgeCopyWechat')}</CopyButton>
        </div>
      </div>
      <div className="mobile-relay-step">
        <p className="settings-row-label">{t('MobileSettings.bridgeStep1')}</p>
        <p className="settings-row-description">{t('MobileSettings.bridgeStep1Description', { port: MOBILE_BRIDGE_DEFAULT_PORT })}</p>
        <div className="mobile-pairing-actions">
          {script && <CopyButton text={script} label={t('MobileSettings.bridgeCopyScript')}>{t('MobileSettings.bridgeCopyScript')}</CopyButton>}
        </div>
      </div>
      <form className="mobile-relay-step" onSubmit={(event) => {
        event.preventDefault()
        if (parsed.success && changed) void perform((rpc) => rpc.call('mobile.setBridge', { address: parsed.data })).then(onStatus)
      }}>
        <p className="settings-row-label">{t('MobileSettings.bridgeStep2')}</p>
        <p className="settings-row-description">{address.trim() && !parsed.success
          ? <span className="mobile-field-error" role="alert">{t('MobileSettings.bridgeInvalid', { address: address.trim() })}</span>
          : t('MobileSettings.bridgeStep2Description', { port: MOBILE_BRIDGE_DEFAULT_PORT })}</p>
        <div className="mobile-inline-form">
          <input className="input mobile-hosts" aria-label={t('MobileSettings.bridgeStep2')} placeholder="8.8.8.8" value={address} onChange={(event) => setAddress(event.target.value)} />
          <button type="submit" className="button primary" disabled={!parsed.success || !changed}>{t('MobileSettings.save')}</button>
        </div>
      </form>
      {bridge && (
        <div className="mobile-relay-step">
          <p className="settings-row-label">{t('MobileSettings.bridgeStep3')}</p>
          <p className="settings-row-description" role="status">{bridgeStateText(bridge)}</p>
          <p className="settings-row-description">{t('MobileSettings.bridgeStep3Description')}</p>
        </div>
      )}
      {bridge && (
        <div className="mobile-pairing-actions">
          <button type="button" className="button ghost" onClick={() => void stop()}>{t('MobileSettings.relayRemove')}</button>
        </div>
      )}
    </div>
  )
}

// Typed as one line: commas, spaces or 、 between them.
function hostsOf(text: string): string[] {
  return text.split(/[\s,，、]+/).filter(Boolean)
}

function ExtraHostsRow({ saved, onStatus }: { saved: readonly string[]; onStatus: (status: MobileStatus | null) => void }) {
  const joined = saved.join(', ')
  const [draft, setDraft] = useState(joined)
  useEffect(() => setDraft(joined), [joined])
  const hosts = hostsOf(draft)
  const wrong = hosts.find((host) => !MobileExtraHost.safeParse(host).success)
  const tooMany = hosts.length > MOBILE_EXTRA_HOSTS_MAX
  const problem = wrong !== undefined ? t('MobileSettings.extraHostsInvalid', { host: wrong }) : tooMany ? t('MobileSettings.extraHostsTooMany', { max: MOBILE_EXTRA_HOSTS_MAX }) : null
  const changed = hosts.join(', ') !== joined
  return (
    <SettingsRow
      label={t('MobileSettings.extraHosts')}
      description={problem ? <span className="mobile-field-error" role="alert">{problem}</span> : t('MobileSettings.extraHostsDescription')}
      control={(labelId) => (
        <form className="mobile-inline-form" onSubmit={(event) => {
          event.preventDefault()
          if (!problem && changed) void perform((rpc) => rpc.call('mobile.setExtraHosts', { hosts })).then(onStatus)
        }}>
          <input className="input mobile-hosts" aria-labelledby={labelId} placeholder="10.77.0.2" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="button" disabled={problem !== null || !changed}>{t('MobileSettings.save')}</button>
        </form>
      )}
    />
  )
}

function QrCode({ text, label = t('MobileSettings.qrLabel') }: { text: string; label?: string }) {
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
    <svg className="mobile-qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
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
