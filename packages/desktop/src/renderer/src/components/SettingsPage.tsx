import { UsageAutomationSettings } from './UsageAutomationSettings'
import { getLocale, localized, messageSearchText, t, tr } from '../i18n'
import type { BrowserStatus, WireUsage } from '@antumi/protocol'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AGENT_KINDS, agentDescriptor, LANGUAGE_NAMES, PROTOCOL_VERSION, quickModel, TRANSLATE_LANGUAGES, UNATTENDED_MODES, type AgentKind, type SourceDescriptor } from '@antumi/protocol'
import packageJson from '../../../../package.json'
import { perform, setAwakeMode, setChatSettings, setSettingsOpen, useAwakeSupported, useCore, useBrowserSupported, useChatCommandsSupported, useKnowledgeBaseSupported, useMcpServersSupported, useModelProvidersSupported, useSessionImportSupported, useAccountsSupported, useProjectConfigEditSupported, useSkillsSupported, useTranslateSupported, useWireLogSupported } from '../core-store'
import { DEFAULT_PREFERENCES, setPreference, usePreferences } from '../preferences'
import { UNATTENDED_LABEL } from '../schedules'
import { detectedAgents, useInstalledAgents } from '../installed-agents'
import { useAgentCatalog } from '../agent-models'
import { ChatPicker } from './ChatPicker'
import { PluginSettings } from './PluginSettings'
import { InstalledAgentsSettings } from './InstalledAgentsSettings'
import { TitleNamingSettings } from './TitleNamingSettings'
import { AutoArchiveSettings } from './AutoArchiveSettings'
import { ChatFontPicker } from './ChatFontPicker'
import { CodeFontPicker } from './CodeFontPicker'
import { agentLabel } from '../labels'
import { appVersion, canNotify, canShowRequestPopup } from '../desktop-bridge'
import { formatBytes } from '../wire-entries'
import {
  AgentIcon,
  ArrowLeftIcon,
  BellIcon,
  BookIcon,
  BugIcon,
  ChatIcon,
  ContrastIcon,
  FolderIcon,
  GaugeIcon,
  GlobeIcon,
  ArrowUpIcon,
  PlugIcon,
  CloudIcon,
  PersonIcon,
  DownloadIcon,
  PuzzleIcon,
  SourceIcon,
  SearchIcon,
  SparkIcon,
  LockIcon,
  BoltIcon,
  RobotIcon,
  PulseIcon,
  TerminalIcon,
  TranslateIcon
} from './icons'
import { ChatCommandSettings } from './ChatCommandSettings'
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings'
import { SkillsSettingsSection } from './SkillsSettingsSection'
import { McpSettingsSection } from './McpSettingsSection'
import { SessionImportSettings } from './SessionImportSettings'
import { ModelProviderSettings } from './ModelProviderSettings'
import { AgentAccountSettings } from './AgentAccountSettings'
import { CopyButton } from './CopyButton'
import { checkStatusText, GIT_INSTALL_HINT } from '../environment-text'
import { settingsSectionOf } from './SourceInboxView'
import { SourceSettingsSection } from './SourceSettingsSection'
import { projectName } from './ProjectPicker'
import { Resettable, Segmented, SettingsGroup, SettingsRow, Stepper, Toggle } from './SettingsControls'
import { CjkFontPicker } from './CjkFontPicker'
import { SupportSettings } from './SupportSettings'
import { ProjectConfigDialog, projectConfigSummary } from './ProjectConfigDialog'
import { PalettePicker } from './PalettePicker'
import { BackdropPicker } from './BackdropPicker'
import { useOccludesBrowser } from '../browser-occlusion'
import { UpdateSettings } from './UpdateNotice'
import { PetSettings } from './PetSettings'

function AppearanceSettings() {
  const language = usePreferences((s) => s.language)
  const theme = usePreferences((s) => s.theme)
  const terminalFontSize = usePreferences((s) => s.terminalFontSize)
  const terminalLineHeight = usePreferences((s) => s.terminalLineHeight)
  const colorPrompt = usePreferences((s) => s.colorPrompt)
  const colorPromptSupported = useCore((s) => s.rpc?.features.includes('terminal-color-prompt') ?? false)
  const chatFontSize = usePreferences((s) => s.chatFontSize)
  const chatWidth = usePreferences((s) => s.chatWidth)
  const foldTurns = usePreferences((s) => s.foldTurns)
  return (
    <>
      <SettingsGroup title={t('language.interfaceLanguage')}>
        <SettingsRow label={t('language.interfaceLanguage')} description={t('language.description')}
          control={(labelId) => <Segmented labelId={labelId} value={language} onChange={(value) => setPreference('language', value)}
            options={[{ value: 'system', label: t('SettingsPage.system') }, { value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }]} />} />
      </SettingsGroup>
      <SettingsGroup title={t('SettingsPage.colors')}>
        <SettingsRow
          label={t('SettingsPage.theme')}
          description={t('SettingsPage.withSystemSelectedFollowsTheSystemSLight')}
          control={(labelId) => (
            <Segmented
              labelId={labelId}
              value={theme}
              onChange={(next) => setPreference('theme', next)}
              options={[
                { value: 'system', label: t('SettingsPage.system') },
                { value: 'light', label: t('SettingsPage.light') },
                { value: 'dark', label: t('SettingsPage.dark') }
              ]}
            />
          )}
        />
        <SettingsRow
          label={t('SettingsPage.palette')}
          description={t('SettingsPage.colorsForTheEntireInterfaceWithLightAnd')}
          control={(labelId) => <PalettePicker labelId={labelId} />}
        />
        <SettingsRow
          label={t('SettingsPage.gradientBackgroundExperimental')}
          description={t('SettingsPage.aGradientBehindTheSidebarAndWindowEdges')}
          control={(labelId) => <BackdropPicker labelId={labelId} />}
        />
      </SettingsGroup>
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
    </>
  )
}

