import { getLocale, t, tr } from '../i18n'
import { useEffect, useId, useState } from 'react'
import type { PluginInfo, PluginInstallSource, RecommendedPlugin } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { pickPlugin } from '../desktop-bridge'
import { SettingsGroup, Toggle } from './SettingsControls'
import { ChatPicker } from './ChatPicker'
import { DownloadIcon, PuzzleIcon, StarIcon } from './icons'

// A plugin's GitHub repository, opened in the user's browser (main sends web links there).
function RepositoryLink({ repository }: { repository: string }) {
  return <a className="plugin-repository" href={`https://github.com/${repository}`} target="_blank" rel="noreferrer" data-tooltip={t('PluginSettings.openOnGitHub')}>{repository}</a>
}

export function PluginSettings() {
  const ids = useId()
  const rpc = useCore((state) => state.rpc)
  const [recommended, setRecommended] = useState<RecommendedPlugin[]>([])
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'local' | 'github'>('local')
  const [location, setLocation] = useState('')
  const [tag, setTag] = useState('')
  const [asset, setAsset] = useState('')
  const [trusted, setTrusted] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    setRecommended([])
    if (!rpc) { setPlugins(null); return }
    let active = true
    let changed = false
    const off = rpc.on('plugins.changed', ({ plugins }) => { changed = true; if (active) setPlugins(plugins) })
    void perform((connection) => connection.call('plugins.list', {})).then((result) => {
      if (active && !changed && result) setPlugins(result)
    })
    if (rpc.features.includes('plugin-recommendations')) {
      void perform((connection) => connection.call('plugins.recommended', {})).then((result) => {
        if (active && result) setRecommended(result)
      })
    }
    return () => { active = false; off() }
  }, [rpc])

  const run = async (action: Parameters<typeof perform>[0], message: string) => {
    if (busy) return
    setBusy(true)
    setStatus('')
    try {
      const result = await perform(action)
      if (result !== null) {
        setStatus(message)
        const updated = await perform((connection) => connection.call('plugins.list', {}))
        if (updated) setPlugins(updated)
      }
    } finally { setBusy(false) }
  }

  const install = () => {
    const source: PluginInstallSource = kind === 'local'
      ? { kind, path: location.trim() }
      : { kind, repository: location.trim(), ...(tag.trim() ? { tag: tag.trim() } : {}), ...(asset.trim() ? { asset: asset.trim() } : {}) }
    void run((connection) => connection.call('plugins.install', { source }), t('PluginSettings.pluginInstalled'))
  }

  return (
    <div className="plugin-settings">
      <p className="settings-note">{t('PluginSettings.notAgentPlugins')}</p>
      {status && <p className="settings-status" role="status">{status}</p>}
      {recommended.length > 0 && <SettingsGroup title={t('PluginSettings.recommended')} icon={<StarIcon />}>
        {recommended.map((entry) => {
          const installed = plugins?.find((plugin) => plugin.id === entry.id)
          return <div className="settings-row" key={entry.id}>
            <div className="settings-row-text">
              <span className="settings-row-label">{entry.name}</span>
              <p className="settings-row-description">{getLocale() === 'en' ? entry.descriptionEn : entry.description}</p>
              <p className="settings-row-description">GitHub · <RepositoryLink repository={entry.repository} /></p>
            </div>
            <div className="settings-row-control"><button className="button" aria-label={installed ? `${entry.name} · ${t('PluginSettings.installed')}` : t('PluginSettings.installNamedPlugin', { name: entry.name })} disabled={busy || plugins === null || Boolean(installed)} onClick={() => {
              void run((connection) => connection.call('plugins.installRecommended', { id: entry.id }), t('PluginSettings.pluginInstalled'))
            }}>{installed ? t('PluginSettings.installed') : t('PluginSettings.installPlugin')}</button></div>
          </div>
        })}
      </SettingsGroup>}
      <SettingsGroup title={t('PluginSettings.installedPlugins')} icon={<PuzzleIcon />}>
        {plugins === null ? <p className="muted">{t('PluginSettings.loadingPlugins')}</p> : plugins.length === 0 ? <p className="muted">{t('PluginSettings.noPluginsInstalledYet')}</p> : plugins.map((plugin) => (
          <div key={plugin.id} className="plugin-row">
            <div className="settings-row">
              <div className="settings-row-text">
                <span id={`${ids}-${plugin.id}`} className="settings-row-label">{plugin.sources.map((source) => source.name).join('、')}</span>
                <p className="settings-row-description">{plugin.id} · {plugin.version} · {plugin.enabled ? plugin.problem ? t('PluginSettings.failedToStart') : t('PluginSettings.enabled') : t('PluginSettings.disabled')}</p>
                <p className="settings-row-description">{plugin.origin.kind === 'bundled' ? t('PluginSettings.bundledWithAntumi') : plugin.origin.kind === 'github' ? <>GitHub · <RepositoryLink repository={plugin.origin.repository} /></> : plugin.origin.path}</p>
              </div>
              <Toggle labelId={`${ids}-${plugin.id}`} checked={plugin.enabled} disabled={busy} onChange={(enabled) => { void run((connection) => connection.call('plugins.setEnabled', { id: plugin.id, enabled }), enabled ? t('PluginSettings.pluginEnabled') : t('PluginSettings.pluginDisabled')) }} />
            </div>
            {plugin.problem && <p className="settings-status" role="status">{plugin.problem}</p>}
            <div className="plugin-actions">
              {(plugin.origin.kind !== 'bundled' || recommended.some((entry) => entry.id === plugin.id)) && <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.update', { id: plugin.id }), t('PluginSettings.checkedAndAppliedAvailableUpdates')) }}>{t('PluginSettings.checkAndUpdate')}</button>}
              {plugin.problem && <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.setEnabled', { id: plugin.id, enabled: true }), t('PluginSettings.pluginReloaded')) }}>{t('PluginSettings.retryLoading')}</button>}
              {plugin.versions.length > 1 && <ChatPicker label={t('PluginSettings.switchVersion', { value1: plugin.id })} value={plugin.version} placeholder={t('PluginSettings.chooseVersion')} size="large" placement="below" disabled={busy}
                options={plugin.versions.map((version) => ({ value: version, label: `${version}${version === plugin.version ? t('PluginSettings.current') : ''}` }))}
                onChange={(version) => { void run((connection) => connection.call('plugins.rollback', { id: plugin.id, version }), t('PluginSettings.pluginVersionSwitched')) }} />}
              <button className="button ghost" disabled={busy} onClick={() => setRemove(plugin.id)}>{t('PluginSettings.uninstall')}</button>
            </div>
            {remove === plugin.id && <div className="plugin-actions">
              <span className="settings-note">{t('PluginSettings.sourceSettingsCredentialsAndImportedTasksAreKept')}</span>
              <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.uninstall', { id: plugin.id }), t('PluginSettings.pluginUninstalled')); setRemove(null) }}>{t('PluginSettings.confirmUninstall')}</button>
              <button className="button ghost" disabled={busy} onClick={() => setRemove(null)}>{t('ChatCommandSettings.cancel')}</button>
            </div>}
          </div>
        ))}
      </SettingsGroup>
      <SettingsGroup title={t('PluginSettings.installFromElsewhere')} icon={<DownloadIcon />}>
        <form className="plugin-install" onSubmit={(event) => { event.preventDefault(); install() }}>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor={`${ids}-kind`}>{t('PluginSettings.installationSource')}</label>
            <select id={`${ids}-kind`} className="input" value={kind} disabled={busy} onChange={(event) => {
              setKind(event.target.value === 'github' ? 'github' : 'local'); setLocation(''); setTrusted(false)
            }}>
              <option value="local">{t('PluginSettings.localDirectoryOrZip')}</option>
              <option value="github">GitHub Release</option>
            </select>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor={`${ids}-location`}>{kind === 'local' ? t('PluginSettings.pluginPath') : t('PluginSettings.githubRepository')}</label>
            <input id={`${ids}-location`} className="input mono" value={location} required disabled={busy} placeholder={kind === 'local' ? t('PluginSettings.fullPathToPluginDirectoryOrZip') : 'owner/repository'} onChange={(event) => { setLocation(event.target.value); setTrusted(false) }} />
            {kind === 'local' && window.antumi?.pickPlugin && <div className="plugin-actions">
              <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('directory').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>{t('PluginSettings.chooseDirectory')}</button>
              <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('zip').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>{t('PluginSettings.chooseZip')}</button>
            </div>}
          </div>
          {kind === 'github' && <>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`${ids}-tag`}>{t('PluginSettings.releaseTagOptional')}</label>
              <input id={`${ids}-tag`} className="input mono" value={tag} disabled={busy} placeholder={t('PluginSettings.leaveEmptyForTheLatestStableRelease')} onChange={(event) => setTag(event.target.value)} />
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`${ids}-asset`}>{t('PluginSettings.zipAssetNameOptional')}</label>
              <input id={`${ids}-asset`} className="input mono" value={asset} disabled={busy} placeholder={t('PluginSettings.specifyIfTheReleaseHasMultipleZipFiles')} onChange={(event) => setAsset(event.target.value)} />
            </div>
          </>}
          <p className="settings-note">{t('PluginSettings.pluginsRunLocalCodeAndReceiveCredentialsFor')}</p>
          <label className="plugin-trust">{tr('PluginSettings.iTrustThisPluginAndItsSource', { value1: <input type="checkbox" checked={trusted} disabled={busy} onChange={(event) => setTrusted(event.target.checked)} /> })}</label>
          <button className="button primary" type="submit" disabled={busy || !location.trim() || !trusted}>{busy ? t('PluginSettings.processing') : t('PluginSettings.installPlugin')}</button>
        </form>
      </SettingsGroup>
    </div>
  )
}
