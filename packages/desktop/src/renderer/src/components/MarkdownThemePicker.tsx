import { useId } from 'react'
import { t } from '../i18n'
import { MARKDOWN_THEMES, MARKDOWN_THEME_LABEL } from '../markdown-themes'
import { setPreference, usePreferences } from '../preferences'
import { CheckIcon } from './icons'
import { resolveMarkdownTheme, markdownThemeStyle } from '../markdown-theme-packs'

export function MarkdownThemePicker({ compact = false }: { compact?: boolean }) {
  const name = useId()
  const theme = usePreferences((state) => state.markdownTheme)
  const packs = usePreferences((state) => state.markdownThemePacks)
  const selected = resolveMarkdownTheme(theme, packs)
  if (compact) return <select className="input markdown-theme-select" aria-label={t('MarkdownTheme.title')} value={selected.pack ? theme : selected.base} onChange={(event) => {
    const next = event.target.value
    if (MARKDOWN_THEMES.some((each) => each === next) || packs.some((each) => `user:${each.id}` === next)) setPreference('markdownTheme', next)
  }}>
    {MARKDOWN_THEMES.map((each) => <option key={each} value={each}>{MARKDOWN_THEME_LABEL[each].name}</option>)}
    {packs.length > 0 && <optgroup label={t('MarkdownTheme.library')}>{packs.map((each) => <option key={each.id} value={`user:${each.id}`}>{each.name}</option>)}</optgroup>}
  </select>

  return <fieldset className="markdown-theme-picker">
    <legend>{t('MarkdownTheme.title')}</legend>
    <p className="muted">{t('MarkdownTheme.description')}</p>
    <div className="markdown-theme-grid">
      {MARKDOWN_THEMES.map((each) => <label key={each} className="markdown-theme-option" title={MARKDOWN_THEME_LABEL[each].description}>
        <input type="radio" name={name} value={each} aria-label={MARKDOWN_THEME_LABEL[each].name} aria-description={MARKDOWN_THEME_LABEL[each].description} checked={!selected.pack && each === selected.base} onChange={() => setPreference('markdownTheme', each)} />
        <span className="markdown-theme-swatch markdown-sheet" data-md-theme={each} aria-hidden="true"><i /><i /><i /></span>
        <span><strong>{MARKDOWN_THEME_LABEL[each].name}</strong></span>
        <CheckIcon />
      </label>)}
    </div>
    <p className="markdown-theme-description muted" role="status">{selected.pack?.description || MARKDOWN_THEME_LABEL[selected.base].description}</p>
    {packs.map((each) => <label key={each.id} className="markdown-theme-option">
      <input type="radio" name={name} value={`user:${each.id}`} checked={selected.pack?.id === each.id} onChange={() => setPreference('markdownTheme', `user:${each.id}`)} />
      <span className="markdown-theme-swatch markdown-sheet" data-md-theme={each.base} style={markdownThemeStyle(each)} aria-hidden="true"><i /><i /><i /></span>
      <span><strong>{each.name}</strong><span>{each.description || each.author || t('MarkdownTheme.custom')}</span></span><CheckIcon />
    </label>)}
  </fieldset>
}