function NotificationSettings() {
  const notifications = usePreferences((s) => s.notifications)
  const requestPopup = usePreferences((s) => s.requestPopup)
  return (
    <>
      {canNotify() && (
        <SettingsRow
          label={t('SettingsPage.systemNotifications')}
          description={t('SettingsPage.whenTheWindowIsInTheBackgroundNotify')}
          control={(labelId) => <Toggle labelId={labelId} checked={notifications} onChange={(next) => setPreference('notifications', next)} />}
        />
      )}
      {canShowRequestPopup() && (
        <SettingsRow
          label={t('SettingsPage.showPendingRequestsAtTheTopOfThe')}
          description={t('SettingsPage.whileUsingAnotherAppApprovalRequestsAppearAs')}
          control={(labelId) => <Toggle labelId={labelId} checked={requestPopup} onChange={(next) => setPreference('requestPopup', next)} />}
        />
      )}
    </>
  )
}

// The model one agent does small jobs with: its cheapest by default, which the first option names, or
// one the user picked from its catalog.
function QuickModelPicker({ agent }: { agent: AgentKind }) {
  const catalog = useAgentCatalog(agent, true)
  const picked = usePreferences((s) => s.quickModels[agent]) ?? ''
  const cheapest = quickModel(agentDescriptor(agent).quickModels, catalog)
  const cheapestLabel = catalog?.models.find((model) => model.id === cheapest)?.label ?? (catalog === undefined ? '…' : t('ChatPicker.defaultModel'))
  const options = [
    { value: '', label: t('SettingsPage.automatic', { cheapestLabel: cheapestLabel }), description: t('SettingsPage.cheapestSmallModel') },
    ...(catalog?.models ?? []).map((model) => ({ value: model.id, label: model.label, description: model.description || undefined })),
    // A pick the catalog no longer lists stays shown, saying what translates in its place, so it can
    // be changed; core falls back on the cheapest the same way.
    ...(picked && !catalog?.models.some((model) => model.id === picked)
      ? [{ value: picked, label: catalog ? t('SettingsPage.unavailableUsingAutomatic', { picked: picked, cheapestLabel: cheapestLabel }) : picked }]
      : [])
  ]
  return (
    <span className="quick-model">
      <AgentIcon agent={agent} />
      <span className="quick-model-agent">{agentLabel(agent)}</span>
      <ChatPicker
        label={t('SettingsPage.modelForQuickTasks', { value1: agentLabel(agent) })}
        value={picked}
        placeholder={t('SettingsPage.automatic_1569')}
        placement="below"
        align="end"
        options={options}
        onChange={(value) => {
          const { [agent]: _gone, ...rest } = usePreferences.getState().quickModels
          setPreference('quickModels', value ? { ...rest, [agent]: value } : rest)
          if (useCore.getState().chatSettings?.titleModels !== undefined) {
            void setChatSettings({ titleModels: usePreferences.getState().quickModels })
          }
        }}
      />
    </span>
  )
}

function TranslationSettings() {
  const to = usePreferences((s) => s.translateTo)
  const auto = usePreferences((s) => s.autoTranslate)
  const supported = useTranslateSupported()
  return (
    <>
      {!supported && <p className="muted">{t('SettingsPage.theConnectedCoreIsTooOldToTranslate')}</p>}
      <SettingsRow
        label={t('SettingsPage.translateTo')}
        description={t('SettingsPage.aTranslateButtonAppearsWhenAReplyIs')}
        control={(labelId) => (
          <Segmented labelId={labelId} value={to} options={TRANSLATE_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))} onChange={(next) => setPreference('translateTo', next)} />
        )}
      />
      <SettingsRow
        label={t('SettingsPage.autoTranslate')}
        description={t('SettingsPage.translateOnlyRepliesVisibleOnScreenClickOriginal')}
        control={(labelId) => <Toggle labelId={labelId} checked={auto} onChange={(next) => setPreference('autoTranslate', next)} />}
      />
      <p className="settings-note">{t('SettingsPage.usesTheConversationSAgentChooseTheModel')}</p>
    </>
  )
}

function UsageSettings() {
  const showUsage = usePreferences((s) => s.showUsage)
  const hidden = usePreferences((s) => s.hiddenUsageAgents)
  const usage = useCore((s) => s.usage)
  const display = usePreferences((s) => s.usageDisplay)
  const advice = usePreferences((s) => s.quotaAdvice)
  const announcements = useCore((s) => s.chatSettings?.resetAnnouncements)
  return (
    <>
      <SettingsRow
        label={t('SettingsPage.showUsageQuotaInStatusBar')}
        description={t('SettingsPage.subscriptionQuotaWindowsForEachAgentSuchAs')}
        control={(labelId) => (
          <Toggle labelId={labelId} checked={showUsage} onChange={(next) => setPreference('showUsage', next)} />
        )}
      />
      {showUsage && AGENT_KINDS.filter((agent) => usage?.[agent] !== undefined).map((agent) => (
        <SettingsRow key={agent} label={agentLabel(agent)} control={(labelId) => (
          <Toggle labelId={labelId} checked={!hidden.includes(agent)} onChange={(next) => {
            const current = usePreferences.getState().hiddenUsageAgents
            setPreference('hiddenUsageAgents', next ? current.filter((entry) => entry !== agent) : [...current.filter((entry) => entry !== agent), agent])
          }} />
        )} />
      ))}
      <SettingsRow
        label={t('SettingsPage.percentageDisplay')}
        description={t('SettingsPage.changesTheDisplayedNumberOnlyLowQuotaWarning')}
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={display}
            onChange={(next) => setPreference('usageDisplay', next)}
            options={[
              { value: 'used', label: t('SettingsPage.used') },
              { value: 'remaining', label: t('SettingsPage.remaining') }
            ]}
          />
        )}
      />
      <SettingsRow
        label={t('SettingsPage.quotaAdviceAndAlerts')}
        description={t('SettingsPage.estimateUsagePaceAgainstResetTimesShowAdvice')}
        control={(labelId) => (
          <Toggle labelId={labelId} checked={advice} onChange={(next) => setPreference('quotaAdvice', next)} />
        )}
      />
      {announcements !== undefined && (
        <SettingsRow
          label={t('SettingsPage.showServiceWideResetAnnouncements')}
          description={t('SettingsPage.showUpcomingAndRecentResetsWhenServicesSuch')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={announcements} onChange={(next) => void setChatSettings({ resetAnnouncements: next })} />
          )}
        />
      )}
      <UsageAutomationSettings />
    </>
  )
}

