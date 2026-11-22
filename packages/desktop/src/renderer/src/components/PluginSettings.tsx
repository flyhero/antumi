import { getLocale, t, tr } from '../i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { githubRepository, type PluginInfo, type PluginInstallSource, type RecommendedPlugin } from '@antumi/protocol'
import { perform, receivePlugins, showError, useCore } from '../core-store'
import { pluginPageLabel } from '../plugin-pages'
import { pickPlugin } from '../desktop-bridge'
import { Segmented, SettingsGroup, Toggle } from './SettingsControls'
import { ChatPicker } from './ChatPicker'
import { DownloadIcon, PuzzleIcon, StarIcon } from './icons'

// A plugin's GitHub repository, opened in the user's browser (main sends web links there).
function RepositoryLink({ repository }: { repository: string }) {
  return <a className="plugin-repository" href={`https://github.com/${repository}`} target="_blank" rel="noreferrer" data-tooltip={t('PluginSettings.openOnGitHub')}>{repository}</a>
}

// What the plugin brings, by name: its sources, else its pages, else its id. Never empty: it labels
// the plugin's switch.
function pluginName(plugin: PluginInfo): string {
  const names = plugin.sources.length > 0 ? plugin.sources.map((source) => source.name) : plugin.pages.map((page) => pluginPageLabel(page, getLocale()))
  return names.join('、') || plugin.id
}

