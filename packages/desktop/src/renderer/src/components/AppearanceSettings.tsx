import { useEffect, useId, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { useCore } from '../core-store'
import { DEFAULT_PREFERENCES, setPreference, usePreferences } from '../preferences'
import { useChatTypeface } from '../chat-typeface'
import { changedAppearancePreferences, withAppearanceDefaults, type AppearanceSection } from '../appearance-preferences'
import { codeFontStack } from '../code-font'
import { PALETTE_LABEL } from '../palettes'
import { BACKDROP_LABEL } from '../backdrops'
import { Resettable, Segmented, SettingsGroup, SettingsRow, Stepper, Toggle } from './SettingsControls'
import { ChatFontPicker } from './ChatFontPicker'
import { CodeFontPicker } from './CodeFontPicker'
import { CjkFontPicker } from './CjkFontPicker'
import { PalettePicker } from './PalettePicker'
import { BackdropPicker } from './BackdropPicker'
import { ArrowUpIcon, BoardIcon, CheckIcon, ChatIcon, ChevronDownIcon, ClockIcon, GitIcon, GroupChatIcon, InboxIcon, RobotIcon, RotateLeftIcon, TerminalIcon } from './icons'
import { inboxLocked, SIDEBAR_ENTRIES, SIDEBAR_PREFERENCE, sidebarShows, type SidebarEntry } from '../sidebar-entries'

function ThemeMiniature({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    <span className="theme-miniature" data-scheme={scheme}>
      <span className="theme-miniature-nav"><i /><i /><i /></span>
      <span className="theme-miniature-body"><i /><i /><i /><b /></span>
    </span>
  )
}

function ThemePicker() {
  const name = useId()
  const theme = usePreferences((s) => s.theme)
  const options = [
    { value: 'light', label: t('SettingsPage.light') },
    { value: 'dark', label: t('SettingsPage.dark') },
    { value: 'system', label: t('SettingsPage.system') }
  ] as const
  return (
    <fieldset className="theme-picker">
      <legend>{t('SettingsPage.theme')}</legend>
      <p>{t('SettingsPage.withSystemSelectedFollowsTheSystemSLight')}</p>
      <div className="theme-options">
        {options.map((option) => (
          <label key={option.value} className="theme-option">
            <input type="radio" name={name} value={option.value} checked={theme === option.value} onChange={() => setPreference('theme', option.value)} />
            <span className="theme-option-image" aria-hidden="true">
              {option.value !== 'dark' && <ThemeMiniature scheme="light" />}
              {option.value !== 'light' && <ThemeMiniature scheme="dark" />}
            </span>
            <span className="theme-option-label">{option.label}<CheckIcon /></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const SIDEBAR_ENTRY: Record<SidebarEntry, { label: () => string; hint: () => string; icon: () => ReactNode }> = {
  inbox: { label: () => t('InboxEntry.inbox_1125'), hint: () => t('SettingsPage.sidebarInboxHint'), icon: () => <InboxIcon /> },
  routines: { label: () => t('RoutinesEntry.scheduled'), hint: () => t('SettingsPage.sidebarRoutinesHint'), icon: () => <ClockIcon /> },
  git: { label: () => 'Git', hint: () => t('SettingsPage.sidebarGitHint'), icon: () => <GitIcon /> },
  discussions: { label: () => t('DiscussionView.groupChat_910'), hint: () => t('SettingsPage.sidebarDiscussionsHint'), icon: () => <GroupChatIcon /> }
}

// What the sidebar's top would show: the fixed entries, and the optional ones left on.
function SidebarPreview({ preferences }: { preferences: Parameters<typeof sidebarShows>[1] }) {
  const sources = useCore((s) => s.sources)
  return (
    <nav className="appearance-preview-sidebar" aria-hidden="true">
      <span><BoardIcon />{t('OverviewEntry.overview_1276')}</span>
      {SIDEBAR_ENTRIES.filter((entry) => entry !== 'discussions' && sidebarShows(entry, preferences, sources)).map((entry) => <span key={entry}>{SIDEBAR_ENTRY[entry].icon()}{SIDEBAR_ENTRY[entry].label()}</span>)}
      <span><RobotIcon />{t('AgentProfiles.title')}</span>
      <span><BoardIcon />{t('SearchPalette.tasks')}</span>
      {sidebarShows('discussions', preferences, sources) && <span>{SIDEBAR_ENTRY.discussions.icon()}{SIDEBAR_ENTRY.discussions.label()}</span>}
      <span><ChatIcon />{t('SearchPalette.conversations')}</span>
    </nav>
  )
}

function SidebarSettings() {
  const preferences = usePreferences()
  const sources = useCore((s) => s.sources)
  const locked = inboxLocked(sources)
  return (
    <>
    <SettingsGroup title={t('SettingsPage.sidebarEntries')}>
      {SIDEBAR_ENTRIES.map((entry) => {
        const key = SIDEBAR_PREFERENCE[entry]
        const fixed = entry === 'inbox' && locked
        return <SettingsRow key={entry} label={SIDEBAR_ENTRY[entry].label()} description={fixed ? t('SettingsPage.sidebarInboxLocked') : SIDEBAR_ENTRY[entry].hint()}
          control={(labelId) => <Toggle labelId={labelId} checked={fixed || preferences[key]} disabled={fixed} onChange={(next) => setPreference(key, next)} />} />
      })}
    </SettingsGroup>
    <p className="settings-note">{t('SettingsPage.sidebarEntriesHint')}</p>
    </>
  )
}

function AppearancePreview({ section, comparing, onCompare }: { section: AppearanceSection; comparing: boolean; onCompare: () => void }) {
  const typeface = useChatTypeface()
  const current = usePreferences()
  const preview = comparing ? withAppearanceDefaults(current, DEFAULT_PREFERENCES, section) : current
  const { palette, theme, backdrop, chatWidth, foldTurns, terminalFontSize, terminalLineHeight, colorPrompt } = preview
  const codeStyle = { fontFamily: codeFontStack(preview.codeFontFamily, preview.codeCjkFontFamily) }
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = () => setSystemDark(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  const scheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  const previewTypeface = comparing && section === 'chat'
    ? { 'data-font-size': DEFAULT_PREFERENCES.chatFontSize, 'data-font': DEFAULT_PREFERENCES.chatFont }
    : typeface
  return (
    <aside className="appearance-preview" aria-label={t('SettingsPage.livePreview')}>
      <div className="appearance-preview-heading"><h3>{t('SettingsPage.livePreview')}</h3><span>{PALETTE_LABEL[palette].name}</span></div>
      {section !== 'language' && <button type="button" className="button appearance-compare" disabled={!comparing && changedAppearancePreferences(current, DEFAULT_PREFERENCES, section).length === 0} aria-pressed={comparing} onClick={onCompare}>{comparing ? t('SettingsPage.showCurrent') : t('SettingsPage.compareDefaults')}</button>}
      <div className="appearance-preview-window" data-palette={palette} data-backdrop={backdrop === 'none' ? undefined : backdrop} data-section={section} data-comparing={comparing || undefined} style={{ colorScheme: scheme }}>
        <div className="appearance-preview-toolbar"><ChatIcon /><span>Antumi</span><span className="appearance-preview-sample">{t('SettingsPage.sample')}</span></div>
        {section === 'sidebar' && <SidebarPreview preferences={preview} />}
        <div className="appearance-preview-chat chat-view" {...previewTypeface}>
          <div className="appearance-preview-thread" data-width={chatWidth}>
            <p className="appearance-preview-user">{t('SettingsPage.previewPrompt')}</p>
            <div className="appearance-preview-agent"><span className="appearance-preview-mark"><RobotIcon /></span><strong>Agent</strong></div>
            <details className="appearance-preview-work" key={String(foldTurns)} open={!foldTurns}>
              <summary>{t('SettingsPage.previewWork')}</summary>
              <p>{t('SettingsPage.previewWorkDetail')}</p>
            </details>
            <p className="appearance-preview-answer">{t('SettingsPage.previewAnswer')}</p>
            <pre className="appearance-preview-code" style={codeStyle}><code><span className="code-keyword">const</span> task = {'{'}{'\n'}  title: <span className="code-string">'Antumi'</span>,{'\n'}  status: <span className="code-string">'pending'</span>{'\n'}{'}'}</code></pre>
          </div>
          <div className="appearance-preview-composer" aria-hidden="true"><span>{t('SettingsPage.previewReply')}</span><ArrowUpIcon /></div>
        </div>
        <div className="appearance-preview-terminal" style={{ ...codeStyle, fontSize: terminalFontSize, lineHeight: terminalLineHeight * 1.33 }}>
          <div><TerminalIcon /><span>{t('SettingsPage.terminal')}</span></div>
          <p><span className="appearance-preview-prompt" data-colored={colorPrompt}>$</span> pnpm dev</p>
          <p className="appearance-preview-terminal-comment">{t('SettingsPage.previewTerminal')}</p>
          {section === 'terminal' && <pre className="appearance-preview-code"><code><span className="code-keyword">const</span> title ={'\n'}  <span className="code-string">'{t('SettingsPage.previewCodeTitle')}'</span>{'\n'}<span className="code-keyword">const</span> task = {'{'}{'\n'}  title,{'\n'}  status: <span className="code-string">'pending'</span>{'\n'}{'}'}</code></pre>}
        </div>
      </div>
      <p className="appearance-preview-caption" role="status">{comparing ? t('SettingsPage.comparingDefaults') : t('SettingsPage.previewHint')}</p>
    </aside>
  )
}

export function AppearanceSettings() {
  const sectionLabelId = useId()
  // A way in that asked for a tab (the sidebar's menu) gets it once.
  const [section, setSection] = useState<AppearanceSection>(() => useCore.getState().appearanceTab ?? 'colors')
  useEffect(() => { useCore.setState({ appearanceTab: null }) }, [])
  const [comparing, setComparing] = useState(false)
  const current = usePreferences()
  const changed = changedAppearancePreferences(current, DEFAULT_PREFERENCES, section)
  const resetGroup = () => {
    for (const key of changed) setPreference(key, DEFAULT_PREFERENCES[key])
    setComparing(false)
  }
  const backdropLabelId = useId()
  const backdrop = usePreferences((s) => s.backdrop)
  const language = usePreferences((s) => s.language)
  const terminalFontSize = usePreferences((s) => s.terminalFontSize)
  const terminalLineHeight = usePreferences((s) => s.terminalLineHeight)
  const colorPrompt = usePreferences((s) => s.colorPrompt)
  const colorPromptSupported = useCore((s) => s.rpc?.features.includes('terminal-color-prompt') ?? false)
  const chatFontSize = usePreferences((s) => s.chatFontSize)
  const chatWidth = usePreferences((s) => s.chatWidth)
  const foldTurns = usePreferences((s) => s.foldTurns)
  return (
    <div className="appearance-workspace">
      <div className="appearance-sections">
        <span id={sectionLabelId} hidden>{t('SettingsPage.appearanceSections')}</span>
        <Segmented labelId={sectionLabelId} value={section} onChange={(next) => { setSection(next); setComparing(false) }} options={[
          { value: 'colors', label: t('SettingsPage.theme') },
          { value: 'chat', label: t('SettingsPage.chat') },
          { value: 'terminal', label: t('SettingsPage.terminal') },
          { value: 'sidebar', label: t('SettingsPage.sidebar') },
          { value: 'language', label: t('SettingsPage.language') }
        ]} />
      </div>
      <div className="appearance-layout">
      <div className="appearance-controls">
        <div hidden={section !== 'colors'}>
        <SettingsGroup title={t('SettingsPage.colors')}>
          <ThemePicker />
          <SettingsRow
            label={t('SettingsPage.palette')}
            description={t('SettingsPage.colorsForTheEntireInterfaceWithLightAnd')}
            control={(labelId) => <PalettePicker labelId={labelId} />}
          />
          <details className="appearance-backdrop">
            <summary id={backdropLabelId}>
              <span>{t('SettingsPage.gradientBackgroundExperimental')}</span>
              <span className="appearance-backdrop-value">{backdrop === 'none' ? t('common.off') : BACKDROP_LABEL[backdrop]}</span>
              <ChevronDownIcon />
            </summary>
            <p>{t('SettingsPage.aGradientBehindTheSidebarAndWindowEdges')}</p>
            <BackdropPicker labelId={backdropLabelId} />
          </details>
        </SettingsGroup>
        </div>
        <div hidden={section !== 'chat'}>
        <SettingsGroup title={t('SettingsPage.chat')}>
          <SettingsRow
            label={t('SettingsPage.fontSize')}
            description={t('SettingsPage.textSizeForMessagesWorkDetailsAndComposer')}
            control={(labelId) => (
              <Resettable label={t('SettingsPage.chatFontSize')} changed={chatFontSize !== DEFAULT_PREFERENCES.chatFontSize} onReset={() => setPreference('chatFontSize', DEFAULT_PREFERENCES.chatFontSize)}>
                <Stepper
                  labelId={labelId}
                  value={chatFontSize}
                  min={10}
                  max={20}
                  unit="px"
                  onChange={(next) => setPreference('chatFontSize', next)}
                />
              </Resettable>
            )}
          />
          <SettingsRow
            label={t('SettingsPage.font')}
            description={t('SettingsPage.serifChangesProseOnlyLeavingCodeUnchanged')}
            control={(labelId) => <ChatFontPicker labelId={labelId} />}
          />
          <SettingsRow
            label={t('SettingsPage.chineseFont')}
            description={t('SettingsPage.chineseTextInChatUsesThisFontEnglish')}
            control={(labelId) => <CjkFontPicker labelId={labelId} preference="chatCjkFontFamily" title={t('SettingsPage.chooseChineseChatFont')} />}
          />
          <SettingsRow
            label={t('SettingsPage.pageWidth')}
            description={t('SettingsPage.maximumMessageAndComposerWidthNarrow800pxMedium')}
            control={(labelId) => (
              <Segmented
                labelId={labelId}
                value={chatWidth}
                onChange={(next) => setPreference('chatWidth', next)}
                options={[
                  { value: 'narrow', label: t('SettingsPage.narrow') },
                  { value: 'medium', label: t('SettingsPage.medium') },
                  { value: 'full', label: t('SettingsPage.fullWidth') }
                ]}
              />
            )}
          />
          <SettingsRow
            label={t('SettingsPage.foldCompletedTurns')}
            description={t('SettingsPage.foldReasoningCommandsAndInterimRepliesUnderWorked')}
            control={(labelId) => (
              <Toggle labelId={labelId} checked={foldTurns} onChange={(next) => setPreference('foldTurns', next)} />
            )}
          />
        </SettingsGroup>
        </div>
        <div hidden={section !== 'terminal'}>
        <SettingsGroup title={t('SettingsPage.terminalAndCode')}>
          <SettingsRow
            label={t('SettingsPage.codeFont')}
            description={t('SettingsPage.fontForTerminalsCodeBlocksChangesAndFile')}
            control={(labelId) => <CodeFontPicker labelId={labelId} />}
          />
          <SettingsRow
            label={t('SettingsPage.chineseCodeFont')}
            description={t('SettingsPage.fallbackForChineseInTerminalsCodeAndPreviews')}
            control={(labelId) => <CjkFontPicker labelId={labelId} preference="codeCjkFontFamily" title={t('SettingsPage.chooseChineseCodeFont')} />}
          />
          <SettingsRow
            label={t('SettingsPage.terminalFontSize')}
            description={t('SettingsPage.appliesImmediatelyToOpenTerminals')}
            control={(labelId) => (
              <Resettable label={t('SettingsPage.terminalFontSize')} changed={terminalFontSize !== DEFAULT_PREFERENCES.terminalFontSize} onReset={() => setPreference('terminalFontSize', DEFAULT_PREFERENCES.terminalFontSize)}>
                <Stepper
                  labelId={labelId}
                  value={terminalFontSize}
                  min={10}
                  max={20}
                  unit="px"
                  onChange={(next) => setPreference('terminalFontSize', next)}
                />
              </Resettable>
            )}
          />
          <SettingsRow
            label={t('SettingsPage.terminalLineHeight')}
            description={t('SettingsPage.multiplierOfTheFontSOwnLineHeight')}
            control={(labelId) => (
              <Resettable label={t('SettingsPage.terminalLineHeight')} changed={terminalLineHeight !== DEFAULT_PREFERENCES.terminalLineHeight} onReset={() => setPreference('terminalLineHeight', DEFAULT_PREFERENCES.terminalLineHeight)}>
                <Segmented
                  labelId={labelId}
                  value={String(terminalLineHeight)}
                  onChange={(next) => setPreference('terminalLineHeight', Number(next))}
                  options={[
                    { value: '1', label: '1.0' },
                    { value: '1.2', label: '1.2' },
                    { value: '1.4', label: '1.4' }
                  ]}
                />
              </Resettable>
            )}
          />
          {colorPromptSupported && (
            <SettingsRow
              label={t('SettingsPage.coloredPrompt')}
              description={t('SettingsPage.forZshWithoutACustomPromptUseColors')}
              control={(labelId) => <Toggle labelId={labelId} checked={colorPrompt} onChange={(next) => setPreference('colorPrompt', next)} />}
            />
          )}
        </SettingsGroup>
        </div>
        <div hidden={section !== 'sidebar'}>
        <SidebarSettings />
        </div>
        <div hidden={section !== 'language'}>
        <SettingsGroup title={t('language.interfaceLanguage')}>
          <SettingsRow label={t('language.interfaceLanguage')} description={t('language.description')}
            control={(labelId) => <Segmented labelId={labelId} value={language} onChange={(value) => setPreference('language', value)}
              options={[{ value: 'system', label: t('SettingsPage.system') }, { value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }]} />} />
        </SettingsGroup>
        </div>
        <footer className="appearance-group-footer">
          <span role="status">{changed.length ? t('SettingsPage.customizedCount', { count: changed.length }) : t('SettingsPage.usingDefaults')}</span>
          <button type="button" className="button ghost" disabled={changed.length === 0} onClick={resetGroup}><RotateLeftIcon />{t('SettingsPage.resetGroup')}</button>
        </footer>
      </div>
      <AppearancePreview section={section} comparing={comparing} onCompare={() => setComparing(!comparing)} />
      </div>
    </div>
  )
}