// The hosted browser's state in a few words, and what to do about it.
function browserStatusText(status: BrowserStatus | null): string {
  if (!status) return t('SettingsPage.checking')
  switch (status.state) {
    case 'app-closed':
      return t('SettingsPage.notConnectedTheBrowserRunsInTheAntumi')
    case 'starting':
      return t('SettingsPage.starting')
    case 'ready':
      return status.running ? t('SettingsPage.readyAndRunning') : t('SettingsPage.ready')
    case 'error':
      return t('SettingsPage.error', { value1: status.message ?? t('BrowserPanel.unknownError') })
  }
}

function BrowserRows() {
  const status = useCore((s) => s.browser)
  const openOnTab = usePreferences((s) => s.openBrowserOnTab)
  return (
    <>
      <SettingsRow
        label={t('BrowserSidePanel.browser')}
        description={t('SettingsPage.agentOpensScreenshotsAndInteractsWithPagesIn')}
        control={() => <span className="muted">{browserStatusText(status)}</span>}
      />
      <SettingsRow
        label={t('SettingsPage.showBrowserAutomaticallyWhenAgentOpensAPage')}
        description={t('SettingsPage.whenOffClickOpenOnThePageCard')}
        control={(labelId) => (
          <Toggle labelId={labelId} checked={openOnTab} onChange={(next) => setPreference('openBrowserOnTab', next)} />
        )}
      />
    </>
  )
}

function AgentSettings() {
  return (
    <SettingsGroup>
      <InstalledAgentsSettings />
    </SettingsGroup>
  )
}

// What the run rows need from core; with none of them there is no 运行 section.
function useRunSettingsShown(): boolean {
  const awakeSupported = useAwakeSupported()
  const awake = useCore((s) => s.awake)
  const chatSettings = useCore((s) => s.chatSettings)
  return chatSettings?.maxConcurrentAgents !== undefined || Boolean(chatSettings?.agentConcurrency) || (awakeSupported && Boolean(awake))
}

function usePermissionSettingsShown(): boolean {
  const chatSettings = useCore((s) => s.chatSettings)
  return Boolean(chatSettings?.unattendedMode) || chatSettings?.userBrowser !== undefined || chatSettings?.readHistory !== undefined
}

function RunSettings() {
  const awakeSupported = useAwakeSupported()
  const awake = useCore((s) => s.awake)
  const chatSettings = useCore((s) => s.chatSettings)
  // Turned off still counts: its limit holds once it is back on.
  const found = detectedAgents(useCore((s) => s.environment))
  const [perAgentOpen, setPerAgentOpen] = useState(false)
  const concurrency = chatSettings?.agentConcurrency
  return (
    <>
      {chatSettings?.maxConcurrentAgents !== undefined && (
        <SettingsRow
          label={t('SettingsPage.maximumConcurrentAgents')}
          description={t('SettingsPage.atTheLimitNewConversationsMustWaitAnd')}
          control={(labelId) => (
            <Stepper labelId={labelId} value={chatSettings.maxConcurrentAgents ?? 20} min={1} max={50} unit={t('SettingsPage.items')} onChange={(maxConcurrentAgents) => void setChatSettings({ maxConcurrentAgents })} />
          )}
        />
      )}
      {/* One row per agent makes a long page; folded, the current limits still read at a glance. */}
      {concurrency && found.length > 0 && (
        <SettingsRow
          label={t('SettingsPage.perAgentLimits')}
          description={found.map((agent) => `${agentLabel(agent)} ${concurrency[agent] ?? 6}`).join(' · ')}
          control={() => (
            <button type="button" className="button ghost" aria-expanded={perAgentOpen} onClick={() => setPerAgentOpen(!perAgentOpen)}>
              {t(perAgentOpen ? 'ChatPlan.collapse' : 'SettingsPage.adjust')}
            </button>
          )}
        />
      )}
      {concurrency && perAgentOpen && found.map((agent) => (
        <SettingsRow
          key={agent}
          label={t('SettingsPage.concurrency', { value1: agentLabel(agent) })}
          control={(labelId) => (
            <Stepper labelId={labelId} value={concurrency[agent] ?? 6} min={1} max={50} unit={t('SettingsPage.items')} onChange={(count) => void setChatSettings({ agentConcurrency: { [agent]: count } })} />
          )}
        />
      ))}
      {awakeSupported && awake && (
        <SettingsRow
          label={t('SettingsPage.keepComputerAwake')}
          description={t('SettingsPage.agentsWaitingForYourInputDoNotPrevent')}
          control={(labelId) => (
            <Segmented
              labelId={labelId}
              value={awake.mode}
              onChange={(mode) => void setAwakeMode(mode)}
              options={[
                { value: 'on', label: t('SettingsPage.always') },
                { value: 'auto', label: t('SettingsPage.whileAgentsWorkOrSchedulesArePending') },
                { value: 'off', label: t('common.off') }
              ]}
            />
          )}
        />
      )}
    </>
  )
}