export function PluginSettings() {
  const ids = useId()
  const [tab, setTab] = useState<'installed' | 'recommended' | null>(null)
  const [filter, setFilter] = useState('')
  const [installOpen, setInstallOpen] = useState(false)
  const rpc = useCore((state) => state.rpc)
  const [recommended, setRecommended] = useState<RecommendedPlugin[]>([])
  // Kept by the store, which loads them on connect and follows plugins.changed.
  const plugins = useCore((state) => state.plugins)
  const activeTab = recommended.length === 0 ? 'installed' : tab ?? (plugins?.length === 0 ? 'recommended' : 'installed')
  const query = filter.trim().toLocaleLowerCase()
  const visible = recommended.filter((entry) => [entry.name, entry.id, entry.description, entry.descriptionEn, entry.repository].some((text) => text.toLocaleLowerCase().includes(query)))
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'local' | 'github'>('local')
  const [location, setLocation] = useState('')
  const [asset, setAsset] = useState('')
  // ZIP packages found on the latest release of the project currently typed.
  const [packages, setPackages] = useState<{ repository: string, tag: string, names: string[] } | null>(null)
  const [looking, setLooking] = useState(false)
  const [trusted, setTrusted] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  // Keep manual installation feedback beside its submit button.
  const [status, setStatus] = useState<{ text: string, at: 'top' | 'install' } | null>(null)

  useEffect(() => {
    setRecommended([])
    if (!rpc?.features.includes('plugin-recommendations')) return
    let active = true
    void perform((connection) => connection.call('plugins.recommended', {})).then((result) => {
      if (active && result) setRecommended(result)
    })
    return () => { active = false }
  }, [rpc])

  const run = async (action: Parameters<typeof perform>[0], message: string, at: 'top' | 'install' = 'top', done?: () => void) => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const result = await perform(action)
      if (result !== null) {
        setStatus({ text: message, at })
        done?.()
        const updated = await perform((connection) => connection.call('plugins.list', {}))
        if (updated) receivePlugins(updated)
      }
    } finally { setBusy(false) }
  }

  const repository = kind === 'github' ? githubRepository(location) : null
  const choosePackages = rpc?.features.includes('plugin-packages') ?? false
  const lookup = useRef(0)
  useEffect(() => {
    setPackages(null)
    setAsset('')
    if (!repository || !choosePackages) return
    const current = ++lookup.current
    const timer = setTimeout(() => {
      if (lookup.current !== current) return
      setLooking(true)
      void perform((connection) => connection.call('plugins.githubPackages', { repository })).then((found) => {
        if (lookup.current !== current || !found) return
        setPackages({ repository, tag: found.tag, names: found.packages })
        setAsset(found.packages.length === 1 ? found.packages[0] ?? '' : '')
      }).finally(() => { if (lookup.current === current) setLooking(false) })
    }, 400)
    return () => { clearTimeout(timer); lookup.current += 1; setLooking(false) }
  }, [repository, choosePackages])

  const resetInstall = () => { setLocation(''); setAsset(''); setPackages(null); setTrusted(false) }
  const install = () => {
    if (kind === 'local') {
      void run((connection) => connection.call('plugins.install', { source: { kind, path: location.trim() } }), t('PluginSettings.pluginInstalled'), 'install', resetInstall)
      return
    }
    const project = githubRepository(location)
    if (!project) { showError(t('PluginSettings.notAGitHubProject')); return }
    const known = packages?.repository === project ? packages : null
    const chosen = known ? known.names.length === 1 ? known.names[0] ?? '' : known.names.includes(asset) ? asset : '' : ''
    const source = (name: string): PluginInstallSource => ({ kind: 'github', repository: project, ...(name ? { asset: name } : {}) })
    if (choosePackages && !chosen) {
      if (known && known.names.length > 1) return
      const current = ++lookup.current
      setLooking(true)
      void perform((connection) => connection.call('plugins.githubPackages', { repository: project })).then((found) => {
        if (lookup.current !== current || !found) return
        setPackages({ repository: project, tag: found.tag, names: found.packages })
        const only = found.packages.length === 1 ? found.packages[0] ?? '' : ''
        setAsset(only)
        if (only) void run((connection) => connection.call('plugins.install', { source: source(only) }), t('PluginSettings.pluginInstalled'), 'install', resetInstall)
      }).finally(() => { if (lookup.current === current) setLooking(false) })
      return
    }
    void run((connection) => connection.call('plugins.install', { source: source(chosen) }), t('PluginSettings.pluginInstalled'), 'install', resetInstall)
  }

  return (
    <div className="plugin-settings">
      <p className="settings-note">{t('PluginSettings.notAgentPlugins')}</p>
      <div className="plugin-settings-toolbar">
        <span id={`${ids}-tabs`} hidden>{t('SettingsPage.plugins')}</span>
        <Segmented<'installed' | 'recommended'> labelId={`${ids}-tabs`} value={activeTab} options={[
          { value: 'installed', label: plugins === null ? t('PluginSettings.installed') : t('PluginSettings.installedCount', { count: plugins.length }) },
          ...(recommended.length > 0 ? [{ value: 'recommended' as const, label: t('PluginSettings.recommended') }] : [])
        ]} onChange={setTab} />
        <button type="button" className="button" aria-expanded={installOpen} aria-controls={`${ids}-install`} disabled={busy || looking} onClick={() => setInstallOpen(!installOpen)}><DownloadIcon />{t('PluginSettings.manualInstall')}</button>
      </div>
      {status?.at === 'top' && <p className="settings-status" role="status" data-ok>{status.text}</p>}
      <div id={`${ids}-install`} className="plugin-install-panel" hidden={!installOpen}>
        <SettingsGroup title={t('PluginSettings.installFromElsewhere')} icon={<DownloadIcon />}>
          <form className="plugin-install" onSubmit={(event) => { event.preventDefault(); install() }}>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`${ids}-kind`}>{t('PluginSettings.installationSource')}</label>
              <select id={`${ids}-kind`} className="input" value={kind} disabled={busy} onChange={(event) => {
                setKind(event.target.value === 'github' ? 'github' : 'local'); setLocation(''); setPackages(null); setAsset(''); setTrusted(false)
              }}>
                <option value="local">{t('PluginSettings.localDirectoryOrZip')}</option>
                <option value="github">GitHub Release</option>
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={`${ids}-location`}>{kind === 'local' ? t('PluginSettings.pluginPath') : t('PluginSettings.githubRepository')}</label>
              <input id={`${ids}-location`} className="input mono" value={location} required disabled={busy} placeholder={kind === 'local' ? t('PluginSettings.fullPathToPluginDirectoryOrZip') : 'https://github.com/owner/repository'} onChange={(event) => { setLocation(event.target.value); setTrusted(false) }} />
              {kind === 'local' && window.antumi?.pickPlugin && <div className="plugin-actions">
                <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('directory').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>{t('PluginSettings.chooseDirectory')}</button>
                <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('zip').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>{t('PluginSettings.chooseZip')}</button>
              </div>}
            </div>
            {kind === 'github' && <>
              {looking && <p className="settings-note">{t('PluginSettings.findingPackages')}</p>}
              {packages?.repository === repository && packages.names.length === 1 && <p className="settings-note">{t('PluginSettings.packageFound', { name: packages.names[0] ?? '', tag: packages.tag })}</p>}
              {packages?.repository === repository && packages.names.length > 1 && <div className="settings-field">
                <label className="settings-field-label" htmlFor={`${ids}-package`}>{t('PluginSettings.choosePackage')}</label>
                <select id={`${ids}-package`} className="input" value={packages.names.includes(asset) ? asset : ''} disabled={busy || looking} onChange={(event) => setAsset(event.target.value)}>
                  <option value="">{t('PluginSettings.chooseOnePackage')}</option>
                  {packages.names.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>}
            </>}
            <p className="settings-note">{t('PluginSettings.pluginsRunLocalCodeAndReceiveCredentialsFor')}</p>
            <label className="plugin-trust">{tr('PluginSettings.iTrustThisPluginAndItsSource', { value1: <input type="checkbox" checked={trusted} disabled={busy} onChange={(event) => setTrusted(event.target.checked)} /> })}</label>
            <div className="plugin-actions">
              <button className="button primary" type="submit" disabled={busy || looking || !location.trim() || !trusted || (packages?.repository === repository && packages.names.length > 1 && !packages.names.includes(asset))}>{busy || looking ? t('PluginSettings.processing') : t('PluginSettings.installPlugin')}</button>
              {status?.at === 'install' && <p className="settings-status" role="status" data-ok>{status.text}</p>}
            </div>
          </form>
        </SettingsGroup>
      </div>
      {activeTab === 'recommended' && <>
        <div className="settings-list-toolbar">
          <input className="input" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('PluginSettings.searchRecommended')} aria-label={t('PluginSettings.searchRecommended')} />
          <p className="settings-list-count" role="status">{t('PluginSettings.filteredCount', { count: visible.length, total: recommended.length })}</p>
        </div>
        <SettingsGroup title={t('PluginSettings.recommended')} icon={<StarIcon />}>
          {visible.map((entry) => {
            const installed = plugins?.find((plugin) => plugin.id === entry.id)
            return <div className="settings-row" key={entry.id}>
              <div className="settings-row-text">
                <span className="settings-row-label">{entry.name}</span>
                <p className="settings-row-description">{getLocale() === 'en' ? entry.descriptionEn : entry.description}</p>
                <p className="settings-row-description">GitHub · <RepositoryLink repository={entry.repository} /></p>
              </div>
              <div className="settings-row-control"><button className="button" aria-label={installed ? `${entry.name} · ${t('PluginSettings.installed')}` : t('PluginSettings.installNamedPlugin', { name: entry.name })} disabled={busy || plugins === null || Boolean(installed)} onClick={() => {
                setTab('recommended')
                void run((connection) => connection.call('plugins.installRecommended', { id: entry.id }), t('PluginSettings.pluginInstalled'))
              }}>{installed ? t('PluginSettings.installed') : t('PluginSettings.installPlugin')}</button></div>
            </div>
          })}
          {visible.length === 0 && <div className="settings-filter-empty"><p>{t('PluginSettings.noMatchingPlugins')}</p><button type="button" className="button ghost" onClick={() => setFilter('')}>{t('SidebarSearch.clear')}</button></div>}
        </SettingsGroup>
      </>}
      {activeTab === 'installed' && <SettingsGroup title={t('PluginSettings.installedPlugins')} icon={<PuzzleIcon />}>
        {plugins === null ? <p className="muted">{t('PluginSettings.loadingPlugins')}</p> : plugins.length === 0 ? <p className="muted">{t('PluginSettings.noPluginsInstalledYet')}</p> : plugins.map((plugin) => (
          <div key={plugin.id} className="plugin-row">
            <div className="settings-row">
              <div className="settings-row-text">
                <span id={`${ids}-${plugin.id}`} className="settings-row-label">{pluginName(plugin)}</span>
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
      </SettingsGroup>}
    </div>
  )
}
