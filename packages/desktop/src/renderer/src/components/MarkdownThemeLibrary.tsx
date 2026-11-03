import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n'
import { MARKDOWN_THEMES, MARKDOWN_THEME_LABEL } from '../markdown-themes'
import { MARKDOWN_COMMUNITY_THEMES } from '../markdown-community-themes'
import { MarkdownThemePack, MAX_THEME_PACKS, exportMarkdownTheme, importMarkdownTheme, resolveMarkdownTheme, type MarkdownThemeManifest } from '../markdown-theme-packs'
import { markdownThemeCss, MAX_THEME_CSS } from '../markdown-theme-css'
import { usePreferences } from '../preferences'
import { askConfirm } from '../confirm-dialog'
import { communityThemeUpdate, installCommunityTheme, type CommunityTheme } from '../community-theme-catalog'

function download(pack: MarkdownThemePack) {
  const url = URL.createObjectURL(new Blob([exportMarkdownTheme(pack)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${pack.name.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'theme'}.antumi-theme.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function palettePair() {
  const probe = document.createElement('span')
  probe.style.color = 'var(--accent)'
  document.body.append(probe)
  const read = (scheme: string) => {
    probe.style.colorScheme = scheme
    return `#${(getComputedStyle(probe).color.match(/\d+/g) ?? []).slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
  }
  const pair = { light: read('light'), dark: read('dark') }
  probe.remove()
  return pair
}

export function MarkdownThemeLibrary({ onPreview }: { onPreview: (pack: MarkdownThemePack | null) => void }) {
  const packs = usePreferences((state) => state.markdownThemePacks)
  const selection = usePreferences((state) => state.markdownTheme)
  const selected = resolveMarkdownTheme(selection, packs)
  const [draft, setDraft] = useState<MarkdownThemePack | null>(null)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'mine' | 'community'>('mine')
  const file = useRef<HTMLInputElement>(null)
  const valid = useMemo(() => draft ? MarkdownThemePack.safeParse(draft) : null, [draft])
  const cssError = useMemo(() => draft ? markdownThemeCss(draft.css, 'preview').error : null, [draft?.css])
  useEffect(() => { onPreview(valid?.success ? valid.data : null) }, [valid, onPreview])
  const create = (manifest?: MarkdownThemeManifest) => {
    setMessage('')
    const template = manifest ?? selected.pack ?? { format: 'antumi-markdown-theme', version: 1, name: t('MarkdownTheme.newName'), base: selected.base }
    setDraft(MarkdownThemePack.parse({ ...template, id: crypto.randomUUID(), communityId: undefined }))
  }
  const save = () => {
    if (!valid?.success) return
    const current = usePreferences.getState().markdownThemePacks
    const exists = current.some((each) => each.id === valid.data.id)
    if (!exists && current.length >= MAX_THEME_PACKS) { setMessage(t('MarkdownTheme.libraryFull', { count: MAX_THEME_PACKS })); return }
    usePreferences.setState({ markdownThemePacks: exists ? current.map((each) => each.id === valid.data.id ? valid.data : each) : [...current, valid.data], markdownTheme: `user:${valid.data.id}` })
    setDraft(null)
    setMessage(t('MarkdownTheme.saved'))
  }
  const install = async (theme: CommunityTheme) => {
    const installed = usePreferences.getState().markdownThemePacks.find((each) => each.communityId === theme.id)
    if (communityThemeUpdate(theme, installed) && !await askConfirm({ message: t('MarkdownTheme.updateConfirm', { name: theme.manifest.name, version: theme.manifest.themeVersion }), confirm: t('MarkdownTheme.update') })) return
    const current = usePreferences.getState().markdownThemePacks
    const existing = current.find((each) => each.communityId === theme.id)
    if (!existing && current.length >= MAX_THEME_PACKS) { setMessage(t('MarkdownTheme.libraryFull', { count: MAX_THEME_PACKS })); return }
    const next = installCommunityTheme(theme, current, crypto.randomUUID())
    const pack = next.find((each) => each.communityId === theme.id)
    if (!pack) return
    usePreferences.setState({ markdownThemePacks: next, markdownTheme: `user:${pack.id}` })
    setDraft(null)
    setMessage(t('MarkdownTheme.saved'))
  }
  const remove = async (pack: MarkdownThemePack) => {
    if (!await askConfirm({ message: t('MarkdownTheme.removeConfirm', { name: pack.name }), confirm: t('MarkdownTheme.remove'), danger: true })) return
    const current = usePreferences.getState()
    usePreferences.setState({ markdownThemePacks: current.markdownThemePacks.filter((each) => each.id !== pack.id), markdownTheme: current.markdownTheme === `user:${pack.id}` ? 'default' : current.markdownTheme })
    if (draft?.id === pack.id) setDraft(null)
  }

  return <div className="markdown-theme-library">
    <div className="markdown-library-tabs" role="group" aria-label={t('MarkdownTheme.library')}>
      <button type="button" className="button ghost" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>{t('MarkdownTheme.library')}</button>
      <button type="button" className="button ghost" aria-pressed={tab === 'community'} onClick={() => setTab('community')}>{t('MarkdownTheme.community')}</button>
    </div>
    <div className="markdown-library-actions">
      <button type="button" className="button" disabled={Boolean(draft)} onClick={() => create()}>{t('MarkdownTheme.create')}</button>
      <button type="button" className="button" disabled={Boolean(draft)} onClick={() => file.current?.click()}>{t('MarkdownTheme.import')}</button>
      <input ref={file} type="file" accept=".css,.json" hidden onChange={(event) => {
        const picked = event.target.files?.[0]
        event.target.value = ''
        if (!picked) return
        if (picked.size > 65_536) { setMessage(t('MarkdownTheme.importError')); return }
        void picked.text().then((text) => {
          try { create(importMarkdownTheme(text, picked.name)); setTab('mine') }
          catch { setMessage(t('MarkdownTheme.importError')) }
        }).catch(() => setMessage(t('MarkdownTheme.importError')))
      }} />
    </div>
    {message && <p role="status" className="settings-note">{message}</p>}
    {tab === 'community' ? <>
      <p className="settings-note">{t(MARKDOWN_COMMUNITY_THEMES.length > 0 ? 'MarkdownTheme.communityAvailable' : 'MarkdownTheme.communityHint')} <a href="https://github.com/flyhero/antumi/tree/main/community/markdown-themes" target="_blank" rel="noreferrer">{t('MarkdownTheme.contribute')}</a></p>
      {MARKDOWN_COMMUNITY_THEMES.map((each) => {
        const installed = packs.find((pack) => pack.communityId === each.id)
        const update = communityThemeUpdate(each, installed)
        return <div className="markdown-community-card" key={each.id}>
          <div className="markdown-community-previews">
            <img src={each.lightPreview} alt={t('MarkdownTheme.lightPreview', { name: each.manifest.name })} loading="lazy" />
            <img src={each.darkPreview} alt={t('MarkdownTheme.darkPreview', { name: each.manifest.name })} loading="lazy" />
          </div>
          <div className="markdown-library-row">
            <div><strong>{each.manifest.name}</strong><span>{each.manifest.author} · {each.manifest.license} · v{each.manifest.themeVersion}</span><span>{each.manifest.description}</span><a href={each.manifest.source} target="_blank" rel="noreferrer">{t('MarkdownTheme.source')}</a></div>
            <button type="button" className="button" disabled={Boolean(draft)} onClick={() => create(each.manifest)}>{t('MarkdownTheme.preview')}</button>
            <button type="button" className="button" disabled={Boolean(draft)} onClick={() => void install(each)}>{t(update ? 'MarkdownTheme.update' : installed ? 'MarkdownTheme.useInstalled' : 'MarkdownTheme.install')}</button>
          </div>
        </div>
      })}
    </> : packs.map((each) => <div className="markdown-library-row" key={each.id}>
      <div><strong>{each.name}</strong><span>{each.author || MARKDOWN_THEME_LABEL[each.base].name}{each.license && ` · ${each.license}`}</span>{each.source && <a href={each.source} target="_blank" rel="noreferrer">{t('MarkdownTheme.source')}</a>}</div>
      <button type="button" className="button ghost" disabled={Boolean(draft)} onClick={() => { setDraft(each); setMessage('') }}>{t('chatTools.edit')}</button>
      <button type="button" className="button ghost" onClick={() => download(each)}>{t('MarkdownTheme.export')}</button>
      <button type="button" className="button ghost" disabled={Boolean(draft)} onClick={() => void remove(each)}>{t('MarkdownTheme.remove')}</button>
    </div>)}
    {draft && <div className="markdown-theme-editor">
      <p className="settings-note">{t('MarkdownTheme.draftHint')}</p>
      <label>{t('MarkdownTheme.name')}<input className="input" value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>{t('MarkdownTheme.author')}<input className="input" value={draft.author} maxLength={80} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></label>
      <label>{t('MarkdownTheme.summary')}<input className="input" value={draft.description} maxLength={240} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>{t('MarkdownTheme.base')}<select className="input" value={draft.base} onChange={(event) => {
        const base = MARKDOWN_THEMES.find((each) => each === event.target.value)
        if (base) setDraft({ ...draft, base })
      }}>{MARKDOWN_THEMES.map((each) => <option key={each} value={each}>{MARKDOWN_THEME_LABEL[each].name}</option>)}</select></label>
      <label className="markdown-theme-override"><input type="checkbox" checked={Boolean(draft.primary)} onChange={(event) => setDraft({ ...draft, primary: event.target.checked ? palettePair() : undefined })} />{t('MarkdownTheme.primary')}</label>
      {draft.primary && <div className="markdown-theme-fields">
        <label>{t('SettingsPage.light')}<input type="color" value={draft.primary.light} onChange={(event) => setDraft({ ...draft, primary: { light: event.target.value, dark: draft.primary?.dark ?? event.target.value } })} /></label>
        <label>{t('SettingsPage.dark')}<input type="color" value={draft.primary.dark} onChange={(event) => setDraft({ ...draft, primary: { dark: event.target.value, light: draft.primary?.light ?? event.target.value } })} /></label>
      </div>}
      <label>CSS<textarea aria-label="CSS" className="input mono" rows={12} spellCheck={false} value={draft.css} maxLength={MAX_THEME_CSS} placeholder="h2 { color: var(--md-primary-color); }" onChange={(event) => setDraft({ ...draft, css: event.target.value })} /></label>
      <p className="settings-note">{t('MarkdownTheme.cssHint')}</p>
      {!valid?.success && <p role="alert" className="markdown-theme-error">{cssError ? t('MarkdownTheme.cssError', { reason: cssError }) : t('MarkdownTheme.invalidFields')}</p>}
      <div className="markdown-library-actions">
        <button type="button" className="button primary" disabled={!valid?.success} onClick={save}>{t('MarkdownTheme.save')}</button>
        <button type="button" className="button" onClick={() => setDraft(null)}>{t('MarkdownTheme.cancel')}</button>
      </div>
    </div>}
  </div>
}