// What an agent may do while nobody answers it, and what of the user's it may reach.
function PermissionSettings() {
  const chatSettings = useCore((s) => s.chatSettings)
  return (
    <>
      {chatSettings?.unattendedMode && (
        <SettingsRow
          label={t('SettingsPage.scheduledRunPermissions')}
          description={t('SettingsPage.scheduledTasksAndConversationsStartUnattendedInThis')}
          control={(labelId) => (
            <Segmented
              labelId={labelId}
              value={chatSettings.unattendedMode ?? 'acceptEdits'}
              onChange={(unattendedMode) => void setChatSettings({ unattendedMode })}
              options={UNATTENDED_MODES.map((value) => ({ value, label: UNATTENDED_LABEL[value] }))}
            />
          )}
        />
      )}
      {chatSettings?.userBrowser !== undefined && (
        <SettingsRow
          label={t('SettingsPage.letClaudeCodeUseYourChrome')}
          description={t('SettingsPage.useTheClaudeInChromeExtensionToOpen')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.userBrowser ?? true} onChange={(next) => void setChatSettings({ userBrowser: next })} />
          )}
        />
      )}
      {chatSettings?.readHistory !== undefined && (
        <SettingsRow
          label={t('SettingsPage.letAgentsReadYourAntumiRecords')}
          description={t('SettingsPage.agentsCanListAndReadYourConversationsTasks')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.readHistory ?? true} onChange={(next) => void setChatSettings({ readHistory: next })} />
          )}
        />
      )}
    </>
  )
}

function ConversationSettings() {
  const chatSettings = useCore((s) => s.chatSettings)
  const installed = useInstalledAgents()
  return (
    <>
      {chatSettings && (
        <SettingsRow
          label={t('SettingsPage.suggestNextStepsAfterEachTurn')}
          description={t('SettingsPage.predictYourNextMessageInGrayAfterEach')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.promptSuggestions} onChange={(next) => void setChatSettings({ promptSuggestions: next })} />
          )}
        />
      )}
      {chatSettings?.userTodos !== undefined && (
        <SettingsRow
          label={t('SettingsPage.trackToDos')}
          description={t('SettingsPage.agentRecordsThingsYouNeedToDoLater')}
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.userTodos ?? true} onChange={(next) => void setChatSettings({ userTodos: next })} />
          )}
        />
      )}
      <TitleNamingSettings />
      <AutoArchiveSettings />
      <SettingsRow
        label={t('SettingsPage.modelForQuickTasks_1609')}
        description={t('SettingsPage.useThisAgentSModelForTranslationCommit')}
        control={() => (
          <span className="quick-models">
            {installed.map((agent) => <QuickModelPicker key={agent} agent={agent} />)}
          </span>
        )}
      />
    </>
  )
}

function ProjectSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const [projects, setProjects] = useState<string[] | null>(null)

  useEffect(() => {
    if (connected) {
      void perform((rpc) => rpc.call('projects.recent', {})).then((recent) => setProjects(recent ?? []))
    }
  }, [connected])

  const forget = async (projectPath: string) => {
    if (await perform((rpc) => rpc.call('projects.forget', { path: projectPath }))) {
      setProjects((current) => current?.filter((entry) => entry !== projectPath) ?? null)
    }
  }

  if (!connected) {
    return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  }
  if (projects === null) {
    return <p className="settings-empty">{t('DashboardPanel.loading')}</p>
  }
  if (projects.length === 0) {
    return <p className="settings-empty">{t('SettingsPage.noRecentProjectsProjectsAddedToTasksOr')}</p>
  }
  return (
    <>
      <p className="settings-note">{t('SettingsPage.projectConfigurationIsStoredInAntumiProjectJson')}</p>
      <ul className="settings-project-list">
        {projects.map((projectPath) => <ProjectRow key={projectPath} projectPath={projectPath} onForget={() => void forget(projectPath)} />)}
      </ul>
    </>
  )
}

// What a project's config holds, in a few words; asked of core when the row shows and after a save.
function ProjectRow({ projectPath, onForget }: { projectPath: string; onForget: () => void }) {
  const editable = useProjectConfigEditSupported()
  const rpc = useCore((s) => s.rpc)
  const [summary, setSummary] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [reads, setReads] = useState(0)
  useEffect(() => {
    if (!rpc || !editable) return
    let current = true
    rpc.call('projects.config', { path: projectPath }).then(
      (info) => { if (current) setSummary(info ? projectConfigSummary(info.config) : null) },
      () => { if (current) setSummary(t('SettingsPage.invalidFormat')) }
    )
    return () => { current = false }
  }, [rpc, editable, projectPath, reads])
  return (
    <li className="settings-project">
      <span className="settings-project-name">{projectName(projectPath)}</span>
      <span className="settings-project-path mono" title={projectPath}>
        {projectPath}
      </span>
      {summary && <span className="settings-project-config muted">{summary}</span>}
      {editable && <button type="button" className="button" onClick={() => setEditing(true)}>{t('ProjectConfigDialog.projectConfiguration')}</button>}
      <button type="button" className="button" onClick={onForget}>{t('ChatQuoteCards.remove')}</button>
      {editing && <ProjectConfigDialog projectPath={projectPath} onClose={() => setEditing(false)} onSaved={() => setReads((count) => count + 1)} />}
    </li>
  )
}

// Read when the section opens and after each change: the wire log grows while agents run.
function DebugSettings() {
  const rpc = useCore((s) => s.rpc)
  const wireLog = useCore((s) => s.chatSettings?.wireLog ?? false)
  const [usage, setUsage] = useState<WireUsage | null>(null)
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    if (!rpc) return
    let current = true
    void rpc.call('debug.wireUsage', {}).then((found) => { if (current) setUsage(found) }, () => {})
    return () => { current = false }
  }, [rpc, wireLog])
  const clear = async () => {
    if (!rpc || clearing) return
    setClearing(true)
    const left = await perform((connection) => connection.call('debug.clearWire', {}))
    if (left) setUsage(left)
    setClearing(false)
  }
  return (
    <>
      <SettingsRow
        label={t('SettingsPage.recordRawAgentTraffic')}
        description={t('SettingsPage.recordEveryIncomingAndOutgoingLineIncludingStderr')}
        control={(labelId) => <Toggle labelId={labelId} checked={wireLog} onChange={(next) => void setChatSettings({ wireLog: next })} />}
      />
      <SettingsRow
        label={t('SettingsPage.alreadyRecorded')}
        description={t('SettingsPage.storedInAntumiSessionsSessionWireUpTo', { value1: usage ? t('SettingsPage.segmentsTotal', { value1: usage.files, value2: formatBytes(usage.bytes) }) : '' })}
        control={() => (
          <button type="button" className="button" disabled={clearing || !usage || usage.files === 0} onClick={() => void clear()}>{t('SettingsPage.deleteAll')}</button>
        )}
      />
    </>
  )
}

const CONNECTION_TEXT = localized(() => ({ connected: t('SettingsPage.connected'), connecting: t('SettingsPage.connecting'), 'waiting-for-core': t('SettingsPage.waitingForCoreToStart') } as const))

// Not an agent, but every task needs it for its worktree: what core found, and how to install it.
function GitRow() {
  const git = useCore((s) => s.environment?.checks.find((check) => check.tool === 'git'))
  if (!git) return null
  const missing = git.status === 'missing'
  return (
    <SettingsRow
      label="Git"
      description={missing ? t('SettingsPage.eachTaskRunsInItsOwnWorktreeWhich') : (git.path ?? undefined)}
      control={() => (
        <span className="git-status">
          <span className="environment-pill" data-level={missing ? 'danger' : 'ok'}>{checkStatusText(git)}</span>
          {missing && (
            <span className="environment-fix">
              <code>{GIT_INSTALL_HINT()}</code>
              <CopyButton text={GIT_INSTALL_HINT()} label={t('InstalledAgentsSettings.copyCommand')} />
            </span>
          )}
        </span>
      )}
    />
  )
}

function AboutSettings() {
  const connection = useCore((s) => s.connection)
  // What runs, not what the renderer was built from: a beta build sets its own version.
  const [version, setVersion] = useState(packageJson.version)
  useEffect(() => {
    void appVersion().then((running) => { if (running) setVersion(running) })
  }, [])
  return (
    <>
      <SettingsRow label={t('SettingsPage.desktopVersion')} control={() => <span className="mono">{version}</span>} />
      <UpdateSettings />
      <SettingsRow label={t('SettingsPage.protocolVersion')} control={() => <span className="mono">{PROTOCOL_VERSION}</span>} />
      <SettingsRow
        label="Antumi core"
        control={() => (
          <span className="connection" data-state={connection}>
            <span className="connection-dot" aria-hidden="true" />
            {CONNECTION_TEXT[connection]}
          </span>
        )}
      />
      <GitRow />
    </>
  )
}

type Section = {
  id: string
  group: string
  title: string
  description: string
  keywords: readonly string[]
  Icon: () => ReactElement
  Body: () => ReactElement
  // Its body is titled cards of its own (SettingsGroup), not rows for the page to put in one.
  grouped?: true
}

const SECTIONS: readonly Section[] = localized(() => ([
  {
    id: 'appearance',
    group: t('SettingsPage.interface'),
    title: t('SettingsPage.appearance'),
    description: t('SettingsPage.colorsChatAndTerminalDisplay'),
    keywords: ['language', 'locale', 'English', '简体中文', '语言', t('language.interfaceLanguage'), t('SettingsPage.theme'), t('SettingsPage.light'), t('SettingsPage.dark'), t('SettingsPage.system'), t('SettingsPage.colors'), t('SettingsPage.palette'), t('SettingsPage.terminal'), t('SettingsPage.code'), t('SettingsPage.fontSize'), t('SettingsPage.font'), t('SettingsPage.lineHeight'), t('SettingsPage.prompt'), 'zsh', t('SettingsPage.chat'), t('SettingsPage.width'), t('SettingsPage.fullWidth'), t('FileSource.fold'), t('ModelBreakdown.turns'), t('SettingsPage.worked'), t('SettingsPage.chineseFont'), t('SettingsControls.resetToDefault_1523'), t('CjkFontPicker.default')],
    Icon: ContrastIcon,
    Body: AppearanceSettings,
    grouped: true
  },
  {
    id: 'pet',
    group: t('SettingsPage.interface'),
    title: t('Pet.title'),
    description: t('Pet.description'),
    keywords: ['pet', 'pets', 'mascot', 'moss', 'zip', 'clay', '宠物', '蚂蚁', '吉祥物', '毛毡', '软陶', '漫画', 'custom', 'sprite', '自定义', '素材', '规范', t('Pet.size'), t('Pet.activity'), t('Pet.createYourOwn')],
    Icon: SparkIcon,
    Body: PetSettings,
    grouped: true
  },
  {
    id: 'translation',
    group: t('SettingsPage.interface'),
    title: t('ChatContextMenu.translate'),
    description: t('SettingsPage.translateAgentRepliesIntoYourLanguage'),
    keywords: [t('ChatContextMenu.translate'), t('SettingsPage.language'), t('SettingsPage.chinese'), t('SettingsPage.english'), 'english', t('SettingsPage.japanese'), t('SettingsPage.korean'), t('SettingsPage.autoTranslate'), t('SettingsPage.original'), t('SettingsPage.translation'), 'haiku'],
    Icon: TranslateIcon,
    Body: TranslationSettings
  },
  {
    id: 'usage',
    group: t('SettingsPage.interface'),
    title: t('SettingsPage.usageQuota'),
    description: t('SettingsPage.agentSubscriptionQuotaInTheStatusBar'),
    keywords: [t('SettingsPage.statusBar'), t('SettingsPage.quota'), t('SettingsPage.percentage'), t('SettingsPage.used'), t('SettingsPage.remaining'), t('SettingsPage.reset'), t('SettingsPage.serviceWideReset'), t('SettingsPage.announcement'), 'limitreset', ...AGENT_KINDS],
    Icon: GaugeIcon,
    Body: UsageSettings
  },
  {
    // In Electron only: a plain browser has no dock icon and nothing to click back to.
    id: 'notifications',
    group: t('SettingsPage.interface'),
    title: t('SettingsPage.notifications'),
    description: t('SettingsPage.howToNotifyYouWhenAgentsNeedYou'),
    keywords: [t('SettingsPage.notifications'), t('SettingsPage.alert'), t('SettingsPage.badge'), 'dock', t('SettingsPage.foreground'), t('chatTools.wait'), t('SettingsPage.confirm'), t('SettingsPage.finished'), t('SettingsPage.unexpectedExit'), t('SettingsPage.popup'), t('SettingsPage.card'), t('SettingsPage.top'), t('SettingsPage.approval'), t('approvalChoiceText.allow')],
    Icon: BellIcon,
    Body: NotificationSettings
  },
  {
    id: 'agents',
    group: 'Agent',
    title: t('SettingsPage.localAgents'),
    description: t('SettingsPage.installationSignInAndDefaultsForAgentExecution'),
    keywords: ['agent', '本机 Agent', 'Local Agents', '编程智能体', 'coding agents', t('ConversationList.agent'), t('SettingsPage.local'), t('InstalledAgentsSettings.installed'), t('AgentPicker.notInstalled'), t('SettingsPage.install'), t('SettingsPage.signIn'), t('SettingsPage.version'), t('SettingsPage.scan'), t('SettingsPage.environment'), t('SettingsPage.check'), 'path', t('SettingsPage.notFound'), t('RoutinesSection.enable'), t('SettingsPage.disable'), ...AGENT_KINDS],
    Icon: RobotIcon,
    Body: AgentSettings,
    grouped: true
  },
  {
    id: 'projects',
    group: t('ChatMentionMenu.project'),
    title: t('ChatMentionMenu.project'),
    description: t('SettingsPage.recentProjectsFilesCopiedIntoNewWorktreesSetup'),
    keywords: [t('ChatMentionMenu.project'), t('SettingsPage.repository'), t('ProjectPicker.recent'), t('SettingsPage.path'), t('SettingsPage.folder'), t('ProjectConfigDialog.projectConfiguration'), 'setup', 'check', 'worktree', t('CopyButton.copy'), '.env', t('SettingsPage.installDependencies'), t('SettingsPage.tests'), t('SettingsPage.review')],
    Icon: FolderIcon,
    Body: ProjectSettings
  },
  {
    id: 'support',
    group: t('ChatFontPicker.other'),
    title: t('SupportSettings.title'),
    description: t('SupportSettings.description'),
    keywords: [t('ProjectStar.title'), t('SettingsPage.projectWebsite'), t('SupportSettings.feedback'), t('SupportSettings.community'), 'star', 'GitHub', 'feedback', 'support', 'community', 'issues'],
    Icon: ChatIcon,
    Body: SupportSettings
  },
  {
    id: 'about',
    group: t('ChatFontPicker.other'),
    title: t('AppUpdate.updates'),
    description: t('SettingsPage.versionsUpdatesConnectionAndGit'),
    keywords: ['about', '关于', t('SettingsPage.version'), t('AppUpdate.checkNow'), t('AppUpdate.automatic'), t('AppUpdate.prerelease'), t('SettingsPage.protocol'), t('SettingsPage.connection'), 'core', 'git', t('SettingsPage.environment')],
    Icon: ArrowUpIcon,
    Body: AboutSettings
  }
]))

// How many agents run at once and keeping the computer awake; it follows 服务商.
const RUN_SECTION: Section = localized(() => ({
  id: 'run',
  group: 'Agent',
  title: t('ChatCodeRun.run'),
  description: t('SettingsPage.runDescription'),
  keywords: [t('SettingsPage.maximumConcurrentAgents'), t('SettingsPage.perAgentLimits'), t('SettingsPage.keepComputerAwake'), '并发', 'concurrency', 'awake', t('ChatPlan.execute'), t('GitInspector.task'), t('SettingsPage.planning'), ...AGENT_KINDS],
  Icon: PulseIcon,
  Body: RunSettings
}))

// What agents may do unattended and what of the user's they reach; it follows 运行.
const PERMISSIONS_SECTION: Section = localized(() => ({
  id: 'permissions',
  group: 'Agent',
  title: t('SettingsPage.permissions'),
  description: t('SettingsPage.permissionsDescription'),
  keywords: [t('SettingsPage.permissions'), 'permission', t('SettingsPage.scheduledRunPermissions'), t('SettingsPage.unattended'), t('OverviewView.schedules'), t('SettingsPage.access'), 'chrome', t('SettingsPage.letClaudeCodeUseYourChrome'), t('SettingsPage.letAgentsReadYourAntumiRecords'), t('SettingsPage.records'), t('SettingsPage.history')],
  Icon: LockIcon,
  Body: PermissionSettings
}))

// How conversations behave: suggestions, to-dos, titles, archiving, the quick-task model.
const CONVERSATION_SECTION: Section = localized(() => ({
  id: 'conversation',
  group: t('sidebar.conversations'),
  title: t('sidebar.conversations'),
  description: t('SettingsPage.conversationDescription'),
  keywords: [t('SettingsPage.chat'), t('BrowserPanel.conversation'), t('SettingsPage.suggestNextStepsAfterEachTurn'), t('chatTools.toDos'), 'todo', t('ConversationList.title'), t('SettingsPage.naming'), t('ConversationActions.rename'), t('SettingsPage.firstTurn'), t('SettingsPage.everyTurn'), t('ConversationActions.archive'), t('SettingsPage.autoArchive'), t('SettingsPage.inactive'), t('SettingsPage.cleanup'), t('AgentModelPicker.model'), t('SettingsPage.quick'), t('ConversationBranches.commitMessage'), t('DiscussionView.summary'), 'haiku'],
  Icon: ChatIcon,
  Body: ConversationSettings
}))

// On a core that keeps them: the user's own slash commands; it follows 会话.
const CHAT_COMMANDS_SECTION: Section = localized(() => ({
  id: 'chat-commands',
  group: t('sidebar.conversations'),
  title: t('SettingsPage.chatCommands'),
  description: t('SettingsPage.savedPromptsAvailableWithInTheComposerEdit'),
  keywords: [t('chatTools.command'), t('SettingsPage.slash'), '/', t('ChatCommandSettings.prompt'), t('RoutinesSection.templates'), 'prompt', t('SettingsPage.chat'), t('BrowserPanel.conversation'), t('SettingsPage.shortcut')],
  Icon: TerminalIcon,
  Body: ChatCommandSettings
}))

// On a core with a skills library: the Agent Skills it installs for agents; it opens 扩展.
const SKILLS_SECTION: Section = localized(() => ({
  id: 'skills',
  group: t('SettingsPage.extensions'),
  title: t('SettingsPage.skills'),
  description: t('SettingsPage.installAgentSkillsSkillMdFromGitRepositories'),
  keywords: [t('SettingsPage.skills'), 'skill', 'skills', t('SettingsPage.plugins'), 'plugin', 'obsidian', 'markdown', t('SettingsPage.install'), t('SettingsPage.update'), t('SettingsPage.rollback'), t('SettingsPage.repository'), 'git', ...AGENT_KINDS],
  Icon: BoltIcon,
  Body: SkillsSettingsSection,
  grouped: true
}))

// On a core that keeps them: the user's MCP servers, handed to agents at each start; it follows 技能.
const MCP_SECTION: Section = localized(() => ({
  id: 'mcp',
  group: t('SettingsPage.extensions'),
  title: 'MCP',
  description: t('SettingsPage.manageMcpServersShareThemWithSelectedAgents'),
  keywords: ['mcp', t('SettingsPage.servers'), 'server', t('SettingsPage.tools'), 'tool', t('SettingsPage.import'), t('SettingsPage.connection'), t('SettingsPage.tests'), 'token', t('SettingsPage.token'), t('McpSettingsSection.environmentVariables'), t('McpSettingsSection.requestHeaders'), ...AGENT_KINDS],
  Icon: PlugIcon,
  Body: McpSettingsSection
}))

// On a core that keeps them: the agents' accounts and switching between them; it follows 外部智能体.
const ACCOUNTS_SECTION: Section = localized(() => ({
  id: 'accounts',
  group: 'Agent',
  title: t('AgentAccounts.title'),
  description: t('AgentAccounts.description'),
  keywords: [t('AgentAccounts.title'), 'account', 'login', t('AgentAccounts.signIn'), t('AgentAccounts.autoSwitch'), 'quota', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'claude', 'codex'],
  Icon: PersonIcon,
  Body: AgentAccountSettings
}))

// On a core that reads them: sessions the agents ran in a terminal, taken in as conversations; it follows 聊天命令.
const SESSION_IMPORT_SECTION: Section = localized(() => ({
  id: 'session-import',
  group: t('sidebar.conversations'),
  title: t('SettingsPage.sessionImport'),
  description: t('SettingsPage.sessionImportDescription'),
  keywords: [t('SettingsPage.sessionImport'), t('SettingsPage.import'), t('BrowserPanel.conversation'), t('SettingsPage.terminal'), 'import', 'session', 'resume', 'terminal', 'cli', ...AGENT_KINDS],
  Icon: DownloadIcon,
  Body: SessionImportSettings
}))

// On a core that keeps them: third-party coding plans agents can run on; it follows 账号.
const MODEL_PROVIDERS_SECTION: Section = localized(() => ({
  id: 'model-providers',
  group: 'Agent',
  title: t('SettingsPage.modelProviders'),
  description: t('SettingsPage.modelProvidersDescription'),
  keywords: [t('SettingsPage.modelProviders'), 'provider', 'api key', 'key', t('ModelProviderSettings.plan'), 'coding plan', '火山', 'volcengine', 'ark', 'glm', '智谱', 'z.ai', 'kimi', 'minimax', 'anthropic', 'openai', ...AGENT_KINDS],
  Icon: CloudIcon,
  Body: ModelProviderSettings
}))

// On a core that keeps a wire log: whether it does, and what it holds.
const DEBUG_SECTION: Section = localized(() => ({
  id: 'debug',
  group: t('ChatFontPicker.other'),
  title: t('SettingsPage.debug'),
  description: t('SettingsPage.rawDataExchangedBetweenAntumiAndAgents'),
  keywords: [t('SettingsPage.debug'), 'debug', t('Inspector.rawData'), t('SettingsPage.logs'), 'log', 'stdout', 'stderr', 'stdin', 'json', t('SettingsPage.protocol'), t('SettingsPage.traffic'), 'wire'],
  Icon: BugIcon,
  Body: DebugSettings
}))

// The user's local notes, on a core that hands them to agents; it sits before the browser.
const KNOWLEDGE_SECTION: Section = localized(() => ({
  id: 'knowledge',
  group: t('SettingsPage.integrations'),
  title: t('SettingsPage.knowledgeBase'),
  description: t('SettingsPage.connectAMarkdownFolderOrObsidianVaultSo'),
  keywords: [t('SettingsPage.knowledgeBase'), 'obsidian', 'vault', t('SettingsPage.notes'), t('DiscussionView.summary'), t('SettingsPage.records'), 'markdown', t('SettingsPage.wikilinks'), t('SettingsPage.integrations')],
  Icon: BookIcon,
  Body: KnowledgeBaseSettings
}))

// The browser Antumi hosts for chat agents, where core offers one; it follows the task sources.
const BROWSER_SECTION: Section = localized(() => ({
  id: 'browser',
  group: t('SettingsPage.integrations'),
  title: t('BrowserSidePanel.browser'),
  description: t('SettingsPage.builtInBrowserUsedByAgents'),
  keywords: [t('BrowserSidePanel.browser'), 'chromium', t('SettingsPage.webPages'), t('chatTools.screenshot'), t('SettingsPage.install'), t('SettingsPage.panel'), t('SettingsPage.integrations')],
  Icon: GlobeIcon,
  Body: BrowserRows
}))

const PLUGINS_SECTION: Section = localized(() => ({
  id: 'plugins',
  group: t('SettingsPage.integrations'),
  title: t('SettingsPage.plugins'),
  description: t('SettingsPage.taskSourcePluginsConfigureSignInAndFilters'),
  keywords: [t('SettingsPage.plugins'), t('SettingsPage.install'), t('SettingsPage.update'), t('PluginSettings.uninstall'), 'GitHub', 'Jira', 'Linear', '禅道', 'ZenTao', 'ZIP'],
  Icon: PuzzleIcon,
  Body: PluginSettings,
  grouped: true
}))

// One section per task source, from what its provider declares; they sit before 关于.
const SOURCE_BODIES = new WeakMap<SourceDescriptor, () => ReactElement>()

function sourceBody(source: SourceDescriptor): () => ReactElement {
  const known = SOURCE_BODIES.get(source)
  if (known) return known
  const Body = () => <SourceSettingsSection source={source} />
  SOURCE_BODIES.set(source, Body)
  return Body
}

function sourceSections(sources: readonly SourceDescriptor[]): Section[] {
  return sources.map((source) => ({
    id: settingsSectionOf(source.provider),
    group: t('SettingsPage.integrations'),
    title: source.name,
    description: t('SettingsPage.syncIssuesAssignedToYouInToThe', { value1: source.name }),
    keywords: [source.name, source.provider, 'token', t('SettingsPage.signIn'), t('InboxEntry.inbox_1125'), 'issue', 'bug', t('SettingsPage.integrations'), ...source.settings.map((field) => field.label)],
    Icon: () => <SourceIcon provider={source.provider} />,
    Body: sourceBody(source)
  }))
}

function matches(section: Section, needle: string): boolean {
  return [section.title, section.description, ...section.keywords].some((text) => messageSearchText(text).toLowerCase().includes(needle))
}

// Laid out like Orca's settings: sections on the left, one section at a time on the right.
export function SettingsPage() {
  useOccludesBrowser()
  const sources = useCore((s) => s.sources)
  const plugins = useCore((s) => s.rpc?.features.includes('plugins') ?? false)
  const browser = useBrowserSupported()
  const knowledge = useKnowledgeBaseSupported()
  const skills = useSkillsSupported()
  const mcp = useMcpServersSupported()
  const sessionImport = useSessionImportSupported()
  const modelProviders = useModelProvidersSupported()
  const accounts = useAccountsSupported()
  const chatCommands = useChatCommandsSupported()
  const wireLog = useWireLogSupported()
  const run = useRunSettingsShown()
  const permissions = usePermissionSettingsShown()
  const sections = useMemo(() => {
    const information = SECTIONS.filter((section) => section.id === 'support' || section.id === 'about')
    const own = SECTIONS.filter((section) => section.id !== 'about' && section.id !== 'support' && (section.id !== 'notifications' || canNotify() || canShowRequestPopup()))
      .flatMap((section) => (section.id === 'agents' ? [
        section, ...(accounts ? [ACCOUNTS_SECTION] : []), ...(modelProviders ? [MODEL_PROVIDERS_SECTION] : []), ...(run ? [RUN_SECTION] : []), ...(permissions ? [PERMISSIONS_SECTION] : []),
        CONVERSATION_SECTION, ...(chatCommands ? [CHAT_COMMANDS_SECTION] : []), ...(sessionImport ? [SESSION_IMPORT_SECTION] : []),
        ...(skills ? [SKILLS_SECTION] : []), ...(mcp ? [MCP_SECTION] : [])
      ] : [section]))
    return [...own, ...(plugins ? [PLUGINS_SECTION] : []), ...sourceSections(sources ?? []), ...(knowledge ? [KNOWLEDGE_SECTION] : []), ...(browser ? [BROWSER_SECTION] : []), ...(wireLog ? [DEBUG_SECTION] : []), ...information]
  }, [sources, browser, knowledge, skills, mcp, sessionImport, accounts, modelProviders, chatCommands, wireLog, plugins, run, permissions, getLocale()])
  const activeId = useCore((state) => state.settingsSection) ?? SECTIONS[0]?.id ?? ''
  const [query, setQuery] = useState('')
  useEffect(() => { setQuery('') }, [activeId])
  const needle = query.trim().toLowerCase()
  const visible = needle ? sections.filter((section) => matches(section, needle)) : sections
  // While searching, stay on the chosen section if it still matches, else show the first match.
  const active = visible.find((section) => section.id === activeId) ?? visible[0]
  const groups = [...new Set(visible.map((section) => section.group))]

  return (
    <div className="settings">
      <aside className="settings-nav" aria-label={t('SettingsPage.settingsCategories')}>
        <div className="settings-nav-top">
          <button type="button" className="settings-back" onClick={() => setSettingsOpen(false)}>{tr('SettingsPage.back', { value1: <ArrowLeftIcon /> })}</button>
        </div>
        <div className="settings-search">
          <SearchIcon />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('SettingsPage.searchSettings')}
            aria-label={t('SettingsPage.searchSettings')}
            autoFocus
          />
        </div>
        <nav className="settings-groups">
          {groups.map((group) => (
            <div key={group} className="settings-group">
              <p className="settings-group-title">{group}</p>
              {visible
                .filter((section) => section.group === group)
                .map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="settings-nav-item"
                    aria-current={section.id === active?.id ? 'page' : undefined}
                    onClick={() => { useCore.setState({ settingsSection: section.id }); setQuery('') }}
                  >
                    <section.Icon />
                    {section.title}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="settings-content">
        <div className="titlebar-drag" aria-hidden="true" />
        <div className="settings-inner">
          {active ? (
            <section aria-labelledby={`settings-${active.id}`}>
              <header className="settings-section-header">
                <h2 id={`settings-${active.id}`}>{active.title}</h2>
                <p>{active.description}</p>
              </header>
              {active.grouped ? <active.Body /> : (
                <div className="settings-card">
                  <active.Body />
                </div>
              )}
            </section>
          ) : (
            <p className="settings-none">{tr('SettingsPage.noSettingsFoundFor', { value1: query.trim() })}</p>
          )}
        </div>
      </main>
    </div>
  )
}
